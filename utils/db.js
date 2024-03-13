import { MongoClient } from 'mongodb';

const host = process.env.DB_HOST || 'localhost';
const port = process.env.DB_PORT || 27017;
const database = process.env.DB_DATABASE || 'files_manager';
const url = `mongodb://${host}:${port}`;

class DBClient {
  constructor() {
    MongoClient.connect(url, { useUnifiedTopology: true },
      function dbConnection(err, client) {
        if (err) {
          console.log(err.message);
          this.db = false;
        } else {
          this.db = client.db(database);
          this.collectUsers = this.db.collection('users');
          this.collectFiles = this.db.collection('files');
        }
      });
  }

  isAlive() {
    return Boolean(this.db);
  }

  async nbUsers() {
    return this.collectUsers.countDocuments();
  }

  async nbFiles() {
    return this.collectFiles.countDocuments();
  }
}

const dbClient = new DBClient();
export default dbClient;
