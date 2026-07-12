(function () {
  const NAV = [
    { href: 'index.html', label: 'Home', icon: 'home', id: 'home' },
    { href: 'dashboard.html', label: 'Dashboard', icon: 'chart', id: 'dashboard' },
    { href: 'survey.html', label: 'Survey Portal', icon: 'clipboard', id: 'survey' },
    { href: 'impact.html', label: 'Impact Assessment', icon: 'target', id: 'impact' },
    { href: 'help.html', label: 'Help & Support', icon: 'help', id: 'help' },
  ];

  window.renderShell = function (activeId, options = {}) {
    const icons = window.HHIIcons || {};
    const loc = options.location || 'Mumbai Board';
    const navHtml = NAV.map((n) => {
      const cls = n.id === activeId ? 'active' : '';
      return `<a class="${cls}" href="${n.href}">${icons[n.icon] || ''}<span>${n.label}</span></a>`;
    }).join('');

    return {
      sidebar: `
        <aside class="sidebar">
          <div class="brand">
            <div class="brand-mark">${icons.house || ''}</div>
            <div class="brand-text">
              <strong>HHI</strong>
              <span>Housing Happiness Index</span>
            </div>
          </div>
          <nav class="nav">${navHtml}</nav>
          <div class="sidebar-foot">
            <svg class="skyline" viewBox="0 0 200 40" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="10" y="18" width="18" height="22" rx="2" fill="rgba(255,255,255,0.25)"/>
              <rect x="32" y="8" width="22" height="32" rx="2" fill="rgba(255,255,255,0.35)"/>
              <rect x="58" y="14" width="16" height="26" rx="2" fill="rgba(255,255,255,0.28)"/>
              <rect x="78" y="4" width="28" height="36" rx="2" fill="rgba(99,91,255,0.55)"/>
              <rect x="110" y="12" width="20" height="28" rx="2" fill="rgba(255,255,255,0.3)"/>
              <rect x="134" y="6" width="24" height="34" rx="2" fill="rgba(39,194,129,0.45)"/>
              <rect x="162" y="16" width="18" height="24" rx="2" fill="rgba(255,255,255,0.25)"/>
            </svg>
            <p>Building happier communities across Maharashtra.</p>
          </div>
        </aside>`,
      topbar: `
        <header class="topbar">
          <button type="button" class="loc-select" aria-label="Location">
            ${icons.pin || ''}
            <span>${loc}</span>
          </button>
          <div class="topbar-right">
            <button type="button" class="icon-btn" aria-label="Notifications">
              ${icons.bell || ''}
              <span class="badge">3</span>
            </button>
            <div class="user-chip">
              <div class="avatar">UP</div>
              <div class="meta">
                <strong>Welcome, Urban Planner</strong>
                <span>MHADA · Mumbai Board</span>
              </div>
            </div>
          </div>
        </header>`,
    };
  };

  window.scoreColor = function (score) {
    if (score == null) return '#8c94a5';
    if (score >= 70) return '#27c281';
    if (score >= 55) return '#f59e0b';
    return '#ff4d4f';
  };

  window.scoreClass = function (score) {
    if (score == null) return 'mid';
    if (score >= 70) return 'high';
    if (score >= 55) return 'mid';
    return 'low';
  };

  window.fmt = function (n, d = 2) {
    if (n == null || Number.isNaN(n)) return '—';
    return Number(n).toLocaleString('en-IN', { maximumFractionDigits: d, minimumFractionDigits: d });
  };

  window.fmtInt = function (n) {
    if (n == null) return '—';
    return Number(n).toLocaleString('en-IN');
  };
})();
