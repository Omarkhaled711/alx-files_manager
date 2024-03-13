import { createHash } from 'crypto';
import { ObjectId } from 'mongodb';
import dbClient from '../utils/db';
import redisClient from '../utils/redis';

class UsersController {
  static async postNew(req, res) {
    const { email, password } = req.body;

    if (!email) {
      return res.status(400).send({ error: 'Missing email' });
    }
    if (!password) {
      return res.status(400).send({ error: 'Missing password' });
    }

    const registeredUsers = await dbClient.dbClient.collection('users').findOne({ email });
    if (registeredUsers) {
      return res.status(400).send({ error: 'Already exist' });
    }

    const hashPass = createHash('sha1').update(password).digest('hex');

    const newUser = await dbClient.dbClient.collection('users').insertOne({ email, password: hashPass });
    return res.status(201).send({ id: newUser.insertedId, email });
  }

  static async getMe(req, res) {
    const token = req.header('X-Token');
    if (!token) return res.status(401).send({ error: 'Unauthorized' });
    const authorizedUser = await redisClient.get(`auth_${token}`);
    if (!authorizedUser) return res.status(401).send({ error: 'Unauthorized' });

    const users = await dbClient.dbClient.collection('users');
    const user = await users.findOne({ _id: ObjectId(authorizedUser) });
    if (user) {
      return res.status(200).send({
        id: authorizedUser, email: user.email,
      });
    }
    return res.status(401).send({ error: 'Unauthorized' });
  }
}

export default UsersController;
