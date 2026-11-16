/* Clymait – rotation engine. Pure logic, no page code, so it can be tested on its own.
   It reads rules.js (draft guidance) and one field profile, and returns next-crop options grouped by
   how strong the evidence is. It never states a waiting time before repeating a crop: no source gives one. */
(function (root) {
  'use strict';

  var R = (typeof module !== 'undefined' && module.exports) ? require('./rules.js') : root.CLYMAIT_RULES;

  var CANDIDATES = ['rice', 'cassava', 'yam', 'maize', 'cowpea', 'groundnut', 'fallow'];
  var LABEL = { rice: 'Rice', cassava: 'Cassava', yam: 'Yam', maize: 'Maize', cowpea: 'Cowpea', groundnut: 'Groundnut', fallow: 'Fallow (rest the land)' };
  var CONFIDENCE = {
    good: 'Good evidence', practice: 'Practice or single-site evidence', mixed: 'Mixed evidence', avoid: 'Advised against'
  };
  var CLIMATE_LOW = 10; // same cut-off the Explore view uses for "scores low"

  var fmt0 = function (n) { return Math.round(n).toLocaleString('en'); };

  function toTime(s) { return Date.parse(s + 'T00:00:00Z'); }

  // Which crop does "next" follow? The current crop, else the most recent past crop.
  function lastCrop(field) {
    var seasons = (field.seasons || []).filter(function (s) { return s.crop; });
    var cur = seasons.filter(function (s) { return s.current; })[0];
    if (cur) return { key: cur.crop, how: 'current' };
    var dated = seasons.filter(function (s) { return s.planted; })
      .sort(function (a, b) { return toTime(b.planted) - toTime(a.planted); });
    if (dated.length) return { key: dated[0].crop, how: 'last' };
    if (seasons.length) return { key: seasons[seasons.length - 1].crop, how: 'last' };
    return { key: '', how: 'none' };
  }

  function sameTwice(field, key) {
    var dated = (field.seasons || []).filter(function (s) { return s.crop && s.planted; })
      .sort(function (a, b) { return toTime(b.planted) - toTime(a.planted); });
    return dated.length >= 2 && dated[0].crop === key && dated[1].crop === key;
  }

  function checksFor(crop, field, snap, missing) {
    var req = R.CROP_REQ[crop];
    var out = [];
    if (!req) return out;

    // rainfall (yearly rain of the map square)
    var rainMm = snap && snap.climate ? snap.climate.annual_rain_mm : null;
    if (rainMm == null) { missing.rain = true; }
    else {
      var irrigated = field.irrigation && field.irrigation.type && field.irrigation.type !== 'none';
      var r = req.rain;
      if (rainMm < r.min) {
        out.push({ level: 'warn', text: 'Yearly rain in this map square (about ' + fmt0(rainMm) + ' mm) is below the range the sources give: ' + r.text + (irrigated ? ' You recorded irrigation, which may make up some of the gap.' : '') });
      } else if (r.max != null && rainMm > r.max) {
        out.push({ level: 'warn', text: 'Yearly rain in this map square (about ' + fmt0(rainMm) + ' mm) is above the range the sources give: ' + r.text });
      } else {
        out.push({ level: 'ok', text: 'Yearly rain in this map square (about ' + fmt0(rainMm) + ' mm) is within the range the sources give.' });
      }
    }

    // soil pH
    var ph = field.soil ? field.soil.ph : null;
    if (req.ph) {
      if (ph == null) missing.ph = true;
      else if (req.ph.limeBelow != null && ph < req.ph.limeBelow) {
        out.push({ level: 'warn', text: 'Your soil pH (' + ph + ') is below ' + req.ph.limeBelow + ', where the ICRISAT guide says to lime. Best range is ' + req.ph.min + '–' + req.ph.max + '.' });
      } else if (ph < req.ph.min || ph > req.ph.max) {
        out.push({ level: 'warn', text: 'Your soil pH (' + ph + ') is outside the ' + req.ph.min + '–' + req.ph.max + ' range the sources give.' });
      } else {
        out.push({ level: 'ok', text: 'Your soil pH (' + ph + ') is within the ' + req.ph.min + '–' + req.ph.max + ' range the sources give.' });
      }
    }

    // soil texture
    var tex = field.soil ? field.soil.texture : '';
    if (!tex || tex === 'unknown') missing.texture = true;
    else if (req.badTexture && req.badTexture.indexOf(tex) >= 0) {
      out.push({ level: 'warn', text: 'The sources advise against this soil texture: ' + req.textureNote });
    }

    // drainage
    var dr = field.drainage;
    if (!dr || dr === 'unknown') missing.drainage = true;
    else if (req.poorDrainageBad && (dr === 'poor' || dr === 'floods')) {
      out.push({ level: 'warn', text: 'You recorded poor drainage or flooding. ' + req.drainageNote });
    }
    return out;
  }

  // Extra notes tied to one rule and what the farmer recorded.
  function ruleNotes(rule, field) {
    var n = [];
    var som = field.soil ? field.soil.somLevel : '';
    if (rule.id === 'D' && som === 'low') n.push('You recorded low organic matter. The source says cassava is rarely rotated with cereals on poor soils.');
    if (rule.id === 'K') n.push('No source gives a minimum break before cowpea can follow cowpea, so none is stated here. Clear haulms left from the previous crop: pod-sucking bugs overseason in them.');
    if (rule.id === 'E') n.push('The evidence is from Colombia, so the size of the yield loss for Nigeria is not known.');
    if (rule.id === 'J') n.push('Cowpea-cereal rotation is also named as a low-cost control for Striga gesnerioides on cowpea.');
    return n;
  }

  function advise(field, snap, afterKey) {
    var last = lastCrop(field);
    var after = afterKey || last.key;
    var how = afterKey ? 'chosen' : last.how;
    var res = {
      after: after, afterLabel: after ? (LABEL[after] || after) : '', how: how,
      groups: { good: [], practice: [], mixed: [], avoid: [], climateLow: [] },
      noEvidence: [], missing: [], repeatNote: '', rulesVersion: R.VERSION
    };
    if (!after) return res;

    var missing = {};
    CANDIDATES.forEach(function (crop) {
      var rules = R.RULES.filter(function (r) { return r.from.indexOf(after) >= 0 && r.to.indexOf(crop) >= 0; });
      if (!rules.length) { if (crop !== 'fallow') res.noEvidence.push(LABEL[crop]); return; }

      var tier = rules.some(function (r) { return r.tier === 'avoid'; }) ? 'avoid'
        : rules.some(function (r) { return r.tier === 'good'; }) ? 'good'
        : rules.some(function (r) { return r.tier === 'practice'; }) ? 'practice' : 'mixed';

      var est = null;
      if (snap && snap.crops) {
        var m = snap.crops.filter(function (c) { return c.key === crop; })[0];
        if (m) est = { val: m.val, err: m.err };
      }
      var checks = crop === 'fallow' ? [] : checksFor(crop, field, snap, missing);
      var notes = [];
      rules.forEach(function (r) { notes = notes.concat(ruleNotes(r, field)); });

      var opt = {
        crop: crop, label: LABEL[crop], tier: tier, confidence: CONFIDENCE[tier],
        rules: rules, checks: checks, notes: notes, climate: est,
        review: rules.some(function (r) { return r.review; }),
        climateLow: !!est && est.val < CLIMATE_LOW && tier !== 'avoid'
      };
      if (opt.climateLow) res.groups.climateLow.push(opt);
      else res.groups[tier].push(opt);
    });

    ['good', 'practice', 'mixed', 'avoid', 'climateLow'].forEach(function (g) {
      res.groups[g].sort(function (a, b) {
        var av = a.climate ? a.climate.val : -1, bv = b.climate ? b.climate.val : -1;
        return bv - av;
      });
    });

    res.missing = Object.keys(missing).map(function (k) {
      return { rain: 'a field location (for rainfall)', ph: 'soil pH', texture: 'soil texture', drainage: 'drainage' }[k];
    });
    if (sameTwice(field, after)) res.repeatNote = (LABEL[after] || after) + ' was grown in your last two recorded seasons in a row.';
    return res;
  }

  function pairRules(from, to) {
    return R.RULES.filter(function (r) { return r.from.indexOf(from) >= 0 && r.to.indexOf(to) >= 0; });
  }

  var api = { advise: advise, pairRules: pairRules, checksFor: checksFor, lastCrop: lastCrop, CANDIDATES: CANDIDATES, LABEL: LABEL, CONFIDENCE: CONFIDENCE, CLIMATE_LOW: CLIMATE_LOW };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ClymaitEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);
