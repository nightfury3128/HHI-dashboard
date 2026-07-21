/** Shared board data loader for HHI website */
(function () {
  const STORAGE_KEY = 'hhi.boardId';
  const ALL_ID = 'all';

  function avg(vals) {
    const nums = vals.filter((v) => v != null && !Number.isNaN(Number(v))).map(Number);
    if (!nums.length) return null;
    return Math.round((nums.reduce((s, n) => s + n, 0) / nums.length) * 100) / 100;
  }

  function weightedAvg(items, key) {
    let nume = 0;
    let den = 0;
    items.forEach((x) => {
      const v = x[key];
      const w = Number(x.surveys) || 0;
      if (v == null || Number.isNaN(Number(v)) || w <= 0) return;
      nume += Number(v) * w;
      den += w;
    });
    if (den > 0) return Math.round((nume / den) * 100) / 100;
    return avg(items.map((x) => x[key]));
  }

  function mergeBoards(boardPayloads) {
    const buildings = [];
    const topIssuesMap = {};
    const improvementsMap = {};
    const demAge = {};
    const demGender = {};
    const demMonth = {};
    let surveys = 0;

    boardPayloads.forEach(({ meta, data }) => {
      const boardId = meta.id;
      const boardLabel = meta.label || data.overall?.board || boardId;
      const boardShort = boardLabel.replace(/\s*Board\s*$/i, '').trim() || boardLabel;
      surveys += data.overall?.surveys || 0;

      (data.buildings || []).forEach((b) => {
        buildings.push({
          ...b,
          boardId,
          board: boardLabel,
          // Prefix division so filters/zones stay unique across boards
          division: `${boardShort} � ${b.division || 'Unknown'}`,
          _divisionRaw: b.division,
        });
      });

      (data.topIssues || []).forEach((it) => {
        const key = it.issue;
        if (!key) return;
        if (!topIssuesMap[key]) {
          topIssuesMap[key] = { ...it, count: it.count || 0 };
        } else {
          topIssuesMap[key].count = (topIssuesMap[key].count || 0) + (it.count || 0);
        }
      });

      (data.improvements || []).forEach((it) => {
        const key = it.name;
        if (!key) return;
        if (!improvementsMap[key]) {
          improvementsMap[key] = { ...it, count: it.count || 0 };
        } else {
          improvementsMap[key].count = (improvementsMap[key].count || 0) + (it.count || 0);
          if (it.pct != null) {
            const prev = improvementsMap[key].pct;
            improvementsMap[key].pct = prev == null ? it.pct : Math.round(((prev + it.pct) / 2) * 10) / 10;
          }
        }
      });

      const dem = data.demographics || {};
      Object.entries(dem.age || {}).forEach(([k, v]) => { demAge[k] = (demAge[k] || 0) + v; });
      Object.entries(dem.gender || {}).forEach(([k, v]) => { demGender[k] = (demGender[k] || 0) + v; });
      Object.entries(dem.responsesByMonth || {}).forEach(([k, v]) => { demMonth[k] = (demMonth[k] || 0) + v; });
    });

    function group(level) {
      const buckets = {};
      buildings.forEach((b) => {
        const key = level === 'division'
          ? (b.division || 'Unknown')
          : `${b.division}|${b.layout}`;
        (buckets[key] ||= []).push(b);
      });
      return Object.entries(buckets).map(([key, items]) => {
        const row = level === 'division'
          ? {
              division: key,
              buildings: items.length,
              layouts: new Set(items.map((x) => x.layout)).size,
            }
          : {
              division: key.split('|')[0],
              layout: key.split('|').slice(1).join('|'),
              buildings: items.length,
            };
        return {
          ...row,
          hhi: avg(items.map((x) => x.hhi)),
          housing: avg(items.map((x) => x.housing)),
          social: avg(items.map((x) => x.social)),
          environment: avg(items.map((x) => x.environment)),
          economic: avg(items.map((x) => x.economic)),
          governance: avg(items.map((x) => x.governance)),
          composite: avg(items.map((x) => x.composite)),
          index: avg(items.map((x) => x.index)),
          rva: avg(items.map((x) => x.rva)),
        };
      }).sort((a, b) => (b.index || b.hhi || 0) - (a.index || a.hhi || 0));
    }

    const divisions = group('division');
    const layouts = group('layout');
    const byAge = {};
    const byBand = {};
    const surveysByDiv = {};
    const surveysByLayout = {};
    buildings.forEach((b) => {
      if (b.age) byAge[b.age] = (byAge[b.age] || 0) + 1;
      if (b.ageBand) byBand[b.ageBand] = (byBand[b.ageBand] || 0) + 1;
      surveysByDiv[b.division] = (surveysByDiv[b.division] || 0) + (b.surveys || 0);
      const lk = `${b.division}|${b.layout}`;
      surveysByLayout[lk] = (surveysByLayout[lk] || 0) + (b.surveys || 0);
    });

    const topIssues = Object.values(topIssuesMap).sort((a, b) => (b.count || 0) - (a.count || 0)).slice(0, 20);
    const improvements = Object.values(improvementsMap).sort((a, b) => (b.count || 0) - (a.count || 0)).slice(0, 8);

    return {
      overall: {
        board: 'All Boards',
        boardId: ALL_ID,
        buildings: buildings.length,
        layouts: layouts.length,
        divisions: divisions.length,
        surveys,
        hhi: avg(buildings.map((b) => b.hhi)),
        housing: avg(buildings.map((b) => b.housing)),
        social: avg(buildings.map((b) => b.social)),
        environment: avg(buildings.map((b) => b.environment)),
        economic: avg(buildings.map((b) => b.economic)),
        governance: avg(buildings.map((b) => b.governance)),
        composite: avg(buildings.map((b) => b.composite)),
        index: avg(buildings.map((b) => b.index)),
      },
      divisions,
      layouts,
      buildings,
      topLayouts: layouts.slice(0, 5),
      lowestLayouts: [...layouts].sort((a, b) => (a.index == null && a.hhi == null) - (b.index == null && b.hhi == null) || ((a.index ?? a.hhi) || 0) - ((b.index ?? b.hhi) || 0)).slice(0, 5),
      buildingsByAge: byAge,
      buildingsByAgeBand: byBand,
      source: 'all boards � merged working sheets',
      topIssues,
      improvements,
      demographics: {
        age: demAge,
        gender: demGender,
        responsesByMonth: Object.fromEntries(Object.entries(demMonth).sort(([a], [b]) => a.localeCompare(b))),
      },
      surveyPortal: {
        totalSurveys: boardPayloads.length,
        activeSurveys: boardPayloads.length,
        totalResponses: surveys,
        uniqueHouseholds: surveys,
        completionRate: null,
      },
      surveysByDivision: surveysByDiv,
      surveysByLayout: surveysByLayout,
      issuesSample: topIssues.slice(0, 12),
      _meta: { id: ALL_ID, label: 'All Boards', file: null },
    };
  }

  window.HHIData = {
    ALL_ID,

    async loadManifest() {
      if (this._manifest) return this._manifest;
      this._manifest = await fetch('data/boards.json').then((r) => r.json());
      return this._manifest;
    },

    boardOptions(manifest) {
      const boards = manifest?.boards || [];
      return [{ id: ALL_ID, label: 'All Boards' }, ...boards];
    },

    getBoardId() {
      try {
        const q = new URLSearchParams(window.location.search).get('board');
        if (q) return q;
        return localStorage.getItem(STORAGE_KEY) || null;
      } catch {
        return null;
      }
    },

    setBoardId(id) {
      try {
        localStorage.setItem(STORAGE_KEY, id);
      } catch {
        /* ignore */
      }
      const url = new URL(window.location.href);
      url.searchParams.set('board', id);
      window.history.replaceState({}, '', url);
    },

    async resolveBoardId() {
      const manifest = await this.loadManifest();
      const wanted = this.getBoardId();
      const ids = (manifest.boards || []).map((b) => b.id);
      if (wanted === ALL_ID) return ALL_ID;
      if (wanted && ids.includes(wanted)) return wanted;
      return manifest.default || ids[0] || 'mumbai';
    },

    async loadBoard(boardId) {
      const manifest = await this.loadManifest();
      const id = boardId || (await this.resolveBoardId());

      if (id === ALL_ID) {
        if (this._allCache) return this._allCache;
        const payloads = await Promise.all(
          (manifest.boards || []).map(async (meta) => ({
            meta,
            data: await fetch(`data/${meta.file}`, { cache: 'no-store' }).then((r) => r.json()),
          }))
        );
        this._allCache = mergeBoards(payloads);
        return this._allCache;
      }

      const meta = (manifest.boards || []).find((b) => b.id === id) || { id, file: `${id}.json`, label: id };
      const data = await fetch(`data/${meta.file}`, { cache: 'no-store' }).then((r) => r.json());
      data._meta = meta;
      return data;
    },


    async loadInterventions(boardId) {
      const id = boardId || (await this.resolveBoardId());
      if (id === ALL_ID) {
        if (this._allInterventionsCache) return this._allInterventionsCache;
        const manifest = await this.loadManifest();
        const payloads = await Promise.all(
          (manifest.boards || []).map(async (meta) => {
            try {
              return await fetch(`data/interventions/${meta.id}.json`, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null));
            } catch {
              return null;
            }
          })
        );
        const valid = payloads.filter(Boolean);
        const topIssuesMap = {};
        valid.forEach((p) => {
          (p.topIssues || []).forEach((it) => {
            const key = it.issue;
            if (!key) return;
            if (!topIssuesMap[key] || (it.pct || 0) > (topIssuesMap[key].pct || 0)) {
              topIssuesMap[key] = { ...it };
            }
          });
        });
        const catalogMap = {};
        valid.forEach((p) => {
          (p.catalog || []).forEach((c) => {
            if (!catalogMap[c.id]) catalogMap[c.id] = c;
          });
        });
        this._allInterventionsCache = {
          boardId: ALL_ID,
          board: 'All Boards',
          topIssues: Object.values(topIssuesMap).sort((a, b) => (b.pct || 0) - (a.pct || 0)).slice(0, 20),
          interventions: valid.flatMap((p) => p.interventions || []),
          catalog: Object.values(catalogMap).sort((a, b) => a.id - b.id),
        };
        return this._allInterventionsCache;
      }
      if (!this._ivCache) this._ivCache = {};
      if (this._ivCache[id]) return this._ivCache[id];
      try {
        const data = await fetch(`data/interventions/${id}.json`, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null));
        this._ivCache[id] = data || { topIssues: [], interventions: [], catalog: [] };
      } catch {
        this._ivCache[id] = { topIssues: [], interventions: [], catalog: [] };
      }
      return this._ivCache[id];
    },

    boardLabel(data) {
      return data?.overall?.board || data?._meta?.label || 'Board';
    },
  };
})();
