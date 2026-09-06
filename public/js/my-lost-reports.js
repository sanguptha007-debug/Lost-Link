/**
 * LostLink — My Lost Reports Script
 * Displays student's own lost reports and checks for real matching found reports.
 * Zero fabricated matches.
 */

document.addEventListener('DOMContentLoaded', () => {
  const navToggle = document.getElementById('navToggle');
  const navMenu = document.getElementById('navMenu');
  if (navToggle && navMenu) {
    navToggle.addEventListener('click', () => navMenu.classList.toggle('open'));
  }

  LostLink.onAuthStateChanged(async (user) => {
    if (!user) {
      const list = document.getElementById('lostReportsList');
      if (list) {
        list.innerHTML = `
          <div class="empty-state">
            <h3 class="empty-state-title">Sign In Required</h3>
            <p class="empty-state-desc">Please sign in with your VIT student account to view your lost reports.</p>
            <div style="margin-top: var(--space-4);">
              <a href="login.html" class="btn btn-primary btn-sm">Sign In</a>
            </div>
          </div>
        `;
      }
      return;
    }

    loadMyLostReports(user.uid);
  });
});

async function loadMyLostReports(userId) {
  const list = document.getElementById('lostReportsList');
  if (!list) return;

  try {
    const data = await LostLink.api(`/api/reports?type=lost&userId=${userId}`);
    const reports = data.items || [];

    if (reports.length === 0) {
      list.innerHTML = `
        <div class="empty-state">
          <h3 class="empty-state-title">No Lost Reports Yet</h3>
          <p class="empty-state-desc">You have not submitted any lost item reports yet.</p>
          <div style="margin-top: var(--space-4);">
            <a href="report-lost.html" class="btn btn-primary btn-sm">Report a Lost Item</a>
          </div>
        </div>
      `;
      return;
    }

    list.innerHTML = reports.map(r => `
      <div class="report-card" id="lost-report-${r.id}" style="background: #ffffff; border: 1px solid var(--gray-200); border-radius: var(--radius-lg); padding: var(--space-5); box-shadow: var(--shadow-sm);">
        <div style="display: flex; gap: var(--space-4); flex-wrap: wrap;">
          ${r.imageUrl ? `
            <div class="card-image-wrap" style="width: 110px; height: 110px; flex-shrink: 0; cursor: zoom-in;" title="Click to view full image" onclick="LostLink.openImageModal('${LostLink.sanitize(r.imageUrl)}', '${LostLink.sanitize(r.title)}')">
              <img src="${LostLink.sanitize(r.imageUrl)}" alt="${LostLink.sanitize(r.title)}" style="width: 100%; height: 100%; object-fit: cover; border-radius: var(--radius-md);">
            </div>
          ` : `
            <div style="width: 110px; height: 110px; flex-shrink: 0; background: var(--gray-100); border-radius: var(--radius-md); display: flex; align-items: center; justify-content: center; font-size: var(--text-xs); color: var(--gray-500); text-align: center; padding: 6px;">
              No Photo Attached
            </div>
          `}

          <div style="flex: 1; min-width: 260px;">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: var(--space-2); margin-bottom: var(--space-2);">
              <div>
                <span class="badge badge-neutral" style="text-transform: capitalize;">Lost Report</span>
                <span class="badge badge-${r.status === 'resolved' ? 'success' : (r.status === 'closed' ? 'neutral' : 'info')}">${r.status === 'resolved' ? 'Resolved' : (r.status === 'closed' ? 'Closed' : 'Active')}</span>
              </div>
              <span style="font-size: var(--text-xs); color: var(--gray-500);">Reported: ${LostLink.formatDate(r.createdAt)}</span>
            </div>

            <h3 style="font-size: var(--text-lg); font-weight: 600; color: var(--gray-900); margin: 0 0 6px;">
              <a href="item-details.html?id=${r.id}" style="color: inherit; text-decoration: none;">${LostLink.sanitize(r.title)}</a>
            </h3>

            <p style="font-size: var(--text-sm); color: var(--gray-700); margin: 0 0 var(--space-3); line-height: 1.5;">${LostLink.sanitize(r.description)}</p>

            <div style="display: flex; gap: var(--space-4); flex-wrap: wrap; font-size: var(--text-xs); color: var(--gray-600); margin-bottom: var(--space-4);">
              <span>Location: ${LostLink.sanitize(r.location || 'Campus')}</span>
              <span>Date Lost: ${LostLink.formatDate(r.date)}</span>
              ${r.time ? `<span>Time: ${LostLink.sanitize(r.time)}</span>` : ''}
              ${r.color ? `<span>Colour: ${LostLink.sanitize(r.color)}</span>` : ''}
            </div>

            <!-- Matches Section -->
            <div id="matches-for-${r.id}" style="border-top: 1px solid var(--gray-100); padding-top: var(--space-3);">
              <span style="font-size: var(--text-xs); color: var(--gray-500);">Checking for matching found items...</span>
            </div>

            <div style="display: flex; justify-content: space-between; align-items: center; margin-top: var(--space-4); border-top: 1px solid var(--gray-100); padding-top: var(--space-3);">
              <a href="item-details.html?id=${r.id}" class="btn btn-outline btn-sm">View Complete Details</a>
              <div style="display: flex; gap: var(--space-2);">
                ${r.status === 'active' ? `
                  <button type="button" class="btn btn-outline btn-sm" onclick="resolveLostReport('${r.id}')">Mark Resolved</button>
                ` : ''}
                <button type="button" class="btn btn-ghost btn-sm" style="color: var(--danger);" onclick="deleteLostReport('${r.id}')">Delete</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    `).join('');

    // Fetch real matches for each active lost report
    reports.forEach(r => {
      if (r.status === 'resolved') {
        const el = document.getElementById(`matches-for-${r.id}`);
        if (el) el.innerHTML = `<span class="badge badge-success">Resolved</span>`;
      } else {
        checkMatchesForReport(r.id);
      }
    });
  } catch (err) {
    console.error('Error loading lost reports:', err);
    list.innerHTML = `
      <div class="empty-state">
        <h3 class="empty-state-title">Unable to Load Reports</h3>
        <p class="empty-state-desc">Service is temporarily unavailable. Please try again later.</p>
      </div>
    `;
  }
}

