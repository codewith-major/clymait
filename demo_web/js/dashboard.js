/* Clymait – Dashboard (home) and the About page numbers.
   Reads the same data as the map. Nothing here is a new estimate: it re-presents measured data and model results. */
(function () {
  'use strict';

  const A = window.ClymaitApp, F = window.ClymaitFields;
  const root = document.getElementById('home-root');
  if (!A || !root) return;
  const { h, fmt0, fmt1 } = A;
  const D = A.data;
  const SVGNS = 'http://www.w3.org/2000/svg';
  const sv = (tag, props, ...kids) => {
    const n = document.createElementNS(SVGNS, tag);
    if (props) for (const [k, v] of Object.entries(props)) n.setAttribute(k, v);
    kids.flat().forEach((k) => k && n.append(k));
    return n;
  };
  const CROP_COLOR = { rice: '#ecd870', maize: '#f2b94b', groundnut: '#dc9570', cowpea: '#8fd07f', cassava: '#c1a47c', yam: '#bf8ad8', fallow: '#cddcc2', bare: '#8a6b4c' };
  const NAME = { rice: 'Rice', cassava: 'Cassava', yam: 'Yam', maize: 'Maize', cowpea: 'Cowpea', groundnut: 'Groundnut', fallow: 'Fallow' };
  const state = { src: 'map' };

  /* ---------- the isometric field tile (illustration) ---------- */
  // colors: one per strip, left to right across the field.
  function fieldTile(colors) {
    const T = [180, 28], U = [160, 80], V = [-160, 80], TH = 30;
    const P = (u, v) => [T[0] + U[0] * u + V[0] * v, T[1] + U[1] * u + V[1] * v];
    const pts = (a) => a.map((p) => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');
    const svg = sv('svg', { viewBox: '0 0 360 270', class: 'tile-art', role: 'img', 'aria-label': 'Illustration of a field divided into crop strips' });
    const defs = sv('defs', null,
      sv('linearGradient', { id: 'soilL', x1: '0', y1: '0', x2: '0', y2: '1' }, sv('stop', { offset: '0', 'stop-color': '#6a513a' }), sv('stop', { offset: '1', 'stop-color': '#3f2f21' })),
      sv('linearGradient', { id: 'soilR', x1: '0', y1: '0', x2: '0', y2: '1' }, sv('stop', { offset: '0', 'stop-color': '#54412e' }), sv('stop', { offset: '1', 'stop-color': '#30241a' })),
      sv('radialGradient', { id: 'shadow', cx: '.5', cy: '.5', r: '.5' }, sv('stop', { offset: '0', 'stop-color': '#000', 'stop-opacity': '.35' }), sv('stop', { offset: '1', 'stop-color': '#000', 'stop-opacity': '0' })));
    svg.append(defs);
    svg.append(sv('ellipse', { cx: 180, cy: 222, rx: 170, ry: 34, fill: 'url(#shadow)' }));
    const left = [P(0, 1), P(1, 1), [P(1, 1)[0], P(1, 1)[1] + TH], [P(0, 1)[0], P(0, 1)[1] + TH]];
    const right = [P(1, 1), P(1, 0), [P(1, 0)[0], P(1, 0)[1] + TH], [P(1, 1)[0], P(1, 1)[1] + TH]];
    svg.append(sv('polygon', { points: pts(left), fill: 'url(#soilL)' }), sv('polygon', { points: pts(right), fill: 'url(#soilR)' }));
    const n = colors.length;
    colors.forEach((c, i) => {
      const u0 = i / n, u1 = (i + 1) / n;
      svg.append(sv('polygon', { points: pts([P(u0, 0), P(u1, 0), P(u1, 1), P(u0, 1)]), fill: c, stroke: 'rgba(0,0,0,.18)', 'stroke-width': '0.8' }));
      // furrow lines inside the strip
      for (let k = 1; k <= 3; k++) {
        const u = u0 + ((u1 - u0) * k) / 4;
        svg.append(sv('line', { x1: P(u, 0.04)[0], y1: P(u, 0.04)[1], x2: P(u, 0.96)[0], y2: P(u, 0.96)[1], stroke: 'rgba(0,0,0,.13)', 'stroke-width': '1' }));
      }
    });
    svg.append(sv('polygon', { points: pts([P(0, 0), P(1, 0), P(1, 1), P(0, 1)]), fill: 'none', stroke: 'rgba(255,255,255,.55)', 'stroke-width': '1.5' }));
    return svg;
  }

  /* ---------- semicircle gauge ---------- */
  function gauge(value) {
    const L = Math.PI * 80;
    const v = Math.max(0, Math.min(100, value)) / 100;
    return sv('svg', { viewBox: '0 0 200 118', class: 'gauge', role: 'img', 'aria-label': 'Climate stress ' + fmt0(value) + ' out of 100' },
      sv('path', { d: 'M20 100 A80 80 0 0 1 180 100', fill: 'none', stroke: 'rgba(95,40,110,.14)', 'stroke-width': '16', 'stroke-linecap': 'round' }),
      sv('path', { d: 'M20 100 A80 80 0 0 1 180 100', fill: 'none', stroke: '#9b11b7', 'stroke-width': '16', 'stroke-linecap': 'round', 'stroke-dasharray': (L * v).toFixed(1) + ' ' + L.toFixed(1) }),
      sv('text', { x: 100, y: 92, 'text-anchor': 'middle', class: 'gauge-num' }, fmt0(value)),
      sv('text', { x: 100, y: 111, 'text-anchor': 'middle', class: 'gauge-sub' }, 'out of 100'));
  }

  /* ---------- context: a saved field, or the map selection ---------- */
  function context() {
    if (state.src !== 'map') {
      const f = F && F.get(state.src);
      if (f && f.loc.cellId) return { kind: 'field', field: f, cellId: f.loc.cellId };
      state.src = 'map';
    }
    return { kind: 'map', cellId: A.getSelected() || '10.25_7.25' };
  }

  function stripColors(ctx, snap) {
    if (ctx.kind === 'field') {
      const hs = F.historySteps(ctx.field);
      if (hs.steps.length) {
        const k = hs.steps.length, out = [];
        for (let i = 0; i < 8; i++) out.push(CROP_COLOR[hs.steps[i % k].crop] || CROP_COLOR.bare);
        // group equal colours so strips look like fields, not stripes
        return out.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
      }
    }
    // map selection: strips sized by each crop's climate suitability
    const vals = snap.crops.map((c) => ({ k: c.key, v: Math.max(0, c.val) }));
    const total = vals.reduce((a, c) => a + c.v, 0);
    if (total < 3) return Array(8).fill(CROP_COLOR.bare);
    const out = [];
    vals.sort((a, b) => b.v - a.v).forEach((c) => { const n = Math.round((c.v / total) * 8); for (let i = 0; i < n; i++) out.push(CROP_COLOR[c.k]); });
    while (out.length < 8) out.push(CROP_COLOR[vals[0].k]);
    return out.slice(0, 8);
  }

  /* ---------- render ---------- */
  function render() {
    const ctx = context();
    const snap = A.snapshot(ctx.cellId);
    if (!snap) { root.replaceChildren(h('p', { class: 'muted' }, 'Data could not be loaded.')); return; }
    const cell = snap.cell;
    const r = D.risk.find((x) => x.state === snap.state);
    const top = snap.crops[0];
    const lowAll = top.val < 10;
    const title = ctx.kind === 'field' ? ctx.field.name : snap.state;

    // source picker
    const sel = h('select', { id: 'dash-src', 'aria-label': 'What to show' });
    sel.append(h('option', { value: 'map' }, 'Map selection'));
    (F ? F.list() : []).filter((f) => f.loc.cellId).forEach((f) => sel.append(h('option', { value: f.id }, 'Field: ' + f.name)));
    sel.value = state.src;
    sel.addEventListener('change', () => { state.src = sel.value; render(); const n = document.getElementById('dash-src'); if (n) n.focus({ preventScroll: true }); });

    const rotLine = ctx.kind === 'field' ? (() => {
      const hs = F.historySteps(ctx.field);
      return hs.steps.length ? 'Crop history: ' + hs.steps.map((s) => NAME[s.crop]).join(' → ') : 'No dated crop history yet';
    })() : 'Strips show climate suitability for rice, cassava and yam (illustration)';

    const hero = h('section', { class: 'hero', 'aria-labelledby': 'hero-h' },
      h('div', { class: 'hero-text' },
        h('p', { class: 'eyebrow light' }, ctx.kind === 'field' ? 'Your field' : 'Climate check'),
        h('h1', { id: 'hero-h' }, title),
        h('p', { class: 'hero-sub' }, snap.state + ' · map square near ' + cell.lat.toFixed(2) + '° N, ' + cell.lon.toFixed(2) + '° E'),
        h('div', { class: 'hero-kpi' },
          h('span', { class: 'big' }, lowAll ? 'Low' : NAME[top.key]),
          h('span', { class: 'big-sub' }, lowAll ? 'All three crops score low for the climate here' : fmt0(top.val) + ' / 100 · best climate fit of rice, cassava and yam')),
        h('div', { class: 'glass-row' },
          glass(fmt0(snap.climate.annual_rain_mm), 'mm', 'Rain in a year'),
          glass(fmt1(snap.climate.dry_months), '', 'Dry months'),
          glass(fmt1(snap.climate.season_temp_c), '°C', 'Season temperature')),
        h('div', { class: 'btn-row hero-actions' }, heroBtn('Open the map', () => { A.select(ctx.cellId); A.setView('explore'); }, true),
          heroBtn('Plan rotations', () => { if (ctx.kind === 'field' && window.ClymaitPlanner) window.ClymaitPlanner.open(ctx.field.id); else A.setView('planner'); }, false))),
      h('div', { class: 'hero-art' }, fieldTile(stripColors(ctx, snap)), h('p', { class: 'art-cap' }, rotLine)));

    const stress = r ? h('section', { class: 'dcard stress', 'aria-labelledby': 'st-h' },
      h('h2', { id: 'st-h' }, 'Climate stress'),
      gauge(r.climate_stress_index),
      h('p', { class: 'center' }, h('span', { class: 'badge ' + r.risk_level }, { higher: 'Higher risk', medium: 'Medium risk', lower: 'Lower risk' }[r.risk_level])),
      h('p', { class: 'hint center' }, 'Ranks ' + snap.risk.rank + ' of ' + snap.risk.total + ' states (1 = most stress). Measured from past rainfall, heat and drought.'),
      snap.risk.recentCaution ? h('p', { class: 'caution' }, 'The recent drought figure for ' + snap.state + ' looks unusually high and is unverified.') : null) : null;

    const fit = h('section', { class: 'dcard', 'aria-labelledby': 'fit-h' },
      h('h2', { id: 'fit-h' }, 'Crop climate fit'),
      h('ul', { class: 'fit-list' }, snap.crops.map((c) => h('li', null,
        h('div', { class: 'fit-top' }, h('span', { class: 'fit-name' }, NAME[c.key]), h('span', null, h('b', null, fmt0(c.val)), ' / 100')),
        h('div', { class: 'fit-bar', role: 'img', 'aria-label': NAME[c.key] + ' ' + fmt0(c.val) + ' out of 100, usually within plus or minus ' + fmt0(c.err) },
          h('span', { class: 'fit-err', style: 'left:' + Math.max(0, c.val - c.err) + '%;width:' + (Math.min(100, c.val + c.err) - Math.max(0, c.val - c.err)) + '%' }),
          h('span', { class: 'fit-fill', style: 'width:' + Math.max(1, c.val) + '%' }))))),
      h('p', { class: 'hint' }, 'Estimated from climate alone. Light band = usual error. Not a harvest forecast.'));

    const drought = r ? h('section', { class: 'dcard', 'aria-labelledby': 'dr-h' },
      h('h2', { id: 'dr-h' }, 'Drought history'),
      h('p', { class: 'bignum' }, fmt0(r.drought_years_pct_1981_2024), h('span', null, '%')),
      h('p', { class: 'hint' }, 'of years since 1981 had drought (' + snap.state + ', SPEI index)'),
      h('dl', { class: 'facts' },
        h('dt', null, 'Recent period'), h('dd', null, fmt0(r.drought_years_pct_recent) + '%'),
        h('dt', null, 'Worst drought year'), h('dd', null, String(r.worst_drought_year)),
        h('dt', null, 'Longest dry spell'), h('dd', null, fmt0(r.avg_longest_dry_spell_days) + ' days'),
        h('dt', null, 'Rain varies by'), h('dd', null, fmt0(r.rain_variability_pct) + '%'))) : null;

    const stats = window.ClymaitPlanner && window.ClymaitPlanner.stats ? window.ClymaitPlanner.stats() : { plans: 0, feedback: 0, last: null };
    const nFields = F ? F.list().length : 0;
    const planner = h('section', { class: 'dcard dark', 'aria-labelledby': 'pl-h' },
      h('h2', { id: 'pl-h' }, 'Rotation planner'),
      h('div', { class: 'mini-stats' },
        h('div', null, h('b', null, String(nFields)), h('span', null, nFields === 1 ? 'field' : 'fields')),
        h('div', null, h('b', null, String(stats.plans)), h('span', null, stats.plans === 1 ? 'saved plan' : 'saved plans')),
        h('div', null, h('b', null, String(stats.feedback)), h('span', null, 'with feedback'))),
      h('p', { class: 'dim' }, stats.last && stats.last.summary.headline ? 'Latest: ' + stats.last.summary.headline : 'Compare your rotation with three alternatives on climate, drought, water, soil, pests, bare days, income and labor.'),
      h('div', { class: 'btn-row' }, nFields ? heroBtn('Open the planner', () => A.setView('planner'), true) : heroBtn('Add your first field', () => A.setView('fields'), true)));

    const pipeline = h('section', { class: 'dcard wide', 'aria-labelledby': 'pp-h' },
      h('h2', { id: 'pp-h' }, 'Where the numbers come from'),
      h('div', { class: 'src-row' }, [
        ['CHIRPS v3.0', 'Monthly rainfall'], ['NASA POWER', 'Temperature, heat days'], ['SPEIbase 2.11', 'Drought history'], ['FAO GAEZ v5', 'Suitability ratings'], ['Sourced rules', 'FAO, IITA, ICRISAT trials'],
      ].map(([a, b]) => h('div', { class: 'src' }, h('b', null, a), h('span', null, b)))),
      h('p', { class: 'hint' }, 'Suitability models are tested on map squares they had not seen: R² ' + r2Range() + '. Climate explains about half of the ratings. Soil and terrain are not included yet.'));

    root.replaceChildren(
      h('div', { class: 'dash-head' }, h('div', null, h('h2', { class: 'dash-title' }, greeting()), h('p', { class: 'muted' }, 'A climate and crop-rotation check for Nigerian farms.')),
        h('div', { class: 'dash-pick' }, h('label', { for: 'dash-src' }, 'Showing'), sel)),
      h('div', { class: 'dash-grid' }, hero, stress, fit, drought, planner, pipeline));
  }

  function glass(v, unit, label) { return h('div', { class: 'glass' }, h('b', null, v, unit ? h('small', null, ' ' + unit) : null), h('span', null, label)); }
  function heroBtn(text, fn, primary) { const b = h('button', { type: 'button', class: 'btn ' + (primary ? 'lime' : 'ghost') }, text); b.addEventListener('click', fn); return b; }
  function greeting() { const hr = new Date().getHours(); return hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening'; }
  function r2Range() { const v = Object.values(D.crops).map((c) => c.r2); return Math.min(...v).toFixed(2) + '–' + Math.max(...v).toFixed(2); }

  /* ---------- About page numbers (static page, live values) ---------- */
  function fillAbout() {
    const set = (k, t) => document.querySelectorAll('[data-metric="' + k + '"]').forEach((n) => { n.textContent = t; });
    set('cells', String(D.cells.length)); set('states', String(D.risk.length)); set('r2', r2Range());
    const ul = document.getElementById('about-limits');
    if (ul) ul.replaceChildren(...[
      'Climate-only suitability: it captures about half of the differences in the FAO GAEZ ratings. Soil, terrain, flooding, pests, seed and prices are not included.',
      'GAEZ ratings are themselves a model’s estimate, not measured harvests.',
      'Map squares are about 55 km wide. State labels come from the nearest state capital, so they are approximate near borders.',
      'Rotation rules are draft guidance and have not been reviewed by an agronomist. Several come from a single site, and some from outside Nigeria.',
      'The rotation comparison does not forecast yields, prices or weather. Income and labor use only numbers the farmer enters.',
      'It is decision support, not a planting recommendation. Use it with local knowledge and your extension officer.',
    ].map((t) => h('li', null, t)));
  }

  A.onSelect(() => { if (A.getView() === 'home') render(); });
  A.onView((v) => { if (v === 'home') render(); });
  if (F) F.onChange(() => { if (A.getView() === 'home') render(); });
  fillAbout();
  render();
})();
