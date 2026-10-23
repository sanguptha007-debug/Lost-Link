/**
 * LostLink — My Found Reports Script
 * Displays student's own found reports and allows live possession status updates.
 */

document.addEventListener('DOMContentLoaded', () => {
  const navToggle = document.getElementById('navToggle');
  const navMenu = document.getElementById('navMenu');
  if (navToggle && navMenu) {
    navToggle.addEventListener('click', () => navMenu.classList.toggle('open'));
  }

  LostLink.onAuthStateChanged(async (user) => {
    if (!user) {
      const list = document.getElementById('foundReportsList');
      if (list) {
        list.innerHTML = `
          <div class="empty-state">
            <h3 class="empty-state-title">Sign In Required</h3>
            <p class="empty-state-desc">Please sign in with your VIT student account to view your found reports.</p>
            <div style="margin-top: var(--space-4);">
              <a href="login.html" class="btn btn-primary btn-sm">Sign In</a>
            </div>
          </div>
        `;
      }
      return;
    }

    loadMyFoundReports(user.uid);
  });
});

let currentFoundReports = [];

async function loadMyFoundReports(userId) {
  const list = document.getElementById('foundReportsList');
  if (!list) return;

  try {
    const data = await LostLink.api(`/api/reports?type=found&userId=${userId}`);
    const reports = data.items || [];
    currentFoundReports = reports;

    if (reports.length === 0) {
      list.innerHTML = `
        <div class="empty-state">
          <h3 class="empty-state-title">No Found Reports Yet</h3>
          <p class="empty-state-desc">You have not submitted any found item reports yet.</p>
          <div style="margin-top: var(--space-4);">
            <a href="report-found.html" class="btn btn-primary btn-sm">Report a Found Item</a>
          </div>
        </div>
      `;
      return;
    }

    list.innerHTML = reports.map(r => `
      <div class="report-card" id="found-report-${r.id}">
        <div style="display: flex; gap: var(--space-4); flex-wrap: wrap;">
          ${r.imageUrl ? `
            <div class="card-image-wrap" style="width: 110px; height: 110px; flex-shrink: 0; cursor: zoom-in;" title="Click to view full image" onclick="LostLink.openImageModal('${LostLink.sanitize(r.imageUrl)}', '${LostLink.sanitize(r.title)}')">
              <img src="${LostLink.sanitize(r.imageUrl)}" alt="${LostLink.sanitize(r.title)}" style="width: 100%; height: 100%; object-fit: cover; border-radius: var(--radius-md);" loading="lazy" decoding="async">
            </div>
          ` : `
            <div style="width: 110px; height: 110px; flex-shrink: 0; background: var(--gray-100); border-radius: var(--radius-md); display: flex; align-items: center; justify-content: center; font-size: var(--text-xs); color: var(--gray-500); text-align: center; padding: 6px;">
              No Photo Attached
            </div>
          `}

          <div style="flex: 1; min-width: 260px;">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: var(--space-2); margin-bottom: var(--space-2);">
              <div>
                <span class="badge badge-neutral">Found Report</span>
                <span class="badge badge-${r.status === 'resolved' ? 'success' : 'info'}">${r.status === 'resolved' ? 'Resolved' : 'Active'}</span>
                <span>${LostLink.getStatusBadge(r.currentStatus, r.securityDetails)}</span>
              </div>
              <span style="font-size: var(--text-xs); color: var(--gray-500);">Reported: ${LostLink.formatDate(r.createdAt)}</span>
            </div>

            <h3 style="font-size: var(--text-lg); font-weight: 600; color: var(--gray-900); margin: 0 0 6px;">
              <a href="item-details.html?id=${r.id}" style="color: inherit; text-decoration: none;">${LostLink.sanitize(r.title)}</a>
            </h3>

            <p style="font-size: var(--text-sm); color: var(--gray-700); margin: 0 0 var(--space-3); line-height: 1.5;">${LostLink.sanitize(r.description)}</p>

            <div style="display: flex; gap: var(--space-4); flex-wrap: wrap; font-size: var(--text-xs); color: var(--gray-600); margin-bottom: var(--space-4);">
              <span>Location Found: ${LostLink.sanitize(r.location || 'Campus')}</span>
              <span>Date Found: ${LostLink.formatDate(r.date)}</span>
              ${r.time ? `<span>Time: ${LostLink.sanitize(r.time)}</span>` : ''}
            </div>

            <!-- Possession Status Updater -->
            <div style="background: var(--gray-50); border: 1px solid var(--gray-200); border-radius: var(--radius-md); padding: var(--space-3); margin-bottom: var(--space-4);">
              <strong style="display: block; font-size: var(--text-xs); color: var(--gray-800); margin-bottom: 6px;">Update Where Item is Kept Now:</strong>
              <div style="display: flex; gap: var(--space-2); flex-wrap: wrap; align-items: center;">
                <select id="status-select-${r.id}" class="form-select" style="font-size: var(--text-xs); padding: 6px 10px; width: auto;" onchange="toggleFoundSecurityField('${r.id}', this.value)">
                  <option value="with_finder" ${r.currentStatus === 'with_finder' ? 'selected' : ''}>With me</option>
                  <option value="at_found_location" ${r.currentStatus === 'at_found_location' ? 'selected' : ''}>At place where found</option>
                  <option value="with_security" ${r.currentStatus === 'with_security' ? 'selected' : ''}>Given to security</option>
                  <option value="returned_to_owner" ${r.currentStatus === 'returned_to_owner' ? 'selected' : ''}>Returned to owner</option>
                </select>

                <div id="sec-input-wrap-${r.id}" class="${r.currentStatus === 'with_security' ? '' : 'hidden'}" style="flex: 1; min-width: 180px;">
                  <input 
                    type="text" 
                    id="sec-details-${r.id}" 
                    class="form-input" 
                    style="font-size: var(--text-xs); padding: 6px 10px;"
                    value="${LostLink.sanitize(r.securityDetails || '')}"
                    placeholder="Security desk location/officer"
                  >
                </div>

                <button type="button" class="btn btn-primary btn-sm" style="padding: 6px 14px; font-size: var(--text-xs);" onclick="saveFoundPossessionStatus('${r.id}')">
                  Update
                </button>
              </div>
            </div>

            <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--gray-100); padding-top: var(--space-3);">
              <a href="item-details.html?id=${r.id}" class="btn btn-outline btn-sm">View Item Details</a>
              <button type="button" class="btn btn-ghost btn-sm" style="color: var(--danger);" onclick="deleteFoundReport('${r.id}')">Delete Report</button>
            </div>
          </div>
        </div>
      </div>
    `).join('');
  } catch (err) {
    console.error('Error loading found reports:', err);
    list.innerHTML = `
      <div class="empty-state">
        <h3 class="empty-state-title">Unable to Load Reports</h3>
        <p class="empty-state-desc">Service is temporarily unavailable. Please try again later.</p>
      </div>
    `;
  }
}

