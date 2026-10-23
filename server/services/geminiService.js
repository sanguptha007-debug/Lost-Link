/**
 * LostLink — AI Service
 * Supports Google Gemini API and Groq API.
 * Handles semantic description analysis, candidate ranking, multimodal photo verification,
 * and campus assistant chat with real Firestore records.
 * Zero emojis, zero fake records.
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');

let provider = 'none'; // 'gemini' | 'groq' | 'multi' | 'none'
let genAI = null;              // Tier 1: Primary Gemini
let tertiaryGenAI = null;      // Tier 4: Backup Gemini
let currentModelName = process.env.GEMINI_MODEL ? process.env.GEMINI_MODEL.trim() : 'gemini-3.6-flash';
let isConfigured = false;

const GEMINI_FALLBACK_MODELS = [
  (process.env.GEMINI_MODEL || 'gemini-3.6-flash').trim(),
  'gemini-1.5-flash',
  'gemini-1.5-pro'
].filter(Boolean);

function initAI() {
  // Tier 1: Primary Gemini Key
  if (process.env.GEMINI_API_KEY) {
    try {
      genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY.trim());
      currentModelName = process.env.GEMINI_MODEL ? process.env.GEMINI_MODEL.trim() : 'gemini-3.6-flash';
      console.log(`[AI Service] Tier 1 initialized (Primary Gemini): ${currentModelName}`);
    } catch (err) {
      console.error('[AI Service] Primary Gemini init error:', err.message);
    }
  }

  // Tier 2: Groq Cloud Key 1 / OpenAI Compatible Key
  if (process.env.GROQ_API_KEY || process.env.OPENAI_API_KEY) {
    console.log('[AI Service] Tier 2 initialized (Groq Cloud Primary / OpenAI)');
  }

  // Tier 3: Groq Cloud Key 2 (if configured)
  if (process.env.GROQ_API_KEY2) {
    console.log('[AI Service] Tier 3 initialized (Groq Cloud Secondary)');
  }

  // Tier 4: Backup Gemini Key
  const backupKey = (process.env.GEMINI_API_KEY_BACKUP || process.env.AI_KEY_TERTIARY || '').trim();
  if (backupKey) {
    try {
      tertiaryGenAI = new GoogleGenerativeAI(backupKey);
      console.log('[AI Service] Tier 4 initialized (Backup Gemini)');
    } catch (err) {
      console.error('[AI Service] Backup Gemini init error:', err.message);
    }
  }

  isConfigured = Boolean(genAI || process.env.GROQ_API_KEY || process.env.GROQ_API_KEY2 || process.env.OPENAI_API_KEY || tertiaryGenAI);
  provider = isConfigured ? 'multi' : 'none';
  console.log('[AI Service] Multi-Provider Fallback Ready:', {
    tier1_primary_gemini: Boolean(genAI),
    tier2_groq_primary: Boolean(process.env.GROQ_API_KEY || process.env.OPENAI_API_KEY),
    tier3_groq_secondary: Boolean(process.env.GROQ_API_KEY2),
    tier4_backup_gemini: Boolean(tertiaryGenAI)
  });
}

initAI();

function parseAIJSON(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (e) {
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[1].trim());
      } catch (e2) {}
    }
    const braceMatch = text.match(/\{[\s\S]*\}/);
    if (braceMatch) {
      try {
        return JSON.parse(braceMatch[0]);
      } catch (e3) {}
    }
    const bracketMatch = text.match(/\[[\s\S]*\]/);
    if (bracketMatch) {
      try {
        return JSON.parse(bracketMatch[0]);
      } catch (e4) {}
    }
  }
  return null;
}

/**
 * Execute Gemini call with bounded timeout and fast failover on quota exhaustion
 */