async function checkMatchesForReport(reportId) {
  const container = document.getElementById(`matches-for-${reportId}`);
  if (!container) return;

  try {
    const res = await LostLink.api('/api/matches/find', {
      method: 'POST',
      body: JSON.stringify({ itemId: reportId })
    });

    const matches = res.matches || [];

    if (matches.length === 0) {
      container.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: space-between; font-size: var(--text-xs); color: var(--gray-600);">
          <span><strong>Matching Status:</strong> No match yet. We will keep comparing against new found reports.</span>
          <a href="find-items.html" class="btn btn-ghost btn-sm" style="font-size: 11px;">Search Manually</a>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div>
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--space-2);">
          <strong style="font-size: var(--text-xs); color: var(--primary-dark);">Possible Match Found (${matches.length} report${matches.length > 1 ? 's' : ''}):</strong>
          <span class="badge badge-status" style="background: var(--primary-lightest); color: var(--primary-dark);">Action Suggested</span>
        </div>
        <div style="display: flex; flex-direction: column; gap: var(--space-2);">
          ${matches.slice(0, 2).map(m => `
            <div style="display: flex; gap: var(--space-3); background: var(--gray-50); border: 1px solid var(--gray-200); border-radius: var(--radius-md); padding: var(--space-2) var(--space-3); align-items: center;">
              ${m.imageUrl ? `
                <div class="card-image-wrap" style="width: 48px; height: 48px; flex-shrink: 0; cursor: zoom-in;" title="Click to enlarge" onclick="LostLink.openImageModal('${LostLink.sanitize(m.imageUrl)}', '${LostLink.sanitize(m.title)}')">
                  <img src="${LostLink.sanitize(m.imageUrl)}" alt="${LostLink.sanitize(m.title)}" style="width: 100%; height: 100%; object-fit: cover; border-radius: var(--radius-sm);">
                </div>
              ` : `
                <div style="width: 48px; height: 48px; flex-shrink: 0; background: var(--gray-200); border-radius: var(--radius-sm); display: flex; align-items: center; justify-content: center; font-size: 10px; color: var(--gray-600);">
                  No Photo
                </div>
              `}
              <div style="flex: 1; min-width: 0;">
                <strong style="display: block; font-size: var(--text-xs); color: var(--gray-900); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${LostLink.sanitize(m.title)}</strong>
                <span style="display: block; font-size: 11px; color: var(--gray-600);">Found: ${LostLink.sanitize(m.location || 'Campus')} • ${LostLink.formatDate(m.date)}</span>
              </div>
              <div>
                <a href="item-details.html?id=${m.id}" class="btn btn-primary btn-sm" style="padding: 2px 8px; font-size: 11px;">View Found Item</a>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  } catch (err) {
    container.innerHTML = `<span style="font-size: var(--text-xs); color: var(--gray-500);">Matching status: Looking for a match</span>`;
  }
}

window.resolveLostReport = async function(reportId) {
  try {
    await LostLink.api(`/api/reports/${reportId}`, {
      method: 'PUT',
      body: JSON.stringify({ status: 'resolved' })
    });
    LostLink.showToast('Report marked as resolved.', 'success');
    setTimeout(() => location.reload(), 500);
  } catch (err) {
    LostLink.showToast(err.message || 'Failed to update report status.', 'error');
  }
};

window.deleteLostReport = async function(reportId) {
  if (!confirm('Are you sure you want to delete this lost report?')) return;
  try {
    await LostLink.api(`/api/reports/${reportId}`, {
      method: 'DELETE'
    });
    LostLink.showToast('Report deleted.', 'info');
    document.getElementById(`lost-report-${reportId}`)?.remove();
  } catch (err) {
    LostLink.showToast(err.message || 'Failed to delete report.', 'error');
  }
};
