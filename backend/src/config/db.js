const mongoose = require('mongoose');
const env = require('./env');

const connectDB = async () => {
  mongoose.connection.on('connected', () => {
    console.log(`MongoDB connected: ${mongoose.connection.host}`);
  });
  mongoose.connection.on('error', (err) => {
    console.error('MongoDB connection error:', err.message);
  });

  await mongoose.connect(env.mongoUri);
};

module.exports = connectDB;
