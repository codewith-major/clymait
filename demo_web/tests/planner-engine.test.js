// Run: node tests/planner-engine.test.js
const P = require(__dirname + '/../js/planner-engine.js');
const assert = require('assert');
const near = (a,b,t=1.01,m='') => assert(Math.abs(a-b)<=t, `${m} got ${a} want ${b}`);
const st = (crop, plantMonth, days) => ({crop, plantMonth, days});

// 1. single annual crop: planted Jun 15, 115 d -> bare = 365-115 = 250 days/yr
let tl = P.timeline([st('rice',6,115)]);
near(tl.cycleDays,365); near(tl.bareDays,250); near(tl.cropDays,115); near(tl.fallowDays,0);
// 2. back-to-back, no gap: cowpea Jun 15 +90 d then maize 'auto' 95d => bare is rest of year
tl = P.timeline([st('cowpea',6,90), st('maize',0,95)]);
near(tl.bareDays, 365-185); assert.strictEqual(tl.steps[1].start, tl.steps[0].end);
// 3. second crop planted in a month that already passed -> next year; cycle 2 years
tl = P.timeline([st('rice',6,115), st('maize',6,95)]);
near(tl.cycleDays,730); near(tl.bareDays,730-210);
// 4. cassava 12 months starting May: cycle=2yrs? start May15 + 365 = May15 next yr => cycle exactly 365
tl = P.timeline([st('cassava',5,365)]); near(tl.cycleDays,365); near(tl.bareDays,0);
// 5. cassava 13.5 months crosses into next year: cycle 730, bare = 730-410
tl = P.timeline([st('cassava',5,410)]); near(tl.cycleDays,730); near(tl.bareDays,320);
// invariant: cycle = bare + fallow + crop, always
for (const steps of [[st('rice',6,115),st('fallow',0,180),st('yam',3,240)], [st('maize',6,95),st('cowpea',9,90),st('groundnut',6,100)], [st('yam',3,240),st('cassava',5,365)]]) {
  const t = P.timeline(steps); near(t.cycleDays, t.bareDays+t.fallowDays+t.cropDays, 0.01, 'invariant');
  const g = P.monthGrid(steps,t); assert(g.length === Math.ceil(t.cycleDays/30.4) || Math.abs(g.length - t.cycleDays/30.4) <= 1.5, 'grid len '+g.length+' vs '+t.cycleDays);
}
// grid: rice Jun 115d -> Jun,Jul,Aug,Sep (4 crop months, Oct starts bare-ish) rest bare
let g = P.monthGrid([st('rice',6,115)], P.timeline([st('rice',6,115)]));
assert.strictEqual(g.length,12); assert.strictEqual(g[0].month,6);
assert.deepStrictEqual(g.map(c=>c.state[0]).join(''), 'ccccbbbbbbbb'.replace(/^cccc/,'cccc'), g.map(c=>c.state).join());
// validation
assert(P.validateRotation({steps:[]}).length); assert(P.validateRotation({steps:[st('fallow',6,100)]}).some(e=>/fallow/.test(e)));
assert(P.validateRotation({steps:[st('rice',0,100)]}).some(e=>/month/.test(e)));
assert(P.validateRotation({steps:[st('cassava',5,730),st('yam',3,730),st('rice',6,730)]}).some(e=>/4 years/.test(e)));
assert.deepStrictEqual(P.validateRotation({steps:[st('rice',6,115)]}),[]);

