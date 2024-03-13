import { createHash } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import dbClient from '../utils/db';
import redisClient from '../utils/redis';

class AuthController {
  static async getConnect(req, res) {
    const authorizationToken = req.header('Authorization').split(' ')[1];
    const [email, password] = Buffer.from(
      authorizationToken, 'base64',
    ).toString('ascii').split(':');
    if (!email || !password) {
      return res.status(401).send({ error: 'Unauthorized' });
    }
    const hashPass = createHash('sha1').update(password).digest('hex');
    const user = await dbClient.dbClient.collection('users').findOne({ email, password: hashPass });
    if (!user || user.password !== hashPass) {
      return res.status(401).send({ error: 'Unauthorized' });
    }
    const token = uuidv4();
    await redisClient.set(`auth_${token}`, user._id.toString(), 86400);
    return res.status(200).send({ token });
  }

  static async getDisconnect(req, res) {
    const authorizationToken = req.header('X-Token');
    const userId = await redisClient.get(`auth_${authorizationToken}`);
    if (userId) {
      await redisClient.del(`auth_${authorizationToken}`);
      return res.status(204).end();
    }
    return res.status(401).send({ error: 'Unauthorized' });
  }
}

export default AuthController;
