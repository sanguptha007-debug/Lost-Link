/**
 * LostLink — Item Details, AI Suggestions & Possession Status Management
 */

let currentItem = null;

document.addEventListener('DOMContentLoaded', () => {
  LostLink.initNavToggle();

  const itemId = LostLink.getQueryParam('id');
  if (!itemId) {
    window.location.href = '/find-items.html';
    return;
  }

  loadItemDetails(itemId);
});

async function loadItemDetails(itemId) {
  const container = document.getElementById('itemDetailContainer');

  try {
    const data = await LostLink.api(`/api/reports/${itemId}`);
    currentItem = data.item;

    if (!currentItem) {
      container.innerHTML = `
        <div class="empty-state">
          <h3 class="empty-state-title">Report Not Found</h3>
          <p class="empty-state-desc">This item may have been resolved or deleted.</p>
          <div style="margin-top: var(--space-4);">
            <a href="find-items.html" class="btn btn-primary btn-sm">Browse Items</a>
          </div>
        </div>
      `;
      return;
    }

    renderItemDetails(currentItem);

    if (currentItem.type === 'lost' && currentItem.isOwner) {
      loadAIMatchesForLostItem(currentItem.id);
    }
  } catch (err) {
    console.error('Error fetching item details:', err);
    container.innerHTML = `
      <div class="empty-state">
        <h3 class="empty-state-title">Item not found</h3>
        <p class="empty-state-desc">Unable to load item details.</p>
      </div>
    `;
  }
}

