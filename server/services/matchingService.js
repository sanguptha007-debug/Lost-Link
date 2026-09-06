/**
 * LostLink — Matching Service
 * Dual-layer search engine:
 * Layer 1: Deterministic tokenization & synonym matching from real Firestore records (Works 100% WITHOUT AI).
 * Layer 2: Optional AI semantic understanding & multimodal photo verification (when AI key is configured).
 *
 * Zero fabricated items, zero fake scores.
 */

const geminiService = require('./geminiService');
const firebaseService = require('./firebaseService');
const supabaseStorageService = require('./supabaseStorageService');

const STOP_WORDS = new Set([
  'i', 'me', 'my', 'myself', 'we', 'our', 'ours', 'you', 'your', 'he', 'him', 'his', 'she', 'her',
  'it', 'its', 'they', 'them', 'their', 'what', 'which', 'who', 'whom', 'this', 'that', 'these', 'those',
  'am', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'having', 'do', 'does',
  'did', 'doing', 'a', 'an', 'the', 'and', 'but', 'if', 'or', 'because', 'as', 'until', 'while', 'of',
  'at', 'by', 'for', 'with', 'about', 'against', 'between', 'into', 'through', 'during', 'before', 'after',
  'above', 'below', 'to', 'from', 'up', 'down', 'in', 'out', 'on', 'off', 'over', 'under', 'again',
  'further', 'then', 'once', 'here', 'there', 'when', 'where', 'why', 'how', 'all', 'any', 'both', 'each',
  'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than',
  'too', 'very', 'can', 'will', 'just', 'should', 'now', 'lost', 'found', 'find', 'looking', 'someone',
  'someones', 'anyone', 'did', 'please', 'help', 'near', 'around', 'somewhere', 'yesterday', 'today',
  'tomorrow', 'morning', 'afternoon', 'evening', 'night', 'recently', 'last', 'past', 'day', 'week', 'pm', 'am'
]);

const SYNONYMS = {
  'purse': ['handbag', 'bag', 'clutch', 'tote', 'wallet', 'pouch'],
  'handbag': ['purse', 'bag', 'tote', 'clutch'],
  'bag': ['backpack', 'handbag', 'purse', 'tote', 'sack', 'kit'],
  'backpack': ['bag', 'rucksack', 'knapsack'],
  'phone': ['mobile', 'iphone', 'android', 'smartphone', 'cellphone', 'samsung', 'galaxy'],
  'mobile': ['phone', 'smartphone', 'iphone', 'android', 'samsung', 'galaxy'],
  'smartphone': ['phone', 'mobile', 'android', 'iphone', 'samsung'],
  'samsung': ['galaxy', 'phone', 'smartphone', 'mobile', 'android'],
  'galaxy': ['samsung', 'phone', 'smartphone'],
  'earbuds': ['earphones', 'headphones', 'airpods', 'buds', 'tws', 'pods'],
  'earphones': ['earbuds', 'headphones', 'airpods', 'pods'],
  'airpods': ['earbuds', 'earphones', 'headphones', 'pods'],
  'pods': ['airpods', 'earbuds', 'earphones'],
  'headphones': ['earphones', 'earbuds', 'headset'],
  'bottle': ['flask', 'sipper', 'tumbler', 'milton'],
  'flask': ['bottle', 'tumbler'],
  'calculator': ['calc', 'casio', 'scientific'],
  'id': ['idcard', 'card', 'identity', 'badge', 'tag'],
  'idcard': ['id', 'card', 'identity', 'badge'],
  'card': ['id', 'idcard', 'atm', 'debit', 'credit'],
  'specs': ['spectacles', 'glasses', 'sunglasses'],
  'spectacles': ['specs', 'glasses', 'sunglasses'],
  'glasses': ['spectacles', 'specs', 'sunglasses'],
  'watch': ['smartwatch', 'wrist', 'timepiece', 'fastrack'],
  'smartwatch': ['watch', 'band', 'fitbit'],
  'keys': ['key', 'keychain', 'ring'],
  'key': ['keys', 'keychain'],
  'keychain': ['keys', 'key'],
  'umbrella': ['parasol', 'raincoat'],
  'charger': ['cable', 'adapter', 'charging', 'cord', 'wire', 'typec', 'type-c'],
  'cable': ['charger', 'wire', 'cord', 'lead', 'typec', 'type-c'],
  'wire': ['cable', 'cord', 'charger'],
  'cord': ['cable', 'wire', 'charger'],
  'box': ['container', 'case', 'tin'],
  'case': ['box', 'cover'],
  'wallet': ['purse', 'billfold', 'pouch'],
  'laptop': ['notebook', 'macbook', 'dell', 'hp', 'lenovo']
};

