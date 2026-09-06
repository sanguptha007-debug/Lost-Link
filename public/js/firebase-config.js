/**
 * LostLink — Firebase Client Configuration & Authentication Gatekeeper
 * Google Sign-In with @vitstudent.ac.in authorization
 */

window.LostLink = window.LostLink || {};

LostLink.firebaseReady = false;
LostLink.firebaseConfigured = false;
LostLink.currentUser = null;
LostLink.initError = null;
LostLink._signInInProgress = false;
LostLink._resolvingProfile = false;
LostLink._authRedirecting = false;

/**
 * Initialize Firebase Client SDK
 */
LostLink.initFirebase = async function() {
  try {
    let config = null;
    try {
      const cached = sessionStorage.getItem('lostlink_fb_config');
      if (cached) config = JSON.parse(cached);
    } catch (e) {}

    if (!config) {
      console.log('[LostLink Auth] Fetching client configuration from /api/config/firebase...');
      const res = await fetch('/api/config/firebase');
      const data = await res.json();

      if (!data.configured || !data.config || !data.config.apiKey) {
        LostLink.firebaseConfigured = false;
        LostLink.initError = data.error || 'Firebase client credentials are not configured in .env';
        console.warn('[LostLink Auth] Firebase client is not configured:', LostLink.initError);
        document.dispatchEvent(new CustomEvent('firebaseConfigFailed', { detail: { error: LostLink.initError, missingConfig: true } }));
        enforceGatekeeper(null);
        return;
      }

      config = data.config;
      try {
        sessionStorage.setItem('lostlink_fb_config', JSON.stringify(config));
      } catch (e) {}
    }

    LostLink.firebaseConfigured = true;
    LostLink.initError = null;

    if (typeof firebase !== 'undefined') {
      if (!firebase.apps.length) {
        firebase.initializeApp(config);
        console.log('[LostLink Auth] firebase.initializeApp() called.');
      }

      LostLink.auth = firebase.auth();
      LostLink.firestore = firebase.firestore();

      // Ensure persistent auth across browser restarts and tabs
      try {
        await LostLink.auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
      } catch (pErr) {
        console.warn('[LostLink Auth] Persistence setting notice:', pErr.message);
      }

      LostLink.firebaseReady = true;

      // Handle redirect sign-in only if a redirect was specifically initiated
      if (sessionStorage.getItem('lostlink_pending_redirect') === 'true') {
        sessionStorage.removeItem('lostlink_pending_redirect');
        try {
          console.log('[LostLink Auth] Checking redirect result...');
          const redirectResult = await LostLink.auth.getRedirectResult();
          if (redirectResult && redirectResult.user) {
            console.log('[LostLink Auth] Redirect sign-in success:', redirectResult.user.email);
            await LostLink.resolveStudentSession(redirectResult.user);
            return;
          }
        } catch (redirectErr) {
          console.warn('[LostLink Auth] getRedirectResult error:', redirectErr.message);
        }
      }

      // Fast auth state observer
      LostLink.auth.onAuthStateChanged(async (firebaseUser) => {
        console.log('[LostLink Auth] onAuthStateChanged fired:', firebaseUser ? firebaseUser.email : 'null');
        await LostLink.resolveStudentSession(firebaseUser);
      });
    } else {
      console.error('[LostLink Auth] Firebase SDK not loaded.');
    }
  } catch (err) {
    console.error('[LostLink Auth] initFirebase error:', err);
    LostLink.firebaseConfigured = false;
    enforceGatekeeper(null);
  }
};

/**
 * Resolve student session and profile without race conditions
 */
