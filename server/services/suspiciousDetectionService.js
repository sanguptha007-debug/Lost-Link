/**
 * LostLink — Suspicious / Fake Report Detection Service
 * Analyzes report submission signals for potential spam, flood, or suspicious behavior.
 * Uses transparent, deterministic risk factors rather than black-box banning.
 * Flags reports for administrative review without automatically penalizing students.
 */

// Common gibberish or spam keyboard smash patterns
const GIBBERISH_PATTERNS = [
  /^[a-z]{1,4}$/i,
  /(.)\1{4,}/,               // 5+ repeated characters like aaaaaa
  /^(asdf|qwerty|zxcv|1234|test|fake|spam|random)/i,
  /^[b-df-hj-np-tv-z]{6,}$/i // 6+ consecutive consonants without vowel
];

/**
 * Assess a report submission for suspicious signals
 * @param {Object} report - { title, description, location, userId }
 * @param {Array} userRecentReports - Recent reports created by this user
 * @returns {{ isFlagged: boolean, riskScore: number, riskFlags: string[] }}
 */
function assessSuspiciousReport(report, userRecentReports = []) {
  const flags = [];
  let score = 0;

  const desc = (report.description || '').trim();
  const title = (report.title || '').trim();

  // 1. Extremely short or low-detail description (< 8 characters)
  if (desc.length < 8) {
    flags.push('extremely_short_description');
    score += 30;
  }

  // 2. Gibberish or keyboard-smash patterns
  for (const pattern of GIBBERISH_PATTERNS) {
    if (pattern.test(desc) || pattern.test(title)) {
      flags.push('repetitive_or_gibberish_text');
      score += 40;
      break;
    }
  }

  // 3. Rapid submission frequency (flood protection)
  // If user submitted 3 or more reports in the last 10 minutes
  const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
  const recentSubmissions = userRecentReports.filter(r => {
    const createdTime = new Date(r.createdAt || 0).getTime();
    return createdTime > tenMinutesAgo;
  });

  if (recentSubmissions.length >= 3) {
    flags.push('rapid_submission_frequency');
    score += 40;
  } else if (recentSubmissions.length >= 2) {
    flags.push('elevated_submission_frequency');
    score += 20;
  }

  // 4. Repeated exact description within user history
  const duplicateDescMatch = userRecentReports.find(r => 
    (r.description || '').trim().toLowerCase() === desc.toLowerCase()
  );
  if (duplicateDescMatch) {
    flags.push('repeated_identical_description');
    score += 25;
  }

  // Normalized risk score between 0 and 100
  const normalizedScore = Math.min(100, Math.max(0, score));
  const isFlagged = normalizedScore >= 50;

  return {
    isFlagged,
    riskScore: normalizedScore,
    riskFlags: flags
  };
}

module.exports = {
  assessSuspiciousReport
};
