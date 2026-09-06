/**
 * LostLink — Profile & Contact Requests Script
 */

let currentProfile = null;

document.addEventListener('DOMContentLoaded', () => {
  LostLink.initNavToggle();

  document.addEventListener('authStateChanged', (e) => {
    const user = e.detail?.user;
    if (!user) {
      window.location.href = '/login.html';
      return;
    }
    loadDashboardData();
  });
});

async function loadDashboardData() {
  await Promise.all([
    fetchUserProfile(),
    fetchUserReports(),
    fetchContactRequests()
  ]);
}

async function fetchUserProfile() {
  try {
    const res = await LostLink.api('/api/users/profile');
    currentProfile = res.user;

    if (!currentProfile) return;

    document.getElementById('cardStudentName').textContent = currentProfile.name || 'Student';
    document.getElementById('cardRegNo').textContent = currentProfile.registrationNumber || 'VIT REGISTERED';
    document.getElementById('cardEmail').textContent = currentProfile.email || 'N/A';
    document.getElementById('cardPhone').textContent = currentProfile.phone || 'Not provided';
  } catch (err) {
    console.error('Error fetching profile:', err);
  }
}

async function fetchUserReports() {
  const container = document.getElementById('myReportsList');
  const countEl = document.getElementById('reportsCount');

  try {
    if (!LostLink.currentUser) return;
    const res = await LostLink.api(`/api/reports?userId=${LostLink.currentUser.uid}`);
    const items = res.items || [];

    if (countEl) countEl.textContent = items.length;

    if (items.length === 0) {
      container.innerHTML = `
        <div class="empty-state" style="grid-column: 1 / -1; padding: 30px;">
          <p class="empty-state-title">You have not submitted any reports yet.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = items.map(item => {
      const isLost = item.type === 'lost';
      const statusBadge = !isLost ? LostLink.getStatusBadge(item.currentStatus, item.securityDetails) : '';

      return `
        <a href="item-details.html?id=${item.id}" class="item-card">
          ${item.imageUrl ? `
            <div class="card-image-wrap" style="height: 120px;">
              <img src="${LostLink.sanitize(item.imageUrl)}" alt="${LostLink.sanitize(item.title)}">
            </div>
          ` : ''}
          <div class="card-content">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
              <span class="badge badge-neutral">${isLost ? 'Lost Report' : 'Found Report'}</span>
              <span class="badge badge-${item.status === 'resolved' ? 'success' : 'neutral'}">${item.status === 'resolved' ? 'Resolved' : 'Active'}</span>
            </div>
            <h4 class="card-item-title">${LostLink.sanitize(item.title)}</h4>
            <p class="card-item-location">Location: ${LostLink.sanitize(item.location || 'Campus')}</p>
            <div class="card-item-meta">
              <span>Date: ${LostLink.formatDate(item.date)}</span>
            </div>
            ${statusBadge ? `<div style="margin-top: 6px;">${statusBadge}</div>` : ''}
          </div>
        </a>
      `;
    }).join('');
  } catch (err) {
    console.error('Error fetching reports:', err);
  }
}

async function fetchContactRequests() {
  const receivedList = document.getElementById('receivedList');
  const sentList = document.getElementById('sentList');
  const receivedCount = document.getElementById('receivedCount');
  const sentCount = document.getElementById('sentCount');

  try {
    const res = await LostLink.api('/api/contact/requests');
    const received = res.received || [];
    const sent = res.sent || [];

    if (receivedCount) receivedCount.textContent = received.length;
    if (sentCount) sentCount.textContent = sent.length;

    if (receivedList) {
      if (received.length === 0) {
        receivedList.innerHTML = `<div class="empty-state"><p class="empty-state-title">No received inquiries.</p></div>`;
      } else {
        receivedList.innerHTML = received.map(req => {
          const isPending = req.status === 'pending';
          const isAccepted = req.status === 'accepted';

          return `
            <div class="contact-req-box">
              <div class="req-header">
                <strong>${LostLink.sanitize(req.fromUserName || 'Student')}</strong>
                <span class="badge badge-${isAccepted ? 'success' : 'neutral'}">${req.status}</span>
              </div>
              <p class="req-item-note">Regarding: ${LostLink.sanitize(req.itemTitle || 'Item')}</p>
              <p class="req-message">"${LostLink.sanitize(req.message)}"</p>

              ${isAccepted && req.contactInfo ? `
                <div class="contact-unlocked-box">
                  <strong>Contact details:</strong> Phone: <a href="tel:${req.contactInfo.fromPhone}">${LostLink.sanitize(req.contactInfo.fromPhone || 'N/A')}</a> | Email: ${LostLink.sanitize(req.contactInfo.fromEmail || 'N/A')}
                </div>
              ` : ''}

              <div class="req-actions" style="margin-top: 8px;">
                ${isPending ? `
                  <button type="button" class="btn btn-primary btn-xs" onclick="respondContactRequest('${req.id}', 'accepted')">Accept & Share Contact</button>
                  <button type="button" class="btn btn-ghost btn-xs" onclick="respondContactRequest('${req.id}', 'declined')">Decline</button>
                ` : `
                  <a href="item-details.html?id=${req.itemId}" class="btn btn-outline btn-xs">View Report</a>
                `}
              </div>
            </div>
          `;
        }).join('');
      }
    }

    if (sentList) {
      if (sent.length === 0) {
        sentList.innerHTML = `<div class="empty-state"><p class="empty-state-title">No sent inquiries.</p></div>`;
      } else {
        sentList.innerHTML = sent.map(req => {
          const isAccepted = req.status === 'accepted';
          return `
            <div class="contact-req-box">
              <div class="req-header">
                <strong>To: ${LostLink.sanitize(req.toUserName || 'Student')}</strong>
                <span class="badge badge-${isAccepted ? 'success' : 'neutral'}">${req.status}</span>
              </div>
              <p class="req-item-note">Regarding: ${LostLink.sanitize(req.itemTitle || 'Item')}</p>
              <p class="req-message">Your message: "${LostLink.sanitize(req.message)}"</p>

              ${isAccepted && req.contactInfo ? `
                <div class="contact-unlocked-box">
                  <strong>Contact details:</strong> Phone: <a href="tel:${req.contactInfo.toPhone}">${LostLink.sanitize(req.contactInfo.toPhone || 'N/A')}</a> | Email: ${LostLink.sanitize(req.contactInfo.toEmail || 'N/A')}
                </div>
              ` : `
                <p class="text-xs text-secondary">${req.status === 'pending' ? 'Pending response from student.' : 'Inquiry declined.'}</p>
              `}

              <div style="margin-top: 8px;">
                <a href="item-details.html?id=${req.itemId}" class="btn btn-outline btn-xs">View Report</a>
              </div>
            </div>
          `;
        }).join('');
      }
    }
  } catch (err) {
    console.error('Contact requests error:', err);
  }
}

window.switchTab = function(tabId, btnEl) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-pane').forEach(p => p.classList.add('hidden'));

  btnEl.classList.add('active');
  document.getElementById(tabId)?.classList.remove('hidden');
};

window.respondContactRequest = async function(reqId, status) {
  try {
    const res = await LostLink.api(`/api/contact/requests/${reqId}`, {
      method: 'PUT',
      body: JSON.stringify({ status })
    });

    if (res.success) {
      LostLink.showToast('Updated inquiry status.', 'success');
      fetchContactRequests();
    }
  } catch (err) {
    LostLink.showToast(err.message || 'Service is temporarily unavailable. Please try again later.', 'error');
  }
};

window.openEditProfileModal = function() {
  if (!currentProfile) return;
  document.getElementById('editName').value = currentProfile.name || '';
  document.getElementById('editRegNo').value = currentProfile.registrationNumber || '';
  document.getElementById('editPhone').value = currentProfile.phone || '';
  document.getElementById('editProfileModal')?.classList.remove('hidden');
};

window.closeEditProfileModal = function() {
  document.getElementById('editProfileModal')?.classList.add('hidden');
};

window.submitProfileUpdate = async function() {
  const name = document.getElementById('editName').value.trim();
  const regNo = document.getElementById('editRegNo').value.trim().toUpperCase();
  const phone = document.getElementById('editPhone').value.trim();
  const btn = document.getElementById('saveProfileBtn');

  if (!name) {
    LostLink.showToast('Name is required.', 'warning');
    return;
  }

  const phoneErr = LostLink.validatePhone(phone);
  if (phoneErr) {
    LostLink.showToast(phoneErr, 'warning');
    return;
  }

  if (!regNo) {
    LostLink.showToast('Registration number is required.', 'warning');
    return;
  }

  LostLink.setLoading(btn, true, 'Saving...');

  try {
    const res = await LostLink.api('/api/users/profile', {
      method: 'PUT',
      body: JSON.stringify({
        name,
        registrationNumber: regNo,
        phone
      })
    });

    if (res.success) {
      LostLink.showToast('Profile updated.', 'success');
      closeEditProfileModal();
      fetchUserProfile();
    }
  } catch (err) {
    LostLink.showToast(err.message || 'Service is temporarily unavailable. Please try again later.', 'error');
  } finally {
    LostLink.setLoading(btn, false);
  }
};
