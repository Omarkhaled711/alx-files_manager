import fs from 'fs';
import { ObjectId } from 'mongodb';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import redisClient from '../utils/redis';
import dbClient from '../utils/db';

class FilesController {
  static async postUpload(req, res) {
    const user = await FilesController.validateUser(req);
    if (!user) {
      res.status(401).send({ error: 'Unauthorized' });
      return;
    }
    const {
      name, type, isPublic, data,
    } = req.body;

    const typesAccepted = ['folder', 'file', 'image'];
    if (!name) {
      res.status(400).send({ error: 'Missing name' });
      return;
    }
    if (!type || !typesAccepted.includes(type)) {
      res.status(400).send({ error: 'Missing type' });
      return;
    }
    if (!data && type !== 'folder') {
      res.status(400).send({ error: 'Missing data' });
      return;
    }

    const parentId = req.body.parentId || '0';
    if (parentId) {
      const parentFile = await dbClient.dbClient.collection('files').findOne({
        _id: ObjectId(parentId),
      });
      if (!parentFile) {
        res.status(400).send({ error: 'Parent not found' });
        return;
      }
      if (parentFile.type !== 'folder') {
        res.status(400).send({ error: 'Parent is not a folder' });
        return;
      }
    }

    const filesData = {
      userId: user._id.toString(),
      name,
      type,
      isPublic: isPublic || false,
      parentId: parentId || 0,
    };
    if (type === 'folder') {
      const newFolder = await dbClient.dbClient.collection('files').insertOne({
        filesData,
      });
      filesData.id = newFolder.insertedId;
      delete filesData._id;
      res.status(201).send({ filesData });
      return;
    }

    const folderName = process.env.FOLDER_PATH || '/tmp/files_manager';
    const fileId = uuidv4();
    const localPath = path.join(folderName, fileId);

    filesData.localPath = localPath;
    const dataDecoded = Buffer.from(data, 'base64');
    const checkPath = await FilesController.pathChecking(folderName);
    if (!checkPath) {
      await fs.promises.mkdir(folderName, { recursive: true });
    }
    FilesController.saveFile(res, localPath, dataDecoded, filesData);
  }

  static async saveFile(res, localPath, data, fileData) {
    await fs.promises.writeFile(localPath, data, 'utf-8');

    const result = await dbClient.dbClient.collection('files').insertOne(fileData);
    const writeData = { ...fileData, id: result.insertedId };
    delete writeData._id;
    delete writeData.localPath;

    res.status(201).send(writeData);
  }

  static async validateUser(req) {
    const authorizationToken = req.header('X-Token') || null;
    if (!authorizationToken) return null;
    const token = `auth_${authorizationToken}`;
    const userId = await redisClient.get(token);
    if (!userId) return null;
    const user = dbClient.dbClient.collection('users').findOne({
      _id: ObjectId(userId),
    });
    if (!user) return null;
    return user;
  }

  static pathChecking(path) {
    return new Promise((resolve) => {
      fs.access(path, fs.constants.F_OK, (error) => {
        resolve(!error);
      });
    });
  }
}

export default FilesController;
