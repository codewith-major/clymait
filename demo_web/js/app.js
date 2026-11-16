/* Clymait – Nigeria crop climate check.
   Runs entirely from window.SITE_DATA (site_data.js). No network needed. */
(function () {
  'use strict';

  const D = window.SITE_DATA;
  if (!D) {
    document.getElementById('place-name').textContent = 'Data could not be loaded';
    return;
  }

  /* ---------- small helpers ---------- */
  const $ = (sel, root) => (root || document).querySelector(sel);
  const SVGNS = 'http://www.w3.org/2000/svg';

  function h(tag, props, ...kids) {
    const n = document.createElement(tag);
    if (props) {
      for (const [k, v] of Object.entries(props)) {
        if (v == null || v === false) continue;
        if (k === 'class') n.className = v;
        else if (k === 'text') n.textContent = v;
        else n.setAttribute(k, v === true ? '' : v);
      }
    }
    for (const kid of kids.flat()) {
      if (kid == null || kid === false) continue;
      n.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    }
    return n;
  }

  function svgEl(tag, props) {
    const n = document.createElementNS(SVGNS, tag);
    if (props) for (const [k, v] of Object.entries(props)) n.setAttribute(k, v);
    return n;
  }

  const nf0 = new Intl.NumberFormat('en', { maximumFractionDigits: 0 });
  const fmt0 = (n) => nf0.format(n);
  const fmt1 = (n) => (Math.round(n * 10) / 10).toFixed(1);
  const signed = (n) => (Math.abs(n) < 0.05 ? '0.0' : (n > 0 ? '+' : '−') + fmt1(Math.abs(n)));
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const pctLabel = (f) => {
    const p = Math.round((f - 1) * 100);
    return p === 0 ? 'Normal' : (p > 0 ? '+' : '−') + Math.abs(p) + '%';
  };

  /* ---------- data ---------- */
  const CROPS = ['rice', 'cassava', 'yam'];
  const LABEL = { rice: 'Rice', cassava: 'Cassava', yam: 'Yam' };
  const INPUT_LABEL = {
    mean_chirps_annual_rain_mm: 'yearly rainfall',
    mean_chirps_dry_months: 'number of dry months',
    mean_season_mean_temp_c: 'growing-season temperature',
  };
  const FACTORS = D.rain_factors;
  const BASE = FACTORS.indexOf(1);
  const LAST = FACTORS.length - 1;

  const cellById = new Map(D.cells.map((c) => [c.id, c]));
  const riskBy = new Map(D.risk.map((r) => [r.state, r]));
  const stateNames = Object.keys(D.state_summary).sort((a, b) => a.localeCompare(b));

  function quantile(arr, q) {
    const a = [...arr].sort((x, y) => x - y);
    const p = (a.length - 1) * q;
    const lo = Math.floor(p), hi = Math.ceil(p);
    return a[lo] + (a[hi] - a[lo]) * (p - lo);
  }
  // "Stands out" thresholds for the plain-language risk reasons: top (or bottom) quarter of states.
  const Q = {
    dry: quantile(D.risk.map((r) => r.avg_longest_dry_spell_days), 0.75),
    heat: quantile(D.risk.map((r) => r.avg_heat_days), 0.75),
    variab: quantile(D.risk.map((r) => r.rain_variability_pct), 0.75),
    rainLow: quantile(D.risk.map((r) => r.normal_season_rain_mm), 0.25),
    drought: quantile(D.risk.map((r) => r.drought_years_pct_1981_2024), 0.75),
  };
  const stressRank = (r) => 1 + D.risk.filter((x) => x.climate_stress_index > r.climate_stress_index).length;

  /* ---------- colours ---------- */
  const GREEN = ['#eef5ea', '#a9d89a', '#3fae4a', '#0b6b1c'];
  const PURPLE = ['#f5ecf8', '#d9a6e6', '#a43bc0', '#52095f'];
  const hexRgb = (hx) => [1, 3, 5].map((i) => parseInt(hx.slice(i, i + 2), 16));
  function ramp(stops, t) {
    t = clamp(t, 0, 1);
    const n = stops.length - 1;
    const i = Math.min(n - 1, Math.floor(t * n));
    const f = t * n - i;
    const a = hexRgb(stops[i]), b = hexRgb(stops[i + 1]);
    return 'rgb(' + [0, 1, 2].map((k) => Math.round(a[k] + (b[k] - a[k]) * f)).join(',') + ')';
  }

  /* ---------- app state ---------- */
  const app = { cellId: null, layer: 'rice', rainIdx: BASE };
  const selectListeners = [];
  const viewListeners = [];

  /* ---------- map ---------- */
  const S = 40, CELL = 20, W = 480, H = 360;
  const map = $('#map');
  map.setAttribute('viewBox', '0 0 ' + W + ' ' + H);

  const cellRects = new Map();
  const gCells = svgEl('g');
  for (const c of D.cells) {
    const r = svgEl('rect', {
      class: 'cell', 'data-id': c.id,
      x: (c.lon - 2.75) * S, y: (13.25 - c.lat) * S, width: CELL, height: CELL,
    });
    r.appendChild(svgEl('title'));
    gCells.appendChild(r);
    cellRects.set(c.id, r);
  }
  map.appendChild(gCells);

  // A few well-known cities so people can find their way around (approximate positions).
  const CITIES = [
    ['Sokoto', 13.06, 5.24, 8, 4, 'start'],
    ['Kano', 12.0, 8.52, 8, -2, 'start'],
    ['Maiduguri', 11.85, 13.16, -8, -2, 'end'],
    ['Kaduna', 10.52, 7.44, -8, -2, 'end'],
    ['Abuja', 9.06, 7.49, 8, 12, 'start'],
    ['Lagos', 6.45, 3.4, 8, 12, 'start'],
    ['Enugu', 6.44, 7.5, 8, 12, 'start'],
    ['Port Harcourt', 4.78, 7.01, 8, -6, 'start'],
  ];
  const gCities = svgEl('g', { 'aria-hidden': 'true' });
  for (const [name, lat, lon, dx, dy, anchor] of CITIES) {
    const x = (lon - 2.5) * S, y = (13.5 - lat) * S;
    gCities.appendChild(svgEl('circle', { cx: x, cy: y, r: 3, fill: '#1a2318', stroke: '#fff', 'stroke-width': 1.5 }));
    const t = svgEl('text', { x: x + dx, y: y + dy, 'text-anchor': anchor });
    t.textContent = name;
    gCities.appendChild(t);
  }
  map.appendChild(gCities);

  const selHalo = svgEl('rect', { width: CELL, height: CELL, fill: 'none', stroke: '#fff', 'stroke-width': 5, 'pointer-events': 'none' });
  const selRing = svgEl('rect', { width: CELL, height: CELL, fill: 'none', stroke: '#1a2318', 'stroke-width': 2.5, 'pointer-events': 'none' });
  selHalo.style.display = selRing.style.display = 'none';
  map.appendChild(selHalo);
  map.appendChild(selRing);

  function layerValue(c, layer) {
    return layer === 'stress' ? riskBy.get(c.state).climate_stress_index : c.est[layer];
  }

  function paintMap() {
    const stress = app.layer === 'stress';
    for (const c of D.cells) {
      const v = layerValue(c, app.layer);
      const r = cellRects.get(c.id);
      r.setAttribute('fill', stress ? ramp(PURPLE, v / 100) : ramp(GREEN, v / 50));
      r.firstChild.textContent = c.state + ' – ' + (stress
        ? 'climate stress ' + fmt0(v) + ' / 100'
        : LABEL[app.layer] + ' estimate ' + fmt1(v));
    }
    const stops = stress ? PURPLE : GREEN;
    const grad = [0, 0.33, 0.66, 1].map((t) => ramp(stops, t)).join(',');
    $('#legend-bar').style.background = 'linear-gradient(90deg,' + grad + ')';
    $('#legend-title').textContent = stress
      ? 'Climate stress, state ranking (0–100, higher = more stress)'
      : LABEL[app.layer] + ' suitability estimate (points)';
    $('#legend-min').textContent = '0';
    $('#legend-mid').textContent = stress ? '50' : '25';
    $('#legend-max').textContent = stress ? '100' : '50 or more';
    document.querySelectorAll('#layer-seg button').forEach((b) => {
      b.setAttribute('aria-pressed', String(b.dataset.layer === app.layer));
    });
  }

  function moveOutline(c) {
    const x = (c.lon - 2.75) * S, y = (13.25 - c.lat) * S;
    for (const n of [selHalo, selRing]) {
      n.setAttribute('x', x); n.setAttribute('y', y);
      n.style.display = '';
    }
  }

  /* ---------- controls ---------- */
  const layerSeg = $('#layer-seg');
  for (const [key, label] of [['rice', 'Rice'], ['cassava', 'Cassava'], ['yam', 'Yam'], ['stress', 'Climate stress']]) {
    const b = h('button', { type: 'button', 'data-layer': key, class: key === 'stress' ? 'stress' : '', 'aria-pressed': 'false' }, label);
    b.addEventListener('click', () => { app.layer = key; paintMap(); syncHash(); });
    layerSeg.appendChild(b);
  }

  const stateSelect = $('#state-select');
  stateSelect.appendChild(h('option', { value: '' }, 'Choose a state…'));
  for (const s of stateNames) stateSelect.appendChild(h('option', { value: s }, s));
  // The square closest to the middle of a state's squares: a sensible default location for that state.
  function centroidCell(stateName) {
    const mine = D.cells.filter((c) => c.state === stateName);
    if (!mine.length) return null;
    const mLat = mine.reduce((a, c) => a + c.lat, 0) / mine.length;
    const mLon = mine.reduce((a, c) => a + c.lon, 0) / mine.length;
    mine.sort((a, b) => dist2(a.lat, a.lon, mLat, mLon) - dist2(b.lat, b.lon, mLat, mLon));
    return mine[0];
  }
  stateSelect.addEventListener('change', () => {
    if (!stateSelect.value) return;
    const c = centroidCell(stateSelect.value);
    if (c) select(c.id);
  });
  const dist2 = (la, lo, lb, lp) => (la - lb) * (la - lb) + (lo - lp) * (lo - lp);

  // Nearest map square to a point, or null if the point is outside the area we cover.
  function nearestCell(lat, lon, maxDeg) {
    let best = null, bestD = Infinity;
    for (const c of D.cells) {
      const d = dist2(c.lat, c.lon, lat, lon);
      if (d < bestD) { bestD = d; best = c; }
    }
    return best && Math.sqrt(bestD) <= (maxDeg || 0.45) ? best : null;
  }

  map.addEventListener('click', (e) => {
    const r = e.target.closest && e.target.closest('rect.cell');
    if (r) select(r.getAttribute('data-id'));
  });
  map.addEventListener('keydown', (e) => {
    const dirs = { ArrowUp: [0.5, 0], ArrowDown: [-0.5, 0], ArrowLeft: [0, -0.5], ArrowRight: [0, 0.5] };
    const d = dirs[e.key];
    const cur = cellById.get(app.cellId);
    if (!d || !cur) return;
    e.preventDefault();
    for (let step = 1; step <= 4; step++) {
      const id = (cur.lat + d[0] * step) + '_' + (cur.lon + d[1] * step);
      if (cellById.has(id)) { select(id); return; }
    }
  });

  $('#locate').addEventListener('click', () => {
    const msg = $('#locate-msg');
    if (!navigator.geolocation) { msg.textContent = 'This device cannot share its location. Please pick a state instead.'; return; }
    msg.textContent = 'Finding your location…';
    navigator.geolocation.getCurrentPosition((pos) => {
      let best = null, bestD = Infinity;
      for (const c of D.cells) {
        const d = dist2(c.lat, c.lon, pos.coords.latitude, pos.coords.longitude);
        if (d < bestD) { bestD = d; best = c; }
      }
      if (best && Math.sqrt(bestD) <= 0.45) {
        msg.textContent = 'Using the map square closest to you. Your location stays on this device.';
        select(best.id);
      } else {
        msg.textContent = 'Your location is outside the area this tool covers. Please pick a state instead.';
      }
    }, () => {
      msg.textContent = 'Location was not shared. Please pick a state instead.';
    }, { timeout: 10000, maximumAge: 600000 });
  });

  /* rain slider */
  const rain = $('#rain');
  rain.max = String(LAST);
  rain.value = String(BASE);
  const ticks = $('#rain-ticks');
  FACTORS.forEach((f) => ticks.appendChild(h('span', null, pctLabel(f))));
  rain.addEventListener('input', () => {
    app.rainIdx = Number(rain.value);
    renderTiles();
    renderCrops();
    renderExplainSens();
    syncHash();
  });

  /* ---------- selection ---------- */
  function select(id) {
    const c = cellById.get(id);
    if (!c) return;
    app.cellId = id;
    moveOutline(c);
    stateSelect.value = c.state;
    $('#place-name').textContent = c.state;
    $('#place-sub').textContent = 'Map square centred on ' + c.lat.toFixed(2) + '° N, ' + c.lon.toFixed(2) + '° E.';
    renderTiles();
    renderCrops();
    renderRisk();
    renderExplain();
    syncHash();
    selectListeners.forEach((f) => f(id));
  }

  /* ---------- results ---------- */
  function renderTiles() {
    const c = cellById.get(app.cellId);
    const f = FACTORS[app.rainIdx];
    const rainNow = c.climate.annual_rain_mm * f;
    const rainTile = app.rainIdx === BASE
      ? h('div', { class: 'v' }, fmt0(rainNow), ' ', h('small', null, 'mm'))
      : h('div', { class: 'v' }, fmt0(rainNow), ' ', h('small', null, 'mm (was ' + fmt0(c.climate.annual_rain_mm) + ')'));
    $('#tiles').replaceChildren(
      h('div', { class: 'tile' }, rainTile, h('div', { class: 'k' }, app.rainIdx === BASE ? 'Rain in a year' : 'Rain in a year, ' + pctLabel(f))),
      h('div', { class: 'tile' }, h('div', { class: 'v' }, fmt1(c.climate.dry_months)), h('div', { class: 'k' }, 'Dry months (under 50 mm of rain)')),
      h('div', { class: 'tile' }, h('div', { class: 'v' }, fmt1(c.climate.season_temp_c), ' ', h('small', null, '°C')), h('div', { class: 'k' }, 'Average temperature in the growing season'))
    );
  }

  // Values for the three crops at the chosen rainfall. The cross-validated estimate is the
  // starting point; the what-if only adds the change the final model predicts for that rainfall.
  function cropValues(c) { return cropValuesAt(c, app.rainIdx); }
  function cropValuesAt(c, rainIdx) {
    return CROPS.map((k) => {
      const sc = c.scenario[k];
      const base = c.est[k];
      const val = clamp(base + (sc[rainIdx] - sc[BASE]), 0, 100);
      return { key: k, label: LABEL[k], val, base, delta: val - base, gaez: c.gaez[k], err: D.crops[k].error_p80 };
    }).sort((a, b) => b.val - a.val);
  }

  function renderCrops() {
    const c = cellById.get(app.cellId);
    const f = FACTORS[app.rainIdx];
    const vals = cropValues(c);

    $('#rain-readout').textContent = app.rainIdx === BASE
      ? 'Normal rainfall (about ' + fmt0(c.climate.annual_rain_mm) + ' mm a year)'
      : (f < 1 ? Math.round((1 - f) * 100) + '% less rain' : Math.round((f - 1) * 100) + '% more rain') +
        ' (about ' + fmt0(c.climate.annual_rain_mm * f) + ' mm a year)';
    rain.setAttribute('aria-valuetext', pctLabel(f) + ' rainfall');

    $('#crop-list').replaceChildren(...vals.map((v, i) => {
      const lo = clamp(v.val - v.err, 0, 100), hi = clamp(v.val + v.err, 0, 100);
      let delta = null;
      if (app.rainIdx !== BASE) {
        const up = v.delta > 0.05, down = v.delta < -0.05;
        delta = h('span', { class: 'delta ' + (up ? 'up' : down ? 'down' : '') },
          (up ? '▲ ' : down ? '▼ ' : '● ') + signed(v.delta) + ' vs normal rain');
      }
      return h('li', { class: 'crop-row' },
        h('div', { class: 'crop-top' },
          h('span', { class: 'rank', 'aria-label': 'Rank ' + (i + 1) }, String(i + 1)),
          h('span', { class: 'crop-name' }, v.label),
          h('span', { class: 'crop-score' }, h('b', null, fmt1(v.val)), ' / 100', delta)
        ),
        h('div', { class: 'bar', role: 'img', 'aria-label': v.label + ' estimate ' + fmt1(v.val) + ' out of 100, usually within plus or minus ' + fmt0(v.err) + ' points' },
          h('span', { class: 'band', style: 'left:' + lo + '%;width:' + (hi - lo) + '%' }),
          h('span', { class: 'fill', style: 'width:' + v.val + '%' })
        ),
        h('div', { class: 'crop-meta' },
          'Usually within ± ' + fmt0(v.err) + ' points · GAEZ rating for today’s climate: ' + fmt1(v.gaez))
      );
    }));

    // Plain-language verdict. Estimates are rough, so close scores are called "similar".
    const [a, b] = vals;
    const gap = a.val - b.val;
    let text;
    if (a.val < 10) {
      text = 'All three crops score low for the climate here' + (app.rainIdx === BASE ? '.' : ' at this rainfall.');
    } else if (gap < Math.min(a.err, b.err)) {
      text = a.label + ' and ' + b.label + ' score about the same here. The estimates are too rough to separate them.';
    } else {
      text = a.label + ' scores highest here, ' + fmt0(gap) + ' points ahead of ' + b.label + '.';
    }
    $('#verdict').textContent = text;
  }

  function riskReasons(r) {
    const out = [];
    if (r.avg_longest_dry_spell_days >= Math.max(Q.dry, 10)) out.push('Long dry spells in the rainy season: about ' + fmt0(r.avg_longest_dry_spell_days) + ' days without rain in a typical year.');
    if (r.avg_heat_days >= Math.max(Q.heat, 10)) out.push('Many very hot days: about ' + fmt0(r.avg_heat_days) + ' days at 35 °C or more each season.');
    if (r.rain_variability_pct >= Math.max(Q.variab, 12)) out.push('Rainfall changes a lot from year to year (about ' + fmt0(r.rain_variability_pct) + '%).');
    if (r.normal_season_rain_mm <= Math.min(Q.rainLow, 1100)) out.push('Low rainfall overall: about ' + fmt0(r.normal_season_rain_mm) + ' mm in a normal rainy season.');
    if (r.drought_years_pct_1981_2024 >= Math.max(Q.drought, 20)) out.push('Drought in about ' + fmt0(r.drought_years_pct_1981_2024) + '% of years since 1981.');
    if (!out.length) out.push('No single factor stands out as unusually severe compared with other states.');
    return out;
  }

  function renderRisk() {
    const c = cellById.get(app.cellId);
    const r = riskBy.get(c.state);
    const levelText = { higher: 'Higher risk', medium: 'Medium risk', lower: 'Lower risk' }[r.risk_level];
    const card = $('#risk-card');
    card.replaceChildren(
      h('h3', { id: 'risk-h' }, 'How risky is the climate here?'),
      h('div', { class: 'risk-head' },
        h('span', { class: 'badge ' + r.risk_level }, levelText),
        h('span', { class: 'rank-note' }, 'Ranks ' + stressRank(r) + ' of ' + D.risk.length + ' states for climate stress (1 = most)')
      ),
      h('div', { class: 'meter', role: 'img', 'aria-label': 'Climate stress index ' + fmt0(r.climate_stress_index) + ' out of 100' },
        h('span', { style: 'width:' + r.climate_stress_index + '%' })),
      h('div', { class: 'meter-label' }, h('span', null, 'Lower stress'), h('span', null, 'Index ' + fmt0(r.climate_stress_index) + ' / 100'), h('span', null, 'Higher stress')),
      h('dl', { class: 'facts' },
        h('dt', null, 'Normal rainy-season rain'), h('dd', null, fmt0(r.normal_season_rain_mm) + ' mm'),
        h('dt', null, 'Rain varies year to year by'), h('dd', null, fmt0(r.rain_variability_pct) + '%'),
        h('dt', null, 'Typical longest dry spell'), h('dd', null, fmt0(r.avg_longest_dry_spell_days) + ' days'),
        h('dt', null, 'Days at 35 °C or more (per season)'), h('dd', null, fmt0(r.avg_heat_days)),
        h('dt', null, 'Drought years, 1981–2024'), h('dd', null, fmt0(r.drought_years_pct_1981_2024) + '%'),
        h('dt', null, 'Drought years, recent period'), h('dd', null, fmt0(r.drought_years_pct_recent) + '%'),
        h('dt', null, 'Worst drought year'), h('dd', null, r.worst_drought_year + '')
      ),
      h('h4', null, 'What stands out'),
      h('ul', { class: 'reasons' }, riskReasons(r).map((t) => h('li', null, t))),
      ...(r.drought_years_pct_recent >= 35
        ? [h('p', { class: 'caution' }, 'Note: the recent drought figure for ' + c.state + ' is much higher than for the rest of its region. We have not been able to confirm it, so treat it with caution.')]
        : []),
      h('p', { class: 'hint' }, 'Measured from past rainfall, temperature and the SPEI drought index for the whole state, not this exact square. This is history, not a forecast.')
    );
  }

  function renderExplain() {
    const c = cellById.get(app.cellId);
    const how = CROPS.map((k) => {
      const m = D.crops[k];
      const inputs = m.inputs.map((i) => INPUT_LABEL[i] || i);
      const kind = /random forest/.test(m.model) ? 'a random-forest model using ' : 'a simple rainfall curve using ';
      return h('li', null, h('strong', null, LABEL[k] + ': '), kind + inputs.join(', ') + '.');
    });
    $('#explain-card').replaceChildren(
      h('h3', { id: 'explain-h' }, 'Why these numbers?'),
      h('p', { class: 'hint' }, 'Each crop’s estimate comes only from climate. Here is what each one looks at:'),
      h('ul', { class: 'how-list' }, how),
      h('h4', null, 'How rainfall changes the estimate in this square'),
      h('div', { id: 'sens-holder' }),
      h('p', { class: 'hint', id: 'sens-note' })
    );
    renderExplainSens();
  }

  function renderExplainSens() {
    const holder = $('#sens-holder');
    if (!holder) return;
    const c = cellById.get(app.cellId);
    const lowL = pctLabel(FACTORS[0]), highL = pctLabel(FACTORS[LAST]);
    const rows = CROPS.map((k) => {
      const sc = c.scenario[k];
      const dl = sc[0] - sc[BASE], dh = sc[LAST] - sc[BASE];
      const cell = (d) => (Math.abs(d) < 0.05 ? '● 0.0' : (d > 0 ? '▲ ' : '▼ ') + signed(d));
      return h('tr', null, h('td', null, LABEL[k]), h('td', null, cell(dl)), h('td', null, cell(dh)));
    });
    holder.replaceChildren(h('table', { class: 'sens' },
      h('thead', null, h('tr', null, h('th', null, 'Crop'), h('th', null, lowL + ' rain'), h('th', null, highL + ' rain'))),
      h('tbody', null, rows)));
    const notes = [];
    if (CROPS.some((k) => c.scenario[k][LAST] - c.scenario[k][BASE] < -0.05)) {
      notes.push('More rain can lower an estimate: in the GAEZ ratings, very wet places score lower for these crops.');
    }
    if (CROPS.some((k) => /random forest/.test(D.crops[k].model))) {
      notes.push('Yam uses a more flexible model, so its steps can be uneven.');
    }
    notes.push('Changes are in suitability points.');
    $('#sens-note').textContent = notes.join(' ');
  }

  /* ---------- static text ---------- */
  function renderStatic() {
    const r2s = CROPS.map((k) => D.crops[k].r2);
    const lo = Math.min(...r2s).toFixed(2), hi = Math.max(...r2s).toFixed(2);
    const limits = [
      'This is a climate-only estimate. It captures about half of the differences in the FAO GAEZ crop ratings (R² ' + lo + '–' + hi + '). Soil, terrain, flooding, pests, seed and prices are not included.',
      'GAEZ ratings are themselves a model’s estimate of suitability, not measured harvests.',
      'It does not forecast drought. We tested a drought-year predictor and it was no better than chance, so the risk shown is what was measured in the past.',
      'Each map square is about 55 km wide, and fields inside a square can differ a lot. State names near borders are approximate.',
      'The rainfall slider changes rainfall only. It is not a climate-change projection.',
      'Use it alongside local knowledge and advice from your extension officer. It is not a planting recommendation.',
      'Field profiles (My fields) are saved only on this device. Crop history, drainage, soil texture and pH feed the next-crop options there (draft guidance, not yet reviewed by an agronomist); they do not change the estimates above.',
    ];
    $('#limit-list').replaceChildren(...limits.map((t) => h('li', null, t)));

    const table = $('#model-table');
    table.replaceChildren(
      h('thead', null, h('tr', null, ['Crop', 'Model', 'Inputs', 'R²', 'Average error', 'Within ± (4 in 5)'].map((t) => h('th', null, t)))),
      h('tbody', null, CROPS.map((k) => {
        const m = D.crops[k];
        return h('tr', null,
          h('td', null, LABEL[k]), h('td', null, m.model),
          h('td', null, m.inputs.map((i) => INPUT_LABEL[i] || i).join(', ')),
          h('td', null, m.r2.toFixed(2)), h('td', null, fmt1(m.mae) + ' pts'), h('td', null, fmt1(m.error_p80) + ' pts'));
      })));

    $('#tech-notes').replaceChildren(...D.notes.map((t) => h('li', null, t)));

    const d = new Date(D.created + 'T00:00:00');
    $('#data-date').textContent = 'Prototype. Data built ' + (isNaN(d) ? D.created : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })) +
      '. Sources: CHIRPS v3.0, NASA POWER, SPEIbase, FAO GAEZ v5.';
  }

  /* ---------- shareable link ---------- */
  function syncHash() {
    try {
      const p = new URLSearchParams({ c: app.cellId, l: app.layer, r: String(app.rainIdx) });
      history.replaceState(null, '', '#' + p.toString());
    } catch (e) { /* file:// or restricted contexts: ignore */ }
  }
  function readHash() {
    try {
      const p = new URLSearchParams(location.hash.slice(1));
      const l = p.get('l');
      if (l && (l === 'stress' || CROPS.includes(l))) app.layer = l;
      const r = Number(p.get('r'));
      if (Number.isInteger(r) && r >= 0 && r <= LAST && p.has('r')) app.rainIdx = r;
      const c = p.get('c');
      if (c && cellById.has(c)) return c;
    } catch (e) { /* ignore */ }
    return null;
  }

  /* ---------- views: Explore / My fields ---------- */
  const views = { home: $('#view-home'), explore: $('#view-explore'), fields: $('#view-fields'), planner: $('#view-planner'), about: $('#view-about') };
  let currentView = 'home';
  function setView(name) {
    currentView = name;
    for (const [k, node] of Object.entries(views)) node.hidden = k !== name;
    document.querySelectorAll('.tabs button').forEach((b) => {
      if (b.dataset.view === name) b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
    });
    window.scrollTo(0, 0);
    viewListeners.forEach((f) => f(name));
  }
  document.querySelectorAll('.tabs button').forEach((b) => {
    b.addEventListener('click', () => setView(b.dataset.view));
  });

  // Climate summary for one square at normal rainfall (used on a field's page).
  function snapshot(cellId) {
    const c = cellById.get(cellId);
    if (!c) return null;
    const r = riskBy.get(c.state);
    return {
      cell: c,
      state: c.state,
      climate: c.climate,
      crops: cropValuesAt(c, BASE),
      risk: {
        level: r.risk_level,
        index: r.climate_stress_index,
        rank: stressRank(r),
        total: D.risk.length,
        recentCaution: r.drought_years_pct_recent >= 35,
      },
    };
  }

  // Small, deliberate surface for fields.js.
  window.ClymaitApp = {
    data: D, h, fmt0, fmt1, signed, cellById, stateNames,
    select, setView, nearestCell, centroidCell, snapshot,
    getSelected: () => app.cellId,
    getView: () => currentView,
    onSelect: (f) => selectListeners.push(f),
    onView: (f) => viewListeners.push(f),
  };

  /* ---------- start ---------- */
  renderStatic();
  const sharedLink = /(^|[#&])c=/.test(location.hash);   // must be read before select() rewrites the hash
  const startId = readHash() || '10.25_7.25';   // Kaduna area: a mid-belt example
  rain.value = String(app.rainIdx);
  paintMap();
  select(startId);

  // A shared map link opens the map; otherwise start on the dashboard.
  setView(sharedLink ? 'explore' : 'home');

  $('#jump-link').addEventListener('click', (e) => {
    e.preventDefault();
    const r = $('#results');
    r.scrollIntoView({ block: 'start' });
    r.focus({ preventScroll: true });
  });

  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    navigator.serviceWorker.register('sw.js').then(() => navigator.serviceWorker.ready).then(() => {
      $('#offline-status').textContent = 'Saved on this device: it will keep working without internet.';
    }).catch(() => { /* offline support is optional */ });
  }
})();
