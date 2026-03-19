// auth.js — JWT Authentication Middleware
//
// WHAT IS JWT?
// JSON Web Token = a signed string that proves who you are
// Format: header.payload.signature
// Example: eyJhbG.eyJ1c2Vy.SflKxwR...
//
// HOW IT WORKS:
// 1. User logs in → server creates JWT with user's ID inside
// 2. Server signs it with SECRET key → sends to client
// 3. Client stores JWT (localStorage or cookie)
// 4. Every request: client sends JWT in header
// 5. Server verifies signature → extracts user ID → proceeds
//
// WHY JWT?
// Server doesn't store sessions — stateless
// Any server can verify any JWT (great for scaling)
// Can contain user data (role, permissions) — no DB lookup needed

const jwt    = require('jsonwebtoken');
const User   = require('../models/User');
const GovOfficial = require('../models/GovOfficial');
const { getClient } = require('../config/redis');

// ── Verify Token ──────────────────────────────────────────
const protect = async (req, res, next) => {
  // This middleware runs BEFORE route handlers
  // If token valid: adds req.user and calls next()
  // If token invalid: returns 401 error immediately

  let token;

  // Check Authorization header: "Bearer eyJhbG..."
  if (req.headers.authorization?.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
    // split(' ') → ["Bearer", "eyJhbG..."]
    // [1] → the token part
  } else if (req.cookies?.token) {
    // Also check HTTP-only cookie (more secure option)
    token = req.cookies.token;
  }

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Access denied. Please log in.',
    });
    // 401 = Unauthorized
  }

  try {
    // ── Check if token is blacklisted (logged out) ──────
    let isBlacklisted = false;
    try {
      const redis = getClient();
      if (redis && redis.isReady) {
        isBlacklisted = await redis.get(`blacklist:${token}`);
      }
    } catch (redisErr) {
      // Ignore Redis errors during auth
    }

    if (isBlacklisted) {
      return res.status(401).json({
        success: false,
        message: 'Token has been invalidated. Please log in again.',
      });
    }

    // ── Verify JWT signature ─────────────────────────────
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    // jwt.verify():
    // → Checks signature (was this token created by US?)
    // → Checks expiry (is it still valid?)
    // → Returns payload: { id: "user123", role: "user", iat: ..., exp: ... }
    // → Throws error if invalid or expired

    // ── Load user from database ──────────────────────────
    let user;
    if (decoded.role === 'gov') {
      user = await GovOfficial.findById(decoded.id);
      // findById = find document by MongoDB _id
      // decoded.id = user ID stored in JWT when it was created
    } else {
      user = await User.findById(decoded.id);
    }

    if (!user || !user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'User not found or account deactivated.',
      });
    }

    req.user = user;
    req.userType = decoded.role === 'gov' ? 'gov' : 'user';
    // Attach user to request object
    // Route handlers access it as req.user
    // req.userType tells handlers if it's gov or regular user

    next();
    // next() = proceed to the actual route handler

  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Session expired. Please log in again.',
      });
    }
    return res.status(401).json({
      success: false,
      message: 'Invalid token.',
    });
  }
};

// ── Role-based Access Control ─────────────────────────────
const authorize = (...roles) => {
  // authorize('admin') → only admins
  // authorize('admin', 'supervisor') → admins AND supervisors
  // ...roles = rest parameter: collects multiple args into array

  return (req, res, next) => {
    // Returns a middleware function
    // This is a "middleware factory" pattern

    if (!roles.includes(req.user.role)) {
      // .includes() = check if array contains value
      return res.status(403).json({
        success: false,
        message: `Role '${req.user.role}' is not authorized for this action.`,
      });
      // 403 = Forbidden (authenticated but not authorized)
      // vs 401 = Unauthorized (not authenticated)
    }
    next();
  };
};

// ── Gov Only Middleware ───────────────────────────────────
const govOnly = (req, res, next) => {
  if (req.userType !== 'gov') {
    return res.status(403).json({
      success: false,
      message: 'Government officials only.',
    });
  }
  next();
};

// ── Check if Gov Official is Approved ────────────────────
const approvedOnly = (req, res, next) => {
  if (req.userType === 'gov' && !req.user.isApproved) {
    return res.status(403).json({
      success: false,
      message: 'Your account is pending admin approval.',
    });
  }
  next();
};

// ── AI System API Key Check ───────────────────────────────
const aiApiKey = (req, res, next) => {
  // Person 1's AI system sends this header with every request
  const apiKey = req.headers['x-api-key'];

  if (!apiKey || apiKey !== process.env.AI_API_KEY) {
    return res.status(401).json({
      success: false,
      message: 'Invalid API key.',
    });
  }
  next();
};

module.exports = { protect, authorize, govOnly, approvedOnly, aiApiKey };