/**
 * LostLink — Auth Middleware
 * Validates Firebase ID tokens on protected routes
 */

const firebaseService = require('../services/firebaseService');

async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required. Please sign in.' });
  }

  const token = authHeader.split('Bearer ')[1];
  if (!token) {
    return res.status(401).json({ error: 'Authentication required. Please sign in.' });
  }

  // Check if Firebase auth is available
  if (!firebaseService.isAvailable) {
    return res.status(503).json({ 
      error: firebaseService.initError || 'Authentication service is not configured.' 
    });
  }

  try {
    const decoded = await firebaseService.verifyToken(token);
    if (!decoded) {
      return res.status(401).json({ error: 'Invalid or expired authentication token.' });
    }

    // Strict server-side VIT email domain enforcement
    const userEmail = (decoded.email || '').toLowerCase().trim();
    if (!userEmail.endsWith('@vitstudent.ac.in')) {
      return res.status(403).json({
        error: 'Access restricted: Only valid VIT student accounts (@vitstudent.ac.in) are authorized.'
      });
    }

    // Attach user info to request
    req.user = {
      uid: decoded.uid,
      email: decoded.email,
      name: decoded.name || decoded.email?.split('@')[0] || 'User',
      emailVerified: decoded.email_verified || false
    };

    // Try to get profile from Firestore
    try {
      const profile = await firebaseService.getDoc('users', decoded.uid);
      if (profile) {
        req.user.name = profile.name || req.user.name;
        req.user.phone = profile.phone;
        req.user.role = profile.role || 'student';
        req.user.profileComplete = profile.profileComplete || false;
        req.user.registrationNumber = profile.registrationNumber;
      }
    } catch (profileErr) {
      console.warn('Profile lookup warning:', profileErr.message);
    }

    next();
  } catch (err) {
    console.error('Auth middleware error:', err.message);
    return res.status(401).json({ error: 'Authentication failed.' });
  }
}

async function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next();
  }

  const token = authHeader.split('Bearer ')[1];
  if (!token || !firebaseService.isAvailable) {
    return next();
  }

  try {
    const decoded = await firebaseService.verifyToken(token);
    if (decoded && (decoded.email || '').toLowerCase().trim().endsWith('@vitstudent.ac.in')) {
      req.user = {
        uid: decoded.uid,
        email: decoded.email,
        name: decoded.name || decoded.email?.split('@')[0] || 'User',
        emailVerified: decoded.email_verified || false
      };
    }
  } catch (e) {
    // Optional auth silently continues
  }
  next();
}

module.exports = { requireAuth, optionalAuth };
