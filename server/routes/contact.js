/**
 * LostLink — Contact Routes
 * Private contact exchange upon mutual acceptance
 */

const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/authMiddleware');
const firebaseService = require('../services/firebaseService');

// Send private contact inquiry
router.post('/request', requireAuth, async (req, res) => {
  try {
    const { itemId, toUserId, message } = req.body;

    if (!itemId) {
      return res.status(400).json({ error: 'Item ID is required.' });
    }

    const item = await firebaseService.getDoc('items', itemId);
    if (!item) {
      return res.status(404).json({ error: 'Item not found.' });
    }

    const recipientId = toUserId || item.userId;
    if (recipientId === req.user.uid) {
      return res.status(400).json({ error: 'Cannot send contact request to yourself.' });
    }

    // Check existing pending request
    try {
      const existing = await firebaseService.queryDocs('contactRequests', {
        fromUserId: req.user.uid,
        itemId,
        status: 'pending'
      });
      if (existing && existing.length > 0) {
        return res.status(400).json({ error: 'You already have a pending request for this item.' });
      }
    } catch (e) {}

    const now = new Date().toISOString();
    const request = {
      fromUserId: req.user.uid,
      fromUserName: req.user.name || 'Student',
      toUserId: recipientId,
      itemId,
      itemTitle: item.title,
      itemType: item.type,
      message: message || 'I believe this report may match what I lost.',
      status: 'pending',
      createdAt: now,
      updatedAt: now
    };

    const saved = await firebaseService.addDoc('contactRequests', request);

    res.status(201).json({
      success: true,
      request: saved,
      message: 'Contact request sent. The student has been notified.'
    });
  } catch (err) {
    console.error('[Contact] Create request error:', err);
    res.status(err.status || 500).json({ error: err.message || 'Failed to send contact request.' });
  }
});

// Get user's received and sent contact requests
router.get('/requests', requireAuth, async (req, res) => {
  try {
    const received = await firebaseService.queryDocs('contactRequests', { toUserId: req.user.uid });
    const sent = await firebaseService.queryDocs('contactRequests', { fromUserId: req.user.uid });

    const enrich = async (r) => {
      let fromUser = null;
      let toUser = null;
      try {
        fromUser = await firebaseService.getDoc('users', r.fromUserId);
        toUser = await firebaseService.getDoc('users', r.toUserId);
      } catch (e) {}

      return {
        ...r,
        fromUserName: fromUser?.name || r.fromUserName || 'Student',
        toUserName: toUser?.name || 'Student',
        contactInfo: r.status === 'accepted' ? {
          fromPhone: fromUser?.phone || null,
          fromEmail: fromUser?.email || null,
          fromRegNo: fromUser?.registrationNumber || null,
          toPhone: toUser?.phone || null,
          toEmail: toUser?.email || null,
          toRegNo: toUser?.registrationNumber || null
        } : null
      };
    };

    const enrichedReceived = await Promise.all(received.map(enrich));
    const enrichedSent = await Promise.all(sent.map(enrich));

    res.json({
      success: true,
      received: enrichedReceived,
      sent: enrichedSent
    });
  } catch (err) {
    console.error('[Contact] Get requests error:', err);
    res.status(err.status || 500).json({ error: err.message || 'Failed to fetch contact requests.' });
  }
});

// Accept or decline contact inquiry
router.put('/requests/:id', requireAuth, async (req, res) => {
  try {
    const { status } = req.body;
    const allowed = ['accepted', 'declined', 'resolved'];

    if (!allowed.includes(status)) {
      return res.status(400).json({ error: `Status must be one of: ${allowed.join(', ')}` });
    }

    const request = await firebaseService.getDoc('contactRequests', req.params.id);
    if (!request) {
      return res.status(404).json({ error: 'Contact request not found.' });
    }

    if (status !== 'resolved' && request.toUserId !== req.user.uid) {
      return res.status(403).json({ error: 'Only the recipient can accept or decline.' });
    }

    if (status === 'resolved' && request.fromUserId !== req.user.uid && request.toUserId !== req.user.uid) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    await firebaseService.updateDoc('contactRequests', req.params.id, {
      status,
      updatedAt: new Date().toISOString()
    });

    let contactInfo = null;
    if (status === 'accepted') {
      const fromUser = await firebaseService.getDoc('users', request.fromUserId);
      const toUser = await firebaseService.getDoc('users', request.toUserId);

      contactInfo = {
        requesterName: fromUser?.name || 'Student',
        requesterPhone: fromUser?.phone || null,
        requesterEmail: fromUser?.email || null,
        responderName: toUser?.name || 'Student',
        responderPhone: toUser?.phone || null,
        responderEmail: toUser?.email || null
      };
    }

    res.json({
      success: true,
      message: status === 'accepted' ? 'Contact request accepted.' : (status === 'declined' ? 'Request declined.' : 'Marked as resolved.'),
      contactInfo
    });
  } catch (err) {
    console.error('[Contact] Update request error:', err);
    res.status(err.status || 500).json({ error: err.message || 'Failed to update request.' });
  }
});

module.exports = router;
