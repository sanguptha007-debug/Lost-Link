/**
 * LostLink — Shared Utility Functions
 * Zero emojis, zero category dependencies, standardized status helpers.
 */

window.LostLink = window.LostLink || {};

LostLink.API_BASE = '';

/**
 * Conservative extraction of VIT Registration Number from email
 * E.g. santhosh.21bce1234@vitstudent.ac.in -> 21BCE1234
 * If format does not cleanly match, returns '' for manual student entry
 */
LostLink.extractVitRegNo = function(email) {
  if (!email || typeof email !== 'string') return '';
  const clean = email.toLowerCase().trim();
  const localPart = clean.split('@')[0];
  const match = localPart.match(/([0-9]{2}[a-z]{2,4}[0-9]{4,5})/i);
  return match ? match[1].toUpperCase() : '';
};

/**
 * Validate VIT student email
 */
LostLink.validateVITEmail = function(email) {
  if (!email) return 'Email is required.';
  const clean = email.toLowerCase().trim();
  if (!clean.endsWith('@vitstudent.ac.in')) {
    return 'Only VIT student emails (@vitstudent.ac.in) are authorized.';
  }
  return null;
};

/**
 * Validate phone number
 */
LostLink.validatePhone = function(phone) {
  if (!phone) return 'Phone number is mandatory.';
  const clean = phone.replace(/[\s-]/g, '');
  if (!/^[+]?[0-9]{10,15}$/.test(clean)) {
    return 'Please enter a valid 10-digit phone number.';
  }
  return null;
};

/**
 * Standardized status display mapping
 */
LostLink.statusLabels = {
  'at_found_location': 'At place where found',
  'with_finder': 'With finder',
  'with_security': 'With security',
  'returned_to_owner': 'Returned to owner'
};

LostLink.getStatusBadge = function(status, details) {
  if (!status) return '';
  const label = LostLink.statusLabels[status] || status;
  let extra = '';
  if (status === 'with_security' && details) {
    extra = ` - ${LostLink.sanitize(details)}`;
  }
  return `<span class="badge badge-status">${LostLink.sanitize(label)}${extra}</span>`;
};

/**
 * Make authenticated API call
 */
LostLink.api = async function(endpoint, options = {}) {
  const url = `${LostLink.API_BASE}${endpoint}`;
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers
  };

  if (LostLink.getAuthToken) {
    const token = await LostLink.getAuthToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  }

  const config = {
    ...options,
    headers
  };

  if (options.body instanceof FormData) {
    delete headers['Content-Type'];
  }

  try {
    let response = await fetch(url, config);

    // If 401 and student is logged in, attempt a single token refresh before erroring
    if (response.status === 401 && !options._retried && LostLink.auth && LostLink.auth.currentUser) {
      try {
        const freshToken = await LostLink.auth.currentUser.getIdToken(true);
        if (freshToken) {
          headers['Authorization'] = `Bearer ${freshToken}`;
          response = await fetch(url, { ...config, headers, _retried: true });
        }
      } catch (refreshErr) {
        console.warn('[LostLink] Token refresh error:', refreshErr.message);
      }
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      // Standardize user-facing error message
      const error = new Error(errorData.error || 'Service is temporarily unavailable. Please try again later.');
      error.status = response.status;
      error.data = errorData;
      throw error;
    }

    return response.json();
  } catch (err) {
    if (err.name === 'TypeError' && err.message.includes('fetch')) {
      throw new Error('Service is temporarily unavailable. Please try again later.');
    }
    throw err;
  }
};

/**
 * Toast Notifications (Zero Emojis)
 */
LostLink.toastContainer = null;

LostLink.showToast = function(message, type = 'info', duration = 3500) {
  if (!LostLink.toastContainer) {
    LostLink.toastContainer = document.createElement('div');
    LostLink.toastContainer.className = 'toast-container';
    document.body.appendChild(LostLink.toastContainer);
  }

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <span class="toast-message">${LostLink.sanitize(message)}</span>
    <button type="button" class="toast-close" onclick="this.parentElement.remove()" aria-label="Close">&times;</button>
  `;

  LostLink.toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('toast-exit');
    setTimeout(() => toast.remove(), 250);
  }, duration);

  return toast;
};

/**
 * Button Loading States
 */
LostLink.setLoading = function(button, loading, text) {
  if (!button) return;
  if (loading) {
    button.disabled = true;
    button.dataset.originalText = button.innerHTML;
    button.innerHTML = `<span class="loading-spinner spinner-white"></span> ${text || 'Please wait...'}`;
  } else {
    button.disabled = false;
    button.innerHTML = button.dataset.originalText || button.innerHTML;
  }
};

/**
 * Sanitization
 */
LostLink.sanitize = function(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
};

/**
 * Date Formatting
 */
LostLink.formatDate = function(dateStr) {
  if (!dateStr) return 'Recent';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return dateStr;
  return date.toLocaleDateString('en-IN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
};

/**
 * URL Parameter Helper
 */
LostLink.getQueryParam = function(name) {
  const params = new URLSearchParams(window.location.search);
  return params.get(name);
};

/**
 * Fullscreen Image Lightbox Modal
 * Displays complete image at large readable size, uncropped, with aspect ratio preserved.
 * Supports X button, clicking backdrop, and Escape key.
 */
LostLink.openImageModal = function(src, alt) {
  if (!src) return;

  let modal = document.getElementById('lostLinkLightboxModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'lostLinkLightboxModal';
    modal.className = 'lightbox-backdrop';
    modal.innerHTML = `
      <div class="lightbox-container" onclick="event.stopPropagation()">
        <button type="button" class="lightbox-close" aria-label="Close image preview" onclick="LostLink.closeImageModal()">&times;</button>
        <img id="lightboxImg" class="lightbox-image" src="" alt="">
        <div id="lightboxCaption" class="lightbox-caption"></div>
      </div>
    `;
    modal.addEventListener('click', () => LostLink.closeImageModal());
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modal.classList.contains('active')) {
        LostLink.closeImageModal();
      }
    });
    document.body.appendChild(modal);
  }

  const img = document.getElementById('lightboxImg');
  const caption = document.getElementById('lightboxCaption');
  if (img) {
    img.src = src;
    img.alt = alt || 'Item photo preview';
  }
  if (caption) {
    caption.textContent = alt || '';
  }

  modal.classList.add('active');
  document.body.style.overflow = 'hidden';
};

LostLink.closeImageModal = function() {
  const modal = document.getElementById('lostLinkLightboxModal');
  if (modal) {
    modal.classList.remove('active');
    document.body.style.overflow = '';
  }
};

/**
 * Universal Mobile Navigation Handler
 */
LostLink.initNavToggle = function() {
  const navToggle = document.getElementById('navToggle');
  const navMenu = document.getElementById('navMenu');
  if (!navToggle || !navMenu || navToggle._navBound) return;
  navToggle._navBound = true;

  navToggle.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = navMenu.classList.toggle('open');
    navToggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
  });

  document.addEventListener('click', (e) => {
    if (navMenu.classList.contains('open') && !navMenu.contains(e.target) && e.target !== navToggle) {
      navMenu.classList.remove('open');
      navToggle.setAttribute('aria-expanded', 'false');
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && navMenu.classList.contains('open')) {
      navMenu.classList.remove('open');
      navToggle.setAttribute('aria-expanded', 'false');
    }
  });
};

document.addEventListener('DOMContentLoaded', () => {
  LostLink.initNavToggle();
});

