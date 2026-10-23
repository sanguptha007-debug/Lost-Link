/**
 * LostLink — Dark and Light Theme Manager
 * Respects OS preferences, persists selection across pages, and prevents theme flash.
 */

window.LostLink = window.LostLink || {};

LostLink.SUN_SVG = `<svg class="theme-icon-svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>`;
LostLink.MOON_SVG = `<svg class="theme-icon-svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>`;

LostLink.getPreferredTheme = function() {
  const saved = localStorage.getItem('lostlink_theme');
  if (saved === 'dark' || saved === 'light') {
    return saved;
  }
  if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }
  return 'light';
};

LostLink.applyTheme = function(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const isDark = theme === 'dark';
  const labelText = isDark ? 'Switch to light theme' : 'Switch to dark theme';
  const iconSvg = isDark ? LostLink.SUN_SVG : LostLink.MOON_SVG;

  const toggleBtns = document.querySelectorAll('#themeToggle, .theme-toggle-btn');
  toggleBtns.forEach(btn => {
    btn.setAttribute('aria-label', labelText);
    btn.setAttribute('title', labelText);
    btn.innerHTML = `${iconSvg}<span class="sr-only">${labelText}</span>`;
  });
};

LostLink.toggleTheme = function() {
  const current = document.documentElement.getAttribute('data-theme') || LostLink.getPreferredTheme();
  const next = current === 'dark' ? 'light' : 'dark';
  localStorage.setItem('lostlink_theme', next);
  LostLink.applyTheme(next);
};

// Initialize theme on DOM load
document.addEventListener('DOMContentLoaded', () => {
  const theme = LostLink.getPreferredTheme();
  LostLink.applyTheme(theme);

  document.querySelectorAll('#themeToggle, .theme-toggle-btn').forEach(btn => {
    if (!btn._themeBound) {
      btn._themeBound = true;
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        LostLink.toggleTheme();
      });
    }
  });

  // Listen to OS theme changes if user hasn't set an explicit preference
  if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      if (!localStorage.getItem('lostlink_theme')) {
        LostLink.applyTheme(e.matches ? 'dark' : 'light');
      }
    });
  }
});

