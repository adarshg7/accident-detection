// db.js — MongoDB connection with retry logic
//
// WHY MONGOOSE?
// Mongoose = ODM (Object Document Mapper)
// It lets us define schemas (structure) for our data
// And gives us methods like User.find(), Accident.save()
// Without it: raw MongoDB driver is verbose and error-prone

const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI, {
      maxPoolSize: 10,
      // Connection pool = keep 10 connections open and ready
      // Instead of creating new connection per request (slow)
      // Requests share these 10 connections (fast)

      serverSelectionTimeoutMS: 5000,
      // Give up connecting after 5 seconds
      // Without timeout: hangs forever if MongoDB is down

      socketTimeoutMS: 45000,
      // Individual operation timeout: 45 seconds
    });

    console.log(`[DB] MongoDB connected: ${conn.connection.host}`);

    // Handle connection errors after initial connection
    mongoose.connection.on('error', (err) => {
      console.error(`[DB] MongoDB error: ${err}`);
    });

    mongoose.connection.on('disconnected', () => {
      console.warn('[DB] MongoDB disconnected. Retrying...');
      setTimeout(connectDB, 5000);
      // Retry after 5 seconds automatically
    });

  } catch (error) {
    console.error(`[DB] Connection failed: ${error.message}`);
    process.exit(1);
    // Exit process — app can't run without database
    // process.exit(1) = exit with error code
    // Docker/PM2 will restart the process automatically
  }
};

module.exports = connectDB;