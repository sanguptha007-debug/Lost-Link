/**
 * LostLink — Duplicate Report Detection Service
 * Evaluates whether an incoming lost or found report is a potential duplicate of an existing report.
 * Compares title, description, location, date, and color attributes.
 * Returns similarity score and the matched existing report if duplicate threshold is met.
 */

function tokenize(text) {
  if (!text || typeof text !== 'string') return [];
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2);
}

function calculateJaccardSimilarity(tokens1, tokens2) {
  if (!tokens1.length || !tokens2.length) return 0;
  const set1 = new Set(tokens1);
  const set2 = new Set(tokens2);
  let intersection = 0;
  for (const item of set1) {
    if (set2.has(item)) intersection++;
  }
  const union = new Set([...set1, ...set2]).size;
  return union === 0 ? 0 : intersection / union;
}

function normalizeLocation(loc) {
  if (!loc) return '';
  return loc.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Check if incoming report is a potential duplicate of existing reports
 * @param {Object} incoming - { title, description, type, location, date, color, userId }
 * @param {Array} existingReports - Array of existing item objects from database
 * @returns {{ isDuplicate: boolean, similarity: number, matchedReport: Object | null }}
 */
function detectDuplicate(incoming, existingReports = []) {
  if (!incoming || !incoming.description || !existingReports.length) {
    return { isDuplicate: false, similarity: 0, matchedReport: null };
  }

  const incomingType = incoming.type;
  const incomingTokens = tokenize(`${incoming.title || ''} ${incoming.description} ${incoming.color || ''}`);
  const incomingLoc = normalizeLocation(incoming.location);
  const incomingDate = incoming.date;

  let bestMatch = null;
  let highestScore = 0;

  for (const report of existingReports) {
    // Only compare reports of the SAME type (lost vs lost, found vs found)
    if (report.type !== incomingType) continue;
    // Don't flag resolved reports as duplicates
    if (report.status === 'resolved') continue;

    const reportTokens = tokenize(`${report.title || ''} ${report.description || ''} ${report.color || ''}`);
    const textSimilarity = calculateJaccardSimilarity(incomingTokens, reportTokens);

    let locationBonus = 0;
    const reportLoc = normalizeLocation(report.location);
    if (incomingLoc && reportLoc && (incomingLoc.includes(reportLoc) || reportLoc.includes(incomingLoc))) {
      locationBonus = 0.20;
    }

    let dateBonus = 0;
    if (incomingDate && report.date) {
      const diffMs = Math.abs(new Date(incomingDate) - new Date(report.date));
      const diffDays = diffMs / (1000 * 60 * 60 * 24);
      if (diffDays <= 2) dateBonus = 0.15;
      else if (diffDays <= 7) dateBonus = 0.08;
    }

    // Exact title match bonus
    let titleBonus = 0;
    if (incoming.title && report.title && incoming.title.trim().toLowerCase() === report.title.trim().toLowerCase()) {
      titleBonus = 0.20;
    }

    const totalScore = Math.min(1.0, textSimilarity * 0.5 + locationBonus + dateBonus + titleBonus);

    if (totalScore > highestScore) {
      highestScore = totalScore;
      bestMatch = report;
    }
  }

  // Threshold: 0.68 represents a strong probability of duplication
  const isDuplicate = highestScore >= 0.68 && bestMatch !== null;

  return {
    isDuplicate,
    similarity: Math.round(highestScore * 100),
    matchedReport: isDuplicate ? {
      id: bestMatch.id,
      title: bestMatch.title,
      location: bestMatch.location,
      date: bestMatch.date,
      createdAt: bestMatch.createdAt,
      type: bestMatch.type
    } : null
  };
}

module.exports = {
  detectDuplicate,
  calculateJaccardSimilarity
};
