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

/**
 * Duplicate Report Warning Dialog
 * Shows suspected duplicate reports and allows student to review or submit anyway.
 */
LostLink.showDuplicateWarningModal = function(matches, onConfirmSubmit) {
  const existing = document.getElementById('duplicateWarningModal');
  if (existing) existing.remove();

  let primaryMatch = {};
  if (Array.isArray(matches) && matches.length > 0) {
    primaryMatch = matches[0];
  } else if (matches && typeof matches === 'object') {
    primaryMatch = matches;
  }
  const similarity = Math.round(primaryMatch.similarity || (primaryMatch.score ? primaryMatch.score * 100 : 70));

  const modalHtml = `
    <div id="duplicateWarningModal" class="duplicate-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="dupModalTitle">
      <div class="duplicate-modal-card">
        <div class="duplicate-modal-header">
          <div class="duplicate-warning-icon">⚠️</div>
          <div>
            <h3 id="dupModalTitle">Potential Duplicate Report</h3>
            <p>An existing report with very similar details was found on campus.</p>
          </div>
        </div>

        <div class="duplicate-match-box">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
            <div class="duplicate-match-title">${LostLink.sanitize(primaryMatch.title || 'Similar Report')}</div>
            <span class="badge badge-warning">${similarity}% Similarity</span>
          </div>
          <div class="duplicate-match-meta">
            <span>Location: ${LostLink.sanitize(primaryMatch.location || 'Campus')}</span> • 
            <span>Date: ${LostLink.formatDate(primaryMatch.date)}</span>
          </div>
          <p class="duplicate-match-desc">${LostLink.sanitize(primaryMatch.description || '')}</p>
          ${primaryMatch.id ? `<div style="margin-top: 8px;"><a href="item-details.html?id=${primaryMatch.id}" target="_blank" class="notif-action-link">View Existing Report in new tab &rarr;</a></div>` : ''}
        </div>

        <p style="font-size: var(--text-xs); color: var(--gray-500); line-height: 1.5;">
          If this is genuinely a different item or instance, you can submit anyway. Duplicate listings make it harder for students to recover lost belongings.
        </p>

        <div class="duplicate-actions">
          <button type="button" class="btn btn-ghost" id="dupCancelBtn">Cancel & Edit</button>
          <button type="button" class="btn btn-primary" id="dupConfirmBtn">Submit Anyway</button>
        </div>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML('beforeend', modalHtml);
  const modalEl = document.getElementById('duplicateWarningModal');

  const cleanup = () => {
    if (modalEl) modalEl.remove();
  };

  const cancelBtn = document.getElementById('dupCancelBtn');
  if (cancelBtn) cancelBtn.addEventListener('click', cleanup);

  const confirmBtn = document.getElementById('dupConfirmBtn');
  if (confirmBtn) {
    confirmBtn.addEventListener('click', () => {
      cleanup();
      if (typeof onConfirmSubmit === 'function') {
        onConfirmSubmit();
      }
    });
  }
};

/**
 * Accessible Report Deletion Confirmation Modal
 * Shows clear modal identifying the report by title before deletion.
 * Server strictly verifies identity via authenticated Bearer token.
 */
LostLink.confirmReportDeletion = function(optionsOrId, optTitle, optType, optOnConfirmed) {
  let reportId, title, type, onConfirmed;
  if (typeof optionsOrId === 'object' && optionsOrId !== null) {
    reportId = optionsOrId.reportId || optionsOrId.id;
    title = optionsOrId.title;
    type = optionsOrId.type || 'report';
    onConfirmed = optionsOrId.onConfirmed;
  } else {
    reportId = optionsOrId;
    title = optTitle;
    type = optType || 'report';
    onConfirmed = optOnConfirmed;
  }

  if (!reportId) {
    console.error('[LostLink] confirmReportDeletion called without valid reportId');
    LostLink.showToast('Unable to identify report for deletion.', 'error');
    return;
  }

  const existing = document.getElementById('deleteConfirmModal');
  if (existing) existing.remove();

  const typeName = type === 'lost' ? 'Lost Report' : (type === 'found' ? 'Found Report' : 'Report');

  const modalHtml = `
    <div id="deleteConfirmModal" class="duplicate-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="deleteModalTitle">
      <div class="duplicate-modal-card">
        <div class="duplicate-modal-header">
          <div class="duplicate-warning-icon" style="background: var(--danger-light); color: var(--danger); border-color: var(--danger-border);">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/>
            </svg>
          </div>
          <div>
            <h3 id="deleteModalTitle">Delete ${LostLink.sanitize(typeName)}</h3>
            <p style="margin-top: 2px;">This action cannot be undone.</p>
          </div>
        </div>

        <div class="duplicate-match-box" style="border-left: 3px solid var(--danger);">
          <div class="duplicate-match-title" style="font-size: var(--text-base);">${LostLink.sanitize(title || 'This Report')}</div>
          <p class="duplicate-match-desc" style="margin: 6px 0 0; line-height: 1.5;">
            Are you sure you want to permanently delete this report listing? Any uploaded photo for this report will also be safely removed.
          </p>
        </div>

        <div id="deleteModalError" class="auth-alert hidden" style="margin-bottom: var(--space-4);"></div>

        <div class="duplicate-actions">
          <button type="button" class="btn btn-ghost" id="cancelDeleteBtn">Cancel</button>
          <button type="button" class="btn btn-danger" id="confirmDeleteBtn" style="background: var(--danger); color: #ffffff; border-color: var(--danger);">
            Delete Report
          </button>
        </div>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML('beforeend', modalHtml);
  const modalEl = document.getElementById('deleteConfirmModal');
  const cancelBtn = document.getElementById('cancelDeleteBtn');
  const confirmBtn = document.getElementById('confirmDeleteBtn');
  const errorBox = document.getElementById('deleteModalError');

  const close = () => {
    if (modalEl) modalEl.remove();
  };

  cancelBtn.addEventListener('click', close);

  const escHandler = (e) => {
    if (e.key === 'Escape') {
      close();
      document.removeEventListener('keydown', escHandler);
    }
  };
  document.addEventListener('keydown', escHandler);

  confirmBtn.addEventListener('click', async () => {
    LostLink.setLoading(confirmBtn, true, 'Deleting...');
    cancelBtn.disabled = true;
    errorBox.classList.add('hidden');

    try {
      await LostLink.api(`/api/reports/${reportId}`, { method: 'DELETE' });
      close();
      LostLink.showToast('Report deleted successfully.', 'success');
      if (typeof onConfirmed === 'function') {
        onConfirmed();
      }
    } catch (err) {
      LostLink.setLoading(confirmBtn, false);
      cancelBtn.disabled = false;
      errorBox.textContent = err.message || 'Failed to delete report. Please try again.';
      errorBox.classList.remove('hidden');
    }
  });
};



