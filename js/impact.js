(async function () {
  const data = await fetch('data/mumbai.json').then((r) => r.json());
  const shell = renderShell('impact');
  const charts = {};

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
  const KFA_LABELS = {
    housing: 'Housing Infrastructure',
    social: 'Social Well-being',
    environment: 'Environment',
    economic: 'Economic Security',
    governance: 'Governance',
  };

  // Default to a mid-scoring building with weak housing if possible
  let defaultBuilding = data.buildings.find((b) => b.hhi && b.hhi < 65 && b.housing < 60) || data.buildings[0];

  document.getElementById('app').innerHTML = `
    ${shell.sidebar}
    <div class="main">
      ${shell.topbar}
      <div class="content">
        <div class="page-head">
          <div>
            <div class="crumbs">Dashboard &gt; <span>Impact Assessment</span></div>
            <h1>Impact Assessment</h1>
            <p class="sub">Understand how interventions can improve HHI scores across Key Focus Areas.</p>
          </div>
          <div class="actions">
            <button type="button" class="btn btn-outline">Save Scenario</button>
            <button type="button" class="btn btn-primary">Export Report</button>
          </div>
        </div>

        <div class="impact-filters">
          <div class="field">
            <label>Selected Layout</label>
            <select id="fLayout"></select>
          </div>
          <div class="field">
            <label>Selected Building</label>
            <select id="fBuilding"></select>
          </div>
          <div class="field">
            <label>Age Category</label>
            <select id="fAge">
              <option value="">All / Auto</option>
              <option>0-20</option><option>20-30</option><option>30-40</option>
              <option>40-50</option><option>50-60</option><option>60+</option>
            </select>
          </div>
          <div class="score-box">
            <div class="l">Current HHI Score</div>
            <div class="v" id="currentScore">—</div>
          </div>
          <button type="button" class="btn btn-outline" id="btnAddAll">+ Select Suggested</button>
        </div>

        <div class="impact-mid">
          <div class="card">
            <div class="card-title">KFA Score Comparison <span class="hint">Current vs Projected</span></div>
            <div class="chart-box tall"><canvas id="kfaChart"></canvas></div>
          </div>
          <div class="card">
            <div class="card-title">Overall HHI Score Projection</div>
            <div class="gauge-row">
              <div class="gauge-wrap">
                <canvas id="gaugeCurrent"></canvas>
                <div class="gv" id="gCurVal">—</div>
                <div class="gl">Current HHI</div>
              </div>
              <div class="delta-box">
                <div class="big" id="deltaPts">+0.00</div>
                <div class="pct" id="deltaPct">+0% Improvement</div>
              </div>
              <div class="gauge-wrap">
                <canvas id="gaugeProjected"></canvas>
                <div class="gv" id="gProjVal" style="color:var(--green)">—</div>
                <div class="gl">Projected HHI</div>
              </div>
            </div>
          </div>
          <div class="card">
            <div class="card-title">Intervention Summary</div>
            <ul class="interv-list" id="intervList"></ul>
            <div class="interv-total" id="intervTotal">Total Estimated Improvement: +0.00 Points</div>
          </div>
        </div>

        <div class="grid-3" style="margin-bottom:14px">
          <div class="card" style="grid-column:span 2">
            <div class="card-title">Implementation Roadmap</div>
            <div class="roadmap">
              <div class="road-step"><div class="icon">1</div><h4>Planning</h4><p>2–4 weeks</p></div>
              <div class="road-step"><div class="icon">2</div><h4>Procurement</h4><p>3–6 weeks</p></div>
              <div class="road-step"><div class="icon">3</div><h4>Execution</h4><p id="execWeeks">12–16 weeks</p></div>
              <div class="road-step"><div class="icon">4</div><h4>Quality Check</h4><p>2 weeks</p></div>
              <div class="road-step"><div class="icon">5</div><h4>Handover</h4><p>1 week</p></div>
            </div>
            <div class="timeline-bar" id="timelineBar">Total Estimated Timeline: 6 to 9 Months</div>
          </div>
          <div class="card">
            <div class="card-title">Impact at a Glance</div>
            <div class="impact-glance" id="glance"></div>
          </div>
        </div>

        <div class="impact-bottom">
          <div class="card">
            <div class="card-title">Expected Change (Before → After)</div>
            <div class="before-after" id="beforeAfter"></div>
          </div>
          <div class="card">
            <div class="card-title">Key Benefits</div>
            <ul class="benefit-list" id="benefits"></ul>
          </div>
          <div class="card">
            <div class="card-title">Cost &amp; Investment</div>
            <div class="l" style="font-size:0.72rem;color:var(--muted)">Total Estimated Cost</div>
            <div class="cost-big" id="costBig">₹ —</div>
            <div style="font-size:0.75rem;color:var(--muted);margin-bottom:6px">Potential Funding Sources</div>
            <div class="funding-tags">
              <span class="tag">MHADA</span><span class="tag">CSR</span>
              <span class="tag">Society / CHS</span><span class="tag">PPP</span>
            </div>
            <div style="font-size:0.8rem;color:var(--muted);margin:8px 0" id="costPerHh">Est. cost / household: —</div>
            <button type="button" class="btn btn-outline" style="width:100%;justify-content:center">Download Financial Estimate</button>
          </div>
        </div>
      </div>
    </div>
  `;

  const fLayout = document.getElementById('fLayout');
  const fBuilding = document.getElementById('fBuilding');
  const fAge = document.getElementById('fAge');
  const selected = new Set(['lift', 'led', 'drain']);

  const layouts = [...new Map(data.layouts.map((l) => [l.layout, l])).values()]
    .sort((a, b) => a.layout.localeCompare(b.layout));

  layouts.forEach((l) => {
    const o = document.createElement('option');
    o.value = l.layout; o.textContent = l.layout;
    fLayout.appendChild(o);
  });

  function refillBuildings(prefer) {
    const layout = fLayout.value;
    const list = data.buildings.filter((b) => b.layout === layout)
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    fBuilding.innerHTML = '';
    list.forEach((b) => {
      const o = document.createElement('option');
      o.value = b.name; o.textContent = b.name;
      fBuilding.appendChild(o);
    });
    if (prefer && list.some((b) => b.name === prefer)) fBuilding.value = prefer;
    else if (list.length) fBuilding.selectedIndex = 0;
  }

  // init defaults
  fLayout.value = defaultBuilding.layout;
  refillBuildings(defaultBuilding.name);
  if (defaultBuilding.age) fAge.value = defaultBuilding.age;

  function currentBuilding() {
    return data.buildings.find((b) => b.layout === fLayout.value && b.name === fBuilding.value) || defaultBuilding;
  }

  function selectedInterventions() {
    return INTERVENTIONS.filter((i) => selected.has(i.id));
  }

  function projectScores(b) {
    const base = {
      housing: b.housing || 0,
      social: b.social || 0,
      environment: b.environment || 0,
      economic: b.economic || 0,
      governance: b.governance || 0,
      hhi: b.hhi || 0,
    };
    const projected = { ...base };
    const gains = { housing: 0, social: 0, environment: 0, economic: 0, governance: 0 };
    selectedInterventions().forEach((iv) => {
      gains[iv.kfa] += iv.points;
    });
    KFA_KEYS.forEach((k) => {
      projected[k] = Math.min(100, base[k] + gains[k]);
    });
    // Recompute HHI as equal-weight average of KFAs (aligned with working-sheet style)
    projected.hhi = KFA_KEYS.reduce((s, k) => s + projected[k], 0) / 5;
    const baseHhi = KFA_KEYS.reduce((s, k) => s + base[k], 0) / 5;
    return { base, projected, gains, baseHhi, delta: projected.hhi - baseHhi };
  }

  function destroy(k) { if (charts[k]) { charts[k].destroy(); delete charts[k]; } }

  function makeGauge(canvasId, value, color) {
    const key = canvasId;
    destroy(key);
    charts[key] = new Chart(document.getElementById(canvasId), {
      type: 'doughnut',
      data: {
        datasets: [{
          data: [Math.max(0, Math.min(100, value)), 100 - Math.max(0, Math.min(100, value))],
          backgroundColor: [color, '#eef1f8'],
          borderWidth: 0,
          circumference: 180,
          rotation: 270,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: true,
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
        cutout: '75%',
      },
    });
  }

  function renderIntervList() {
    document.getElementById('intervList').innerHTML = INTERVENTIONS.map((iv) => `
      <li>
        <input type="checkbox" data-id="${iv.id}" ${selected.has(iv.id) ? 'checked' : ''} />
        <div style="flex:1">
          <div style="font-weight:600">${iv.name}</div>
          <div style="font-size:0.72rem;color:var(--muted)">${KFA_LABELS[iv.kfa]}</div>
        </div>
        <span class="pts">+${iv.points.toFixed(2)}</span>
      </li>`).join('');

    document.querySelectorAll('#intervList input').forEach((el) => {
      el.addEventListener('change', () => {
        if (el.checked) selected.add(el.dataset.id);
        else selected.delete(el.dataset.id);
        render();
      });
    });
  }

  function render() {
    const b = currentBuilding();
    const { base, projected, gains, baseHhi, delta } = projectScores(b);
    const ivs = selectedInterventions();
    const totalPts = ivs.reduce((s, i) => s + i.points, 0);
    const costMin = ivs.reduce((s, i) => s + i.costMin, 0);
    const costMax = ivs.reduce((s, i) => s + i.costMax, 0);
    const weeks = ivs.reduce((s, i) => s + i.weeks, 0);
    const months = Math.max(3, Math.ceil(weeks / 4.3));
    const hh = Math.max(40, Math.round((b.surveys || 8) * 12));

    document.getElementById('currentScore').textContent = `${fmt(baseHhi)} /100`;
    document.getElementById('gCurVal').textContent = fmt(baseHhi);
    document.getElementById('gProjVal').textContent = fmt(projected.hhi);
    document.getElementById('deltaPts').textContent = `${delta >= 0 ? '+' : ''}${fmt(delta)} Points`;
    const pct = baseHhi ? (delta / baseHhi) * 100 : 0;
    document.getElementById('deltaPct').textContent = `${pct >= 0 ? '+' : ''}${fmt(pct)}% Improvement`;
    document.getElementById('intervTotal').textContent =
      `Total Estimated Improvement: +${fmt(totalPts)} Points`;

    makeGauge('gaugeCurrent', baseHhi, '#f59e0b');
    makeGauge('gaugeProjected', projected.hhi, '#27c281');

    destroy('kfa');
    charts.kfa = new Chart(document.getElementById('kfaChart'), {
      type: 'bar',
      data: {
        labels: KFA_KEYS.map((k) => KFA_LABELS[k].split(' ')[0]),
        datasets: [
          { label: 'Current', data: KFA_KEYS.map((k) => base[k]), backgroundColor: '#c7c9d9', borderRadius: 6 },
          { label: 'Projected', data: KFA_KEYS.map((k) => projected[k]), backgroundColor: '#27c281', borderRadius: 6 },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 11 } } },
          tooltip: {
            callbacks: {
              afterBody: (items) => {
                const i = items[0].dataIndex;
                const g = gains[KFA_KEYS[i]];
                return g ? `Gain: +${g.toFixed(2)}` : '';
              },
            },
          },
        },
        scales: {
          y: { min: 0, max: 100, grid: { color: '#eef1f8' } },
          x: { grid: { display: false } },
        },
      },
    });

    document.getElementById('execWeeks').textContent = weeks ? `${Math.max(8, weeks - 8)}–${weeks} weeks` : '—';
    document.getElementById('timelineBar').textContent =
      `Total Estimated Timeline: ${months} to ${months + 2} Months`;

    const kfasGaining = KFA_KEYS.filter((k) => gains[k] > 0).length;
    document.getElementById('glance').innerHTML = `
      <div class="info-tile"><div class="l">Households Benefited</div><div class="v">~${fmtInt(hh)}</div></div>
      <div class="info-tile"><div class="l">HHI Points Improvement</div><div class="v" style="color:var(--green)">+${fmt(delta)}</div></div>
      <div class="info-tile"><div class="l">KFAs Showing Gain</div><div class="v">${kfasGaining}</div></div>
      <div class="info-tile"><div class="l">Implementation</div><div class="v" style="font-size:0.95rem">${months}–${months + 2} mo</div></div>
    `;

    const baItems = ivs.slice(0, 4);
    document.getElementById('beforeAfter').innerHTML = (baItems.length ? baItems : INTERVENTIONS.slice(0, 4)).map((iv) => `
      <div class="ba-card">
        <div class="ba-pair">
          <div class="ba-box before">Before</div>
          <div class="ba-box after">After</div>
        </div>
        <strong>${iv.name.split('/')[0].trim()}</strong>
      </div>`).join('');

    document.getElementById('benefits').innerHTML = [
      delta > 0 ? `Projected HHI rises by ${fmt(delta)} points for ${b.name}` : 'Select interventions to project gains',
      kfasGaining ? `${kfasGaining} Key Focus Area(s) show measurable improvement` : 'No KFAs selected yet',
      'Safer and better-maintained common areas',
      'Stronger resident satisfaction and society governance',
    ].map((t) => `<li>${t}</li>`).join('');

    document.getElementById('costBig').textContent =
      ivs.length ? `₹ ${costMin.toFixed(1)} – ${costMax.toFixed(1)} L` : '₹ —';
    document.getElementById('costPerHh').textContent = ivs.length
      ? `Est. cost / household: ₹ ${fmtInt(Math.round(((costMin + costMax) / 2) * 100000 / hh))}`
      : 'Est. cost / household: —';
  }

  fLayout.addEventListener('change', () => { refillBuildings(); render(); });
  fBuilding.addEventListener('change', render);
  fAge.addEventListener('change', render);
  document.getElementById('btnAddAll').addEventListener('click', () => {
    // suggest based on weakest KFAs
    const b = currentBuilding();
    const ranked = KFA_KEYS.slice().sort((a, c) => (b[a] || 0) - (b[c] || 0));
    selected.clear();
    INTERVENTIONS.filter((iv) => ranked.slice(0, 3).includes(iv.kfa)).slice(0, 4)
      .forEach((iv) => selected.add(iv.id));
    renderIntervList();
    render();
  });

  renderIntervList();
  render();
})();
