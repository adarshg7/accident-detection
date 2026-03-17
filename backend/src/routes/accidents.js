const express = require('express');
const router  = express.Router();
const multer  = require('multer');
// multer = middleware for handling file uploads (images)

const Accident = require('../models/Accident');
const { protect, govOnly, approvedOnly, aiApiKey } = require('../middleware/auth');
const { reportLimiter, apiLimiter } = require('../middleware/security');
const { setCache, getCache, deleteCache } = require('../config/redis');

// ── File Upload Config ─────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, process.env.UPLOAD_PATH || 'uploads/screenshots');
    // cb(error, path) — null = no error
  },
  filename: (req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `accident-${unique}.jpg`);
    // Unique filename prevents overwrites
  },
});

const upload = multer({
  storage,
  limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE) || 10485760 },
  // Max 10MB per file
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files allowed'), false);
    }
  },
});

// ════════════════════════════════════════════════════
// AI SYSTEM ROUTES (Person 1 sends to these)
// ════════════════════════════════════════════════════

// POST /api/accidents — Receive accident from AI system
router.post('/', apiLimiter, aiApiKey, async (req, res) => {
  try {
    const {
      accident_id, source_id, timestamp,
      severity, description, detections,
      image_base64, screenshot_path,
      confidence_avg, overlapping_objects,
    } = req.body;

    // Save screenshot from base64
    let screenshotUrl = '';
    if (image_base64) {
      const buffer = Buffer.from(image_base64, 'base64');
      // Buffer.from(string, 'base64') converts base64 → binary
      const filename = `accident-${accident_id}.jpg`;
      const filepath = `${process.env.UPLOAD_PATH}/${filename}`;
      require('fs').writeFileSync(filepath, buffer);
      // writeFileSync = write file synchronously
      screenshotUrl = `${process.env.SERVER_BASE_URL}/screenshots/${filename}`;
    }

    // Extract coordinates (from .env camera location or request body)
    const lat = req.body.location?.latitude || 19.0760;
    const lon = req.body.location?.longitude || 72.8777;

    const accident = await Accident.create({
      accidentId:   accident_id,
      sourceId:     source_id,
      detectedBy:   'ai_system',
      severity:     severity || 'MEDIUM',
      description,
      confidence:   confidence_avg,
      location: {
        type: 'Point',
        coordinates: [lon, lat],
        // GeoJSON: [longitude, latitude] ← note the ORDER
      },
      vehiclesInvolved: detections?.map(d => d.class) || [],
      // .map() = transform array: [{class:"car",...}] → ["car",...]
      screenshots: screenshotUrl ? [{ url: screenshotUrl }] : [],
      rawDetections: detections || [],
      timestamp: new Date(timestamp * 1000),
      // timestamp from Python is Unix seconds
      // JavaScript Date needs milliseconds: * 1000
    });

    // Invalidate cached accident lists
    await deleteCache('accidents:recent');
    await deleteCache('accidents:stats');
    // When new accident arrives: old cache is stale → delete it
    // Next request will re-fetch fresh data from MongoDB

    // Emit to all connected dashboards via Socket.io
    req.app.get('io').emit('new_accident', {
      // req.app.get('io') = get Socket.io instance stored on app
      // .emit('event', data) = send to ALL connected clients
      id:          accident._id,
      accidentId:  accident.accidentId,
      severity:    accident.severity,
      description: accident.description,
      location:    accident.location.coordinates,
      timestamp:   accident.timestamp,
      screenshotUrl,
    });
    // Person 3's dashboard receives this INSTANTLY via WebSocket
    // No polling needed — pure real-time push

    res.status(201).json({
      success: true,
      message: 'Accident recorded',
      id: accident._id,
    });

  } catch (error) {
    console.error('[Accidents] POST error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ════════════════════════════════════════════════════
// USER ROUTES
// ════════════════════════════════════════════════════

// POST /api/accidents/report — User reports an accident
router.post('/report', protect, reportLimiter, upload.single('photo'), async (req, res) => {
  try {
    const { description, latitude, longitude, severity } = req.body;

    if (!latitude || !longitude) {
      return res.status(400).json({
        success: false,
        message: 'Location required to report accident.',
      });
    }

    const screenshots = [];
    if (req.file) {
      screenshots.push({
        url: `${process.env.SERVER_BASE_URL}/screenshots/${req.file.filename}`,
      });
    }

    const accident = await Accident.create({
      accidentId:  `user_report_${Date.now()}`,
      sourceId:    `user_${req.user._id}`,
      detectedBy:  'user_report',
      reportedBy:  req.user._id,
      reporterModel: req.userType === 'gov' ? 'GovOfficial' : 'User',
      severity:    severity || 'MEDIUM',
      description: description || 'Accident reported by user',
      location: {
        type: 'Point',
        coordinates: [parseFloat(longitude), parseFloat(latitude)],
      },
      screenshots,
      status: 'detected',
    });

    // Emit to gov dashboards
    req.app.get('io').to('gov_room').emit('user_report', {
      // .to('gov_room') = only send to clients in 'gov_room'
      // Only gov officials see user reports in real-time
      id:          accident._id,
      severity:    accident.severity,
      description: accident.description,
      location:    accident.location.coordinates,
      reportedBy:  req.user.name,
    });

    res.status(201).json({
      success: true,
      message: 'Accident reported. Thank you.',
      id: accident._id,
    });

  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// GET /api/accidents/nearby — Get accidents near user
router.get('/nearby', protect, async (req, res) => {
  try {
    const { lat, lon, radius = 5 } = req.query;
    // query params from URL: /nearby?lat=19.07&lon=72.87&radius=5

    if (!lat || !lon) {
      return res.status(400).json({ success: false, message: 'lat and lon required' });
    }

    const cacheKey = `accidents:nearby:${parseFloat(lat).toFixed(3)}:${parseFloat(lon).toFixed(3)}:${radius}`;
    // .toFixed(3) = round to 3 decimal places for cache key consistency
    // 19.076012 and 19.076099 → same cache key "19.076"

    const cached = await getCache(cacheKey);
    if (cached) {
      return res.json({ success: true, data: cached, fromCache: true });
      // Return cached data instantly (no MongoDB query)
    }

    const accidents = await Accident.find({
      location: {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [parseFloat(lon), parseFloat(lat)],
          },
          $maxDistance: parseInt(radius) * 1000,
          // $maxDistance in meters: radius km * 1000
        },
      },
      // $near = MongoDB geospatial operator
      // Finds documents sorted by distance from given point
      // Requires 2dsphere index on location field

      timestamp: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      // $gte = greater than or equal
      // Only show accidents from last 24 hours
      // Date.now() - 24 hours in milliseconds

      status: { $nin: ['rejected'] },
      // $nin = NOT in array
      // Don't show rejected/false alarm accidents to users
    }).limit(50)
      .select('accidentId severity description location timestamp status screenshots')
      .lean();
      // .lean() = return plain JavaScript objects instead of Mongoose documents
      // 2-3x faster for read-only data (no Mongoose overhead)

    await setCache(cacheKey, accidents, 60);
    // Cache for 60 seconds
    // Nearby accidents don't change every millisecond

    res.json({ success: true, count: accidents.length, data: accidents });

  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ════════════════════════════════════════════════════
// GOV ONLY ROUTES
// ════════════════════════════════════════════════════

// GET /api/accidents — All accidents (gov only)
router.get('/', protect, govOnly, approvedOnly, async (req, res) => {
  try {
    const {
      page = 1, limit = 20,
      severity, status,
      startDate, endDate,
    } = req.query;

    const filter = {};
    // Build filter object based on query params

    if (severity) filter.severity = severity;
    // severity=HIGH → filter: { severity: 'HIGH' }

    if (status) filter.status = status;

    if (startDate || endDate) {
      filter.timestamp = {};
      if (startDate) filter.timestamp.$gte = new Date(startDate);
      if (endDate) filter.timestamp.$lte = new Date(endDate);
      // $gte = >=, $lte = <=
      // Date range filtering
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    // Pagination: page 1 = skip 0, page 2 = skip 20, etc.

    const [accidents, total] = await Promise.all([
      // Promise.all = run BOTH queries simultaneously (parallel)
      // Faster than running one after the other

      Accident.find(filter)
        .sort({ timestamp: -1 })
        // -1 = descending (newest first)
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),

      Accident.countDocuments(filter),
      // Count total matching documents for pagination
    ]);

    res.json({
      success: true,
      count:      accidents.length,
      total,
      pages:      Math.ceil(total / parseInt(limit)),
      // Math.ceil = round up: 21/20 = 1.05 → 2 pages
      currentPage: parseInt(page),
      data: accidents,
    });

  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// PATCH /api/accidents/:id/status — Update accident status
router.patch('/:id/status', protect, govOnly, approvedOnly, async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ['detected', 'verified', 'rejected', 'responding', 'resolved'];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }

    const update = {
      status,
      verifiedBy: req.user._id,
      verifiedAt: new Date(),
    };

    const accident = await Accident.findByIdAndUpdate(
      req.params.id,
      // req.params.id = the :id from URL /accidents/abc123/status
      { $set: update },
      // $set = only update these fields, leave others unchanged
      { new: true }
      // new: true = return the UPDATED document (not the old one)
    );

    if (!accident) {
      return res.status(404).json({ success: false, message: 'Accident not found' });
    }

    // Emit status change to all clients
    req.app.get('io').emit('accident_status_update', {
      id:     accident._id,
      status: accident.status,
    });

    await deleteCache('accidents:recent');

    res.json({ success: true, data: accident });

  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// GET /api/accidents/stats
router.get('/stats', protect, govOnly, async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    // Set to midnight = start of today

    const [todayCount, activeCount, resolvedCount, criticalCount] = await Promise.all([
      Accident.countDocuments({ timestamp: { $gte: today } }),
      Accident.countDocuments({ status: { $in: ['detected', 'verified', 'responding'] } }),
      Accident.countDocuments({ status: 'resolved', timestamp: { $gte: today } }),
      Accident.countDocuments({ severity: 'CRITICAL', status: { $nin: ['resolved', 'rejected'] } }),
    ]);

    res.json({
      success: true,
      data: {
        today:    todayCount,
        active:   activeCount,
        resolved: resolvedCount,
        critical: criticalCount,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;