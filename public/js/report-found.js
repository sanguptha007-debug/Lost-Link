/**
 * LostLink — Report Found Item Script
 * Standardized currentStatus and securityDetails fields
 */

let selectedFoundPhoto = null;

document.addEventListener('DOMContentLoaded', () => {
  LostLink.initNavToggle();

  const dateInput = document.getElementById('itemDate');
  if (dateInput) {
    dateInput.value = new Date().toISOString().split('T')[0];
  }

  const form = document.getElementById('reportFoundForm');
  if (form) {
    form.addEventListener('submit', handleFoundSubmit);
  }
});

window.handleStatusRadioChange = function(radio) {
  const securityGroup = document.getElementById('securityDetailsGroup');
  if (securityGroup) {
    if (radio.value === 'with_security') {
      securityGroup.classList.remove('hidden');
      document.getElementById('securityDetails')?.focus();
    } else {
      securityGroup.classList.add('hidden');
    }
  }
};

window.previewSelectedImage = function(input) {
  if (input.files && input.files[0]) {
    const file = input.files[0];
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(file.type)) {
      LostLink.showToast('Please select a valid image (JPEG, PNG, or WebP).', 'warning');
      input.value = '';
      selectedFoundPhoto = null;
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      LostLink.showToast('Image exceeds the 5 MB maximum size limit.', 'warning');
      input.value = '';
      selectedFoundPhoto = null;
      return;
    }
    selectedFoundPhoto = file;
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
    reader.readAsDataURL(selectedFoundPhoto);
  }
};

async function handleFoundSubmit(e) {
  e.preventDefault();

  const description = document.getElementById('itemDescription').value.trim();
  const location = document.getElementById('itemLocation').value.trim();
  const date = document.getElementById('itemDate').value;
  const time = document.getElementById('itemTime').value;
  const currentStatus = document.querySelector('input[name="currentStatus"]:checked')?.value || 'with_finder';
  const securityDetails = document.getElementById('securityDetails')?.value.trim() || '';
  const submitBtn = document.getElementById('submitFoundBtn');

  if (!description) {
    LostLink.showToast('Please provide a description.', 'warning');
    return;
  }

  if (!location) {
    LostLink.showToast('Please enter the location found.', 'warning');
    return;
  }

  if (!date) {
    LostLink.showToast('Please select the date found.', 'warning');
    return;
  }

  if (currentStatus === 'with_security' && !securityDetails) {
    LostLink.showToast('Please type the security location or details.', 'warning');
    document.getElementById('securityDetails')?.focus();
    return;
  }

  LostLink.setLoading(submitBtn, true, 'Submitting report...');

  try {
    const formData = new FormData();
    formData.append('type', 'found');
    formData.append('description', description);
    formData.append('location', location);
    formData.append('date', date);
    if (time) formData.append('time', time);
    formData.append('currentStatus', currentStatus);
    if (currentStatus === 'with_security') {
      formData.append('securityDetails', securityDetails);
    }
    if (selectedFoundPhoto) formData.append('image', selectedFoundPhoto);

    const res = await LostLink.api('/api/reports', {
      method: 'POST',
      body: formData
    });

    if (res.success && res.item) {
      LostLink.showToast('Found report submitted.', 'success');
      const formCard = document.querySelector('.form-container-card');
      const matchCount = (res.matches || []).length;

      if (formCard) {
        formCard.innerHTML = `
          <div style="text-align: center; padding: var(--space-8) var(--space-4);">
            <div style="width: 56px; height: 56px; background: var(--success-light); color: var(--success); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 28px; font-weight: bold; margin: 0 auto var(--space-4);">✓</div>
            <h2 style="font-size: var(--text-2xl); font-weight: 700; color: var(--gray-900); margin: 0 0 var(--space-2);">Found report submitted</h2>
            <p style="color: var(--gray-600); max-width: 480px; margin: 0 auto var(--space-6); font-size: var(--text-sm); line-height: 1.6;">
              Your found report for <strong>"${LostLink.sanitize(res.item.title)}"</strong> has been recorded. Thank you for helping return items to the campus community.
              ${matchCount > 0 ? `<br><span style="color: var(--primary-dark); font-weight: 600;">We detected ${matchCount} active lost report(s) that may match this item!</span>` : ''}
            </p>
            <div style="display: flex; flex-direction: column; gap: var(--space-3); max-width: 300px; margin: 0 auto;">
              <a href="find-items.html?tab=found" class="btn btn-primary btn-block">View Found Reports</a>
              <a href="find-items.html" class="btn btn-outline btn-block">Find My Item</a>
              <a href="find-items.html" class="btn btn-ghost btn-block">Return Home</a>
            </div>
          </div>
        `;
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else {
        window.location.href = 'find-items.html?tab=found';
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
