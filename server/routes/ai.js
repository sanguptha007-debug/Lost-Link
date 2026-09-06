/**
 * LostLink — AI Routes
 * Campus Assistant and Natural-Language Description Analysis
 */

const express = require('express');
const router = express.Router();
const { optionalAuth } = require('../middleware/authMiddleware');
const geminiService = require('../services/geminiService');
const matchingService = require('../services/matchingService');

// Analyze description
router.post('/analyze-description', optionalAuth, async (req, res) => {
  try {
    const { description, location, color } = req.body;

    if (!description || description.trim().length < 3) {
      return res.status(400).json({ error: 'Please provide a description.' });
    }

    const analysis = await geminiService.analyzeDescription(description, {
      location,
      color
    });

    res.json({ success: true, analysis });
  } catch (err) {
    console.error('[AI] Analyze error:', err);
    res.status(err.status || 500).json({ error: 'Service is temporarily unavailable. Please try again later.' });
  }
});

// Assistant chat
router.post('/assistant', optionalAuth, async (req, res) => {
  try {
    const { message, history = [] } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'Please provide a message.' });
    }

    // Callback to search real Firestore found reports
    const searchFoundCallback = async (queryText) => {
      const searchRes = await matchingService.searchByDescription(queryText, {
        limit: 5
      });
      return searchRes.matches || [];
    };

    const chatResult = await geminiService.assistantChat(
      message.trim(),
      history,
      searchFoundCallback
    );

    res.json({
      success: true,
      response: chatResult.reply,
      items: chatResult.matchingItems || []
    });
  } catch (err) {
    console.error('[AI] Assistant error:', err);
    res.json({
      success: true,
      response: "AI matching is temporarily unavailable. Showing results based on available information. You can use Find My Item to search all active reports.",
      items: []
    });
  }
});

module.exports = router;