const CAMPUS_LOCATIONS = [
  'sjt', 'tt', 'prp', 'smv', 'mb', 'gdn', 'library', 'foodys', 'canteen', 'gazebo',
  'anna auditorium', 'cdmm', 'enquiry', 'main gate', 'gate 1', 'gate 2', 'gate 3',
  'balaji', 'all mart', 'dominos', 'swimming pool', 'ground', 'gym'
];

const COLORS = [
  'black', 'blue', 'red', 'green', 'white', 'yellow', 'silver', 'gold',
  'pink', 'purple', 'grey', 'gray', 'brown', 'orange', 'maroon', 'navy', 'beige'
];

/**
 * Tokenize and normalize search text into keywords, substantive item nouns, colors, locations, and synonyms
 */
function extractSearchTokens(text) {
  if (!text) return { tokens: [], synonyms: [], colors: [], locations: [], itemNouns: [] };

  const clean = text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ');
  const words = clean.split(/\s+/).filter(w => w.length > 1);

  const tokens = [];
  const synonyms = new Set();
  const colors = [];
  const locations = [];
  const itemNouns = [];

  for (const w of words) {
    let isCategoryWord = false;

    if (COLORS.includes(w)) {
      colors.push(w);
      isCategoryWord = true;
    }
    if (CAMPUS_LOCATIONS.includes(w)) {
      locations.push(w);
      isCategoryWord = true;
    }

    if (!STOP_WORDS.has(w)) {
      tokens.push(w);
      if (SYNONYMS[w]) {
        SYNONYMS[w].forEach(syn => synonyms.add(syn));
      }
      if (!isCategoryWord) {
        itemNouns.push(w);
      }
    }
  }

  return {
    tokens: Array.from(new Set(tokens)),
    synonyms: Array.from(synonyms),
    colors: Array.from(new Set(colors)),
    locations: Array.from(new Set(locations)),
    itemNouns: Array.from(new Set(itemNouns))
  };
}

/**
 * Evaluate deterministic match score of a real found report against search tokens
 * Returns 0 if item does not meaningfully match
 */
function scoreItemDeterministically(item, searchData, explicitFilters = {}) {
  const itemTitle = (item.title || '').toLowerCase();
  const itemDesc = (item.description || '').toLowerCase();
  const itemLoc = (item.location || '').toLowerCase();
  const itemCol = (item.color || '').toLowerCase();

  const combinedText = `${itemTitle} ${itemDesc}`;

  let score = 0;
  let matchReasons = [];
  let directNounMatches = 0;
  let synonymNounMatches = 0;

  // 1. Direct item noun matches
  for (const noun of searchData.itemNouns) {
    if (itemTitle.includes(noun)) {
      score += 40;
      directNounMatches++;
      matchReasons.push(`Title mentions "${noun}"`);
    } else if (itemDesc.includes(noun)) {
      score += 25;
      directNounMatches++;
      matchReasons.push(`Description mentions "${noun}"`);
    }
  }

  // 2. Synonym matches for item nouns
  for (const syn of searchData.synonyms) {
    if (itemTitle.includes(syn) || itemDesc.includes(syn)) {
      score += 25;
      synonymNounMatches++;
      matchReasons.push(`Matches related item "${syn}"`);
    }
  }

  // CRITICAL RULE: If the search query specified substantive item nouns (e.g. "purse", "calculator", "phone"),
  // but this candidate item matched NONE of those nouns or synonyms, it is an unrelated item (e.g. "Black Box" is not a "black purse").
  if (searchData.itemNouns.length > 0 && directNounMatches === 0 && synonymNounMatches === 0) {
    return { score: 0, reason: '', descriptionMatch: 'None' };
  }

  // 3. Color matching
  const targetColor = (explicitFilters.color || (searchData.colors[0] || '')).toLowerCase();
  if (targetColor) {
    if (itemCol.includes(targetColor) || combinedText.includes(targetColor)) {
      score += 25;
      matchReasons.push(`Matches colour "${targetColor}"`);
    }
  }

  // 4. Location matching
  const targetLoc = (explicitFilters.location || (searchData.locations[0] || '')).toLowerCase();
  if (targetLoc) {
    if (itemLoc.includes(targetLoc) || combinedText.includes(targetLoc)) {
      score += 25;
      matchReasons.push(`Found near reported area "${targetLoc}"`);
    }
  }

  // 5. Date matching
  if (explicitFilters.date && item.date === explicitFilters.date) {
    score += 15;
    matchReasons.push('Reported on matching date');
  }

  // If total score < 20, item is not relevant
  if (score < 20) {
    return { score: 0, reason: '', descriptionMatch: 'None' };
  }

  const finalScore = Math.min(95, Math.max(30, score));
  const descriptionMatch = finalScore >= 75 ? 'Strong' : (finalScore >= 50 ? 'Moderate' : 'Weak');
  const reasonText = matchReasons.length > 0 ? matchReasons.join('. ') + '.' : 'Semantic description corresponds to your report.';

  return {
    score: finalScore,
    reason: reasonText,
    descriptionMatch
  };
}

