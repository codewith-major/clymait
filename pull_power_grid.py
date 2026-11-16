"""
Pull NASA POWER climate for each 0.5-degree grid cell in gaez_grid_labels.csv and
average it over 2001-2020 (the same period as the GAEZ suitability maps).

Needs (in the same folder as pull_power_nigeria.py):
    data/processed/gaez_grid_labels.csv
Outputs:
    data/raw/cell_<id>.json                 (cached downloads, safe to re-run)
    data/processed/grid_climate_means.csv   (one row per grid cell)

Expect roughly 30-60 minutes for the first run (about 290 downloads).
If it stops, just run it again: finished cells are loaded from the cache.
"""

import time

import pandas as pd

from pull_power_nigeria import fetch_state, to_dataframe, yearly_features

GRID = pd.read_csv("data/processed/gaez_grid_labels.csv")
FIRST, LAST = 2001, 2020

rows = []
failed = []
for i, r in enumerate(GRID.itertuples(), start=1):
    name = f"cell_{r.cell_id}"
    print(f"[{i}/{len(GRID)}] {name}")
    try:
        data = fetch_state(name, r.lat, r.lon)
    except RuntimeError as err:
        print("  skipped:", err)
        failed.append(r.cell_id)
        continue

    df = to_dataframe(data)
    yearly = pd.DataFrame(yearly_features(name, df))
    yearly = yearly[(yearly["year"] >= FIRST) & (yearly["year"] <= LAST)]
    if yearly.empty:
        failed.append(r.cell_id)
        continue

    feats = yearly.drop(columns=["state", "year"])
    row = feats.mean().add_prefix("mean_").to_dict()
    row["std_season_rain_mm"] = feats["season_rain_mm"].std()   # year-to-year swing
    row["cell_id"] = r.cell_id
    rows.append(row)
    time.sleep(1)   # be polite to the API

out = pd.DataFrame(rows).round(2)
out.to_csv("data/processed/grid_climate_means.csv", index=False)
print(f"Saved {len(out)} cells. Failed: {failed if failed else 'none'}")
