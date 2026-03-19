// vehicles.js — Vehicle, Challan, Insurance management
const express = require('express');
const router  = express.Router();
const { body, validationResult } = require('express-validator');

const User = require('../models/User');
const { protect } = require('../middleware/auth');

// All routes require login
router.use(protect);
// router.use(middleware) = apply to ALL routes in this file

// ══════════════════════════════════════════════════════
// VEHICLES
// ══════════════════════════════════════════════════════

// GET /api/vehicles — Get all my vehicles
router.get('/', async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('vehicles');
    // .select('vehicles') = only fetch vehicles field (not password etc.)

    res.json({
      success: true,
      count:   user.vehicles.length,
      data:    user.vehicles,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// POST /api/vehicles — Add a vehicle
router.post('/',
  [
    body('plateNumber').notEmpty().withMessage('Plate number required')
      .toUpperCase().trim(),
    // .toUpperCase() = "mh01ab1234" → "MH01AB1234"
    body('type').isIn(['car','bike','truck','bus','auto','other'])
      .withMessage('Invalid vehicle type'),
    body('model').notEmpty().withMessage('Model required'),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }

      const { plateNumber, type, model, year, color } = req.body;

      // Check duplicate plate number for this user
      const user = await User.findById(req.user._id);
      const exists = user.vehicles.some(v =>
        v.plateNumber.toUpperCase() === plateNumber.toUpperCase()
      );
      // .some() = returns true if at least one item matches

      if (exists) {
        return res.status(400).json({
          success: false,
          message: 'Vehicle with this plate number already added',
        });
      }

      // Add vehicle to user's vehicles array
      user.vehicles.push({
        plateNumber: plateNumber.toUpperCase(),
        type,
        model,
        year:  year  || null,
        color: color || null,
      });

      await user.save();
      // .save() triggers pre-save hooks (password hashing etc.)

      res.status(201).json({
        success: true,
        message: 'Vehicle added',
        data:    user.vehicles[user.vehicles.length - 1],
        // Return the newly added vehicle (last item)
      });

    } catch (err) {
      res.status(500).json({ success: false, message: 'Server error' });
    }
  }
);

// DELETE /api/vehicles/:vehicleId — Remove a vehicle
router.delete('/:vehicleId', async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    const vehicleIndex = user.vehicles.findIndex(
      v => v._id.toString() === req.params.vehicleId
      // .toString() converts MongoDB ObjectId to string for comparison
    );

    if (vehicleIndex === -1) {
      return res.status(404).json({ success: false, message: 'Vehicle not found' });
    }

    user.vehicles.splice(vehicleIndex, 1);
    // splice(index, deleteCount) = remove 1 item at vehicleIndex

    await user.save();

    res.json({ success: true, message: 'Vehicle removed' });

  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ══════════════════════════════════════════════════════
// CHALLANS (Traffic Violations)
// ══════════════════════════════════════════════════════

// GET /api/vehicles/challans — Get all my challans
router.get('/challans', async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('challans');

    // Sort by date descending (newest first)
    const sorted = [...user.challans].sort(
      (a, b) => new Date(b.date) - new Date(a.date)
      // Subtracting dates gives difference in ms
      // Negative = a before b (ascending)
      // Positive = a after b (descending)
    );

    // Calculate totals
    const totalAmount  = user.challans.reduce((sum, c) => sum + (c.amount || 0), 0);
    const pendingAmount = user.challans
      .filter(c => c.status === 'pending')
      .reduce((sum, c) => sum + (c.amount || 0), 0);
    // .reduce() = accumulates values: starts at 0, adds each amount

    res.json({
      success: true,
      count:   user.challans.length,
      totalAmount,
      pendingAmount,
      data:    sorted,
    });

  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// POST /api/vehicles/challans — Add a challan
router.post('/challans',
  [
    body('challanId').notEmpty().withMessage('Challan ID required'),
    body('amount').isNumeric().withMessage('Amount must be a number'),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }

      const {
        challanId, plateNumber, offense,
        amount, date, location, status
      } = req.body;

      const user = await User.findById(req.user._id);

      // Check duplicate challan
      const exists = user.challans.some(c => c.challanId === challanId);
      if (exists) {
        return res.status(400).json({
          success: false,
          message: 'Challan already exists',
        });
      }

      user.challans.push({
        challanId,
        plateNumber,
        offense,
        amount:  parseFloat(amount),
        // parseFloat = convert string "500" to number 500
        date:    date ? new Date(date) : new Date(),
        location,
        status:  status || 'pending',
      });

      await user.save();

      res.status(201).json({
        success: true,
        message: 'Challan added',
        data:    user.challans[user.challans.length - 1],
      });

    } catch (err) {
      res.status(500).json({ success: false, message: 'Server error' });
    }
  }
);

// PATCH /api/vehicles/challans/:challanId/pay — Mark challan as paid
router.patch('/challans/:challanId/pay', async (req, res) => {
  try {
    const user    = await User.findById(req.user._id);
    const challan = user.challans.find(
      c => c._id.toString() === req.params.challanId
    );

    if (!challan) {
      return res.status(404).json({ success: false, message: 'Challan not found' });
    }

    if (challan.status === 'paid') {
      return res.status(400).json({ success: false, message: 'Already paid' });
    }

    challan.status  = 'paid';
    challan.paidAt  = new Date();
    // paidAt = when it was paid (for records)

    await user.save();

    res.json({
      success: true,
      message: 'Challan marked as paid',
      data:    challan,
    });

  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ══════════════════════════════════════════════════════
// INSURANCE
// ══════════════════════════════════════════════════════

// GET /api/vehicles/insurance — Get all insurance records
router.get('/insurance', async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('insurance');

    // Add expiry status to each record
    const now  = new Date();
    const data = user.insurance.map(ins => {
      const expiry    = new Date(ins.expiryDate);
      const daysLeft  = Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));
      // (expiry - now) = ms difference
      // / (ms per day) = days
      // Math.ceil = round up

      return {
        ...ins.toObject(),
        // .toObject() = convert Mongoose document to plain JS object
        // ...spread = copy all fields
        daysLeft,
        expiryStatus:
          daysLeft < 0   ? 'expired' :
          daysLeft < 30  ? 'expiring_soon' :
          'active',
        // Nested ternary:
        // if daysLeft < 0 → expired
        // else if daysLeft < 30 → expiring_soon
        // else → active
      };
    });

    res.json({
      success: true,
      count:   data.length,
      data,
    });

  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// POST /api/vehicles/insurance — Add insurance
router.post('/insurance',
  [
    body('policyNumber').notEmpty().withMessage('Policy number required'),
    body('provider').notEmpty().withMessage('Provider required'),
    body('expiryDate').isISO8601().withMessage('Valid expiry date required'),
    // isISO8601 = validates date format: "2024-12-31"
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }

      const { policyNumber, provider, expiryDate, plateNumber, type, premium } = req.body;

      const user = await User.findById(req.user._id);

      // Check duplicate policy
      const exists = user.insurance.some(i => i.policyNumber === policyNumber);
      if (exists) {
        return res.status(400).json({
          success: false,
          message: 'Policy already exists',
        });
      }

      user.insurance.push({
        policyNumber,
        provider,
        expiryDate:  new Date(expiryDate),
        plateNumber: plateNumber || '',
        type:        type || 'comprehensive',
        premium:     parseFloat(premium) || 0,
      });

      await user.save();

      res.status(201).json({
        success: true,
        message: 'Insurance added',
        data:    user.insurance[user.insurance.length - 1],
      });

    } catch (err) {
      res.status(500).json({ success: false, message: 'Server error' });
    }
  }
);

// DELETE /api/vehicles/insurance/:id — Remove insurance
router.delete('/insurance/:id', async (req, res) => {
  try {
    const user  = await User.findById(req.user._id);
    const index = user.insurance.findIndex(
      i => i._id.toString() === req.params.id
    );

    if (index === -1) {
      return res.status(404).json({ success: false, message: 'Insurance not found' });
    }

    user.insurance.splice(index, 1);
    await user.save();

    res.json({ success: true, message: 'Insurance removed' });

  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;