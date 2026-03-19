const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');

const GovOfficialSchema = new mongoose.Schema({

  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true,
  },

  email: {
    type: String,
    required: true,
    lowercase: true,
  },

  password: {
    type: String,
    minlength: 8,
    select: false,
  },

  googleId: {
    type: String,
    sparse: true,
  },

  authProvider: {
    type: String,
    enum: ['local', 'google'],
    default: 'local',
  },

  // ── Gov-Specific Fields ───────────────────────────
  department: {
    type: String,
    required: [true, 'Department is required'],
    enum: [
      'police',
      'traffic_police',
      'municipal_corporation',
      'fire_department',
      'ambulance_service',
      'highway_authority',
      'transport_department',
      'admin',
    ],
  },

  badgeNumber: {
    type: String,
    unique: true,
    sparse: true,
    // Optional but unique if provided
  },

  rank: {
    type: String,
    // "Inspector", "Commissioner", "DCP", etc.
  },

  zone: {
    type: String,
    // Jurisdiction zone: "North", "South", "Central"
  },

  // ── Admin Approval System ─────────────────────────
  isApproved: {
    type: Boolean,
    default: false,
    // NEW gov officials start as NOT approved
    // Admin must manually approve them
    // This prevents anyone with a .gov.in email from accessing everything
  },

  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'GovOfficial',
    // Which admin approved this official
    // ref: 'GovOfficial' = reference to another GovOfficial document
    // Enables: official.populate('approvedBy') to get approver's details
  },

  approvedAt: {
    type: Date,
  },

  role: {
    type: String,
    enum: ['official', 'supervisor', 'admin'],
    default: 'official',
    // official = view only
    // supervisor = view + manage cameras
    // admin = full access + approve other officials
  },

  // ── Access Control ────────────────────────────────
  allowedDomain: {
    type: String,
    // Which .gov domain this official registered with
  },

  canAccessCameras: {
    type: Boolean,
    default: true,
    // Gov officials can see live camera feeds
    // Can be revoked per-official
  },

  cameraAccess: [{
    // Which specific cameras this official can access
    // Empty = access to ALL cameras
    cameraId: String,
    location: String,
  }],

  isActive: {
    type: Boolean,
    default: true,
  },

  lastLogin: {
    type: Date,
  },

  loginAttempts: {
    type: Number,
    default: 0,
  },

  lockUntil: {
    type: Date,
  },

}, { timestamps: true });

// ── Indexes ───────────────────────────────────────────────
GovOfficialSchema.index({ email: 1 });
GovOfficialSchema.index({ department: 1 });
GovOfficialSchema.index({ isApproved: 1 });

// ── Pre-save: Hash Password ───────────────────────────────
GovOfficialSchema.pre('save', async function(next) {
  if (!this.isModified('password') || !this.password) return next();
  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

GovOfficialSchema.methods.comparePassword = async function(password) {
  return await bcrypt.compare(password, this.password);
};

GovOfficialSchema.methods.isLocked = function() {
  return this.lockUntil && this.lockUntil > Date.now();
};

module.exports = mongoose.model('GovOfficial', GovOfficialSchema);