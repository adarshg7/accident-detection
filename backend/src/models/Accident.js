const mongoose = require('mongoose');

const AccidentSchema = new mongoose.Schema({

  // ── Detection Info ────────────────────────────────
  accidentId: {
    type: String,
    required: true,
    unique: true,
    index: true,
    // accidentId from Person 1: "camera_0_1710000000_150"
  },

  sourceId: {
    type: String,
    required: true,
    // Which camera: "camera_0", "camera_1"
  },

  detectedBy: {
    type: String,
    enum: ['ai_system', 'user_report', 'gov_report', 'external_api'],
    default: 'ai_system',
    // Who/what detected this accident
  },

  reportedBy: {
    type: mongoose.Schema.Types.ObjectId,
    // If user reported: their ObjectId
    // If AI detected: null
    refPath: 'reporterModel',
    // refPath = dynamic reference (points to different model based on field)
  },

  reporterModel: {
    type: String,
    enum: ['User', 'GovOfficial'],
    // Which model to look up for reportedBy
  },

  // ── Location ──────────────────────────────────────
  location: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point',
    },
    coordinates: {
      type: [Number],
      required: true,
      // [longitude, latitude] — GeoJSON standard
    },
  },

  address: {
    type: String,
    // "MG Road, Near City Mall, Mumbai"
  },

  // ── Accident Details ──────────────────────────────
  severity: {
    type: String,
    enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
    default: 'MEDIUM',
    index: true,
    // index = faster filtering by severity
  },

  description: {
    type: String,
  },

  vehiclesInvolved: [{
    type: String,
    // ["car", "motorcycle", "truck"]
  }],

  confidence: {
    type: Number,
    min: 0,
    max: 1,
    // YOLO confidence score
  },

  // ── Media ─────────────────────────────────────────
  screenshots: [{
    url: String,
    // URL to screenshot on Person 2's server
    capturedAt: {
      type: Date,
      default: Date.now,
    },
  }],

  videoClipUrl: {
    type: String,
    // URL to short video clip of accident
  },

  // ── Status & Response ─────────────────────────────
  status: {
    type: String,
    enum: [
      'detected',     // Just detected, no action yet
      'verified',     // Gov official confirmed it's real
      'rejected',     // Gov official marked as false alarm
      'responding',   // Emergency services en route
      'resolved',     // Accident handled, road clear
    ],
    default: 'detected',
    index: true,
  },

  verifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'GovOfficial',
  },

  verifiedAt: {
    type: Date,
  },

  // ── Emergency Response ────────────────────────────
  emergencyResponse: {
    policeNotified:     { type: Boolean, default: false },
    ambulanceNotified:  { type: Boolean, default: false },
    fireNotified:       { type: Boolean, default: false },
    contactsReached:    { type: Number, default: 0 },
    responseTimeSeconds:{ type: Number },
  },

  // ── Raw Data from Person 1 ────────────────────────
  rawDetections: [{
    class: String,
    confidence: Number,
    bbox: {
      x1: Number, y1: Number,
      x2: Number, y2: Number,
    },
    trackId: Number,
  }],

  timestamp: {
    type: Date,
    default: Date.now,
    index: true,
    // Index on timestamp = fast time-range queries
    // "accidents in last 24 hours" = very fast with this index
  },

}, { timestamps: true });

// ── Geospatial Index ──────────────────────────────────────
AccidentSchema.index({ location: '2dsphere' });
// 2dsphere = enables queries like:
// "find accidents within 5km of this point"
// Required for map display

// ── Compound Indexes ──────────────────────────────────────
AccidentSchema.index({ timestamp: -1, severity: 1 });
// Compound index = fast queries that filter by BOTH fields
// "recent HIGH severity accidents" uses both fields
// Much faster than two separate indexes

AccidentSchema.index({ status: 1, timestamp: -1 });
// "unresolved accidents sorted by newest"

module.exports = mongoose.model('Accident', AccidentSchema);