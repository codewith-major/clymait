// Run: node tests/rotation-engine.test.js
const E = require(__dirname + '/../js/rotation-engine.js');
const R = require(__dirname + '/../js/rules.js');
const assert = require('assert');
const mk = (after, extra={}) => Object.assign({ seasons:[{crop:after,current:true}], soil:{}, irrigation:{} }, extra);
const snap = (rain, vals={rice:30,cassava:30,yam:30}) => ({climate:{annual_rain_mm:rain}, crops:Object.entries(vals).map(([k,v])=>({key:k,val:v,err:10}))});
const tier = (res, crop) => { for (const g of Object.keys(res.groups)) if (res.groups[g].some(o=>o.crop===crop)) return g; return 'none'; };
const T = (after, crop, want, sn=snap(1200)) => { const g = tier(E.advise(mk(after), sn), crop); assert.strictEqual(g, want, `${after}->${crop}: got ${g}, want ${want}`); };

// every draft row maps to the right tier
T('cowpea','cassava','good'); T('groundnut','cassava','good');      // A
T('yam','cassava','practice');                                       // B
T('fallow','yam','practice'); T('cassava','fallow','practice');      // C
T('cassava','maize','good');                                         // D
T('cassava','cassava','avoid');                                      // E
T('cowpea','maize','good');                                          // F
T('maize','maize','avoid');                                          // G
T('groundnut','maize','good');                                       // H
T('maize','groundnut','good'); T('sorghum','groundnut','good');      // I
T('cowpea','cowpea','avoid');                                        // K
T('cowpea','rice','mixed'); T('groundnut','rice','mixed');           // L/O
T('rice','yam','practice'); T('yam','rice','practice');              // M N
T('rice','cowpea','practice');                                       // P
// Q: no rule -> not ranked anywhere
T('maize','yam','none'); T('cowpea','yam','none'); T('rice','rice','none'); T('maize','rice','none'); T('cowpea','groundnut','none');
let r = E.advise(mk('rice'), snap(1200)); assert(r.noEvidence.includes('Rice'));
// J cereals after cowpea
const rj = E.advise(mk('cowpea'), snap(1200)); assert.strictEqual(tier(rj,'maize'),'good');
// no waiting-time wording anywhere in rules text
const all = JSON.stringify(R.RULES).toLowerCase();
assert(!/\b(\d+|one|two|three)[- ]year(s)? (break|gap|wait|rest)/.test(all), 'interval wording');
// K note: no interval
assert(E.advise(mk('cowpea'),snap(1200)).groups.avoid[0].notes.join(' ').includes('none is stated'));
// climate cross-check: low-climate crop moves out of "good"
let low = E.advise(mk('cowpea'), snap(1200,{rice:30,cassava:4,yam:30}));
assert.strictEqual(tier(low,'cassava'),'climateLow'); assert.strictEqual(tier(low,'maize'),'good');
// avoid stays avoid even with low climate
assert.strictEqual(tier(E.advise(mk('cassava'), snap(1200,{rice:30,cassava:2,yam:30})),'cassava'),'avoid');
// site checks
let c = E.advise(mk('maize',{soil:{ph:5.2,texture:'clay'},drainage:'floods'}), snap(2500)).groups.good[0]; // groundnut after maize
assert.strictEqual(c.crop,'groundnut');
const w = c.checks.filter(x=>x.level==='warn').map(x=>x.text).join('|');
assert(/above the range/.test(w) && /lime/.test(w) && /texture/.test(w) && /poor drainage/.test(w), w);
// rainfall low + irrigation note
let ir = E.advise(mk('maize',{irrigation:{type:'borehole'}}), snap(300)).groups.good[0];
assert(/irrigation/.test(ir.checks[0].text));
// missing info reported; no location -> rain missing, no crash
let nm = E.advise(mk('maize'), null); assert(nm.missing.length>=3);
// no crop -> empty; unmapped crop (cocoyam) -> all no evidence
assert.strictEqual(E.advise({seasons:[],soil:{},irrigation:{}},null).after,'');
const co = E.advise(mk('cocoyam'),snap(1200)); assert(Object.values(co.groups).every(g=>!g.length));
// "after" falls back to last dated past crop; chosen overrides
const hist = {seasons:[{crop:'yam',planted:'2024-04-01'},{crop:'cassava',planted:'2025-03-01'}],soil:{},irrigation:{}};
assert.strictEqual(E.advise(hist,null).after,'cassava'); assert.strictEqual(E.advise(hist,null,'yam').after,'yam');
// repeat note
assert(E.advise({seasons:[{crop:'cassava',planted:'2024-03-01'},{crop:'cassava',planted:'2025-03-01'}],soil:{},irrigation:{}},null).repeatNote);
console.log('rows in rules:', R.RULES.length, 'all engine tests passed');
