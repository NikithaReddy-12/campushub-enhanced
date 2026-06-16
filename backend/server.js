const express        = require('express');
const cors           = require('cors');
const helmet         = require('helmet');
const rateLimit      = require('express-rate-limit');
const mongoSanitize  = require('express-mongo-sanitize');
const xss            = require('xss-clean');
const connectDB      = require('./db');
require('dotenv').config();

const app = express();
connectDB();

/* ══════════════════════════════════════════
   SECURITY MIDDLEWARE
══════════════════════════════════════════ */

// Set security HTTP headers
app.use(helmet());

// Enable CORS (restrict to your frontend origin in production)
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  methods: ['GET','POST','PUT','DELETE'],
  allowedHeaders: ['Content-Type','Authorization'],
}));

// Parse JSON (with size limit to prevent DoS)
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// Sanitize data against NoSQL query injection
app.use(mongoSanitize());

// Sanitize data against XSS
app.use(xss());

/* ══════════════════════════════════════════
   RATE LIMITING
══════════════════════════════════════════ */

// General API rate limit
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
  message: { error: 'Too many requests from this IP. Please try again after 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Strict rate limit for auth endpoints (brute-force protection)
const authLimiter = rateLimit({
  windowMs: 60 * 1000,   // 1 minute
  max: 5,
  message: { error: 'Too many login attempts. Please wait 60 seconds before trying again.' },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
});

// Moderate rate limit for registration (prevent spam)
const regLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 20,
  message: { error: 'Too many registration attempts. Please wait before trying again.' },
});

// Apply general limiter globally
app.use('/api', generalLimiter);

/* ══════════════════════════════════════════
   ACTIVITY LOG (in-memory, admin-only)
══════════════════════════════════════════ */
const activityLog = [];
function logActivity(action, user, entity, details) {
  activityLog.unshift({
    timestamp: new Date().toISOString(),
    action,   // 'CREATE' | 'UPDATE' | 'DELETE' | 'LOGIN'
    user,     // who performed it
    entity,   // 'Event' | 'Club' | 'Registration'
    details,
  });
  if (activityLog.length > 200) activityLog.pop();
  console.log(`[LOG] ${action} by ${user}: ${details}`);
}
app.locals.logActivity = logActivity;

/* ══════════════════════════════════════════
   ROUTES
══════════════════════════════════════════ */
app.use('/api/auth',          authLimiter,   require('./routes/auth'));
app.use('/api/clubs',                        require('./routes/clubs'));
app.use('/api/events',                       require('./routes/events'));
app.use('/api/registrations', regLimiter,    require('./routes/registrations'));
app.use('/api/notifications',                require('./routes/notifications'));

// Activity log (admin only)
app.get('/api/admin/logs', require('./middleware/auth').verifyToken, require('./middleware/auth').requireRole('admin'), (req, res) => {
  res.json(activityLog);
});

/* ══════════════════════════════════════════
   HEALTH CHECK
══════════════════════════════════════════ */
app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

/* ══════════════════════════════════════════
   ERROR HANDLER
══════════════════════════════════════════ */
app.use((err, req, res, next) => {
  console.error(err.stack);
  // Do not expose stack trace in production
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
  });
});

/* ══════════════════════════════════════════
   START
══════════════════════════════════════════ */
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 CampusHub server running on http://localhost:${PORT}`));