LostLink.resolveStudentSession = async function(firebaseUser) {
  if (!firebaseUser) {
    LostLink.currentUser = null;
    LostLink.updateNavForAuth(null);
    document.dispatchEvent(new CustomEvent('authStateChanged', { detail: { user: null } }));
    enforceGatekeeper(null);
    return null;
  }

  const email = (firebaseUser.email || '').toLowerCase();
  if (!email.endsWith('@vitstudent.ac.in')) {
    console.warn('[LostLink Auth] Non-VIT account detected, signing out:', email);
    await LostLink.auth.signOut();
    LostLink.currentUser = null;
    LostLink.updateNavForAuth(null);
    LostLink.showToast('Access restricted: Please sign in with your VIT student email (@vitstudent.ac.in).', 'error');
    enforceGatekeeper(null);
    return null;
  }

  if (LostLink._resolvingProfile) {
    return LostLink.currentUser;
  }
  LostLink._resolvingProfile = true;

  try {
    const token = await firebaseUser.getIdToken(false);
    const profileRes = await fetch('/api/users/profile', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const profileData = await profileRes.json();
    const profileComplete = profileData.user?.profileComplete === true;

    LostLink.currentUser = {
      uid: firebaseUser.uid,
      email: firebaseUser.email,
      name: profileData.user?.name || firebaseUser.displayName || 'Student',
      phone: profileData.user?.phone || '',
      registrationNumber: profileData.user?.registrationNumber || '',
      profileComplete,
      photoURL: firebaseUser.photoURL || null
    };
  } catch (e) {
    console.warn('[LostLink Auth] Profile fetch error:', e.message);
    LostLink.currentUser = {
      uid: firebaseUser.uid,
      email: firebaseUser.email,
      name: firebaseUser.displayName || 'Student',
      profileComplete: false
    };
  } finally {
    LostLink._resolvingProfile = false;
  }

  LostLink.updateNavForAuth(LostLink.currentUser);
  document.dispatchEvent(new CustomEvent('authStateChanged', { detail: { user: LostLink.currentUser } }));
  enforceGatekeeper(LostLink.currentUser);
  return LostLink.currentUser;
};

/**
 * Strict Gatekeeper — routes users safely according to authentication state
 */
function enforceGatekeeper(user) {
  if (LostLink._authRedirecting) return;
  if (window._bypassGatekeeper || (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('lostlink_bypass_gatekeeper') === 'true')) return;

  const currentPath = window.location.pathname.toLowerCase();
  const isLoginPage = currentPath.endsWith('login.html');
  const isSetupPage = currentPath.endsWith('profile-setup.html');
  const isRootOrIndex = currentPath === '/' || currentPath.endsWith('index.html') || currentPath === '';

  if (!user) {
    if (!isLoginPage) {
      LostLink._authRedirecting = true;
      window.location.href = '/login.html';
    }
  } else {
    if (!user.profileComplete) {
      if (!isSetupPage) {
        LostLink._authRedirecting = true;
        window.location.href = '/profile-setup.html';
      }
    } else {
      if (isLoginPage || isSetupPage || isRootOrIndex) {
        LostLink._authRedirecting = true;
        window.location.href = '/find-items.html';
      }
    }
  }
}

/**
 * Google Sign-In with @vitstudent.ac.in restriction
 */
LostLink.signInWithGoogle = async function() {
  if (!LostLink.firebaseReady || !LostLink.auth) {
    const errorMsg = LostLink.initError || 'Authentication is initializing. Please wait a moment.';
    const err = new Error(errorMsg);
    err.code = 'auth/not-initialized';
    throw err;
  }

  if (LostLink._signInInProgress) {
    return;
  }
  LostLink._signInInProgress = true;

  const provider = new firebase.auth.GoogleAuthProvider();
  provider.setCustomParameters({
    hd: 'vitstudent.ac.in'
  });

  try {
    const result = await LostLink.auth.signInWithPopup(provider);
    LostLink._signInInProgress = false;

    if (result && result.user) {
      await LostLink.resolveStudentSession(result.user);
    }
  } catch (err) {
    LostLink._signInInProgress = false;

    console.error('[LostLink Auth] signInWithPopup error:', {
      code: err.code,
      message: err.message
    });

    // Only attempt redirect fallback if the browser explicitly blocked the popup window
    if (err.code === 'auth/popup-blocked') {
      console.warn('[LostLink Auth] Popup blocked by browser. Using redirect mode fallback...');
      sessionStorage.setItem('lostlink_pending_redirect', 'true');
      await LostLink.auth.signInWithRedirect(provider);
      return;
    }

    throw err;
  }
};

/**
 * Sign out
 */
LostLink.logout = async function() {
  try {
    if (LostLink.firebaseReady && LostLink.auth) {
      await LostLink.auth.signOut();
    }
    LostLink.currentUser = null;
    LostLink.updateNavForAuth(null);
    window.location.href = '/login.html';
  } catch (err) {
    console.error('[LostLink] Logout error:', err);
  }
};

/**
 * Get Firebase ID Token for API calls (uses fast local cache unless expired)
 */
LostLink.getAuthToken = async function() {
  if (LostLink.auth && LostLink.auth.currentUser) {
    return LostLink.auth.currentUser.getIdToken(false);
  }
  return null;
};

/**
 * Update navigation elements
 */
LostLink.updateNavForAuth = function(user) {
  const loginLinks = document.querySelectorAll('.nav-guest');
  const userLinks = document.querySelectorAll('.nav-user');
  const userDisplayNames = document.querySelectorAll('.nav-user-name');

  if (user) {
    loginLinks.forEach(el => el.classList.add('hidden'));
    userLinks.forEach(el => el.classList.remove('hidden'));
    userDisplayNames.forEach(el => el.textContent = user.name || 'Profile');
  } else {
    loginLinks.forEach(el => el.classList.remove('hidden'));
    userLinks.forEach(el => el.classList.add('hidden'));
  }
};

document.addEventListener('DOMContentLoaded', () => {
  LostLink.initFirebase();
});

