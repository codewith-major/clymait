/* Clymait – rotation rules, from "Clymait rotation rules: draft 2 with sources" (15 Nov 2026).
   DRAFT GUIDANCE: not yet reviewed by an agronomist. Every rule keeps its source and how much of the
   source was read. No source gives a safe waiting time before repeating a crop, so none is stated here.

   tier:   'good'     the sources report a benefit
           'practice' common practice or single-site / abstract-only evidence
           'mixed'    sources or sites disagree
           'avoid'    the sources advise against repeating
   review: true = the draft asks for an agronomist to check this row first
   from / to use the crop keys of the field form (rice, cassava, yam, maize, cowpea, groundnut, sorghum, millet, fallow). */
(function (root) {
  'use strict';

  var S = {
    saveGrowCassava: { title: 'FAO Save and Grow: Cassava', url: 'https://fao.org/4/i3278e/i3278e.pdf', depth: 'carried from draft 1' },
    iitaCassava: { title: 'IITA cassava guide', url: 'https://www.iita.org/wp-content/uploads/2016/06/Cassava_system_cropping_guide.pdf', depth: 'carried from draft 1' },
    istrc: { title: 'ISTRC symposium paper, Umudike', url: 'https://istrc.net/images/Documents/Symposiums/Third/3rd_symposium_proceedings_65.pdf', depth: 'excerpt' },
    iitaLegumeMaize: { title: 'IITA legume-maize paper', url: 'https://biblio.iita.org/documents/S03ArtSangingaSustainableInthomNodev.pdf-b04ae706126adb60e6b69f60511df375.pdf', depth: 'carried from draft 1' },
    yusuf: { title: 'Yusuf et al. 2009', url: 'https://cgspace.cgiar.org/items/96624091-7e49-4e36-902d-384475ae564d', depth: 'abstract' },
    icrisat: { title: 'ICRISAT, Groundnut production in Nigeria', url: 'https://oar.icrisat.org/8856/1/2015-084%20Gnut%20Production%20in%20Nigeria.pdf', depth: 'carried from draft 1' },
    dugje: { title: 'Dugje et al. 2009, IITA Farmers’ Guide to Cowpea Production', url: 'https://biblio.iita.org/documents/U09BkDugjeCowpeaNothomDev.pdf-2d43f99e2931b42cabd0c29954f0d2c9.pdf', depth: 'full text' },
    worou: { title: 'Worou et al. 2017', url: 'https://core.ac.uk/download/493000748.pdf', depth: 'carried from draft 1' },
    kikuno: { title: 'Kikuno et al. 2015, Tropical Agriculture and Development 59(3)', url: 'https://www.jstage.jst.go.jp/article/jsta/59/3/59_146/_article/-char/en', depth: 'abstract' },
    tiamiyu: { title: 'Tiamiyu et al., Journal of Sustainable Agriculture 29:43-51', url: '', depth: 'abstract' },
    adigbo: { title: 'Adigbo et al. 2007, Agronomy Journal 99:377-383', url: '', depth: 'abstract' },
    iitaInlandValley: { title: 'IITA repository, cowpea in an inland valley rice fallow', url: 'https://biblio1.iita.org/handle/20.500.12478/6044', depth: 'abstract' },
    asiedu: { title: 'IITA yam paper (Asiedu)', url: 'https://biblio.iita.org/documents/S03ProcAsieduYamNothomNodev.pdf-311a4d12f05d6157b5a0a18f32e1b24b.pdf', depth: 'p. 468' },
    yams: { title: 'Dumet and Ogunsola, Yams', url: 'https://genebanks.cgiar.org/resources/publications/yam-en', depth: 'excerpt' }
  };

  var RULES = [
    { id: 'A', from: ['cowpea', 'groundnut'], to: ['cassava'], tier: 'good', status: 'Verified', review: false,
      headline: 'Legumes before cassava are a good fit',
      evidence: 'Legumes (groundnut, cowpea, soybean) fix nitrogen for the next cassava crop. Yam, legumes, melons and maize are generally planted before cassava.',
      sources: [S.saveGrowCassava, S.iitaCassava] },
    { id: 'B', from: ['yam'], to: ['cassava'], tier: 'practice', status: 'Verified', review: false,
      headline: 'Cassava after yam is common practice',
      evidence: 'IITA describes this as what farmers do, not a measured benefit.',
      sources: [S.iitaCassava] },
    { id: 'C1', from: ['fallow'], to: ['yam'], tier: 'practice', status: 'Verified', review: true,
      headline: 'Yam is the traditional first crop after fallow',
      evidence: 'In eastern Nigeria’s traditional rotation, yam is the first crop after fallow and minor crops (maize, melon, cowpea and others) are interplanted. This describes practice, not a measured effect.',
      sources: [S.istrc] },
    { id: 'C2', from: ['cassava'], to: ['fallow'], tier: 'practice', status: 'Verified', review: true,
      headline: 'Cassava is traditionally the last crop before fallow',
      evidence: 'In the same traditional rotation, cassava is the last crop before the land returns to bush fallow. This describes practice, not a measured effect.',
      sources: [S.istrc] },
    { id: 'D', from: ['cassava'], to: ['maize'], tier: 'good', status: 'Verified', review: false,
      headline: 'Maize after cassava is good where cereals are grown',
      evidence: 'Maize benefits from nitrogen released by decomposing cassava leaves. Cassava is rarely rotated with cereals on poor soils.',
      sources: [S.saveGrowCassava] },
    { id: 'E', from: ['cassava'], to: ['cassava'], tier: 'avoid', status: 'Verified; Nigerian thresholds need review', review: true,
      headline: 'Avoid cassava after cassava',
      evidence: 'Unfertilized monocropped cassava fell from 37 to 12 t/ha over nine years in Colombia, and rotation restored about 30 t/ha. This is not Nigerian data.',
      sources: [S.saveGrowCassava] },
    { id: 'F', from: ['cowpea'], to: ['maize'], tier: 'good', status: 'Verified', review: false,
      headline: 'Maize after cowpea is a good fit',
      evidence: 'Maize after soybean yielded 1.2 to 2.3 times maize after maize, and cowpea gives about 30 kg N/ha to the next maize. A second study in the northern Guinea savanna found maize after legumes yielded 1.2 times maize after fallow and 1.3 times maize after maize.',
      sources: [S.iitaLegumeMaize, S.yusuf] },
    { id: 'G', from: ['maize'], to: ['maize'], tier: 'avoid', status: 'Verified', review: false,
      headline: 'Avoid maize after maize',
      evidence: 'Continuous maize yielded less than maize after soybean, and less than maize after legumes in the second study.',
      sources: [S.iitaLegumeMaize, S.yusuf] },
    { id: 'H', from: ['groundnut'], to: ['maize'], tier: 'good', status: 'Verified', review: false,
      headline: 'Maize after groundnut is a good fit',
      evidence: '“Groundnut-cereal rotation is ideal.” Groundnut fixes nitrogen for the next cereal.',
      sources: [S.icrisat] },
    { id: 'I', from: ['maize', 'sorghum', 'millet'], to: ['groundnut'], tier: 'good', status: 'Verified', review: false,
      pest: { interrupts: ['groundnut leaf miner', 'groundnut leaf spot (partial control, with maize)'] },
      headline: 'Groundnut after a cereal is a good fit',
      evidence: 'Groundnut uses residual cereal fertilizer. Rotating with a cereal reduces leaf miner and gives partial leaf spot control (with maize).',
      sources: [S.icrisat] },
    { id: 'J', from: ['cowpea'], to: ['maize', 'sorghum', 'millet'], tier: 'good', status: 'Verified', review: false,
      pest: { interrupts: ['Striga gesnerioides, a parasitic weed of cowpea'] },
      headline: 'Cereals after cowpea are a good fit',
      evidence: 'Cowpea supplies soil nitrogen to cereals grown after it, especially where fertility is poor. A cowpea-cereal rotation is also named as an affordable control for Striga gesnerioides, a parasitic weed widespread in low-rainfall, low-fertility areas of the northern Guinea and Sudan savanna.',
      sources: [S.dugje] },
    { id: 'K', from: ['cowpea'], to: ['cowpea'], tier: 'avoid', status: 'Verified, generic; length of break needs review', review: true,
      pest: { repeatRisk: ['cowpea diseases (anthracnose, Fusarium wilt, stem and root rots)'] },
      headline: 'Rotate away from cowpea after cowpea',
      evidence: 'The guide lists crop rotation among the measures against cowpea diseases (anthracnose, Fusarium wilt, stem and root rots and others). It gives no minimum break. It also says to clear haulms from the previous crop, because pod-sucking bugs overseason in them.',
      sources: [S.dugje] },
    { id: 'L', from: ['cowpea'], to: ['rice'], tier: 'mixed', status: 'Mixed; needs review', review: true,
      assumes: 'This was a cowpea/maize intercrop before upland rice',
      headline: 'Upland rice after a cowpea/maize intercrop depends on the zone',
      evidence: 'In Benin, rice after the intercrop gave 3.52 t/ha against 2.66 after natural fallow in the Guinean zone, but 31% less in the Sudano-Guinean zone. Upland NERICA only, and not Nigeria.',
      sources: [S.worou] },
    { id: 'M', from: ['rice'], to: ['yam'], tier: 'practice', status: 'Verified', review: true,
      assumes: 'Lowland rice, with yam planted in the off-season',
      headline: 'Yam after lowland rice is feasible',
      evidence: 'At IITA Ibadan, yam planted February to September after lowland rice (September to January) worked as a rice-yam-rice rotation. Nitrogen on the yam raised tuber yield. One site, one rotation cycle.',
      sources: [S.kikuno] },
    { id: 'N', from: ['yam'], to: ['rice'], tier: 'practice', status: 'Verified', review: true,
      assumes: 'Lowland rice',
      headline: 'Rice after yam: no yield penalty seen, and no extra benefit',
      evidence: 'In the same trial, rice yields before and after the intervening yam were comparable, and yam left no extra effective nutrients for the next rice. So yam did not hurt the next rice, and did not help it either.',
      sources: [S.kikuno] },
    { id: 'O', from: ['cowpea', 'groundnut'], to: ['rice'], tier: 'mixed', status: 'Mixed; needs review', review: true,
      assumes: 'Lowland rice; the trial used cowpea or other legumes',
      headline: 'Lowland rice after a legume: results differ between years',
      evidence: 'At Badeggi, rice after cowpea with 30 kg/ha N gave the highest yield in year 1. In year 2, rice after cassava with 90 kg/ha N out-yielded rice after legumes.',
      sources: [S.tiamiyu] },
    { id: 'P', from: ['rice'], to: ['cowpea'], tier: 'practice', status: 'Verified', review: true,
      assumes: 'Lowland rice in an inland valley, with cowpea in the dry season',
      headline: 'Dry-season cowpea after lowland rice is feasible',
      evidence: 'An Abeokuta study found lowland rice yields were similar with or without a following upland rice crop. A central Nigeria study found minimum tillage with mulch the least risky seedbed for dry-season cowpea in a rice fallow.',
      sources: [S.adigbo, S.iitaInlandValley] }
  ];

  // Row Q: no rotation evidence found. Shown as "no evidence", never ranked or guessed.
  var NO_RULE = {
    id: 'Q', status: 'No rule yet',
    text: 'No rotation source was found for yam after cereals or legumes, upland rice after other crops, or rice after rice. The IITA yam paper says shortened fallows lower fertility and let pests build up, but it gives no rotation rule.',
    sources: [S.asiedu, S.yams]
  };

  /* Crop needs from the same draft. null = the sources read do not say. Ranges are general guides, not checked for Nigeria. */
  var CROP_REQ = {
    rice: { label: 'Rice', rain: { min: 1200, max: 1600, text: '1,200–1,600 mm, evenly spread. Upland sites need over 700 mm on good soil.', hardMin: 700 },
      ph: { min: 5.5, max: 7.0 }, textureNote: 'Heavy soil; best yields at 40–60% clay', badTexture: ['sand', 'loamy_sand'],
      drainageNote: 'Good, but not excessive', days: '100–130 days' },
    maize: { label: 'Maize', rain: { min: 480, max: null, text: 'At least 480–880 mm, well spread. A dry spell at flowering can cut yield by 30–35%.' },
      ph: null, textureNote: 'Not stated. Savanna soils are low in N, P and K.', badTexture: [], drainageNote: 'Sown on ridges 75 cm apart', days: '80–110 days for grain' },
    groundnut: { label: 'Groundnut', rain: { min: 450, max: 1250, text: '450–1,250 mm, evenly spread' },
      ph: { min: 6.5, max: 7.0, limeBelow: 5.8 }, textureNote: 'Sandy loam or sandy clay loam. Heavy soils unsuitable.', badTexture: ['clay'], poorDrainageBad: true,
      drainageNote: 'Well drained. Ridges where rain exceeds 1,000 mm.', days: '80–120 days by variety' },
    cowpea: { label: 'Cowpea', rain: { min: 500, max: 1200, text: '500–1,200 mm a year. Early and extra-early varieties can grow where rainfall is under 500 mm.' },
      ph: { min: 6.0, max: 7.0 }, textureNote: 'Best on well-drained sandy loam to clay loam. Tolerates drought and poor sandy soils.', badTexture: [], poorDrainageBad: true,
      drainageNote: 'Does not tolerate waterlogging or poorly drained soil', days: '60–120 days (extra-early 60–69, early 70–79, medium 80–89, late 90–120)' },
    cassava: { label: 'Cassava', rain: { min: 1000, max: 1500, text: 'Best at 1,000–1,500 mm well distributed. Tolerates semi-arid conditions down to about 500 mm.', hardMin: 500 },
      ph: { min: 4.5, max: 6.5 }, textureNote: 'Deep, light-textured, well-drained soil of medium fertility. Avoid very sandy or clayey soils.', badTexture: ['sand', 'loamy_sand', 'clay'], poorDrainageBad: true,
      drainageNote: 'Poor in poorly drained soils. Waterlogged soils need ridges or mounds.', days: '9–18 months' },
    yam: { label: 'Yam', rain: { min: 1000, max: 1500, text: '1,000–1,500 mm well distributed over 6–7 months. Distribution matters more than volume.' },
      ph: null, phNote: 'close to neutral', textureNote: 'Loose, deep, free-draining, fertile soil', badTexture: [], poorDrainageBad: true,
      drainageNote: 'Well drained', days: 'About 8 months in the field' }
  };

  /* Planner facts. days = typical time in the field (the middle of the range in the draft; editable by the farmer).
     drought: 'tolerant' or 'sensitive' ONLY where a source says so; otherwise 'unstated'.
     plantMonth = placeholder planting month (1-12). The draft has no planting windows, so the farmer must set these. */
  var CROP_FACTS = {
    rice: { label: 'Rice', short: 'Ri', days: 115, range: '100\u2013130 days', plantMonth: 6, drought: 'unstated',
      droughtNote: 'The guides ask for 1,200\u20131,600 mm evenly spread. They do not say how well rice copes with a dry spell.' },
    maize: { label: 'Maize', short: 'Ma', days: 95, range: '80\u2013110 days for grain', plantMonth: 6, drought: 'sensitive',
      droughtNote: 'A dry spell at flowering can cut yield by 30\u201335% (IITA maize guide).' },
    groundnut: { label: 'Groundnut', short: 'Gn', days: 100, range: '80\u2013120 days by variety', plantMonth: 6, drought: 'unstated',
      droughtNote: 'The guide asks for 450\u20131,250 mm evenly spread. It does not rate drought tolerance.' },
    cowpea: { label: 'Cowpea', short: 'Cp', days: 90, range: '60\u2013120 days by variety', plantMonth: 7, drought: 'tolerant',
      droughtNote: 'Tolerates drought and poor sandy soils; early and extra-early varieties can grow where rain is under 500 mm (IITA cowpea guide).' },
    cassava: { label: 'Cassava', short: 'Ca', days: 365, range: '9\u201318 months', plantMonth: 5, drought: 'tolerant',
      droughtNote: 'Tolerates semi-arid conditions down to about 500 mm, and once established can grow on about 400 mm (FAO).' },
    yam: { label: 'Yam', short: 'Ya', days: 240, range: 'about 8 months in the field', plantMonth: 3, drought: 'sensitive',
      droughtNote: 'Needs rain for at least 5 of its roughly 8 months in the field; distribution matters more than volume (IITA).' },
    fallow: { label: 'Fallow (rest the land)', short: 'Fa', days: 180, range: 'set by the farmer', plantMonth: 0, drought: 'unstated', droughtNote: '' }
  };

  var api = { RULES: RULES, NO_RULE: NO_RULE, CROP_REQ: CROP_REQ, CROP_FACTS: CROP_FACTS, VERSION: 'draft-2 2026-11-15' };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CLYMAIT_RULES = api;
})(typeof window !== 'undefined' ? window : globalThis);
