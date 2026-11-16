# Clymait – Veritas AI Climate track submission draft

Nov 15, 2026 · @Blasé

## Abstract

Farmers in Nigeria choose what to plant with little local information about how rainfall and heat will treat each crop. We built Clymait, a free offline web app that estimates climate suitability for rice, cassava and yam in 288 half-degree squares covering Nigeria, and reports measured climate risk for each state. Models trained on rainfall, dry months and temperature, and scored on squares they had not seen, explain 42% to 53% of the variation in FAO GAEZ suitability ratings, with typical errors of 6 to 9 points on a 100-point scale. The estimates track Nigeria's north–south climate gradient, so the rainfall what-if compares wetter and drier places, not one field across wet and dry years. Our main finding is that switching from NASA POWER rainfall to CHIRPS lifted a one-input rainfall curve to the accuracy of the full models, so we ship the simpler models. A drought prediction model did not beat chance, so we report measured past drought instead. Clymait is climate screening, not a forecast, and it shows its error with every result.

## Problem statement

Adapting to a changing climate starts with a simple question that farmers and extension officers cannot easily answer: which crop does the climate of this place favour, and how risky has that climate been?

Nigeria spans humid forest, savanna and semi-arid north, so the answer differs sharply over short distances. National statistics hide that difference, and detailed climate datasets are hard for a farmer to read. Our question was narrow: can open climate data and a simple, tested model give a clear first answer for rice, cassava and yam, with honest error bars?

We did not try to predict yields or droughts. The goal is a screening tool that helps people decide where to look more closely, and that says plainly how far to trust it.

## Data

We built one table of 288 half-degree squares (about 55 km each) covering Nigeria, with climate inputs and a suitability label for each.

| Source | Used for |
| --- | --- |
| FAO GAEZ v5 (rainfed, low input, 2001–2020) | The label: crop suitability for wetland rice, dryland rice, cassava and yam |
| CHIRPS v3.0 | Monthly rainfall for 288 squares and 37 state points: yearly total, dry months (under 50 mm), variability |
| NASA POWER | Temperature and hot days (35°C or above) |
| SPEIbase 2.11 | Drought history: October 6-month index, drought at −1 or lower, 1981–2024 |

**Building the grid.** A square counts as inside Nigeria if at least half of it holds GAEZ data. Its suitability is the mean over pixels inside the country, counting unsuitable pixels as zero, divided by 100. Rice takes the higher of dryland and wetland. The CHIRPS extraction returned 97,500 monthly rows with no failed months.

**What we tried and dropped**

- **FAOSTAT national yields** as the label. Correlations with climate were all weak (below 0.3) and the data are national only.
- **NASA POWER rainfall** as the main rainfall input. It is coarse (about 50 km), so neighbouring states shared identical values, and rainfall variability looked implausible (83% for Plateau). CHIRPS gave 9% to 16% and agreed better with the drought index (within-state correlation 0.39, up from 0.30).

## Methods

**Suitability models.** For each crop we compared a one-input rainfall curve (yearly rainfall) against Ridge regression, random forest and gradient boosting, using rainfall, dry months and temperature as inputs. We shipped the simplest model that came close to the best.

**Why spatial cross-validation.** Neighbouring squares have similar climate and similar labels. A random train-test split would let the model see a near-copy of each test square and look better than it is. Instead we held out whole 2° by 2° blocks of squares, so every score is on places the model never saw. The estimates shown in the app are these held-out predictions.

**Typical error.** For each crop we report the average error and the size that 80% of errors stay below, so the app can show an error range beside each result.

**Rainfall what-if.** The slider adds the change the final model predicts for a rainfall shift (−20% to +20%) to the held-out estimate. It varies rainfall only. We did not vary temperature, because a model trained across places cannot predict what warming would do in one place.

**Drought model.** We trained a classifier to predict drought years (October SPEI-06 at −1 or lower) on 2000–2016 and tested it on 2017–2024.

**Risk table.** Separately, we measured each state's climate stress from past data: rainfall variability, longest dry spells, hot days and drought history, combined into a 0–100 index and ranked.

## How the models respond to climate

Across the 288 squares, estimated suitability rises with rainfall and falls with dry months and heat. The models see only these climate variables, so everything they say about a crop traces back to them.

**Correlation of each crop's held-out estimate with each climate input (288 squares)**

| Climate input | Rice | Cassava | Yam |
| --- | --- | --- | --- |
| Yearly rainfall | 0.57 | 0.55 | 0.49 |
| Dry months | −0.72 | −0.71 | −0.67 |
| Mean season temperature | −0.84 | −0.85 | −0.71 |

**Average change in estimated suitability (points) when rainfall shifts ±20%, by how wet the square is**

| Yearly rainfall | Squares | Rice −20% | Rice +20% | Cassava −20% | Cassava +20% | Yam −20% | Yam +20% |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Under 800 mm | 45 | −5.1 | +4.7 | −5.9 | +6.6 | −0.5 | −0.5 |
| 800–1,300 mm | 106 | −6.3 | +5.0 | −9.2 | +7.3 | −2.0 | +6.1 |
| Over 1,300 mm | 137 | −3.0 | −0.3 | −4.0 | −0.6 | −3.9 | +1.6 |

What this shows: in the drier north, more rain raises rice and cassava suitability by about 5 to 7 points. In the wettest squares, more rain adds almost nothing, while less rain still costs 3 to 4 points. The yam model barely responds in the driest squares.

