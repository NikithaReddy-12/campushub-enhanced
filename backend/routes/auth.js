const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// ── User/Student Schema ────────────────────────────────────────────────────────
const StudentSchema = new mongoose.Schema({
  id:        { type: String, required: true, unique: true, trim: true },
  name:      { type: String, required: true, trim: true, maxlength: 100 },
  roll:      { type: String, required: true, trim: true, maxlength: 30, uppercase: true },
  email:     { type: String, required: true, trim: true, lowercase: true, unique: true },
  password:  { type: String },
  createdAt: { type: Date, default: Date.now },
});
const Student = mongoose.model('Student', StudentSchema);

const COLLEGE_DOMAIN = process.env.COLLEGE_DOMAIN || 'college.edu';

// Validate college email
function isValidCollegeEmail(email) {
  const domainEscaped = COLLEGE_DOMAIN.replace('.', '\\.');
  return new RegExp(`^[a-zA-Z0-9._%+\\-]+@${domainEscaped}$`, 'i').test(email.trim());
}

// ── POST register student ──────────────────────────────────────────────────────
router.post('/register', async (req, res) => {
  try {
    const { name, roll, email, password } = req.body;

    // Validate inputs
    if (!name || !roll || !email || !password) {
      return res.status(400).json({ error: 'All fields are required.' });
    }

    // Validate college email
    if (!isValidCollegeEmail(email)) {
      return res.status(400).json({ error: `Email must be a valid @${COLLEGE_DOMAIN} address.` });
    }

    // Check if student already exists
    const existing = await Student.findOne({ $or: [{ email }, { roll: roll.toUpperCase() }] });
    if (existing) {
      return res.status(409).json({ error: 'Email or Roll Number already registered.' });
    }

    const student = new Student({
      id: 'STU' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      name,
      roll: roll.toUpperCase(),
      email: email.toLowerCase(),
      password, // In production: hash with bcrypt
    });
    await student.save();

    res.status(201).json({ 
      message: 'Registration successful!',
      student: { id: student.id, name: student.name, email: student.email, roll: student.roll }
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ── POST login student ─────────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const student = await Student.findOne({ email: email.toLowerCase() });
    if (!student || student.password !== password) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    res.json({
      message: 'Login successful!',
      student: { id: student.id, name: student.name, email: student.email, roll: student.roll }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST logout ────────────────────────────────────────────────────────────────
router.post('/logout', (req, res) => {
  res.json({ message: 'Logout successful.' });
});

module.exports = router;
