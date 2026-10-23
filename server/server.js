/**
 * LostLink — Express Server
 * Main application entry point
 */

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// ---- Middleware ----
app.use(cors());
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  // Firebase signInWithPopup requires window.opener to post the OAuth result
  // back to the parent tab. COOP:same-origin (Helmet's default) severs that
  // channel — the popup closes but the token never arrives, producing the
  // misleading "popup-closed-by-user" error. Must be disabled for popup auth.
  crossOriginOpenerPolicy: false
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve static files from public/
app.use(express.static(path.join(__dirname, '..', 'public')));

// ---- Log requests in dev ----
if (process.env.NODE_ENV !== 'production') {
  app.use((req, res, next) => {
    if (req.path.startsWith('/api')) {
      console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    }
    next();
  });
}

// ---- Health Check ----
app.get('/api/health', (req, res) => {
  const fbService = require('./services/firebaseService');
  const spService = require('./services/supabaseStorageService');
  const aiService = require('./services/geminiService');

  const isHealthy = fbService.isAvailable;
  res.status(isHealthy ? 200 : 503).json({
    status: isHealthy ? 'ok' : 'degraded',
    service: 'LostLink API',
    version: '2.0.0',
    timestamp: new Date().toISOString(),
    services: {
      firebaseAdmin: {
        isAvailable: fbService.isAvailable,
        initError: fbService.initError || null
      },
      supabaseStorage: {
        isConfigured: spService.isConfigured()
      },
      aiService: {
        isAvailable: aiService.isAvailable(),
        provider: aiService.getProvider()
      }
    }
  });
});

// ---- Firebase client config endpoint (safe to expose) ----
app.get('/api/config/firebase', (req, res) => {
  const apiKey = process.env.FIREBASE_CLIENT_API_KEY;
  if (!apiKey) {
    return res.status(503).json({
      error: 'Firebase credentials not configured in server .env (FIREBASE_CLIENT_API_KEY is missing).',
      configured: false
    });
  }
  res.json({
    configured: true,
    config: {
      apiKey: process.env.FIREBASE_CLIENT_API_KEY,
      authDomain: process.env.FIREBASE_CLIENT_AUTH_DOMAIN,
      projectId: process.env.FIREBASE_CLIENT_PROJECT_ID,
      storageBucket: process.env.FIREBASE_CLIENT_STORAGE_BUCKET,
      messagingSenderId: process.env.FIREBASE_CLIENT_MESSAGING_SENDER_ID,
      appId: process.env.FIREBASE_CLIENT_APP_ID
    }
  });
});

// ---- Routes ----
const aiRoutes = require('./routes/ai');
const reportsRoutes = require('./routes/reports');
const matchesRoutes = require('./routes/matches');
const contactRoutes = require('./routes/contact');
const usersRoutes = require('./routes/users');
const notificationsRoutes = require('./routes/notifications');
const { requireAuth } = require('./middleware/authMiddleware');

app.use('/api/ai', aiRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/matches', matchesRoutes);
app.use('/api/contact', contactRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/notifications', notificationsRoutes);

// Admin Moderation Route: View flagged/suspicious reports (Admin authorization only)
app.get('/api/admin/flagged-reports', requireAuth, async (req, res) => {
  try {
    const adminEmails = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
    const isAdmin = req.user.role === 'admin' || adminEmails.includes((req.user.email || '').toLowerCase());
    if (!isAdmin) {
      return res.status(403).json({ error: 'Administrative privileges required.' });
    }

    const firebaseService = require('./services/firebaseService');
    const flagged = await firebaseService.queryDocs(
      'items',
      [{ field: 'isFlagged', op: '==', value: true }],
      'createdAt',
      'desc',
      50
    );

    // Sanitize flagged reports: prevent exposure of student private contact info
    const sanitizedReports = (flagged || []).map(r => ({
      id: r.id,
      title: r.title,
      type: r.type,
      description: r.description,
      location: r.location,
      date: r.date,
      status: r.status,
      riskScore: r.riskScore || 0,
      riskFlags: r.riskFlags || [],
      isFlagged: r.isFlagged,
      createdAt: r.createdAt
    }));

    res.json({ success: true, count: sanitizedReports.length, flaggedReports: sanitizedReports });
  } catch (err) {
    console.error('[Admin] Flagged reports error:', err);
    res.status(500).json({ error: 'Failed to retrieve flagged reports.' });
  }
});

// Admin Moderation Route: Resolve/dismiss a flagged report
app.post('/api/admin/flagged-reports/:id/review', requireAuth, async (req, res) => {
  try {
    const adminEmails = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
    const isAdmin = req.user.role === 'admin' || adminEmails.includes((req.user.email || '').toLowerCase());
    if (!isAdmin) {
      return res.status(403).json({ error: 'Administrative privileges required.' });
    }

    const { action, notes } = req.body; // 'dismiss' | 'confirm'
    const { id } = req.params;
    const firebaseService = require('./services/firebaseService');

    await firebaseService.updateDoc('items', id, {
      isFlagged: action === 'confirm',
      moderationStatus: action === 'dismiss' ? 'dismissed' : 'flagged_confirmed',
      moderatedAt: new Date().toISOString(),
      moderatedBy: req.user.email,
      moderatorNotes: notes || ''
    });

    res.json({ success: true, message: `Report review status updated (${action}).` });
  } catch (err) {
    console.error('[Admin] Review report error:', err);
    res.status(500).json({ error: 'Failed to update report status.' });
  }
});

// ---- SPA fallback: serve index.html for unmatched routes ----
app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'Endpoint not found' });
  }
  const htmlPath = path.join(__dirname, '..', 'public', req.path);
  res.sendFile(htmlPath, (err) => {
    if (err) {
      res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
    }
  });
});

// ---- Global error handler ----
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  const status = err.status || 500;
  const message = status === 503 
    ? 'Service is temporarily unavailable. Please try again later.' 
    : (err.message || 'An error occurred. Please try again later.');
  res.status(status).json({
    error: message
  });
});

// ---- Start Server ----
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`\nLostLink Server running on http://localhost:${PORT}`);
    console.log(`  Environment: ${process.env.NODE_ENV || 'development'}\n`);
  });
}

module.exports = app;