async function callGeminiClient(clientInstance, promptOrParts, timeoutMs = 3500) {
  if (!clientInstance) throw new Error('Gemini client not initialized');

  const modelsToTry = Array.from(new Set([
    (process.env.GEMINI_MODEL || 'gemini-3.6-flash').trim(),
    ...GEMINI_FALLBACK_MODELS
  ])).slice(0, 2);

  let lastErr = null;

  for (const mName of modelsToTry) {
    try {
      const activeModel = clientInstance.getGenerativeModel({ model: mName });
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Gemini model "${mName}" timed out after ${timeoutMs}ms`)), timeoutMs)
      );

      const result = await Promise.race([
        activeModel.generateContent(promptOrParts),
        timeoutPromise
      ]);

      currentModelName = mName;
      const text = result?.response?.text();
      if (typeof text === 'string' && text.trim().length > 0) {
        return text.trim();
      }
      throw new Error(`Gemini model "${mName}" returned an empty response`);
    } catch (err) {
      lastErr = err;
      console.warn(`[AI Service] Gemini model "${mName}" notice: ${err.message.slice(0, 80)}`);
      // If 429 quota exhausted or auth invalid (401/403), the ENTIRE key/project is exhausted.
      // Immediately abort model iteration to avoid wasting time; escalate to the next provider!
      if (err.message && (
        err.message.includes('429') ||
        err.message.includes('Quota') ||
        err.message.includes('quota') ||
        err.message.includes('ResourceExhausted') ||
        err.message.includes('RESOURCE_EXHAUSTED') ||
        err.message.includes('API_KEY_INVALID') ||
        err.message.includes('API key not valid') ||
        err.message.includes('401') ||
        err.message.includes('403')
      )) {
        break;
      }
    }
  }

  throw lastErr;
}

/**
 * Call Groq / OpenAI compatible Chat Completion API
 */
async function callGroqChat(messages, maxTokens = 1000, timeoutMs = 3500, specificApiKey = null) {
  const apiKey = (specificApiKey || process.env.GROQ_API_KEY || process.env.OPENAI_API_KEY || '').trim();
  if (!apiKey) throw new Error('Groq/OpenAI API key is not configured');

  const isGroq = apiKey.startsWith('gsk_') || Boolean(process.env.GROQ_API_KEY);
  const endpoint = isGroq ? 'https://api.groq.com/openai/v1/chat/completions' : 'https://api.openai.com/v1/chat/completions';

  // Supported Groq models with auto-fallback (prioritizing active models on this account)
  const candidateModels = isGroq
    ? Array.from(new Set([
        (process.env.GROQ_MODEL || '').trim(),
        'qwen/qwen3.8-27b',
        'openai/gpt-oss-20b'
      ])).filter(Boolean)
    : [process.env.OPENAI_MODEL, 'gpt-4o-mini'].filter(Boolean);

  let lastError = null;

  for (const model of candidateModels) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: 0.2,
          max_tokens: maxTokens
        })
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        // If 404 model not found, try next candidate model
        if (res.status === 404) {
          lastError = new Error(`Model ${model} not available on Groq (HTTP 404)`);
          continue;
        }
        throw new Error(`Chat API error (${res.status}): ${errText.slice(0, 100)}`);
      }

      const data = await res.json();
      const content = data?.choices?.[0]?.message?.content;
      if (typeof content === 'string' && content.trim().length > 0) {
        return {
          text: content.trim(),
          model
        };
      }
      throw new Error('Chat API returned an empty completion content');
    } catch (err) {
      clearTimeout(timeoutId);
      lastError = err;
      // If 429 quota or 401/403 auth error or abort timeout, do not retry other models with the same key
      if (err.message && (err.message.includes('401') || err.message.includes('403') || err.message.includes('429') || err.name === 'AbortError')) {
        throw err;
      }
    }
  }

  throw lastError || new Error('All candidate chat models failed');
}

/**
 * Multi-Provider Sequential Fallback Prompt Runner:
 * 1. Tier 1: Primary Gemini (GEMINI_API_KEY)
 * 2. Tier 2: Groq Cloud Primary (GROQ_API_KEY / OPENAI_API_KEY)
 * 3. Tier 3: Groq Cloud Secondary (GROQ_API_KEY2, if provided)
 * 4. Tier 4: Backup Gemini (GEMINI_API_KEY_BACKUP / AI_KEY_TERTIARY)
 * 
 * Supports returnMeta = true to return { text, provider, tier }
 */
async function runAIPrompt(prompt, systemInstruction = '', returnMeta = false) {
  if (!isConfigured) {
    throw new Error('No AI providers configured in server environment.');
  }

  const fullPrompt = systemInstruction ? `${systemInstruction}\n\n${prompt}` : prompt;
  const messages = [];
  if (systemInstruction) {
    messages.push({ role: 'system', content: systemInstruction });
  }
  messages.push({ role: 'user', content: prompt });

  const errors = [];

  // TIER 1: Primary Gemini
  if (genAI) {
    try {
      const res = await callGeminiClient(genAI, fullPrompt, 3500);
      if (res) {
        return returnMeta
          ? { text: res, provider: `Google Gemini (${currentModelName})`, tier: 1 }
          : res;
      }
    } catch (err1) {
      console.warn(`[AI Fallback] Tier 1 (Primary Gemini) unavailable: ${err1.message.slice(0, 80)}. Escalating to Tier 2...`);
      errors.push(`Tier 1: ${err1.message.slice(0, 60)}`);
    }
  }

  // TIER 2: Groq Cloud Primary (or OpenAI)
  const groqKey1 = (process.env.GROQ_API_KEY || process.env.OPENAI_API_KEY || '').trim();
  if (groqKey1) {
    try {
      const res = await callGroqChat(messages, 1000, 3500, groqKey1);
      if (res && res.text) {
        console.log(`[AI Fallback] Tier 2 (Groq Cloud Primary) succeeded with ${res.model}.`);
        return returnMeta
          ? { text: res.text, provider: `Groq Cloud (${res.model})`, tier: 2 }
          : res.text;
      }
    } catch (err2) {
      console.warn(`[AI Fallback] Tier 2 (Groq Primary) unavailable: ${err2.message.slice(0, 80)}. Escalating to Tier 3...`);
      errors.push(`Tier 2: ${err2.message.slice(0, 60)}`);
    }
  }

  // TIER 3: Groq Cloud Secondary (if configured)
  const groqKey2 = (process.env.GROQ_API_KEY2 || '').trim();
  if (groqKey2) {
    try {
      const res = await callGroqChat(messages, 1000, 3500, groqKey2);
      if (res && res.text) {
        console.log(`[AI Fallback] Tier 3 (Groq Cloud Secondary) succeeded with ${res.model}.`);
        return returnMeta
          ? { text: res.text, provider: `Groq Cloud Secondary (${res.model})`, tier: 3 }
          : res.text;
      }
    } catch (err3) {
      console.warn(`[AI Fallback] Tier 3 (Groq Secondary) unavailable: ${err3.message.slice(0, 80)}. Escalating to Tier 4...`);
      errors.push(`Tier 3: ${err3.message.slice(0, 60)}`);
    }
  }

  // TIER 4: Backup Gemini
  if (tertiaryGenAI) {
    try {
      const res = await callGeminiClient(tertiaryGenAI, fullPrompt, 4000);
      if (res) {
        console.log(`[AI Fallback] Tier 4 (Backup Gemini) succeeded with ${currentModelName}.`);
        return returnMeta
          ? { text: res, provider: `Google Gemini Backup (${currentModelName})`, tier: 4 }
          : res;
      }
    } catch (err4) {
      console.warn(`[AI Fallback] Tier 4 (Backup Gemini) unavailable: ${err4.message.slice(0, 80)}.`);
      errors.push(`Tier 4: ${err4.message.slice(0, 60)}`);
    }
  }

  throw new Error(`All configured AI providers failed to respond: ${errors.join(' | ')}`);
}

/**
 * Natural language analysis of description
 * Extracts semantic attributes without rigid categories
 */
async function analyzeDescription(description, hints = {}) {
  if (!isConfigured) {
    return fallbackAnalyze(description, hints);
  }

  const prompt = `Analyze this lost or found item description from a university campus.
Description: "${description}"
${hints.location ? `Reported Location: "${hints.location}"` : ''}
${hints.color ? `Reported Color: "${hints.color}"` : ''}

Extract key semantic details. Do NOT use emojis. Return ONLY valid JSON in this exact structure:
{
  "itemName": "concise title of the item (e.g., Black Leather Handbag, Wireless Earbuds, Scientific Calculator)",
  "color": "primary color or null",
  "brand": "brand name if mentioned or null",
  "location": "campus location mentioned or null",
  "features": ["distinctive feature 1", "distinctive feature 2"],
  "keywords": ["semantic keywords"]
}`;

  try {
    const text = await runAIPrompt(prompt, 'You are an accurate semantic item analyzer for a campus lost and found service. Return only valid JSON without emojis.');
    const parsed = parseAIJSON(text);

    if (parsed && parsed.itemName) {
      return parsed;
    }
    return fallbackAnalyze(description, hints);
  } catch (err) {
    console.warn('[AI Service] analyzeDescription fallback:', err.message);
    return fallbackAnalyze(description, hints);
  }
}

function fallbackAnalyze(description, hints = {}) {
  const words = description.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  return {
    itemName: description.slice(0, 40).trim(),
    color: hints.color || null,
    brand: null,
    location: hints.location || null,
    features: [],
    keywords: words.slice(0, 8)
  };
}

/**
 * Batched AI Semantic Ranking
 * Evaluates semantic equivalence (purse <-> handbag, phone <-> mobile, earbuds <-> wireless earphones),
 * location proximity, date alignment, and features.
 */
async function rankCandidates(lostQuery, candidates) {
  if (!candidates || candidates.length === 0) return [];
  if (!isConfigured) {
    return fallbackRankCandidates(lostQuery, candidates);
  }

  const candidateSummaries = candidates.map((c, index) => ({
    candidateIndex: index,
    id: c.id,
    title: c.title || '',
    description: c.description || '',
    location: c.location || '',
    date: c.date || '',
    color: c.color || ''
  }));

  const prompt = `You are the intelligent matching engine for a campus lost-and-found platform.
Evaluate how well each REAL found item matches the owner's lost description.

Owner Lost Description: "${lostQuery.description}"
${lostQuery.location ? `Owner Lost Location: "${lostQuery.location}"` : ''}
${lostQuery.date ? `Owner Date Lost: "${lostQuery.date}"` : ''}
${lostQuery.color ? `Owner Color: "${lostQuery.color}"` : ''}

Found Candidate Reports:
${JSON.stringify(candidateSummaries, null, 2)}

Instructions:
1. The written description is the PRIMARY signal.
2. Understand semantic equivalence: purse is synonymous with handbag or tote bag; phone is mobile; earbuds are wireless earphones or AirPods; bottle is flask or tumbler; calculator is calc.
3. More specific details (e.g. brand, stickers, keychain, scratches) should improve score confidence.
4. Evaluate campus location proximity (e.g., SJT classroom and SJT ground floor are in the same building).
5. Never invent details or items.
6. For each candidate, compute:
   - score: integer 0-100 (score 0 if completely unrelated)
   - descriptionMatch: "Strong", "Moderate", or "Weak"
   - reason: A concise 1-2 sentence human-readable explanation of why this was suggested (no emojis).

Return ONLY valid JSON array:
[
  {
    "candidateIndex": 0,
    "score": 92,
    "descriptionMatch": "Strong",
    "reason": "Clear explanation here."
  }
]`;

  try {
    const text = await runAIPrompt(prompt, 'You are an accurate semantic matching evaluator. Do not use emojis. Return only valid JSON array.');
    const rankedList = parseAIJSON(text);

    if (Array.isArray(rankedList) && rankedList.length > 0) {
      const scoredCandidates = [];
      for (const item of rankedList) {
        const cIdx = parseInt(item.candidateIndex, 10);
        let candidate = !isNaN(cIdx) ? candidates[cIdx] : null;
        if (!candidate && item.id) {
          candidate = candidates.find(c => c.id === item.id);
        }
        const score = Math.min(100, Math.max(0, parseInt(item.score, 10) || 0));
        // Only include candidates that actually match (score >= 25)
        if (candidate && score >= 25) {
          scoredCandidates.push({
            ...candidate,
            score,
            descriptionMatch: item.descriptionMatch || (score >= 75 ? 'Strong' : 'Moderate'),
            reason: item.reason || 'Semantic description and location correspond to your report.'
          });
        }
      }
      return scoredCandidates.sort((a, b) => b.score - a.score);
    }
    return fallbackRankCandidates(lostQuery, candidates);
  } catch (err) {
    console.warn('[AI Service] rankCandidates fallback:', err.message);
    return fallbackRankCandidates(lostQuery, candidates);
  }
}

function fallbackRankCandidates(lostQuery, candidates) {
  const queryText = (lostQuery.description || '').toLowerCase();
  const queryWords = queryText.split(/\s+/).filter(w => w.length > 2);
  const lostLoc = (lostQuery.location || '').toLowerCase();

  const colors = ['black', 'blue', 'red', 'green', 'white', 'yellow', 'silver', 'gold', 'pink', 'purple', 'grey', 'gray', 'brown', 'orange', 'maroon', 'navy', 'beige'];
  const campusLocations = ['sjt', 'tt', 'prp', 'smv', 'mb', 'gdn', 'library', 'foodys', 'canteen', 'gazebo'];
  const stopWords = ['lost', 'found', 'looking', 'near', 'around', 'yesterday', 'today', 'with', 'from', 'have', 'item'];

  const substantiveNouns = queryWords.filter(w => !colors.includes(w) && !campusLocations.includes(w) && !stopWords.includes(w));

  const results = [];
  for (const c of candidates) {
    const desc = (c.description || '').toLowerCase();
    const title = (c.title || '').toLowerCase();
    const combined = `${title} ${desc}`;
    const loc = (c.location || '').toLowerCase();

    // If query specifies substantive nouns (e.g. "purse"), candidate must match at least one
    if (substantiveNouns.length > 0) {
      const matchesNoun = substantiveNouns.some(n => combined.includes(n));
      if (!matchesNoun) {
        continue;
      }
    }

    let score = 0;
    let matchCount = 0;
    queryWords.forEach(w => {
      if (combined.includes(w)) matchCount++;
    });

    if (queryWords.length > 0 && matchCount > 0) {
      score += Math.round((matchCount / queryWords.length) * 55);
    }

    // Location boost
    if (lostLoc && loc && (lostLoc.includes(loc) || loc.includes(lostLoc))) {
      score += 25;
    }

    // Color boost
    if (lostQuery.color && c.color && lostQuery.color.toLowerCase() === c.color.toLowerCase()) {
      score += 20;
    }

    // Only keep if there's real relevance
    if (score >= 25) {
      const finalScore = Math.min(95, score);
      results.push({
        ...c,
        score: finalScore,
        descriptionMatch: finalScore >= 75 ? 'Strong' : (finalScore >= 50 ? 'Moderate' : 'Weak'),
        reason: 'Item description and location correspond to your report.'
      });
    }
  }

  return results.sort((a, b) => b.score - a.score);
}

/**
 * Optional Multimodal Photo Verification
 * Receives images server-side (as buffers or base64 data) without public signed URLs.
 * Only runs when both items have photo evidence.
 * Description remains primary; photo is supporting verification.
 */
async function verifyPhotos(lostPhotoInput, foundPhotoInput) {
  if (!lostPhotoInput || !foundPhotoInput) {
    return null; // visual verification not claimed
  }

  // Vision requires Gemini genAI
  if (!genAI) {
    return {
      photoVerification: 'Inconclusive',
      photoReason: 'Visual verification is unavailable.'
    };
  }

  function toPart(input) {
    if (!input) return null;
    if (input.buffer && Buffer.isBuffer(input.buffer)) {
      return {
        inlineData: {
          data: input.buffer.toString('base64'),
          mimeType: input.mimeType || 'image/png'
        }
      };
    }
    if (Buffer.isBuffer(input)) {
      return {
        inlineData: {
          data: input.toString('base64'),
          mimeType: 'image/png'
        }
      };
    }
    if (typeof input === 'string' && input.startsWith('data:image/')) {
      const matches = input.match(/^data:image\/([a-zA-Z0-9+.-]+);base64,(.+)$/);
      if (matches) {
        return {
          inlineData: {
            data: matches[2],
            mimeType: `image/${matches[1]}`
          }
        };
      }
    }
    return null;
  }

  const p1 = toPart(lostPhotoInput);
  const p2 = toPart(foundPhotoInput);

  if (!p1 || !p2) return null;

  try {
    const prompt = `You are an AI assistant performing supporting visual verification for a campus lost-and-found system.
Image 1: Lost item reported by the owner.
Image 2: Found item reported on campus.

Compare the two photos carefully. Do NOT use emojis.
- If the two photos depict the same object or consistent appearance, return "Consistent".
- If the photos clearly depict different items, different colors (e.g. blue vs black, blue vs red), or contradictory objects (e.g. backpack vs purse), return "Inconsistent".
- If the photos are too low-resolution, obscured, or ambiguous to determine, return "Inconclusive".

Respond ONLY with a JSON object:
{
  "photoVerification": "Consistent" | "Inconclusive" | "Inconsistent",
  "photoReason": "A concise 1-sentence factual description of the visual similarity or contradiction."
}`;

    const parts = [{ text: prompt }, p1, p2];
    const text = await callGeminiWithFallback(parts);
    const parsed = parseAIJSON(text);

    const status = parsed?.photoVerification;
    const validStatus = ['Consistent', 'Inconclusive', 'Inconsistent'].includes(status) ? status : 'Inconclusive';

    return {
      photoVerification: validStatus,
      photoReason: parsed?.photoReason || (validStatus === 'Consistent'
        ? 'Visual characteristics appear consistent.'
        : (validStatus === 'Inconsistent' ? 'Visual characteristics conflict with candidate photo.' : 'Visual inspection was inconclusive.'))
    };
  } catch (err) {
    console.warn('[AI Service] verifyPhotos error:', err.message);
    return {
      photoVerification: 'Inconclusive',
      photoReason: 'Visual inspection was inconclusive.'
    };
  }
}

/**
 * Assistant Chat with real Firestore search context
 * Understands natural-language queries, searches real database, and never invents records.
 * @param {string} message
 * @param {Array} history
 * @param {Function} searchFoundReportsFn - async callback (queryText) => matches
 * @returns {Promise<{ reply: string, matchingItems: Array }>}
 */
async function assistantChat(message, history = [], searchFoundReportsFn = null) {
  const cleanMessage = (message || '').trim();
  const lower = cleanMessage.toLowerCase();

  // Detect if user is describing a lost item to search
  const isSearchIntent = lower.includes('lost') || lower.includes('looking for') || lower.includes('find') || 
                         lower.includes('anyone find') || lower.includes('did anyone') || lower.includes('wallet') || 
                         lower.includes('id') || lower.includes('card') || lower.includes('phone') || 
                         lower.includes('bag') || lower.includes('keys') || lower.includes('charger') || 
                         lower.includes('earbuds') || lower.includes('headphones') || lower.includes('bottle') || 
                         lower.includes('box') || lower.includes('laptop') || lower.includes('specs');
  let realMatches = [];

  if (isSearchIntent && searchFoundReportsFn) {
    try {
      realMatches = await searchFoundReportsFn(cleanMessage);
    } catch (err) {
      console.warn('[Assistant] Search error:', err.message);
      realMatches = [];
    }
  }

  if (!isConfigured) {
    if (realMatches.length > 0) {
      return {
        reply: `AI reasoning is currently offline, but LostLink searched active campus records and found ${realMatches.length} matching item(s) in the database. Please review them below:`,
        matchingItems: realMatches,
        isAiGenerated: false,
        aiUnavailable: true
      };
    }
    return {
      reply: "The AI Assistant is temporarily unavailable because no AI provider keys are configured in the server environment. You can search found reports directly on the Find My Item page or submit a report.",
      matchingItems: [],
      isAiGenerated: false,
      aiUnavailable: true
    };
  }

  const candidateSummary = realMatches.length > 0
    ? realMatches.slice(0, 3).map((m, i) => `#${i + 1}: "${m.title || m.description}" at ${m.location || 'Campus'} (Date: ${m.date || 'Recent'}, Status: ${m.currentStatus || 'with_finder'})`).join('\n')
    : 'No matching found reports currently exist in the campus database.';

  const systemInstruction = `You are the official LostLink campus assistant for VIT (Vellore Institute of Technology).
Strict rules:
1. Do NOT use any emojis under any circumstances.
2. NEVER invent, hallucinate, or fabricate any found item, report, student name, or phone number.
3. Every found item mentioned MUST come strictly from the "REAL DATABASE RESULTS" section below.
4. If "REAL DATABASE RESULTS" states no matches exist:
   - State truthfully that no matching report is currently registered on LostLink.
   - Advise them to submit a Lost Report on LostLink so they receive automatic match notifications when someone reports finding it.
5. If "REAL DATABASE RESULTS" has matching items:
   - Concisely summarize the matching item(s) and location, and let them know they can click the item card below to view details and contact the finder.
6. If the student asks for guidance on lost items, lost ID cards, wallets, or campus procedures:
   - Provide concrete, helpful campus advice:
     * Student ID Cards: Check the Central Library security desk, SJT ground floor security, TT security desk, or Main Building security office. Advise them to visit the security office if not recovered.
     * Wallets / Electronics: Check nearby building security counters and submit a Lost Report.
     * Found items: Direct them to click "Report Found" on LostLink and deposit the physical item at the nearest designated security desk.
7. Keep responses clear, professional, direct, and helpful.`;

  const userContextPrompt = `Student Message: "${cleanMessage}"

REAL DATABASE RESULTS FOR THIS QUERY:
${candidateSummary}

Answer the student clearly according to the rules:`;

  try {
    const aiResult = await runAIPrompt(userContextPrompt, systemInstruction, true);
    return {
      reply: aiResult.text.trim(),
      matchingItems: realMatches,
      isAiGenerated: true,
      provider: aiResult.provider,
      tier: aiResult.tier
    };
  } catch (err) {
    console.error('[AI Service] All AI providers failed in assistantChat:', err.message);
    if (realMatches.length > 0) {
      return {
        reply: `AI reasoning is temporarily unavailable across all configured providers (rate/quota limits). However, LostLink searched our live campus database directly and found ${realMatches.length} matching found item(s) for your search. Please review them below:`,
        matchingItems: realMatches,
        isAiGenerated: false,
        aiUnavailable: true,
        errorReason: err.message
      };
    }
    return {
      reply: "The AI Assistant is temporarily unavailable because all configured AI providers have reached their quota limits or are unreachable. You can search all active campus reports directly on the Find My Item page or submit a Lost Report.",
      matchingItems: [],
      isAiGenerated: false,
      aiUnavailable: true,
      errorReason: err.message
    };
  }
}

module.exports = {
  analyzeDescription,
  rankCandidates,
  verifyPhotos,
  assistantChat,
  isAvailable: () => isConfigured,
  getProvider: () => provider,
  getTiers: () => ({
    tier1_primary_gemini: Boolean(genAI),
    tier2_groq_primary: Boolean(process.env.GROQ_API_KEY || process.env.OPENAI_API_KEY),
    tier3_groq_secondary: Boolean(process.env.GROQ_API_KEY2),
    tier4_backup_gemini: Boolean(tertiaryGenAI)
  })
};
