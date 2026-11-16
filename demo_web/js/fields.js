/* Clymait – My fields: farmer field profiles.
   Everything is saved in this browser only (localStorage). Nothing is sent anywhere. */
(function () {
  'use strict';

  const A = window.ClymaitApp;
  if (!A) return;
  const { h, fmt0, fmt1 } = A;
  const $ = (sel, root) => (root || document).querySelector(sel);
  const root = $('#fields-root');

  /* ---------- choices ---------- */
  const CROPS = [
    ['rice', 'Rice'], ['cassava', 'Cassava'], ['yam', 'Yam'], ['maize', 'Maize'],
    ['cowpea', 'Cowpea or beans'], ['sorghum', 'Sorghum'], ['millet', 'Millet'],
    ['groundnut', 'Groundnut'], ['cocoyam', 'Cocoyam'], ['plantain', 'Plantain or banana'],
    ['vegetables', 'Vegetables'], ['fallow', 'Fallow (left to rest)'], ['other', 'Other crop'],
  ];
  const TEXTURE = [
    ['sand', 'Sand'], ['loamy_sand', 'Loamy sand'], ['sandy_loam', 'Sandy loam'], ['loam', 'Loam'],
    ['silt_loam', 'Silt loam'], ['clay_loam', 'Clay loam'], ['clay', 'Clay'], ['unknown', 'Not sure'],
  ];
  const SOM = [
    ['low', 'Low (pale soil, thin dark topsoil)'], ['medium', 'Medium'],
    ['high', 'High (dark, crumbly soil, many earthworms)'], ['unknown', 'Not sure'],
  ];
  const DRAINAGE = [
    ['well', 'Well drained – water soaks away quickly'], ['moderate', 'Moderately drained'],
    ['poor', 'Poorly drained – water stands after heavy rain'], ['floods', 'Floods in the rainy season'],
    ['unknown', 'Not sure'],
  ];
  const SLOPE = [
    ['flat', 'Flat (under 2%)'], ['gentle', 'Gentle (2–8%)'], ['moderate', 'Moderate (8–15%)'],
    ['steep', 'Steep (over 15%)'], ['unknown', 'Not sure'],
  ];
  const IRRIG = [
    ['none', 'None – rain only'], ['hand', 'Hand watering (well, stream or tank)'],
    ['pump_surface', 'Pump from a river, stream or pond'], ['borehole', 'Borehole or well with a pump'],
    ['scheme', 'Irrigation scheme or canal'], ['other', 'Other'],
  ];
  const FERT = [
    ['none', 'None'], ['manure', 'Manure or compost'], ['npk', 'NPK'], ['urea', 'Urea'], ['other', 'Other'],
  ];
  const PESTS = [
    ['none', 'None noticed'], ['insects', 'Insects (borers, armyworm, termites)'], ['animals', 'Birds or rodents'],
    ['weeds', 'Heavy weeds (for example Striga)'], ['fungal', 'Fungal disease (blight, blast, anthracnose)'],
    ['virus', 'Virus disease (for example cassava mosaic)'], ['rot', 'Rot in the soil or in storage'], ['other', 'Other'],
  ];
  const MARKET = [
    ['home', 'Eat at home'], ['local', 'Sell in the local market'], ['buyer', 'Sell to a buyer or processor'],
    ['store', 'Store and sell later when prices rise'], ['unknown', 'Not sure yet'],
  ];
  const YIELD_UNITS = [
    ['kg_ha', 'kg per hectare'], ['t_ha', 'tonnes per hectare'], ['kg', 'kg harvested in total'], ['t', 'tonnes harvested in total'],
  ];
  const SOURCES = [['state'], ['gps'], ['manual'], ['map']];
  const MODELLED = ['rice', 'cassava', 'yam'];

  const label = (list, v) => { const m = list.find((x) => x[0] === v); return m ? m[1] : ''; };
  const short = (s) => s.split(/ [–(]/)[0];
  const labels = (list, vs) => vs.map((v) => short(label(list, v))).filter(Boolean).join(', ');

  /* ---------- small utilities ---------- */
  const DAY = 86400000;
  const uid = () => 'f' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const num = (x) => { if (x === '' || x == null) return null; const n = Number(x); return Number.isFinite(n) ? n : null; };
  const str = (x, max) => (typeof x === 'string' ? x.trim().slice(0, max || 200) : '');
  const pick = (x, list) => (list.some((o) => o[0] === x) ? x : '');
  const picks = (xs, list) => (Array.isArray(xs) ? xs.filter((x) => list.some((o) => o[0] === x)) : []);
  const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s + 'T00:00:00Z'));
  const toTime = (s) => Date.parse(s + 'T00:00:00Z');
  const fmtDate = (s) => new Date(toTime(s)).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  const todayStr = () => {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  };
  const nowIso = () => new Date().toISOString();
  const toHa = (size) => (size.value == null ? null : size.unit === 'acres' ? size.value * 0.404686 : size.value);
  const fmtT = (t) => (t < 1 ? (Math.round(t * 100) / 100).toString() : fmt1(t));
  const cropName = (s) => (s.crop === 'other' ? (s.cropOther || 'Other crop') : (label(CROPS, s.crop) ? short(label(CROPS, s.crop)) : 'Crop not named'));
  const cropKey = (s) => (s.crop === 'other' ? 'other:' + s.cropOther.toLowerCase() : s.crop);
  const where = (f) => (f.loc.cellId ? A.cellById.get(f.loc.cellId).state : '');

  /* ---------- data model ---------- */
  function blankSeason(current) {
    return {
      id: uid(), crop: '', cropOther: '', current: !!current, planted: '', harvested: '',
      yieldAmount: null, yieldUnit: 't_ha', fert: [], fertNote: '', pests: [], pestNote: '',
    };
  }

  function normSeason(o) {
    o = o || {};
    const y = num(o.yieldAmount);
    return {
      id: str(o.id, 40) || uid(),
      crop: pick(o.crop, CROPS), cropOther: str(o.cropOther, 60),
      current: !!o.current,
      planted: isDate(o.planted) ? o.planted : '',
      harvested: isDate(o.harvested) ? o.harvested : '',
      yieldAmount: y != null && y >= 0 ? y : null,
      yieldUnit: pick(o.yieldUnit, YIELD_UNITS) || 't_ha',
      fert: picks(o.fert, FERT), fertNote: str(o.fertNote, 120),
      pests: picks(o.pests, PESTS), pestNote: str(o.pestNote, 160),
    };
  }

  // Cleans anything that comes from storage, an import or the form, so the rest of the code can trust it.
  function normField(o) {
    if (!o || typeof o !== 'object') return null;
    const name = str(o.name, 80), farmer = str(o.farmer, 80);
    if (!name && !farmer) return null;
    const L = o.loc || {}, Z = o.size || {}, S = o.soil || {}, I = o.irrigation || {}, M = o.market || {};
    const lat = num(L.lat), lon = num(L.lon);
    const cell = lat != null && lon != null ? A.nearestCell(lat, lon) : null;
    const size = num(Z.value), ph = num(S.ph), som = num(S.somPct);
    const seasons = Array.isArray(o.seasons) ? o.seasons.slice(0, 60).map(normSeason) : [];
    let haveCurrent = false;
    for (const s of seasons) { if (s.current) { if (haveCurrent) s.current = false; haveCurrent = true; } }
    return {
      id: str(o.id, 40) || uid(), farmer, name, place: str(o.place, 120),
      loc: { lat, lon, cellId: cell ? cell.id : null, source: pick(L.source, SOURCES) },
      size: { value: size != null && size > 0 ? size : null, unit: Z.unit === 'acres' ? 'acres' : 'ha' },
      soil: {
        texture: pick(S.texture, TEXTURE),
        ph: ph != null && ph >= 3 && ph <= 10 ? ph : null,
        somLevel: pick(S.somLevel, SOM),
        somPct: som != null && som >= 0 && som <= 30 ? som : null,
      },
      drainage: pick(o.drainage, DRAINAGE), slope: pick(o.slope, SLOPE),
      irrigation: { type: pick(I.type, IRRIG), note: str(I.note, 120) },
      seasons,
      market: { uses: picks(M.uses, MARKET), note: str(M.note, 160) },
      example: !!o.example,
      created: str(o.created, 40) || nowIso(), updated: str(o.updated, 40) || nowIso(),
    };
  }

  /* ---------- storage ---------- */
  const KEY = 'clymait.fields.v1';
  const store = { fields: [] };
  let storageOK = true;

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const o = JSON.parse(raw);
        if (o && Array.isArray(o.fields)) store.fields = o.fields.map(normField).filter(Boolean);
      }
    } catch (e) { storageOK = false; }
  }
  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify({ version: 1, fields: store.fields }));
      storageOK = true;
    } catch (e) { storageOK = false; }
    updateCount();
    changeListeners.forEach((fn) => { try { fn(); } catch (e) { /* ignore */ } });
  }
  const changeListeners = [];
  const getField = (id) => store.fields.find((f) => f.id === id) || null;
  function updateCount() {
    $('#field-count').textContent = store.fields.length ? '(' + store.fields.length + ')' : '';
  }

  /* ---------- what is filled in ---------- */
  function completeness(f) {
    const cur = f.seasons.find((s) => s.current);
    const past = f.seasons.filter((s) => !s.current);
    const some = (fn) => f.seasons.some(fn);
    const known = (v) => !!v && v !== 'unknown';
    const items = [
      ['Farmer name or ID', !!f.farmer],
      ['Field name', !!f.name],
      ['Field location', !!f.loc.cellId],
      ['Field size', f.size.value != null],
      ['Soil texture', known(f.soil.texture)],
      ['Soil pH', f.soil.ph != null],
      ['Soil organic matter', f.soil.somPct != null || known(f.soil.somLevel)],
      ['Drainage', known(f.drainage)],
      ['Slope', known(f.slope)],
      ['Irrigation access', !!f.irrigation.type],
      ['Previous crops', past.some((s) => s.crop)],
      ['Current crop', !!cur && !!cur.crop],
      ['Planting and harvest dates', some((s) => s.planted || s.harvested)],
      ['Yield history', some((s) => s.yieldAmount != null)],
      ['Fertilizer use', some((s) => s.fert.length > 0)],
      ['Pest or disease history', some((s) => s.pests.length > 0)],
      ['Market preference', f.market.uses.some((u) => u !== 'unknown')],
    ];
    return { items, done: items.filter((i) => i[1]).length, total: items.length, missing: items.filter((i) => !i[1]).map((i) => i[0]) };
  }

  /* ---------- reading the crop history ---------- */
  function yieldTha(s, f) {
    if (s.yieldAmount == null) return null;
    if (s.yieldUnit === 't_ha') return s.yieldAmount;
    if (s.yieldUnit === 'kg_ha') return s.yieldAmount / 1000;
    const ha = toHa(f.size);
    if (!ha) return null;
    return (s.yieldUnit === 'kg' ? s.yieldAmount / 1000 : s.yieldAmount) / ha;
  }

  // Periods with no crop growing, worked out only from the farmer's own dates.
  function analyse(f) {
    const dated = f.seasons.filter((s) => s.crop && s.crop !== 'fallow' && s.planted)
      .sort((a, b) => toTime(a.planted) - toTime(b.planted));
    const gaps = [], repeats = [], overlaps = [];
    for (let i = 0; i < dated.length - 1; i++) {
      const a = dated[i], b = dated[i + 1];
      if (cropKey(a) === cropKey(b)) repeats.push([a, b]);
      if (a.harvested) {
        const d = Math.round((toTime(b.planted) - toTime(a.harvested)) / DAY);
        if (d > 0) gaps.push({ from: a.harvested, to: b.planted, days: d, after: a });
        else if (d < 0) overlaps.push([a, b]);
      }
    }
    let open = null;
    const last = dated[dated.length - 1];
    if (last && !last.current && last.harvested && !f.seasons.some((s) => s.current)) {
      const d = Math.round((toTime(todayStr()) - toTime(last.harvested)) / DAY);
      if (d > 0) open = { from: last.harvested, days: d, after: last };
    }
    return {
      gaps, repeats, overlaps, open,
      order: dated.map(cropName),
      gapDays: gaps.reduce((n, g) => n + g.days, 0),
    };
  }

  /* ---------- UI state ---------- */
  const ui = { mode: 'list', id: null, draft: null, errors: [], msg: '', picking: false, viewingFieldId: null, after: '', afterFor: null };

  /* ---------- drafts ---------- */
  function newDraft(extra) {
    return Object.assign({
      id: uid(), farmer: '', name: '', place: '',
      loc: { lat: null, lon: null, cellId: null, source: '' },
      size: { value: null, unit: 'ha' },
      soil: { texture: '', ph: null, somLevel: '', somPct: null },
      drainage: '', slope: '', irrigation: { type: '', note: '' },
      market: { uses: [], note: '' }, example: false, created: nowIso(), updated: nowIso(),
      current: blankSeason(true), past: [],
    }, extra || {});
  }
  function toDraft(f) {
    const d = JSON.parse(JSON.stringify(f));
    d.current = d.seasons.find((s) => s.current) || blankSeason(true);
    d.past = d.seasons.filter((s) => !s.current);
    delete d.seasons;
    return d;
  }
  const hasSeasonData = (s) => !!(s.crop || s.planted || s.harvested || s.yieldAmount != null || s.fert.length || s.pests.length || s.fertNote || s.pestNote);
  function fromDraft(d) {
    const past = d.past.filter(hasSeasonData).map((s) => Object.assign({}, s, { current: false }));
    const cur = d.current && d.current.crop ? [Object.assign({}, d.current, { current: true })] : [];
    return normField(Object.assign({}, d, { seasons: past.concat(cur) }));
  }

  function validate(d) {
    const e = [];
    if (!str(d.farmer, 80)) e.push('Enter the farmer name or an ID code.');
    if (!str(d.name, 80)) e.push('Enter a name for the field.');
    else if (store.fields.some((f) => f.id !== d.id && f.farmer.toLowerCase() === str(d.farmer, 80).toLowerCase() && f.name.toLowerCase() === str(d.name, 80).toLowerCase())) {
      e.push('This farmer already has a field with that name. Use a different name.');
    }
    if ((d.loc.lat == null) !== (d.loc.lon == null)) e.push('Enter both latitude and longitude, or leave both empty.');
    if (d.size.value != null && (d.size.value <= 0 || d.size.value > 10000)) e.push('Field size must be more than 0 and no more than 10,000.');
    if (d.soil.ph != null && (d.soil.ph < 3 || d.soil.ph > 10)) e.push('Soil pH must be between 3 and 10.');
    if (d.soil.somPct != null && (d.soil.somPct < 0 || d.soil.somPct > 30)) e.push('Organic matter must be between 0% and 30%.');
    const seasons = [['Current crop', d.current]].concat(d.past.map((s, i) => ['Past season ' + (i + 1), s]));
    for (const [title, s] of seasons) {
      if (title !== 'Current crop' && hasSeasonData(s) && !s.crop) e.push(title + ': choose the crop.');
      if (s.planted && s.harvested && toTime(s.harvested) < toTime(s.planted)) e.push(title + ': the harvest date is before the planting date.');
      if (s.yieldAmount != null && s.yieldAmount < 0) e.push(title + ': yield cannot be negative.');
    }
    return e;
  }

  /* ---------- tiny form builders ---------- */
  let idCount = 0;
  const nextId = () => 'fp' + (++idCount);

  function row(text, control, hint, required, forId) {
    let id = forId;
    if (!id) { id = nextId(); control.id = id; }
    return h('div', { class: 'frow' },
      h('label', { for: id }, text, required ? h('span', { class: 'req', 'aria-hidden': 'true' }, ' *') : null),
      control,
      hint ? h('p', { class: 'hint' }, hint) : null);
  }
  function tInput(o, k, attrs) {
    const i = h('input', Object.assign({ type: 'text', autocomplete: 'off' }, attrs || {}));
    i.value = o[k] == null ? '' : o[k];
    i.addEventListener('input', () => { o[k] = i.value; });
    return i;
  }
  function nInput(o, k, attrs) {
    const i = h('input', Object.assign({ type: 'number', inputmode: 'decimal', autocomplete: 'off' }, attrs || {}));
    i.value = o[k] == null ? '' : o[k];
    i.addEventListener('input', () => { o[k] = i.value === '' ? null : num(i.value); });
    return i;
  }
  function sInput(o, k, list, blank) {
    const s = h('select', null, h('option', { value: '' }, blank || 'Choose…'), list.map(([v, t]) => h('option', { value: v }, t)));
    s.value = o[k] || '';
    s.addEventListener('change', () => { o[k] = s.value; });
    return s;
  }
  function dInput(o, k) {
    const i = h('input', { type: 'date', min: '1990-01-01', max: '2100-12-31' });
    i.value = o[k] || '';
    i.addEventListener('input', () => { o[k] = i.value; });
    return i;
  }
  function checks(o, k, list, legendText, exclusive) {
    const wrap = h('fieldset', { class: 'checks' }, h('legend', null, legendText));
    const boxes = [];
    list.forEach(([v, t]) => {
      const cb = h('input', { type: 'checkbox', value: v });
      cb.checked = o[k].includes(v);
      cb.addEventListener('change', () => {
        let set = new Set(o[k]);
        if (cb.checked) {
          set.add(v);
          if (exclusive) { if (v === exclusive) set = new Set([v]); else set.delete(exclusive); }
        } else set.delete(v);
        o[k] = Array.from(set);
        boxes.forEach(([bv, b]) => { b.checked = set.has(bv); });
      });
      boxes.push([v, cb]);
      wrap.append(h('label', { class: 'check' }, cb, ' ', t));
    });
    return wrap;
  }
  const inline = (...els) => h('div', { class: 'inline' }, els);

  /* ---------- location choosing (state, GPS, typed, or map) ---------- */
  function startPicking() {
    ui.picking = true;
    A.setView('explore');
  }

  /* ---------- the edit form ---------- */
  function seasonFields(s, isCurrent) {
    const out = [];
    const otherRow = row('Name of the crop', tInput(s, 'cropOther', { maxlength: 60 }));
    otherRow.hidden = s.crop !== 'other';
    const cropSel = sInput(s, 'crop', CROPS, isCurrent ? 'No crop growing now' : 'Choose the crop…');
    const details = h('div', { class: 'season-details' });
    cropSel.addEventListener('change', () => {
      otherRow.hidden = s.crop !== 'other';
      if (isCurrent) details.hidden = !s.crop;
    });
    out.push(row(isCurrent ? 'Current crop' : 'Crop', cropSel, isCurrent ? 'Leave as “No crop growing now” if the field is empty.' : null));
    out.push(otherRow);
    details.append(
      inline(
        row('Planting date', dInput(s, 'planted'), 'An approximate date is fine.'),
        row(isCurrent ? 'Expected harvest date' : 'Harvest date', dInput(s, 'harvested'))
      )
    );
    if (!isCurrent) {
      const yIn = nInput(s, 'yieldAmount', { step: 'any', min: 0, placeholder: 'e.g. 8' });
      const yUnit = sInput(s, 'yieldUnit', YIELD_UNITS, 'Unit');
      yUnit.querySelector('option[value=""]').remove();
      yUnit.value = s.yieldUnit || 't_ha';
      const yId = nextId(); yIn.id = yId;
      details.append(h('div', { class: 'frow' }, h('label', { for: yId }, 'Yield'), inline(yIn, yUnit),
        h('p', { class: 'hint' }, 'Leave blank if you do not know. Totals are converted using the field size.')));
    }
    details.append(
      checks(s, 'fert', FERT, 'Fertilizer used', 'none'),
      row('Fertilizer details (amount, brand)', tInput(s, 'fertNote', { maxlength: 120 })),
      checks(s, 'pests', PESTS, 'Pests or disease seen', 'none'),
      row('Pest or disease details', tInput(s, 'pestNote', { maxlength: 160 }))
    );
    if (isCurrent) details.hidden = !s.crop;
    out.push(details);
    return out;
  }

  function renderEdit(opts) {
    opts = opts || {};
    const d = ui.draft;
    const y = window.scrollY;
    const isNew = !getField(d.id);

    /* location */
    const status = h('p', { class: 'loc-status', role: 'status' });
    let locMsg = '';
    const latI = nInput(d.loc, 'lat', { step: 'any', min: 3, max: 15, placeholder: 'e.g. 10.52' });
    const lonI = nInput(d.loc, 'lon', { step: 'any', min: 2, max: 15, placeholder: 'e.g. 7.44' });
    const stateSel = h('select', null, h('option', { value: '' }, 'Choose a state…'), A.stateNames.map((s) => h('option', { value: s }, s)));
    function showLoc() {
      const cell = d.loc.lat != null && d.loc.lon != null ? A.nearestCell(d.loc.lat, d.loc.lon) : null;
      d.loc.cellId = cell ? cell.id : null;
      if (cell) {
        stateSel.value = cell.state;
        status.textContent = 'Closest map square: ' + cell.state + ' (centre ' + cell.lat.toFixed(2) + '° N, ' + cell.lon.toFixed(2) + '° E). Climate results use this square, about 55 km across.';
      } else if (d.loc.lat != null && d.loc.lon != null) {
        status.textContent = 'These coordinates are outside the area this tool covers. You can still save the field, but climate results will not be available for it.';
      } else {
        status.textContent = locMsg || 'No location yet. Choose a state, use your location, type coordinates, or pick a square on the map.';
      }
    }
    function setLocation(lat, lon, source) {
      d.loc.lat = lat; d.loc.lon = lon; d.loc.source = source;
      latI.value = lat == null ? '' : lat;
      lonI.value = lon == null ? '' : lon;
      showLoc();
    }
    stateSel.addEventListener('change', () => {
      if (!stateSel.value) return;
      const c = A.centroidCell(stateSel.value);
      if (c) setLocation(c.lat, c.lon, 'state');
    });
    const typed = () => { d.loc.source = 'manual'; locMsg = ''; showLoc(); };
    latI.addEventListener('input', typed);
    lonI.addEventListener('input', typed);
    const gpsBtn = h('button', { type: 'button', class: 'btn' }, 'Use my location');
    gpsBtn.addEventListener('click', () => {
      if (!navigator.geolocation) { locMsg = 'This device cannot share its location.'; showLoc(); return; }
      status.textContent = 'Finding your location…';
      navigator.geolocation.getCurrentPosition((p) => {
        const r4 = (v) => Math.round(v * 1e4) / 1e4;
        locMsg = '';
        setLocation(r4(p.coords.latitude), r4(p.coords.longitude), 'gps');
      }, () => { locMsg = 'Location was not shared. Choose a state or pick on the map instead.'; showLoc(); },
      { timeout: 10000, maximumAge: 600000 });
    });
    const mapBtn = h('button', { type: 'button', class: 'btn' }, 'Pick on the map');
    mapBtn.addEventListener('click', startPicking);

    /* seasons */
    const pastWrap = h('div', { class: 'seasons' });
    d.past.forEach((s, i) => {
      const rm = h('button', { type: 'button', class: 'btn small danger' }, 'Remove');
      rm.addEventListener('click', () => { d.past.splice(i, 1); renderEdit(); window.scrollTo(0, window.scrollY); });
      pastWrap.append(h('div', { class: 'season-edit', 'data-season': String(i) },
        h('div', { class: 'season-edit-head' }, h('h4', null, 'Past season ' + (i + 1)), rm),
        seasonFields(s, false)));
    });
    const addPast = h('button', { type: 'button', class: 'btn' }, d.past.length ? 'Add another past season' : 'Add a past season');
    addPast.addEventListener('click', () => {
      d.past.push(blankSeason(false));
      renderEdit({ focusSeason: d.past.length - 1 });
    });

    /* size */
    const sizeIn = nInput(d.size, 'value', { step: 'any', min: 0, placeholder: 'e.g. 1.5' });
    const sizeUnit = sInput(d.size, 'unit', [['ha', 'hectares'], ['acres', 'acres']], 'Unit');
    sizeUnit.querySelector('option[value=""]').remove();
    sizeUnit.value = d.size.unit;
    const sizeId = nextId(); sizeIn.id = sizeId;

    const phI = nInput(d.soil, 'ph', { step: '0.1', min: 3, max: 10, placeholder: 'e.g. 5.8' });
    const somPctI = nInput(d.soil, 'somPct', { step: '0.1', min: 0, max: 30, placeholder: 'e.g. 1.8' });
    const somPctId = nextId(); somPctI.id = somPctId;
    const somSel = sInput(d.soil, 'somLevel', SOM, 'Not recorded');

    const errBox = ui.errors.length
      ? h('div', { class: 'errors', role: 'alert', tabindex: '-1', id: 'form-errors' },
        h('strong', null, 'Please fix these before saving:'), h('ul', null, ui.errors.map((m) => h('li', null, m))))
      : null;

    const saveBtn = h('button', { type: 'button', class: 'btn primary' }, 'Save field');
    const cancelBtn = h('button', { type: 'button', class: 'btn' }, 'Cancel');
    saveBtn.addEventListener('click', onSave);
    cancelBtn.addEventListener('click', () => {
      ui.draft = null; ui.errors = [];
      ui.mode = getField(d.id) ? 'detail' : 'list'; ui.id = d.id;
      render(true);
    });

    root.replaceChildren(
      h('form', { class: 'panel field-form', novalidate: 'true' },
        h('h2', { class: 'panel-title', id: 'form-title', tabindex: '-1' }, isNew ? 'Add a field' : 'Edit field'),
        h('p', { class: 'hint' }, 'Fields marked * are required. Everything else can be added later. Details are saved only on this device.'),
        errBox,

        h('fieldset', { class: 'fs' }, h('legend', null, '1. Farmer and field'),
          row('Farmer name or ID', tInput(d, 'farmer', { maxlength: 80 }), 'An ID code or nickname is fine. You do not need a full name.', true),
          row('Field name', tInput(d, 'name', { maxlength: 80, placeholder: 'e.g. North plot' }), null, true),
          row('Village, area or landmark', tInput(d, 'place', { maxlength: 120 }), 'Optional. Helps you recognise the field.')),

        h('fieldset', { class: 'fs' }, h('legend', null, '2. Field location'),
          row('State', stateSel, 'Choosing a state places the field in the middle of that state. Use your location or the map for a closer match.'),
          h('div', { class: 'btn-row' }, gpsBtn, mapBtn),
          inline(row('Latitude (north)', latI), row('Longitude (east)', lonI)),
          status),

        h('fieldset', { class: 'fs' }, h('legend', null, '3. Size and soil'),
          h('div', { class: 'frow' }, h('label', { for: sizeId }, 'Field size'), inline(sizeIn, sizeUnit)),
          row('Soil texture', sInput(d.soil, 'texture', TEXTURE, 'Not recorded'),
            'Rub moist soil between your fingers: gritty is sandy, smooth like flour is silty, sticky and holds a ribbon is clay.'),
          row('Soil pH', phI, 'Leave blank if the soil has not been tested.'),
          h('div', { class: 'frow' }, h('label', { for: somPctId }, 'Soil organic matter'),
            inline(somPctI, h('span', { class: 'unit' }, '%')),
            h('p', { class: 'hint' }, 'If you have no test result, choose a rough level instead:'),
            somSel)),

        h('fieldset', { class: 'fs' }, h('legend', null, '4. Water and slope'),
          row('Drainage', sInput(d, 'drainage', DRAINAGE, 'Not recorded')),
          row('Slope', sInput(d, 'slope', SLOPE, 'Not recorded')),
          row('Irrigation access', sInput(d.irrigation, 'type', IRRIG, 'Not recorded')),
          row('Irrigation details (source, months available)', tInput(d.irrigation, 'note', { maxlength: 120 }))),

        h('fieldset', { class: 'fs' }, h('legend', null, '5. Current crop'),
          seasonFields(d.current, true)),

        h('fieldset', { class: 'fs' }, h('legend', null, '6. Past crops, yields and problems'),
          h('p', { class: 'hint' }, 'Add the last two or three seasons you remember. Approximate dates are fine. Each season holds its crop, dates, yield, fertilizer and any pests or disease.'),
          pastWrap, addPast),

        h('fieldset', { class: 'fs' }, h('legend', null, '7. Market'),
          checks(d.market, 'uses', MARKET, 'What do you do with the harvest?', 'unknown'),
          row('Market notes (buyer, crops that sell best nearby)', tInput(d.market, 'note', { maxlength: 160 }))),

        h('div', { class: 'btn-row sticky-actions' }, saveBtn, cancelBtn)
      )
    );
    showLoc();
    if (opts.focus) $('#form-title').focus();
    if (errBox) errBox.focus();
    else if (opts.focusSeason != null) {
      const node = root.querySelector('[data-season="' + opts.focusSeason + '"] select');
      if (node) node.focus();
    }
    if (!opts.focus) window.scrollTo(0, y);
  }

  function onSave() {
    const d = ui.draft;
    const errs = validate(d);
    if (errs.length) { ui.errors = errs; renderEdit(); return; }
    const f = fromDraft(d);
    f.updated = nowIso();
    const i = store.fields.findIndex((x) => x.id === f.id);
    if (i >= 0) store.fields[i] = f; else store.fields.push(f);
    save();
    ui.mode = 'detail'; ui.id = f.id; ui.draft = null; ui.errors = [];
    ui.msg = storageOK
      ? 'Saved on this device.'
      : 'Saved for now, but this browser is not keeping it. Use “Back up” to download a copy.';
    render(true);
  }

  /* ---------- pieces used by list and detail ---------- */
  const card = (title, ...kids) => h('section', { class: 'card' }, h('h3', null, title), kids);
  const muted = (t) => h('span', { class: 'na' }, t);
  function progress(c) {
    return h('div', null,
      h('div', { class: 'meter green', role: 'img', 'aria-label': c.done + ' of ' + c.total + ' profile items filled in' },
        h('span', { style: 'width:' + (100 * c.done / c.total) + '%' })),
      h('p', { class: 'hint' }, c.done + ' of ' + c.total + ' profile items filled in'));
  }
  const msgEl = () => {
    const m = ui.msg; ui.msg = '';
    return m ? h('p', { class: 'flash', role: 'status' }, m) : null;
  };
  function dateLine(s) {
    const a = s.planted ? 'Planted ' + fmtDate(s.planted) : 'Planting date not recorded';
    const b = s.harvested ? (s.current ? 'Expected harvest ' : 'Harvested ') + fmtDate(s.harvested) : (s.current ? '' : 'Harvest date not recorded');
    return [a, b].filter(Boolean).join(' · ');
  }

  /* ---------- list ---------- */
  function renderList() {
    const fields = store.fields.slice().sort((a, b) =>
      a.farmer.localeCompare(b.farmer) || a.name.localeCompare(b.name));
    const addBtn = h('button', { type: 'button', class: 'btn primary' }, 'Add a field');
    addBtn.addEventListener('click', () => startNew());
    const importIn = h('input', { type: 'file', accept: '.json,application/json', class: 'visually-hidden', id: 'import-file' });
    importIn.addEventListener('change', () => { if (importIn.files[0]) importFile(importIn.files[0]); importIn.value = ''; });
    const importLbl = h('label', { class: 'btn', for: 'import-file' }, 'Restore from a file');
    const jsonBtn = h('button', { type: 'button', class: 'btn' }, 'Download backup (JSON)');
    jsonBtn.addEventListener('click', exportJson);
    const csvBtn = h('button', { type: 'button', class: 'btn' }, 'Download for a spreadsheet (CSV)');
    csvBtn.addEventListener('click', exportCsv);
    const wipeBtn = h('button', { type: 'button', class: 'btn danger' }, 'Delete everything on this device');
    wipeBtn.addEventListener('click', () => {
      if (window.confirm('Delete all ' + store.fields.length + ' fields saved on this device? This cannot be undone.')) {
        store.fields = []; save(); ui.msg = 'All fields were deleted from this device.'; render();
      }
    });
    const exBtn = h('button', { type: 'button', class: 'btn' }, 'Try an example field');
    exBtn.addEventListener('click', () => {
      const f = normField(exampleField());
      store.fields.push(f); save(); ui.mode = 'detail'; ui.id = f.id; render(true);
    });

    root.replaceChildren(
      h('section', { class: 'panel' },
        h('h2', { class: 'panel-title', id: 'list-title', tabindex: '-1' }, 'My fields'),
        h('p', null, 'Record each field once: where it is, its soil and water, what grew there and what happened. This is the information field-specific rotation advice will need.'),
        h('p', { class: 'privacy' }, 'Saved only on this device. No account, nothing is sent anywhere. Anyone using this phone or browser can see it, so an ID code works better than a full name.'),
        !storageOK ? h('p', { class: 'caution' }, 'This browser is not letting the app save data. Entries will be lost when you close the page. Use “Download backup” to keep a copy.') : null,
        msgEl(),
        h('div', { class: 'btn-row' }, addBtn, fields.length ? null : exBtn)),
      fields.length
        ? h('div', { class: 'field-list' }, fields.map(fieldCard))
        : h('section', { class: 'panel empty' }, h('p', null, 'No fields yet. Add your first field, or try an example to see what a finished profile looks like.')),
      h('section', { class: 'panel' },
        h('details', null,
          h('summary', null, 'Back up, share or clear your fields'),
          h('div', { class: 'details-body' },
            h('p', { class: 'hint' }, 'A backup file lets you move your fields to another phone or keep a copy in case this browser is cleared. The files contain everything you entered.'),
            h('div', { class: 'btn-row' }, jsonBtn, csvBtn, importLbl, importIn, fields.length ? wipeBtn : null))))
    );
  }

  function fieldCard(f) {
    const c = completeness(f);
    const cur = f.seasons.find((s) => s.current);
    const open = h('button', { type: 'button', class: 'btn primary' }, 'Open');
    open.addEventListener('click', () => { ui.mode = 'detail'; ui.id = f.id; render(true); });
    const edit = h('button', { type: 'button', class: 'btn' }, 'Edit');
    edit.addEventListener('click', () => startEdit(f.id));
    const bits = [
      f.loc.cellId ? where(f) : 'No location yet',
      f.size.value != null ? fmt1(f.size.value).replace(/\.0$/, '') + ' ' + (f.size.unit === 'acres' ? 'acres' : 'ha') : null,
      cur && cur.crop ? 'Growing now: ' + cropName(cur) : 'No current crop recorded',
    ].filter(Boolean);
    return h('article', { class: 'field-card' },
      h('div', { class: 'field-card-top' },
        h('div', null,
          h('p', { class: 'eyebrow' }, f.farmer),
          h('h3', null, f.name, f.example ? h('span', { class: 'tag' }, 'Example') : null),
          h('p', { class: 'muted' }, bits.join(' · '))),
        h('div', { class: 'btn-row' }, open, edit)),
      progress(c));
  }

  /* ---------- detail ---------- */
  function renderDetail(f) {
    const c = completeness(f);
    const an = analyse(f);
    const snap = f.loc.cellId ? A.snapshot(f.loc.cellId) : null;

    const back = h('button', { type: 'button', class: 'linklike' }, '← All my fields');
    back.addEventListener('click', () => { ui.mode = 'list'; render(true); });
    const edit = h('button', { type: 'button', class: 'btn' }, 'Edit');
    edit.addEventListener('click', () => startEdit(f.id));
    const del = h('button', { type: 'button', class: 'btn danger' }, 'Delete');
    del.addEventListener('click', () => {
      if (window.confirm('Delete the field “' + f.name + '”? This cannot be undone.')) {
        store.fields = store.fields.filter((x) => x.id !== f.id);
        if (ui.viewingFieldId === f.id) ui.viewingFieldId = null;
        save(); ui.mode = 'list'; ui.msg = 'Field deleted.'; render(true);
      }
    });
    const see = h('button', { type: 'button', class: 'btn primary' }, 'See climate for this field');
    see.addEventListener('click', () => viewClimate(f.id));
    if (!snap) see.disabled = true;

    const unit = f.size.unit === 'acres' ? 'acres' : 'ha';
    const sizeText = f.size.value == null ? muted('Not recorded')
      : fmt1(f.size.value).replace(/\.0$/, '') + ' ' + unit + (unit === 'ha'
        ? ' (' + fmt1(f.size.value / 0.404686) + ' acres)' : ' (' + fmt1(toHa(f.size)) + ' ha)');
    const na = (v, text) => (v ? text : muted('Not recorded'));

    const siteRows = [
      ['Field size', sizeText],
      ['Soil texture', na(f.soil.texture, label(TEXTURE, f.soil.texture))],
      ['Soil pH', na(f.soil.ph != null, String(f.soil.ph))],
      ['Soil organic matter', f.soil.somPct != null || f.soil.somLevel
        ? [f.soil.somPct != null ? f.soil.somPct + '%' : null, f.soil.somLevel ? short(label(SOM, f.soil.somLevel)) : null].filter(Boolean).join(' · ')
        : muted('Not recorded')],
      ['Drainage', na(f.drainage, short(label(DRAINAGE, f.drainage)))],
      ['Slope', na(f.slope, label(SLOPE, f.slope))],
      ['Irrigation', f.irrigation.type
        ? short(label(IRRIG, f.irrigation.type)) + (f.irrigation.note ? ' – ' + f.irrigation.note : '')
        : muted('Not recorded')],
    ];

    const plan = h('button', { type: 'button', class: 'btn' }, 'Plan rotations for this field');
    plan.addEventListener('click', () => { if (window.ClymaitPlanner) window.ClymaitPlanner.open(f.id); });

    root.replaceChildren(
      h('p', { class: 'crumb' }, back),
      ...(ui.msg ? [msgEl()] : []),
      h('section', { class: 'panel' },
        h('p', { class: 'eyebrow' }, f.farmer),
        h('h2', { class: 'field-title', id: 'field-title', tabindex: '-1' }, f.name, f.example ? h('span', { class: 'tag' }, 'Example data') : null),
        h('p', { class: 'muted' }, [
          f.place || null,
          f.loc.cellId ? where(f) + ' (map square near ' + A.cellById.get(f.loc.cellId).lat.toFixed(2) + '° N, ' + A.cellById.get(f.loc.cellId).lon.toFixed(2) + '° E)' : 'No location recorded',
        ].filter(Boolean).join(' · ')),
        h('div', { class: 'btn-row' }, see, plan, edit, del),
        progress(c),
        c.missing.length ? h('p', { class: 'hint' }, 'Still to add: ' + c.missing.join(', ') + '.') : h('p', { class: 'hint' }, 'Every profile item is filled in.')),
      climateCard(f, snap),
      card('Soil, water and size', h('dl', { class: 'facts' }, siteRows.flatMap(([k, v]) => [h('dt', null, k), h('dd', null, v)]))),
      historyCard(f, an),
      rotationCard(f, snap),
      yieldCard(f),
      card('Market',
        f.market.uses.length ? h('p', null, labels(MARKET, f.market.uses)) : h('p', { class: 'muted' }, 'Not recorded'),
        f.market.note ? h('p', { class: 'hint' }, f.market.note) : null),
      card('What this profile does today',
        h('ul', { class: 'how-list' },
          h('li', null, 'Shows the climate estimate and risk for the map square your field is in, and where your current crop ranks.'),
          h('li', null, 'Finds periods with no crop growing, from your own dates.'),
          h('li', null, 'Lists next-crop options from your crop history using draft rotation rules with sources, and checks them against your drainage, soil texture, soil pH and the climate of your map square.'),
          h('li', null, 'Fertilizer, pests, yields, slope and market are stored but do not change any advice yet.')))
    );
  }

  /* ---------- next crop options (draft rotation rules) ---------- */
  function rotationCard(f, snap) {
    const E = window.ClymaitEngine, R = window.CLYMAIT_RULES;
    if (!E || !R) return null;
    if (ui.afterFor !== f.id) { ui.after = ''; ui.afterFor = f.id; }
    const res = E.advise(f, snap, ui.after);

    const sel = h('select', { id: 'rot-after' });
    const auto = f.seasons.length ? E.lastCrop(f) : { key: '' };
    sel.appendChild(h('option', { value: '' }, auto.key
      ? 'The crop in my history (' + (cropName({ crop: auto.key, cropOther: '' })) + ')'
      : 'Choose a crop…'));
    for (const [k, v] of CROPS) if (k !== 'other') sel.appendChild(h('option', { value: k }, short(v)));
    sel.value = ui.after;
    sel.addEventListener('change', () => {
      ui.after = sel.value;
      renderDetail(f);
      const n = $('#rot-after'); if (n) n.focus({ preventScroll: true });
    });

    const head = [
      h('p', { class: 'caution' }, h('strong', null, 'Decision support, draft guidance. '),
        'These rules come from published sources and have not yet been reviewed by an agronomist. Use them with your own knowledge and your extension officer. They do not say how long to wait before repeating a crop: no source gives a safe interval.'),
      h('div', { class: 'rot-pick' }, h('label', { for: 'rot-after' }, 'Planning what comes after:'), sel),
    ];
    if (!res.after) {
      return card('Next crop options', ...head,
        h('p', { class: 'muted' }, 'Add the current crop or a past crop (edit the field) to see options.'));
    }

    const kids = [...head];
    const intro = res.how === 'current' ? 'After your current crop, ' + res.afterLabel + ':'
      : res.how === 'last' ? 'After your last recorded crop, ' + res.afterLabel + ':' : 'After ' + res.afterLabel + ':';
    kids.push(h('p', { class: 'rot-intro' }, intro));
    if (res.repeatNote) kids.push(h('p', { class: 'hint' }, res.repeatNote + ' See the advice on repeating below, if any.'));

    const GROUPS = [
      ['good', 'Good fit, according to the sources'],
      ['practice', 'Possible: common practice or evidence from one site'],
      ['mixed', 'Mixed evidence: sources disagree or depend on the zone'],
      ['avoid', 'Avoid repeating'],
      ['climateLow', 'A rotation rule exists, but the climate here scores this crop low'],
    ];
    let shown = 0;
    for (const [g, title] of GROUPS) {
      const opts = res.groups[g];
      if (!opts.length) continue;
      shown += opts.length;
      kids.push(h('h4', { class: 'rot-group ' + g }, title));
      kids.push(h('ul', { class: 'rot-list' }, opts.map((o) => rotOption(o, g))));
    }
    if (!shown) kids.push(h('p', { class: 'muted' }, 'No rotation rule in the draft covers a next crop after ' + res.afterLabel + '. That means no evidence was found, not that every choice is fine.'));

    if (res.noEvidence.length && shown) {
      kids.push(h('p', { class: 'hint' }, 'No rotation evidence found for: ' + res.noEvidence.join(', ') + '. They are left out on purpose rather than guessed.'));
    } else if (res.noEvidence.length) {
      kids.push(h('p', { class: 'hint' }, 'Not covered: ' + res.noEvidence.join(', ') + '.'));
    }
    kids.push(h('details', { class: 'rot-detail' }, h('summary', null, 'Where there is no rule (row Q of the draft)'),
      h('p', { class: 'hint' }, R.NO_RULE.text),
      h('p', { class: 'hint' }, 'Sources: ', sourceLinks(R.NO_RULE.sources))));

    if (res.missing.length) {
      kids.push(h('p', { class: 'hint' }, 'Not checked because they are not recorded: ' + res.missing.join(', ') + '. Edit the field to add them.'));
    }
    kids.push(h('p', { class: 'hint' }, 'Rice, cassava and yam also show the climate estimate for your map square. Maize, cowpea and groundnut have none yet. Rules from single trials may not hold on your field. Rules version: ' + res.rulesVersion + '.'));
    return card('Next crop options', ...kids);
  }

  function sourceLinks(list) {
    const out = [];
    list.forEach((s, i) => {
      if (i) out.push('; ');
      out.push(s.url ? h('a', { href: s.url, target: '_blank', rel: 'noopener noreferrer' }, s.title) : s.title);
      out.push(' (' + s.depth + ')');
    });
    return out;
  }

  function rotOption(o, g) {
    const sum = h('summary', null,
      h('span', { class: 'rot-name' }, o.label),
      h('span', { class: 'rot-conf ' + o.tier }, o.confidence),
      o.review ? h('span', { class: 'rot-review' }, 'Awaiting agronomist review') : null,
      o.climate ? h('span', { class: 'rot-climate' }, 'Climate ' + fmt1(o.climate.val) + ' / 100') : null);
    const body = [];
    for (const r of o.rules) {
      body.push(h('p', { class: 'rot-headline' }, r.headline));
      body.push(h('p', null, r.evidence));
      if (r.assumes) body.push(h('p', { class: 'hint' }, 'Applies to: ' + r.assumes + '.'));
      body.push(h('p', { class: 'hint' }, 'Rule ' + r.id + ' · ' + r.status + ' · ', sourceLinks(r.sources)));
    }
    if (g === 'climateLow') {
      body.push(h('p', { class: 'caution' }, 'The climate estimate for this map square is ' + fmt1(o.climate.val) + ' out of 100, which is low. A rotation rule does not make up for that.'));
    }
    for (const n of o.notes) body.push(h('p', { class: 'rot-note' }, n));
    if (o.checks.length) {
      body.push(h('ul', { class: 'rot-checks' }, o.checks.map((c) =>
        h('li', { class: c.level }, h('span', { 'aria-hidden': 'true' }, c.level === 'warn' ? '⚠ ' : '✓ '), h('span', { class: 'sr' }, c.level === 'warn' ? 'Check: ' : 'OK: '), c.text))));
    }
    return h('li', null, h('details', { class: 'rot-opt' }, sum, h('div', { class: 'rot-body' }, body)));
  }

  function climateCard(f, snap) {
    if (!snap) {
      return card('Climate at this field', h('p', { class: 'muted' }, 'Add a location (edit the field) to see rice, cassava and yam estimates and the climate risk for it.'));
    }
    const cur = f.seasons.find((s) => s.current && s.crop);
    const idx = cur ? snap.crops.findIndex((v) => v.key === cur.crop) : -1;
    let curLine = null;
    if (cur && idx >= 0) {
      const v = snap.crops[idx];
      curLine = h('p', { class: 'verdict' }, 'Your current crop, ' + cropName(cur) + ': climate estimate ' + fmt1(v.val) + ', ranked ' + (idx + 1) + ' of 3 here. Close scores mean about the same.');
    } else if (cur) {
      curLine = h('p', { class: 'hint' }, cropName(cur) + ' is not one of the three crops the climate estimates cover (rice, cassava, yam).');
    }
    const lvl = { higher: 'Higher', medium: 'Medium', lower: 'Lower' }[snap.risk.level];
    return card('Climate at this field',
      h('p', { class: 'hint' }, 'Estimates are for the whole map square (about 55 km), not this exact field.'),
      h('ol', { class: 'mini-rank' }, snap.crops.map((v, i) =>
        h('li', null, h('strong', null, v.label), ' ' + fmt1(v.val) + ' points', h('span', { class: 'muted' }, ' (usually within ± ' + fmt0(v.err) + ')')))),
      curLine,
      h('p', null, h('span', { class: 'badge ' + snap.risk.level }, lvl + ' risk'), ' ',
        h('span', { class: 'rank-note' }, snap.state + ' ranks ' + snap.risk.rank + ' of ' + snap.risk.total + ' states for climate stress (1 = most).')),
      snap.risk.recentCaution ? h('p', { class: 'caution' }, 'The recent drought figure for ' + snap.state + ' looks unusually high and is unverified, so treat that part of the risk with caution.') : null);
  }

  function historyCard(f, an) {
    const seasons = f.seasons.slice().sort((a, b) => {
      if (a.planted && b.planted) return toTime(b.planted) - toTime(a.planted);
      if (a.planted) return -1;
      if (b.planted) return 1;
      return 0;
    });
    if (!seasons.length) {
      return card('Crop history', h('p', { class: 'muted' }, 'No crops recorded yet. Edit the field to add the current crop and past seasons.'));
    }
    const facts = [];
    if (an.order.length > 1) facts.push(h('li', null, 'Order of crops (oldest first): ' + an.order.join(' → ')));
    if (an.gaps.length || an.open) {
      const total = an.gapDays + (an.open ? an.open.days : 0);
      facts.push(h('li', null, 'No crop growing for ' + total + ' days in all across ' + (an.gaps.length + (an.open ? 1 : 0)) + ' period' + (an.gaps.length + (an.open ? 1 : 0) === 1 ? '' : 's') + ' (including fallow).'));
    }
    for (const [a, b] of an.repeats) facts.push(h('li', null, cropName(a) + ' was grown in two seasons in a row (' + a.planted.slice(0, 4) + ' and ' + b.planted.slice(0, 4) + ').'));
    for (const [a, b] of an.overlaps) facts.push(h('li', null, cropName(a) + ' and ' + cropName(b) + ' overlap in time (' + fmtDate(b.planted) + ' planting is before the ' + fmtDate(a.harvested) + ' harvest).'));

    // newest first; a gap (older harvest → newer planting) sits between the two seasons
    const ordered = [];
    if (an.open) ordered.push(h('li', { class: 'gap' }, 'No crop recorded since ' + fmtDate(an.open.from) + ' (' + an.open.days + ' days so far).'));
    seasons.forEach((s, i) => {
      ordered.push(seasonItem(s, f));
      const older = seasons[i + 1];
      if (older) {
        const g = an.gaps.find((x) => x.after.id === older.id && s.planted && x.to === s.planted);
        if (g) ordered.push(h('li', { class: 'gap' }, 'No crop growing: ' + fmtDate(g.from) + ' to ' + fmtDate(g.to) + ' (' + g.days + ' days).'));
      }
    });
    return card('Crop history',
      facts.length ? h('ul', { class: 'how-list' }, facts) : null,
      h('ol', { class: 'timeline' }, ordered),
      h('p', { class: 'hint' }, 'Gaps are worked out only from the dates you entered. Fallow counts as no crop. Seasons without dates are listed last and are not used for gaps.'));
  }

  function seasonItem(s, f) {
    const t = yieldTha(s, f);
    const bits = [];
    if (s.yieldAmount != null) {
      bits.push(h('li', null, 'Yield: ' + s.yieldAmount + ' ' + label(YIELD_UNITS, s.yieldUnit) +
        (t != null && s.yieldUnit !== 't_ha' ? ' (about ' + fmtT(t) + ' t/ha)' : (t == null ? ' (add the field size to convert to t/ha)' : ''))));
    }
    if (s.fert.length || s.fertNote) bits.push(h('li', null, 'Fertilizer: ' + [labels(FERT, s.fert), s.fertNote].filter(Boolean).join(' – ')));
    if (s.pests.length || s.pestNote) bits.push(h('li', null, 'Pests or disease: ' + [labels(PESTS, s.pests), s.pestNote].filter(Boolean).join(' – ')));
    return h('li', { class: 'season' },
      h('div', { class: 'season-head' }, h('strong', null, cropName(s)), s.current ? h('span', { class: 'tag now' }, 'Growing now') : null),
      h('p', { class: 'season-dates' }, dateLine(s)),
      bits.length ? h('ul', null, bits) : null);
  }

  function yieldCard(f) {
    const by = new Map();
    for (const s of f.seasons) {
      if (s.current || !s.crop || s.crop === 'fallow') continue;
      const t = yieldTha(s, f);
      if (t == null) continue;
      const k = cropKey(s);
      if (!by.has(k)) by.set(k, { name: cropName(s), vals: [] });
      by.get(k).vals.push(t);
    }
    if (!by.size) {
      return card('Yield history', h('p', { class: 'muted' }, f.seasons.some((s) => s.yieldAmount != null)
        ? 'Yields were entered as totals. Add the field size to see tonnes per hectare.'
        : 'No yields recorded yet.'));
    }
    return card('Yield history',
      h('div', { class: 'table-wrap' }, h('table', { class: 'sens' },
        h('thead', null, h('tr', null, h('th', null, 'Crop'), h('th', null, 'Seasons'), h('th', null, 'Average t/ha'), h('th', null, 'Lowest – highest'))),
        h('tbody', null, Array.from(by.values()).map((g) => {
          const avg = g.vals.reduce((a, b) => a + b, 0) / g.vals.length;
          return h('tr', null, h('td', null, g.name), h('td', null, String(g.vals.length)), h('td', null, fmtT(avg)),
            h('td', null, g.vals.length > 1 ? fmtT(Math.min(...g.vals)) + ' – ' + fmtT(Math.max(...g.vals)) : '–'));
        })))),
      h('p', { class: 'hint' }, 'Tonnes per hectare, from the past seasons you entered. Totals are divided by the field size.'));
  }

  /* ---------- navigation helpers ---------- */
  function render(focus) {
    updateCount();
    if (ui.mode === 'edit' && ui.draft) renderEdit({ focus });
    else if (ui.mode === 'detail' && getField(ui.id)) renderDetail(getField(ui.id));
    else { ui.mode = 'list'; renderList(); }
    if (focus && ui.mode !== 'edit') {
      const t = $('#field-title') || $('#list-title');
      if (t) t.focus({ preventScroll: true });
    }
    if (focus) window.scrollTo(0, 0);
  }

  function startNew(opts) {
    ui.draft = newDraft();
    ui.errors = [];
    if (opts && opts.cell) {
      ui.draft.loc = { lat: opts.cell.lat, lon: opts.cell.lon, cellId: opts.cell.id, source: 'map' };
    }
    ui.mode = 'edit';
    A.setView('fields');
    render(true);
  }
  function startEdit(id) {
    const f = getField(id);
    if (!f) return;
    ui.draft = toDraft(f); ui.errors = []; ui.mode = 'edit'; ui.id = id;
    render(true);
  }
  function viewClimate(id) {
    const f = getField(id);
    if (!f || !f.loc.cellId) return;
    A.select(f.loc.cellId);
    ui.viewingFieldId = id;
    A.setView('explore');
    updateBars();
  }

  /* ---------- bars on the Explore view ---------- */
  function updateBars() {
    const pb = $('#pick-bar');
    pb.hidden = !ui.picking;
    if (ui.picking) {
      const c = A.cellById.get(A.getSelected());
      const nm = ui.draft && ui.draft.name ? '“' + ui.draft.name + '”' : 'your field';
      $('#pick-text').textContent = 'Choosing a location for ' + nm + '. Tap a square on the map, then press “Use this square”.' + (c ? ' Selected now: ' + c.state + '.' : '');
    }
    $('#use-square').hidden = ui.picking;
    const f = ui.viewingFieldId ? getField(ui.viewingFieldId) : null;
    const fb = $('#field-banner');
    fb.hidden = !f || ui.picking;
    if (f) $('#field-banner-text').textContent = 'Showing climate for your field “' + f.name + '”.';
  }

  $('#pick-use').addEventListener('click', () => {
    const c = A.cellById.get(A.getSelected());
    if (c && ui.draft) {
      ui.draft.loc = { lat: c.lat, lon: c.lon, cellId: c.id, source: 'map' };
    }
    ui.picking = false;
    A.setView('fields');
  });
  $('#pick-cancel').addEventListener('click', () => { ui.picking = false; A.setView('fields'); });
  $('#field-banner-back').addEventListener('click', () => {
    if (ui.viewingFieldId) { ui.mode = 'detail'; ui.id = ui.viewingFieldId; }
    A.setView('fields');
  });
  $('#field-banner-close').addEventListener('click', () => { ui.viewingFieldId = null; updateBars(); });
  $('#use-square').addEventListener('click', () => {
    if (ui.mode === 'edit' && ui.draft && !window.confirm('You have an unsaved field open. Start a new one and discard it?')) return;
    startNew({ cell: A.cellById.get(A.getSelected()) });
  });

  A.onSelect((id) => {
    const f = ui.viewingFieldId ? getField(ui.viewingFieldId) : null;
    if (f && f.loc.cellId !== id) ui.viewingFieldId = null;
    updateBars();
  });
  A.onView((name) => {
    if (name === 'fields') {
      ui.picking = false;
      render(false);
    }
    updateBars();
  });

  /* ---------- backup, restore, spreadsheet ---------- */
  function download(name, text, type) {
    const blob = new Blob([text], { type });
    const a = h('a', { href: URL.createObjectURL(blob), download: name });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  const stamp = () => todayStr().replace(/-/g, '');
  function exportJson() {
    download('clymait-fields-' + stamp() + '.json',
      JSON.stringify({ app: 'clymait-fields', version: 1, exported: nowIso(), fields: store.fields }, null, 2),
      'application/json');
  }
  function csvCell(v) {
    if (v == null) return '""';
    let s = String(v);
    if (typeof v !== 'number' && /^[=+\-@\t\r]/.test(s)) s = "'" + s;   // stop spreadsheets treating text as a formula
    return '"' + s.replace(/"/g, '""') + '"';
  }
  function exportCsv() {
    const head = ['farmer', 'field', 'village_or_area', 'state', 'latitude', 'longitude', 'size_ha', 'soil_texture', 'soil_ph',
      'organic_matter_pct', 'organic_matter_level', 'drainage', 'slope', 'irrigation', 'irrigation_note', 'crop', 'is_current_crop',
      'planting_date', 'harvest_date', 'yield_amount', 'yield_unit', 'yield_t_per_ha', 'fertilizer', 'fertilizer_note', 'pests_disease',
      'pest_note', 'market', 'market_note'];
    const lines = [head.map(csvCell).join(',')];
    for (const f of store.fields) {
      const base = [f.farmer, f.name, f.place, where(f), f.loc.lat, f.loc.lon, toHa(f.size) != null ? Math.round(toHa(f.size) * 1000) / 1000 : '',
        label(TEXTURE, f.soil.texture), f.soil.ph, f.soil.somPct, label(SOM, f.soil.somLevel) && short(label(SOM, f.soil.somLevel)),
        label(DRAINAGE, f.drainage) && short(label(DRAINAGE, f.drainage)), label(SLOPE, f.slope), label(IRRIG, f.irrigation.type) && short(label(IRRIG, f.irrigation.type)), f.irrigation.note];
      const tail = [labels(MARKET, f.market.uses), f.market.note];
      const seasons = f.seasons.length ? f.seasons : [null];
      for (const s of seasons) {
        const mid = s
          ? [cropName(s), s.current ? 'yes' : 'no', s.planted, s.harvested, s.yieldAmount, s.yieldAmount != null ? label(YIELD_UNITS, s.yieldUnit) : '',
            yieldTha(s, f) != null ? Math.round(yieldTha(s, f) * 100) / 100 : '', labels(FERT, s.fert), s.fertNote, labels(PESTS, s.pests), s.pestNote]
          : ['', '', '', '', '', '', '', '', '', '', ''];
        lines.push(base.concat(mid, tail).map(csvCell).join(','));
      }
    }
    download('clymait-fields-' + stamp() + '.csv', '﻿' + lines.join('\r\n'), 'text/csv;charset=utf-8');
  }
  function importFile(file) {
    const rd = new FileReader();
    rd.onload = () => {
      try {
        const o = JSON.parse(String(rd.result));
        if (!o || o.app !== 'clymait-fields' || !Array.isArray(o.fields)) throw new Error('not a Clymait backup');
        let added = 0, updated = 0, skipped = 0;
        for (const raw of o.fields.slice(0, 500)) {
          const f = normField(raw);
          if (!f) { skipped++; continue; }
          const i = store.fields.findIndex((x) => x.id === f.id);
          if (i < 0) { store.fields.push(f); added++; }
          else if (f.updated >= store.fields[i].updated) { store.fields[i] = f; updated++; }
          else skipped++;
        }
        save();
        ui.msg = 'Restored: ' + added + ' added, ' + updated + ' updated, ' + skipped + ' skipped.';
      } catch (e) {
        ui.msg = 'That file could not be read. Choose a backup file downloaded from this app.';
      }
      render();
    };
    rd.onerror = () => { ui.msg = 'That file could not be read.'; render(); };
    rd.readAsText(file);
  }

  /* ---------- example ---------- */
  function exampleField() {
    const c = A.cellById.get('10.25_7.25');
    return {
      example: true, farmer: 'Example farmer', name: 'Example – North plot', place: 'Near the road (example data)',
      loc: { lat: c.lat, lon: c.lon, source: 'map' },
      size: { value: 1.5, unit: 'ha' },
      soil: { texture: 'sandy_loam', ph: 5.8, somLevel: 'medium', somPct: 1.8 },
      drainage: 'moderate', slope: 'gentle', irrigation: { type: 'none' },
      seasons: [
        { crop: 'yam', planted: '2024-04-10', harvested: '2024-11-20', yieldAmount: 9, yieldUnit: 't_ha', fert: ['manure'], pests: ['rot'], pestNote: 'Some tuber rot in storage' },
        { crop: 'cassava', planted: '2025-03-05', harvested: '2026-01-15', yieldAmount: 12, yieldUnit: 't_ha', fert: ['npk'], pests: ['virus'] },
        { crop: 'rice', current: true, planted: '2026-06-20', harvested: '2026-11-30', fert: ['urea'], pests: ['none'] },
      ],
      market: { uses: ['home', 'local'], note: 'Example values only' },
    };
  }

  /* ---------- small interface for the rotation planner ---------- */
  const PLAN_CROPS = ['rice', 'cassava', 'yam', 'maize', 'cowpea', 'groundnut', 'fallow'];
  window.ClymaitFields = {
    list: () => store.fields.slice(),
    get: getField,
    onChange: (fn) => changeListeners.push(fn),
    // Average recorded yield (t/ha) per crop, from the farmer's own history.
    yields(f) {
      const sum = {}, n = {};
      for (const s of f.seasons) {
        const y = yieldTha(s, f);
        if (s.crop && y != null) { sum[s.crop] = (sum[s.crop] || 0) + y; n[s.crop] = (n[s.crop] || 0) + 1; }
      }
      const out = {};
      for (const k of Object.keys(sum)) out[k] = Math.round((sum[k] / n[k]) * 100) / 100;
      return out;
    },
    // The farmer's own dated crops (oldest first, last four) as rotation steps. days is null when no harvest date was recorded.
    historySteps(f) {
      const dated = f.seasons.filter((s) => s.crop && s.planted).sort((a, b) => toTime(a.planted) - toTime(b.planted));
      const ok = dated.filter((s) => PLAN_CROPS.includes(s.crop));
      const steps = ok.slice(-4).map((s) => ({
        crop: s.crop, plantMonth: Number(s.planted.slice(5, 7)),
        days: s.harvested ? Math.min(730, Math.max(1, Math.round((toTime(s.harvested) - toTime(s.planted)) / DAY))) : null,
      }));
      return { steps, skipped: dated.length - ok.length };
    },
    hasWeeds: (f) => f.seasons.some((s) => s.pests.includes('weeds')),
    PESTS,
  };

  /* ---------- start ---------- */
  load();
  updateCount();
  updateBars();
})();
