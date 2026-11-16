"""
Build everything the website needs and save it in ONE file: data/processed/site_data.json

What it does:
 1. Tests simple models that use only a few climate inputs (annual rainfall, number of dry
    months, season temperature) against each other with spatial cross-validation, and keeps the
    SIMPLEST one that is about as accurate as the best (easier to explain and to use in a
    what-if slider).
 2. Records each model's typical error, so the site can show "typical error +/- N points".
 3. Re-runs each model for rainfall changes of -20%, -10%, 0, +10%, +20% (what-if slider).
    Temperature is NOT varied: a model learned across places cannot be trusted for warming in one place.
 4. Combines these with the measured state risk table and the GAEZ reference scores.

Needs:
    data/processed/grid_dataset.csv          (from baseline_suitability.py, with CHIRPS features)
    data/raw/chirps_monthly_points.csv       (from chirps_extract.py)
    data/processed/state_risk_table.csv      (from build_risk_table.py)
    pull_power_nigeria.py                    (for the state coordinates)
Run:  py build_site_data.py
"""

import json
import warnings
from datetime import date

import numpy as np
import pandas as pd
from sklearn.ensemble import GradientBoostingRegressor, RandomForestRegressor
from sklearn.linear_model import LinearRegression, Ridge
from sklearn.metrics import mean_absolute_error, r2_score
from sklearn.model_selection import GroupKFold
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import PolynomialFeatures, StandardScaler

from pull_power_nigeria import STATES

warnings.filterwarnings("ignore", message=".*sklearn.utils.parallel.delayed.*")

CROPS = {"cassava": "cassava_suit_all", "yam": "yam_suit_all", "rice": "rice_suit_all"}
RAIN, DRY, TEMP = "mean_chirps_annual_rain_mm", "mean_chirps_dry_months", "mean_season_mean_temp_c"
FACTORS = [0.8, 0.9, 1.0, 1.1, 1.2]
DRY_MONTH_MM, FIRST, LAST = 50, 2001, 2020      # same definitions as chirps_features.py

df = pd.read_csv("data/processed/grid_dataset.csv")
risk = pd.read_csv("data/processed/state_risk_table.csv")

# ---------- 1. candidate models, simplest first ----------
def candidates():
    return {
        "rainfall curve (1 input)": (
            make_pipeline(StandardScaler(), PolynomialFeatures(2), LinearRegression()), [RAIN]),
        "curve on 3 inputs": (
            make_pipeline(StandardScaler(), PolynomialFeatures(2), Ridge(alpha=1.0)), [RAIN, DRY, TEMP]),
        "random forest (3 inputs)": (
            RandomForestRegressor(n_estimators=300, min_samples_leaf=3, random_state=0, n_jobs=-1),
            [RAIN, DRY, TEMP]),
        "gradient boosting (3 inputs)": (
            GradientBoostingRegressor(n_estimators=200, max_depth=2, learning_rate=0.05,
                                      subsample=0.8, random_state=0), [RAIN, DRY, TEMP]),
    }

groups = (np.floor(df["lat"] / 2).astype(int).astype(str) + "_" + np.floor(df["lon"] / 2).astype(int).astype(str))
cv = GroupKFold(n_splits=5)

# ---------- 2. monthly CHIRPS for the what-if scenarios ----------
m = pd.read_csv("data/raw/chirps_monthly_points.csv")
m = m[(m["kind"] == "cell") & m["year"].between(FIRST, LAST)]
piv = m.pivot_table(index=["point_id", "year"], columns="month", values="rain_mm")


def scenario_inputs(factor):
    """Annual rainfall and dry-month count for every cell if all rain changed by `factor`."""
    dry = (piv * factor < DRY_MONTH_MM).sum(axis=1).groupby(level="point_id").mean()
    out = pd.DataFrame({RAIN: df[RAIN] * factor, DRY: df["cell_id"].map(dry).values, TEMP: df[TEMP]})
    return out


check = scenario_inputs(1.0)
assert np.allclose(check[DRY].values, df[DRY].values, atol=0.15), "dry-month recalculation does not match the saved feature"

