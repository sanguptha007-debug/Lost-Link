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
  res.json({
    status: 'ok',
    service: 'LostLink API',
    version: '2.0.0',
    timestamp: new Date().toISOString()
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

app.use('/api/ai', aiRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/matches', matchesRoutes);
app.use('/api/contact', contactRoutes);
app.use('/api/users', usersRoutes);

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

