/**
 * LostLink — Notifications Routes
 * Serves real-time match notifications and unread badges to students.
 * Enforces strict user privacy (students can only access their own notifications).
 */

const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/authMiddleware');
const firebaseService = require('../services/firebaseService');

// Get all notifications for the authenticated user
router.get('/', requireAuth, async (req, res) => {
  try {
    const userId = req.user.uid;
    const notifications = await firebaseService.queryDocs(
      'notifications',
      [{ field: 'userId', op: '==', value: userId }],
      'createdAt',
      'desc',
      30
    );

    const unreadCount = notifications.filter(n => !n.read).length;

    res.json({
      success: true,
      notifications,
      unreadCount
    });
  } catch (err) {
    console.error('[Notifications] Fetch error:', err);
    res.status(500).json({ error: 'Failed to retrieve notifications.' });
  }
});

// Mark a single notification as read
router.post('/:id/read', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.uid;

    const notif = await firebaseService.getDoc('notifications', id);
    if (!notif) {
      return res.status(404).json({ error: 'Notification not found.' });
    }

    if (notif.userId !== userId) {
      return res.status(403).json({ error: 'Unauthorized to update this notification.' });
    }

    await firebaseService.updateDoc('notifications', id, {
      read: true,
      readAt: new Date().toISOString()
    });

    res.json({ success: true, message: 'Notification marked as read.' });
  } catch (err) {
    console.error('[Notifications] Mark read error:', err);
    res.status(500).json({ error: 'Failed to update notification.' });
  }
});

// Mark all user notifications as read
router.post('/read-all', requireAuth, async (req, res) => {
  try {
    const userId = req.user.uid;
    const unreadNotifs = await firebaseService.queryDocs(
      'notifications',
      [
        { field: 'userId', op: '==', value: userId },
        { field: 'read', op: '==', value: false }
      ],
      'createdAt',
      'desc',
      50
    );

    const now = new Date().toISOString();
    for (const notif of unreadNotifs) {
      await firebaseService.updateDoc('notifications', notif.id, {
        read: true,
        readAt: now
      }).catch(() => {});
    }

    res.json({ success: true, count: unreadNotifs.length });
  } catch (err) {
    console.error('[Notifications] Mark all read error:', err);
    res.status(500).json({ error: 'Failed to mark all as read.' });
  }
});

module.exports = router;
