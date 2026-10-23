/**
 * LostLink — Student Match Notifications Client
 * Manages unread badge counts, notifications dropdown modal, and marking notifications read.
 */

window.LostLink = window.LostLink || {};

let notificationsData = [];

LostLink.loadNotifications = async function() {
  if (!LostLink.currentUser) return;

  try {
    const res = await LostLink.api('/api/notifications');
    notificationsData = res.notifications || [];
    const unreadCount = res.unreadCount || 0;

    LostLink.updateNotificationBadge(unreadCount);
    LostLink.renderNotificationList();
  } catch (err) {
    console.warn('[LostLink Notifications] Failed to fetch notifications:', err.message);
  }
};

LostLink.updateNotificationBadge = function(unreadCount) {
  const badge = document.getElementById('notifBadge');
  if (!badge) return;

  if (unreadCount > 0) {
    badge.textContent = unreadCount > 9 ? '9+' : unreadCount;
    badge.classList.remove('hidden');
  } else {
    badge.textContent = '';
    badge.classList.add('hidden');
  }
};

LostLink.renderNotificationList = function() {
  const listEl = document.getElementById('notifList');
  if (!listEl) return;

  if (!notificationsData.length) {
    listEl.innerHTML = `
      <div class="notif-empty-state">
        <p>No notifications yet.</p>
        <span>You will be notified here when someone reports an item matching yours.</span>
      </div>
    `;
    return;
  }

  listEl.innerHTML = notificationsData.map(n => `
    <div class="notif-item ${n.read ? 'read' : 'unread'}" onclick="LostLink.handleNotificationClick('${n.id}', '${n.targetReportId}')">
      <div class="notif-header">
        <strong class="notif-title">${LostLink.sanitize(n.title || 'Match Alert')}</strong>
        ${n.matchScore ? `<span class="badge badge-primary">${n.matchScore}% Match</span>` : ''}
      </div>
      <p class="notif-message">${LostLink.sanitize(n.message)}</p>
      <div class="notif-meta">
        <span>${LostLink.formatDate(n.createdAt)}</span>
        <a href="item-details.html?id=${n.targetReportId}" class="notif-action-link" onclick="event.stopPropagation();">View Report &rarr;</a>
      </div>
    </div>
  `).join('');
};

LostLink.handleNotificationClick = async function(notifId, targetReportId) {
  try {
    await LostLink.api(`/api/notifications/${notifId}/read`, { method: 'POST' });
  } catch (e) {}

  if (targetReportId) {
    window.location.href = `item-details.html?id=${targetReportId}`;
  }
};

LostLink.markAllNotificationsRead = async function() {
  try {
    await LostLink.api('/api/notifications/read-all', { method: 'POST' });
    notificationsData.forEach(n => { n.read = true; });
    LostLink.updateNotificationBadge(0);
    LostLink.renderNotificationList();
  } catch (err) {
    console.warn('[LostLink Notifications] Error marking all read:', err.message);
  }
};

LostLink.toggleNotificationsModal = function() {
  const modal = document.getElementById('notificationsModal');
  if (!modal) return;

  if (modal.classList.contains('hidden')) {
    modal.classList.remove('hidden');
    LostLink.loadNotifications();
  } else {
    modal.classList.add('hidden');
  }
};

// Auto-initialize notifications when auth state is ready
document.addEventListener('DOMContentLoaded', () => {
  LostLink.onAuthStateChanged((user) => {
    if (user) {
      LostLink.loadNotifications();
      // Periodically refresh notifications every 45s
      setInterval(() => LostLink.loadNotifications(), 45000);
    }
  });

  const bellBtn = document.getElementById('notifBellBtn');
  if (bellBtn && !bellBtn._notifBound) {
    bellBtn._notifBound = true;
    bellBtn.addEventListener('click', (e) => {
      e.preventDefault();
      LostLink.toggleNotificationsModal();
    });
  }
});