window.toggleFoundSecurityField = function(id, val) {
  const wrap = document.getElementById(`sec-input-wrap-${id}`);
  if (wrap) {
    if (val === 'with_security') {
      wrap.classList.remove('hidden');
      document.getElementById(`sec-details-${id}`)?.focus();
    } else {
      wrap.classList.add('hidden');
    }
  }
};

window.saveFoundPossessionStatus = async function(id) {
  const statusSelect = document.getElementById(`status-select-${id}`);
  const secDetailsInput = document.getElementById(`sec-details-${id}`);

  const currentStatus = statusSelect ? statusSelect.value : 'with_finder';
  const securityDetails = secDetailsInput ? secDetailsInput.value.trim() : '';

  if (currentStatus === 'with_security' && !securityDetails) {
    LostLink.showToast('Please type the security desk location or details.', 'warning');
    secDetailsInput?.focus();
    return;
  }

  try {
    const payload = { currentStatus };
    if (currentStatus === 'with_security') {
      payload.securityDetails = securityDetails;
    }
    if (currentStatus === 'returned_to_owner') {
      payload.status = 'resolved';
    }

    await LostLink.api(`/api/reports/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload)
    });

    LostLink.showToast('Possession status updated.', 'success');
    setTimeout(() => location.reload(), 600);
  } catch (err) {
    LostLink.showToast(err.message || 'Failed to update status.', 'error');
  }
};

window.deleteFoundReport = function(reportId, optionalTitle) {
  const report = currentFoundReports.find(r => r.id === reportId);
  const title = optionalTitle || (report ? report.title : 'Found Item');

  LostLink.confirmReportDeletion({
    reportId,
    title,
    type: 'found',
    onConfirmed: () => {
      currentFoundReports = currentFoundReports.filter(r => r.id !== reportId);
      const card = document.getElementById(`found-report-${reportId}`);
      if (card) card.remove();
      const list = document.getElementById('foundReportsList');
      if (list && (list.querySelectorAll('.report-card').length === 0 || currentFoundReports.length === 0)) {
        list.innerHTML = `
          <div class="empty-state">
            <h3 class="empty-state-title">No Found Reports Yet</h3>
            <p class="empty-state-desc">You have not submitted any found item reports yet.</p>
            <div style="margin-top: var(--space-4);">
              <a href="report-found.html" class="btn btn-primary btn-sm">Report a Found Item</a>
            </div>
          </div>
        `;
      }
    }
  });
};
