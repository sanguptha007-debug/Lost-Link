/**
 * LostLink — Report Lost Item Script
 * Minimal fields: Description, Location, Location Unknown, Date, Time, Photo
 */

let selectedLostPhoto = null;

document.addEventListener('DOMContentLoaded', () => {
  LostLink.initNavToggle();

  const dateInput = document.getElementById('itemDate');
  if (dateInput) {
    dateInput.value = new Date().toISOString().split('T')[0];
  }

  const form = document.getElementById('reportLostForm');
  if (form) {
    form.addEventListener('submit', handleLostSubmit);
  }
});

window.toggleLocationUnknown = function(checkbox) {
  const locInput = document.getElementById('itemLocation');
  if (locInput) {
    locInput.disabled = checkbox.checked;
    if (checkbox.checked) locInput.value = '';
  }
};

window.previewSelectedImage = function(input) {
  if (input.files && input.files[0]) {
    const file = input.files[0];
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(file.type)) {
      LostLink.showToast('Please select a valid image (JPEG, PNG, or WebP).', 'warning');
      input.value = '';
      selectedLostPhoto = null;
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      LostLink.showToast('Image exceeds the 5 MB maximum size limit.', 'warning');
      input.value = '';
      selectedLostPhoto = null;
      return;
    }
    selectedLostPhoto = file;
    const reader = new FileReader();
    reader.onload = (e) => {
      const preview = document.getElementById('photoPreviewImg');
      const placeholder = document.getElementById('photoPlaceholderText');
      if (preview && placeholder) {
        preview.src = e.target.result;
        preview.classList.remove('hidden');
        placeholder.classList.add('hidden');
      }
    };
    reader.readAsDataURL(selectedLostPhoto);
  }
};

async function handleLostSubmit(e) {
  e.preventDefault();

  const description = document.getElementById('itemDescription').value.trim();
  const locationUnknown = document.getElementById('locationUnknown').checked;
  const location = locationUnknown ? 'Exact location unknown' : document.getElementById('itemLocation').value.trim();
  const date = document.getElementById('itemDate').value;
  const time = document.getElementById('itemTime').value;
  const submitBtn = document.getElementById('submitLostBtn');

  if (!description) {
    LostLink.showToast('Please provide a description.', 'warning');
    return;
  }

  if (!locationUnknown && !location) {
    LostLink.showToast('Please enter the location or check "Exact location unknown".', 'warning');
    return;
  }

  if (!date) {
    LostLink.showToast('Please select the date.', 'warning');
    return;
  }

  LostLink.setLoading(submitBtn, true, 'Submitting report...');

  try {
    const formData = new FormData();
    formData.append('type', 'lost');
    formData.append('description', description);
    formData.append('location', location);
    formData.append('locationUnknown', locationUnknown ? 'true' : 'false');
    formData.append('date', date);
    if (time) formData.append('time', time);
    if (selectedLostPhoto) formData.append('image', selectedLostPhoto);

    const res = await LostLink.api('/api/reports', {
      method: 'POST',
      body: formData
    });

    if (res.success && res.item) {
      LostLink.showToast('Lost report submitted.', 'success');
      const formCard = document.querySelector('.form-container-card');
      const matchCount = (res.matches || []).length;

      if (formCard) {
        formCard.innerHTML = `
          <div style="text-align: center; padding: var(--space-8) var(--space-4);">
            <div style="width: 56px; height: 56px; background: var(--success-light); color: var(--success); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 28px; font-weight: bold; margin: 0 auto var(--space-4);">✓</div>
            <h2 style="font-size: var(--text-2xl); font-weight: 700; color: var(--gray-900); margin: 0 0 var(--space-2);">Lost report submitted</h2>
            <p style="color: var(--gray-600); max-width: 480px; margin: 0 auto var(--space-6); font-size: var(--text-sm); line-height: 1.6;">
              Your lost report for <strong>"${LostLink.sanitize(res.item.title)}"</strong> has been saved.
              ${matchCount > 0 ? `<br><span style="color: var(--primary-dark); font-weight: 600;">We found ${matchCount} existing found report(s) that may match your item!</span>` : 'We will continuously compare it against incoming found reports.'}
            </p>
            <div style="display: flex; flex-direction: column; gap: var(--space-3); max-width: 300px; margin: 0 auto;">
              <a href="find-items.html?tab=lost" class="btn btn-primary btn-block">View Lost Reports</a>
              <a href="find-items.html" class="btn btn-outline btn-block">Find My Item</a>
              <a href="find-items.html" class="btn btn-ghost btn-block">Return Home</a>
            </div>
          </div>
        `;
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else {
        window.location.href = 'find-items.html?tab=lost';
      }
    } else {
      LostLink.showToast(res.error || 'Failed to submit report.', 'error');
      LostLink.setLoading(submitBtn, false);
    }
  } catch (err) {
    console.error('Submit error:', err);
    LostLink.showToast(err.message || 'Service is temporarily unavailable. Please try again later.', 'error');
    LostLink.setLoading(submitBtn, false);
  }
}
