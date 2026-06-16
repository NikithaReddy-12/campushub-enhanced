const express  = require('express');
const router   = express.Router();
const mongoose = require('mongoose');
const { verifyToken, requireRole } = require('../middleware/auth');

// ── Notification schema ────────────────────────────────────────────────────────
const NotifSchema = new mongoose.Schema({
  id:        { type: String, required: true, unique: true },
  eventId:   { type: String, required: true },
  clubId:    { type: String },
  message:   { type: String, required: true, trim: true, maxlength: 500 },
  type:      { type: String, enum: ['info','warn','success','error'], default: 'info' },
  createdBy: { type: String },
  createdAt: { type: Date, default: Date.now },
  readBy:    [{ type: String }], // array of user IDs who marked as read
});
const Notification = mongoose.model('Notification', NotifSchema);

// ── GET notifications (optionally filtered by eventId) ────────────────────────
router.get('/', async (req, res) => {
  try {
    const filter = {};
    if (req.query.eventId) filter.eventId = req.query.eventId;
    if (req.query.clubId)  filter.clubId  = req.query.clubId;
    const notifs = await Notification.find(filter).sort({ createdAt: -1 }).limit(50);
    res.json(notifs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST send notification (club lead or admin) ───────────────────────────────
router.post('/', verifyToken, requireRole('club', 'admin'), async (req, res) => {
  try {
    const { eventId, message, type } = req.body;
    if (!message?.trim()) return res.status(400).json({ error: 'Message is required.' });

    const notif = new Notification({
      id:        'NOTIF' + Date.now().toString(36).toUpperCase(),
      eventId,
      clubId:    req.user.clubId || null,
      message:   message.trim(),
      type:      type || 'info',
      createdBy: req.user.name || req.user.id,
    });
    await notif.save();

    req.app.locals.logActivity('CREATE', req.user.name, 'Notification',
      `Sent notification for event ${eventId}: "${message.slice(0,50)}"`);

    res.status(201).json(notif);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
