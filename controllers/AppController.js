import dbClient from '../utils/db';
import redisClient from '../utils/redis';

class AppController {
  static getStatus(req, res) {
    const redisConnection = redisClient.isAlive();
    const dbConnection = dbClient.isAlive();
    const jsonRes = {
      redis: redisConnection,
      db: dbConnection,
    };
    res.status(200).send(jsonRes);
  }

  static async getStats(req, res) {
    const usersCount = await dbClient.nbUsers();
    const filesCount = await dbClient.nbFiles();
    const jsonRes = {
      users: usersCount,
      files: filesCount,
    };
    res.status(200).send(jsonRes);
  }
}

export default AppController;
