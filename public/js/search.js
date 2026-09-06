/**
 * LostLink — Find My Item Search Script
 * Real Firestore found item search with deterministic matching and optional AI enhancement.
 * Zero fabricated results.
 */

document.addEventListener('DOMContentLoaded', async () => {
  LostLink.initNavToggle();

  // Load both community sections concurrently from real Firestore data
  loadCommunitySection('found', 'foundContainer', 'foundCountBadge');
  loadCommunitySection('lost', 'lostContainer', 'lostCountBadge');

  // If page loaded with ?tab=lost or ?tab=found, smoothly scroll to that section
  const params = new URLSearchParams(window.location.search);
  const targetTab = params.get('tab');
  if (targetTab === 'lost') {
    setTimeout(() => {
      const lostSec = document.getElementById('lostReportsSection');
      if (lostSec) lostSec.scrollIntoView({ behavior: 'smooth' });
    }, 400);
  } else if (targetTab === 'found') {
    setTimeout(() => {
      const foundSec = document.getElementById('foundReportsSection');
      if (foundSec) foundSec.scrollIntoView({ behavior: 'smooth' });
    }, 400);
  }
});

/**
 * Load campus-wide reports (found or lost) from real Firestore data
 */
async function loadCommunitySection(type, containerId, badgeId) {
  const container = document.getElementById(containerId);
  const badgeEl = document.getElementById(badgeId);

  try {
    const data = await LostLink.api(`/api/reports?type=${type}&limit=30`);
    const items = (data.items || []).filter(item => item.status !== 'resolved' && item.status !== 'closed');

    if (badgeEl) {
      badgeEl.textContent = `${items.length} active`;
    }

    if (!container) return;

    if (items.length === 0) {
      container.innerHTML = `
        <div class="empty-state" style="grid-column: 1 / -1;">
          <p class="empty-state-title">No ${type} reports active on campus right now.</p>
        </div>
      `;
      return;
    }

    renderCommunityCards(items, type, container);
  } catch (err) {
    console.error(`Error loading ${type} reports:`, err);
    if (container) {
      container.innerHTML = `
        <div class="empty-state" style="grid-column: 1 / -1;">
          <p class="empty-state-title">Unable to load ${type} reports.</p>
        </div>
      `;
    }
  }
}

/**
 * Render campus-wide lost or found cards with privacy preserved
 */
function renderCommunityCards(items, type, container) {
  if (!container) return;
  const isFound = type === 'found';

  container.innerHTML = items.map(item => {
    const locationPrefix = isFound ? 'Found near' : 'Last seen near';
    const badgeHtml = isFound
      ? `<span class="badge badge-success">Found Report</span>`
      : `<span class="badge badge-warning">Lost Report</span>`;

    return `
      <a href="item-details.html?id=${item.id}" class="item-card">
        ${item.imageUrl ? `
          <div class="card-image-wrap" title="Click to view full photo" onclick="event.preventDefault(); event.stopPropagation(); LostLink.openImageModal('${LostLink.sanitize(item.imageUrl)}', '${LostLink.sanitize(item.title)}')">
            <img src="${LostLink.sanitize(item.imageUrl)}" alt="${LostLink.sanitize(item.title)}">
          </div>
        ` : ''}
        <div class="card-content">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; margin-bottom: 6px;">
            <h3 class="card-item-title">${LostLink.sanitize(item.title || (isFound ? 'Found Item' : 'Lost Item'))}</h3>
            ${badgeHtml}
          </div>
          <p class="card-item-location">${locationPrefix}: ${LostLink.sanitize(item.location || 'Campus')}</p>
          <p class="card-item-desc">${LostLink.sanitize(item.description || '')}</p>
          <div class="card-item-meta">
            <span>Date: ${LostLink.formatDate(item.date || item.createdAt)}</span>
            ${item.color ? `<span>Colour: ${LostLink.sanitize(item.color)}</span>` : ''}
            ${isFound ? `<span>${LostLink.getStatusBadge(item.currentStatus, item.securityDetails)}</span>` : ''}
          </div>
        </div>
      </a>
    `;
  }).join('');
}

/**
 * Execute Search on Real Firestore Found Reports
 */
