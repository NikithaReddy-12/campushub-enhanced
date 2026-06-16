const express   = require('express');
const router    = express.Router();
const mongoose  = require('mongoose');
const { verifyToken, requireRole, requireClubOwnership } = require('../middleware/auth');

// ── Event schema ───────────────────────────────────────────────────────────────
const EventSchema = new mongoose.Schema({
  id:           { type: String, required: true, unique: true, trim: true },
  clubId:       { type: String, required: true, trim: true },
  title:        { type: String, required: true, trim: true, maxlength: 200 },
  category:     { type: String, enum: ['Technical','Cultural','Sports','Social'], default: 'Technical' },
  date:         { type: String, required: true },
  venue:        { type: String, trim: true, maxlength: 200 },
  description:  { type: String, trim: true, maxlength: 2000 },
  status:       { type: String, enum: ['open','closed'], default: 'open' },
  maxCapacity:  { type: Number, default: null, min: 1 },
  coHosts:      [{ type: String }],  // array of co-host clubIds
  createdBy:    { type: String },    // userId of creator
  createdAt:    { type: Date, default: Date.now },
  updatedAt:    { type: Date, default: Date.now },
});
const Event = mongoose.model('Event', EventSchema);

// ── GET all events (optional ?clubId=, ?category=, ?status=) ──────────────────
router.get('/', async (req, res) => {
  try {
    const filter = {};
    if (req.query.clubId)   filter.clubId   = req.query.clubId;
    if (req.query.category) filter.category = req.query.category;
    if (req.query.status)   filter.status   = req.query.status;
    const events = await Event.find(filter).sort({ date: 1 });
    res.json(events);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET single event ──────────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const event = await Event.findOne({ id: req.params.id });
    if (!event) return res.status(404).json({ error: 'Event not found' });
    res.json(event);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST create event (club lead or admin only) ───────────────────────────────
router.post('/', async (req, res) => {
  try {
    const { id, clubId, title, category, date, venue, description, status, maxCapacity, coHosts } = req.body;

    const event = new Event({
      id, clubId, title, category, date, venue, description,
      status: status || 'open',
      maxCapacity: maxCapacity ? parseInt(maxCapacity) : null,
      coHosts: coHosts || [],
      createdBy: clubId,
    });
    await event.save();
    req.app.locals.logActivity('CREATE', clubId, 'Event', `Created event "${title}"`);
    res.status(201).json(event);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ── PUT update event ──────────────────────────────────────────────────────────
router.put('/:id', async (req, res) => {
  try {
    const event = await Event.findOne({ id: req.params.id });
    if (!event) return res.status(404).json({ error: 'Event not found' });

    const updates = { ...req.body, updatedAt: new Date() };
    delete updates.id;       // don't allow changing the ID
    delete updates.clubId;   // don't allow reassigning to another club
    if (updates.maxCapacity) updates.maxCapacity = parseInt(updates.maxCapacity);

    const updated = await Event.findOneAndUpdate({ id: req.params.id }, updates, { new: true });
    req.app.locals.logActivity('UPDATE', event.clubId, 'Event', `Updated event "${event.title}"`);
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ── DELETE event (admin or owning club) ───────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const event = await Event.findOne({ id: req.params.id });
    if (!event) return res.status(404).json({ error: 'Event not found' });

    await Event.findOneAndDelete({ id: req.params.id });
    req.app.locals.logActivity('DELETE', 'Admin', 'Event', `Deleted event "${event.title}"`);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
