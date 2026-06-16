const express    = require('express');
const router     = express.Router();
const mongoose   = require('mongoose');
const multer     = require('multer');
const path       = require('path');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const { verifyToken, requireRole } = require('../middleware/auth');

// ── Cloudinary config ─────────────────────────────────────────────────────────
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// ── Multer Cloudinary storage ─────────────────────────────────────────────────
const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder:           'campushub/clubs',
    allowed_formats:  ['jpg', 'jpeg', 'png'],   // Only jpg/png — NO webp/gif/svg
    transformation:   [{ width: 800, height: 600, crop: 'limit', quality: 'auto:good' }],
    resource_type:    'image',
  },
});

// File filter: strictly enforce jpg/png MIME types (double-check beyond extension)
const fileFilter = (req, file, cb) => {
  const allowedMimeTypes = ['image/jpeg', 'image/png'];
  const allowedExtensions = ['.jpg', '.jpeg', '.png'];
  const ext = path.extname(file.originalname).toLowerCase();

  if (allowedMimeTypes.includes(file.mimetype) && allowedExtensions.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error('Only .jpg and .png image files are accepted.'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
});

// ── Mongoose schema ────────────────────────────────────────────────────────────
const ClubSchema = new mongoose.Schema({
  id:            { type: String, required: true, unique: true, trim: true, uppercase: true },
  name:          { type: String, required: true, trim: true, maxlength: 100 },
  description:   { type: String, trim: true, maxlength: 500 },
  category:      { type: String, enum: ['Technical','Cultural','Sports','Social'], default: 'Technical' },
  password:      { type: String },       // In production: store bcrypt hash
  imageUrl:      { type: String },
  imagePublicId: { type: String },
  createdAt:     { type: Date, default: Date.now },
});
const Club = mongoose.model('Club', ClubSchema);

// ── GET all clubs ─────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const filter = {};
    if (req.query.category) filter.category = req.query.category;
    // Never expose password in response
    const clubs = await Club.find(filter).select('-password');
    res.json(clubs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST club login ───────────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { id, password } = req.body;
    if (!id || !password) {
      return res.status(400).json({ error: 'Club ID and password are required.' });
    }

    const club = await Club.findOne({ id: id.toUpperCase() });
    if (!club || club.password !== password) {
      return res.status(401).json({ error: 'Invalid Club ID or password.' });
    }

    res.json({
      message: 'Login successful!',
      club: {
        id: club.id,
        name: club.name,
        description: club.description,
        category: club.category,
        imageUrl: club.imageUrl,
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET single club ───────────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const club = await Club.findOne({ id: req.params.id.toUpperCase() }).select('-password');
    if (!club) return res.status(404).json({ error: 'Club not found' });
    res.json(club);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST create club (admin only) ─────────────────────────────────────────────
router.post('/', upload.single('image'), async (req, res) => {
  try {
    const data = { ...req.body };
    data.id = data.id?.toUpperCase();

    if (req.file) {
      data.imageUrl      = req.file.path;
      data.imagePublicId = req.file.filename;
    }

    const club = new Club(data);
    await club.save();

    req.app.locals.logActivity('CREATE', 'Admin', 'Club', `Created club "${data.name}"`);
    // Return without password
    const saved = await Club.findOne({ id: club.id }).select('-password');
    res.status(201).json(saved);
  } catch (err) {
    if (req.file?.filename) {
      await cloudinary.uploader.destroy(req.file.filename).catch(()=>{});
    }
    res.status(400).json({ error: err.message });
  }
});

// ── PUT update club ───────────────────────────────────────────────────────────
router.put('/:id', upload.single('image'), async (req, res) => {
  try {
    const existing = await Club.findOne({ id: req.params.id.toUpperCase() });
    if (!existing) return res.status(404).json({ error: 'Club not found' });

    const updates = { ...req.body };
    delete updates.id; // Don't allow ID changes

    if (req.file) {
      if (existing.imagePublicId) {
        await cloudinary.uploader.destroy(existing.imagePublicId).catch(()=>{});
      }
      updates.imageUrl      = req.file.path;
      updates.imagePublicId = req.file.filename;
    }

    const club = await Club.findOneAndUpdate(
      { id: req.params.id.toUpperCase() },
      updates,
      { new: true }
    ).select('-password');

    req.app.locals.logActivity('UPDATE', 'Admin', 'Club', `Updated club "${club.name}"`);
    res.json(club);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ── DELETE club (admin only) ──────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const club = await Club.findOneAndDelete({ id: req.params.id.toUpperCase() });
    if (!club) return res.status(404).json({ error: 'Club not found' });

    if (club.imagePublicId) {
      await cloudinary.uploader.destroy(club.imagePublicId).catch(()=>{});
    }

    req.app.locals.logActivity('DELETE', 'Admin', 'Club', `Deleted club "${club.name}"`);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ── Multer error handler ──────────────────────────────────────────────────────
router.use((err, req, res, next) => {
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: 'File too large. Maximum size is 5MB.' });
  }
  if (err.message?.includes('Only .jpg and .png')) {
    return res.status(400).json({ error: err.message });
  }
  next(err);
});

module.exports = router;
