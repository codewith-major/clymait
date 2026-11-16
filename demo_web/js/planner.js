/* Clymait – Rotation planner. Compare the current rotation with at least three alternatives for one field.
   Runs from the data already on the page. Plans, feedback and outcomes are saved in this browser only. */
(function () {
  'use strict';

  const A = window.ClymaitApp, F = window.ClymaitFields, P = window.ClymaitPlanner_engine, R = window.CLYMAIT_RULES, RE = window.ClymaitEngine;
  const root = document.getElementById('planner-root');
  if (!A || !F || !P || !R || !RE || !root) return;
  const { h, fmt0, fmt1 } = A;
  const FACTS = R.CROP_FACTS;
  const MONTHS = P.MONTHS;
  const MD = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

  /* ---------- small helpers ---------- */
  const num = (x) => { if (x === '' || x == null) return null; const n = Number(x); return Number.isFinite(n) ? n : null; };
  const str = (x, max) => (typeof x === 'string' ? x.trim().slice(0, max || 200) : '');
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const uid = () => 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const cname = (k) => (FACTS[k] ? FACTS[k].label : 'Choose a crop');
  const dayLabel = (day) => {
    let doy = ((Math.floor(day) % 365) + 365) % 365, m = 0;
    while (m < 11 && doy >= MD.slice(0, m + 1).reduce((a, b) => a + b, 0)) m++;
    const before = MD.slice(0, m).reduce((a, b) => a + b, 0);
    return (doy - before + 1) + ' ' + MONTHS[m];
  };
  const NAIRA = P.naira;
  const LEVELS = [[0, 'Not important'], [1, 'Some importance'], [2, 'Important'], [3, 'Very important']];
  const CRIT_HELP = {
    climate: 'How well the area’s climate suits the crops (rice, cassava, yam only).',
    drought: 'Crops the sources call drought-tolerant or drought-sensitive.',
    water: 'Whether each crop’s sourced rainfall range fits the rain your map square gets.',
    soil: 'Crop order effects on soil fertility, from the sourced rules (not measured soil data).',
    pest: 'Crop changes the sources link to fewer pests or weeds.',
    bare: 'Days a year with no crop in the field.',
    vulnerable: 'Days a year a crop is growing in the dry season without irrigation.',
    income: 'Money left after costs, from your own yield, price and cost numbers.',
    labor: 'Person-days of work, from your own numbers.',
  };

  /* ---------- state ---------- */
  const blankStep = () => ({ crop: '', plantMonth: 6, days: null });
  const blankRot = (id, name) => ({ id, name, steps: [blankStep()] });
  const ALT_NAMES = ['Option A', 'Option B', 'Option C', 'Option D', 'Option E'];
  const ST = {
    fieldId: '', current: blankRot('cur', 'My current rotation'), alts: [], weights: {}, inputs: { yield: {}, price: {}, cost: {}, labor: {} },
    autoYield: {}, result: null, errors: [], msg: '', planId: null, openPlan: null, hist: '', storageOK: true,
  };
  function resetAlts() { ST.alts = [0, 1, 2].map((i) => blankRot('alt' + i, ALT_NAMES[i])); }
  resetAlts();

  /* ---------- storage: plans (kept) and one draft per field ---------- */
  const PLANS_KEY = 'clymait.plans.v1', DRAFT_KEY = 'clymait.planner.draft.v1';
  const store = { plans: [] };

  function normSteps(xs) {
    return (Array.isArray(xs) ? xs : []).slice(0, P.MAX_STEPS).map((s) => {
      s = s || {};
      const d = num(s.days), pm = Number.isInteger(s.plantMonth) ? s.plantMonth : 0;
      return { crop: P.STEP_CROPS.includes(s.crop) ? s.crop : '', plantMonth: pm >= 0 && pm <= 12 ? pm : 0, days: d != null && d >= 1 && d <= 730 ? d : null };
    });
  }
  function normRot(o, id, name) {
    o = o || {};
    const steps = normSteps(o.steps);
    return { id: str(o.id, 20) || id, name: str(o.name, 40) || name, steps: steps.length ? steps : [blankStep()] };
  }
  function normMap(o) {
    const out = {};
    if (o && typeof o === 'object') for (const k of Object.keys(o)) { if (P.STEP_CROPS.includes(k)) { const n = num(o[k]); if (n != null && n >= 0 && n < 1e9) out[k] = n; } }
    return out;
  }
  const normInputs = (o) => ({ yield: normMap(o && o.yield), price: normMap(o && o.price), cost: normMap(o && o.cost), labor: normMap(o && o.labor) });
  function normWeights(o) {
    const out = {};
    for (const c of P.CRITERIA) { const w = o && o[c.key]; if (Number.isInteger(w) && w >= 0 && w <= 3) out[c.key] = w; }
    return out;
  }
  function normText(o, max) { return str(o, max); }
  function normPlan(o) {
    if (!o || typeof o !== 'object') return null;
    const rots = (Array.isArray(o.rotations) ? o.rotations : []).slice(0, 6).map((r, i) => normRot(r, i ? 'alt' + (i - 1) : 'cur', i ? ALT_NAMES[i - 1] || 'Option' : 'My current rotation'));
    if (rots.length < 2) return null;
    const S = o.summary || {};
    const fb = o.feedback && typeof o.feedback === 'object' ? {
      at: str(o.feedback.at, 40), chosen: str(o.feedback.chosen, 60), useful: clamp(Math.round(num(o.feedback.useful) || 0), 0, 5),
      matched: ['yes', 'partly', 'no'].includes(o.feedback.matched) ? o.feedback.matched : '', comment: normText(o.feedback.comment, 400),
    } : null;
    const outcomes = (Array.isArray(o.outcomes) ? o.outcomes : []).slice(0, 40).map((x) => ({
      id: str(x && x.id, 20) || uid(), at: str(x && x.at, 40), season: str(x && x.season, 60), followed: str(x && x.followed, 60),
      yieldTha: num(x && x.yieldTha), incomePerHa: num(x && x.incomePerHa),
      problems: (Array.isArray(x && x.problems) ? x.problems : []).filter((p) => typeof p === 'string').slice(0, 12).map((p) => p.slice(0, 30)),
      note: normText(x && x.note, 400),
    }));
    return {
      id: str(o.id, 40) || uid(), fieldId: str(o.fieldId, 40), fieldName: str(o.fieldName, 80), saved: str(o.saved, 40) || new Date().toISOString(),
      note: str(o.note, 200), rotations: rots, weights: normWeights(o.weights), inputs: normInputs(o.inputs),
      summary: { leaderName: str(S.leaderName, 60), status: ['clear', 'narrow', 'tie', 'none'].includes(S.status) ? S.status : 'none', headline: str(S.headline, 400) },
      feedback: fb, outcomes,
    };
  }
  function loadPlans() {
    try {
      const raw = localStorage.getItem(PLANS_KEY);
      if (raw) { const o = JSON.parse(raw); if (o && Array.isArray(o.plans)) store.plans = o.plans.map(normPlan).filter(Boolean); }
    } catch (e) { ST.storageOK = false; }
  }
  function savePlans() {
    try { localStorage.setItem(PLANS_KEY, JSON.stringify({ version: 1, plans: store.plans })); ST.storageOK = true; }
    catch (e) { ST.storageOK = false; }
  }
  function saveDraft() {
    if (!ST.fieldId) return;
    try {
      const all = JSON.parse(localStorage.getItem(DRAFT_KEY) || '{}') || {};
      all[ST.fieldId] = { current: ST.current, alts: ST.alts, weights: ST.weights, inputs: ST.inputs, autoYield: ST.autoYield };
      localStorage.setItem(DRAFT_KEY, JSON.stringify(all));
    } catch (e) { /* drafts are a convenience only */ }
  }
  function loadDraft(fieldId) {
    try {
      const all = JSON.parse(localStorage.getItem(DRAFT_KEY) || '{}') || {};
      const d = all[fieldId];
      if (!d) return false;
      ST.current = normRot(d.current, 'cur', 'My current rotation');
      const alts = (Array.isArray(d.alts) ? d.alts : []).slice(0, 5).map((r, i) => normRot(r, 'alt' + i, ALT_NAMES[i]));
      while (alts.length < 3) alts.push(blankRot('alt' + alts.length, ALT_NAMES[alts.length]));
      ST.alts = alts; ST.weights = normWeights(d.weights); ST.inputs = normInputs(d.inputs); ST.autoYield = normMap(d.autoYield);
      return true;
    } catch (e) { return false; }
  }

  /* ---------- field, climate and context ---------- */
  const curField = () => (ST.fieldId ? F.get(ST.fieldId) : null);
  function quantile(arr, q) {
    const a = arr.slice().sort((x, y) => x - y), p = (a.length - 1) * q, lo = Math.floor(p), hi = Math.ceil(p);
    return a[lo] + (a[hi] - a[lo]) * (p - lo);
  }
  const DRY_Q = quantile(A.data.risk.map((r) => r.avg_longest_dry_spell_days), 0.75);

  function fieldCtx(f) {
    const snap = f.loc.cellId ? A.snapshot(f.loc.cellId) : null;
    const risk = snap ? A.data.risk.find((r) => r.state === snap.state) || null : null;
    return {
      field: f, snap, risk, rain: snap ? snap.climate.annual_rain_mm : null,
      irrigated: !!(f.irrigation.type && f.irrigation.type !== 'none'),
      standsDry: !!(risk && risk.avg_longest_dry_spell_days >= Math.max(DRY_Q, 10)),
      recordedWeeds: F.hasWeeds(f),
    };
  }

  /* ---------- form building blocks ---------- */
  let ids = 0;
  const nid = () => 'pl' + (++ids);
  function frow(text, control, hint) {
    if (!control.id) control.id = nid();
    return h('div', { class: 'frow' }, h('label', { for: control.id }, text), control, hint ? h('p', { class: 'hint' }, hint) : null);
  }
  function textInput(o, k, attrs, after) {
    const i = h('input', Object.assign({ type: 'text', autocomplete: 'off', maxlength: 40 }, attrs || {}));
    i.value = o[k] || '';
    i.addEventListener('input', () => { o[k] = i.value; touch(false); if (after) after(); });
    return i;
  }
  function numInput(o, k, attrs) {
    const i = h('input', Object.assign({ type: 'number', inputmode: 'decimal', autocomplete: 'off', min: 0 }, attrs || {}));
    i.value = o[k] == null ? '' : o[k];
    i.addEventListener('input', () => { o[k] = i.value === '' ? null : num(i.value); touch(false); });
    return i;
  }
  function selectOf(options, value, onChange, blank) {
    const s = h('select', null, blank != null ? h('option', { value: '' }, blank) : null, options.map(([v, t]) => h('option', { value: String(v) }, t)));
    s.value = value == null ? '' : String(value);
    s.addEventListener('change', () => onChange(s.value));
    return s;
  }
  const section = (title, ...kids) => h('section', { class: 'panel pl-sec' }, h('h2', { class: 'panel-title' }, title), kids);

  // Keep keyboard focus on the same control when part of the page is redrawn.
  function keepFocus(fn) {
    const id = document.activeElement && document.activeElement.id;
    fn();
    if (id) { const n = document.getElementById(id); if (n) n.focus({ preventScroll: true }); }
  }

  /* ---------- the page ---------- */
  const slots = {};
  function renderAll() {
    const names = ['field', 'current', 'build', 'priorities', 'inputs', 'compare', 'results', 'plans'];
    root.replaceChildren(
      h('section', { class: 'intro pl-intro' },
        h('h1', null, 'Compare crop rotations for a field'),
        h('p', null, 'Enter the rotation you use now, build at least three alternatives, and compare them on climate, drought, water, soil, pests, bare-field days, vulnerable seasons, income and labor. This is decision support, not a forecast.'),
        h('p', { class: 'caution' }, h('strong', null, 'Draft guidance. '), 'The rotation rules behind the soil and pest comparison come from published sources and have not yet been reviewed by an agronomist. Income and labor use only the numbers you type in.')),
      ...names.map((n) => { slots[n] = h('div', { class: 'pl-slot', id: 'pl-slot-' + n }); return slots[n]; })
    );
    renderField(); renderCurrent(); renderBuild(); renderPriorities(); renderInputs(); renderCompare(); renderResults(); renderPlans();
  }

  /* 1. Field */
  function renderField() {
    const fields = F.list();
    const f = curField();
    const kids = [];
    if (!fields.length) {
      kids.push(h('p', { class: 'muted' }, 'You have no saved fields yet. Add a field first: the planner uses its location, soil, drainage and crop history.'));
      const b = h('button', { type: 'button', class: 'btn primary' }, 'Go to My fields');
      b.addEventListener('click', () => A.setView('fields'));
      kids.push(h('div', { class: 'btn-row' }, b));
    } else {
      const sel = selectOf(fields.map((x) => [x.id, x.name + (x.farmer ? ' – ' + x.farmer : '')]), ST.fieldId, (v) => chooseField(v), 'Choose a field…');
      sel.id = 'pl-field';
      kids.push(frow('Which field are you planning?', sel));
      if (f) {
        const ctx = fieldCtx(f);
        const bits = [];
        bits.push(ctx.snap ? ctx.snap.state + ' · about ' + fmt0(ctx.rain) + ' mm of rain a year in its map square' : 'No location recorded, so climate and rainfall checks are skipped');
        if (f.drainage && f.drainage !== 'unknown') bits.push('drainage: ' + f.drainage);
        if (f.soil.texture && f.soil.texture !== 'unknown') bits.push('soil: ' + f.soil.texture.replace('_', ' '));
        if (f.soil.ph != null) bits.push('pH ' + f.soil.ph);
        bits.push(ctx.irrigated ? 'irrigation recorded' : 'rain only');
        kids.push(h('p', { class: 'hint' }, bits.join(' · ')));
        if (ctx.risk) {
          const lvl = { higher: 'Higher', medium: 'Medium', lower: 'Lower' }[ctx.risk.risk_level];
          kids.push(h('p', null, h('span', { class: 'badge ' + ctx.risk.risk_level }, lvl + ' climate risk'), ' ',
            h('span', { class: 'rank-note' }, 'Drought in about ' + fmt0(ctx.risk.drought_years_pct_1981_2024) + '% of years since 1981 (state level).')));
          if (ctx.risk.drought_years_pct_recent >= 35) kids.push(h('p', { class: 'caution' }, 'The recent drought figure for ' + ctx.snap.state + ' looks unusually high and is unverified. Treat that part with caution.'));
        }
      }
    }
    slots.field.replaceChildren(section('1. Choose a field', ...kids));
  }

  function chooseField(id) {
    if (ST.fieldId) saveDraft();
    ST.fieldId = id; ST.result = null; ST.errors = []; ST.msg = ''; ST.planId = null; ST.hist = '';
    ST.current = blankRot('cur', 'My current rotation'); resetAlts(); ST.weights = {}; ST.inputs = { yield: {}, price: {}, cost: {}, labor: {} }; ST.autoYield = {};
    const f = curField();
    if (f) {
      if (!loadDraft(id)) useHistory(true);
      fillYields();
    }
    renderAll();
  }

  /* 2. Current rotation */
  function useHistory(quiet) {
    const f = curField(); if (!f) return;
    const hs = F.historySteps(f);
    if (!hs.steps.length) { if (!quiet) ST.hist = 'No dated crops from the planner’s seven choices were found in this field’s history.'; return; }
    ST.current.steps = hs.steps.map((s) => ({ crop: s.crop, plantMonth: s.plantMonth, days: s.days }));
    ST.hist = 'Filled in from your crop history (oldest first, last ' + hs.steps.length + '). Check the months and days.' + (hs.skipped ? ' ' + hs.skipped + ' crop' + (hs.skipped === 1 ? '' : 's') + ' not in the planner’s list (such as sorghum or millet) ' + (hs.skipped === 1 ? 'was' : 'were') + ' left out.' : '');
  }

  function renderCurrent() {
    const f = curField();
    const kids = [h('p', { class: 'hint' }, 'List the crops in the order you grow them, and when you plant each one. The pattern repeats after the last crop. Fallow is allowed after the first step.')];
    if (!f) { slots.current.replaceChildren(section('2. Your current rotation', h('p', { class: 'muted' }, 'Choose a field first.'))); return; }
    const hb = h('button', { type: 'button', class: 'btn small' }, 'Fill in from my crop history');
    hb.addEventListener('click', () => { useHistory(false); touch(true); });
    kids.push(h('div', { class: 'btn-row' }, hb));
    if (ST.hist) kids.push(h('p', { class: 'hint', role: 'status' }, ST.hist));
    kids.push(rotationEditor(ST.current, 'cur', false));
    slots.current.replaceChildren(section('2. Your current rotation', ...kids));
  }

  /* 3. Builder */
  function renderBuild() {
    const f = curField();
    if (!f) { slots.build.replaceChildren(section('3. Alternative rotations', h('p', { class: 'muted' }, 'Choose a field first.'))); return; }
    const kids = [h('p', { class: 'hint' }, 'Build at least three alternatives to compare with your current rotation. You can add up to five.')];
    const sg = h('button', { type: 'button', class: 'btn' }, 'Suggest three alternatives from the rules');
    sg.addEventListener('click', () => suggestAlts());
    kids.push(h('div', { class: 'btn-row' }, sg));
    kids.push(h('p', { class: 'hint' }, 'Suggestions use the sourced rules (a good crop change, no repeat of the same crop) and skip crops the climate scores very low here. Planting months are placeholders: set them to your own calendar.'));
    ST.alts.forEach((rot, i) => {
      const box = h('div', { class: 'rot-box' });
      const head = h('div', { class: 'rot-box-head' }, h('h3', null, rot.name || ALT_NAMES[i]));
      if (ST.alts.length > 3) {
        const rm = h('button', { type: 'button', class: 'btn small danger' }, 'Remove');
        rm.setAttribute('aria-label', 'Remove ' + (rot.name || ALT_NAMES[i]));
        rm.addEventListener('click', () => { ST.alts.splice(i, 1); touch(true); });
        head.append(rm);
      }
      box.append(head, rotationEditor(rot, 'alt' + i, true));
      kids.push(box);
    });
    if (ST.alts.length < 5) {
      const add = h('button', { type: 'button', class: 'btn' }, 'Add another alternative');
      add.addEventListener('click', () => { const n = ST.alts.length; ST.alts.push(blankRot('alt' + n + '_' + Date.now().toString(36), ALT_NAMES[n])); touch(true); });
      kids.push(h('div', { class: 'btn-row' }, add));
    }
    slots.build.replaceChildren(section('3. Alternative rotations', ...kids));
  }

  function suggestAlts() {
    const f = curField(); if (!f) return;
    const hasWork = ST.alts.some((r) => r.steps.some((s) => s.crop));
    if (hasWork && !window.confirm('Replace your alternatives with suggestions?')) return;
    const curSteps = fillSteps(ST.current.steps);
    const sg = P.suggest(fieldCtx(f), curSteps.filter((s) => s.crop), 3);
    ST.alts = [0, 1, 2].map((i) => (sg[i] ? { id: 'alt' + i, name: ALT_NAMES[i], steps: sg[i].map((s) => Object.assign({}, s)) } : blankRot('alt' + i, ALT_NAMES[i])));
    ST.msg = sg.length < 3
      ? 'Only ' + sg.length + ' suggestion' + (sg.length === 1 ? '' : 's') + ' fit the rules, the climate and your soil. Build the rest yourself.'
      : 'Suggested from the rules. Planting months are placeholders: check them.';
    touch(true);
  }

  function fillSteps(steps) {
    return steps.map((s) => ({ crop: s.crop, plantMonth: s.plantMonth, days: s.days == null && FACTS[s.crop] ? FACTS[s.crop].days : s.days }));
  }

  function rotationEditor(rot, key, isAlt) {
    const wrap = h('div', { class: 'rot-editor' });
    const nm = h('input', { type: 'text', maxlength: 40, autocomplete: 'off', id: 'pl-' + key + '-name' });
    nm.value = rot.name;
    nm.addEventListener('input', () => { rot.name = nm.value; touch(false); });
    wrap.append(frow('Name of this rotation', nm));

    rot.steps.forEach((s, i) => {
      const box = h('fieldset', { class: 'step-box' }, h('legend', null, 'Step ' + (i + 1)));
      const crop = selectOf(P.STEP_CROPS.filter((c) => i > 0 || c !== 'fallow').map((c) => [c, cname(c)]), s.crop, (v) => {
        s.crop = v;
        if (v) { s.days = FACTS[v].days; s.plantMonth = i === 0 ? (FACTS[v].plantMonth || 6) : FACTS[v].plantMonth; }
        touch(true);
      }, 'Choose a crop…');
      crop.id = 'pl-' + key + '-s' + i + '-crop';
      const months = MONTHS.map((m, k) => [k + 1, m]);
      const pm = selectOf(i === 0 ? months : [[0, 'Right after the previous step']].concat(months), s.plantMonth, (v) => { s.plantMonth = Number(v); touch(false); updateSummaries(); });
      pm.id = 'pl-' + key + '-s' + i + '-month';
      const days = h('input', { type: 'number', inputmode: 'numeric', min: 1, max: 730, step: 1, autocomplete: 'off', id: 'pl-' + key + '-s' + i + '-days' });
      days.value = s.days == null ? '' : s.days;
      days.addEventListener('input', () => { s.days = days.value === '' ? null : num(days.value); touch(false); updateSummaries(); });
      const fact = s.crop ? FACTS[s.crop] : null;
      box.append(h('div', { class: 'inline' },
        frow('Crop', crop),
        frow(i === 0 ? 'Planting month' : 'Planted', pm),
        frow('Days in the field', days, fact ? 'Sources: ' + fact.range : null)));
      if (rot.steps.length > 1) {
        const rm = h('button', { type: 'button', class: 'btn small danger' }, 'Remove step ' + (i + 1));
        rm.addEventListener('click', () => { rot.steps.splice(i, 1); touch(true); });
        box.append(h('div', { class: 'btn-row' }, rm));
      }
      wrap.append(box);
    });
    if (rot.steps.length < P.MAX_STEPS) {
      const add = h('button', { type: 'button', class: 'btn small' }, 'Add a step');
      add.addEventListener('click', () => { rot.steps.push({ crop: '', plantMonth: 0, days: null }); touch(true); });
      wrap.append(h('div', { class: 'btn-row' }, add));
    }
    const sum = h('p', { class: 'hint rot-summary', 'data-rot': key, role: 'status' });
    wrap.append(sum);
    sumNodes.set(sum, rot);
    summarise(sum, rot);
    return wrap;
  }

  const sumNodes = new Map();
  function summarise(node, rot) {
    const steps = fillSteps(rot.steps);
    if (steps.some((s) => !s.crop)) { node.textContent = 'Choose a crop for every step.'; return; }
    const errs = P.validateRotation({ steps });
    if (errs.length) { node.textContent = errs[0]; return; }
    const tl = P.timeline(steps);
    const per = 365 / tl.cycleDays;
    node.textContent = 'Repeats every ' + (tl.cycleDays / 365 < 1.05 ? 'year' : fmt1(tl.cycleDays / 365) + ' years') + ' · about ' + fmt0(tl.bareDays * per) + ' bare-field days a year.';
  }
  function updateSummaries() { sumNodes.forEach((rot, node) => { if (node.isConnected) summarise(node, rot); }); }

  // Something changed. structural = redraw the editors too. Any change clears the old comparison.
  function touch(structural) {
    ST.result = null; ST.errors = []; ST.planId = structural ? ST.planId : ST.planId;
    saveDraft();
    if (structural) keepFocus(() => { sumNodes.clear(); renderCurrent(); renderBuild(); renderInputs(); renderCompare(); renderResults(); });
    else { renderResults(); updateCompareState(); }
  }

  /* 4. Priorities */
  function renderPriorities() {
    if (!curField()) { slots.priorities.replaceChildren(); return; }
    const rows = P.CRITERIA.map((c) => {
      const sel = selectOf(LEVELS, ST.weights[c.key] == null ? P.DEFAULT_WEIGHT : ST.weights[c.key], (v) => { ST.weights[c.key] = Number(v); touch(false); });
      sel.id = 'pl-w-' + c.key;
      return frow(c.label, sel, CRIT_HELP[c.key]);
    });
    slots.priorities.replaceChildren(section('4. What matters most to you',
      h('p', { class: 'hint' }, 'The overall comparison counts a criterion in proportion to how important you say it is. Marking one “Not important” leaves it out.'),
      h('div', { class: 'inline' }, rows)));
  }

  /* 5. Money and work */
  function usedCrops() {
    const set = new Set();
    [ST.current, ...ST.alts].forEach((r) => r.steps.forEach((s) => { if (s.crop && s.crop !== 'fallow') set.add(s.crop); }));
    return P.CROPS.filter((c) => set.has(c));
  }
  function fillYields() {
    const f = curField(); if (!f) return;
    const y = F.yields(f);
    for (const k of Object.keys(y)) if (ST.inputs.yield[k] == null && P.CROPS.includes(k)) { ST.inputs.yield[k] = y[k]; ST.autoYield[k] = y[k]; }
  }
  function renderInputs() {
    if (!curField()) { slots.inputs.replaceChildren(); return; }
    fillYields();
    const crops = usedCrops();
    const kids = [h('p', { class: 'hint' }, 'Optional. Income and labor are compared only if you fill in every crop in every rotation. The app has no price, cost or yield data of its own, so it never fills these in. Leave blank if you do not know.')];
    if (!crops.length) kids.push(h('p', { class: 'muted' }, 'Choose crops above to enter their numbers here.'));
    crops.forEach((c) => {
      const I = ST.inputs;
      const mk = (group, label, hint, attrs) => {
        const i = h('input', Object.assign({ type: 'number', inputmode: 'decimal', min: 0, step: 'any', autocomplete: 'off' }, attrs || {}));
        i.value = I[group][c] == null ? '' : I[group][c];
        i.addEventListener('input', () => { I[group][c] = i.value === '' ? null : num(i.value); if (group === 'yield') delete ST.autoYield[c]; touch(false); });
        return frow(label, i, hint);
      };
      kids.push(h('fieldset', { class: 'step-box' }, h('legend', null, cname(c)),
        h('div', { class: 'inline' },
          mk('yield', 'Yield (tonnes per ha)', ST.autoYield[c] != null && I.yield[c] === ST.autoYield[c] ? 'Average of your own records' : null),
          mk('price', 'Price (₦ per kg)'),
          mk('cost', 'Cost (₦ per ha, one crop cycle)', 'Seed, fertilizer, labor hired, transport'),
          mk('labor', 'Work (person-days per ha, one crop cycle)'))));
    });
    slots.inputs.replaceChildren(section('5. Money and work (your numbers)', ...kids));
  }

  /* 6. Compare button */
  function renderCompare() {
    if (!curField()) { slots.compare.replaceChildren(); return; }
    const b = h('button', { type: 'button', class: 'btn primary', id: 'pl-compare' }, 'Compare these rotations');
    b.addEventListener('click', runCompare);
    const holder = h('div', { id: 'pl-errors', role: 'alert' });
    slots.compare.replaceChildren(h('section', { class: 'panel pl-sec' }, ST.msg ? h('p', { class: 'hint', role: 'status' }, ST.msg) : null, holder, h('div', { class: 'btn-row' }, b)));
    showErrors();
  }
  function updateCompareState() { showErrors(); }
  function showErrors() {
    const holder = document.getElementById('pl-errors'); if (!holder) return;
    if (!ST.errors.length) { holder.replaceChildren(); return; }
    holder.replaceChildren(h('div', { class: 'errors' }, h('strong', null, 'Please fix these first:'), h('ul', null, ST.errors.map((e) => h('li', null, e)))));
  }

  function rotationsForRun() {
    const all = [ST.current, ...ST.alts];
    return all.map((r, i) => ({ id: r.id, name: (r.name || '').trim() || (i === 0 ? 'My current rotation' : ALT_NAMES[i - 1]), steps: fillSteps(r.steps) }));
  }
  function validateAll(rots) {
    const errs = [];
    if (ST.alts.length < 3) errs.push('Build at least three alternatives.');
    rots.forEach((r, i) => {
      if (r.steps.some((s) => !s.crop)) { errs.push(r.name + ': choose a crop for every step.'); return; }
      P.validateRotation({ steps: r.steps }).forEach((e) => errs.push(r.name + ': ' + e));
    });
    const names = rots.map((r) => r.name.toLowerCase());
    if (new Set(names).size !== names.length) errs.push('Give each rotation a different name.');
    // identical to the current rotation, or to each other, would make the comparison pointless
    const keys = rots.map((r) => (r.steps.every((s) => s.crop) ? P.canonicalKey(r.steps.map((s) => s.crop)) : null));
    keys.forEach((k, i) => { if (k && keys.indexOf(k) !== i) errs.push(rots[i].name + ' uses the same crops in the same order as ' + rots[keys.indexOf(k)].name + '.'); });
    return errs;
  }

  function runCompare() {
    const f = curField(); if (!f) return;
    const rots = rotationsForRun();
    ST.errors = validateAll(rots);
    showErrors();
    if (ST.errors.length) { const e = document.getElementById('pl-errors'); if (e) e.scrollIntoView({ block: 'center' }); return; }
    const ctx = Object.assign(fieldCtx(f), { rotations: rots, weights: ST.weights, inputs: ST.inputs });
    ST.result = { data: P.compare(ctx), ctx, rots };
    renderResults();
    const r = document.getElementById('pl-results-top'); if (r) { r.scrollIntoView({ block: 'start' }); r.focus({ preventScroll: true }); }
  }

  /* ---------- results ---------- */
  const CHIP = { ahead: ['▲ Ahead', 'ahead'], behind: ['▼ Behind', 'behind'], similar: ['● Similar', 'similar'], none: ['', 'none'] };
  const chip = (s) => (s === 'none' ? null : h('span', { class: 'chip ' + CHIP[s][1] }, CHIP[s][0]));
  const lvlWord = (w) => LEVELS.find((l) => l[0] === w)[1];

  function renderResults() {
    if (!ST.result) {
      slots.results.replaceChildren(curField() ? h('section', { class: 'panel pl-sec pl-wait' }, h('p', { class: 'muted' }, 'Results appear here after you press “Compare these rotations”. Changing anything above clears them.')) : '');
      return;
    }
    const { data, ctx } = ST.result;
    const nameOf = (id) => data.rotations.find((r) => r.id === id).name;
    slots.results.replaceChildren(
      h('h2', { class: 'pl-results-h', id: 'pl-results-top', tabindex: '-1' }, 'Results'),
      explanationPanel(data, nameOf),
      comparisonTable(data, ctx),
      soilCard(data, ctx),
      waterCard(data, ctx),
      pestCard(data),
      calendarCard(data),
      vulnerableCard(data, ctx),
      incomeCard(data, ctx),
      saveCard(data)
    );
  }

  function explanationPanel(data, nameOf) {
    const ex = data.explanation;
    const kids = [h('h3', null, 'Why this comparison comes out this way'), h('p', { class: 'verdict' }, ex.headline)];
    const list = (title, items, cls) => items.length ? [h('h4', null, title), h('ul', { class: 'how-list ' + (cls || '') }, items.map((x) => h('li', null, h('strong', null, x.label + ' '), h('span', { class: 'muted' }, '(' + lvlWord(x.weight).toLowerCase() + ') '), x.text)))] : [];
    if (ex.leaderId) {
      const lead = nameOf(ex.leaderId);
      kids.push(...list('Where ' + lead + ' is ahead of ' + ex.runnerName + ' (the next closest)', ex.reasons));
      kids.push(...list('Where ' + lead + ' is behind ' + ex.runnerName, ex.against));
      if (ex.vsCurrent.length) {
        kids.push(h('h4', null, 'Compared with your current rotation'));
        kids.push(h('ul', { class: 'how-list' }, ex.vsCurrent.map((x) => h('li', null, h('strong', null, x.label + ': '), h('span', { class: 'chip ' + (x.better ? 'ahead' : 'behind') }, x.better ? 'better' : 'worse'), ' ', x.text))));
      }
    }
    if (ex.notCounted.length) {
      kids.push(h('h4', null, 'Not counted in the comparison'));
      kids.push(h('ul', { class: 'how-list' }, ex.notCounted.map((x) => h('li', null, h('strong', null, x.label + ': '), x.reason))));
    }
    kids.push(h('details', { class: 'rot-detail', open: true }, h('summary', null, 'Limits of this comparison'), h('ul', { class: 'how-list' }, ex.caveats.map((c) => h('li', null, c)))));
    kids.push(h('p', { class: 'hint' }, 'The “overall” result is a tally of where each rotation is ahead or behind on the things you marked important. It is not a 0–100 resilience score, because no source supports one.'));
    return h('article', { class: 'card pl-card', id: 'pl-explain' }, ...kids);
  }

  function comparisonTable(data, ctx) {
    const rots = data.rotations;
    const head = h('tr', null, h('th', { scope: 'col' }, 'Compare'), rots.map((r, i) => h('th', { scope: 'col' }, r.name, i === 0 ? h('span', { class: 'tag now' }, 'current') : null)));
    const body = data.criteria.map((c) => h('tr', { class: c.counted ? '' : 'skip' },
      h('th', { scope: 'row' }, c.label, h('span', { class: 'hint' }, ' ' + (c.counted ? lvlWord(c.weight) + ' · ' + (c.better === 'higher' ? 'higher is better' : 'lower is better') : 'not counted'))),
      c.cells.map((x) => h('td', null, h('span', { class: 'cell-text' }, x.text), ' ', chip(x.standing)))));
    const lead = data.ranked[0];
    const overall = h('tr', { class: 'overall' }, h('th', { scope: 'row' }, 'Overall standing', h('span', { class: 'hint' }, ' a tally, not a score')),
      data.rotations.map((r, i) => {
        const o = data.overall[i];
        const isLead = o.id === lead.id && data.explanation.status !== 'tie';
        return h('td', null, h('strong', null, 'Rank ' + o.rank), h('span', { class: 'cell-text' }, ' · ahead on ' + o.ahead + ', behind on ' + o.behind), isLead ? h('span', { class: 'chip ahead' }, ' ★ top') : null);
      }));
    return h('article', { class: 'card pl-card' }, h('h3', null, 'Rotation comparison'),
      h('div', { class: 'table-wrap' }, h('table', { class: 'pl-table' }, h('thead', null, head), h('tbody', null, body, overall))),
      h('p', { class: 'hint' }, 'Ahead, behind and similar compare each rotation with the others. Small differences count as similar.'));
  }

  function soilCard(data, ctx) {
    const f = ctx.field;
    const kids = [h('h3', null, 'Soil-health indicators'),
      h('p', { class: 'hint' }, 'The trend comes from the sourced rotation rules for each crop change, including the change from the last crop back to the first. It is not measured soil data.')];
    data.rotations.forEach((r) => {
      kids.push(h('h4', null, r.name, ' ', h('span', { class: 'chip ' + (r.soil.label === 'improving' ? 'ahead' : r.soil.label === 'declining' ? 'behind' : 'similar') }, r.soil.label)));
      kids.push(h('ul', { class: 'how-list' }, r.soil.pairs.map((p) => {
        const t = p.tier === 'good' ? 'good fit' : p.tier === 'avoid' ? 'avoid' : p.tier === 'practice' ? 'practice or single-site evidence' : p.tier === 'mixed' ? 'mixed evidence' : 'no rule found';
        return h('li', null, h('strong', null, cname(p.from) + ' → ' + cname(p.to) + (p.wrap ? ' (next cycle)' : '') + ': '), t,
          p.rules.length ? h('span', { class: 'hint' }, ' · rule ' + p.rules.map((x) => x.id).join(', ') + (p.rules.some((x) => x.review) ? ' (awaiting agronomist review)' : '')) : null);
      })));
    });
    // site checks per crop, from the draft's crop needs
    const seen = new Set(), warn = [];
    data.rotations.forEach((r) => r.steps.forEach((s) => {
      if (s.crop === 'fallow' || seen.has(s.crop)) return;
      seen.add(s.crop);
      RE.checksFor(s.crop, f, ctx.snap, {}).filter((c) => c.level === 'warn').forEach((c) => warn.push(h('li', null, h('strong', null, cname(s.crop) + ': '), c.text)));
    }));
    kids.push(h('h4', null, 'Your soil and drainage against crop needs'));
    kids.push(warn.length ? h('ul', { class: 'how-list' }, warn) : h('p', { class: 'muted' }, 'No conflict found with what you recorded for soil texture, pH and drainage. Anything left blank was not checked.'));
    return h('article', { class: 'card pl-card' }, ...kids);
  }

  function waterCard(data, ctx) {
    const kids = [h('h3', null, 'Water-use comparison'),
      h('p', { class: 'hint' }, ctx.rain == null ? 'This field has no location, so rainfall could not be compared.' : 'Your map square gets about ' + fmt0(ctx.rain) + ' mm of rain a year. The ranges below come from crop guides and are not checked for Nigeria. The app does not estimate liters of water.' + (ctx.irrigated ? ' You recorded irrigation, which is not counted here.' : ''))];
    data.rotations.forEach((r) => {
      kids.push(h('h4', null, r.name));
      kids.push(h('div', { class: 'table-wrap' }, h('table', { class: 'pl-table small' },
        h('thead', null, h('tr', null, ['Crop', 'Days in field', 'Rainfall range in the sources', 'Fits here?'].map((t) => h('th', { scope: 'col' }, t)))),
        h('tbody', null, r.water.rows.length ? r.water.rows.map((w) => h('tr', null, h('td', null, cname(w.crop)), h('td', null, fmt0(w.days)), h('td', null, w.text),
          h('td', null, w.fit == null ? 'unknown' : w.fit === 1 ? '✓ yes' : w.fit === 0.5 ? '◐ partly (below the best range)' : '⚠ no'))) : h('tr', null, h('td', { colspan: 4 }, 'No crop in this rotation.'))))));
    });
    return h('article', { class: 'card pl-card' }, ...kids);
  }

  function pestCard(data) {
    const kids = [h('h3', null, 'Pest-cycle interruption'),
      h('p', { class: 'hint' }, 'The sources name pest or weed benefits for only a few crop changes. “None found” means no source was found, not that there is no benefit.')];
    data.rotations.forEach((r) => {
      kids.push(h('h4', null, r.name));
      const items = [];
      r.pest.interrupts.forEach((x) => items.push(h('li', null, h('span', { class: 'chip ahead' }, 'interrupts'), ' ' + x.what + ' (' + cname(x.from) + ' → ' + cname(x.to) + ', rule ' + x.rule + ')')));
      r.pest.repeats.forEach((x) => items.push(h('li', null, h('span', { class: 'chip behind' }, 'repeats'), ' ' + cname(x.crop) + ' after itself: the guide lists rotation against ' + x.what + ' (rule ' + x.rule + '). It gives no minimum break.')));
      r.pest.unsourcedRepeats.forEach((c) => items.push(h('li', null, h('span', { class: 'chip similar' }, 'repeats'), ' ' + cname(c) + ' after itself. No pest rule was found for it.')));
      kids.push(items.length ? h('ul', { class: 'how-list' }, items) : h('p', { class: 'muted' }, 'No sourced pest interruption found.'));
      r.notes.forEach((n) => kids.push(h('p', { class: 'rot-note' }, n)));
    });
    return h('article', { class: 'card pl-card' }, ...kids);
  }

  const CAL_CLASS = { rice: 'c-rice', cassava: 'c-cassava', yam: 'c-yam', maize: 'c-maize', cowpea: 'c-cowpea', groundnut: 'c-groundnut', fallow: 'c-fallow' };
  function calendarCard(data) {
    const kids = [h('h3', null, 'Bare-field calendar'),
      h('p', { class: 'hint' }, 'Each box is one month, starting from the first planting month. Hatched boxes have no crop. Fallow is shown separately: land left to bush has plant cover, but if it is cleared and left empty, count it as bare. Dates use the months and days you entered.')];
    const used = new Set();
    data.rotations.forEach((r) => {
      kids.push(h('h4', null, r.name, ' ', h('span', { class: 'hint' }, fmt0(r.bare.perYear) + ' bare days a year' + (r.bare.fallowPerYear > 0.5 ? ' + ' + fmt0(r.bare.fallowPerYear) + ' fallow' : ''))));
      const grid = h('div', { class: 'cal', 'aria-hidden': 'true' });
      r.grid.forEach((c) => {
        if (c.crop) used.add(c.crop);
        grid.append(h('div', { class: 'cal-cell ' + (c.state === 'bare' ? 'bare' : CAL_CLASS[c.crop]) }, h('span', { class: 'm' }, MONTHS[c.month - 1]), h('span', { class: 'k' }, c.crop ? FACTS[c.crop].short : '')));
      });
      kids.push(grid);
      const tl = r.timeline;
      const lines = tl.steps.map((s) => cname(s.crop) + ': ' + dayLabel(s.start) + ' to ' + dayLabel(s.end) + ' (' + fmt0(s.days) + ' days)');
      tl.gaps.forEach((g) => lines.push('No crop: ' + dayLabel(g.from) + ' to ' + dayLabel(g.to) + ' (about ' + fmt0(g.days) + ' days' + (g.wrap ? ', before the next cycle starts' : '') + ')'));
      kids.push(h('ul', { class: 'how-list cal-list' }, lines.map((l) => h('li', null, l))));
    });
    kids.push(h('div', { class: 'cal-legend', 'aria-hidden': 'true' }, [...used].map((c) => h('span', { class: 'cal-key' }, h('i', { class: 'cal-cell ' + CAL_CLASS[c] }, FACTS[c].short), ' ' + cname(c))), h('span', { class: 'cal-key' }, h('i', { class: 'cal-cell bare' }), ' No crop')));
    return h('article', { class: 'card pl-card' }, ...kids);
  }

  function vulnerableCard(data, ctx) {
    const kids = [h('h3', null, 'Vulnerable-season warnings'),
      h('p', { class: 'hint' }, 'The app’s rainfall data covers the rainy season, May to October, so November to April counts as the dry season. The app has no monthly rainfall yet, so it cannot say when rains start or stop in your area.')];
    if (ctx.risk) kids.push(h('p', null, 'Measured for ' + ctx.snap.state + ': typical longest dry spell in the rainy season about ' + fmt0(ctx.risk.avg_longest_dry_spell_days) + ' days; drought in about ' + fmt0(ctx.risk.drought_years_pct_1981_2024) + '% of years since 1981. These are the same for every rotation.'));
    data.rotations.forEach((r) => {
      kids.push(h('h4', null, r.name, ' ', h('span', { class: 'hint' }, fmt0(r.vulnerable.exposedPerYear) + ' exposed dry-season days a year')));
      const w = r.vulnerable.warnings;
      kids.push(w.length ? h('ul', { class: 'how-list' }, w.map((x) => h('li', { class: x.level }, h('span', { 'aria-hidden': 'true' }, x.level === 'warn' ? '⚠ ' : 'ℹ '), h('span', { class: 'sr' }, x.level === 'warn' ? 'Warning: ' : 'Note: '), x.text)))
        : h('p', { class: 'muted' }, 'No dry-season or flowering warnings from the data we have.'));
    });
    return h('article', { class: 'card pl-card' }, ...kids);
  }

  function incomeCard(data, ctx) {
    const kids = [h('h3', null, 'Income and labor comparison'), h('p', { class: 'hint' }, 'Only your own numbers are used. These are not forecasts.')];
    const inc = data.criteria.find((c) => c.key === 'income'), lab = data.criteria.find((c) => c.key === 'labor');
    const miss = new Set();
    data.rotations.forEach((r) => { r.income.missing.forEach((m) => miss.add(m)); r.labor.missing.forEach((m) => miss.add(m)); });
    const haveI = data.rotations.every((r) => r.income.perYear != null), haveL = data.rotations.every((r) => r.labor.perYear != null);
    const area = ctx.field.size.value != null ? (ctx.field.size.unit === 'acres' ? ctx.field.size.value * 0.404686 : ctx.field.size.value) : null;
    if (haveI) {
      const max = Math.max(...data.rotations.map((r) => Math.abs(r.income.perYear)), 1);
      kids.push(h('h4', null, 'Money left after costs, per hectare a year'));
      kids.push(h('ul', { class: 'bars' }, data.rotations.map((r, i) => h('li', null,
        h('div', { class: 'bar-row' }, h('span', null, r.name), h('b', null, NAIRA(r.income.perYear))),
        h('div', { class: 'bar2', role: 'img', 'aria-label': r.name + ': ' + NAIRA(r.income.perYear) }, h('span', { class: r.income.perYear < 0 ? 'neg' : '', style: 'width:' + Math.max(2, Math.abs(r.income.perYear) / max * 100) + '%' })),
        h('div', { class: 'hint' }, 'Sales ' + NAIRA(r.income.revenuePerYear) + ' − costs ' + NAIRA(r.income.costPerYear) + (area ? ' · about ' + NAIRA(r.income.perYear * area) + ' for your ' + fmt1(area) + ' ha' : ''))))));
    }
    if (haveL) {
      kids.push(h('h4', null, 'Work, person-days per hectare a year'));
      kids.push(h('ul', { class: 'how-list' }, data.rotations.map((r) => h('li', null, h('strong', null, r.name + ': '), fmt0(r.labor.perYear) + ' person-days'))));
    }
    if (!haveI || !haveL) {
      kids.push(h('p', { class: 'caution' }, 'Not compared yet. Fill in ' + (!haveI && !haveL ? 'yield, price, cost and work' : !haveI ? 'yield, price and cost' : 'work') + ' for: ' + [...miss].map(cname).join(', ') + ' (section 5).'));
    }
    return h('article', { class: 'card pl-card' }, ...kids);
  }

  /* ---------- save a plan ---------- */
  function saveCard(data) {
    const note = h('input', { type: 'text', maxlength: 200, autocomplete: 'off', id: 'pl-save-note' });
    const sv = h('button', { type: 'button', class: 'btn primary' }, ST.planId ? 'Save as a new plan' : 'Save this plan');
    sv.addEventListener('click', () => commitPlan(note.value, null));
    const kids = [h('h3', null, 'Save your plan'), h('p', { class: 'hint' }, 'Saved on this device only. After the season, come back to give feedback and record what happened.'), frow('A note for yourself (optional)', note)];
    const row = [sv];
    if (ST.planId && store.plans.some((p) => p.id === ST.planId)) {
      const up = h('button', { type: 'button', class: 'btn' }, 'Update the saved plan');
      up.addEventListener('click', () => commitPlan(note.value, ST.planId));
      row.push(up);
    }
    kids.push(h('div', { class: 'btn-row' }, row));
    return h('article', { class: 'card pl-card' }, ...kids);
  }

  function commitPlan(note, updateId) {
    const f = curField(); if (!f || !ST.result) return;
    const { data, rots } = ST.result;
    const ex = data.explanation;
    const lead = ex.leaderId ? data.rotations.find((r) => r.id === ex.leaderId).name : '';
    const plan = normPlan({
      id: updateId || uid(), fieldId: f.id, fieldName: f.name, saved: new Date().toISOString(), note,
      rotations: rots.map((r, i) => ({ id: r.id, name: r.name, steps: i === 0 ? ST.current.steps : ST.alts[i - 1].steps })),
      weights: ST.weights, inputs: ST.inputs, summary: { leaderName: lead, status: ex.status, headline: ex.headline },
    });
    // keep full step data (days filled in) so a reopened plan matches what was compared
    plan.rotations = rots.map((r) => ({ id: r.id, name: r.name, steps: r.steps.map((s) => ({ crop: s.crop, plantMonth: s.plantMonth, days: s.days })) }));
    if (updateId) {
      const old = store.plans.find((p) => p.id === updateId);
      if (old) { plan.feedback = old.feedback; plan.outcomes = old.outcomes; store.plans[store.plans.indexOf(old)] = plan; } else store.plans.unshift(plan);
    } else store.plans.unshift(plan);
    ST.planId = plan.id; ST.openPlan = plan.id;
    savePlans();
    ST.msg = ST.storageOK ? 'Plan saved on this device. Scroll down to give feedback.' : 'This browser would not let the plan be saved. Use “Download plans” to keep a copy.';
    renderCompare(); renderResults(); renderPlans();
    const p = document.getElementById('pl-plan-' + plan.id); if (p) p.scrollIntoView({ block: 'center' });
  }

  /* ---------- saved plans, feedback and outcomes ---------- */
  function renderPlans() {
    const f = curField();
    const mine = f ? store.plans.filter((p) => p.fieldId === f.id) : store.plans;
    const kids = [];
    if (!ST.storageOK) kids.push(h('p', { class: 'caution' }, 'This browser is not keeping saved plans. Download a copy to be safe.'));
    if (!mine.length) kids.push(h('p', { class: 'muted' }, f ? 'No saved plans for this field yet.' : 'No saved plans on this device yet. If you have a backup file, you can restore it below.'));
    mine.forEach((p) => kids.push(planItem(p, !f)));
    kids.push(h('div', { class: 'btn-row' }, exportButtons()));
    slots.plans.replaceChildren(section('Saved plans, feedback and results', ...kids));
  }

  function planItem(p, showField) {
    const d = new Date(p.saved);
    const when = isNaN(d) ? '' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    const open = ST.openPlan === p.id;
    const box = h('details', { class: 'plan-item', id: 'pl-plan-' + p.id },
      h('summary', null, h('strong', null, 'Plan of ' + when), showField && p.fieldName ? ' \u00B7 ' + p.fieldName : '', p.note ? ' – ' + p.note : '', p.feedback ? h('span', { class: 'chip ahead' }, 'feedback given') : null, p.outcomes.length ? h('span', { class: 'chip similar' }, p.outcomes.length + ' result' + (p.outcomes.length === 1 ? '' : 's')) : null));
    if (open) box.open = true;
    box.addEventListener('toggle', () => { if (box.open) ST.openPlan = p.id; });
    box.append(
      h('p', null, p.summary.headline || 'No summary recorded.'),
      h('p', { class: 'hint' }, 'Compared: ' + p.rotations.map((r) => r.name).join(', ') + '.')
    );
    const reopen = h('button', { type: 'button', class: 'btn small' }, 'Open this plan again');
    reopen.addEventListener('click', () => openPlan(p.id));
    const del = h('button', { type: 'button', class: 'btn small danger' }, 'Delete');
    del.addEventListener('click', () => { if (window.confirm('Delete this saved plan, with its feedback and results?')) { store.plans = store.plans.filter((x) => x.id !== p.id); if (ST.planId === p.id) ST.planId = null; savePlans(); renderResults(); renderPlans(); } });
    box.append(h('div', { class: 'btn-row' }, reopen, del));
    box.append(feedbackForm(p), outcomeForm(p));
    return box;
  }

  function openPlan(id) {
    const p = store.plans.find((x) => x.id === id); if (!p) return;
    if (!F.get(p.fieldId)) { ST.msg = 'The field for this plan (' + (p.fieldName || 'unnamed') + ') is not saved on this device, so the plan cannot be reopened here. Restore the field backup first.'; renderCompare(); return; }
    if (ST.fieldId !== p.fieldId) { ST.fieldId = p.fieldId; }
    ST.current = normRot(p.rotations[0], 'cur', 'My current rotation');
    ST.alts = p.rotations.slice(1).map((r, i) => normRot(r, 'alt' + i, ALT_NAMES[i]));
    while (ST.alts.length < 3) ST.alts.push(blankRot('alt' + ST.alts.length, ALT_NAMES[ST.alts.length]));
    ST.weights = Object.assign({}, p.weights); ST.inputs = normInputs(p.inputs); ST.autoYield = {};
    ST.planId = p.id; ST.openPlan = p.id; ST.errors = []; ST.msg = 'Plan opened. Compare again to see the results.';
    renderAll();
    runCompare();
  }

  function feedbackForm(p) {
    const fb = p.feedback || { chosen: '', useful: 0, matched: '', comment: '' };
    const draft = { chosen: fb.chosen, useful: fb.useful ? String(fb.useful) : '', matched: fb.matched, comment: fb.comment };
    const chosen = selectOf(p.rotations.map((r) => [r.name, r.name]).concat([['__else', 'Something else'], ['__none', 'I have not decided']]), draft.chosen, (v) => { draft.chosen = v; }, 'Choose…');
    const useful = selectOf([[1, '1 – not useful'], [2, '2'], [3, '3'], [4, '4'], [5, '5 – very useful']], draft.useful, (v) => { draft.useful = v; }, 'Choose…');
    const matched = selectOf([['yes', 'Yes'], ['partly', 'Partly'], ['no', 'No']], draft.matched, (v) => { draft.matched = v; }, 'Choose…');
    const comment = h('textarea', { rows: 3, maxlength: 400 }); comment.value = draft.comment;
    comment.addEventListener('input', () => { draft.comment = comment.value; });
    const save = h('button', { type: 'button', class: 'btn' }, p.feedback ? 'Update feedback' : 'Save feedback');
    const msg = h('p', { class: 'hint', role: 'status' });
    save.addEventListener('click', () => {
      p.feedback = { at: new Date().toISOString(), chosen: draft.chosen, useful: Number(draft.useful) || 0, matched: draft.matched, comment: str(draft.comment, 400) };
      savePlans(); msg.textContent = ST.storageOK ? 'Feedback saved. Thank you.' : 'Could not save in this browser. Download a copy.';
    });
    return h('div', { class: 'fb-box' }, h('h4', null, 'Your feedback on this comparison'),
      frow('Which rotation did you choose?', chosen), frow('How useful was the comparison?', useful), frow('Did the explanation match what you know about your field?', matched),
      frow('What was wrong or missing? (optional)', comment), h('div', { class: 'btn-row' }, save), msg);
  }

  function outcomeForm(p) {
    const f = curField();
    const o = { season: '', followed: '', yieldTha: null, incomePerHa: null, problems: [], note: '' };
    const season = h('input', { type: 'text', maxlength: 60, placeholder: 'For example: 2027 rainy season', autocomplete: 'off' });
    season.addEventListener('input', () => { o.season = season.value; });
    const followed = selectOf(p.rotations.map((r) => [r.name, r.name]).concat([['__else', 'Something else'], ['__none', 'None of them']]), '', (v) => { o.followed = v; }, 'Choose…');
    const yl = h('input', { type: 'number', min: 0, step: 'any', inputmode: 'decimal' }); yl.addEventListener('input', () => { o.yieldTha = yl.value === '' ? null : num(yl.value); });
    const inc = h('input', { type: 'number', step: 'any', inputmode: 'decimal' }); inc.addEventListener('input', () => { o.incomePerHa = inc.value === '' ? null : num(inc.value); });
    const PROBLEMS = [['drought', 'A dry spell or drought'], ['flood', 'Flooding'], ['pests', 'Pests'], ['disease', 'Disease'], ['weeds', 'Heavy weeds'], ['none', 'No problems']];
    const chk = h('fieldset', { class: 'checks' }, h('legend', null, 'Problems that season'));
    PROBLEMS.forEach(([v, t]) => {
      const cb = h('input', { type: 'checkbox', value: v });
      cb.addEventListener('change', () => { o.problems = cb.checked ? o.problems.concat(v) : o.problems.filter((x) => x !== v); });
      chk.append(h('label', { class: 'check' }, cb, ' ', t));
    });
    const note = h('textarea', { rows: 2, maxlength: 400 }); note.addEventListener('input', () => { o.note = note.value; });
    const msg = h('p', { class: 'hint', role: 'status' });
    const add = h('button', { type: 'button', class: 'btn' }, 'Save this result');
    add.addEventListener('click', () => {
      if (!o.season.trim()) { msg.textContent = 'Say which season this is.'; return; }
      p.outcomes.push({ id: uid(), at: new Date().toISOString(), season: str(o.season, 60), followed: o.followed, yieldTha: o.yieldTha, incomePerHa: o.incomePerHa, problems: o.problems.slice(), note: str(o.note, 400) });
      savePlans(); ST.openPlan = p.id; renderPlans();
    });
    const list = p.outcomes.length ? h('ul', { class: 'how-list' }, p.outcomes.map((x) => h('li', null,
      h('strong', null, x.season + ': '), [x.followed && !x.followed.startsWith('__') ? 'followed ' + x.followed : x.followed === '__none' ? 'followed none of the options' : null,
        x.yieldTha != null ? fmt1(x.yieldTha) + ' t/ha' : null, x.incomePerHa != null ? NAIRA(x.incomePerHa) + ' per ha' : null,
        x.problems.length ? 'problems: ' + x.problems.join(', ') : null].filter(Boolean).join(' · '), x.note ? ' – ' + x.note : ''))) : null;
    return h('div', { class: 'fb-box' }, h('h4', null, 'Record what happened'),
      h('p', { class: 'hint' }, 'After a season, note what you actually did and got. This is for your own records and can be downloaded.'),
      list, frow('Season', season), frow('Which rotation did you follow?', followed),
      h('div', { class: 'inline' }, frow('Yield you got (tonnes per ha)', yl), frow('Money left after costs (₦ per ha)', inc)),
      chk, frow('Anything else? (optional)', note), h('div', { class: 'btn-row' }, add), msg);
  }

  /* ---------- export and restore ---------- */
  function download(name, text, type) {
    const b = new Blob([text], { type: type + ';charset=utf-8' });
    const a = h('a', { href: URL.createObjectURL(b), download: name });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  const stamp = () => new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const csvCell = (v) => {
    let s = v == null ? '' : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  function exportButtons() {
    const j = h('button', { type: 'button', class: 'btn small' }, 'Download plans (JSON)');
    j.addEventListener('click', () => download('clymait-plans-' + stamp() + '.json', JSON.stringify({ version: 1, plans: store.plans }, null, 2), 'application/json'));
    const c = h('button', { type: 'button', class: 'btn small' }, 'Download feedback and results (CSV)');
    c.addEventListener('click', () => {
      const head = ['plan_saved', 'field', 'kind', 'rotation_chosen_or_followed', 'useful_1_to_5', 'explanation_matched', 'season', 'yield_t_per_ha', 'income_naira_per_ha', 'problems', 'comment_or_note', 'recorded_at'];
      const rows = [];
      store.plans.forEach((p) => {
        if (p.feedback) rows.push([p.saved, p.fieldName, 'feedback', p.feedback.chosen, p.feedback.useful || '', p.feedback.matched, '', '', '', '', p.feedback.comment, p.feedback.at]);
        p.outcomes.forEach((x) => rows.push([p.saved, p.fieldName, 'result', x.followed, '', '', x.season, x.yieldTha, x.incomePerHa, x.problems.join('; '), x.note, x.at]));
      });
      download('clymait-feedback-' + stamp() + '.csv', [head].concat(rows).map((r) => r.map(csvCell).join(',')).join('\r\n'), 'text/csv');
    });
    const file = h('input', { type: 'file', accept: 'application/json,.json', class: 'visually-hidden', id: 'pl-import' });
    file.addEventListener('change', () => {
      const fl = file.files && file.files[0]; if (!fl) return;
      if (fl.size > 2e6) { ST.msg = 'That file is too large to be a plans backup.'; renderCompare(); return; }
      fl.text().then((t) => {
        const o = JSON.parse(t); const incoming = (o && Array.isArray(o.plans) ? o.plans : []).map(normPlan).filter(Boolean);
        const have = new Set(store.plans.map((p) => p.id)); let added = 0;
        incoming.forEach((p) => { if (!have.has(p.id)) { store.plans.push(p); added++; } });
        savePlans(); ST.msg = added + ' plan' + (added === 1 ? '' : 's') + ' restored.'; renderCompare(); renderPlans();
      }).catch(() => { ST.msg = 'That file could not be read as a plans backup.'; renderCompare(); });
      file.value = '';
    });
    const lab = h('label', { class: 'btn small', for: 'pl-import' }, 'Restore plans from a file');
    return [j, c, file, lab];
  }

  /* ---------- public ---------- */
  window.ClymaitPlanner = {
    stats() { const last = store.plans[0] || null; return { plans: store.plans.length, feedback: store.plans.filter((x) => x.feedback).length, last }; },
    open(fieldId) { A.setView('planner'); if (fieldId) { chooseField(fieldId); const s = document.getElementById('pl-field'); if (s) s.value = fieldId; } },
  };
  A.onView((name) => { if (name === 'planner') { const keep = ST.fieldId; renderAll(); if (keep && !curField()) { ST.fieldId = ''; renderAll(); } } });
  F.onChange(() => { if (A.getView() === 'planner') { if (ST.fieldId && !curField()) { ST.fieldId = ''; ST.result = null; } renderAll(); } });

  loadPlans();
  renderAll();
})();
