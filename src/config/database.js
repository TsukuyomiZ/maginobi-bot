const mongoose = require('mongoose');

/**
 * Connect to MongoDB Atlas using Mongoose
 */
async function connectDB() {
  try {
    const uri = process.env.MONGODB_URI;

    if (!uri) {
      throw new Error('MONGODB_URI is not defined in environment variables');
    }

    await mongoose.connect(uri, {
      dbName: process.env.MONGODB_DB_NAME || 'mabinogi-bot',
    });

    console.log('[Database] ✅ Connected to MongoDB Atlas successfully');

    // Handle connection events
    mongoose.connection.on('error', (err) => {
      console.error('[Database] ❌ MongoDB connection error:', err);
    });

    mongoose.connection.on('disconnected', () => {
      console.warn('[Database] ⚠️ MongoDB disconnected');
    });
  } catch (error) {
    console.error('[Database] ❌ Failed to connect to MongoDB Atlas:', error.message);
    throw error;
  }
}

module.exports = connectDB;