# ---------- 3. choose, evaluate and use the models ----------
summary, cell_est, cell_scen, crop_info = {}, {}, {}, {}
print("Spatial CV results (MAE = typical error in suitability points; lower is better)\n")
for crop, target in CROPS.items():
    y = df[target].values
    scores, oof_all = {}, {}
    for name, (_, cols) in candidates().items():
        oof = np.zeros(len(df))
        for tr, te in cv.split(df, y, groups):
            model = candidates()[name][0]
            model.fit(df.iloc[tr][cols], y[tr])
            oof[te] = model.predict(df.iloc[te][cols])
        scores[name] = (mean_absolute_error(y, oof), r2_score(y, oof))
        oof_all[name] = oof
    best_mae = min(v[0] for v in scores.values())
    chosen = next(n for n in scores if scores[n][0] <= best_mae * 1.03)      # simplest model within 3% of the best
    print(crop)
    for n, (mae, r2) in scores.items():
        print(f"  {'->' if n == chosen else '  '} {n:<30} MAE {mae:5.2f}   R2 {r2:5.2f}")

    model, cols = candidates()[chosen]
    model.fit(df[cols], y)
    oof = oof_all[chosen]
    resid = np.abs(y - oof)
    crop_info[crop] = {"model": chosen, "inputs": cols, "mae": round(float(scores[chosen][0]), 1),
                       "r2": round(float(scores[chosen][1]), 2), "error_p80": round(float(np.quantile(resid, 0.8)), 1)}

    base_fit = model.predict(df[cols])
    scen = {}
    for f in FACTORS:
        pred = model.predict(scenario_inputs(f)[cols])
        scen[f] = np.clip(oof + (pred - base_fit), 0, 100)     # honest baseline plus the modelled change
    cell_est[crop] = np.clip(oof, 0, 100)
    cell_scen[crop] = scen

# ---------- 4. assemble the JSON ----------
pts = np.array([(lat, lon) for lat, lon in STATES.values()])
names = list(STATES.keys())


def nearest_state(lat, lon):
    d = (pts[:, 0] - lat) ** 2 + ((pts[:, 1] - lon) * np.cos(np.radians(lat))) ** 2
    return names[int(np.argmin(d))]


cells = []
for i, r in df.iterrows():
    cells.append({
        "id": r["cell_id"], "lat": r["lat"], "lon": r["lon"], "state": nearest_state(r["lat"], r["lon"]),
        "climate": {"annual_rain_mm": round(float(r[RAIN])), "dry_months": round(float(r[DRY]), 1),
                    "season_temp_c": round(float(r[TEMP]), 1)},
        "gaez": {c: round(float(r[t]), 1) for c, t in CROPS.items()},
        "est": {c: round(float(cell_est[c][i]), 1) for c in CROPS},
        "scenario": {c: [round(float(cell_scen[c][f][i]), 1) for f in FACTORS] for c in CROPS},
    })

state_summary = {}
for s in names:
    sub = [c for c in cells if c["state"] == s]
    if sub:
        state_summary[s] = {"cells": len(sub),
                            **{c: round(float(np.mean([x["est"][c] for x in sub])), 1) for c in CROPS}}

site = {
    "created": str(date.today()),
    "rain_factors": FACTORS,
    "crops": crop_info,
    "cells": cells,
    "state_summary": state_summary,
    "risk": json.loads(risk.round(1).to_json(orient="records")),
    "notes": [
        "Suitability is the model's estimate of the GAEZ v5 suitability index (0-100, rainfed, low input), "
        "built from climate only. It does not see soil, terrain or flooding.",
        "Estimates come from held-out cross-validation, so they are not flattered by the training data.",
        "The what-if slider changes rainfall only. Temperature is not varied.",
        "Climate risk is measured from CHIRPS rainfall, NASA POWER temperature and SPEI history; it is not a forecast.",
        "Cells are assigned to the nearest state capital point, so state labels near borders are approximate.",
    ],
}
with open("data/processed/site_data.json", "w") as fh:
    json.dump(site, fh, allow_nan=False, separators=(",", ":"))
size_kb = len(json.dumps(site, separators=(",", ":"))) / 1024
print(f"\nSaved data/processed/site_data.json ({size_kb:.0f} KB): {len(cells)} cells, {len(state_summary)} states.")
print("Typical error per crop:", {c: f"+/-{v['mae']} points" for c, v in crop_info.items()})
