(async function () {
  const manifest = await HHIData.loadManifest();
  const boardId = await HHIData.resolveBoardId();
  const boardData = await HHIData.loadBoard(boardId);
  const boardLabel = HHIData.boardLabel(boardData);
  const interventions = await fetch(`data/interventions/${boardId}-nested.json`)
    .then((r) => (r.ok ? r.json() : fetch('data/interventions.json').then((r2) => r2.json())))
    .catch(() => fetch('data/interventions.json').then((r) => r.json()));
  const shell = renderShell('impact', {
    location: boardLabel,
    boardId,
    boards: HHIData.boardOptions(manifest),
  });
  const charts = {};
  const layouts = interventions.layouts || [];

  // Prefer a layout that has both KFAs and interventions
  const defaultLayout =
    layouts.find((l) => l.kfas?.length && l.interventions?.length) ||
    layouts[0];

  document.getElementById('app').innerHTML = `
    ${shell.sidebar}
    <div class="main">
      ${shell.topbar}
      <div class="content">
        <div class="page-head">
          <div>
            <div class="crumbs">Dashboard &gt; <span>Impact Assessment</span></div>
            <h1>Impact Assessment</h1>
            <p class="sub">Layout-level intervention recommendations from the ${boardLabel} interventions workbook.</p>
          </div>
          <div class="actions">
            <button type="button" class="btn btn-outline">Share</button>
            <button type="button" class="btn btn-primary">Export Report</button>
          </div>
        </div>

        <div class="impact-filters" style="grid-template-columns: 2fr 1fr auto;">
          <div class="field">
            <label>Selected Layout</label>
            <select id="fLayout"></select>
          </div>
          <div class="score-box">
            <div class="l">Layout HHI Score (KFA avg)</div>
            <div class="v" id="currentScore">—</div>
          </div>
          <div class="score-box" style="min-width:140px">
            <div class="l">Interventions</div>
            <div class="v" id="ivCount" style="color:var(--purple)">—</div>
          </div>
        </div>

        <div class="impact-mid">
          <div class="card">
            <div class="card-title">KFA Score Profile <span class="hint">Layout vs Board Avg</span></div>
            <div class="chart-box"><canvas id="kfaChart"></canvas></div>
          </div>
          <div class="card">
            <div class="card-title">KFA Ranking <span class="hint">Worst → Best</span></div>
            <ul class="rank-list" id="kfaRankList"></ul>
          </div>
          <div class="card">
            <div class="card-title">Recommended Interventions</div>
            <ul class="interv-list" id="intervList"></ul>
          </div>
        </div>

        <div class="grid-3" style="margin-bottom:14px">
          <div class="card" style="grid-column:span 2">
            <div class="card-title">Top Problems / Suggestions (HHI)</div>
            <div id="problemsList"></div>
          </div>
          <div class="card">
            <div class="card-title">Impact at a Glance</div>
            <div class="impact-glance" id="glance"></div>
          </div>
        </div>

        <div class="impact-bottom">
          <div class="card" style="grid-column: span 2;">
            <div class="card-title">Interventions by Key Focus Area</div>
            <div id="byKfa" class="before-after" style="grid-template-columns:repeat(auto-fill,minmax(160px,1fr))"></div>
          </div>
          <div class="card">
            <div class="card-title">Key Focus Notes</div>
            <ul class="benefit-list" id="benefits"></ul>
          </div>
        </div>

        <!--
        ===== PROJECTION UI (commented out — keep for later) =====
        <div class="impact-filters">
          <div class="field"><label>Selected Building</label><select id="fBuilding"></select></div>
          <div class="field"><label>Age Category</label><select id="fAge"></select></div>
          <div class="score-box"><div class="l">Current HHI Score</div><div class="v" id="projCurrentScore">—</div></div>
          <button type="button" class="btn btn-outline" id="btnAddAll">+ Select Suggested</button>
        </div>
        <div class="card">
          <div class="card-title">KFA Score Comparison — Current vs Projected</div>
          <div class="chart-box tall"><canvas id="kfaProjChart"></canvas></div>
        </div>
        <div class="card">
          <div class="card-title">Overall HHI Score Projection</div>
          <div class="gauge-row">
            <div class="gauge-wrap"><canvas id="gaugeCurrent"></canvas><div class="gv" id="gCurVal">—</div><div class="gl">Current HHI</div></div>
            <div class="delta-box"><div class="big" id="deltaPts">+0.00</div><div class="pct" id="deltaPct">+0% Improvement</div></div>
            <div class="gauge-wrap"><canvas id="gaugeProjected"></canvas><div class="gv" id="gProjVal">—</div><div class="gl">Projected HHI</div></div>
          </div>
        </div>
        <div class="interv-total" id="intervTotal">Total Estimated Improvement: +0.00 Points</div>
        <div class="roadmap">… Planning / Procurement / Execution …</div>
        <div class="timeline-bar" id="timelineBar">Total Estimated Timeline: 6 to 9 Months</div>
        <div class="before-after" id="beforeAfter">Before → After cards</div>
        <div class="cost-big" id="costBig">₹ —</div>
        =========================================================
        -->
      </div>
    </div>
  `;

  const Fuzzy = window.HHIFuzzy;
  const layoutCluster = Fuzzy.buildClusterMap(layouts.map((l) => l.layout));
  const canonLayout = (v) => layoutCluster.resolve(v);

  /** Merge layout rows that fuzzy-match into one view model. */
  function mergeLayouts(parts) {
    if (!parts.length) return null;
    if (parts.length === 1) return parts[0];
    const base = { ...parts[0] };
    base.layout = canonLayout(base.layout) || base.layout;
    // Average numeric scores across aliases
    const nums = ['score', 'hhi', 'housing', 'social', 'environment', 'economic', 'governance'];
    nums.forEach((k) => {
      const vals = parts.map((p) => p[k]).filter((v) => v != null && !Number.isNaN(Number(v)));
      if (vals.length) base[k] = vals.reduce((a, b) => a + Number(b), 0) / vals.length;
    });
    // Prefer richest kfas / interventions / problems
    const withKfas = [...parts].sort((a, b) => (b.kfas?.length || 0) - (a.kfas?.length || 0))[0];
    if (withKfas?.kfas?.length) {
      // Average matching KFA scores across parts that have them
      const byName = {};
      parts.forEach((p) => {
        (p.kfas || []).forEach((k) => {
          if (!byName[k.kfa]) byName[k.kfa] = { ...k, _scores: [], _board: [] };
          if (k.score != null) byName[k.kfa]._scores.push(Number(k.score));
          if (k.boardAvg != null) byName[k.kfa]._board.push(Number(k.boardAvg));
        });
      });
      base.kfas = Object.values(byName).map((k) => {
        const score = k._scores.length
          ? k._scores.reduce((a, b) => a + b, 0) / k._scores.length
          : k.score;
        const boardAvg = k._board.length
          ? k._board.reduce((a, b) => a + b, 0) / k._board.length
          : k.boardAvg;
        const { _scores, _board, ...rest } = k;
        return { ...rest, score, boardAvg };
      });
      const ranked = [...base.kfas].sort((a, b) => (a.score || 0) - (b.score || 0));
      base.kfas = base.kfas.map((k) => ({
        ...k,
        rank: ranked.findIndex((x) => x.kfa === k.kfa) + 1,
      }));
    }
    const interventions = [];
    const seenI = new Set();
    parts.forEach((p) => {
      (p.interventions || []).forEach((it) => {
        const key = JSON.stringify(it);
        if (seenI.has(key)) return;
        seenI.add(key);
        interventions.push(it);
      });
    });
    if (interventions.length) base.interventions = interventions;
    const problems = [];
    const seenP = new Set();
    parts.forEach((p) => {
      (p.problems || []).forEach((pr) => {
        const key = typeof pr === 'string' ? pr : JSON.stringify(pr);
        if (seenP.has(key)) return;
        seenP.add(key);
        problems.push(pr);
      });
    });
    if (problems.length) base.problems = problems;
    return base;
  }

  const fLayout = document.getElementById('fLayout');
  layoutCluster.canonicals().forEach((name) => {
    const o = document.createElement('option');
    o.value = name;
    o.textContent = name;
    fLayout.appendChild(o);
  });

  if (defaultLayout) fLayout.value = canonLayout(defaultLayout.layout);

  function selectedLayout() {
    const selected = fLayout.value;
    const parts = layouts.filter((l) => canonLayout(l.layout) === selected);
    return mergeLayouts(parts) || layouts[0];
  }

  function destroy(k) {
    if (charts[k]) {
      charts[k].destroy();
      delete charts[k];
    }
  }

  function sevClass(sev) {
    const s = (sev || '').toLowerCase();
    if (s.includes('high')) return 'high';
    if (s.includes('medium') || s.includes('mod')) return 'medium';
    return 'low';
  }

  function kfaColor(name) {
    const n = (name || '').toLowerCase();
    if (n.includes('hous')) return '#635bff';
    if (n.includes('social')) return '#3b82f6';
    if (n.includes('env')) return '#27c281';
    if (n.includes('econ')) return '#f59e0b';
    if (n.includes('gov')) return '#ff4d4f';
    return '#8c94a5';
  }

  function render() {
    const L = selectedLayout();
    if (!L) return;

    const score = L.overall != null
      ? L.overall
      : (L.kfas?.length
        ? L.kfas.reduce((s, k) => s + (k.score || 0), 0) / L.kfas.length
        : null);

    document.getElementById('currentScore').textContent =
      score != null ? `${fmt(score)} /100` : '—';
    document.getElementById('ivCount').textContent = String(L.interventions?.length || 0);

    // KFA chart — layout score vs board avg (current only; no projected series)
    const kfas = (L.kfas || []).slice().sort((a, b) => (a.rank || 0) - (b.rank || 0));
    const labels = kfas.map((k) => (k.kfa || '').split(' ')[0] || k.kfa);
    destroy('kfa');
    if (kfas.length) {
      charts.kfa = new Chart(document.getElementById('kfaChart'), {
        type: 'bar',
        data: {
          labels,
          datasets: [
            {
              label: 'Layout Score',
              data: kfas.map((k) => k.score),
              backgroundColor: kfas.map((k) => kfaColor(k.kfa)),
              borderRadius: 6,
            },
            {
              label: 'Board Avg',
              data: kfas.map((k) => k.boardAvg),
              backgroundColor: 'rgba(140,148,165,0.35)',
              borderRadius: 6,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 11 } } },
          },
          scales: {
            y: { min: 0, max: 100, grid: { color: '#eef1f8' } },
            x: { grid: { display: false } },
          },
        },
      });
    }

    document.getElementById('kfaRankList').innerHTML = kfas.map((k) => `
      <li>
        <span class="name"><span class="rank-num">${k.rank}</span> ${k.kfa}</span>
        <span style="display:flex;align-items:center;gap:8px">
          <span class="hint">${k.status || ''}</span>
          <span class="score-pill ${scoreClass(k.score)}">${fmt(k.score, 1)}</span>
        </span>
      </li>`).join('') || '<li><span class="name">No KFA summary for this layout</span></li>';

    // Recommended interventions (from interventions workbook)
    const ivs = L.interventions || [];
    document.getElementById('intervList').innerHTML = ivs.length
      ? ivs.map((iv) => `
        <li>
          <div style="flex:1">
            <div style="font-weight:600">${iv.intervention}</div>
            <div style="font-size:0.72rem;color:var(--muted);margin-top:2px">
              ${iv.kfa || '—'}${iv.ip ? ' · ' + iv.ip : ''}
            </div>
            <div style="font-size:0.75rem;margin-top:4px;color:var(--text)">
              Addresses: ${iv.problem || '—'}
            </div>
          </div>
          <div style="text-align:right;flex-shrink:0">
            <span class="sev ${sevClass(iv.severity)}">${iv.severity || '—'}</span>
            <div class="hint" style="margin-top:4px">${iv.pct != null ? iv.pct + '%' : ''}</div>
          </div>
        </li>`).join('')
      : '<li><div style="color:var(--muted)">No interventions listed for this layout.</div></li>';

    // Top problems
    const problems = L.topProblems || [];
    document.getElementById('problemsList').innerHTML = problems.length
      ? problems.map((p) => `
        <div class="issue-row">
          <span><strong>${p.rank}.</strong> ${p.problem}
            <span class="hint" style="margin-left:6px">${p.type || ''} · ${p.kfa || ''}</span>
          </span>
          <span style="display:flex;align-items:center;gap:8px">
            <span class="hint">${p.pct != null ? p.pct + '%' : ''}</span>
            <span class="sev ${p.pct >= 55 ? 'high' : p.pct >= 40 ? 'medium' : 'low'}">${p.type || 'Item'}</span>
          </span>
        </div>`).join('')
      : '<div style="color:var(--muted);font-size:0.85rem">No top-problem summary for this layout.</div>';

    const highSev = ivs.filter((i) => (i.severity || '').toLowerCase() === 'high').length;
    const kfaSet = new Set(ivs.map((i) => i.kfa).filter(Boolean));
    const worst = kfas[0];
    document.getElementById('glance').innerHTML = `
      <div class="info-tile"><div class="l">Recommended Interventions</div><div class="v">${ivs.length}</div></div>
      <div class="info-tile"><div class="l">High-Severity Links</div><div class="v" style="color:var(--red)">${highSev}</div></div>
      <div class="info-tile"><div class="l">KFAs Covered</div><div class="v">${kfaSet.size}</div></div>
      <div class="info-tile"><div class="l">Weakest KFA</div><div class="v" style="font-size:0.95rem">${worst ? worst.kfa : '—'}</div></div>
    `;

    // Group interventions by KFA
    const byKfa = {};
    ivs.forEach((iv) => {
      const k = iv.kfa || 'Other';
      (byKfa[k] ||= []).push(iv);
    });
    document.getElementById('byKfa').innerHTML = Object.keys(byKfa).length
      ? Object.entries(byKfa).map(([k, list]) => `
        <div class="ba-card" style="text-align:left">
          <div style="font-weight:700;font-size:0.8rem;color:${kfaColor(k)};margin-bottom:6px">${k}</div>
          ${list.map((iv) => `<div style="font-size:0.75rem;padding:3px 0;border-bottom:1px solid var(--border)">${iv.intervention}</div>`).join('')}
        </div>`).join('')
      : '<div style="color:var(--muted)">No interventions to group.</div>';

    document.getElementById('benefits').innerHTML = [
      score != null ? `Layout composite KFA average is ${fmt(score)}` : 'KFA scores unavailable for this layout',
      worst ? `Priority focus: ${worst.kfa} (${fmt(worst.score, 1)} vs board ${fmt(worst.boardAvg, 1)})` : 'No KFA ranking available',
      `${ivs.length} intervention option(s) mapped from survey problems`,
      problems[0] ? `Top reported need: ${problems[0].problem}` : 'No top problem listed',
    ].map((t) => `<li>${t}</li>`).join('');
  }

  fLayout.addEventListener('change', render);
  render();
  bindBoardSwitcher(boardId);

  /*
  =============================================================================
  PROJECTION LOGIC (kept for later — not used while impact is recommendation-only)
  =============================================================================

  const INTERVENTIONS = [
    { id: 'lift', name: 'Lift Enhancement / Installation', kfa: 'housing', points: 4.5, costMin: 18, costMax: 28, weeks: 10 },
    { id: 'led', name: 'LED Lighting Upgrade', kfa: 'environment', points: 2.1, costMin: 1.2, costMax: 2.0, weeks: 3 },
    { id: 'drain', name: 'Drainage Improvement', kfa: 'environment', points: 1.8, costMin: 3.5, costMax: 5.5, weeks: 6 },
    { id: 'cctv', name: 'CCTV & Security Personnel', kfa: 'social', points: 2.4, costMin: 2.0, costMax: 3.5, weeks: 4 },
    { id: 'park', name: 'Parking Rationalisation', kfa: 'housing', points: 1.5, costMin: 2.5, costMax: 4.0, weeks: 5 },
    { id: 'community', name: 'Community Space Upgrade', kfa: 'social', points: 2.0, costMin: 4.0, costMax: 6.5, weeks: 8 },
    { id: 'gov', name: 'Society Governance Training', kfa: 'governance', points: 1.6, costMin: 0.4, costMax: 0.8, weeks: 2 },
    { id: 'livelihood', name: 'Livelihood Access Support', kfa: 'economic', points: 2.2, costMin: 1.5, costMax: 3.0, weeks: 12 },
  ];

  const KFA_KEYS = ['housing', 'social', 'environment', 'economic', 'governance'];
  const selected = new Set(['lift', 'led', 'drain']);

  function projectScores(b) {
    const base = {
      housing: b.housing || 0, social: b.social || 0, environment: b.environment || 0,
      economic: b.economic || 0, governance: b.governance || 0, hhi: b.hhi || 0,
    };
    const projected = { ...base };
    const gains = { housing: 0, social: 0, environment: 0, economic: 0, governance: 0 };
    INTERVENTIONS.filter((i) => selected.has(i.id)).forEach((iv) => { gains[iv.kfa] += iv.points; });
    KFA_KEYS.forEach((k) => { projected[k] = Math.min(100, base[k] + gains[k]); });
    projected.hhi = KFA_KEYS.reduce((s, k) => s + projected[k], 0) / 5;
    const baseHhi = KFA_KEYS.reduce((s, k) => s + base[k], 0) / 5;
    return { base, projected, gains, baseHhi, delta: projected.hhi - baseHhi };
  }

  function makeGauge(canvasId, value, color) { /* doughnut gauge for current vs projected *\/ }
  // Also previously: Current vs Projected grouped bar chart, delta points/%,
  // implementation roadmap, before/after cards, cost & investment estimates,
  // and building-level filters (fBuilding, fAge).
  =============================================================================
  */

  function resizeCharts() {
    Object.values(charts).forEach((c) => {
      if (c && typeof c.resize === 'function') c.resize();
    });
  }
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(resizeCharts, 120);
  });
  if (typeof ResizeObserver !== 'undefined') {
    const chartObserver = new ResizeObserver(() => resizeCharts());
    document.querySelectorAll('.chart-box, .gauge-wrap canvas').forEach((el) => chartObserver.observe(el));
  }
})();
