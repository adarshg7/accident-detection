// auth.js routes — Login, Register, Google OAuth, Logout

const express  = require('express');
const router   = express.Router();
const jwt      = require('jsonwebtoken');
const passport = require('passport');
const { body, validationResult } = require('express-validator');
// express-validator = validates and sanitizes request data
// body('email').isEmail() = checks if email field is valid email

const User        = require('../models/User');
const GovOfficial = require('../models/GovOfficial');
const { protect, govOnly } = require('../middleware/auth');
const { authLimiter } = require('../middleware/security');
const { getClient, setCache } = require('../config/redis');

// ── Helper: Generate JWT ──────────────────────────────────
const generateToken = (id, role) => {
  return jwt.sign(
    { id, role },
    // Payload: what we encode in the token
    // id = MongoDB document ID
    // role = 'user' or 'gov'
    process.env.JWT_SECRET,
    // Secret key: must be same for sign AND verify
    { expiresIn: process.env.JWT_EXPIRE }
    // Token expires in 7 days (from .env)
  );
};

// ── Helper: Check domain ──────────────────────────────────
const isDomainAllowed = (email, allowedDomainsStr) => {
  if (!allowedDomainsStr) return true;
  // Empty = allow all domains

  const domain = email.split('@')[1].toLowerCase();
  // "user@gmail.com".split('@') → ["user", "gmail.com"]
  // [1] → "gmail.com"

  const allowedDomains = allowedDomainsStr
    .split(',')
    .map(d => d.trim().toLowerCase());
  // "gmail.com,yahoo.com" → ["gmail.com", "yahoo.com"]

  return allowedDomains.includes(domain);
};

// ── Validation Rules ──────────────────────────────────────
const registerValidation = [
  body('name')
    .trim()
    .notEmpty().withMessage('Name is required')
    .isLength({ max: 100 }).withMessage('Name too long'),

  body('email')
    .isEmail().withMessage('Valid email required')
    .normalizeEmail(),
    // normalizeEmail() = lowercase + remove dots in gmail etc.

  body('password')
    .isLength({ min: 8 }).withMessage('Password min 8 characters')
    .matches(/^(?=.*[A-Za-z])(?=.*\d)/)
    .withMessage('Password must contain letters and numbers'),
    // regex: must have at least one letter AND one number
];

// ═══════════════════════════════════════════════════
// USER ROUTES
// ═══════════════════════════════════════════════════

// POST /api/auth/user/register
router.post('/user/register', authLimiter, registerValidation, async (req, res) => {
  try {
    // Check validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
        // errors.array() = list of validation errors with field names
      });
    }

    const { name, email, password, phone } = req.body;
    // Destructure request body
    // Same as: const name = req.body.name; const email = req.body.email;

    // Check domain restriction
    if (!isDomainAllowed(email, process.env.USER_ALLOWED_DOMAINS)) {
      return res.status(403).json({
        success: false,
        message: 'Registration not allowed for your email domain.',
      });
    }

    // Check if email already exists
    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(400).json({
        success: false,
        message: 'Email already registered.',
      });
    }

    const domain = email.split('@')[1];
    const user = await User.create({ name, email, password, phone, allowedDomain: domain });
    // User.create() = new User(data).save()
    // Pre-save hook automatically hashes the password

    const token = generateToken(user._id, 'user');

    res.status(201).json({
      // 201 = Created
      success: true,
      token,
      user: {
        id:    user._id,
        name:  user.name,
        email: user.email,
        role:  user.role,
      },
      // NEVER send password hash in response
    });

  } catch (error) {
    console.error('[Auth] Register error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// POST /api/auth/user/login
router.post('/user/login', authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password required.',
      });
    }

    // Get user WITH password (select: false hides it by default)
    const user = await User.findOne({ email }).select('+password');

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.',
        // Vague message: don't tell attacker which is wrong
      });
    }

    // Check account lock
    if (user.isLocked()) {
      const waitMinutes = Math.ceil((user.lockUntil - Date.now()) / 60000);
      return res.status(423).json({
        // 423 = Locked
        success: false,
        message: `Account locked. Try again in ${waitMinutes} minutes.`,
      });
    }

    // Verify password
    const isMatch = await user.comparePassword(password);

    if (!isMatch) {
      // Increment failed attempts
      user.loginAttempts += 1;

      if (user.loginAttempts >= 5) {
        // Lock account for 30 minutes after 5 failures
        user.lockUntil = new Date(Date.now() + 30 * 60 * 1000);
        // Date.now() + 30 minutes in milliseconds
      }

      await user.save();

      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.',
      });
    }

    // Reset login attempts on success
    user.loginAttempts = 0;
    user.lockUntil     = undefined;
    user.lastLogin     = new Date();
    await user.save();

    const token = generateToken(user._id, 'user');

    res.json({
      success: true,
      token,
      user: {
        id:    user._id,
        name:  user.name,
        email: user.email,
        role:  user.role,
      },
    });

  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ═══════════════════════════════════════════════════
// GOV OFFICIAL ROUTES
// ═══════════════════════════════════════════════════

