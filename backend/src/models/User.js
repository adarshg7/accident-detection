const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');

const UserSchema = new mongoose.Schema({

  // ── Identity ──────────────────────────────────────
  name: {
    type:      String,
    required:  [true, 'Name is required'],
    trim:      true,
    maxlength: [100, 'Name cannot exceed 100 characters'],
  },

  email: {
    type:      String,
    required:  [true, 'Email is required'],
    lowercase: true,
    trim:      true,
    match: [
      /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
      'Please enter a valid email',
    ],
  },

  password: {
    type:      String,
    minlength: [8, 'Password must be at least 8 characters'],
    select:    false,
    // select: false = never include in query results by default
    // Must explicitly ask: User.findOne().select('+password')
  },

  // ── OAuth ──────────────────────────────────────────
  googleId: {
    type:   String,
    sparse: true,
  },

  authProvider: {
    type:    String,
    enum:    ['local', 'google'],
    default: 'local',
  },

  // ── Profile ───────────────────────────────────────
  phone: {
    type:  String,
    match: [/^[+]?[\d\s-]{10,15}$/, 'Invalid phone number'],
  },

  avatar: {
    type:    String,
    default: '',
  },

  // ── Access Control ────────────────────────────────
  role: {
    type:    String,
    enum:    ['user', 'admin'],
    default: 'user',
  },

  isEmailVerified: {
    type:    Boolean,
    default: false,
  },

  isActive: {
    type:    Boolean,
    default: true,
  },

  allowedDomain: {
    type: String,
  },

  // ── Location ──────────────────────────────────────
  lastKnownLocation: {
    type: {
      type:    String,
      enum:    ['Point'],
      default: 'Point',
    },
    coordinates: {
      type:    [Number],
      default: [0, 0],
      // GeoJSON format: [longitude, latitude]
    },
  },

  // ── Security ──────────────────────────────────────
  loginAttempts: {
    type:    Number,
    default: 0,
  },

  lockUntil: {
    type: Date,
    // Account locked until this time after too many failed logins
  },

  lastLogin: {
    type: Date,
  },

  passwordChangedAt: {
    type: Date,
  },

  // ══════════════════════════════════════════════════
  // VEHICLES
  // ══════════════════════════════════════════════════
  vehicles: [{
    plateNumber: {
      type:      String,
      uppercase: true,
      trim:      true,
      // uppercase: true = auto converts to uppercase on save
    },
    type: {
      type: String,
      enum: ['car', 'bike', 'truck', 'bus', 'auto', 'other'],
    },
    model:  { type: String, trim: true },
    year:   { type: Number, min: 1990, max: new Date().getFullYear() + 1 },
    color:  { type: String, trim: true },
    addedAt: {
      type:    Date,
      default: Date.now,
      // Date.now = function called each time new vehicle added
      // NOT new Date() — that would use class definition time
    },
  }],

  // ══════════════════════════════════════════════════
  // CHALLANS (Traffic Violations)
  // ══════════════════════════════════════════════════
  challans: [{
    challanId: {
      type: String,
      trim: true,
      // Official challan number from traffic police
    },
    plateNumber: {
      type:      String,
      uppercase: true,
      trim:      true,
    },
    offense: {
      type: String,
      // "Over speeding", "Signal jumping", "No helmet", etc.
    },
    amount: {
      type: Number,
      min:  0,
      // Fine amount in Indian Rupees
    },
    date: {
      type:    Date,
      default: Date.now,
      // When the challan was issued
    },
    location: {
      type: String,
      // Where the violation happened
    },
    status: {
      type:    String,
      enum:    ['pending', 'paid', 'disputed'],
      default: 'pending',
    },
    paidAt: {
      type: Date,
      // When the challan was paid (null if not paid)
    },
  }],

  // ══════════════════════════════════════════════════
  // INSURANCE
  // ══════════════════════════════════════════════════
  insurance: [{
    policyNumber: {
      type: String,
      trim: true,
      // Official policy number from insurance company
    },
    provider: {
      type: String,
      trim: true,
      // "HDFC Ergo", "New India Assurance", "Bajaj Allianz", etc.
    },
    expiryDate: {
      type: Date,
      // When the insurance policy expires
      // We calculate daysLeft from this in the route
    },
    plateNumber: {
      type:      String,
      uppercase: true,
      trim:      true,
      // Which vehicle this insurance is for
    },
    type: {
      type:    String,
      enum:    ['comprehensive', 'third_party', 'zero_dep'],
      default: 'comprehensive',
      // comprehensive = full coverage
      // third_party   = covers damage to others only
      // zero_dep      = comprehensive without depreciation deduction
    },
    premium: {
      type:    Number,
      default: 0,
      min:     0,
      // Annual premium amount in Rupees
    },
  }],

}, {
  timestamps: true,
  // timestamps: true → MongoDB auto-adds:
  // createdAt: when document was created
  // updatedAt: when document was last modified
});

// ── Indexes ───────────────────────────────────────────────
UserSchema.index({ email: 1 }, { unique: true });
// unique index on email = fast lookup + prevents duplicates

UserSchema.index({ lastKnownLocation: '2dsphere' });
// 2dsphere = enables geospatial queries
// Needed for: "find users near this location"

UserSchema.index({ createdAt: -1 });
// -1 = descending (newest first) for sorting

// ── Pre-save Hook: Hash Password ──────────────────────────
UserSchema.pre('save', async function(next) {
  // Runs BEFORE every .save() call
  // this = the document being saved

  if (!this.isModified('password')) {
    return next();
    // Password didn't change — skip hashing
    // Prevents re-hashing already hashed password
  }

  if (!this.password) {
    return next();
    // Google OAuth users have no password
  }

  const salt    = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
  // genSalt(12) = 12 rounds = secure but not too slow (~300ms)
  // hash() = converts "password123" → "$2b$12$randomsalt...hash"

  next();
  // Continue with the save operation
});

// ── Instance Method: Compare Password ─────────────────────
UserSchema.methods.comparePassword = async function(enteredPassword) {
  // Called on a specific user document
  // Usage: const isMatch = await user.comparePassword("password123")
  return await bcrypt.compare(enteredPassword, this.password);
  // compare(plaintext, hash) = true if match, false if not
  // NEVER compare passwords directly — always use bcrypt.compare
};

// ── Instance Method: Check Account Lock ───────────────────
UserSchema.methods.isLocked = function() {
  return this.lockUntil && this.lockUntil > Date.now();
  // Returns true if lockUntil exists AND is in the future
};

module.exports = mongoose.model('User', UserSchema);
// mongoose.model('User', schema):
// → Creates 'users' collection in MongoDB (pluralized automatically)
// → Exports the model for use in routes