(async function () {
  const manifest = await HHIData.loadManifest();
  const boardId = await HHIData.resolveBoardId();
  const data = await HHIData.loadBoard(boardId);
  const interventions = await HHIData.loadInterventions(boardId);
  const boardLabel = HHIData.boardLabel(data);
  const shell = renderShell('dashboard', {
    location: boardLabel,
    boardId,
    boards: HHIData.boardOptions(manifest),
  });
  const charts = {};
  let syncingFilters = false;

  const AGE_BANDS = [
    { key: 'New', label: '0–15 New', color: '#a60f2d' },
    { key: 'Mid-Age', label: '15–32 Mid', color: '#85698e' },
    { key: 'Ageing', label: '32–45 Ageing', color: '#5b8def' },
    { key: 'Old', label: '45–57 Old', color: '#1eb5cc' },
    { key: 'Cess', label: '57+ Legacy', color: '#e07a1e' },
  ];

  const KFA_LINES = [
    { key: 'housing', label: 'Housing', color: '#635bff' },
    { key: 'social', label: 'Social', color: '#3b82f6' },
    { key: 'environment', label: 'Environment', color: '#27c281' },
    { key: 'economic', label: 'Economic', color: '#f59e0b' },
    { key: 'governance', label: 'Governance', color: '#ff4d4f' },
  ];

  function rowsInScope(buildings) {
    const layouts = new Set(buildings.map((b) => b.layout).filter(Boolean));
    return (interventions.interventions || []).filter((r) => r.layout && layouts.has(r.layout));
  }

  function issueInterventionGroups(rows, limit = 10) {
    const byProblem = {};
    rows.forEach((r) => {
      if (!r.problem) return;
      if (!byProblem[r.problem]) {
        byProblem[r.problem] = {
          problem: r.problem,
          pct: r.pct,
          severity: r.severity,
          rank: r.rank ?? 99,
          suggestions: [],
        };
      }
      const g = byProblem[r.problem];
      if ((r.pct || 0) > (g.pct || 0)) g.pct = r.pct;
      if ((r.rank ?? 99) < g.rank) g.rank = r.rank ?? 99;
      if (r.name && !g.suggestions.includes(r.name)) g.suggestions.push(r.name);
    });
    return Object.values(byProblem)
      .sort((a, b) => (a.rank - b.rank) || (b.pct || 0) - (a.pct || 0))
      .slice(0, limit);
  }

  const KFA_META = {
    housing: { label: 'Housing', full: 'Housing Infrastructure' },
    social: { label: 'Social', full: 'Social Well-being' },
    environment: { label: 'Env.', full: 'Environment' },
    economic: { label: 'Econ.', full: 'Economic Security' },
    governance: { label: 'Gov.', full: 'Governance' },
  };

  document.getElementById('app').innerHTML = `
    ${shell.sidebar}
    <div class="main">
      ${shell.topbar}
      <div class="content">
        <div class="page-head">
          <div>
            <div class="crumbs">Dashboard &gt; <span id="crumbScope">${boardLabel}</span></div>
            <h1>HHI Analytics Dashboard</h1>
            <p class="sub" id="pageSub">Board-level scores from ${boardLabel} working sheet</p>
          </div>
          <div class="actions">
            <button type="button" class="btn btn-outline" id="btnReset">Reset Filters</button>
            <button type="button" class="btn btn-primary">Export</button>
          </div>
        </div>

        <div class="dash-layout">
          <aside class="filter-panel">
            <h3>Filters</h3>
            <div class="field">
              <label>Board</label>
              <select id="fBoard"></select>
            </div>
            <div class="field">
              <label>Division</label>
              <select id="fDivision"><option value="">All Divisions</option></select>
            </div>
            <div class="field">
              <label>Layout</label>
              <select id="fLayout"><option value="">All Layouts</option></select>
            </div>
            <div class="field">
              <label>Building</label>
              <select id="fBuilding"><option value="">All Buildings</option></select>
            </div>
            <div class="field">
              <label>Age Category</label>
              <select id="fAge">
                <option value="">All Ages</option>
                <option value="New">0–15 New</option>
                <option value="Mid-Age">15–32 Mid-Age</option>
                <option value="Ageing">32–45 Ageing</option>
                <option value="Old">45–57 Old</option>
                <option value="Cess">57+ Cess</option>
              </select>
            </div>
            <div class="field">
              <label>Key Focus Area</label>
              <select id="fKfa">
                <option value="">All KFAs (Overall HHI)</option>
                <option value="housing">Housing Infrastructure</option>
                <option value="social">Social Well-being</option>
                <option value="environment">Environment</option>
                <option value="economic">Economic Security</option>
                <option value="governance">Governance</option>
              </select>
            </div>

            <h3 style="margin-top:18px">Comparison Mode</h3>
            <div class="radio-group">
              <label><input type="radio" name="cmp" value="division" checked /> View by Division</label>
              <label><input type="radio" name="cmp" value="layout" /> View by Layout</label>
              <label><input type="radio" name="cmp" value="building" /> View by Building</label>
            </div>

            <div class="quick-actions">
              <h3>Quick Actions</h3>
              <a class="btn-link" href="assets/HHI_Intervention_v4.pdf" download="HHI_Intervention_v4.pdf">⬇ Intervention Catalog (PDF)</a>
              <button type="button">⬇ Download Report</button>
              <button type="button">▣ Compare Selections</button>
              <button type="button">⚑ Flag for Review</button>
            </div>
          </aside>

          <div>
            <div class="kpi-row" id="kpiRow"></div>

            <div class="grid-charts-top">
              <div class="card chart-card">
                <div class="card-title">KFA Scores <span class="hint">selection average</span></div>
                <div class="chart-box stretch"><canvas id="divCountChart"></canvas></div>
              </div>
              <div class="card chart-card">
                <div class="card-title">RVA Score vs Building Age <span class="hint" id="rvaHint">line · avg by age band</span></div>
                <div class="chart-box stretch"><canvas id="rvaAgeChart"></canvas></div>
              </div>
            </div>

            <div class="grid-3b">
              <div class="card">
                <div class="card-title">Building Age-Wise Composition <span class="hint" id="agePieHint">board</span></div>
                <div class="chart-box fill"><canvas id="agePieChart"></canvas></div>
              </div>
              <div class="card">
                <div class="card-title">HHI Heatmap <span class="hint" id="heatmapHint">Divisions × KFA</span></div>
                <div id="heatmap" class="heatmap"></div>
              </div>
              <div class="card">
                <div class="card-title">Top / Lowest <span id="rankScope">Layouts</span></div>
                <div class="section-split" style="grid-template-columns:1fr;gap:8px">
                  <div>
                    <div class="hint" style="font-size:0.75rem;font-weight:700;color:var(--green);margin-bottom:4px">Top 5</div>
                    <ul class="rank-list" id="topList"></ul>
                  </div>
                  <div>
                    <div class="hint" style="font-size:0.75rem;font-weight:700;color:var(--red);margin:8px 0 4px">Lowest 5</div>
                    <ul class="rank-list" id="lowList"></ul>
                  </div>
                </div>
              </div>
            </div>

            <div class="grid-bottom">
              <div class="card fill-card">
                <div class="card-title">Reported Issues &amp; Suggested Interventions <span class="hint">col E problem → col B intervention</span></div>
                <div id="issueInterventionList" class="issue-intervention-list"></div>
              </div>
              <div class="card fill-card">
                <div class="card-title">Interventions Being Offered <span class="hint">catalog · apply to enroll</span></div>
                <ul class="offered-list" id="offeredList"></ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  const fDivision = document.getElementById('fDivision');
  const fLayout = document.getElementById('fLayout');
  const fBuilding = document.getElementById('fBuilding');
  const fAge = document.getElementById('fAge');
  const fKfa = document.getElementById('fKfa');

  data.divisions.forEach((d) => {
    const opt = document.createElement('option');
    opt.value = d.division;
    opt.textContent = d.division;
    fDivision.appendChild(opt);
  });

  function layoutsFor(div) {
    return data.layouts.filter((l) => !div || l.division === div);
  }

  function buildingsFor(div, layout) {
    return data.buildings.filter((b) =>
      (!div || b.division === div) && (!layout || b.layout === layout)
    );
  }

  function refillLayouts(keepValue) {
    const div = fDivision.value;
    const prev = keepValue !== undefined ? keepValue : fLayout.value;
    fLayout.innerHTML = '<option value="">All Layouts</option>';
    layoutsFor(div)
      .sort((a, b) => a.layout.localeCompare(b.layout))
      .forEach((l) => {
        const opt = document.createElement('option');
        opt.value = l.layout;
        opt.textContent = l.layout;
        fLayout.appendChild(opt);
      });
    if (prev && [...fLayout.options].some((o) => o.value === prev)) {
      fLayout.value = prev;
    }
    refillBuildings();
  }

  function refillBuildings(keepValue) {
    const div = fDivision.value;
    const layout = fLayout.value;
    const prev = keepValue !== undefined ? keepValue : fBuilding.value;
    fBuilding.innerHTML = '<option value="">All Buildings</option>';
    buildingsFor(div, layout)
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
      .forEach((b) => {
        const opt = document.createElement('option');
        opt.value = b.name;
        opt.textContent = b.name;
        fBuilding.appendChild(opt);
      });
    if (prev && [...fBuilding.options].some((o) => o.value === prev)) {
      fBuilding.value = prev;
    }
  }

  function scoreKey() {
    return fKfa.value || 'hhi';
  }

  function scoreLabel() {
    const k = fKfa.value;
    return k ? KFA_META[k].full : 'HHI';
  }

  function cmpMode() {
    const el = document.querySelector('input[name="cmp"]:checked');
    return el ? el.value : 'division';
  }

  function resolveAgeBandFilter(b) {
    if (b.ageBand) return b.ageBand;
    const age = b.buildingAge != null ? Number(b.buildingAge)
      : (b.year ? 2026 - Number(b.year) : null);
    if (age == null || Number.isNaN(age)) return null;
    if (age < 15) return 'New';
    if (age < 32) return 'Mid-Age';
    if (age < 45) return 'Ageing';
    if (age < 57) return 'Old';
    return 'Cess';
  }

  function filteredBuildings() {
    const div = fDivision.value;
    const layout = fLayout.value;
    const building = fBuilding.value;
    const age = fAge.value;
    return data.buildings.filter((b) =>
      (!div || b.division === div) &&
      (!layout || b.layout === layout) &&
      (!building || b.name === building) &&
      (!age || b.ageBand === age || resolveAgeBandFilter(b) === age)
    );
  }

  function avg(arr, key) {
    const vals = arr.map((x) => x[key]).filter((v) => v != null && !Number.isNaN(v));
    if (!vals.length) return null;
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  }

  function destroyChart(key) {
    if (charts[key]) {
      charts[key].destroy();
      delete charts[key];
    }
  }

  function truncate(str, n = 22) {
    if (!str) return '';
    return str.length > n ? str.slice(0, n - 1) + '…' : str;
  }

  function groupEntities(buildings, mode) {
    const map = {};
    buildings.forEach((b) => {
      let key;
      let label;
      if (mode === 'building') {
        key = b.division + '|' + b.layout + '|' + b.name;
        label = b.name;
      } else if (mode === 'layout') {
        key = b.division + '|' + b.layout;
        label = b.layout;
      } else {
        key = b.division;
        label = b.division;
      }
      if (!map[key]) map[key] = { key, label, division: b.division, items: [] };
      map[key].items.push(b);
    });
    return Object.values(map)
      .map((g) => ({
        ...g,
        score: avg(g.items, scoreKey()),
        hhi: avg(g.items, 'hhi'),
        housing: avg(g.items, 'housing'),
        social: avg(g.items, 'social'),
        environment: avg(g.items, 'environment'),
        economic: avg(g.items, 'economic'),
        governance: avg(g.items, 'governance'),
        count: g.items.length,
      }))
      .filter((g) => g.score != null)
      .sort((a, b) => b.score - a.score);
  }

  function updateCrumb(buildings) {
    const parts = [boardLabel];
    if (fDivision.value) parts.push(fDivision.value);
    if (fLayout.value) parts.push(fLayout.value);
    if (fBuilding.value) parts.push(fBuilding.value);
    if (fAge.value) parts.push('Age ' + fAge.value);
    document.getElementById('crumbScope').textContent = parts.join(' › ');
    const surveys = buildings.reduce((s, b) => s + (b.surveys || 0), 0);
    document.getElementById('pageSub').textContent =
      `${fmtInt(surveys || data.overall.surveys)} surveys · ${fmtInt(buildings.length)} buildings · showing ${scoreLabel()}`;
  }

  function render() {
    const buildings = filteredBuildings();
    const sk = scoreKey();
    const mode = cmpMode();
    updateCrumb(buildings);

    if (!buildings.length) {
      document.getElementById('kpiRow').innerHTML =
        `<div class="card" style="grid-column:1/-1;text-align:center;padding:28px;color:var(--muted)">No buildings match these filters. Try resetting.</div>`;
      destroyChart('agePie');
      destroyChart('divCount');
      destroyChart('rvaAge');
      document.getElementById('heatmap').innerHTML = '';
      document.getElementById('topList').innerHTML = '<li><span class="name">No data</span></li>';
      document.getElementById('lowList').innerHTML = '<li><span class="name">No data</span></li>';
      document.getElementById('issueInterventionList').innerHTML = '<div class="empty-hint">No data</div>';
      document.getElementById('offeredList').innerHTML = '';
      return;
    }

    const o = {
      hhi: avg(buildings, 'hhi'),
      housing: avg(buildings, 'housing'),
      social: avg(buildings, 'social'),
      environment: avg(buildings, 'environment'),
      economic: avg(buildings, 'economic'),
      governance: avg(buildings, 'governance'),
      composite: avg(buildings, 'composite'),
      layouts: new Set(buildings.map((b) => b.layout)).size,
      buildings: buildings.length,
      surveys: buildings.reduce((s, b) => s + (b.surveys || 0), 0),
    };

    document.getElementById('kpiRow').innerHTML = `
      <div class="kpi purple">
        <div class="kpi-icon">${HHIIcons.chart}</div>
        <div class="label">${fKfa.value ? scoreLabel() : 'Overall HHI Score'}</div>
        <div class="value">${fmt(fKfa.value ? o[sk] : o.hhi)}</div>
        <div class="foot">out of 100</div>
      </div>
      <div class="kpi green">
        <div class="kpi-icon">${HHIIcons.house}</div>
        <div class="label">Number of Buildings</div>
        <div class="value">${fmtInt(o.buildings)}</div>
        <div class="foot">in selection</div>
      </div>
      <div class="kpi teal">
        <div class="kpi-icon">${HHIIcons.map}</div>
        <div class="label">Total Layouts</div>
        <div class="value">${fmtInt(o.layouts)}</div>
        <div class="foot">in selection</div>
      </div>
      <div class="kpi orange">
        <div class="kpi-icon">${HHIIcons.target}</div>
        <div class="label">Avg Index</div>
        <div class="value">${fmt(o.composite)}</div>
        <div class="foot">board composite</div>
      </div>
      <div class="kpi blue">
        <div class="kpi-icon">${HHIIcons.clipboard}</div>
        <div class="label">Surveys Completed</div>
        <div class="value">${fmtInt(o.surveys || data.overall.surveys)}</div>
        <div class="foot">in selection</div>
      </div>
    `;

    // Age composition pie — respects layout/division filters
    const ageBands = [
      { key: 'New', label: 'New', range: '0–15', color: '#a60f2d' },
      { key: 'Mid-Age', label: 'Mid-Age', range: '15–32', color: '#85698e' },
      { key: 'Ageing', label: 'Ageing', range: '32–45', color: '#5b8def' },
      { key: 'Old', label: 'Old', range: '45–57', color: '#1eb5cc' },
      { key: 'Cess', label: 'Legacy/Cess', range: '57+', color: '#e07a1e' },
    ];
    function resolveAgeBand(b) {
      if (b.ageBand) return b.ageBand;
      const age = b.buildingAge != null ? Number(b.buildingAge)
        : (b.year ? 2026 - Number(b.year) : null);
      if (age == null || Number.isNaN(age)) return null;
      if (age < 15) return 'New';
      if (age < 32) return 'Mid-Age';
      if (age < 45) return 'Ageing';
      if (age < 57) return 'Old';
      return 'Cess';
    }
    const ageCounts = Object.fromEntries(ageBands.map((a) => [a.key, 0]));
    let ageKnown = 0;
    buildings.forEach((b) => {
      const band = resolveAgeBand(b);
      if (!band || ageCounts[band] == null) return;
      ageCounts[band] += 1;
      ageKnown += 1;
    });
    const ageLabels = ageBands.map((a) => a.label);
    const ageData = ageBands.map((a) => ageCounts[a.key]);
    const ageColors = ageBands.map((a) => a.color);
    const scopeHint = fBuilding.value || fLayout.value || fDivision.value || 'board';
    document.getElementById('agePieHint').textContent = scopeHint;
    document.getElementById('rankScope').textContent = mode === 'building' ? 'Buildings' : 'Layouts';

    destroyChart('agePie');
    charts.agePie = new Chart(document.getElementById('agePieChart'), {
      type: 'pie',
      data: {
        labels: ageLabels,
        datasets: [{
          data: ageData,
          backgroundColor: ageColors,
          borderColor: '#fff',
          borderWidth: 2,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        layout: { padding: 4 },
        plugins: {
          legend: {
            position: 'right',
            align: 'center',
            labels: {
              boxWidth: 12,
              boxHeight: 12,
              font: { size: 11, weight: '600' },
              padding: 14,
              generateLabels: (chart) => {
                const ds = chart.data.datasets[0];
                const total = ds.data.reduce((s, v) => s + (v || 0), 0) || 1;
                return chart.data.labels.map((label, i) => {
                  const n = ds.data[i] || 0;
                  const pct = (n / total) * 100;
                  return {
                    text: `${label}  ${pct.toFixed(1)}%`,
                    fillStyle: ds.backgroundColor[i],
                    strokeStyle: '#fff',
                    lineWidth: 1,
                    hidden: false,
                    index: i,
                  };
                });
              },
            },
          },
          tooltip: {
            callbacks: {
              label: (item) => {
                const total = item.dataset.data.reduce((s, v) => s + (v || 0), 0) || 1;
                const pct = (item.raw / total) * 100;
                const band = ageBands[item.dataIndex];
                return ` ${band.label} (${band.range}): ${fmtInt(item.raw)} buildings (${pct.toFixed(1)}%)`;
              },
            },
          },
        },
      },
      plugins: [{
        id: 'agePiePercentLabels',
        afterDatasetsDraw(chart) {
          const { ctx } = chart;
          const meta = chart.getDatasetMeta(0);
          const total = chart.data.datasets[0].data.reduce((s, v) => s + (v || 0), 0);
          if (!total) {
            ctx.save();
            ctx.fillStyle = '#8c94a5';
            ctx.font = '600 13px DM Sans, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            const { left, right, top, bottom } = chart.chartArea;
            ctx.fillText('No age data for this filter', (left + right) / 2, (top + bottom) / 2);
            ctx.restore();
            return;
          }
          ctx.save();
          ctx.font = '700 12px DM Sans, sans-serif';
          ctx.fillStyle = '#fff';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          meta.data.forEach((arc, i) => {
            const val = chart.data.datasets[0].data[i] || 0;
            const pct = (val / total) * 100;
            if (pct < 4) return; // skip tiny slices
            const pos = arc.tooltipPosition();
            ctx.fillText(`${pct.toFixed(1)}%`, pos.x, pos.y);
          });
          ctx.restore();
        },
      }],
    });

    // Heatmap grouping: boards when All Boards, else divisions
    const geoByBoard = boardId === 'all' || boardId === HHIData.ALL_ID;
    const byGeo = {};
    buildings.forEach((b) => {
      const key = geoByBoard
        ? (b.board || b.boardId || 'Board')
        : (b._divisionRaw || b.division || 'Unknown');
      if (!byGeo[key]) byGeo[key] = [];
      byGeo[key].push(b);
    });
    const geoLabels = Object.keys(byGeo).sort((a, b) => a.localeCompare(b));
    document.getElementById('heatmapHint').textContent = geoByBoard ? 'Boards × KFA' : 'Divisions × KFA';

    const bandLabels = AGE_BANDS.map((a) => a.label);
    const byAgeBand = Object.fromEntries(AGE_BANDS.map((a) => [a.key, []]));
    buildings.forEach((b) => {
      const band = resolveAgeBand(b);
      if (band && byAgeBand[band]) byAgeBand[band].push(b);
    });

    const chartScales = {
      y: { min: 0, max: 100, grid: { color: '#eef1f8' }, ticks: { font: { size: 10 } } },
      x: { grid: { display: false }, ticks: { font: { size: 10, weight: '600' } } },
    };

    // KFA scores bar chart
    const kfaBoardScores = KFA_LINES.map((k) => {
      const v = avg(buildings, k.key);
      return v == null ? null : Math.round(v * 10) / 10;
    });
    destroyChart('divCount');
    charts.divCount = new Chart(document.getElementById('divCountChart'), {
      type: 'bar',
      data: {
        labels: KFA_LINES.map((k) => k.label),
        datasets: [{
          label: 'KFA Score',
          data: kfaBoardScores,
          backgroundColor: KFA_LINES.map((k) => k.color),
          borderRadius: 6,
          barPercentage: 0.92,
          categoryPercentage: 0.9,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        layout: { padding: { top: 18 } },
        plugins: { legend: { display: false } },
        scales: chartScales,
      },
      plugins: [{
        id: 'kfaBarValueLabels',
        afterDatasetsDraw(chart) {
          const { ctx } = chart;
          const meta = chart.getDatasetMeta(0);
          ctx.save();
          ctx.font = '700 11px DM Sans, sans-serif';
          ctx.fillStyle = '#1a1c2c';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'bottom';
          meta.data.forEach((bar, i) => {
            const val = chart.data.datasets[0].data[i];
            if (val == null) return;
            ctx.fillText(fmt(val, 1), bar.x, bar.y - 4);
          });
          ctx.restore();
        },
      }],
    });

    // RVA vs building age — line chart
    const rvaByBand = Object.fromEntries(AGE_BANDS.map((a) => [a.key, []]));
    buildings.forEach((b) => {
      const band = resolveAgeBand(b);
      if (!band || b.rva == null || Number.isNaN(Number(b.rva))) return;
      rvaByBand[band].push(Number(b.rva));
    });
    const rvaAvgs = AGE_BANDS.map((a) => {
      const vals = rvaByBand[a.key];
      return vals.length ? Math.round((vals.reduce((s, v) => s + v, 0) / vals.length) * 10) / 10 : null;
    });
    const rvaCounts = AGE_BANDS.map((a) => rvaByBand[a.key].length);
    const rvaTotal = rvaCounts.reduce((s, n) => s + n, 0);
    document.getElementById('rvaHint').textContent = rvaTotal
      ? `${rvaTotal} buildings with RVA`
      : 'No RVA data for this selection';
    destroyChart('rvaAge');
    charts.rvaAge = new Chart(document.getElementById('rvaAgeChart'), {
      type: 'line',
      data: {
        labels: bandLabels,
        datasets: [{
          label: 'Avg RVA',
          data: rvaAvgs,
          borderColor: '#635bff',
          backgroundColor: 'rgba(99,91,255,0.12)',
          borderWidth: 3,
          pointRadius: 5,
          pointBackgroundColor: '#635bff',
          pointBorderColor: '#fff',
          pointBorderWidth: 2,
          fill: true,
          tension: 0.35,
          spanGaps: true,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (item) => {
                const n = rvaCounts[item.dataIndex] || 0;
                const v = item.raw;
                return v == null ? ' No RVA data' : ` ${fmt(v, 1)} avg RVA (${n} buildings)`;
              },
            },
          },
        },
        scales: chartScales,
      },
    });

    // Heatmap
    const kfas = [
      { key: 'housing', label: 'Housing' },
      { key: 'social', label: 'Social' },
      { key: 'environment', label: 'Env.' },
      { key: 'economic', label: 'Econ.' },
      { key: 'governance', label: 'Gov.' },
    ];
    const hm = document.getElementById('heatmap');
    hm.innerHTML = `<div class="heatmap-head"><span></span>${kfas.map((k) =>
      `<span style="${fKfa.value === k.key ? 'color:var(--purple)' : ''}">${k.label}</span>`
    ).join('')}</div>`;
    geoLabels.forEach((d) => {
      const items = byGeo[d];
      const row = document.createElement('div');
      row.className = 'heatmap-row';
      row.innerHTML = `<div class="hm-label" title="${d}">${d}</div>` +
        kfas.map((k) => {
          const v = avg(items, k.key);
          const dim = fKfa.value && fKfa.value !== k.key ? 'opacity:0.35;' : '';
          return `<div class="hm-cell" style="background:${scoreColor(v)};${dim}" title="${k.label}: ${fmt(v)}">${fmt(v, 0)}</div>`;
        }).join('');
      hm.appendChild(row);
    });

    // Top / lowest — layouts unless comparison is building
    const rankMode = mode === 'building' ? 'building' : 'layout';
    const ranked = groupEntities(buildings, rankMode);
    const topList = document.getElementById('topList');
    const lowList = document.getElementById('lowList');
    topList.innerHTML = ranked.slice(0, 5).map((l) =>
      `<li><span class="name" title="${l.label}">${l.label}</span><span class="score-pill high">${fmt(l.score, 1)}</span></li>`
    ).join('') || '<li><span class="name">No data</span></li>';
    lowList.innerHTML = [...ranked].reverse().slice(0, 5).map((l) =>
      `<li><span class="name" title="${l.label}">${l.label}</span><span class="score-pill low">${fmt(l.score, 1)}</span></li>`
    ).join('') || '<li><span class="name">No data</span></li>';

    const scopedRows = rowsInScope(buildings);
    const issueGroups = issueInterventionGroups(scopedRows, 10);

    document.getElementById('issueInterventionList').innerHTML = issueGroups.length
      ? issueGroups.map((g, idx) => {
        const pct = g.pct;
        const sevRaw = (g.severity || '').toLowerCase();
        const sev = sevRaw === 'high' || (pct != null && pct >= 60) ? 'high'
          : sevRaw === 'medium' || (pct != null && pct >= 40) ? 'medium' : 'low';
        const sug = (g.suggestions || []).map((s) =>
          `<span class="suggestion-tag" title="${s}">${truncate(s, 36)}</span>`
        ).join('');
        return `<div class="issue-intervention-row">
          <div class="issue-head">
            <span class="issue-title">${idx + 1}. ${g.problem}</span>
            <span class="issue-meta"><span class="sev ${sev}">${sev === 'high' ? 'High' : sev === 'medium' ? 'Medium' : 'Low'}</span></span>
          </div>
          ${sug ? `<div class="suggestion-tags">${sug}</div>` : '<div class="hint">No intervention mapped</div>'}
        </div>`;
      }).join('')
      : '<div class="empty-hint">No issues for this selection.</div>';

    const catalog = interventions.catalog || [];
    document.getElementById('offeredList').innerHTML = catalog.length
      ? catalog.map((item) => `
        <li class="offered-item">
          <div class="offered-meta">
            <span class="offered-id">#${item.id}</span>
            <span class="name" title="${item.name}">${item.name}</span>
            ${item.kfa ? `<span class="hint">${item.kfa}</span>` : ''}
          </div>
          <button type="button" class="btn btn-outline btn-apply" data-intervention="${item.name.replace(/"/g, '&quot;')}">Apply</button>
        </li>`).join('')
      : '<li class="empty-hint">No intervention catalog for this board.</li>';

    document.querySelectorAll('.btn-apply').forEach((btn) => {
      btn.addEventListener('click', () => {
        btn.textContent = 'Applied';
        btn.disabled = true;
        btn.classList.add('applied');
      });
    });
  }

  function onFilterChange(source) {
    if (syncingFilters) return;
    syncingFilters = true;
    try {
      if (source === 'division') {
        refillLayouts('');
      } else if (source === 'layout') {
        refillBuildings('');
      }
    } finally {
      syncingFilters = false;
    }
    render();
  }

  fDivision.addEventListener('change', () => onFilterChange('division'));
  fLayout.addEventListener('change', () => onFilterChange('layout'));
  fBuilding.addEventListener('change', () => onFilterChange('building'));
  fAge.addEventListener('change', () => onFilterChange('age'));
  fKfa.addEventListener('change', () => onFilterChange('kfa'));
  document.querySelectorAll('input[name="cmp"]').forEach((r) => {
    r.addEventListener('change', () => onFilterChange('cmp'));
  });

  document.getElementById('btnReset').addEventListener('click', () => {
    syncingFilters = true;
    fDivision.value = '';
    refillLayouts('');
    fAge.value = '';
    fKfa.value = '';
    document.querySelector('input[name="cmp"][value="division"]').checked = true;
    syncingFilters = false;
    render();
  });

  refillLayouts();
  render();

  const fBoard = document.getElementById('fBoard');
  HHIData.boardOptions(manifest).forEach((b) => {
    const opt = document.createElement('option');
    opt.value = b.id;
    opt.textContent = b.label;
    if (b.id === boardId) opt.selected = true;
    fBoard.appendChild(opt);
  });
  fBoard.addEventListener('change', () => {
    HHIData.setBoardId(fBoard.value);
    const url = new URL(window.location.href);
    url.searchParams.set('board', fBoard.value);
    window.location.href = url.toString();
  });
  bindBoardSwitcher(boardId);
})();
