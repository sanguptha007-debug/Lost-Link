/**
 * LostLink — Supabase Private Storage Service
 * Exclusively handles item photo storage in a private Supabase bucket.
 * Kept strictly server-side. Enforces double validation (size & MIME type).
 */

const { createClient } = require('@supabase/supabase-js');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

let supabase = null;
const supabaseUrl = (process.env.SUPABASE_URL || '').trim();
const supabaseKey = (process.env.SUPABASE_SECRET_KEY || '').trim();
const bucketName = (process.env.SUPABASE_STORAGE_BUCKET || 'item-photos').trim();

function initSupabase() {
  if (supabase) return supabase;
  const url = (process.env.SUPABASE_URL || '').trim();
  const key = (process.env.SUPABASE_SECRET_KEY || '').trim();
  if (url && key) {
    try {
      supabase = createClient(url, key, {
        auth: {
          persistSession: false,
          autoRefreshToken: false
        }
      });
      console.log(`[Supabase Storage] Initialized private client for bucket: "${bucketName}"`);
    } catch (err) {
      console.error('[Supabase Storage] Initialization error:', err.message);
    }
  } else {
    console.log('[Supabase Storage] Unconfigured: SUPABASE_URL or SUPABASE_SECRET_KEY not set.');
  }
  return supabase;
}

initSupabase();

/**
 * Check if Supabase Storage is configured
 */
function isConfigured() {
  return !!(initSupabase() && (process.env.SUPABASE_URL || '').trim() && (process.env.SUPABASE_SECRET_KEY || '').trim());
}

/**
 * Validate image buffer and MIME type
 */
function validateImage(buffer, mimeType) {
  if (!buffer || !Buffer.isBuffer(buffer)) {
    throw new Error('Invalid file buffer.');
  }
  if (buffer.length > MAX_FILE_SIZE) {
    throw new Error(`File exceeds the 5 MB maximum size limit (${(buffer.length / (1024 * 1024)).toFixed(2)} MB).`);
  }
  if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
    throw new Error(`Unsupported image type "${mimeType}". Allowed types: JPEG, PNG, WebP.`);
  }
}

/**
 * Upload item photo to private Supabase bucket
 * @returns {Promise<{ storagePath: string }>}
 */
async function uploadItemPhoto(buffer, originalFilename, mimeType, userId) {
  if (!isConfigured()) {
    const error = new Error('Photo storage is temporarily unavailable. Please submit without a photo or try again later.');
    error.status = 503;
    throw error;
  }

  // Strict service-layer validation
  validateImage(buffer, mimeType);

  const ext = path.extname(originalFilename || '') || (mimeType === 'image/png' ? '.png' : (mimeType === 'image/webp' ? '.webp' : '.jpg'));
  const safeUserId = userId || 'anonymous';
  const storagePath = `items/${safeUserId}/${uuidv4()}${ext.toLowerCase()}`;

  const { data, error } = await supabase.storage
    .from(bucketName)
    .upload(storagePath, buffer, {
      contentType: mimeType,
      upsert: false
    });

  if (error) {
    console.error('[Supabase Storage] Upload error:', error.message);
    const isNetworkOrPaused = error.message && (
      error.message.includes('fetch failed') ||
      error.message.includes('ENOTFOUND') ||
      error.message.includes('timeout') ||
      error.message.includes('503') ||
      error.message.includes('network')
    );
    const err = new Error(
      isNetworkOrPaused
        ? 'Photo storage is temporarily unavailable. Please submit without a photo or try again later.'
        : 'Failed to upload item photo to storage.'
    );
    err.status = isNetworkOrPaused ? 503 : 500;
    throw err;
  }

  return { storagePath };
}

/**
 * Generate short-lived signed URL for browser-facing image display
 * Default expiration is 15 minutes (900 seconds)
 * @param {string} storagePath
 * @param {number} expiresInSeconds
 * @returns {Promise<string|null>}
 */
async function getSignedPhotoUrl(storagePath, expiresInSeconds = 900) {
  if (!isConfigured() || !storagePath) return null;

  try {
    const { data, error } = await supabase.storage
      .from(bucketName)
      .createSignedUrl(storagePath, expiresInSeconds);

    if (error || !data?.signedUrl) {
      console.warn(`[Supabase Storage] Failed to generate signed URL for "${storagePath}":`, error?.message);
      return null;
    }

    return data.signedUrl;
  } catch (err) {
    console.warn(`[Supabase Storage] Signed URL exception for "${storagePath}":`, err.message);
    return null;
  }
}

/**
 * Download private image buffer server-side (for Gemini multimodal analysis)
 * Never exposes signed or public URLs to Gemini; downloads directly via private SDK.
 * @param {string} storagePath
 * @returns {Promise<{ buffer: Buffer, mimeType: string }|null>}
 */
async function downloadPhotoBuffer(storagePath) {
  if (!isConfigured() || !storagePath) return null;

  try {
    const { data, error } = await supabase.storage
      .from(bucketName)
      .download(storagePath);

    if (error || !data) {
      console.warn(`[Supabase Storage] Download failed for "${storagePath}":`, error?.message);
      return null;
    }

    const arrayBuffer = await data.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const mimeType = data.type || 'image/jpeg';

    return { buffer, mimeType };
  } catch (err) {
    console.warn(`[Supabase Storage] Download exception for "${storagePath}":`, err.message);
    return null;
  }
}

/**
 * Delete photo from private Supabase bucket
 * Used for transaction rollback and report deletion cleanup
 * @param {string} storagePath
 * @returns {Promise<boolean>}
 */
async function deleteItemPhoto(storagePath) {
  if (!isConfigured() || !storagePath) return false;

  try {
    const { error } = await supabase.storage
      .from(bucketName)
      .remove([storagePath]);

    if (error) {
      console.warn(`[Supabase Storage] Failed to delete photo "${storagePath}":`, error.message);
      return false;
    }

    return true;
  } catch (err) {
    console.warn(`[Supabase Storage] Delete exception for "${storagePath}":`, err.message);
    return false;
  }
}

/**
 * Check if a photo exists in the private Supabase bucket
 * @param {string} storagePath
 * @returns {Promise<boolean>}
 */
async function checkItemPhotoExists(storagePath) {
  if (!isConfigured() || !storagePath) return false;
  try {
    const dir = path.posix.dirname(storagePath);
    const filename = path.posix.basename(storagePath);
    const { data, error } = await supabase.storage.from(bucketName).list(dir, {
      search: filename
    });
    if (error || !data) return false;
    return data.some(f => f.name === filename);
  } catch (err) {
    return false;
  }
}

module.exports = {
  isConfigured,
  validateImage,
  uploadItemPhoto,
  getSignedPhotoUrl,
  downloadPhotoBuffer,
  deleteItemPhoto,
  checkItemPhotoExists,
  MAX_FILE_SIZE,
  ALLOWED_MIME_TYPES
};
