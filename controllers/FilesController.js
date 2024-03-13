import fs from 'fs';
import mime from 'mime-types';
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

  static async getShow(req, res) {
    const user = await FilesController.validateUser(req);
    if (!user) {
      res.status(401).send({ error: 'Unauthorized' });
      return;
    }

    const fileId = req.params.id;
    const file = await dbClient.dbClient.collection('files').findOne({
      _id: ObjectId(fileId), userId: user.__id,
    });

    if (!file) {
      res.status(404).send({ error: 'Not found' });
      return;
    }
    res.status(200).send(file);
  }

  static async getIndex(req, res) {
    const user = await FilesController.validateUser(req);
    const pageSize = 20;
    if (!user) {
      res.status(401).send({ error: 'Unauthorized' });
      return;
    }
    const parentId = req.query.parentId ? ObjectId(req.query.parentId) : '0';
    const { page } = req.query;
    const userId = user._id.toString();
    const files = await dbClient.dbClient.collection('files');
    const filesCount = await files.countDocuments({ userId, parentId });

    if (filesCount === '0') {
      res.status(200).send([]);
      return;
    }
    const pageNumber = page || 1;
    const skip = (pageNumber - 1) * pageSize;
    const result = await files.aggregate([
      { $match: { userId, parentId } },
      { $skip: skip },
      { $limit: pageSize },
    ]).toArray();

    const modifiedResult = result.map((file) => ({
      ...file,
      id: file._id,
      _id: undefined,
    }));

    res.status(200).send(modifiedResult);
  }

  static async putPublish(req, res) {
    const user = await FilesController.validateUser(req);
    if (!user) {
      res.status(401).send({ error: 'Unauthorized' });
      return;
    }
    const token = req.header('X-Token');
    const userId = await redisClient.get(`auth_${token}`);
    const fileId = req.params.id;
    const files = await dbClient.dbClient.collection('files');
    const file = await files.findOne({
      _id: ObjectId(fileId),
      userId: ObjectId(userId),
    });
    if (!file) {
      res.status(404).send({ error: 'Not found' });
      return;
    }

    await files.updateOne(
      { _id: ObjectId(fileId) },
      { $set: { isPublic: true } },
    );

    const fileUpdate = await files.findOne({ _id: ObjectId(fileId) });
    res.status(200).send(fileUpdate);
  }

  static async putUnpublish(req, res) {
    const user = await FilesController.validateUser(req);
    if (!user) {
      res.status(401).send({ error: 'Unauthorized' });
      return;
    }
    const token = req.header('X-Token');
    const userId = await redisClient.get(`auth_${token}`);
    const fileId = req.params.id;
    const files = await dbClient.dbClient.collection('files');
    const file = await files.findOne({
      _id: ObjectId(fileId),
      userId: ObjectId(userId),
    });
    if (!file) {
      res.status(404).send({ error: 'Not found' });
      return;
    }

    await files.updateOne(
      { _id: ObjectId(fileId) },
      { $set: { isPublic: false } },
    );

    const fileUpdate = await files.findOne({
      _id: ObjectId(fileId),
    });
    res.status(200).send(fileUpdate);
  }

  static async getFile(req, res) {
    const token = req.header('X-Token');
    const userId = await redisClient.get(`auth_${token}`);
    const fileId = req.params.id;
    const { size } = req.query;
    const files = await dbClient.dbClient.collection('files');
    const file = files.findOne({ _id: ObjectId(fileId) });
    if (!file) {
      res.status(404).send({ error: 'Not found' });
      return;
    }
    if (!userId && !file.isPublic) {
      res.status(404).send({ error: 'Not found' });
      return;
    }

    if (userId !== file.userId.toString()) {
      res.status(404).send({ error: 'Not found' });
      return;
    }

    if (file.type === 'folder') {
      res.status(400).send({ error: "A folder doesn't have content" });
      return;
    }

    let { localPath } = file;
    if (size) {
      localPath = `${localPath}_${size}`;
    }

    if (!fs.existsSync(localPath)) {
      res.status(404).send({ error: 'Not found' });
      return;
    }
    res.setHeader('Content-Type', mime.lookup(file.name));
    res.status(200).sendFile(localPath);
  }
}

export default FilesController;
