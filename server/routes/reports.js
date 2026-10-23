/**
 * LostLink — Reports Routes
 * CRUD operations for lost and found item reports
 * Uses standardized currentStatus and securityDetails fields. Zero category references.
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { requireAuth, optionalAuth } = require('../middleware/authMiddleware');
const firebaseService = require('../services/firebaseService');
const geminiService = require('../services/geminiService');
const supabaseStorageService = require('../services/supabaseStorageService');
const matchingService = require('../services/matchingService');
const duplicateDetectionService = require('../services/duplicateDetectionService');
const suspiciousDetectionService = require('../services/suspiciousDetectionService');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB max
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only image files (JPEG, PNG, WebP) up to 5 MB are allowed.'));
    }
  }
});

// Create a new report (lost or found)
router.post('/', requireAuth, upload.single('image'), async (req, res) => {
  let uploadedStoragePath = null;
  try {
    const {
      title,
      description,
      type,
      location,
      locationUnknown,
      date,
      time,
      color,
      currentStatus,
      securityDetails,
      confirmDuplicate
    } = req.body;

    if (!description || description.trim().length < 5) {
      return res.status(400).json({ error: 'Please provide a clear description (at least 5 characters).' });
    }
    if (!type || !['lost', 'found'].includes(type)) {
      return res.status(400).json({ error: 'Type must be "lost" or "found".' });
    }

    // 1. Duplicate Report Detection (unless user confirmed submission)
    if (confirmDuplicate !== 'true') {
      try {
        const existingReports = await firebaseService.queryDocs(
          'items',
          [{ field: 'type', op: '==', value: type }],
          'createdAt',
          'desc',
          50
        );
        const duplicateCheck = duplicateDetectionService.detectDuplicate({
          title,
          description,
          type,
          location,
          date,
          color,
          userId: req.user.uid
        }, existingReports);

        if (duplicateCheck.isDuplicate) {
          return res.status(409).json({
            error: 'A similar report has already been submitted on campus.',
            potentialDuplicate: true,
            similarity: duplicateCheck.similarity,
            matchedReport: duplicateCheck.matchedReport,
            matches: [duplicateCheck.matchedReport],
            message: 'A similar report has already been submitted on campus.'
          });
        }
      } catch (dupErr) {
        console.warn('[Reports] Duplicate check warning:', dupErr.message);
      }
    }

    // 2. Suspicious / Fake Report Signal Assessment
    let suspiciousResult = { isFlagged: false, riskScore: 0, riskFlags: [] };
    try {
      const userRecentReports = await firebaseService.queryDocs(
        'items',
        [{ field: 'userId', op: '==', value: req.user.uid }],
        'createdAt',
        'desc',
        10
      );
      suspiciousResult = suspiciousDetectionService.assessSuspiciousReport({
        title,
        description,
        location,
        userId: req.user.uid
      }, userRecentReports);
    } catch (suspErr) {
      console.warn('[Reports] Suspicious assessment warning:', suspErr.message);
    }

    // Handle optional image upload to Private Supabase Storage
    if (req.file) {
      if (!supabaseStorageService.isConfigured()) {
        return res.status(503).json({
          error: 'Photo storage is temporarily unavailable. Please submit without a photo or try again later.'
        });
      }

      try {
        const uploadResult = await supabaseStorageService.uploadItemPhoto(
          req.file.buffer,
          req.file.originalname,
          req.file.mimetype,
          req.user.uid
        );
        uploadedStoragePath = uploadResult.storagePath;
      } catch (uploadErr) {
        console.error('[Reports] Storage upload error:', uploadErr.message);
        return res.status(uploadErr.status || 400).json({
          error: uploadErr.message || 'Failed to upload photo.'
        });
      }
    }

    // Natural-language understanding of description
    let aiAnalysis = null;
    try {
      aiAnalysis = await geminiService.analyzeDescription(description, {
        location,
        color
      });
    } catch (aiErr) {
      console.error('[Reports] AI analysis error:', aiErr.message);
    }

    // Clean title
    let cleanTitle = (title && title.trim()) || aiAnalysis?.itemName || description.slice(0, 40).trim();

    const now = new Date().toISOString();

    // Standardized currentStatus validation for found items
    let validStatus = 'with_finder';
    if (type === 'found') {
      const allowed = ['at_found_location', 'with_finder', 'with_security', 'returned_to_owner'];
      if (currentStatus && allowed.includes(currentStatus)) {
        validStatus = currentStatus;
      }
    }

    const item = {
      userId: req.user.uid,
      userName: req.user.name || 'Student',
      userEmail: req.user.email,
      type,
      title: cleanTitle,
      description: description.trim(),
      location: locationUnknown === 'true' ? 'Exact location unknown' : (location || aiAnalysis?.location || 'Campus'),
      locationUnknown: locationUnknown === 'true',
      date: date || now.split('T')[0],
      time: time || null,
      color: color || aiAnalysis?.color || null,
      storagePath: uploadedStoragePath,
      status: validStatus === 'returned_to_owner' ? 'resolved' : 'active',
      isFlagged: suspiciousResult.isFlagged,
      riskScore: suspiciousResult.riskScore,
      riskFlags: suspiciousResult.riskFlags,
      ...(type === 'found' ? {
        currentStatus: validStatus,
        securityDetails: validStatus === 'with_security' ? (securityDetails || '').trim() : ''
      } : {}),
      createdAt: now,
      updatedAt: now
    };

    // Save to Firestore with Transaction Rollback on failure
    let saved = null;
    try {
      saved = await firebaseService.addDoc('items', item);
    } catch (dbErr) {
      if (uploadedStoragePath) {
        console.warn('[Reports] Rolling back uploaded Supabase photo due to Firestore write failure:', uploadedStoragePath);
        await supabaseStorageService.deleteItemPhoto(uploadedStoragePath).catch(() => {});
      }
      throw dbErr;
    }

    // Generate short-lived signed URL for immediate browser response if photo was uploaded
    let displayImageUrl = null;
    if (uploadedStoragePath) {
      displayImageUrl = await supabaseStorageService.getSignedPhotoUrl(uploadedStoragePath, 900);
    }

    // Bidirectional matching check:
    // If Lost Report submitted: find existing matching found reports
    // If Found Report submitted: check for existing matching lost reports
    let potentialMatches = [];
    try {
      if (type === 'lost') {
        const matchRes = await matchingService.findMatchesForItem(saved, { limit: 5 });
        potentialMatches = matchRes.matches || [];
      } else {
        potentialMatches = await matchingService.findMatchingLostReportsForFoundItem(saved);
      }

      // Generate Match Notifications for matching report owners (score >= 60)
      for (const match of potentialMatches) {
        const matchScore = Math.round(match.score || 0);
        if (matchScore >= 60 && match.userId && match.userId !== req.user.uid) {
          const deduplicationKey = [saved.id, match.id].sort().join('_');
          try {
            const existingNotifs = await firebaseService.queryDocs('notifications', [
              { field: 'reportPair', op: '==', value: deduplicationKey }
            ], null, null, 1);

            if (!existingNotifs || existingNotifs.length === 0) {
              await firebaseService.addDoc('notifications', {
                userId: match.userId,
                type: 'match',
                title: 'Potential Match Found',
                message: `A new ${saved.type} report "${saved.title}" at ${saved.location} matches your ${match.type} report with ${matchScore}% confidence.`,
                targetReportId: saved.id,
                sourceReportId: match.id,
                matchScore,
                reportPair: deduplicationKey,
                read: false,
                createdAt: now
              });
              console.log(`[Notifications] Created match notification for user ${match.userId} (pair: ${deduplicationKey})`);
            }
          } catch (notifErr) {
            console.warn('[Notifications] Error creating match notification:', notifErr.message);
          }
        }
      }
    } catch (mErr) {
      console.warn('[Reports] Matching check warning:', mErr.message);
    }

    res.status(201).json({
      success: true,
      item: {
        ...saved,
        imageUrl: displayImageUrl
      },
      matches: potentialMatches,
      message: type === 'lost' ? 'Lost item report created.' : 'Found item report created.'
    });
  } catch (err) {
    console.error('[Reports] Create report error:', err);
    res.status(err.status || 500).json({ error: err.message || 'Failed to create report.' });
  }
});

// Get reports (with filters)
router.get('/', optionalAuth, async (req, res) => {
  try {
    const { type, color, location, status, userId, limit = 50 } = req.query;

    const filters = {};
    if (type) filters.type = type;
    if (status) filters.status = status;
    if (userId) filters.userId = userId;

    let items = await firebaseService.queryDocs('items', filters, 'createdAt', parseInt(limit, 10));

    // Text filtering for location and color
    if (color) {
      const colLower = color.toLowerCase();
      items = items.filter(item => (item.color || '').toLowerCase().includes(colLower));
    }
    if (location) {
      const locLower = location.toLowerCase();
      items = items.filter(item => (item.location || '').toLowerCase().includes(locLower));
    }

    const sanitized = await Promise.all(items.map(async (item, idx) => {
      let resolvedUrl = item.imageUrl || null;
      // Optimized signed URL generation: only generate for the first 6 items in list views
      if (item.storagePath && idx < 6) {
        resolvedUrl = await supabaseStorageService.getSignedPhotoUrl(item.storagePath, 900) || resolvedUrl;
      }

      return {
        id: item.id,
        type: item.type,
        title: item.title,
        description: item.description,
        location: item.location,
        date: item.date,
        time: item.time,
        color: item.color,
        imageUrl: resolvedUrl,
        storagePath: item.storagePath || null,
        status: item.status,
        currentStatus: item.currentStatus || (item.type === 'found' ? 'with_finder' : undefined),
        securityDetails: item.securityDetails || '',
        createdAt: item.createdAt,
        isOwner: Boolean(req.user && (
          (item.userId && item.userId === req.user.uid) ||
          (item.uid && item.uid === req.user.uid) ||
          (item.userEmail && req.user.email && item.userEmail.toLowerCase() === req.user.email.toLowerCase()) ||
          (req.user.role === 'admin')
        ))
      };
    }));

    res.json({ success: true, items: sanitized, count: sanitized.length });
  } catch (err) {
    console.error('[Reports] Get reports error:', err);
    res.status(err.status || 500).json({ error: err.message || 'Failed to fetch reports.' });
  }
});

// Get single report (generates 15-minute signed URL on demand)
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const item = await firebaseService.getDoc('items', req.params.id);
    if (!item) {
      return res.status(404).json({ error: 'Report not found.' });
    }

    let resolvedUrl = item.imageUrl || null;
    if (item.storagePath) {
      resolvedUrl = await supabaseStorageService.getSignedPhotoUrl(item.storagePath, 900) || resolvedUrl;
    }

    const isOwner = Boolean(req.user && (
      (item.userId && item.userId === req.user.uid) ||
      (item.uid && item.uid === req.user.uid) ||
      (item.userEmail && req.user.email && item.userEmail.toLowerCase() === req.user.email.toLowerCase()) ||
      (req.user.role === 'admin')
    ));

    res.json({
      success: true,
      item: {
        ...item,
        imageUrl: resolvedUrl,
        userId: isOwner ? item.userId : undefined,
        userEmail: isOwner ? item.userEmail : undefined,
        isOwner
      }
    });
  } catch (err) {
    console.error('[Reports] Get report error:', err);
    res.status(err.status || 500).json({ error: err.message || 'Failed to fetch report.' });
  }
});

// Update own report or update possession status
router.put('/:id', requireAuth, async (req, res) => {
  try {
    const item = await firebaseService.getDoc('items', req.params.id);
    if (!item) {
      return res.status(404).json({ error: 'Report not found.' });
    }
    if (item.userId !== req.user.uid && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'You can only edit your own reports.' });
    }

    const updates = {};
    const allowedFields = [
      'title',
      'description',
      'location',
      'locationUnknown',
      'date',
      'time',
      'color',
      'status',
      'currentStatus',
      'securityDetails'
    ];

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    }

    // Validate report lifecycle status (active, resolved, closed)
    if (updates.status) {
      const validStatuses = ['active', 'resolved', 'closed'];
      if (!validStatuses.includes(updates.status)) {
        return res.status(400).json({ error: `status must be one of: ${validStatuses.join(', ')}` });
      }
    }

    // Validate physical item currentStatus for found items
    if (updates.currentStatus) {
      const validStatuses = ['at_found_location', 'with_finder', 'with_security', 'returned_to_owner'];
      if (!validStatuses.includes(updates.currentStatus)) {
        return res.status(400).json({ error: `currentStatus must be one of: ${validStatuses.join(', ')}` });
      }
      if (updates.currentStatus === 'returned_to_owner') {
        updates.status = 'resolved';
      }
      if (updates.currentStatus !== 'with_security') {
        updates.securityDetails = '';
      }
    }

    updates.updatedAt = new Date().toISOString();

    const updated = await firebaseService.updateDoc('items', req.params.id, updates);

    res.json({ success: true, item: updated, message: 'Report updated successfully.' });
  } catch (err) {
    console.error('[Reports] Update report error:', err);
    res.status(err.status || 500).json({ error: err.message || 'Failed to update report.' });
  }
});

// Delete own report and clean up corresponding Supabase photo
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const item = await firebaseService.getDoc('items', req.params.id);
    if (!item) {
      return res.status(404).json({ error: 'Report not found.' });
    }
    const isOwner = Boolean(
      (item.userId && item.userId === req.user.uid) ||
      (item.uid && item.uid === req.user.uid) ||
      (item.userEmail && req.user.email && item.userEmail.toLowerCase() === req.user.email.toLowerCase()) ||
      (req.user.role === 'admin')
    );

    if (!isOwner) {
      return res.status(403).json({ error: 'You can only delete your own reports.' });
    }

    // Clean up Supabase private photo if it exists
    if (item.storagePath) {
      console.log('[Reports] Cleaning up Supabase photo for deleted report:', item.storagePath);
      await supabaseStorageService.deleteItemPhoto(item.storagePath).catch(err => {
        console.warn('[Reports] Supabase photo cleanup warning:', err.message);
      });
    }

    await firebaseService.deleteDoc('items', req.params.id);

    res.json({ success: true, message: 'Report deleted.' });
  } catch (err) {
    console.error('[Reports] Delete report error:', err);
    res.status(err.status || 500).json({ error: err.message || 'Failed to delete report.' });
  }
});

module.exports = router;
