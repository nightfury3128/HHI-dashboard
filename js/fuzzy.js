/** Fuzzy label clustering for filter values (division / layout / building). */
(function () {
  function normalizeLabel(s) {
    if (s == null) return '';
    let t = String(s).replace(/\u00a0/g, ' ');
    t = t.replace(/[\r\n\t]+/g, ' ');
    // Treat - / _ like other separators so "24-Vartak" ≡ "24.Vartak"
    t = t.replace(/[.,;:()[\]{}/\\'"`\-_]+/g, ' ');
    t = t.replace(/\s+/g, ' ').trim().toLowerCase();
    return t;
  }

  function expandRomans(n) {
    // Isolated roman numerals (N-6-I vs N-6-II) become digits so signatures diverge
    return n.replace(/\b(iv|iii|ii|i)\b/gi, (m) => ({
      i: '1', ii: '2', iii: '3', iv: '4',
    }[m.toLowerCase()] || m));
  }

  function digitSig(s) {
    // Include trailing letter on plot/wing codes: 12a ≠ 12, 10a ≠ 10b
    return (expandRomans(normalizeLabel(s)).match(/\d+[a-z]?/g) || []).join('|');
  }

  /** Tokens that must match for a fuzzy (non-exact) merge. */
  function markerSig(s) {
    const n = expandRomans(normalizeLabel(s));
    const parts = [];
    const cls = n.match(/\b(lig|mig|hig|eig|emig)\b/g);
    if (cls) parts.push('c:' + [...cls].sort().join(','));
    // Standalone letters (Building A / Wing B / Bing A)
    const letters = n.match(/(?:^|[^a-z0-9])([a-z])(?=[^a-z0-9]|$)/g);
    if (letters) {
      const cleaned = letters.map((x) => x.replace(/[^a-z]/g, '')).filter(Boolean);
      if (cleaned.length) parts.push('l:' + cleaned.join(','));
    }
    parts.push('d:' + digitSig(s));
    return parts.join('|');
  }

  function similarity(a, b) {
    if (a === b) return 1;
    if (!a.length || !b.length) return 0;
    const m = a.length;
    const n = b.length;
    // Dice coefficient on char bigrams — cheap & good for near-duplicates
    if (m < 2 || n < 2) return a === b ? 1 : 0;
    const bigrams = new Map();
    for (let i = 0; i < m - 1; i++) {
      const bg = a.slice(i, i + 2);
      bigrams.set(bg, (bigrams.get(bg) || 0) + 1);
    }
    let overlap = 0;
    for (let i = 0; i < n - 1; i++) {
      const bg = b.slice(i, i + 2);
      const c = bigrams.get(bg) || 0;
      if (c > 0) {
        overlap += 1;
        bigrams.set(bg, c - 1);
      }
    }
    return (2 * overlap) / (m + n - 2);
  }

  function labelQuality(s) {
    const raw = String(s || '');
    let score = 0;
    if (!/[\r\n]/.test(raw)) score += 4;
    if (raw === raw.trim()) score += 1;
    if (!/\s{2,}/.test(raw)) score += 2;
    // Prefer mixed / title-ish casing over ALL CAPS or all lower
    if (/[a-z]/.test(raw) && /[A-Z]/.test(raw)) score += 3;
    else if (/[A-Z]/.test(raw) && !/[a-z]/.test(raw)) score += 1;
    score += Math.min(raw.length, 80) / 100;
    return score;
  }

  function shouldMerge(a, b) {
    const na = normalizeLabel(a);
    const nb = normalizeLabel(b);
    if (!na || !nb) return false;
    // Exact after normalize: case / whitespace / punctuation / newlines
    if (na === nb) return true;
    // Fuzzy path: require same distinguishing markers (digits, wings, LIG/MIG, etc.)
    if (markerSig(a) !== markerSig(b)) return false;
    const ratio = similarity(na, nb);
    // High threshold; markers already block A↔B / Part 2↔3 style mistakes
    return ratio >= 0.94;
  }

  /**
   * Build a cluster map from raw labels.
   * Returns { resolve(raw), canonicals(), aliases(canonical) }
   */
  function buildClusterMap(labels) {
    const values = [...new Set((labels || []).filter((v) => v != null && String(v).trim() !== ''))];
    const clusters = []; // { canonical, aliases:Set, norms:Set }

    function findClusterIndex(label) {
      for (let i = 0; i < clusters.length; i++) {
        const c = clusters[i];
        if (c.aliases.has(label)) return i;
        for (const alias of c.aliases) {
          if (shouldMerge(alias, label)) return i;
        }
      }
      return -1;
    }

    values.forEach((label) => {
      const idx = findClusterIndex(label);
      if (idx < 0) {
        clusters.push({
          canonical: label,
          aliases: new Set([label]),
          norms: new Set([normalizeLabel(label)]),
        });
        return;
      }
      const c = clusters[idx];
      c.aliases.add(label);
      c.norms.add(normalizeLabel(label));
      if (labelQuality(label) > labelQuality(c.canonical)) c.canonical = label;
    });

    const byRaw = new Map();
    const byNorm = new Map();
    clusters.forEach((c) => {
      c.aliases.forEach((a) => {
        byRaw.set(a, c.canonical);
        byNorm.set(normalizeLabel(a), c.canonical);
      });
    });

    function resolve(raw) {
      if (raw == null || raw === '') return raw;
      if (byRaw.has(raw)) return byRaw.get(raw);
      const n = normalizeLabel(raw);
      if (byNorm.has(n)) return byNorm.get(n);
      // late fuzzy against known aliases
      for (const [alias, canonical] of byRaw.entries()) {
        if (shouldMerge(alias, raw)) {
          byRaw.set(raw, canonical);
          byNorm.set(n, canonical);
          return canonical;
        }
      }
      return raw;
    }

    function canonicals() {
      return clusters.map((c) => c.canonical).sort((a, b) => a.localeCompare(b));
    }

    function aliases(canonical) {
      const c = clusters.find((x) => x.canonical === canonical);
      return c ? [...c.aliases] : [canonical];
    }

    return { resolve, canonicals, aliases, clusters };
  }

  window.HHIFuzzy = {
    normalizeLabel,
    similarity,
    shouldMerge,
    buildClusterMap,
  };
})();
