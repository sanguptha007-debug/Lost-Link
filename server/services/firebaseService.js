/**
 * LostLink — Firebase Admin Service
 * Server-side Firebase initialization and helpers
 */

const admin = require('firebase-admin');

let db = null;
let auth = null;
let storage = null;
let initialized = false;
let initError = null;

// ---- Initialize ----
function initialize() {
  if (initialized) return;

  try {
    let serviceAccount = null;
    if (process.env.FIREBASE_SERVICE_ACCOUNT_PATH) {
      const resolvedPath = require('path').resolve(process.env.FIREBASE_SERVICE_ACCOUNT_PATH);
      if (require('fs').existsSync(resolvedPath)) {
        try {
          serviceAccount = require(resolvedPath);
        } catch (e) {
          console.warn(`[Firebase] Failed to load service account file: ${e.message}`);
        }
      } else {
        console.warn(`[Firebase] Service account file not found at ${resolvedPath}, falling back to environment variables.`);
      }
    }

    if (serviceAccount) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET
      });
    } else if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
      let privateKey = process.env.FIREBASE_PRIVATE_KEY.trim();
      if ((privateKey.startsWith('"') && privateKey.endsWith('"')) || (privateKey.startsWith("'") && privateKey.endsWith("'"))) {
        privateKey = privateKey.slice(1, -1).trim();
      }
      privateKey = privateKey.replace(/\\n/g, '\n');

      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID.trim(),
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL.trim(),
          privateKey
        }),
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET
      });
    } else {
      const missing = [];
      if (!process.env.FIREBASE_PROJECT_ID) missing.push('FIREBASE_PROJECT_ID');
      if (!process.env.FIREBASE_CLIENT_EMAIL) missing.push('FIREBASE_CLIENT_EMAIL');
      if (!process.env.FIREBASE_PRIVATE_KEY) missing.push('FIREBASE_PRIVATE_KEY');
      initError = `Firebase Admin credentials not configured in environment. Missing: ${missing.join(', ')}`;
      console.error('  [Firebase] ' + initError);
      initialized = true;
      return;
    }

    db = admin.firestore();
    auth = admin.auth();
    storage = admin.storage();
    console.log('  [Firebase] Admin SDK initialized');
  } catch (err) {
    initError = 'Firebase initialization failed: ' + err.message;
    console.error('  [Firebase] ' + initError);
  }

  initialized = true;
}

initialize();

// ---- Guard: ensure Firebase is available ----
function requireDB() {
  if (!db) {
    const error = new Error(initError || 'Database service is not configured.');
    error.status = 503;
    throw error;
  }
  return db;
}

function requireAuth() {
  if (!auth) {
    const error = new Error(initError || 'Authentication service is not configured.');
    error.status = 503;
    throw error;
  }
  return auth;
}

// ---- Exports ----
module.exports = {
  admin,
  get db() { return db; },
  get auth() { return auth; },
  get storage() { return storage; },
  get isAvailable() { return !!db; },
  get initError() { return initError; },

  // Helper: Get document by ID
  async getDoc(collection, id) {
    const database = requireDB();
    const doc = await database.collection(collection).doc(id).get();
    return doc.exists ? { id: doc.id, ...doc.data() } : null;
  },

  // Helper: Set document
  async setDoc(collection, id, data) {
    const database = requireDB();
    await database.collection(collection).doc(id).set(data, { merge: true });
    return { id, ...data };
  },

  // Helper: Add document with auto-ID
  async addDoc(collection, data) {
    const database = requireDB();
    const ref = await database.collection(collection).add(data);
    return { id: ref.id, ...data };
  },

  // Helper: Update document
  async updateDoc(collection, id, data) {
    const database = requireDB();
    await database.collection(collection).doc(id).update(data);
    return { id, ...data };
  },

  // Helper: Delete document
  async deleteDoc(collection, id) {
    const database = requireDB();
    await database.collection(collection).doc(id).delete();
    return true;
  },

  // Helper: Query collection with resilient fallback for missing composite indexes
  async queryDocs(collection, filters = {}, orderByField = 'createdAt', limit = 50) {
    const database = requireDB();
    let query = database.collection(collection);

    for (const [key, value] of Object.entries(filters)) {
      if (value !== undefined && value !== null && value !== '') {
        if (Array.isArray(value)) {
          query = query.where(key, 'in', value);
        } else {
          query = query.where(key, '==', value);
        }
      }
    }

    try {
      let orderedQuery = query;
      if (orderByField) {
        orderedQuery = orderedQuery.orderBy(orderByField, 'desc');
      }
      if (limit) {
        orderedQuery = orderedQuery.limit(limit);
      }
      const snapshot = await orderedQuery.get();
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (err) {
      // Check if Firestore error is due to missing composite index (code 9 / FAILED_PRECONDITION)
      if (err.code === 9 || (err.message && err.message.toLowerCase().includes('requires an index'))) {
        console.warn(`[Firebase] Missing composite index for collection '${collection}' with filters [${Object.keys(filters).join(', ')}]. Using in-memory sort fallback.`);
        if (err.details) {
          console.warn(`[Firebase] Create index at: ${err.details}`);
        } else if (err.message) {
          console.warn(`[Firebase] Index details: ${err.message}`);
        }

        // Resilient fallback: execute query with filters only (uses single-field indexes)
        const snapshot = await query.get();
        let docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        // Sort in memory by orderByField descending
        if (orderByField) {
          docs.sort((a, b) => {
            const timeA = a[orderByField] ? new Date(a[orderByField]).getTime() : 0;
            const timeB = b[orderByField] ? new Date(b[orderByField]).getTime() : 0;
            return timeB - timeA;
          });
        }

        if (limit && limit > 0) {
          docs = docs.slice(0, limit);
        }
        return docs;
      }
      throw err;
    }
  },

  // Helper: Verify Firebase ID token
  async verifyToken(token) {
    const authService = requireAuth();
    try {
      const decoded = await authService.verifyIdToken(token);
      return decoded;
    } catch (err) {
      return null;
    }
  }
};