// POST /api/auth/gov/register
router.post('/gov/register', authLimiter, registerValidation, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { name, email, password, department, badgeNumber, rank, zone } = req.body;

    // Gov domain check — STRICT
    if (!isDomainAllowed(email, process.env.GOV_ALLOWED_DOMAINS)) {
      return res.status(403).json({
        success: false,
        message: 'Only government email addresses allowed. Contact your admin.',
      });
    }

    const existing = await GovOfficial.findOne({ email });
    if (existing) {
      return res.status(400).json({ success: false, message: 'Email already registered.' });
    }

    const domain = email.split('@')[1];
    const official = await GovOfficial.create({
      name, email, password, department,
      badgeNumber, rank, zone,
      allowedDomain: domain,
      isApproved: false,
      // Gov officials start UNAPPROVED
      // Admin must manually approve via /api/gov/approve/:id
    });

    res.status(201).json({
      success: true,
      message: 'Registration submitted. Await admin approval.',
      // Don't give them a token yet — must be approved first
    });

  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// POST /api/auth/gov/login
router.post('/gov/login', authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password required.' });
    }

    const official = await GovOfficial.findOne({ email }).select('+password');

    if (!official) {
      return res.status(401).json({ success: false, message: 'Invalid credentials.' });
    }

    if (!official.isApproved) {
      return res.status(403).json({
        success: false,
        message: 'Account pending admin approval.',
      });
    }

    if (official.isLocked()) {
      return res.status(423).json({ success: false, message: 'Account locked.' });
    }

    const isMatch = await official.comparePassword(password);
    if (!isMatch) {
      official.loginAttempts += 1;
      if (official.loginAttempts >= 5) {
        official.lockUntil = new Date(Date.now() + 30 * 60 * 1000);
      }
      await official.save();
      return res.status(401).json({ success: false, message: 'Invalid credentials.' });
    }

    official.loginAttempts = 0;
    official.lockUntil     = undefined;
    official.lastLogin     = new Date();
    await official.save();

    const token = generateToken(official._id, 'gov');

    res.json({
      success: true,
      token,
      official: {
        id:         official._id,
        name:       official.name,
        email:      official.email,
        role:       official.role,
        department: official.department,
        rank:       official.rank,
      },
    });

  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// POST /api/auth/logout
router.post('/logout', protect, async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (token) {
      try {
        const redis = getClient();
        await redis.setEx(`blacklist:${token}`, 7 * 24 * 60 * 60, '1');
      } catch (redisErr) {
        // Redis unavailable — proceed with logout anyway
        console.warn('[Auth] Redis unavailable for token blacklist:', redisErr.message);
      }
    }
    res.json({ success: true, message: 'Logged out successfully.' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ═══════════════════════════════════════════════════
// GOOGLE OAUTH — POST /api/auth/google/callback
// Frontend sends the Google access_token it got from
// @react-oauth/google useGoogleLogin. We verify it with
// Google's userinfo endpoint and create/find the user.
// ═══════════════════════════════════════════════════
router.post('/google/callback', authLimiter, async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) {
      return res.status(400).json({ success: false, message: 'Google token required' });
    }

    // ── Step 1: Verify with Google userinfo ──────────────────
    const googleRes = await fetch(
      `https://www.googleapis.com/oauth2/v3/userinfo?access_token=${token}`
    );

    if (!googleRes.ok) {
      return res.status(401).json({ success: false, message: 'Invalid Google token' });
    }

    const profile = await googleRes.json();
    // profile contains: sub (Google ID), email, name, picture, email_verified

    if (!profile.email_verified) {
      return res.status(400).json({ success: false, message: 'Google email not verified' });
    }

    // ── Step 2: Find or create user ──────────────────────────
    let user = await User.findOne({ email: profile.email });

    if (!user) {
      // New Google user — create account automatically
      user = await User.create({
        name:         profile.name || profile.email.split('@')[0],
        email:        profile.email,
        googleId:     profile.sub,
        authProvider: 'google',
        avatar:       profile.picture || '',
        isEmailVerified: true,
        // No password for OAuth users
      });
    } else {
      // Existing user — update Google fields if not set
      if (!user.googleId) {
        user.googleId     = profile.sub;
        user.authProvider = 'google';
        if (profile.picture && !user.avatar) user.avatar = profile.picture;
        await user.save();
      }
    }

    // ── Step 3: Generate JWT and return ─────────────────────
    const jwtToken = generateToken(user._id, 'user');

    res.json({
      success: true,
      token: jwtToken,
      user: {
        id:           user._id,
        name:         user.name,
        email:        user.email,
        avatar:       user.avatar,
        role:         user.role,
        authProvider: user.authProvider,
      },
    });

  } catch (error) {
    console.error('[Auth] Google login error:', error);
    res.status(500).json({ success: false, message: 'Google login failed' });
  }
});

// PUT /api/auth/user/profile — update name/phone
router.put('/user/profile', protect, async (req, res) => {
  try {
    const { name, phone } = req.body;
    const user = await User.findByIdAndUpdate(
      req.user.id,
      { name, phone },
      { new: true, runValidators: true }
    );
    res.json({ success: true, user: { id: user._id, name: user.name, email: user.email, phone: user.phone, avatar: user.avatar } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Update failed' });
  }
});

module.exports = router;