function renderItemDetails(item) {
  const container = document.getElementById('itemDetailContainer');
  const isFound = item.type === 'found';
  const isOwner = !!item.isOwner;

  const typeLabel = isFound ? 'Found Report' : 'Lost Report';
  const statusBadge = LostLink.getStatusBadge(item.currentStatus, item.securityDetails);

  container.innerHTML = `
    <div class="item-details-layout">
      <!-- Left Column: Photo & Status -->
      <div class="item-visual-column">
        ${item.imageUrl ? `
          <div class="item-large-photo" style="cursor: zoom-in;" title="Click to view full image" onclick="LostLink.openImageModal('${LostLink.sanitize(item.imageUrl)}', '${LostLink.sanitize(item.title)}')">
            <img src="${LostLink.sanitize(item.imageUrl)}" alt="${LostLink.sanitize(item.title)}">
          </div>
        ` : `
          <div class="item-photo-placeholder">
            <span>No photo attached</span>
          </div>
        `}

        <!-- Finder-Side Status Updater -->
        ${(isFound && isOwner) ? `
          <div class="finder-status-updater" style="margin-top: var(--space-4);">
            <h4 class="updater-title">Update Possession Status</h4>
            <form id="finderStatusUpdateForm" onsubmit="event.preventDefault(); updateFinderItemStatus();">
              <div class="form-group" style="margin-bottom: var(--space-3);">
                <label for="updateCurrentStatus" class="form-label">Current Location / State:</label>
                <select id="updateCurrentStatus" class="form-select" onchange="toggleSecurityDetailsField(this.value)">
                  <option value="with_finder" ${item.currentStatus === 'with_finder' ? 'selected' : ''}>With finder</option>
                  <option value="at_found_location" ${item.currentStatus === 'at_found_location' ? 'selected' : ''}>At place where found</option>
                  <option value="with_security" ${item.currentStatus === 'with_security' ? 'selected' : ''}>With security</option>
                  <option value="returned_to_owner" ${item.currentStatus === 'returned_to_owner' ? 'selected' : ''}>Returned to owner</option>
                </select>
              </div>

              <div id="updateSecurityDetailsWrap" class="${item.currentStatus === 'with_security' ? '' : 'hidden'}" style="margin-bottom: var(--space-3);">
                <label for="updateSecurityDetails" class="form-label">Security Location / Details:</label>
                <input 
                  type="text" 
                  id="updateSecurityDetails" 
                  class="form-input" 
                  value="${LostLink.sanitize(item.securityDetails || '')}" 
                  placeholder="e.g. SJT Ground Floor Security Desk"
                >
              </div>

              <button type="submit" id="updateStatusBtn" class="btn btn-primary btn-sm btn-block">
                Save Status
              </button>
            </form>
          </div>
        ` : (isFound && statusBadge ? `
          <div style="padding: 12px; background: var(--gray-50); border: 1px solid var(--gray-200); border-radius: var(--radius-lg); margin-top: var(--space-4);">
            <span class="text-xs text-secondary" style="display: block; margin-bottom: 4px;">Possession Status:</span>
            <div>${statusBadge}</div>
          </div>
        ` : '')}
      </div>

      <!-- Right Column: Details & Actions -->
      <div class="item-info-column">
        <div class="info-card">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: var(--space-3);">
            <div>
              <span class="badge badge-neutral">${typeLabel}</span>
              <span class="badge badge-${item.status === 'resolved' ? 'success' : 'neutral'}">${item.status === 'resolved' ? 'Resolved' : 'Active'}</span>
            </div>
          </div>

          <h1 class="item-title">${LostLink.sanitize(item.title)}</h1>

          <div class="item-meta-row">
            <span>Location: ${LostLink.sanitize(item.location || 'Campus')}</span>
            <span>Date: ${LostLink.formatDate(item.date)}</span>
            ${item.color ? `<span>Colour: ${LostLink.sanitize(item.color)}</span>` : ''}
          </div>

          <div class="item-description-block">
            <h4 class="text-xs text-secondary" style="margin-bottom: 4px;">Description:</h4>
            <p>${LostLink.sanitize(item.description)}</p>
          </div>

          <div style="margin-top: var(--space-6); border-top: 1px solid var(--gray-200); padding-top: var(--space-4);">
            ${!isOwner ? `
              <button type="button" class="btn btn-primary btn-block" onclick="openContactModal()">
                Request Contact
              </button>
            ` : `
              <button type="button" class="btn btn-outline btn-sm" onclick="markReportResolved('${item.id}')">
                ${item.status === 'resolved' ? 'Report Resolved' : 'Mark as Resolved'}
              </button>
            `}
          </div>
        </div>

        <!-- AI Suggestions (for owner of lost item) -->
        ${(item.type === 'lost' && isOwner) ? `
          <div class="info-card" style="margin-top: var(--space-4);">
            <h3 class="suggestions-title">AI Suggested Matches</h3>
            <p class="text-xs text-secondary" style="margin-bottom: var(--space-4);">
              Real campus found reports semantically matching your description:
            </p>
            <div id="aiMatchesList">
              <div style="text-align: center; padding: 20px;">
                <div class="loading-spinner" style="margin: 0 auto 8px;"></div>
                <span class="text-xs text-secondary">Checking for matches...</span>
              </div>
            </div>
          </div>
        ` : ''}
      </div>
    </div>
  `;
}

window.toggleSecurityDetailsField = function(val) {
  const wrap = document.getElementById('updateSecurityDetailsWrap');
  if (wrap) {
    if (val === 'with_security') {
      wrap.classList.remove('hidden');
      document.getElementById('updateSecurityDetails')?.focus();
    } else {
      wrap.classList.add('hidden');
    }
  }
};

window.updateFinderItemStatus = async function() {
  if (!currentItem) return;

  const select = document.getElementById('updateCurrentStatus');
  const detailsInput = document.getElementById('updateSecurityDetails');
  const btn = document.getElementById('updateStatusBtn');

  const currentStatus = select ? select.value : 'with_finder';
  const securityDetails = detailsInput ? detailsInput.value.trim() : '';

  if (currentStatus === 'with_security' && !securityDetails) {
    LostLink.showToast('Please specify the security location.', 'warning');
    detailsInput?.focus();
    return;
  }

  LostLink.setLoading(btn, true, 'Saving...');

  try {
    const res = await LostLink.api(`/api/reports/${currentItem.id}`, {
      method: 'PUT',
      body: JSON.stringify({
        currentStatus,
        securityDetails: currentStatus === 'with_security' ? securityDetails : ''
      })
    });

    if (res.success) {
      LostLink.showToast('Status updated.', 'success');
      loadItemDetails(currentItem.id);
    }
  } catch (err) {
    console.error('Update status error:', err);
    LostLink.showToast(err.message || 'Service is temporarily unavailable. Please try again later.', 'error');
    LostLink.setLoading(btn, false);
  }
};

