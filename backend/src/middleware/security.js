const helmet        = require('helmet');
const rateLimit     = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');
const hpp           = require('hpp');
const cors          = require('cors');

// ── Helmet ────────────────────────────────────────
const helmetConfig = helmet({
  crossOriginEmbedderPolicy: false,
});

// ── CORS ──────────────────────────────────────────
const corsConfig = cors({
  origin: [
    process.env.USER_FRONTEND_URL,
    process.env.GOV_FRONTEND_URL,
    'http://localhost:3000',
    'http://localhost:3001',
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
});

// ── Rate Limiters ─────────────────────────────────
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { success: false, message: 'Too many attempts. Try in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  message: { success: false, message: 'Too many requests.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const reportLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: { success: false, message: 'Too many reports. Try later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = {
  helmetConfig,
  corsConfig,
  authLimiter,
  apiLimiter,
  reportLimiter,
  mongoSanitize: mongoSanitize(),
  hpp: hpp(),
};