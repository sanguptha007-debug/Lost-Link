/**
 * LostLink — User Routes
 * Profile setup & management for VIT students
 */

const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/authMiddleware');
const firebaseService = require('../services/firebaseService');

// Complete profile setup after Google Sign-In
router.post('/profile-setup', requireAuth, async (req, res) => {
  try {
    const { name, phone, registrationNumber } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Please enter your name.' });
    }

    if (!phone || !phone.trim()) {
      return res.status(400).json({ error: 'Phone number is mandatory.' });
    }

    const cleanPhone = phone.trim().replace(/[\s-]/g, '');
    if (!/^[+]?[0-9]{10,15}$/.test(cleanPhone)) {
      return res.status(400).json({ error: 'Please provide a valid 10-digit phone number.' });
    }

    if (!registrationNumber || !registrationNumber.trim()) {
      return res.status(400).json({ error: 'Registration number is required.' });
    }

    const cleanRegNo = registrationNumber.trim().toUpperCase();

    const now = new Date().toISOString();
    const existing = await firebaseService.getDoc('users', req.user.uid);

    const userData = {
      uid: req.user.uid,
      name: name.trim(),
      email: req.user.email,
      phone: cleanPhone,
      registrationNumber: cleanRegNo,
      role: existing?.role || 'student',
      profileComplete: true,
      updatedAt: now,
      createdAt: existing?.createdAt || now
    };

    await firebaseService.setDoc('users', req.user.uid, userData);

    res.status(201).json({
      success: true,
      user: userData,
      message: 'Profile setup completed.'
    });
  } catch (err) {
    console.error('[Users] Profile setup error:', err);
    res.status(err.status || 500).json({ error: err.message || 'Failed to complete profile.' });
  }
});

// Get own profile
router.get('/profile', requireAuth, async (req, res) => {
  try {
    const user = await firebaseService.getDoc('users', req.user.uid);

    if (!user) {
      return res.json({
        success: true,
        user: {
          uid: req.user.uid,
          name: req.user.name || '',
          email: req.user.email || '',
          role: req.user.role || 'student',
          profileComplete: false
        }
      });
    }

    res.json({ success: true, user });
  } catch (err) {
    console.error('[Users] Get profile error:', err);
    res.status(err.status || 500).json({ error: err.message || 'Failed to fetch profile.' });
  }
});

// Update profile
router.put('/profile', requireAuth, async (req, res) => {
  try {
    const updates = {};
    const allowedFields = ['name', 'phone', 'registrationNumber'];

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field].trim();
      }
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No valid fields provided.' });
    }

    if (updates.phone) {
      const cleanPhone = updates.phone.replace(/[\s-]/g, '');
      if (!/^[+]?[0-9]{10,15}$/.test(cleanPhone)) {
        return res.status(400).json({ error: 'Invalid phone number.' });
      }
      updates.phone = cleanPhone;
    }

    if (updates.registrationNumber) {
      updates.registrationNumber = updates.registrationNumber.toUpperCase();
    }

    updates.updatedAt = new Date().toISOString();

    await firebaseService.updateDoc('users', req.user.uid, updates);

    res.json({ success: true, message: 'Profile updated.', updates });
  } catch (err) {
    console.error('[Users] Update profile error:', err);
    res.status(err.status || 500).json({ error: err.message || 'Failed to update profile.' });
  }
});

module.exports = router;
