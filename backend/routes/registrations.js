const express   = require('express');
const router    = express.Router();
const mongoose  = require('mongoose');
const QRCode    = require('qrcode');
const { verifyToken, requireRole } = require('../middleware/auth');

// ── Registration schema ────────────────────────────────────────────────────────
const RegSchema = new mongoose.Schema({
  id:       { type: String, required: true, unique: true, trim: true },
  eventId:  { type: String, required: true },
  name:     { type: String, required: true, trim: true, maxlength: 100 },
  roll:     { type: String, required: true, trim: true, maxlength: 30, uppercase: true },
  email:    { type: String, required: true, trim: true, lowercase: true },
  date:     { type: String },
  status:   {
    type: String,
    enum: ['pending', 'confirmed', 'waitlisted', 'attended', 'cancelled'],
    default: 'confirmed',
  },
  qrData:   { type: String },      // JSON string encoded in QR
  checkedInAt: { type: Date },
});
const Registration = mongoose.model('Registration', RegSchema);

// ── Event reference ───────────────────────────────────────────────────────────
const Event = mongoose.model('Event');

// ── Validate college email domain ─────────────────────────────────────────────
const COLLEGE_DOMAIN = process.env.COLLEGE_DOMAIN || 'college.edu';
function isValidCollegeEmail(email) {
  const domainEscaped = COLLEGE_DOMAIN.replace('.', '\\.');
  return new RegExp(`^[a-zA-Z0-9._%+\\-]+@${domainEscaped}$`, 'i').test(email.trim());
}

// ── GET registrations (optional ?eventId=) ────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const filter = {};
    if (req.query.eventId) filter.eventId = req.query.eventId;
    if (req.query.roll)    filter.roll    = req.query.roll.toUpperCase();
    const regs = await Registration.find(filter).sort({ date: -1 });
    res.json(regs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST register ─────────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const { id, eventId, name, roll, email } = req.body;

    // Validate college email
    if (!isValidCollegeEmail(email)) {
      return res.status(400).json({ error: `Email must be a valid @${COLLEGE_DOMAIN} address.` });
    }

    // Prevent duplicate registration for same roll number
    const existing = await Registration.findOne({ eventId, roll: roll.toUpperCase() });
    if (existing) {
      return res.status(409).json({ error: 'You have already registered for this event.' });
    }

    // Check event capacity & determine status
    let status = 'confirmed';
    const event = await Event.findOne({ id: eventId });
    if (event && event.maxCapacity) {
      const confirmedCount = await Registration.countDocuments({ eventId, status: 'confirmed' });
      if (confirmedCount >= event.maxCapacity) {
        status = 'waitlisted'; // Auto-waitlist when capacity is full
      }
    }

    // Build QR payload
    const qrPayload = JSON.stringify({ regId: id, name, roll, eventId, eventTitle: event?.title || '' });

    const reg = new Registration({
      id, eventId, name,
      roll: roll.toUpperCase(),
      email: email.toLowerCase(),
      date: new Date().toISOString().split('T')[0],
      status,
      qrData: qrPayload,
    });
    await reg.save();

    res.status(201).json(reg);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ── GET QR code image for a registration ─────────────────────────────────────
router.get('/:id/qr', async (req, res) => {
  try {
    const reg = await Registration.findOne({ id: req.params.id });
    if (!reg) return res.status(404).json({ error: 'Registration not found' });

    const qrDataUrl = await QRCode.toDataURL(reg.qrData || reg.id, {
      width: 300, margin: 2,
      color: { dark: '#000000', light: '#ffffff' },
    });
    res.json({ qr: qrDataUrl, regId: reg.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST check-in via QR scan (club lead / admin) ─────────────────────────────
router.post('/checkin', async (req, res) => {
  try {
    const { regId, eventId } = req.body;
    const reg = await Registration.findOne({ id: regId, eventId });
    if (!reg) return res.status(404).json({ error: 'Registration not found for this event.' });
    if (reg.status === 'attended') {
      return res.status(409).json({ error: 'Already checked in.', reg });
    }
    if (reg.status === 'waitlisted') {
      return res.status(403).json({ error: 'Student is on waitlist, not confirmed.' });
    }

    reg.status = 'attended';
    reg.checkedInAt = new Date();
    await reg.save();

    req.app.locals.logActivity('UPDATE', 'Admin', 'Registration',
      `Attendance marked for ${reg.name} (${reg.roll}) at event ${eventId}`);

    res.json({ success: true, reg });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PUT cancel registration (triggers waitlist promotion) ─────────────────────
router.put('/:id/cancel', async (req, res) => {
  try {
    const reg = await Registration.findOne({ id: req.params.id });
    if (!reg) return res.status(404).json({ error: 'Registration not found' });

    reg.status = 'cancelled';
    await reg.save();

    // Promote next person on waitlist
    const nextWaiting = await Registration.findOne({ eventId: reg.eventId, status: 'waitlisted' }).sort({ date: 1 });
    if (nextWaiting) {
      nextWaiting.status = 'confirmed';
      await nextWaiting.save();
      // In production: send email notification to nextWaiting.email
      console.log(`[WAITLIST] Promoted ${nextWaiting.name} (${nextWaiting.email}) from waitlist for event ${reg.eventId}`);
    }

    res.json({ success: true, promoted: nextWaiting || null });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
