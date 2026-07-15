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
    { key: 'Mid-Age', label: '15–30 Mid', color: '#85698e' },
    { key: 'Ageing', label: '30–45 Ageing', color: '#5b8def' },
    { key: 'Old', label: '45–57 Old', color: '#1eb5cc' },
    { key: 'Cess', label: '57+ Cess', color: '#e07a1e' },
  ];

  const KFA_LINES = [
    { key: 'housing', label: 'Housing', color: '#635bff' },
    { key: 'social', label: 'Social', color: '#3b82f6' },
    { key: 'environment', label: 'Environment', color: '#27c281' },
    { key: 'economic', label: 'Economic', color: '#f59e0b' },
    { key: 'governance', label: 'Governance', color: '#ff4d4f' },
  ];

  function rowsInScope(buildings) {
    const layouts = new Set(buildings.map((b) => canonLayout(b.layout)).filter(Boolean));
    return (interventions.interventions || []).filter((r) => r.layout && layouts.has(canonLayout(r.layout)));
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
                <option value="Mid-Age">15–30 Mid-Age</option>
                <option value="Ageing">30–45 Ageing</option>
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

          <div class="dash-main">
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

            <div class="grid-rank-heat">
              <div class="rank-tables">
                <div class="card">
                  <div class="card-title">Top Performing <span class="hint" id="rankScopeTop">Layouts</span></div>
                  <div class="table-wrap">
                    <table class="rank-table" id="topTable">
                      <thead>
                        <tr><th>#</th><th id="topNameHead">Layout</th><th>Index</th></tr>
                      </thead>
                      <tbody id="topList"></tbody>
                    </table>
                  </div>
                </div>
                <div class="card">
                  <div class="card-title">Lowest Performing <span class="hint" id="rankScopeLow">Layouts</span></div>
                  <div class="table-wrap">
                    <table class="rank-table" id="lowTable">
                      <thead>
                        <tr><th>#</th><th id="lowNameHead">Layout</th><th>Index</th></tr>
                      </thead>
                      <tbody id="lowList"></tbody>
                    </table>
                  </div>
                </div>
              </div>
              <div class="card heatmap-card">
                <div class="card-title">HHI Heatmap <span class="hint" id="heatmapHint">Divisions × KFA</span></div>
                <div id="heatmap" class="heatmap"></div>
              </div>
            </div>

            <div class="grid-bottom">
              <div class="card fill-card issues-card" id="issuesCard">
                <div class="card-title">Reported Issues <span class="hint">problems in selection</span></div>
                <div id="reportedIssuesList" class="issue-intervention-list"></div>
              </div>
              <div class="card fill-card suggestions-card" id="suggestionsCard">
                <div class="card-title">Suggested Improvements <span class="hint">mapped interventions</span></div>
                <div id="suggestedImprovementsList" class="issue-intervention-list"></div>
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

  // Fuzzy-merge near-duplicate filter labels (case/spacing/punctuation/typos)
  const Fuzzy = window.HHIFuzzy;
  const divisionCluster = Fuzzy.buildClusterMap([
    ...(data.divisions || []).map((d) => d.division),
    ...data.buildings.map((b) => b.division),
  ]);
  const layoutCluster = Fuzzy.buildClusterMap([
    ...(data.layouts || []).map((l) => l.layout),
    ...data.buildings.map((b) => b.layout),
    ...((interventions.interventions || []).map((r) => r.layout)),
  ]);
  const buildingCluster = Fuzzy.buildClusterMap(data.buildings.map((b) => b.name));

  function canonDivision(v) { return divisionCluster.resolve(v); }
  function canonLayout(v) { return layoutCluster.resolve(v); }
  function canonBuilding(v) { return buildingCluster.resolve(v); }

  function matchesDivision(b, selected) {
    if (!selected) return true;
    return canonDivision(b.division) === selected;
  }
  function matchesLayout(b, selected) {
    if (!selected) return true;
    return canonLayout(b.layout) === selected;
  }
  function matchesBuilding(b, selected) {
    if (!selected) return true;
    return canonBuilding(b.name) === selected;
  }

  divisionCluster.canonicals().forEach((div) => {
    const opt = document.createElement('option');
    opt.value = div;
    opt.textContent = div;
    fDivision.appendChild(opt);
  });

  function layoutsFor(div) {
    const set = new Set();
    data.buildings.forEach((b) => {
      if (!matchesDivision(b, div)) return;
      if (b.layout) set.add(canonLayout(b.layout));
    });
    return [...set].sort((a, b) => a.localeCompare(b));
  }

  function buildingsFor(div, layout) {
    const set = new Set();
    data.buildings.forEach((b) => {
      if (!matchesDivision(b, div) || !matchesLayout(b, layout)) return;
      if (b.name) set.add(canonBuilding(b.name));
    });
    return [...set].sort((a, b) => a.localeCompare(b));
  }

  function refillLayouts(keepValue) {
    const div = fDivision.value;
    const prev = keepValue !== undefined ? keepValue : fLayout.value;
    const prevCanon = prev ? canonLayout(prev) : '';
    fLayout.innerHTML = '<option value="">All Layouts</option>';
    layoutsFor(div).forEach((layout) => {
      const opt = document.createElement('option');
      opt.value = layout;
      opt.textContent = layout;
      fLayout.appendChild(opt);
    });
    if (prevCanon && [...fLayout.options].some((o) => o.value === prevCanon)) {
      fLayout.value = prevCanon;
    }
    refillBuildings();
  }

  function refillBuildings(keepValue) {
    const div = fDivision.value;
    const layout = fLayout.value;
    const prev = keepValue !== undefined ? keepValue : fBuilding.value;
    const prevCanon = prev ? canonBuilding(prev) : '';
    fBuilding.innerHTML = '<option value="">All Buildings</option>';
    buildingsFor(div, layout).forEach((name) => {
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
      fBuilding.appendChild(opt);
    });
    if (prevCanon && [...fBuilding.options].some((o) => o.value === prevCanon)) {
      fBuilding.value = prevCanon;
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
    const age = b.buildingAge != null ? Number(b.buildingAge)
      : (b.year ? 2026 - Number(b.year) : null);
    if (age != null && !Number.isNaN(age)) {
      if (age <= 15) return 'New';
      if (age < 30) return 'Mid-Age';
      if (age < 45) return 'Ageing';
      if (age <= 57) return 'Old';
      return 'Cess';
    }
    return b.ageBand || null;
  }
  function resolveAgeBand(b) {
    return resolveAgeBandFilter(b);
  }

  function filteredBuildings() {
    const div = fDivision.value;
    const layout = fLayout.value;
    const building = fBuilding.value;
    const age = fAge.value;
    return data.buildings.filter((b) =>
      matchesDivision(b, div) &&
      matchesLayout(b, layout) &&
      matchesBuilding(b, building) &&
      (!age || b.ageBand === age || resolveAgeBandFilter(b) === age)
    );
  }

  function avg(arr, key) {
    const vals = arr.map((x) => x[key]).filter((v) => v != null && !Number.isNaN(v));
    if (!vals.length) return null;
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  }


  /** Tight Y-axis for RVA line chart — 5-point steps with padding (matches workbook pivot charts). */
  function rvaChartScales(values) {
    const nums = values.filter((v) => v != null && !Number.isNaN(Number(v))).map(Number);
    const xScale = { grid: { display: false }, ticks: { font: { size: 10, weight: '600' } } };
    if (!nums.length) {
      return {
        y: { min: 0, max: 100, grid: { color: '#eef1f8' }, ticks: { font: { size: 10 } } },
        x: xScale,
      };
    }
    const dataMin = Math.min(...nums);
    const dataMax = Math.max(...nums);
    const span = dataMax - dataMin || 10;
    const padding = Math.max(span * 0.12, 2);
    let yMin = Math.floor((dataMin - padding) / 5) * 5;
    let yMax = Math.ceil((dataMax + padding) / 5) * 5;
    if (yMax - yMin < 15) {
      const mid = (dataMin + dataMax) / 2;
      yMin = Math.floor((mid - 7.5) / 5) * 5;
      yMax = Math.ceil((mid + 7.5) / 5) * 5;
    }
    yMin = Math.max(0, yMin);
    yMax = Math.min(100, Math.max(yMax, yMin + 10));
    return {
      y: {
        min: yMin,
        max: yMax,
        grid: { color: '#eef1f8' },
        ticks: {
          font: { size: 10 },
          stepSize: 5,
          callback: (v) => Number(v).toFixed(2),
        },
      },
      x: xScale,
    };
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
      const div = canonDivision(b.division);
      const layout = canonLayout(b.layout);
      const name = canonBuilding(b.name);
      if (mode === 'building') {
        key = div + '|' + layout + '|' + name;
        label = name;
      } else if (mode === 'layout') {
        key = div + '|' + layout;
        label = layout;
      } else {
        key = div;
        label = div;
      }
      if (!map[key]) map[key] = { key, label, division: div, items: [] };
      map[key].items.push(b);
    });
    return Object.values(map)
      .map((g) => ({
        ...g,
        // Rank Top/Lowest by Index (layout/building avg of building Index)
        score: avg(g.items, 'index') ?? avg(g.items, 'composite'),
        hhi: avg(g.items, 'hhi'),
        index: avg(g.items, 'index') ?? avg(g.items, 'composite'),
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
      destroyChart('divCount');
      destroyChart('rvaAge');
      document.getElementById('heatmap').innerHTML = '';
      document.getElementById('topList').innerHTML = '<tr><td colspan="3" class="empty-hint">No data</td></tr>';
      document.getElementById('lowList').innerHTML = '<tr><td colspan="3" class="empty-hint">No data</td></tr>';
      document.getElementById('reportedIssuesList').innerHTML = '<div class="empty-hint">No data</div>';
      document.getElementById('suggestedImprovementsList').innerHTML = '<div class="empty-hint">No data</div>';
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
      layouts: new Set(buildings.map((b) => canonLayout(b.layout)).filter(Boolean)).size,
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

    const entityLabel = mode === 'building' ? 'Buildings' : 'Layouts';
    const nameHead = mode === 'building' ? 'Building' : 'Layout';
    document.getElementById('rankScopeTop').textContent = entityLabel;
    document.getElementById('rankScopeLow').textContent = entityLabel;
    document.getElementById('topNameHead').textContent = nameHead;
    document.getElementById('lowNameHead').textContent = nameHead;

    // Heatmap grouping: boards when All Boards, else divisions
    const geoByBoard = boardId === 'all' || boardId === HHIData.ALL_ID;
    const byGeo = {};
    buildings.forEach((b) => {
      const key = geoByBoard
        ? (b.board || b.boardId || 'Board')
        : (canonDivision(b._divisionRaw || b.division) || 'Unknown');
      if (!byGeo[key]) byGeo[key] = [];
      byGeo[key].push(b);
    });
    const geoLabels = Object.keys(byGeo).sort((a, b) => a.localeCompare(b));
    document.getElementById('heatmapHint').textContent = geoByBoard ? 'Boards × KFA + Index' : 'Divisions × KFA + Index';

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

    // RVA vs building age — line chart (board-wide uses Overall Score pivot averages)
    const scopeFiltered = !!(fDivision.value || fLayout.value || fBuilding.value || fAge.value);
    const osPool = buildings.some((b) => b.inOverallScore)
      ? buildings.filter((b) => b.inOverallScore)
      : buildings;
    let rvaAvgs;
    let rvaCounts;
    const boardRvaByAge = data.rvaByAgeBand && Object.values(data.rvaByAgeBand).some((r) => r && r.avg != null)
      ? data.rvaByAgeBand
      : null;
    if (!scopeFiltered && boardRvaByAge) {
      rvaAvgs = AGE_BANDS.map((a) => {
        const row = boardRvaByAge[a.key];
        return row && row.avg != null ? row.avg : null;
      });
      rvaCounts = AGE_BANDS.map((a) => (boardRvaByAge[a.key] && boardRvaByAge[a.key].count) || 0);
    } else {
      const rvaByBand = Object.fromEntries(AGE_BANDS.map((a) => [a.key, []]));
      osPool.forEach((b) => {
        const band = resolveAgeBand(b);
        if (!band || b.rva == null || Number.isNaN(Number(b.rva))) return;
        rvaByBand[band].push(Number(b.rva));
      });
      rvaAvgs = AGE_BANDS.map((a) => {
        const vals = rvaByBand[a.key];
        return vals.length ? Math.round((vals.reduce((s, v) => s + v, 0) / vals.length) * 100) / 100 : null;
      });
      rvaCounts = AGE_BANDS.map((a) => rvaByBand[a.key].length);
    }
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
        scales: rvaChartScales(rvaAvgs),
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
    hm.innerHTML = `<div class="heatmap-head"><span></span><span>Index</span>${kfas.map((k) =>
      `<span style="${fKfa.value === k.key ? 'color:var(--purple)' : ''}">${k.label}</span>`
    ).join('')}</div>`;
    geoLabels.forEach((d) => {
      const items = byGeo[d];
      const row = document.createElement('div');
      row.className = 'heatmap-row';
      const indexVal = avg(items, 'index') ?? avg(items, 'composite');
      row.innerHTML = `<div class="hm-label" title="${d}">${d}</div>` +
        `<div class="hm-cell" style="background:${scoreColor(indexVal)}" title="Index: ${fmt(indexVal)}">${fmt(indexVal, 0)}</div>` +
        kfas.map((k) => {
          const v = avg(items, k.key);
          const dim = fKfa.value && fKfa.value !== k.key ? 'opacity:0.35;' : '';
          return `<div class="hm-cell" style="background:${scoreColor(v)};${dim}" title="${k.label}: ${fmt(v)}">${fmt(v, 0)}</div>`;
        }).join('');
      hm.appendChild(row);
    });

    // Top / lowest tables — layouts unless comparison is building
    const rankMode = mode === 'building' ? 'building' : 'layout';
    const ranked = groupEntities(buildings, rankMode);
    const topList = document.getElementById('topList');
    const lowList = document.getElementById('lowList');
    const topRows = ranked.slice(0, 5);
    const lowRows = [...ranked].reverse().slice(0, 5);
    topList.innerHTML = topRows.length
      ? topRows.map((l, i) =>
          `<tr><td class="rank-num-cell">${i + 1}</td><td class="name" title="${l.label}">${l.label}</td><td><span class="score-pill high">${fmt(l.score, 1)}</span></td></tr>`
        ).join('')
      : '<tr><td colspan="3" class="empty-hint">No data</td></tr>';
    lowList.innerHTML = lowRows.length
      ? lowRows.map((l, i) =>
          `<tr><td class="rank-num-cell">${i + 1}</td><td class="name" title="${l.label}">${l.label}</td><td><span class="score-pill low">${fmt(l.score, 1)}</span></td></tr>`
        ).join('')
      : '<tr><td colspan="3" class="empty-hint">No data</td></tr>';

    const scopedRows = rowsInScope(buildings);
    const issueGroups = issueInterventionGroups(scopedRows, 10);

    function severityOf(g) {
      const pct = g.pct;
      const sevRaw = (g.severity || '').toLowerCase();
      if (sevRaw === 'high' || (pct != null && pct >= 60)) return 'high';
      if (sevRaw === 'medium' || (pct != null && pct >= 40)) return 'medium';
      return 'low';
    }

    document.getElementById('reportedIssuesList').innerHTML = issueGroups.length
      ? issueGroups.map((g, idx) => {
        const sev = severityOf(g);
        return `<div class="issue-intervention-row">
          <div class="issue-head">
            <span class="issue-title">${idx + 1}. ${g.problem}</span>
            <span class="issue-meta"><span class="sev ${sev}">${sev === 'high' ? 'High' : sev === 'medium' ? 'Medium' : 'Low'}</span></span>
          </div>
        </div>`;
      }).join('')
      : '<div class="empty-hint">No issues for this selection.</div>';

    const suggestionItems = [];
    issueGroups.forEach((g) => {
      (g.suggestions || []).forEach((s) => {
        suggestionItems.push({ suggestion: s, problem: g.problem, severity: severityOf(g) });
      });
    });
    // Deduplicate suggestions keeping first problem link
    const seen = new Set();
    const uniqueSuggestions = [];
    suggestionItems.forEach((item) => {
      if (seen.has(item.suggestion)) return;
      seen.add(item.suggestion);
      uniqueSuggestions.push(item);
    });

    document.getElementById('suggestedImprovementsList').innerHTML = uniqueSuggestions.length
      ? uniqueSuggestions.map((item, idx) =>
          `<div class="issue-intervention-row">
            <div class="issue-head">
              <span class="issue-title">${idx + 1}. ${item.suggestion}</span>
            </div>
            <div class="hint">For: ${item.problem}</div>
          </div>`
        ).join('')
      : '<div class="empty-hint">No suggested improvements for this selection.</div>';

    requestAnimationFrame(() => syncSuggestionsCardHeight());
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



  function syncSuggestionsCardHeight() {
    const issues = document.getElementById('issuesCard');
    const suggestions = document.getElementById('suggestionsCard');
    if (!issues || !suggestions) return;
    suggestions.style.height = '';
    const h = issues.getBoundingClientRect().height;
    if (h > 0) suggestions.style.height = Math.round(h) + 'px';
  }
  function resizeCharts() {
    Object.values(charts).forEach((c) => {
      if (c && typeof c.resize === 'function') c.resize();
    });
  }
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      resizeCharts();
      syncSuggestionsCardHeight();
    }, 120);
  });
  if (typeof ResizeObserver !== 'undefined') {
    const chartObserver = new ResizeObserver(() => resizeCharts());
    document.querySelectorAll('.chart-box').forEach((el) => chartObserver.observe(el));
    const issuesCard = document.getElementById('issuesCard');
    if (issuesCard) {
      new ResizeObserver(() => syncSuggestionsCardHeight()).observe(issuesCard);
    }
  }
  syncSuggestionsCardHeight();
  // Shrink top filter bar after scrolling starts
  (function bindCompactTopFilters() {
    const panel = document.querySelector('.filter-panel');
    if (!panel) return;
    const isTopFilterLayout = () => {
      const style = getComputedStyle(panel);
      return style.position === 'sticky' && style.display.includes('grid');
    };
    const sync = () => {
      if (!isTopFilterLayout()) {
        panel.classList.remove('filter-compact');
        return;
      }
      panel.classList.toggle('filter-compact', window.scrollY > 24);
    };
    window.addEventListener('scroll', sync, { passive: true });
    window.addEventListener('resize', sync);
    sync();
  })();
})();