// compare with ctx
const snap = {climate:{annual_rain_mm:1200}, crops:[{key:'rice',val:30,err:12},{key:'cassava',val:35,err:15},{key:'yam',val:20,err:10}]};
const risk = {avg_longest_dry_spell_days:20, state:'X'};
const rot = (id,name,steps)=>({id,name,steps});
const ctx = (rotations, extra={}) => Object.assign({ field:{soil:{},irrigation:{}}, snap, risk, rain:1200, irrigated:false, standsDry:false, rotations, weights:{}, inputs:{} }, extra);
const cur = rot('cur','Current',[st('maize',6,95),st('maize',6,95)]);          // maize after maize: avoid
const A = rot('A','A',[st('cowpea',6,90), st('maize',0,95)]);                     // good pair, no gap
const B = rot('B','B',[st('cassava',5,365)]);                                   // monocrop cassava: avoid
const C = rot('C','C',[st('groundnut',6,100), st('maize',6,95)]);              // groundnut->maize good, maize->groundnut good
let r = P.compare(ctx([cur,A,B,C]));
const crit = k => r.criteria.find(c=>c.key===k);
assert.strictEqual(crit('soil').cells[0].standing,'behind');     // current: maize>maize avoid
assert.strictEqual(crit('soil').cells[1].standing,'ahead');      // A has good pairs (cowpea>maize) & maize>cowpea no rule
assert.strictEqual(crit('soil').cells[2].standing,'behind');
assert(!crit('income').counted && /missing/i.test(crit('income').reason));
assert(!crit('labor').counted);
assert.strictEqual(crit('water').counted,true);
// climate: current maize only -> no estimate -> not counted
assert(!crit('climate').counted);
// bare: A has fewest bare days; B cassava bare 0 -> best
const bareNums = crit('bare').cells.map(c=>Math.round(c.num));
assert(bareNums[2] < bareNums[1] && bareNums[1] < bareNums[0], bareNums.join());
// overall ranking is deterministic and has ranks 1..n
assert.deepStrictEqual(r.ranked.map(o=>o.rank),[1,2,3,4]);
// not-important excludes criterion
r = P.compare(ctx([cur,A,B,C],{weights:{bare:0}})); assert(!r.criteria.find(c=>c.key==='bare').counted);
assert(r.explanation.notCounted.some(n=>n.label==='Bare-field days'));
// income & labor from farmer numbers, hand-computed
const inputs = { yield:{maize:2, cowpea:1, cassava:10, groundnut:1.5}, price:{maize:300, cowpea:600, cassava:100, groundnut:700}, cost:{maize:200000,cowpea:100000,cassava:300000,groundnut:150000}, labor:{maize:60,cowpea:50,cassava:120,groundnut:70} };
r = P.compare(ctx([cur,A,B,C],{inputs}));
// B: cassava 10t*1000*100 = 1,000,000 - 300,000 = 700,000 per cycle(365d) => 700000/yr
near(r.rotations[2].income.perYear, 700000, 1);
// A: cowpea(600k-100k)=500k + maize(600k-200k)=400k = 900k per 365 d cycle
near(r.rotations[1].income.perYear, 900000, 1);
// C: groundnut 1.5*1000*700=1.05M-150k=900k ; maize 400k => 1.3M per 730 d => 650k/yr
near(r.rotations[3].income.perYear, 650000, 1);
near(r.rotations[3].labor.perYear, (70+60)*365/730, 0.01);
assert(r.criteria.find(c=>c.key==='income').counted);
assert.strictEqual(r.criteria.find(c=>c.key==='income').cells[1].standing,'ahead');
// missing price for one crop -> that rotation null, criterion not counted
const inp2 = JSON.parse(JSON.stringify(inputs)); delete inp2.price.cassava;
r = P.compare(ctx([cur,A,B,C],{inputs:inp2})); assert(!r.criteria.find(c=>c.key==='income').counted);
// vulnerable: yam planted Mar 15, 240 d => ends Nov 10: rainy May-Oct ~ 184 d (~6 months) ok => no yam warning
r = P.compare(ctx([rot('a','a',[st('yam',3,240)]),rot('b','b',[st('yam',10,240)]),A]));
assert(!r.rotations[0].vulnerable.warnings.some(w=>/With your dates only about/.test(w.text)));
assert(r.rotations[1].vulnerable.warnings.some(w=>/With your dates only about/.test(w.text)));  // Oct planting: mostly dry season
// tolerant crops in dry season: info only, not exposed
r = P.compare(ctx([rot('c','c',[st('cassava',5,365)]), rot('m','m',[st('maize',11,95)]), A]));
assert.strictEqual(Math.round(r.rotations[0].vulnerable.exposedPerYear),0);
assert(r.rotations[0].vulnerable.warnings.every(w=>w.level==='info'));
assert(r.rotations[1].vulnerable.exposedPerYear > 80);
// irrigation removes exposure
r = P.compare(ctx([rot('m','m',[st('maize',11,95)]), A, B],{irrigated:true})); assert.strictEqual(r.rotations[0].vulnerable.exposedPerYear,0);
// maize flowering warning only when state's dry spell stands out
r = P.compare(ctx([cur,A,B],{standsDry:true})); assert(r.rotations[0].vulnerable.warnings.some(w=>/flowering/.test(w.text)));
r = P.compare(ctx([cur,A,B],{standsDry:false})); assert(!r.rotations[0].vulnerable.warnings.some(w=>/flowering/.test(w.text)));
// pest: cowpea>maize interrupts Striga; cowpea>cowpea repeat sourced
r = P.compare(ctx([rot('p','p',[st('cowpea',6,90),st('maize',0,95)]), rot('q','q',[st('cowpea',6,90),st('cowpea',6,90)]), A]));
assert(r.rotations[0].pest.interrupts.some(x=>/Striga/.test(x.what))); assert.strictEqual(r.rotations[1].pest.repeats.length,2);
// weeds note
r = P.compare(ctx([rot('p','p',[st('cowpea',6,90),st('maize',0,95)]),cur,B],{recordedWeeds:true})); assert(r.rotations[0].notes.length===1);
// explanation: status & no 0-100 anywhere, no waiting time
r = P.compare(ctx([cur,A,B,C]));
const ex = r.explanation; assert(['clear','narrow','tie'].includes(ex.status)); assert(ex.headline.length>10); assert(ex.caveats.length>=4);
const blob = JSON.stringify(r.explanation).toLowerCase(); assert(!/resilience score/.test(blob)); assert(!/wait (\d+|for)/.test(blob));
// leader is not 'cur' (maize after maize is avoided) and vsCurrent populated
assert.notStrictEqual(ex.leaderId,'cur'); assert(ex.vsCurrent.length>0);
// identical rotations => tie
r = P.compare(ctx([rot('1','1',[st('rice',6,115)]),rot('2','2',[st('rice',6,115)]),rot('3','3',[st('rice',6,115)]),rot('4','4',[st('rice',6,115)])]));
assert.strictEqual(r.explanation.status,'tie');
// no location: water not counted; no snap ok
r = P.compare(ctx([cur,A,B],{snap:null,rain:null})); assert(!r.criteria.find(c=>c.key==='water').counted);
// suggestions: >=3, none equal to current, no avoid pairs, valid
const sg = P.suggest(ctx([]), A.steps, 3); assert.strictEqual(sg.length,3);
sg.forEach(steps=>{ assert.deepStrictEqual(P.validateRotation({steps}),[]); assert.notStrictEqual(P.canonicalKey(steps.map(s=>s.crop)), P.canonicalKey(A.steps.map(s=>s.crop))); });
console.log('suggestions:', sg.map(s=>s.map(x=>x.crop).join('>')).join(' | '));
// suggestions drop low-climate crops
const lowSnap = {climate:{annual_rain_mm:300}, crops:[{key:'rice',val:2,err:12},{key:'cassava',val:3,err:15},{key:'yam',val:1,err:10}]};
const sg2 = P.suggest(ctx([],{snap:lowSnap}), [], 3); sg2.forEach(s=>s.forEach(x=>assert(!['rice','cassava','yam'].includes(x.crop))));
console.log('low-climate suggestions:', sg2.map(s=>s.map(x=>x.crop).join('>')).join(' | '));
console.log('planner engine: all tests passed');
