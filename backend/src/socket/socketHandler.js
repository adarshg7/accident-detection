// socketHandler.js — Real-time WebSocket events

const jwt = require('jsonwebtoken');
const User = require('../models/User');
const GovOfficial = require('../models/GovOfficial');

const setupSocket = (io) => {
  // ── Auth Middleware for Socket.io ──────────────────
  io.use(async (socket, next) => {
    // Runs for EVERY new socket connection
    // socket.handshake.auth.token = JWT sent during connection

    const token = socket.handshake.auth?.token;

    if (!token) {
      return next(new Error('Authentication required'));
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      // Verify JWT same as HTTP middleware

      let user;
      if (decoded.role === 'gov') {
        user = await GovOfficial.findById(decoded.id);
        socket.userType = 'gov';
      } else {
        user = await User.findById(decoded.id);
        socket.userType = 'user';
      }

      if (!user) return next(new Error('User not found'));

      socket.userId = decoded.id;
      socket.user   = user;
      next();
      // next() with no args = allow connection

    } catch (err) {
      next(new Error('Invalid token'));
    }
  });

  // ── Connection Handler ─────────────────────────────
  io.on('connection', (socket) => {
    console.log(`[Socket] Connected: ${socket.userId} (${socket.userType})`);

    // Put gov officials in a separate room
    if (socket.userType === 'gov') {
      socket.join('gov_room');
      // Rooms = named groups of sockets
      // io.to('gov_room').emit() = send ONLY to gov officials
      // io.emit() = send to everyone
    }

    // User tells us their location for nearby alerts
    socket.on('user_location', (data) => {
      const { lat, lon } = data;
      socket.userLocation = { lat, lon };
      // Store on socket object for location-based filtering
    });

    // Gov joins specific camera room for live feed
    socket.on('join_camera', (cameraId) => {
      if (socket.userType === 'gov') {
        socket.join(`camera_${cameraId}`);
        console.log(`[Socket] Gov joined camera: ${cameraId}`);
      }
    });

    socket.on('leave_camera', (cameraId) => {
      socket.leave(`camera_${cameraId}`);
    });

    socket.on('disconnect', () => {
      console.log(`[Socket] Disconnected: ${socket.userId}`);
    });
  });
};

module.exports = setupSocket;