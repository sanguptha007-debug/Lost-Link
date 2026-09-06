/**
 * LostLink — Matches Routes
 * Deterministic and AI-enhanced suggestions for lost items
 */

const express = require('express');
const router = express.Router();
const { optionalAuth } = require('../middleware/authMiddleware');
const firebaseService = require('../services/firebaseService');
const matchingService = require('../services/matchingService');

// Find suggestions for a natural language query or existing lost item
router.post('/find', optionalAuth, async (req, res) => {
  try {
    const { itemId, query, filters = {}, ownerPhoto = null } = req.body;
    const currentUserId = req.user ? req.user.uid : null;

    let result;

    if (itemId) {
      const item = await firebaseService.getDoc('items', itemId);
      if (!item) {
        return res.status(404).json({ error: 'Item not found.' });
      }
      result = await matchingService.findMatchesForItem(item, {
        limit: filters.limit || 20
      });
    } else if (query && query.trim()) {
      result = await matchingService.searchByDescription(query.trim(), {
        filters,
        userId: currentUserId,
        ownerPhoto,
        limit: filters.limit || 20
      });
    } else {
      return res.status(400).json({ error: 'Please provide a search description or item ID.' });
    }

    res.json({
      success: true,
      matches: result.matches || [],
      count: (result.matches || []).length,
      message: result.message || null
    });
  } catch (err) {
    console.error('[Matches] Find matches error:', err);
    res.status(err.status || 500).json({ error: err.message || 'Failed to retrieve suggestions.' });
  }
});

module.exports = router;