**An important caveat.** Rainfall, dry months and temperature move together from north to south. Yearly rainfall correlates −0.91 with dry months and −0.70 with temperature across the squares. The rice and cassava models use rainfall only, yet their estimates track temperature even more closely (−0.84 and −0.85), so the rainfall curve partly stands in for the whole north–south climate gradient. The correlations describe the model's estimates across places, not a measured effect of climate on yield. For the same reason, the slider shows how estimates differ between wetter and drier places, not how one field would respond to a wet or dry year.

## Results

Better rainfall data did more than a better model: with CHIRPS, a single rainfall curve matched the full models for all three crops.

**Suitability, R² on held-out squares**

| Crop | NASA POWER rainfall: curve | NASA POWER rainfall: best model | CHIRPS rainfall: curve | CHIRPS rainfall: best model | Shipped (R², average error in points) |
| --- | --- | --- | --- | --- | --- |
| Cassava | 0.35 | 0.54 | 0.53 | 0.52 | Rainfall curve (0.53, 9.3) |
| Yam | 0.40 | 0.49 | 0.49 | 0.51 | Random forest, 3 inputs (0.51, 6.3) |
| Rice | 0.29 | 0.41 | 0.42 | 0.42 | Rainfall curve (0.42, 7.7) |

The most useful inputs were yearly rainfall, dry months and temperature. Climate alone explains about half of the GAEZ rating. Soil and terrain, which we did not include, are the likely missing part.

**Drought model: failed.** On 2017–2024, the classifier's test AUC ranged from 0.47 to 0.66 across the variants we tried, close to the 0.5 of a coin flip. Training years were 14% drought and test years 5.7%, only about 17 drought cases, so even the better scores are too noisy to trust. We did not ship it.

**Measured risk instead.** The risk table ranks states by observed climate stress. Highest: Borno (98), Katsina (95), Sokoto (92), Yobe (91). Lowest: Imo (22), Enugu and Abia (23).

**One result we cannot explain.** The drought index flags drought in 45% of recent years for Akwa Ibom and Cross River, and 35% for Adamawa and Taraba. It could be real or a data problem, so we flag it in the app and do not report it as a finding.

## The tool

Clymait is a static web app: one page, no server, no account. It runs from precomputed data, installs on a phone and keeps working offline.

**What a user sees**

- A map of the 288 squares, coloured by suitability or climate stress. Users pick a square by tapping, choosing a state, using the phone's location, or using the keyboard.
- A ranking of rice, cassava and yam with a 0–100 score and "typical error ± N points". When the top two crops differ by less than their typical error, the app says they are about the same.
- A rainfall what-if slider from −20% to +20%.
- The state's climate risk level and rank, with plain-language reasons. A reason appears only when the state is in the worst quarter for that factor.
- A "read this before using the numbers" section, plus a panel listing the data and model scores.
- A My fields tab where a farmer records a field and sees the climate and bare-field days for it, saved only on the device.

**How results are explained.** Each number is tied to its cause, for example "more hot days than most states." A caution appears where the data are unverified. The app states that the scores are estimates of a FAO rating from climate alone, not harvest forecasts.

## Evaluation, limitations and ethics

We evaluated the models on held-out places only, and we have not evaluated the app with farmers. These are the limits we found and how the tool handles them.

**What did not work**

- National yields as a label: too weakly tied to climate.
- NASA POWER rainfall: too coarse for state-level contrast.
- Drought prediction: no better than chance on the test years.

**Limitations**

- Suitability is estimated from climate alone, with R² of 0.42 to 0.53. It ignores soil, terrain and flooding.
- The labels are FAO GAEZ ratings, which are themselves model output, not measured field results.
- State names come from the nearest state capital, so squares near borders can be mislabelled.
- The slider changes rainfall only, and it reflects differences between wetter and drier places, not how one field responds to a wet or dry year.
- The Akwa Ibom, Cross River, Adamawa and Taraba drought signal is unverified.
- Field profiles are stored but do not change any estimate. We have not built rotation advice, and our draft rotation rules have not been reviewed by an agronomist.

**Responsible use**

- Every result shows its error, and the limits note sits on the same page as the results.
- The tool screens places. It does not tell a farmer what to plant, and it is not a forecast.
- Field records stay on the user's device. The form asks for an ID code rather than a full name, and nothing is sent to a server.
- We make no claims about how it performs for farmers until it has been tested with them.

## Conclusion and next steps

Open climate data and small, honestly tested models can give a useful first screening of crop suitability and climate risk for Nigeria, as long as the tool shows its error and its limits. The most useful step was better rainfall data, not a more complex model.

Next steps, in order:

1. **Rotation comparison.** Let a farmer enter a current rotation and three alternatives, and compare them only on checks we can source: repeated crops, legume before cereal, Striga control, bare-field days and climate suitability. Anything unsourced is shown as "not assessed."
2. **Soil and terrain.** SoilGrids values and elevation, the largest missing piece in the suitability models.
3. **Reviewed rules and more crops.** Agronomist review, and maize, cowpea and groundnut.
4. **Better boundaries and climate.** Real state boundaries instead of nearest-capital labels, and future climate scenarios instead of a rainfall slider.
5. **Farmers in the loop.** A pilot, outcome feedback, local-language versions and farmer-to-farmer sharing.

## Presentation outline and judge questions

