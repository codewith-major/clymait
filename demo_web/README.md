# Clymait

Climate and crop-rotation decision aid for Nigerian farmers. Built for the Veritas AI hackathon (Climate track).

A static web app: plain HTML, CSS and JavaScript, **no build step and no server**. It runs from files, works offline after the first visit, can be installed on a phone, and keeps farmers' data on their own device.

## What it does

| Page | What it gives you |
|---|---|
| **Dashboard** | Climate check for a saved field or any map square: best-fit crop, climate stress gauge, drought history, crop fit, planner status |
| **Explore the map** | 288 half-degree squares coloured by suitability for rice, cassava and yam (or climate stress), a rainfall what-if slider, measured risk and plain-language reasons |
| **My fields** | Farmer field profiles (location, soil, drainage, slope, irrigation, crop history, yields, fertilizer, pests, market), bare-field periods, **Next crop options** from sourced rotation rules |
| **Rotation planner** | Current rotation vs at least three alternatives on ten criteria, priorities, bare-field calendar, vulnerable-season warnings, explanation, save plan, feedback and results |
| **About and method** | Problem, data, what was tested, what failed, honest limits |

## Folder layout

```
index.html              the app shell and all views
manifest.webmanifest    install-to-home-screen settings
sw.js                   offline cache (must stay at the top level)
vercel.json             Vercel headers (strict Content-Security-Policy)
package.json            dev and test scripts (no dependencies)
css/style.css           base styles
css/theme.css           look and feel: forest/lime theme, dashboard, planner
js/app.js               map, results, navigation
js/fields.js            My fields
js/rules.js             rotation rules and crop facts, as data, with sources
js/rotation-engine.js   next-crop options for one field
js/planner-engine.js    rotation comparison (calendar, ten criteria, explanation)
js/planner.js           planner screens, saving, feedback, export
js/dashboard.js         dashboard and About numbers
data/site_data.js       model results and measured risk (from build_site_data.py)
assets/                 logo and icons
tests/                  engine tests (Node, no dependencies)
```

## Run it

```
npm run dev        # or: py -m http.server 8000   (Windows)
```
then open http://localhost:8000. Double-clicking `index.html` also works, but offline install needs a server.

Run the tests (Node 18 or newer):
```
npm test
```

## Deploy on Vercel

Vercel serves this folder as it is.

**From GitHub (easiest)**
1. Put the contents of this folder at the top level of a new GitHub repository.
2. In Vercel choose **Add New → Project**, import the repository.
3. Framework Preset: **Other**. Leave Build Command and Output Directory empty. Click **Deploy**.

**From your computer**
```
npm i -g vercel
vercel          # first time: answer the prompts, accept the defaults
vercel --prod
```

`vercel.json` adds security headers, including a Content-Security-Policy that only allows the app's own files. If you add outside scripts, fonts or images later, the policy must be widened.

After each change that users should see, edit `CACHE = 'clymait-v6'` in `sw.js` to the next number so phones drop the old saved copy.

## Updating the data

1. Re-run `build_site_data.py` to get a new `site_data.json`.
2. Rebuild `data/site_data.js` (PowerShell):
   ```
   "window.SITE_DATA = " + (Get-Content site_data.json -Raw) + ";" | Set-Content data/site_data.js -Encoding utf8
   ```
3. Bump the cache name in `sw.js`.

## How the rotation comparison works

- **Measured or modelled data:** climate suitability (rice, cassava, yam only) and drought history come from the app's data.
- **Sourced rules only:** soil-health trend, pest-cycle interruption and drought tolerance come from `js/rules.js`. Every rule keeps its source, how much of the source was read, and its status. Rules awaiting agronomist review are marked.
- **Farmer numbers only:** income and labor use yields, prices, costs and work days the farmer types in. Blank in, blank out.
- **Calendar:** 365-day years, planting on the 15th of the chosen month, rainy season May–October (the season the climate data covers). These are modelling choices, not measurements.
- **Overall:** a tally of where each rotation is ahead or behind on what the farmer marked important. It is not a 0–100 score, because no source supports one. Differences below a margin count as similar (10 climate points, 30 days, 10% for income and labor). The margins are in `js/planner-engine.js`.
- **No waiting times:** no source gives a safe interval before repeating a crop, so none is ever stated.

To update the rules after an agronomist reviews them, edit `js/rules.js` only: set `review: false` on confirmed rows and change anything they correct.

## Privacy

Field profiles, plans, feedback and results are stored in the browser's `localStorage` on that device. Nothing is sent anywhere. Clearing site data deletes them, so use the download and restore buttons to back up. CSV cells that start with `=`, `+`, `-` or `@` are prefixed so spreadsheets do not run them as formulas, and anything restored from a file is re-validated.

## Honest limits

- Climate-only suitability: about half of the variation in the FAO GAEZ ratings (R² 0.42–0.53). Soil and terrain are missing. GAEZ is itself a model.
- A drought-year predictor was tested and did not beat chance, so it is not shipped. Risk shown is measured history.
- Map squares are about 55 km wide; state labels come from the nearest state capital.
- Rotation rules are draft guidance, several from single sites, some from outside Nigeria.
- No monthly rainfall yet, so planting windows are the farmer's own entries.
- Decision support, not a planting recommendation or a forecast.
