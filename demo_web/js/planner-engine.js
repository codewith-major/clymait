/* Clymait – rotation planner engine. Pure logic, no page code.

   What it does: places each rotation on a calendar, then compares rotations on ten things.
   What it does NOT do: predict yields, prices or weather, or invent a score.
     - Climate suitability and drought history come from the app's measured data (rice, cassava, yam only).
     - Soil-health trend, pest interruption and drought tolerance come only from the sourced rules in rules.js.
     - Income and labor come only from numbers the farmer types in. Blank in, blank out.
     - "Overall" is a tally of who is ahead on the criteria the farmer cares about. It is not a 0-100 score.
   The calendar uses 365-day years, planting on the 15th of the chosen month, and May-October as the rainy
   season (the same season the app's climate data covers). These are modelling choices, not measurements. */
(function (root) {
  'use strict';

  var R = (typeof module !== 'undefined' && module.exports) ? require('./rules.js') : root.CLYMAIT_RULES;
  var RE = (typeof module !== 'undefined' && module.exports) ? require('./rotation-engine.js') : root.ClymaitEngine;
  var F = R.CROP_FACTS;

  var MD = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  var CUM = [0]; MD.forEach(function (d, i) { CUM.push(CUM[i] + d); });
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var YEAR = 365, MAX_CYCLE_DAYS = 4 * YEAR, MAX_STEPS = 5;
  var CROPS = ['rice', 'cassava', 'yam', 'maize', 'cowpea', 'groundnut'];
  var STEP_CROPS = CROPS.concat(['fallow']);
  var CLIMATE_LOW = 10;

  var mid = function (m) { return CUM[m - 1] + MD[m - 1] / 2; };
  function monthOfDay(d) {
    var doy = ((Math.floor(d) % YEAR) + YEAR) % YEAR;
    for (var i = 0; i < 12; i++) if (doy < CUM[i + 1]) return i + 1;
    return 12;
  }
  var isRainy = function (m) { return m >= 5 && m <= 10; };
  var round1 = function (x) { return Math.round(x * 10) / 10; };
  var round0 = function (x) { return Math.round(x); };
  var num = function (x) { if (x === '' || x == null) return null; var n = Number(x); return isFinite(n) ? n : null; };

  /* ---------- rotation shape ---------- */
  function defaultStep(crop) {
    var f = F[crop];
    return { crop: crop, plantMonth: f.plantMonth, days: f.days };
  }

  function validateRotation(rot) {
    var errs = [];
    if (!rot || !Array.isArray(rot.steps) || !rot.steps.length) return ['Add at least one crop.'];
    if (rot.steps.length > MAX_STEPS) errs.push('Use at most ' + MAX_STEPS + ' steps.');
    rot.steps.forEach(function (s, i) {
      var tag = 'Step ' + (i + 1) + ': ';
      if (STEP_CROPS.indexOf(s.crop) < 0) errs.push(tag + 'choose a crop.');
      if (!(s.days >= 1 && s.days <= 730)) errs.push(tag + 'days in the field must be between 1 and 730.');
      if (i === 0 && !(s.plantMonth >= 1 && s.plantMonth <= 12)) errs.push('Step 1: choose a planting month.');
      if (i > 0 && !(s.plantMonth === 0 || (s.plantMonth >= 1 && s.plantMonth <= 12))) errs.push(tag + 'choose a planting month.');
    });
    if (rot.steps[0] && rot.steps[0].crop === 'fallow') errs.push('Start the rotation with a crop, not fallow.');
    if (!errs.length && timeline(rot.steps).cycleDays > MAX_CYCLE_DAYS) errs.push('This rotation is longer than 4 years. Shorten it.');
    return errs;
  }

  /* ---------- calendar ---------- */
  function timeline(steps) {
    var out = [], t = 0;
    steps.forEach(function (st, i) {
      var start;
      var pm = st.plantMonth;
      if (i === 0) start = mid(pm >= 1 ? pm : (F[st.crop].plantMonth || 6));
      else if (!pm) start = t;
      else {
        var base = mid(pm);
        start = base + Math.max(0, Math.ceil((t - base) / YEAR)) * YEAR;
      }
      t = start + st.days;
      out.push({ idx: i, crop: st.crop, start: start, end: t, days: st.days });
    });
    var first = out[0].start;
    var yrs = Math.max(1, Math.ceil((t - first) / YEAR - 1e-9));
    var cycleEnd = first + yrs * YEAR;
    var gaps = [];
    for (var i = 0; i < out.length; i++) {
      var nextStart = i < out.length - 1 ? out[i + 1].start : cycleEnd;
      var g = nextStart - out[i].end;
      if (g > 0.5) gaps.push({ from: out[i].end, to: nextStart, days: g, afterIdx: i, wrap: i === out.length - 1 });
    }
    var fallowDays = 0, cropDays = 0;
    out.forEach(function (s) { if (s.crop === 'fallow') fallowDays += s.days; else cropDays += s.days; });
    var bareDays = gaps.reduce(function (a, g) { return a + g.days; }, 0);
    return { steps: out, cycleEnd: cycleEnd, first: first, cycleDays: cycleEnd - first, gaps: gaps,
      bareDays: bareDays, fallowDays: fallowDays, cropDays: cropDays };
  }

  // One cell per month of the cycle: what is in the field for most of that month.
  function monthGrid(steps, tl) {
    var m0 = steps[0].plantMonth >= 1 ? steps[0].plantMonth : (F[steps[0].crop].plantMonth || 6);
    var origin = tl.first - MD[m0 - 1] / 2;
    var cells = [], s = origin, k = 0;
    var gridEnd = origin + tl.cycleDays;
    while (s < gridEnd - 0.5 && k < 60) {
      var cm = ((m0 - 1 + k) % 12) + 1, e = s + MD[cm - 1];
      var best = { state: 'bare', crop: '', amt: 0 }, cover = 0;
      tl.steps.forEach(function (st) {
        var ov = Math.min(e, st.end) - Math.max(s, st.start);
        if (ov > 0) { cover += ov; if (ov > best.amt) best = { state: st.crop === 'fallow' ? 'fallow' : 'crop', crop: st.crop, amt: ov }; }
      });
      if (cover < MD[cm - 1] / 2) best = { state: 'bare', crop: '', amt: 0 };
      cells.push({ k: k, month: cm, state: best.state, crop: best.crop });
      s = e; k++;
    }
    return cells;
  }

  function dryRainyDays(st) {
    var dry = 0, rainy = 0;
    for (var d = Math.floor(st.start); d < Math.floor(st.end); d++) { if (isRainy(monthOfDay(d))) rainy++; else dry++; }
    return { dry: dry, rainy: rainy };
  }

  /* ---------- analysis of one rotation ---------- */
  function analyse(rot, ctx) {
    var steps = rot.steps, tl = timeline(steps), perYear = YEAR / tl.cycleDays;
    var cropSteps = tl.steps.filter(function (s) { return s.crop !== 'fallow'; });
    var res = { id: rot.id, name: rot.name, steps: steps, timeline: tl, grid: monthGrid(steps, tl), cycleYears: tl.cycleDays / YEAR, notes: [] };
    var irrigated = !!ctx.irrigated;

    // bare-field days
    res.bare = { days: tl.bareDays, perYear: tl.bareDays * perYear, fallowPerYear: tl.fallowDays * perYear, gaps: tl.gaps };

    // climate suitability (measured data; rice, cassava, yam only)
    var parts = [];
    cropSteps.forEach(function (s) {
      var m = ctx.snap && ctx.snap.crops ? ctx.snap.crops.filter(function (c) { return c.key === s.crop; })[0] : null;
      if (m) parts.push({ crop: s.crop, val: m.val, err: m.err });
    });
    res.climate = {
      covered: parts.length, total: cropSteps.length, parts: parts,
      mean: parts.length ? parts.reduce(function (a, p) { return a + p.val; }, 0) / parts.length : null,
      low: parts.filter(function (p) { return p.val < CLIMATE_LOW; }).map(function (p) { return p.crop; })
    };

    // drought: measured field history (same for every rotation) + crop tolerance stated by sources
    var tol = 0, sens = 0, uns = 0, dRows = [];
    cropSteps.forEach(function (s) {
      var lvl = F[s.crop].drought;
      if (lvl === 'tolerant') tol++; else if (lvl === 'sensitive') sens++; else uns++;
      dRows.push({ crop: s.crop, level: lvl, note: F[s.crop].droughtNote });
    });
    var n = Math.max(1, cropSteps.length);
    res.drought = { tolerant: tol, sensitive: sens, unstated: uns, score: (tol - sens) / n, rows: dRows };

    // water: sourced rainfall ranges against yearly rain in the field's map square
    var rain = ctx.rain, wRows = [], fit = 0;
    cropSteps.forEach(function (s) {
      var req = R.CROP_REQ[s.crop], f = null;
      if (rain != null) {
        if (rain >= req.rain.min && (req.rain.max == null || rain <= req.rain.max)) f = 1;
        else if (rain < req.rain.min && req.rain.hardMin != null && rain >= req.rain.hardMin) f = 0.5;
        else f = 0;
      }
      if (f != null) fit += f;
      wRows.push({ crop: s.crop, text: req.rain.text, min: req.rain.min, max: req.rain.max, fit: f, days: s.days });
    });
    res.water = { rows: wRows, rain: rain, fitFrac: rain == null || !cropSteps.length ? null : fit / cropSteps.length, irrigated: irrigated };

    // soil health and pests, from the rules for each consecutive pair (including last -> first of the next cycle)
    var pairs = [], net = 0, evid = 0, interrupts = [], repeats = [], unsourcedRepeats = [], reviewIds = {};
    var seq = tl.steps.map(function (s) { return s.crop; });
    for (var i = 0; i < seq.length; i++) {
      var a = seq[i], b = seq[(i + 1) % seq.length];
      var rules = RE.pairRules(a, b);
      var tier = !rules.length ? null
        : rules.some(function (r) { return r.tier === 'avoid'; }) ? 'avoid'
        : rules.some(function (r) { return r.tier === 'good'; }) ? 'good'
        : rules.some(function (r) { return r.tier === 'practice'; }) ? 'practice' : 'mixed';
      var sc = tier === 'good' ? 1 : tier === 'avoid' ? -1 : 0;
      net += sc; if (rules.length) evid++;
      rules.forEach(function (r) { if (r.review) reviewIds[r.id] = true; });
      pairs.push({ from: a, to: b, tier: tier, rules: rules, score: sc, wrap: i === seq.length - 1 });
      rules.forEach(function (r) {
        if (r.pest && r.pest.interrupts && r.tier === 'good') r.pest.interrupts.forEach(function (x) { interrupts.push({ what: x, rule: r.id, from: a, to: b }); });
        if (r.pest && r.pest.repeatRisk) r.pest.repeatRisk.forEach(function (x) { repeats.push({ what: x, rule: r.id, crop: a }); });
      });
      if (a === b && a !== 'fallow' && !rules.some(function (r) { return r.pest && r.pest.repeatRisk; })) unsourcedRepeats.push(a);
    }
    res.soil = { pairs: pairs, net: net, evidence: evid, label: evid === 0 ? 'no evidence' : net > 0 ? 'improving' : net < 0 ? 'declining' : 'mixed or neutral' };
    res.pest = { interrupts: interrupts, repeats: repeats, unsourcedRepeats: unsourcedRepeats, score: interrupts.length - repeats.length };
    res.reviewIds = Object.keys(reviewIds);
    if (ctx.recordedWeeds && interrupts.some(function (x) { return /Striga/.test(x.what); })) {
      res.notes.push('You recorded heavy weeds on this field. Cowpea followed by a cereal is the sourced control for Striga on cowpea.');
    }

    // vulnerable season: crop days outside the May-October rainy season, plus dry-spell and yam rules
    var vRows = [], warnings = [], exposed = 0;
    cropSteps.forEach(function (s) {
      var dr = dryRainyDays(s), lvl = F[s.crop].drought;
      var isExposed = dr.dry > 0 && lvl !== 'tolerant' && !irrigated;
      if (isExposed) exposed += dr.dry;
      vRows.push({ crop: s.crop, dryDays: dr.dry, rainyDays: dr.rainy, level: lvl, exposed: isExposed });
      if (dr.dry > 0 && irrigated) warnings.push({ level: 'info', crop: s.crop, text: F[s.crop].label + ' is in the field ' + round0(dr.dry) + ' days between November and April. You recorded irrigation, but how much water you have is not checked.' });
      else if (dr.dry > 0 && lvl === 'tolerant') warnings.push({ level: 'info', crop: s.crop, text: F[s.crop].label + ' is in the field ' + round0(dr.dry) + ' days between November and April. The sources say it tolerates dry conditions: ' + F[s.crop].droughtNote });
      else if (dr.dry > 0) warnings.push({ level: 'warn', crop: s.crop, text: F[s.crop].label + ' is in the field ' + round0(dr.dry) + ' days between November and April, outside the May–October rainy season, with no irrigation recorded. ' + (F[s.crop].droughtNote || 'The sources do not say how it copes with dry conditions.') });
      if (s.crop === 'yam') {
        var months = dr.rainy / 30.4;
        if (months < 5) warnings.push({ level: 'warn', crop: 'yam', text: 'Yam needs rain for at least 5 of its roughly 8 months in the field. With your dates only about ' + round1(months) + ' of them fall in May–October.' });
      }
      if (s.crop === 'maize' && ctx.standsDry && ctx.risk) {
        warnings.push({ level: 'warn', crop: 'maize', text: 'The typical longest dry spell in this state’s rainy season is about ' + round0(ctx.risk.avg_longest_dry_spell_days) + ' days, which is high compared with other states. A dry spell at flowering can cut maize yield by 30–35%.' });
      }
    });
    res.vulnerable = { rows: vRows, exposedPerYear: exposed * perYear, warnings: warnings };

    // income and labor: only from the farmer's own numbers
    var inc = ctx.inputs || {}, missI = {}, missL = {}, revC = 0, costC = 0, labC = 0;
    cropSteps.forEach(function (s) {
      var y = num((inc.yield || {})[s.crop]), p = num((inc.price || {})[s.crop]), c = num((inc.cost || {})[s.crop]), l = num((inc.labor || {})[s.crop]);
      if (y == null || p == null || c == null) missI[s.crop] = true; else { revC += y * 1000 * p; costC += c; }
      if (l == null) missL[s.crop] = true; else labC += l;
    });
    var iMiss = Object.keys(missI), lMiss = Object.keys(missL);
    res.income = { missing: iMiss, perYear: iMiss.length || !cropSteps.length ? null : (revC - costC) * perYear,
      revenuePerYear: iMiss.length ? null : revC * perYear, costPerYear: iMiss.length ? null : costC * perYear };
    res.labor = { missing: lMiss, perYear: lMiss.length || !cropSteps.length ? null : labC * perYear };
    return res;
  }

  /* ---------- criteria ---------- */
  var fmtN = function (n) { return Math.round(n).toLocaleString('en'); };
  var naira = function (n) { return (n < 0 ? '−' : '') + '₦' + fmtN(Math.abs(n)); };

  var CRITERIA = [
    { key: 'climate', label: 'Climate suitability', better: 'higher', tol: 10,
      value: function (r) { return r.climate.mean; },
      text: function (r) { return r.climate.mean == null ? 'no estimate' : round0(r.climate.mean) + ' / 100 (' + r.climate.covered + ' of ' + r.climate.total + ' crops covered)'; },
      skip: function (rs) { return rs.some(function (r) { return r.climate.mean == null; }) ? 'The climate estimate covers only rice, cassava and yam, and at least one rotation has none of them.' : ''; } },
    { key: 'drought', label: 'Drought risk', better: 'higher', tol: 0.2,
      value: function (r) { return r.drought.score; },
      text: function (r) { return r.drought.tolerant + ' drought-tolerant, ' + r.drought.sensitive + ' drought-sensitive, ' + r.drought.unstated + ' not stated by sources'; },
      skip: function () { return ''; } },
    { key: 'water', label: 'Water demand', better: 'higher', tol: 0.15,
      value: function (r) { return r.water.fitFrac; },
      text: function (r) { return r.water.fitFrac == null ? 'unknown' : round0(r.water.fitFrac * 100) + '% of crops fit the rain here'; },
      skip: function (rs) { return rs.some(function (r) { return r.water.fitFrac == null; }) ? 'This field has no location, so the rain it gets is unknown.' : ''; } },
    { key: 'soil', label: 'Soil-health trend', better: 'higher', tol: 0.5,
      value: function (r) { return r.soil.net; },
      text: function (r) { return r.soil.label + (r.soil.evidence ? ' (' + r.soil.evidence + ' of ' + r.soil.pairs.length + ' crop changes have a rule)' : ''); },
      skip: function (rs) { return rs.every(function (r) { return r.soil.evidence === 0; }) ? 'No rule covers any crop change in these rotations.' : ''; } },
    { key: 'pest', label: 'Pest-cycle interruption', better: 'higher', tol: 0.5,
      value: function (r) { return r.pest.score; },
      text: function (r) { return r.pest.interrupts.length + ' sourced interruption' + (r.pest.interrupts.length === 1 ? '' : 's') + (r.pest.repeats.length ? ', ' + r.pest.repeats.length + ' repeat' + (r.pest.repeats.length === 1 ? '' : 's') + ' of a crop with a pest-rotation advice' : ''); },
      skip: function (rs) { return rs.every(function (r) { return !r.pest.interrupts.length && !r.pest.repeats.length; }) ? 'The sources name pest benefits for only a few crop changes (cowpea then cereal, cereal then groundnut). None appear here.' : ''; } },
    { key: 'bare', label: 'Bare-field days', better: 'lower', tol: 30,
      value: function (r) { return r.bare.perYear; },
      text: function (r) { return round0(r.bare.perYear) + ' days a year' + (r.bare.fallowPerYear > 0.5 ? ' (+' + round0(r.bare.fallowPerYear) + ' fallow)' : ''); },
      skip: function () { return ''; } },
    { key: 'vulnerable', label: 'Vulnerable-season risk', better: 'lower', tol: 30,
      value: function (r) { return r.vulnerable.exposedPerYear; },
      text: function (r) { return round0(r.vulnerable.exposedPerYear) + ' exposed dry-season days a year'; },
      skip: function () { return ''; } },
    { key: 'income', label: 'Income estimate', better: 'higher', rel: 0.1,
      value: function (r) { return r.income.perYear; },
      text: function (r) { return r.income.perYear == null ? 'not entered' : naira(r.income.perYear) + ' per ha a year'; },
      skip: function (rs) { return rs.some(function (r) { return r.income.perYear == null; }) ? 'Prices, costs or yields are missing for at least one rotation.' : ''; } },
    { key: 'labor', label: 'Labor demand', better: 'lower', rel: 0.1,
      value: function (r) { return r.labor.perYear; },
      text: function (r) { return r.labor.perYear == null ? 'not entered' : round0(r.labor.perYear) + ' person-days per ha a year'; },
      skip: function (rs) { return rs.some(function (r) { return r.labor.perYear == null; }) ? 'Labor days are missing for at least one rotation.' : ''; } }
  ];

  function cmp(c, a, b, tol) {
    var d = (c.better === 'higher' ? 1 : -1) * (a - b);
    return d > tol ? 1 : d < -tol ? -1 : 0;
  }

  /* ---------- compare all rotations ---------- */
  var DEFAULT_WEIGHT = 2; // 0 not important, 1 some, 2 important, 3 very important

  function compare(ctx) {
    var rots = ctx.rotations.map(function (r) { return analyse(r, ctx); });
    var weights = ctx.weights || {};
    var wOf = function (k) { var w = weights[k]; return w == null ? DEFAULT_WEIGHT : w; };

    var criteria = CRITERIA.map(function (c) {
      var reason = c.skip(rots);
      var vals = rots.map(function (r) { return c.value(r); });
      var tol = c.tol != null ? c.tol : (c.rel || 0) * Math.max.apply(null, vals.map(function (v) { return Math.abs(v || 0); }).concat([1e-9]));
      var w = wOf(c.key);
      var counted = !reason && w > 0;
      if (!reason && w === 0) reason = 'You marked this as not important.';
      var cope = rots.map(function (_, i) {
        if (!counted) return 0;
        var s = 0;
        rots.forEach(function (__, j) { if (i !== j) s += cmp(c, vals[i], vals[j], tol); });
        return s;
      });
      return { key: c.key, label: c.label, better: c.better, weight: w, counted: counted, reason: reason, tol: tol,
        cells: rots.map(function (r, i) { return { id: r.id, text: c.text(r), num: vals[i], copeland: cope[i],
          standing: !counted ? 'none' : cope[i] > 0 ? 'ahead' : cope[i] < 0 ? 'behind' : 'similar' }; }) };
    });

    var overall = rots.map(function (r, i) {
      var score = 0, ahead = 0, behind = 0;
      criteria.forEach(function (c) {
        if (!c.counted) return;
        var cp = c.cells[i].copeland;
        score += c.weight * cp;
        if (cp > 0) ahead++; else if (cp < 0) behind++;
      });
      return { id: r.id, index: i, score: score, ahead: ahead, behind: behind };
    });
    var ranked = overall.slice().sort(function (a, b) { return b.score - a.score || a.index - b.index; });
    ranked.forEach(function (o, i) { o.rank = i + 1; });

    var explanation = explain(rots, criteria, ranked, ctx);
    return { rotations: rots, criteria: criteria, overall: overall, ranked: ranked, explanation: explanation };
  }

  function head2head(criteria, i, j) {
    var h = 0, per = [];
    criteria.forEach(function (c) {
      if (!c.counted) return;
      var a = c.cells[i], b = c.cells[j];
      var d = (c.better === 'higher' ? 1 : -1) * (a.num - b.num);
      var v = d > c.tol ? 1 : d < -c.tol ? -1 : 0;
      h += c.weight * v;
      per.push({ key: c.key, label: c.label, weight: c.weight, v: v, a: a.text, b: b.text });
    });
    return { h: h, per: per };
  }

  var STATUS_TEXT = { clear: 'clearly ahead', narrow: 'narrowly ahead', tie: 'about the same' };

  function explain(rots, criteria, ranked, ctx) {
    var out = { status: 'none', leaderId: null, runnerName: '', headline: '', reasons: [], against: [], vsCurrent: [], notCounted: [], caveats: [] };
    var counted = criteria.filter(function (c) { return c.counted; });
    criteria.forEach(function (c) { if (!c.counted) out.notCounted.push({ label: c.label, reason: c.reason }); });
    if (!counted.length) {
      out.headline = 'There is not enough counted information to say that one rotation is better.';
      return out;
    }
    var L = ranked[0], S = ranked[1];
    var hh = head2head(criteria, L.index, S.index);
    var status = hh.h >= 3 ? 'clear' : hh.h >= 1 ? 'narrow' : 'tie';
    out.status = status; out.leaderId = rots[L.index].id; out.runnerName = rots[S.index].name;
    var lname = rots[L.index].name, sname = rots[S.index].name;
    if (status === 'tie') {
      out.headline = 'No rotation is clearly better. ' + lname + ' and ' + sname + ' come out about the same on what you said matters.';
    } else if (L.index === 0) {
      out.headline = 'Your current rotation (' + lname + ') comes out ' + STATUS_TEXT[status] + ' of the alternatives on what you said matters. Next closest: ' + sname + '.';
    } else {
      out.headline = lname + ' comes out ' + STATUS_TEXT[status] + ' of ' + sname + ' on what you said matters, with ' + L.ahead + ' criteria ahead and ' + L.behind + ' behind.';
    }
    var order = function (a, b) { return b.weight - a.weight; };
    hh.per.slice().sort(order).forEach(function (p) {
      var line = { label: p.label, weight: p.weight, text: lname + ': ' + p.a + '. ' + sname + ': ' + p.b + '.' };
      if (p.v > 0) out.reasons.push(line); else if (p.v < 0) out.against.push(line);
    });
    if (L.index !== 0) {
      var h0 = head2head(criteria, L.index, 0);
      h0.per.slice().sort(order).forEach(function (p) {
        if (p.v !== 0) out.vsCurrent.push({ label: p.label, weight: p.weight, better: p.v > 0, text: 'Current: ' + p.b + '. ' + lname + ': ' + p.a + '.' });
      });
    }

    // caveats
    var rev = {};
    [rots[L.index], rots[S.index]].forEach(function (r) { r.reviewIds.forEach(function (id) { rev[id] = true; }); });
    var revIds = Object.keys(rev);
    out.caveats.push('The rotation rules are draft guidance from published sources and have not been reviewed by an agronomist.' + (revIds.length ? ' Rules used here that are specifically awaiting review: ' + revIds.join(', ') + '.' : '') + ' Several rest on a single site.');
    out.caveats.push('This compares rotations on the items above. It does not forecast yields, prices or weather, and it is not a planting recommendation.');
    var anyOutside = rots.some(function (r) { return r.climate.covered < r.climate.total; });
    if (anyOutside) out.caveats.push('Climate suitability exists only for rice, cassava and yam, so for rotations with other crops it covers only part of the rotation.');
    out.caveats.push('Planting months and days in the field are the ones entered here. The app has no verified planting windows yet.');
    out.caveats.push('Differences smaller than a set margin are treated as similar: 10 climate points, 30 days (bare or exposed), 10% (income, labor).');
    if (counted.some(function (c) { return c.key === 'income' || c.key === 'labor'; })) out.caveats.push('Income and labor use only the numbers you typed in. They are not checked against local prices or costs.');
    return out;
  }

  /* ---------- starter alternatives from the rules ---------- */
  function canonicalKey(seq) {
    var best = null;
    for (var i = 0; i < seq.length; i++) {
      var k = seq.slice(i).concat(seq.slice(0, i)).join('>');
      if (best == null || k < best) best = k;
    }
    return best;
  }

  function suggest(ctx, currentSteps, count) {
    var curKey = currentSteps && currentSteps.length ? canonicalKey(currentSteps.map(function (s) { return s.crop; })) : '';
    var seqs = [];
    CROPS.forEach(function (a) {
      CROPS.forEach(function (b) {
        if (a !== b) { seqs.push([a, b]); CROPS.forEach(function (c) { if (c !== b && c !== a) seqs.push([a, b, c]); }); }
      });
    });
    var snap = ctx.snap, field = ctx.field || { soil: {}, irrigation: {} };
    var scored = [], seen = {};
    seqs.forEach(function (seq) {
      var key = canonicalKey(seq);
      if (seen[key] || key === curKey) return;
      seen[key] = true;
      var good = 0, mixed = 0, bad = false;
      for (var i = 0; i < seq.length; i++) {
        var rules = RE.pairRules(seq[i], seq[(i + 1) % seq.length]);
        if (rules.some(function (r) { return r.tier === 'avoid'; })) bad = true;
        else if (rules.some(function (r) { return r.tier === 'good'; })) good++;
        else if (rules.length) mixed++;
      }
      if (bad || !good) return;
      var warns = 0, lowClimate = false;
      seq.forEach(function (c) {
        RE.checksFor(c, field, snap, {}).forEach(function (x) { if (x.level === 'warn') warns++; });
        var m = snap && snap.crops ? snap.crops.filter(function (x) { return x.key === c; })[0] : null;
        if (m && m.val < CLIMATE_LOW) lowClimate = true;
      });
      if (lowClimate) return;
      scored.push({ seq: seq, score: good * 3 - mixed * 0.5 - warns * 2 - seq.length * 0.1, set: seq.slice().sort().join(',') });
    });
    scored.sort(function (a, b) { return b.score - a.score; });
    var picked = [], sets = {};
    scored.forEach(function (s) { if (picked.length < count && !sets[s.set]) { sets[s.set] = true; picked.push(s); } });
    scored.forEach(function (s) { if (picked.length < count && picked.indexOf(s) < 0) picked.push(s); });
    return picked.map(function (p) { return p.seq.map(defaultStep); });
  }

  var api = {
    compare: compare, analyse: analyse, timeline: timeline, monthGrid: monthGrid, validateRotation: validateRotation,
    suggest: suggest, defaultStep: defaultStep, canonicalKey: canonicalKey,
    CRITERIA: CRITERIA.map(function (c) { return { key: c.key, label: c.label, better: c.better }; }),
    CROPS: CROPS, STEP_CROPS: STEP_CROPS, MONTHS: MONTHS, MAX_STEPS: MAX_STEPS, DEFAULT_WEIGHT: DEFAULT_WEIGHT, naira: naira
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ClymaitPlanner_engine = api;
})(typeof window !== 'undefined' ? window : globalThis);
