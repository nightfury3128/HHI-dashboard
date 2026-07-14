(function () {
  const NAV = [
    { href: 'index.html', label: 'Home', icon: 'home', id: 'home' },
    { href: 'dashboard.html', label: 'Dashboard', icon: 'chart', id: 'dashboard' },
    { href: 'impact.html', label: 'Impact Assessment', icon: 'target', id: 'impact' },
    { href: 'help.html', label: 'Help & Support', icon: 'help', id: 'help' },
  ];

  window.renderShell = function (activeId, options = {}) {
    const icons = window.HHIIcons || {};
    const loc = options.location || 'Mumbai Board';
    const boardId = options.boardId || '';
    const boards = options.boards || [];
    const navHtml = NAV.map((n) => {
      const cls = n.id === activeId ? 'active' : '';
      const href = boardId ? `${n.href}?board=${encodeURIComponent(boardId)}` : n.href;
      return `<a class="${cls}" href="${href}">${icons[n.icon] || ''}<span>${n.label}</span></a>`;
    }).join('');

    const boardList = options.boards && options.boards.length
      ? options.boards
      : [];
    const boardOptions = boardList.length
      ? boardList.map((b) => {
          const sel = b.id === boardId ? ' selected' : '';
          return `<option value="${b.id}"${sel}>${b.label}</option>`;
        }).join('')
      : `<option selected>${loc}</option>`;

    return {
      sidebar: `
        <aside class="sidebar" id="appSidebar">
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
          <button type="button" class="nav-toggle" id="navToggle" aria-label="Open navigation" aria-expanded="false" aria-controls="appSidebar">
            ${icons.menu || ''}
          </button>
          <label class="loc-select" aria-label="Board">
            ${icons.pin || ''}
            <select id="boardSwitcher" class="board-switcher">${boardOptions}</select>
          </label>
          <div class="topbar-right">
            <button type="button" class="icon-btn" aria-label="Notifications">
              ${icons.bell || ''}
              <span class="badge">3</span>
            </button>
            <div class="user-chip">
              <div class="avatar">UP</div>
              <div class="meta">
                <strong>Welcome, Urban Planner</strong>
                <span>MHADA · <span id="userBoardLabel">${loc}</span></span>
              </div>
            </div>
          </div>
        </header>`,
    };
  };

  function ensureNavOverlay() {
    let overlay = document.getElementById('navOverlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'nav-overlay';
      overlay.id = 'navOverlay';
      overlay.setAttribute('aria-hidden', 'true');
      document.body.appendChild(overlay);
    }
    return overlay;
  }

  function setNavOpen(open) {
    const sidebar = document.getElementById('appSidebar');
    const overlay = ensureNavOverlay();
    const toggle = document.getElementById('navToggle');
    if (!sidebar) return;
    sidebar.classList.toggle('open', open);
    if (overlay) {
      overlay.classList.toggle('visible', open);
      overlay.setAttribute('aria-hidden', open ? 'false' : 'true');
    }
    if (toggle) {
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      toggle.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
      const icons = window.HHIIcons || {};
      toggle.innerHTML = open ? (icons.close || '') : (icons.menu || '');
    }
    document.body.classList.toggle('nav-open', open);
  }

  window.bindBoardSwitcher = function (currentId) {
    const sel = document.getElementById('boardSwitcher');
    if (sel && window.HHIData) {
      sel.value = currentId;
      sel.addEventListener('change', () => {
        const id = sel.value;
        window.HHIData.setBoardId(id);
        const url = new URL(window.location.href);
        url.searchParams.set('board', id);
        window.location.href = url.toString();
      });
    }

    const overlay = ensureNavOverlay();
    const toggle = document.getElementById('navToggle');
    const sidebar = document.getElementById('appSidebar');
    if (toggle && !toggle.dataset.bound) {
      toggle.dataset.bound = '1';
      toggle.addEventListener('click', () => setNavOpen(!sidebar?.classList.contains('open')));
    }
    if (overlay && !overlay.dataset.bound) {
      overlay.dataset.bound = '1';
      overlay.addEventListener('click', () => setNavOpen(false));
    }
    sidebar?.querySelectorAll('.nav a').forEach((link) => {
      link.addEventListener('click', () => setNavOpen(false));
    });
    window.addEventListener('resize', () => {
      if (window.innerWidth > 900) setNavOpen(false);
    });
  };

  // Best Practices palette — one color per board; grey for overflow
  window.boardColor = function (boardId) {
    const map = {
      amravati: '#B00020',
      csn: '#E67E22',
      kokan: '#F1C40F',
      mumbai: '#85688F',
      nagpur: '#27AE60',
      nashik: '#00b2df',
      pune: '#8c94a5',
    };
    return map[boardId] || '#8c94a5';
  };

  window.boardTileText = function (boardId) {
    return boardId === 'kokan' ? '#1a1c2c' : '#ffffff';
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
