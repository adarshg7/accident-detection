// accidents.js — Complete routes file with ALL endpoints
const express = require('express');
const router  = express.Router();
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');

const Accident = require('../models/Accident');
const { triggerEmergencyResponse } = require('../services/emergency');
const { protect, govOnly, approvedOnly, aiApiKey } = require('../middleware/auth');
const { reportLimiter, apiLimiter }                = require('../middleware/security');
const { setCache, getCache, deleteCache }          = require('../config/redis');

// ── File Upload Config ─────────────────────────────────────
const uploadDir = path.join(__dirname, '../../uploads/screenshots');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
  // recursive: true = create parent folders too if needed
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename:    (req, file, cb) => cb(null, `accident-${Date.now()}-${Math.round(Math.random()*1e6)}.jpg`),
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  // 10MB max
  fileFilter: (req, file, cb) => {
    file.mimetype.startsWith('image/')
      ? cb(null, true)
      : cb(new Error('Images only'));
  },
});

// ══════════════════════════════════════════════════════════
// AI SYSTEM ROUTE — Person 1 sends accidents here
// POST /api/accidents
// ══════════════════════════════════════════════════════════
router.post('/', apiLimiter, aiApiKey, async (req, res) => {
  try {
    const {
      accident_id, source_id, timestamp,
      severity, description, detections,
      image_base64, location,
      confidence_avg, overlapping_objects,
    } = req.body;

    // ── Save base64 screenshot to disk ──────────────────
    let screenshotUrl = '';
    if (image_base64) {
      try {
        const buffer   = Buffer.from(image_base64, 'base64');
        // Buffer.from(string, 'base64') = decode base64 → binary
        const filename = `accident-${accident_id || Date.now()}.jpg`;
        const filepath = path.join(uploadDir, filename);
        fs.writeFileSync(filepath, buffer);
        screenshotUrl  = `${process.env.SERVER_BASE_URL || 'http://localhost:5000'}/screenshots/${filename}`;
      } catch (imgErr) {
        console.error('[Screenshot] Save failed:', imgErr.message);
        // Don't fail the whole request if image save fails
      }
    }

    // ── Get coordinates ──────────────────────────────────
    const lat = location?.latitude  || 19.0760;
    const lon = location?.longitude || 72.8777;
    // Default to Mumbai if no location provided

    // ── Create accident record ───────────────────────────
    const accident = await Accident.create({
      accidentId:  accident_id || `ai_${Date.now()}`,
      sourceId:    source_id  || 'unknown',
      detectedBy:  'ai_system',
      severity:    severity   || 'MEDIUM',
      description: description || 'Accident detected',
      confidence:  confidence_avg || 0,
      location: {
        type:        'Point',
        coordinates: [lon, lat],
        // GeoJSON = [longitude, latitude] — note the ORDER
      },
      vehiclesInvolved: (detections || []).map(d => d.class).filter(Boolean),
      // .map extracts class names: [{class:"car",...}] → ["car",...]
      // .filter(Boolean) removes undefined/null/empty values
      screenshots: screenshotUrl ? [{ url: screenshotUrl }] : [],
      rawDetections: detections || [],
      timestamp: timestamp ? new Date(timestamp * 1000) : new Date(),
      // Python sends Unix seconds → JS needs milliseconds → * 1000
      emergencyResponse: {
        policeNotified:    false,
        ambulanceNotified: false,
        contactsReached:   0,
      },
    });

    // ── Invalidate cache ─────────────────────────────────
    await deleteCache('accidents:recent');
    await deleteCache('accidents:stats');
    // Old cached data is now stale → force fresh fetch next time

    // ── Emit real-time to all dashboards ─────────────────
    const io = req.app.get('io');
    if (io) {
      io.emit('new_accident', {
        _id:          accident._id,
        accidentId:   accident.accidentId,
        sourceId:     accident.sourceId,
        severity:     accident.severity,
        description:  accident.description,
        location:     accident.location,
        timestamp:    accident.timestamp,
        status:       accident.status,
        screenshots:  accident.screenshots,
      });
      // io.emit = sends to ALL connected clients instantly
      // Gov dashboard receives this and shows live alert
      // User map receives this and adds new pin
    }

       // ── Trigger emergency response (background) ───────────
    triggerEmergencyResponse(accident).catch(err => {
      console.error('[Emergency] Response error:', err.message);
    });
    // No await — runs in background
    // HTTP response returns immediately to AI system

    console.log(`[Accident] Saved: ${accident.accidentId} | ${accident.severity}`);

    res.status(201).json({
      success: true,
      message: 'Accident recorded',
      id:      accident._id,
    });

  } catch (error) {
    console.error('[Accidents] POST error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }

  
});

// ══════════════════════════════════════════════════════════
// USER ROUTE — Public users report accidents
// POST /api/accidents/report
// ══════════════════════════════════════════════════════════
router.post('/report', protect, reportLimiter, upload.single('photo'), async (req, res) => {
  try {
    const { description, severity, latitude, longitude } = req.body;

    if (!latitude || !longitude) {
      return res.status(400).json({
        success: false,
        message: 'Location coordinates required',
      });
    }

    const screenshots = [];
    if (req.file) {
      const url = `${process.env.SERVER_BASE_URL || 'http://localhost:5000'}/screenshots/${req.file.filename}`;
      screenshots.push({ url });
    }

    const accident = await Accident.create({
      accidentId:    `user_${req.user._id}_${Date.now()}`,
      sourceId:      `user_${req.user._id}`,
      detectedBy:    'user_report',
      reportedBy:    req.user._id,
      reporterModel: 'User',
      severity:      severity || 'MEDIUM',
      description:   description || 'Accident reported by user',
      location: {
        type:        'Point',
        coordinates: [parseFloat(longitude), parseFloat(latitude)],
      },
      screenshots,
      status: 'detected',
    });

    // Notify gov dashboards about user report
    const io = req.app.get('io');
    if (io) {
      io.to('gov_room').emit('user_report', {
        // .to('gov_room') = only send to gov officials room
        id:          accident._id,
        severity:    accident.severity,
        description: accident.description,
        location:    accident.location,
        reportedBy:  req.user.name,
      });
    }

    res.status(201).json({
      success: true,
      message: 'Accident reported. Thank you.',
      id:      accident._id,
    });

  } catch (error) {
    console.error('[Report] error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ══════════════════════════════════════════════════════════
// NEARBY — Get accidents near a location (PUBLIC)
// GET /api/accidents/nearby?lat=19.07&lon=72.87&radius=5
// ══════════════════════════════════════════════════════════
router.get('/nearby', async (req, res) => {
  // No auth required — public can see nearby accidents
  try {
    const lat    = parseFloat(req.query.lat);
    const lon    = parseFloat(req.query.lon);
    const radius = parseFloat(req.query.radius) || 5;

    if (isNaN(lat) || isNaN(lon)) {
      return res.status(400).json({
        success: false,
        message: 'lat and lon query params required',
      });
    }

    // Cache key based on rounded coordinates
    const cacheKey = `accidents:nearby:${lat.toFixed(2)}:${lon.toFixed(2)}:${radius}`;
    // .toFixed(2) = round to 2 decimal places for consistent cache key
    // Same location = same cache key = same cached result

    const cached = await getCache(cacheKey);
    if (cached) {
      return res.json({ success: true, data: cached, fromCache: true });
    }

    const accidents = await Accident.find({
      location: {
        $near: {
          $geometry: {
            type:        'Point',
            coordinates: [lon, lat],
            // GeoJSON: longitude first!
          },
          $maxDistance: radius * 1000,
          // $maxDistance in METERS → radius(km) * 1000
        },
      },
      // $near = MongoDB geospatial query
      // Returns results sorted by distance (closest first)
      // REQUIRES 2dsphere index on location field (already set in model)

      timestamp: {
        $gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
        // $gte = greater than or equal
        // Only accidents from last 24 hours
        // Date.now() - 24h in milliseconds
      },

      status: { $nin: ['rejected'] },
      // $nin = NOT IN array
      // Hide rejected/false alarm accidents from public
    })
      .limit(50)
      .select('accidentId sourceId severity description location timestamp status screenshots detectedBy')
      .lean();
      // .lean() = return plain JS objects (faster than Mongoose documents)
      // Good for read-only data you won't modify

    await setCache(cacheKey, accidents, 60);
    // Cache for 60 seconds
    // Accidents near same location don't change every second

    res.json({
      success: true,
      count:   accidents.length,
      data:    accidents,
    });

  } catch (error) {
    console.error('[Nearby] error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ══════════════════════════════════════════════════════════
// STATS — Dashboard summary numbers
// GET /api/accidents/stats
// ══════════════════════════════════════════════════════════
router.get('/stats', protect, govOnly, approvedOnly, async (req, res) => {
  try {
    const cached = await getCache('accidents:stats');
    if (cached) {
      return res.json({ success: true, data: cached });
    }

    // Start of today (midnight)
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    // setHours(0,0,0,0) = set to midnight of current day

    // Run all count queries simultaneously (parallel = faster)
    const [today, active, resolved, critical, total] = await Promise.all([
      Accident.countDocuments({
        timestamp: { $gte: todayStart }
      }),
      // Today's accidents

      Accident.countDocuments({
        status: { $in: ['detected', 'verified', 'responding'] }
        // $in = matches any value in array
        // Active = not resolved or rejected
      }),

      Accident.countDocuments({
        status:    'resolved',
        timestamp: { $gte: todayStart },
      }),
      // Resolved today

      Accident.countDocuments({
        severity: 'CRITICAL',
        status:   { $nin: ['resolved', 'rejected'] },
        // Active critical accidents
      }),

      Accident.countDocuments({}),
      // All time total
    ]);

    const stats = { today, active, resolved, critical, total };

    await setCache('accidents:stats', stats, 30);
    // Cache for 30 seconds — stats change frequently

    res.json({ success: true, data: stats });

  } catch (error) {
    console.error('[Stats] error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ══════════════════════════════════════════════════════════
// ANALYTICS — Charts and graphs data
// GET /api/accidents/analytics?range=7d
// ══════════════════════════════════════════════════════════
router.get('/analytics', protect, govOnly, approvedOnly, async (req, res) => {
  try {
    const range = req.query.range || '7d';
    // '7d' = last 7 days, '30d' = last 30 days, '90d' = last 90 days

    const cacheKey = `accidents:analytics:${range}`;
    const cached   = await getCache(cacheKey);
    if (cached) return res.json({ success: true, data: cached });

    // Calculate start date based on range
    const days = range === '90d' ? 90 : range === '30d' ? 30 : 7;
    // Ternary chain: if 90d → 90, else if 30d → 30, else 7

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    // .setDate() = change the day of month
    // .getDate() - days = go back N days

    // ── Daily accident counts ─────────────────────────────
    const dailyData = await Accident.aggregate([
      // aggregate() = MongoDB pipeline for complex queries

      { $match: { timestamp: { $gte: startDate } } },
      // $match = filter documents (like WHERE in SQL)

      {
        $group: {
          _id: {
            $dateToString: {
              format: '%Y-%m-%d',
              date:   '$timestamp',
              // Format timestamp as "2024-01-15"
            },
          },
          count: { $sum: 1 },
          // $sum: 1 = count documents in each group
        },
      },

      { $sort: { _id: 1 } },
      // Sort by date ascending (oldest first)
    ]);

    // ── Hourly distribution ──────────────────────────────
    const hourlyData = await Accident.aggregate([
      { $match: { timestamp: { $gte: startDate } } },
      {
        $group: {
          _id:   { $hour: '$timestamp' },
          // $hour = extract hour from timestamp (0-23)
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    // ── Severity breakdown ────────────────────────────────
    const severityData = await Accident.aggregate([
      { $match: { timestamp: { $gte: startDate } } },
      {
        $group: {
          _id:   '$severity',
          count: { $sum: 1 },
        },
      },
    ]);

    // ── Camera performance ────────────────────────────────
    const cameraData = await Accident.aggregate([
      { $match: { timestamp: { $gte: startDate } } },
      {
        $group: {
          _id:   '$sourceId',
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
      // -1 = descending (highest count first)
      { $limit: 5 },
      // Top 5 cameras only
    ]);

    // ── Average response time ────────────────────────────
    const responseData = await Accident.aggregate([
      {
        $match: {
          timestamp: { $gte: startDate },
          'emergencyResponse.responseTimeSeconds': { $exists: true },
          // $exists: true = only documents that have this field
        },
      },
      {
        $group: {
          _id: null,
          // _id: null = group ALL documents into one group
          avgResponse: { $avg: '$emergencyResponse.responseTimeSeconds' },
          // $avg = average of field values
        },
      },
    ]);

    // ── Resolution rate ──────────────────────────────────
    const totalCount    = await Accident.countDocuments({ timestamp: { $gte: startDate } });
    const resolvedCount = await Accident.countDocuments({ timestamp: { $gte: startDate }, status: 'resolved' });
    const resolutionRate = totalCount > 0 ? Math.round(resolvedCount / totalCount * 100) : 0;
    // Math.round = round to nearest integer

    // ── Format daily labels and values ───────────────────
    const dailyMap = {};
    dailyData.forEach(d => { dailyMap[d._id] = d.count; });
    // Convert array to object: {"2024-01-01": 3, "2024-01-02": 5}

    const dailyLabels = [];
    const dailyValues = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key   = d.toISOString().split('T')[0];
      // .split('T')[0] = "2024-01-15T10:30:00" → "2024-01-15"
      const label = d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
      // "Jan 15" format
      dailyLabels.push(label);
      dailyValues.push(dailyMap[key] || 0);
      // || 0 = default to 0 if no accidents on that day
    }

    // ── Format hourly data ────────────────────────────────
    const hourlyMap = {};
    hourlyData.forEach(h => { hourlyMap[h._id] = h.count; });

    const hourlyLabels = Array.from({ length: 24 }, (_, i) => `${i}:00`);
    // Array.from({length:24}) = creates array of 24 items
    // (_, i) = _ is unused value, i is the index (0-23)
    const hourlyValues = hourlyLabels.map((_, i) => hourlyMap[i] || 0);

    // ── Format severity ───────────────────────────────────
    const sevMap = { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 };
    severityData.forEach(s => { sevMap[s._id] = s.count; });

    // ── Find peak hour ────────────────────────────────────
    const peakHourIndex = hourlyValues.indexOf(Math.max(...hourlyValues));
    // Math.max(...array) = highest value in array
    // .indexOf = find its position = the hour number

    // ── Top camera ────────────────────────────────────────
    const topCamera = cameraData[0]?._id || '—';
    // Optional chaining: if cameraData[0] exists, get _id

    const analytics = {
      daily:   { labels: dailyLabels, values: dailyValues },
      hourly:  { labels: hourlyLabels, values: hourlyValues },
      severity: [sevMap.LOW, sevMap.MEDIUM, sevMap.HIGH, sevMap.CRITICAL],
      total:    totalCount,
      avgResponse: Math.round(responseData[0]?.avgResponse || 0),
      resRate:     resolutionRate,
      peakHour:    peakHourIndex >= 0 ? `${peakHourIndex}:00` : '—',
      topCamera,
      cameras: cameraData.map(c => ({ id: c._id, count: c.count })),
    };

    await setCache(cacheKey, analytics, 300);
    // Cache analytics for 5 minutes (heavy query, doesn't change every second)

    res.json({ success: true, data: analytics });

  } catch (error) {
    console.error('[Analytics] error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ══════════════════════════════════════════════════════════
// ALL ACCIDENTS — Gov dashboard list with filters
// GET /api/accidents?page=1&limit=15&severity=HIGH&status=detected
// ══════════════════════════════════════════════════════════
router.get('/', protect, govOnly, approvedOnly, async (req, res) => {
  try {
    const {
      page     = 1,
      limit    = 15,
      severity,
      status,
      startDate,
      endDate,
      sourceId,
    } = req.query;

    const filter = {};
    if (severity)  filter.severity = severity;
    if (status)    filter.status   = status;
    if (sourceId)  filter.sourceId = sourceId;

    if (startDate || endDate) {
      filter.timestamp = {};
      if (startDate) filter.timestamp.$gte = new Date(startDate);
      if (endDate)   filter.timestamp.$lte = new Date(endDate);
    }

    const skip  = (parseInt(page) - 1) * parseInt(limit);
    // Pagination: page 1 = skip 0, page 2 = skip 15, etc.

    const [accidents, total] = await Promise.all([
      Accident.find(filter)
        .sort({ timestamp: -1 })
        // -1 = descending (newest first)
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),

      Accident.countDocuments(filter),
      // Count for pagination info
    ]);
    // Promise.all = run both queries simultaneously (parallel)

    res.json({
      success:     true,
      count:       accidents.length,
      total,
      pages:       Math.ceil(total / parseInt(limit)),
      currentPage: parseInt(page),
      data:        accidents,
    });

  } catch (error) {
    console.error('[GET accidents] error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ══════════════════════════════════════════════════════════
// UPDATE STATUS — Gov verifies/resolves accident
// PATCH /api/accidents/:id/status
// ══════════════════════════════════════════════════════════
router.patch('/:id/status', protect, govOnly, approvedOnly, async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ['detected','verified','rejected','responding','resolved'];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }

    const accident = await Accident.findByIdAndUpdate(
      req.params.id,
      // req.params.id = the :id from URL
      {
        $set: {
          status,
          verifiedBy: req.user._id,
          verifiedAt: new Date(),
        },
        // $set = update only these fields, leave others unchanged
      },
      { new: true }
      // new: true = return the UPDATED document
    );

    if (!accident) {
      return res.status(404).json({ success: false, message: 'Accident not found' });
    }

    // Notify all clients of status change
    const io = req.app.get('io');
    if (io) {
      io.emit('accident_status_update', {
        id:     accident._id,
        status: accident.status,
      });
    }

    await deleteCache('accidents:stats');
    // Stats changed — invalidate cache

    res.json({ success: true, data: accident });

  } catch (error) {
    console.error('[Status update] error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ══════════════════════════════════════════════════════════
// EMERGENCY RESPONSE — Store emergency response data
// POST /api/accidents/emergency-response
// ══════════════════════════════════════════════════════════
router.post('/emergency-response', apiLimiter, aiApiKey, async (req, res) => {
  try {
    const { accident_id, contacts_reached, response_time_seconds, calls_made, sms_sent } = req.body;

    await Accident.findOneAndUpdate(
      { accidentId: accident_id },
      // findOneAndUpdate = find by field, then update
      {
        $set: {
          'emergencyResponse.contactsReached':     contacts_reached     || 0,
          'emergencyResponse.responseTimeSeconds': response_time_seconds || 0,
          'emergencyResponse.policeNotified':      (calls_made || []).some(c => c.contact_type === 'police'),
          'emergencyResponse.ambulanceNotified':   (calls_made || []).some(c => c.contact_type === 'hospital'),
          // .some() = returns true if at least one item matches condition
        },
      }
    );

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;