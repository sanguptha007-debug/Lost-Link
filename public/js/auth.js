/**
 * LostLink — Auth Page Script
 * Google Sign-In with @vitstudent.ac.in restriction and complete diagnostics
 */

document.addEventListener('DOMContentLoaded', () => {
  const googleBtn = document.getElementById('googleSignInBtn');
  const alertEl = document.getElementById('authAlert');
  const btnText = document.getElementById('googleBtnText');

  function showAlert(message, type = 'error') {
    if (!alertEl) return;
    alertEl.textContent = message;
    alertEl.className = `auth-alert ${type}`;
    alertEl.classList.remove('hidden');
  }

  function clearAlert() {
    if (!alertEl) return;
    alertEl.textContent = '';
    alertEl.classList.add('hidden');
  }

  // Diagnostic: check if Firebase client failed initialization on load
  document.addEventListener('firebaseConfigFailed', (e) => {
    console.warn('[LostLink Auth] firebaseConfigFailed event received:', e.detail);
    const detailMsg = e.detail?.error || 'Firebase client credentials are not configured in .env.';
    showAlert(`Firebase Configuration Required: ${detailMsg}`);
  });

  if (googleBtn) {
    googleBtn.addEventListener('click', async () => {
      clearAlert();

      googleBtn.disabled = true;
      const originalText = btnText.textContent;
      btnText.textContent = 'Connecting...';

      console.log('[LostLink Auth] User clicked "Continue with VIT Google Account"');

      try {
        await LostLink.signInWithGoogle();
      } catch (err) {
        googleBtn.disabled = false;
        btnText.textContent = originalText;

        // Always log the full raw Firebase error — do NOT suppress it.
        // Check DevTools Console for the exact code and message.
        console.error('[LostLink] Firebase Auth Error (raw):', {
          code: err.code,
          message: err.message,
          name: err.name,
          stack: err.stack,
          fullError: err
        });

        let userMsg = '';
        switch (err.code) {
          case 'auth/not-initialized':
            userMsg = err.message || 'Firebase Authentication is not configured. Please set your Firebase credentials in the server .env file.';
            break;
          case 'auth/operation-not-allowed':
            userMsg = 'Google Sign-In is not enabled in Firebase Console. Go to Authentication \u2192 Sign-in method \u2192 Google and enable it.';
            break;
          case 'auth/unauthorized-domain':
            userMsg = `This domain ("${window.location.hostname}") is not authorized. Add it in Firebase Console \u2192 Authentication \u2192 Settings \u2192 Authorized Domains.`;
            break;
          case 'auth/invalid-api-key':
            userMsg = 'Invalid Firebase API Key. Please verify FIREBASE_CLIENT_API_KEY in your .env file.';
            break;
          case 'auth/configuration-not-found':
            userMsg = 'Firebase project configuration was not found. Please verify your Firebase project credentials in .env.';
            break;
          case 'auth/popup-blocked':
            userMsg = 'The sign-in popup was blocked by your browser. Please allow popups for this site and try again.';
            break;
          case 'auth/popup-closed-by-user':
          case 'auth/cancelled-popup-request':
            // NOTE: This error also fires when COOP headers sever window.opener.
            // If you see this without closing the popup, check the server\'s
            // Cross-Origin-Opener-Policy response header (must NOT be same-origin).
            userMsg = 'Sign-in was cancelled. Please try again.';
            break;
          case 'auth/network-request-failed':
            userMsg = 'Network connection failed. Please check your internet connection and try again.';
            break;
          case 'auth/invalid-domain':
            userMsg = 'Access denied: Only VIT student email accounts (@vitstudent.ac.in) are permitted to sign in.';
            break;
          case 'auth/internal-error':
            // Often caused by cross-origin issues or malformed OAuth callback
            userMsg = `Authentication encountered an internal error. Check the browser console for details. (${err.code})`;
            break;
          default:
            if (err.message && err.message.includes('@vitstudent.ac.in')) {
              userMsg = 'Access denied: Only VIT student email accounts (@vitstudent.ac.in) are permitted to sign in.';
            } else if (err.code && err.message) {
              // Surface real unknown errors — never hide them
              userMsg = `${err.message} (${err.code})`;
            } else if (err.message) {
              userMsg = err.message;
            } else {
              userMsg = 'Authentication failed. Check the browser Developer Console (F12) for the exact error.';
            }
        }

        showAlert(userMsg);
      }
    });
  }
});
