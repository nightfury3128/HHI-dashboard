(async function () {
  const data = await fetch('data/mumbai.json').then((r) => r.json());
  const shell = renderShell('survey', { location: 'Mumbai Board' });
  const charts = {};
  const o = data.overall;
  const demo = data.demographics || { age: {}, gender: {}, responsesByMonth: {} };
  const byDiv = data.surveysByDivision || {};

  // Simple QR-like pattern (visual placeholder linking to survey)
  function qrSvg() {
    const cells = [];
    const n = 21;
    // deterministic pattern from board name
    let seed = 42;
    const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const finder =
          (x < 7 && y < 7) || (x > n - 8 && y < 7) || (x < 7 && y > n - 8);
        const border = x === 0 || y === 0 || x === n - 1 || y === n - 1;
        const on = finder
          ? (x % 6 === 0 || y % 6 === 0 || (x > 1 && x < 5 && y > 1 && y < 5))
          : rand() > 0.55;
        if (on || border) {
          cells.push(`<rect x="${x}" y="${y}" width="1" height="1" fill="#0a1128"/>`);
        }
      }
    }
    return `<svg viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges">${cells.join('')}</svg>`;
  }

  document.getElementById('app').innerHTML = `
    ${shell.sidebar}
    <div class="main">
      ${shell.topbar}
      <div class="content">
        <div class="page-head">
          <div>
            <div class="crumbs">Dashboard &gt; Survey Portal &gt; <span>Survey Management Portal</span></div>
            <h1>Survey Management Portal</h1>
            <p class="sub">Create, share, and monitor HHI household surveys for Mumbai Board.</p>
          </div>
          <div class="actions">
            <button type="button" class="btn btn-outline">How it works?</button>
            <button type="button" class="btn btn-outline">Survey Guidelines</button>
            <button type="button" class="btn btn-primary">+ Create New Survey</button>
          </div>
        </div>

        <div class="survey-kpis">
          <div class="survey-kpi purple">
            <div class="l">Total Surveys Created</div>
            <div class="v">1</div>
            <div class="f">Active Surveys: 1</div>
          </div>
          <div class="survey-kpi green">
            <div class="l">Total Responses</div>
            <div class="v">${fmtInt(o.surveys)}</div>
            <div class="f">Mumbai Board</div>
          </div>
          <div class="survey-kpi blue">
            <div class="l">Completion Rate</div>
            <div class="v">100%</div>
            <div class="f">Submitted responses</div>
          </div>
          <div class="survey-kpi orange">
            <div class="l">Unique Households</div>
            <div class="v">${fmtInt(o.surveys)}</div>
            <div class="f">Participated</div>
          </div>
          <div class="survey-kpi purple">
            <div class="l">Avg. Time to Complete</div>
            <div class="v">14m</div>
            <div class="f">Per Survey (est.)</div>
          </div>
          <div class="survey-kpi teal">
            <div class="l">Response Coverage</div>
            <div class="v">${fmtInt(o.buildings)}</div>
            <div class="f">Buildings scored</div>
          </div>
        </div>

        <div class="survey-mid">
          <div class="card">
            <div class="card-title">Create &amp; Share Survey</div>
            <div class="tabs" id="shareTabs">
              <button type="button" class="active" data-tab="qr">QR Code</button>
              <button type="button" data-tab="link">Survey Link</button>
              <button type="button" data-tab="embed">Embed Code</button>
            </div>
            <div id="tabQr">
              <div class="qr-box">${qrSvg()}</div>
              <div class="survey-meta">
                <strong>HHI – Mumbai Board Household Survey</strong><br/>
                ID: HHI-MUM-2026 · Status: <span class="status-pill">Active</span><br/>
                Responses: ${fmtInt(o.surveys)}
              </div>
              <div class="actions" style="justify-content:center">
                <button type="button" class="btn btn-primary">Download QR</button>
                <button type="button" class="btn btn-outline">Print QR</button>
              </div>
            </div>
            <div id="tabLink" hidden>
              <p style="font-size:0.85rem;color:var(--muted);margin-bottom:8px">Share this survey link with enumerators and residents.</p>
              <div class="link-row">
                <input id="surveyLink" readonly value="https://hhi.mhada.gov.in/survey/mumbai-board" />
                <button type="button" class="btn btn-primary" id="btnCopy">Copy Link</button>
              </div>
            </div>
            <div id="tabEmbed" hidden>
              <p style="font-size:0.85rem;color:var(--muted);margin-bottom:8px">Embed the survey form on a portal page.</p>
              <textarea readonly style="width:100%;min-height:90px;padding:10px;border:1px solid var(--border);border-radius:8px;font-size:0.75rem;font-family:monospace">&lt;iframe src="https://hhi.mhada.gov.in/survey/mumbai-board" width="100%" height="600"&gt;&lt;/iframe&gt;</textarea>
            </div>
          </div>

          <div class="card">
            <div class="card-title">Survey Responses Over Time</div>
            <div class="chart-box tall"><canvas id="trendChart"></canvas></div>
            <div class="info-grid" style="margin-top:10px">
              <div class="info-tile"><div class="l">Feb 2026</div><div class="v">${fmtInt(demo.responsesByMonth['2026-02'] || 0)}</div></div>
              <div class="info-tile"><div class="l">Mar 2026</div><div class="v">${fmtInt(demo.responsesByMonth['2026-03'] || 0)}</div></div>
              <div class="info-tile"><div class="l">All Time</div><div class="v">${fmtInt(o.surveys)}</div></div>
              <div class="info-tile"><div class="l">Divisions</div><div class="v">${o.divisions}</div></div>
            </div>
          </div>

          <div class="card">
            <div class="card-title">Survey Response Status Map</div>
            <div class="resp-map" id="respMap"></div>
            <div class="legend-bar" style="margin-top:10px"><span>Low</span><div class="grad"></div><span>High</span></div>
            <div style="margin-top:14px">
              <div class="card-title" style="margin-bottom:8px">Survey Status Overview</div>
              <div class="status-grid">
                <div class="status-tile active"><div class="n">1</div><div class="l">Active</div></div>
                <div class="status-tile draft"><div class="n">0</div><div class="l">Draft</div></div>
                <div class="status-tile done"><div class="n">0</div><div class="l">Completed</div></div>
                <div class="status-tile expired"><div class="n">0</div><div class="l">Expired</div></div>
              </div>
            </div>
          </div>
        </div>

        <div class="survey-bottom">
          <div class="card">
            <div class="card-title">Participation Insights</div>
            <div class="donut-pair">
              <div>
                <div style="font-size:0.75rem;font-weight:600;text-align:center;margin-bottom:4px">By Age Group</div>
                <div class="donut-box"><canvas id="ageChart"></canvas></div>
              </div>
              <div>
                <div style="font-size:0.75rem;font-weight:600;text-align:center;margin-bottom:4px">By Gender</div>
                <div class="donut-box"><canvas id="genderChart"></canvas></div>
              </div>
            </div>
          </div>

          <div class="card">
            <div class="card-title">Response Rate by Division</div>
            <table class="div-table">
              <thead>
                <tr><th>Division</th><th>Responses</th><th>Buildings</th><th>Resp / Bldg</th></tr>
              </thead>
              <tbody id="divTable"></tbody>
            </table>
          </div>

          <div class="card">
            <div class="card-title">Recent Responses</div>
            <ul class="activity" id="recentList"></ul>
          </div>
        </div>

        <div class="quick-bar">
          <button type="button" class="btn btn-outline">Create New Survey</button>
          <button type="button" class="btn btn-outline">Manage Surveys</button>
          <button type="button" class="btn btn-outline">Generate QR in Bulk</button>
          <button type="button" class="btn btn-outline">Download Responses</button>
          <button type="button" class="btn btn-outline">View Analytics</button>
          <button type="button" class="btn btn-outline">Send Reminder</button>
        </div>

        <div class="tip-banner">
          <span><strong>Tip:</strong> Higher participation leads to more accurate HHI scores and better planning. Use QR codes at society meetings to boost response rates.</span>
          <button type="button" class="btn btn-outline" style="flex-shrink:0">Contact Support</button>
        </div>
      </div>
    </div>
  `;

  // Tabs
  const tabs = {
    qr: document.getElementById('tabQr'),
    link: document.getElementById('tabLink'),
    embed: document.getElementById('tabEmbed'),
  };
  document.querySelectorAll('#shareTabs button').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#shareTabs button').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      Object.keys(tabs).forEach((k) => { tabs[k].hidden = k !== btn.dataset.tab; });
    });
  });
  document.getElementById('btnCopy').addEventListener('click', async () => {
    const input = document.getElementById('surveyLink');
    try {
      await navigator.clipboard.writeText(input.value);
      document.getElementById('btnCopy').textContent = 'Copied!';
      setTimeout(() => { document.getElementById('btnCopy').textContent = 'Copy Link'; }, 1500);
    } catch {
      input.select();
    }
  });

  // Response map by division
  const maxResp = Math.max(...Object.values(byDiv), 1);
  const respMap = document.getElementById('respMap');
  data.divisions.forEach((d) => {
    const n = byDiv[d.division] || 0;
    const t = n / maxResp;
    const color = t > 0.75 ? '#166534' : t > 0.5 ? '#27c281' : t > 0.3 ? '#f59e0b' : '#fb923c';
    const el = document.createElement('div');
    el.className = 'resp-tile';
    el.style.background = color;
    el.innerHTML = `<span>${d.division}</span><strong>${fmtInt(n)}</strong>`;
    respMap.appendChild(el);
  });

  // Division table
  document.getElementById('divTable').innerHTML = data.divisions.map((d) => {
    const resp = byDiv[d.division] || 0;
    const rate = d.buildings ? (resp / d.buildings) : 0;
    return `<tr>
      <td><strong>${d.division}</strong></td>
      <td>${fmtInt(resp)}</td>
      <td>${fmtInt(d.buildings)}</td>
      <td><span class="score-pill ${rate >= 8 ? 'high' : rate >= 5 ? 'mid' : 'low'}">${fmt(rate, 1)}</span></td>
    </tr>`;
  }).join('');

  // Recent activity (synthetic from top layouts / divisions)
  const recent = data.topLayouts.slice(0, 5).map((l, i) => ({
    id: `R-${4161 - i * 17}`,
    where: `${l.layout} · ${l.division}`,
    t: ['2 min ago', '18 min ago', '1 hr ago', '3 hr ago', 'Yesterday'][i],
  }));
  document.getElementById('recentList').innerHTML = recent.map((r) => `
    <li>
      <span class="pipe" style="background:var(--green)"></span>
      <div><strong>${r.id}</strong><br/><span style="color:var(--muted)">${r.where}</span></div>
      <span class="t">${r.t}</span>
    </li>`).join('');

  // Trend chart
  const months = Object.keys(demo.responsesByMonth || {}).sort();
  const monthLabels = months.length ? months : ['2026-02', '2026-03'];
  const monthVals = monthLabels.map((m) => demo.responsesByMonth[m] || 0);
  charts.trend = new Chart(document.getElementById('trendChart'), {
    type: 'line',
    data: {
      labels: monthLabels.map((m) => {
        const [y, mo] = m.split('-');
        return ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][+mo - 1] + ' ' + y.slice(2);
      }),
      datasets: [{
        label: 'Responses',
        data: monthVals,
        borderColor: '#635bff',
        backgroundColor: 'rgba(99,91,255,0.12)',
        fill: true,
        tension: 0.35,
        pointRadius: 5,
        pointBackgroundColor: '#3b82f6',
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: { beginAtZero: true, grid: { color: '#eef1f8' } },
        x: { grid: { display: false } },
      },
    },
  });

  // Age donut
  const ageEntries = Object.entries(demo.age || {}).sort((a, b) => b[1] - a[1]);
  charts.age = new Chart(document.getElementById('ageChart'), {
    type: 'doughnut',
    data: {
      labels: ageEntries.map(([k]) => k.replace(' years', '').replace(' above', '+')),
      datasets: [{
        data: ageEntries.map(([, v]) => v),
        backgroundColor: ['#635bff', '#3b82f6', '#27c281', '#f59e0b', '#ff4d4f'],
        borderWidth: 0,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: '58%',
      plugins: { legend: { position: 'bottom', labels: { boxWidth: 8, font: { size: 9 } } } },
    },
  });

  const genEntries = Object.entries(demo.gender || {}).filter(([k]) => k !== 'Unknown');
  charts.gender = new Chart(document.getElementById('genderChart'), {
    type: 'doughnut',
    data: {
      labels: genEntries.map(([k]) => k),
      datasets: [{
        data: genEntries.map(([, v]) => v),
        backgroundColor: ['#3b82f6', '#ec4899', '#14b8a6', '#8c94a5'],
        borderWidth: 0,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: '58%',
      plugins: { legend: { position: 'bottom', labels: { boxWidth: 8, font: { size: 9 } } } },
    },
  });
})();
