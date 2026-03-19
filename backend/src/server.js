require('dotenv').config();

const express     = require('express');
const http        = require('http');
const { Server }  = require('socket.io');
const path        = require('path');
const morgan      = require('morgan');
const compression = require('compression');
const { connectRedis } = require('./config/redis');
const connectDB      = require('./config/db');
const setupSocket    = require('./socket/socketHandler');
const security       = require('./middleware/security');

const authRoutes     = require('./routes/auth');
const accidentRoutes = require('./routes/accidents');
const vehicleRoutes = require('./routes/vehicles');

const app    = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: [
      'http://localhost:3000',
      'http://localhost:3001',
    ],
    credentials: true,
  },
});

app.set('io', io);

// ── Security ──────────────────────────────────────
app.use(security.helmetConfig);
app.use(security.corsConfig);
app.use(security.mongoSanitize);
app.use(security.hpp);

// ── General ───────────────────────────────────────
app.use(compression());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(morgan('dev'));
app.use('/api/vehicles', vehicleRoutes);

// ── Static Files ──────────────────────────────────
app.use('/screenshots',
  express.static(path.join(__dirname, '../uploads/screenshots'))
);

// ── Routes ────────────────────────────────────────
app.use('/api/auth',      authRoutes);
app.use('/api/accidents', accidentRoutes);

// ── Health Check ──────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date() });
});

// ── Socket.io ─────────────────────────────────────
setupSocket(io);

// ── 404 ───────────────────────────────────────────
app.use('*', (req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

// ── Error Handler ─────────────────────────────────
app.use((err, req, res, next) => {
  console.error('[Error]', err.message);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal server error',
  });
});

// ── Start ─────────────────────────────────────────
const startServer = async () => {
  await connectDB();
  // Redis commented out — install Redis later
  await connectRedis();

  const PORT = process.env.PORT || 5000;
  server.listen(PORT, () => {
    console.log(`[Server] Running on port ${PORT}`);
    console.log(`[Server] http://localhost:${PORT}`);
    console.log(`[Server] Health: http://localhost:${PORT}/health`);
  });
};

startServer();