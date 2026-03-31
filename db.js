const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URI;

async function connectDB() {
  if (!MONGO_URI) {
    console.error('MONGO_URI environment variable is missing. Set it in your .env file or Render dashboard.');
    process.exit(1);
  }

  await mongoose.connect(MONGO_URI);
  console.log('Database connected');
}

module.exports = connectDB;