window.markReportResolved = async function(id) {
  if (!confirm('Mark this report as resolved?')) return;

  try {
    await LostLink.api(`/api/reports/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ status: 'resolved', currentStatus: 'returned_to_owner' })
    });
    LostLink.showToast('Report marked as resolved.', 'success');
    loadItemDetails(id);
  } catch (err) {
    LostLink.showToast(err.message || 'Service is temporarily unavailable. Please try again later.', 'error');
  }
};

async function loadAIMatchesForLostItem(itemId) {
  const container = document.getElementById('aiMatchesList');
  if (!container) return;

  try {
    const res = await LostLink.api('/api/matches/find', {
      method: 'POST',
      body: JSON.stringify({ itemId })
    });

    const matches = res.matches || [];

    if (matches.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 16px; background: var(--gray-50); border-radius: var(--radius-lg);">
          <p class="text-xs text-secondary" style="margin: 0;">No matching found items reported yet.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = matches.slice(0, 5).map(m => {
      const score = Math.round(m.score || 0);

      return `
        <div class="suggestion-card" style="margin-bottom: var(--space-3);">
          ${m.imageUrl ? `
            <div class="card-image-wrap" style="height: 100px; cursor: zoom-in;" title="Click to view full image" onclick="LostLink.openImageModal('${LostLink.sanitize(m.imageUrl)}', '${LostLink.sanitize(m.title)}')">
              <img src="${LostLink.sanitize(m.imageUrl)}" alt="${LostLink.sanitize(m.title)}">
            </div>
          ` : ''}
          <div class="card-content">
            <div class="suggestion-header">
              <div>
                <h4 class="card-item-title">${LostLink.sanitize(m.title)}</h4>
                <p class="card-item-location">Found near: ${LostLink.sanitize(m.location || 'Campus')}</p>
              </div>
              <div class="match-score-badge">
                Possible Match - ${score}%
              </div>
            </div>

            <div class="suggestion-signals">
              <span class="signal-tag">Description Match: ${LostLink.sanitize(m.descriptionMatch || 'Strong')}</span>
              ${m.photoVerification ? `
                <span class="signal-tag">Photo Verification: ${LostLink.sanitize(m.photoVerification)}</span>
              ` : ''}
            </div>

            ${m.reason ? `
              <div class="suggestion-reason">
                <strong>Why this was suggested:</strong> "${LostLink.sanitize(m.reason)}"
              </div>
            ` : ''}

            <div style="display: flex; justify-content: flex-end; margin-top: 8px;">
              <a href="item-details.html?id=${m.id}" class="btn btn-outline btn-xs">View Report</a>
            </div>
          </div>
        </div>
      `;
    }).join('');
  } catch (err) {
    console.error('Error fetching AI matches:', err);
    container.innerHTML = `
      <div style="text-align: center; padding: 12px; font-size: 0.8rem; color: var(--text-secondary);">
        Suggestions currently unavailable.
      </div>
    `;
  }
}

window.openContactModal = function() {
  document.getElementById('contactModal')?.classList.remove('hidden');
};

window.closeContactModal = function() {
  document.getElementById('contactModal')?.classList.add('hidden');
};

window.submitContactRequest = async function() {
  if (!currentItem) return;

  const msgInput = document.getElementById('contactMessage');
  const btn = document.getElementById('sendReqBtn');
  const message = msgInput ? msgInput.value.trim() : '';

  LostLink.setLoading(btn, true, 'Sending...');

  try {
    const res = await LostLink.api('/api/contact/request', {
      method: 'POST',
      body: JSON.stringify({
        itemId: currentItem.id,
        toUserId: currentItem.userId,
        message
      })
    });

    if (res.success) {
      LostLink.showToast('Contact request sent.', 'success');
      closeContactModal();
      if (msgInput) msgInput.value = '';
    }
  } catch (err) {
    console.error('Contact error:', err);
    LostLink.showToast(err.message || 'Service is temporarily unavailable. Please try again later.', 'error');
  } finally {
    LostLink.setLoading(btn, false);
  }
};
