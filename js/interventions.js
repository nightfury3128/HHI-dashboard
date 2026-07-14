(async function () {
  const manifest = await HHIData.loadManifest();
  const boardId = await HHIData.resolveBoardId();
  const data = await HHIData.loadBoard(boardId);
  const boardLabel = HHIData.boardLabel(data);
  const shell = renderShell('interventions', {
    location: boardLabel,
    boardId,
    boards: HHIData.boardOptions(manifest),
  });

  const catalogRes = await fetch('data/intervention-catalog.json');
  const catalog = await catalogRes.json();
  const interventions = catalog.interventions || [];
  const kfaMeta = {};
  (catalog.kfas || []).forEach((k) => { kfaMeta[k.label] = k; });

  let pageSize = 10;
  let page = 1;
  let applied = new Set();
  const icons = window.HHIIcons || {};

  document.getElementById('app').innerHTML = `
    ${shell.sidebar}
    <div class="main">
      ${shell.topbar}
      <div class="content">
        <div class="page-head">
          <div>
            <div class="crumbs">Dashboard &gt; <span>Interventions</span></div>
            <h1>Intervention Explorer</h1>
            <p class="sub">Browse MHADA intervention catalogue solutions to improve Housing Happiness across ${boardLabel}.</p>
          </div>
          <div class="actions">
            <a class="btn btn-outline" href="assets/HHI_Intervention_v4.pdf" download>⬇ Download Catalogue (PDF)</a>
          </div>
        </div>

        <div class="ix-layout">
          <div class="ix-main">
            <div class="card ix-filters">
              <div class="ix-search-row">
                <div class="ix-search">
                  ${icons.search || ''}
                  <input type="search" id="ixSearch" placeholder="Search interventions by name, KFA, or keyword…" />
                </div>
                <button type="button" class="btn btn-primary" id="ixSearchBtn">${icons.search || ''} Search</button>
              </div>
              <div class="ix-filter-grid">
                <div class="field">
                  <label>Key Focus Area</label>
                  <select id="ixKfa">
                    <option value="">All KFAs</option>
                    ${(catalog.kfas || []).map((k) => `<option value="${k.label}">${k.label}</option>`).join('')}
                  </select>
                </div>
                <div class="field">
                  <label>Category</label>
                  <select id="ixCategory">
                    <option value="">All</option>
                    <option>Facility</option>
                    <option>Work</option>
                    <option>Event</option>
                    <option>Service</option>
                    <option>Infrastructure</option>
                    <option>Digital</option>
                  </select>
                </div>
                <div class="field">
                  <label>Space of Delivery</label>
                  <select id="ixSpace">
                    <option value="">All</option>
                    <option>Indoor</option>
                    <option>Outdoor</option>
                    <option>Both</option>
                    <option>Digital</option>
                  </select>
                </div>
                <div class="field">
                  <label>Cost Range (₹)</label>
                  <select id="ixCost">
                    <option value="">All</option>
                    <option value="Low Cost">Low Cost</option>
                    <option value="Medium Cost">Medium Cost</option>
                    <option value="High Cost">High Cost</option>
                  </select>
                </div>
                <div class="field">
                  <label>Sort By</label>
                  <select id="ixSort">
                    <option value="id">Catalogue Order</option>
                    <option value="impact">Highest HHI Impact</option>
                    <option value="priority">Priority</option>
                    <option value="costLow">Cost: Low → High</option>
                    <option value="name">Name A–Z</option>
                  </select>
                </div>
              </div>
              <div class="ix-quick" id="ixQuick">
                <button type="button" class="ix-pill" data-quick="highImpact">High Impact</button>
                <button type="button" class="ix-pill" data-quick="lowCost">Low Cost</button>
                <button type="button" class="ix-pill" data-quick="quickWin">Quick Win</button>
                <button type="button" class="ix-pill" data-quick="highFeas">High Feasibility</button>
                <button type="button" class="ix-pill" data-quick="indoor">Indoor</button>
                <button type="button" class="ix-pill" data-quick="outdoor">Outdoor</button>
                <button type="button" class="ix-pill" data-quick="digital">Digital</button>
                <button type="button" class="ix-clear" id="ixClear">Clear All</button>
              </div>
            </div>

            <div class="kpi-row ix-kpis" id="ixKpis"></div>

            <div class="card ix-list-card">
              <div class="card-title ix-list-title">
                <span>All Interventions <span class="hint" id="ixCount">Showing 0 of ${interventions.length}</span></span>
                <label class="ix-page-size">
                  Show
                  <select id="ixPageSize">
                    <option value="5">5</option>
                    <option value="10" selected>10</option>
                    <option value="20">20</option>
                    <option value="all">All</option>
                  </select>
                  per page
                </label>
              </div>
              <div class="ix-list-head">
                <span>Intervention</span>
                <span>Impact on HHI</span>
                <span>Cost (₹)</span>
                <span>Feasibility</span>
                <span>Priority</span>
                <span>Action</span>
              </div>
              <div id="ixList"></div>
              <div class="ix-pager" id="ixPager"></div>
            </div>
          </div>

          <aside class="ix-side">
            <div class="card">
              <div class="card-title">Catalogue Source</div>
              <p class="hint">Data &amp; typology from <strong>HHI Intervention Catalogue v4</strong> (MHADA). Costs and impacts are indicative.</p>
              <a class="btn btn-outline" style="margin-top:10px;width:100%;justify-content:center" href="assets/HHI_Intervention_v4.pdf" target="_blank" rel="noopener">Open PDF</a>
            </div>
          </aside>
        </div>
      </div>
    </div>
  `;

  const elSearch = document.getElementById('ixSearch');
  const elKfa = document.getElementById('ixKfa');
  const elCategory = document.getElementById('ixCategory');
  const elSpace = document.getElementById('ixSpace');
  const elCost = document.getElementById('ixCost');
  const elSort = document.getElementById('ixSort');
  const elPageSize = document.getElementById('ixPageSize');
  const quickActive = new Set();

  function readPageSize() {
    const v = elPageSize.value;
    pageSize = v === 'all' ? Infinity : Number(v) || 10;
  }
  readPageSize();

  function kfaColor(label) {
    return (kfaMeta[label] && kfaMeta[label].color) || '#635bff';
  }
  function kfaSoft(label) {
    return (kfaMeta[label] && kfaMeta[label].soft) || '#eeedff';
  }
  function applyStyle(kfa) {
    const bg = kfaColor(kfa);
    // Economic amber needs dark text for contrast; others use white
    const fg = (kfaMeta[kfa] && kfaMeta[kfa].id === 'economic') ? '#1a1c2c' : '#fff';
    return { bg, fg };
  }

  function matchesQuick(item) {
    if (!quickActive.size) return true;
    for (const q of quickActive) {
      if (q === 'highImpact' && !(item.priority === 'High' || item.hhiImpact >= 3.5)) return false;
      if (q === 'lowCost' && item.costLevel !== 'Low Cost') return false;
      if (q === 'quickWin' && !(item.feasibility === 'High' && item.costLevel === 'Low Cost')) return false;
      if (q === 'highFeas' && item.feasibility !== 'High') return false;
      if (q === 'indoor' && item.space !== 'Indoor' && item.space !== 'Both') return false;
      if (q === 'outdoor' && item.space !== 'Outdoor' && item.space !== 'Both') return false;
      if (q === 'digital' && item.space !== 'Digital' && item.category !== 'Digital') return false;
    }
    return true;
  }

  function costRank(level) {
    return { 'Low Cost': 0, 'Medium Cost': 1, 'High Cost': 2 }[level] ?? 1;
  }
  function priorityRank(p) {
    return { High: 0, Medium: 1, Low: 2 }[p] ?? 1;
  }

  function filtered() {
    const q = (elSearch.value || '').trim().toLowerCase();
    let rows = interventions.filter((item) => {
      if (elKfa.value && item.kfa !== elKfa.value) return false;
      if (elCategory.value && item.category !== elCategory.value) return false;
      if (elSpace.value && item.space !== elSpace.value) return false;
      if (elCost.value && item.costLevel !== elCost.value) return false;
      if (!matchesQuick(item)) return false;
      if (q) {
        const blob = `${item.name} ${item.kfa} ${item.category} ${item.description} ${item.space}`.toLowerCase();
        if (!blob.includes(q)) return false;
      }
      return true;
    });

    const sort = elSort.value;
    rows = [...rows].sort((a, b) => {
      if (sort === 'impact') return (b.hhiImpact || 0) - (a.hhiImpact || 0);
      if (sort === 'priority') return priorityRank(a.priority) - priorityRank(b.priority) || a.id - b.id;
      if (sort === 'costLow') return costRank(a.costLevel) - costRank(b.costLevel) || a.id - b.id;
      if (sort === 'name') return a.name.localeCompare(b.name);
      return a.id - b.id;
    });
    return rows;
  }

  function renderKpis() {
    const highImpact = interventions.filter((i) => i.priority === 'High' || i.hhiImpact >= 3.5).length;
    const lowCost = interventions.filter((i) => i.costLevel === 'Low Cost').length;
    document.getElementById('ixKpis').innerHTML = `
      <div class="kpi purple"><div class="kpi-icon">${icons.wrench || icons.chart || ''}</div><div class="label">Total Interventions</div><div class="value">${interventions.length}</div><div class="foot">in catalogue</div></div>
      <div class="kpi green"><div class="kpi-icon">${icons.target || ''}</div><div class="label">Key Focus Areas</div><div class="value">${(catalog.kfas || []).length}</div><div class="foot">HHI pillars</div></div>
      <div class="kpi orange"><div class="kpi-icon">${icons.chart || ''}</div><div class="label">High Impact Options</div><div class="value">${highImpact}</div><div class="foot">priority / score</div></div>
      <div class="kpi blue"><div class="kpi-icon">${icons.house || ''}</div><div class="label">Low Cost Options</div><div class="value">${lowCost}</div><div class="foot">budget-friendly</div></div>
    `;
  }

  function tag(label, color, soft) {
    return `<span class="ix-tag" style="background:${soft};color:${color}">${label}</span>`;
  }

  function renderList() {
    const rows = filtered();
    const total = rows.length;
    const size = pageSize === Infinity ? Math.max(total, 1) : pageSize;
    const pages = Math.max(1, Math.ceil(total / size));
    if (page > pages) page = pages;
    const start = (page - 1) * size;
    const slice = pageSize === Infinity ? rows : rows.slice(start, start + size);

    document.getElementById('ixCount').textContent = total
      ? (pageSize === Infinity
        ? `Showing all ${total}`
        : `Showing ${start + 1}–${Math.min(start + size, total)} of ${total}`)
      : `Showing 0 of 0`;

    const list = document.getElementById('ixList');
    if (!slice.length) {
      list.innerHTML = `<div class="empty-hint" style="padding:28px;text-align:center">No interventions match these filters.</div>`;
    } else {
      list.innerHTML = slice.map((item) => {
        const color = kfaColor(item.kfa);
        const soft = kfaSoft(item.kfa);
        const apply = applyStyle(item.kfa);
        const isApplied = applied.has(item.id);
        const img = item.image
          ? `<img src="${item.image}" alt="" loading="lazy" />`
          : `<div class="ix-thumb-fallback" style="background:${soft}"></div>`;
        return `
          <article class="ix-row" data-id="${item.id}">
            <div class="ix-row-main">
              <div class="ix-thumb">${img}</div>
              <div class="ix-info">
                <div class="ix-title-row">
                  <span class="ix-kfa-dot" style="background:${color}" title="${item.kfa}"></span>
                  <h3>${item.name}</h3>
                </div>
                <p>${item.description}</p>
                <div class="ix-tags">
                  ${tag(item.kfa, color, soft)}
                  ${tag(item.category, '#4338ca', '#eeedff')}
                  ${tag(item.space, '#047857', '#e6f9f1')}
                </div>
              </div>
            </div>
            <div class="ix-metric">
              <strong>+${fmt(item.hhiImpact, 1)} HHI</strong>
              <span class="ix-badge ${item.priority === 'High' ? 'good' : 'mid'}">${item.priority === 'High' ? 'High Impact' : item.priority + ' Impact'}</span>
            </div>
            <div class="ix-metric">
              <strong>${item.cost}</strong>
              <span class="ix-badge ${item.costLevel === 'Low Cost' ? 'good' : item.costLevel === 'High Cost' ? 'warn' : 'mid'}">${item.costLevel}</span>
            </div>
            <div class="ix-metric">
              <strong>${item.feasibility}</strong>
              <span class="ix-badge ${item.feasibility === 'High' ? 'good' : 'mid'}">${item.feasibility === 'High' ? 'Ready' : 'Moderate'}</span>
            </div>
            <div class="ix-metric">
              <strong>${item.priority}</strong>
              <span class="ix-badge ${item.priority === 'High' ? 'bad' : item.priority === 'Medium' ? 'warn' : 'mid'}">Flag</span>
            </div>
            <div class="ix-actions">
              <button type="button" class="btn ix-apply ${isApplied ? 'applied' : ''}"
                data-apply="${item.id}"
                style="background:${apply.bg};color:${apply.fg};border-color:transparent;${isApplied ? 'filter:saturate(0.7) brightness(0.92);opacity:0.9' : ''}">
                ${isApplied ? 'Applied' : 'Apply'}
              </button>
            </div>
          </article>`;
      }).join('');
    }

    const pager = document.getElementById('ixPager');
    if (pages <= 1) {
      pager.innerHTML = '';
    } else {
      let html = `<button type="button" class="btn btn-outline" data-page="${page - 1}" ${page <= 1 ? 'disabled' : ''}>Prev</button>`;
      for (let i = 1; i <= pages; i++) {
        html += `<button type="button" class="ix-page-btn ${i === page ? 'active' : ''}" data-page="${i}">${i}</button>`;
      }
      html += `<button type="button" class="btn btn-outline" data-page="${page + 1}" ${page >= pages ? 'disabled' : ''}>Next</button>`;
      pager.innerHTML = html;
    }

    list.querySelectorAll('[data-apply]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = Number(btn.dataset.apply);
        applied.add(id);
        renderList();
      });
    });
    pager.querySelectorAll('[data-page]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const n = Number(btn.dataset.page);
        if (n >= 1 && n <= pages) {
          page = n;
          renderList();
          document.querySelector('.ix-list-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
    });
  }


  function refresh() {
    page = 1;
    renderKpis();
    renderList();
  }

  document.getElementById('ixSearchBtn').addEventListener('click', refresh);
  elSearch.addEventListener('keydown', (e) => { if (e.key === 'Enter') refresh(); });
  [elKfa, elCategory, elSpace, elCost, elSort].forEach((el) => el.addEventListener('change', refresh));
  elPageSize.addEventListener('change', () => {
    readPageSize();
    page = 1;
    renderList();
  });

  document.getElementById('ixQuick').addEventListener('click', (e) => {
    const pill = e.target.closest('[data-quick]');
    if (!pill) return;
    const key = pill.dataset.quick;
    if (quickActive.has(key)) {
      quickActive.delete(key);
      pill.classList.remove('active');
    } else {
      quickActive.add(key);
      pill.classList.add('active');
    }
    refresh();
  });

  document.getElementById('ixClear').addEventListener('click', () => {
    elSearch.value = '';
    elKfa.value = '';
    elCategory.value = '';
    elSpace.value = '';
    elCost.value = '';
    elSort.value = 'id';
    quickActive.clear();
    document.querySelectorAll('.ix-pill.active').forEach((p) => p.classList.remove('active'));
    refresh();
  });


  refresh();
  bindBoardSwitcher(boardId);
})();