/**
 * Search for matching found items given an owner's natural-language description
 * Basic search works 100% WITHOUT requiring Gemini or Groq.
 */
async function searchByDescription(queryText, options = {}) {
  const { filters = {}, userId = null, limit = 20, ownerPhoto = null } = options;

  if (!queryText || !queryText.trim()) {
    return { matches: [], analysis: null, count: 0 };
  }

  const cleanQuery = queryText.trim();
  const searchTokens = extractSearchTokens(cleanQuery);

  // Retrieve active found reports from Firestore
  let allFound = [];
  try {
    allFound = await firebaseService.queryDocs('items', { type: 'found' }, 'createdAt', 60);
  } catch (err) {
    console.error('[MatchingService] Error querying candidate reports:', err.message);
    allFound = [];
  }

  // Filter out resolved, closed, or returned items
  // NOTE: In public campus search, do NOT filter out userId, so students can find all active campus reports
  let activeCandidates = allFound.filter(item => {
    if (item.status === 'resolved' || item.status === 'closed' || item.currentStatus === 'returned_to_owner') {
      return false;
    }
    return true;
  });

  // Apply optional hard filters if specified by student
  if (filters.location) {
    const locLower = filters.location.toLowerCase();
    activeCandidates = activeCandidates.filter(item => (item.location || '').toLowerCase().includes(locLower));
  }
  if (filters.color) {
    const colLower = filters.color.toLowerCase();
    activeCandidates = activeCandidates.filter(item => (item.color || '').toLowerCase().includes(colLower));
  }
  if (filters.date) {
    activeCandidates = activeCandidates.filter(item => item.date === filters.date);
  }

  // Score all candidates deterministically first
  const deterministicMatches = [];
  for (const item of activeCandidates) {
    const scored = scoreItemDeterministically(item, searchTokens, filters);
    if (scored.score >= 20) {
      deterministicMatches.push({
        ...item,
        score: scored.score,
        descriptionMatch: scored.descriptionMatch,
        reason: scored.reason
      });
    }
  }

  // Sort deterministically by score descending
  deterministicMatches.sort((a, b) => b.score - a.score);

  let finalCandidates = deterministicMatches.slice(0, limit);

  // If deterministic matches exist, pass them to AI to refine/rank when available
  if (geminiService.isAvailable() && deterministicMatches.length > 0) {
    try {
      const lostQuery = {
        description: cleanQuery,
        location: filters.location || searchTokens.locations[0],
        date: filters.date,
        color: filters.color || searchTokens.colors[0]
      };
      const aiRanked = await geminiService.rankCandidates(lostQuery, deterministicMatches.slice(0, limit));
      if (Array.isArray(aiRanked)) {
        finalCandidates = aiRanked;
      }
    } catch (aiErr) {
      console.warn('[MatchingService] AI ranking skipped, using deterministic scores:', aiErr.message);
    }
  } else if (geminiService.isAvailable() && deterministicMatches.length === 0 && searchTokens.itemNouns.length === 0 && activeCandidates.length > 0) {
    // Only if no specific item noun was given (e.g. "I lost something near SJT"), allow AI to inspect active candidates
    try {
      const lostQuery = {
        description: cleanQuery,
        location: filters.location || searchTokens.locations[0],
        date: filters.date,
        color: filters.color || searchTokens.colors[0]
      };
      const aiRanked = await geminiService.rankCandidates(lostQuery, activeCandidates.slice(0, 10));
      if (Array.isArray(aiRanked)) {
        finalCandidates = aiRanked;
      }
    } catch (aiErr) {
      console.warn('[MatchingService] AI ranking skipped:', aiErr.message);
    }
  }

  // If no candidates matched, do NOT invent any fake results
  if (finalCandidates.length === 0) {
    return {
      matches: [],
      analysis: null,
      count: 0,
      message: 'Item not found yet. No matching found item has been reported yet.'
    };
  }

  // Handle owner photo if passed as a storagePath
  let resolvedOwnerPhoto = ownerPhoto;
  if (typeof ownerPhoto === 'string' && ownerPhoto.startsWith('items/')) {
    try {
      const buf = await supabaseStorageService.downloadPhotoBuffer(ownerPhoto);
      if (buf) resolvedOwnerPhoto = buf;
    } catch (e) {
      console.warn('[MatchingService] Error downloading owner photo buffer:', e.message);
    }
  }

  // Build final suggestions and generate short-lived signed URLs on demand
  const finalSuggestions = [];

  for (const item of finalCandidates) {
    let photoVerificationResult = null;
    let candidatePhotoBuffer = null;

    // Optional photo verification (only if both sides have photos)
    if (resolvedOwnerPhoto && item.storagePath) {
      try {
        candidatePhotoBuffer = await supabaseStorageService.downloadPhotoBuffer(item.storagePath);
      } catch (dlErr) {
        console.warn(`[MatchingService] Could not download photo buffer for candidate "${item.id}":`, dlErr.message);
      }

      if (candidatePhotoBuffer) {
        photoVerificationResult = await geminiService.verifyPhotos(resolvedOwnerPhoto, candidatePhotoBuffer);
      }
    } else if (resolvedOwnerPhoto && item.imageUrl && item.imageUrl.startsWith('data:image/')) {
      photoVerificationResult = await geminiService.verifyPhotos(resolvedOwnerPhoto, item.imageUrl);
    }

    let finalScore = item.score || 50;
    let finalReason = item.reason || 'Item description and location match your report.';
    let isConflicting = false;

    if (photoVerificationResult?.photoVerification === 'Inconsistent') {
      isConflicting = true;
      finalScore = Math.max(20, Math.round(finalScore * 0.65));
      finalReason = `Semantic description matches, but visual photo evidence conflicts: ${photoVerificationResult.photoReason}`;
    }

    // Generate short-lived signed URL for browser display
    let displayImageUrl = item.imageUrl || null;
    if (item.storagePath) {
      displayImageUrl = await supabaseStorageService.getSignedPhotoUrl(item.storagePath, 900) || displayImageUrl;
    }

    finalSuggestions.push({
      id: item.id,
      title: item.title || 'Found Item',
      description: item.description,
      location: item.location || 'Campus',
      date: item.date || item.createdAt,
      color: item.color || null,
      imageUrl: displayImageUrl,
      storagePath: item.storagePath || null,
      currentStatus: item.currentStatus || 'with_finder',
      securityDetails: item.securityDetails || '',
      status: item.status || 'active',
      score: finalScore,
      descriptionMatch: item.descriptionMatch || 'Moderate',
      photoVerification: photoVerificationResult?.photoVerification || null,
      photoReason: photoVerificationResult?.photoReason || null,
      conflictingEvidence: isConflicting,
      reason: finalReason
    });
  }

  // Re-sort in case score was adjusted by visual evidence
  finalSuggestions.sort((a, b) => b.score - a.score);

  return {
    matches: finalSuggestions,
    count: finalSuggestions.length,
    message: finalSuggestions.length === 0 ? 'Item not found yet. No matching found item has been reported yet.' : null
  };
}