window.performSearch = async function() {
  const queryInput = document.getElementById('searchQuery');
  const query = queryInput ? queryInput.value.trim() : '';

  if (!query) {
    LostLink.showToast('Please describe what you lost.', 'warning');
    return;
  }

  const resultsSection = document.getElementById('searchResultsSection');
  const container = document.getElementById('searchResultsContainer');
  const countEl = document.getElementById('searchResultsCount');
  const searchBtn = document.getElementById('searchBtn');

  const location = document.getElementById('filterLocation')?.value.trim() || '';
  const color = document.getElementById('filterColor')?.value.trim() || '';
  const date = document.getElementById('filterDate')?.value || '';

  LostLink.setLoading(searchBtn, true, 'Finding matches...');

  if (resultsSection) {
    resultsSection.classList.remove('hidden');
    resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  if (container) {
    container.innerHTML = `
      <div class="search-loading-state" style="grid-column: 1 / -1; padding: var(--space-8); text-align: center;">
        <div class="loading-spinner"></div>
        <p class="text-secondary text-sm" style="margin-top: var(--space-2);">Finding matches from campus found reports...</p>
      </div>
    `;
  }

  try {
    const res = await LostLink.api('/api/matches/find', {
      method: 'POST',
      body: JSON.stringify({
        query,
        filters: {
          location: location || undefined,
          color: color || undefined,
          date: date || undefined
        }
      })
    });

    const matches = res.matches || [];

    if (countEl) {
      countEl.textContent = matches.length > 0 ? `${matches.length} matching found items` : '0 matches';
    }

    if (!container) return;

    if (matches.length === 0) {
      container.innerHTML = `
        <div class="empty-state" style="grid-column: 1 / -1;">
          <h3 class="empty-state-title">Item not found yet</h3>
          <p class="empty-state-desc">No matching found item has been reported yet on campus.</p>
          <div style="margin-top: var(--space-4);">
            <a href="report-lost.html" class="btn btn-primary btn-sm">Report Lost Item</a>
          </div>
        </div>
      `;
      return;
    }

    renderSuggestionCards(matches, container);
  } catch (err) {
    console.error('Search error:', err);
    if (container) {
      container.innerHTML = `
        <div class="empty-state" style="grid-column: 1 / -1;">
          <h3 class="empty-state-title">Item not found yet</h3>
          <p class="empty-state-desc">No matching found item has been reported yet.</p>
          <div style="margin-top: var(--space-4);">
            <a href="report-lost.html" class="btn btn-primary btn-sm">Report Lost Item</a>
          </div>
        </div>
      `;
    }
  } finally {
    LostLink.setLoading(searchBtn, false);
  }
};

/**
 * Render concise matching suggestion cards
 */
function renderSuggestionCards(matches, container) {
  if (!container) return;

  container.innerHTML = matches.map(m => {
    const score = Math.round(m.score || 0);

    return `
      <a href="item-details.html?id=${m.id}" class="suggestion-card">
        ${m.imageUrl ? `
          <div class="card-image-wrap" title="Click to view full photo" onclick="event.preventDefault(); event.stopPropagation(); LostLink.openImageModal('${LostLink.sanitize(m.imageUrl)}', '${LostLink.sanitize(m.title)}')">
            <img src="${LostLink.sanitize(m.imageUrl)}" alt="${LostLink.sanitize(m.title)}">
          </div>
        ` : ''}
        <div class="card-content">
          <div class="suggestion-header">
            <div>
              <h3 class="card-item-title">${LostLink.sanitize(m.title || 'Found Item')}</h3>
              <p class="card-item-location">Found near: ${LostLink.sanitize(m.location || 'Campus')}</p>
            </div>
            <div class="match-score-badge">
              Match - ${score}%
            </div>
          </div>

          <div class="suggestion-signals">
            <span class="signal-tag">Description: ${LostLink.sanitize(m.descriptionMatch || 'Match')}</span>
            ${m.photoVerification ? `
              <span class="signal-tag ${m.photoVerification === 'Inconsistent' ? 'signal-conflict' : (m.photoVerification === 'Consistent' ? 'signal-verified' : '')}">Photo: ${LostLink.sanitize(m.photoVerification)}</span>
            ` : ''}
          </div>

          ${m.conflictingEvidence ? `
            <div class="conflict-notice">
              Conflicting visual evidence: Description matches, but photos depict different characteristics.
            </div>
          ` : ''}

          ${m.reason ? `
            <div class="suggestion-reason">
              <strong>Match reason:</strong> ${LostLink.sanitize(m.reason)}
            </div>
          ` : ''}

          <div class="card-item-meta">
            <span>Date: ${LostLink.formatDate(m.date)}</span>
            <span>${LostLink.getStatusBadge(m.currentStatus, m.securityDetails)}</span>
          </div>
        </div>
      </a>
    `;
  }).join('');
}

/**
 * Dismiss Search Results section
 */
window.dismissSearchResults = function() {
  const sec = document.getElementById('searchResultsSection');
  if (sec) sec.classList.add('hidden');
};

/**
 * Clear optional filters
 */
window.clearFilters = function() {
  const queryInput = document.getElementById('searchQuery');
  const loc = document.getElementById('filterLocation');
  const col = document.getElementById('filterColor');
  const dt = document.getElementById('filterDate');
  if (queryInput) queryInput.value = '';
  if (loc) loc.value = '';
  if (col) col.value = '';
  if (dt) dt.value = '';
  dismissSearchResults();
};

