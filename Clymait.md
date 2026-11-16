# Clymait

Nov 16, 2026 · @Blase

**Track:** Climate · **Solo****:** Joshua Onosedeba Esezobor · **Demo: (https://github.com/codewith-major/clymait/blob/main/demo_web/index.html)**

## The problem

Smallholder farmers in Nigeria choose crops and rotations while rainfall swings from year to year (9–16% in the five states we checked), and a wrong choice can cost a whole season. They know their land well, but they rarely see climate risk, crop fit and rotation effects side by side, and many have slow or no internet. Clymait puts that view on a phone, and it keeps working offline.

## What we built

Clymait is a web app for Nigerian farms. A farmer taps a place on a map (288 squares of about 55 km) or saves a field profile with location, soil, drainage and crop history. It returns:

- **Climate suitability** for rice, cassava and yam, each with its typical error, plus a rainfall what-if slider from −20% to +20%.
- **Measured climate risk** for the state: a stress index ranked among 37 states, drought history since 1981, dry spells and heat, with plain-language reasons.
- **Next-crop options** for a field, from sourced rotation rules, checked against its drainage, soil texture and pH.
- **A rotation planner.** The farmer enters the current rotation and builds at least three alternatives. The app compares them on ten criteria: climate suitability, drought risk, water demand, soil-health trend, pest-cycle interruption, bare-field days, vulnerable-season risk, income, labor and an overall standing weighted by the farmer's priorities. It explains in plain words why one comes out ahead.
- **Saved plans, feedback and recorded outcomes**, so results from a season can be compared with what the app said.

Everything runs in the browser from files stored on the device. It works offline, installs on a phone, and sends no data anywhere. It is hosted on Vercel as a static site.

## How it works

**Data**

- **Labels: FAO GAEZ v5** (rainfed, low input, 2001–2020) suitability for wetland rice, dryland rice, cassava and yam. We cut Nigeria into 288 half-degree squares (kept if at least half the square lies inside Nigeria). Each square's label is the mean over its pixels, with zeros counted as zero, divided by 100. Rice takes the higher of dryland and wetland.
- **Rainfall: CHIRPS v3.0** monthly rainfall for 325 points (the 288 squares and 37 state points): 97,500 monthly values, none missing. We derive yearly rainfall, dry months (under 50 mm) and rainy-season rainfall.
- **Temperature and heat: NASA POWER** daily data, 2000–2025, for 37 state-capital points. We summarize the May–October season: temperature, days at 35°C or more, longest dry spell. Square-level means (2001–2020) are used as model inputs.
- **Drought history: SPEIbase 2.11**, the 6-month index (1901–2024). We take October per state (average over a ±0.5° box) and count drought as an index of −1 or lower, giving drought frequency since 1981.
- **Rotation rules** from FAO, IITA, ICRISAT and Nigerian trials, kept as data with the source, how much of it we read, and a status for each rule.

**Cleaning problems we found and fixed**

- GAEZ marks “no data” as 0, so state means skipped unsuitable cells. We rebuilt them using the share of suitable cells.
- NASA POWER rain is on a coarse grid (about 50 km): neighboring states had identical values and rainfall variability looked implausible (83% for Plateau). We replaced rainfall with CHIRPS, which gives 9–16% for the states we checked.
- FAOSTAT national yields correlated weakly with climate (all below 0.3) and are national only, so we dropped them as a training label.

**Model**

For each crop we compared a one-input rainfall curve, ridge regression, random forest and gradient boosting. Scoring used spatial cross-validation: 2° × 2° blocks of squares are held out together, so the model is always tested on places it has not seen. We shipped the simplest model close to the best: a rainfall curve for cassava and rice, and a three-input random forest (yearly rainfall, dry months, season temperature) for yam. A simple, inspectable model is easier to explain to farmers and small enough to run offline in the browser.

The rotation comparison is not a trained model. It is a transparent rule engine over sourced rules, measured data and the farmer's own numbers. Income and labor come only from figures the farmer types in, and the overall result is a tally of where each rotation is ahead or behind, not an invented score.

## Results

Our rainfall-curve baseline scored R² 0.35 / 0.40 / 0.29 (cassava / yam / rice) on held-out squares. The shipped models score 0.53 / 0.51 / 0.42. Almost all of that gain came from better rainfall data (CHIRPS in place of NASA POWER), not from a more complex model.

| Crop | Baseline: rainfall curve, POWER rain | Full model, POWER rain | Baseline: rainfall curve, CHIRPS rain | Full model, CHIRPS rain | Shipped model (R²) |
| --- | --- | --- | --- | --- | --- |
| Cassava | 0.35 | 0.54 | 0.53 | 0.52 | Rainfall curve (0.53) |
| Yam | 0.40 | 0.49 | 0.49 | 0.51 | Random forest, 3 inputs (0.51) |
| Rice | 0.29 | 0.41 | 0.42 | 0.42 | Rainfall curve (0.42) |

R² is on 2° × 2° blocks of squares held out together. “Full model” is the best of random forest and gradient boosting. For the shipped models the average error is 9.3 / 6.3 / 7.7 suitability points (cassava / yam / rice), and 80% of squares fall within ±15.3 / 10.6 / 12.5 points. The app shows this error range beside every estimate.

Other measured results:

- **Rainfall and drought agree more with CHIRPS.** Within-state correlation between rainfall and the SPEI drought index rose from 0.30 (POWER) to 0.39 (CHIRPS).
- **Risk ranking.** Highest climate stress: Borno 98, Katsina 95, Sokoto 92, Yobe 91, Jigawa 84. Lowest: Imo 22, Enugu and Abia 23.
- **Drought forecasting failed, so we did not ship it.** Trained on 2000–2016 and tested on 2017–2024, the classifier's AUC was between 0.47 and 0.66 across variants, against 0.5 for chance. Training years were 14% drought and test years 5.7% (about 17 cases), so it is too noisy to trust. The app shows measured drought history instead.
- **Rotation planner.** The rule engine and the comparison engine have automated tests: every rule row maps to its expected tier, and the calendar, bare-field days, income and labor are checked against hand-computed cases. We also ran the full flow (compare, save, feedback, export) in a browser at phone width, offline, and under a strict Content-Security-Policy. It has not yet been tested with farmers.

**Where it fails, and why we think so**

- **Climate alone explains about half.** R² of 0.42–0.53 means the rest is unexplained. Soil and terrain are not in the model, and the GAEZ labels are themselves a model's estimate, not measured harvests. Rice is weakest (0.42).
- **More rain can lower a score.** In GAEZ, very wet places rate lower for these crops, so the what-if slider can show a drop. The yam model also moves in uneven steps. We say so in the app.
- **An unexplained drought pattern.** SPEI shows drought in 45% of recent years for Akwa Ibom and Cross River, and 35% for Adamawa and Taraba. It could be real or a data issue. We flag it in the app and do not report it as a finding.
- **Coarse geography.** Squares are about 55 km wide, and each square is assigned to the nearest state capital, so state names near borders are approximate.
- **Rotation advice is draft.** The rules have not been reviewed by an agronomist. Several come from a single site and some from outside Nigeria. The app has no monthly rainfall yet, so planting months are the farmer's own entries. There is no yield or price data, so income and labor use only what the farmer types in.

## What we'd do next

1. **Add soil, terrain and monthly rainfall.** Soil (SoilGrids) and elevation are the biggest gap. We would re-run the same spatial cross-validation and check whether R² rises above today's 0.53 / 0.51 / 0.42. Monthly rainfall would also let the planner check real planting windows instead of the farmer's own months.
2. **Get the rotation rules reviewed, then test with farmers.** An agronomist or extension officer would check the rules table, starting with the rows marked as awaiting review. A small pilot would then use the app's feedback and outcome forms to compare what Clymait said with what happened in the field.

## Sources

**Datasets**

- [CHIRPS v3.0 rainfall, Climate Hazards Center (UC Santa Barbara)](https://www.chc.ucsb.edu/data/chirps)
- [NASA POWER daily meteorology](https://power.larc.nasa.gov/)
- [SPEIbase 2.11 drought index](https://spei.csic.es/database.html)
- [FAO GAEZ v5 crop suitability](https://gaez.fao.org/)
- [FAOSTAT crop yields](https://www.fao.org/faostat/) (examined, then dropped as a label)

**Rotation rules and crop needs** (each rule in the app lists its source and how much we read)

- [FAO, Save and Grow: Cassava](https://fao.org/4/i3278e/i3278e.pdf) and [FAO cassava ecology](https://www.fao.org/3/y2413e/y2413e07.htm)
- [IITA cassava guide](https://www.iita.org/wp-content/uploads/2016/06/Cassava_system_cropping_guide.pdf) and [Growing cassava in Nigeria](https://iita.org/wp-content/uploads/2016/06/Growing_cassava_in_Nigeria.pdf)
- [IITA legume–maize paper](https://biblio.iita.org/documents/S03ArtSangingaSustainableInthomNodev.pdf-b04ae706126adb60e6b69f60511df375.pdf) and [Yusuf et al. 2009](https://cgspace.cgiar.org/items/96624091-7e49-4e36-902d-384475ae564d)
- [ICRISAT, Groundnut production in Nigeria](https://oar.icrisat.org/8856/1/2015-084%20Gnut%20Production%20in%20Nigeria.pdf)
- [Dugje et al. 2009, IITA Farmers' Guide to Cowpea Production](https://biblio.iita.org/documents/U09BkDugjeCowpeaNothomDev.pdf-2d43f99e2931b42cabd0c29954f0d2c9.pdf)
- [Worou et al. 2017](https://core.ac.uk/download/493000748.pdf) (upland rice, Benin)
- [Kikuno et al. 2015, rice–yam rotation at IITA Ibadan](https://www.jstage.jst.go.jp/article/jsta/59/3/59_146/_article/-char/en)
- [IITA, cowpea in an inland valley rice fallow](https://biblio1.iita.org/handle/20.500.12478/6044)
- [ISTRC symposium paper from Umudike](https://istrc.net/images/Documents/Symposiums/Third/3rd_symposium_proceedings_65.pdf)
- [IITA yam paper (Asiedu)](https://biblio.iita.org/documents/S03ProcAsieduYamNothomNodev.pdf-311a4d12f05d6157b5a0a18f32e1b24b.pdf) and [Dumet and Ogunsola, Yams](https://genebanks.cgiar.org/resources/publications/yam-en)
- [NAERLS Bulletin 230, rice production](https://naerls.gov.ng/wp-content/uploads/2022/11/Rice-Production-Processing-Utilization-and-Marketing-in-Nigeria.pdf), [IITA rice guide](https://www.iita.org/wp-content/uploads/2020/07/Guide-to-Rice-Production-in-Northern-Nigeria.pdf) and [IITA maize guide](https://www.iita.org/wp-content/uploads/2020/07/Guide-to-Maize-Production-in-Northern-Nigeria.pdf)
- Tiamiyu et al., Journal of Sustainable Agriculture 29:43–51, and Adigbo et al. 2007, Agronomy Journal 99:377–383 (abstracts only; no link added)

**Software and tools**

- Python with pandas, numpy, scikit-learn, xarray and matplotlib; Google Colab for the CHIRPS extraction; VS Code.
- The web app is plain HTML, CSS and JavaScript, hosted on Vercel.
- **AI tools:** Claude (Anthropic) was used to write and review code, draft the rotation-rules table from the sources, build the web app and draft this write-up. Perplexity was used for the research log. I ran the data pipeline and checked the results.
- No pretrained models were used.
- Dashboard screenshots supplied by the team were used as visual inspiration only; all artwork in the app was drawn for this project.