/**
 * Find AI suggestions for an existing lost report
 */
async function findMatchesForItem(lostItem, options = {}) {
  const { limit = 10 } = options;

  let ownerPhotoInput = lostItem.imageUrl || null;
  if (lostItem.storagePath) {
    try {
      const downloaded = await supabaseStorageService.downloadPhotoBuffer(lostItem.storagePath);
      if (downloaded) {
        ownerPhotoInput = downloaded;
      }
    } catch (e) {
      console.warn('[MatchingService] Error downloading owner photo buffer:', e.message);
    }
  }

  return searchByDescription(lostItem.description, {
    filters: {
      location: lostItem.location,
      color: lostItem.color,
      date: lostItem.date
    },
    userId: lostItem.userId,
    ownerPhoto: ownerPhotoInput,
    limit
  });
}

/**
 * Bidirectional check: when a new Found Report is created, find matching active Lost Reports
 * @param {Object} foundItem
 * @returns {Promise<Array>} matching lost reports
 */
async function findMatchingLostReportsForFoundItem(foundItem) {
  if (!foundItem || !foundItem.description) return [];

  let activeLostReports = [];
  try {
    activeLostReports = await firebaseService.queryDocs('items', { type: 'lost', status: 'active' }, 'createdAt', 50);
  } catch (e) {
    console.error('[MatchingService] Error querying lost reports for bidirectional check:', e.message);
    return [];
  }

  const foundTokens = extractSearchTokens(`${foundItem.title || ''} ${foundItem.description} ${foundItem.color || ''}`);
  const matches = [];

  for (const lost of activeLostReports) {
    if (lost.id === foundItem.id || lost.userId === foundItem.userId) continue;

    const scored = scoreItemDeterministically(lost, foundTokens, {
      location: foundItem.location,
      color: foundItem.color,
      date: foundItem.date
    });

    if (scored.score >= 35) {
      matches.push({
        id: lost.id,
        title: lost.title,
        description: lost.description,
        location: lost.location,
        date: lost.date,
        color: lost.color,
        userId: lost.userId,
        score: scored.score,
        reason: scored.reason
      });
    }
  }

  return matches.sort((a, b) => b.score - a.score);
}

module.exports = {
  extractSearchTokens,
  scoreItemDeterministically,
  searchByDescription,
  findMatchesForItem,
  findMatchingLostReportsForFoundItem
};
