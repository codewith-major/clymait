"""
Step 2: merge grid climate with GAEZ suitability labels, check the data,
and score simple baselines that the real model must beat.

Needs:
    data/processed/grid_climate_means.csv   (from pull_power_grid.py)
    data/processed/gaez_grid_labels.csv
Output:
    data/processed/grid_dataset.csv         (merged table used for modelling)

Run:  py baseline_suitability.py
"""

from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.dummy import DummyRegressor
from sklearn.linear_model import LinearRegression
from sklearn.metrics import mean_absolute_error, r2_score
from sklearn.model_selection import GroupKFold, cross_val_predict
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import PolynomialFeatures, StandardScaler

climate = pd.read_csv("data/processed/grid_climate_means.csv")
labels = pd.read_csv("data/processed/gaez_grid_labels.csv")
df = labels.merge(climate, on="cell_id", how="inner")

# If the CHIRPS rainfall features exist, use them instead of NASA POWER's coarser rainfall
chirps_file = Path("data/processed/grid_chirps_means.csv")
if chirps_file.exists():
    df = df.merge(pd.read_csv(chirps_file), on="cell_id", how="inner")
    df = df.drop(columns=["mean_annual_rain_mm", "mean_season_rain_mm", "std_season_rain_mm"])
    RAIN = "mean_chirps_annual_rain_mm"
    print("Using CHIRPS rainfall features.")
else:
    RAIN = "mean_annual_rain_mm"
    print("Using NASA POWER rainfall features (no CHIRPS file found).")
df.to_csv("data/processed/grid_dataset.csv", index=False)

print(f"Cells with labels: {len(labels)} | with climate: {len(climate)} | merged: {len(df)}")
print("Missing values:", int(df.isna().sum().sum()))

FEATURES = [c for c in df.columns if c.startswith("mean_") or c.startswith("std_")]
TARGETS = ["cassava_suit_all", "yam_suit_all", "rice_suit_all"]

print("\nClimate features (quick range check):")
print(df[FEATURES].describe().loc[["min", "mean", "max"]].round(1).T)

print("\nCorrelation of each target with each climate feature:")
print(df[FEATURES + TARGETS].corr().loc[FEATURES, TARGETS].round(2))

# Spatial cross-validation: neighbouring cells look alike, so whole 2x2 degree
# blocks are held out together. This avoids flattering the scores.
groups = (np.floor(df["lat"] / 2).astype(int).astype(str) + "_"
          + np.floor(df["lon"] / 2).astype(int).astype(str))
cv = GroupKFold(n_splits=5)

baselines = {
    "always predict the average": (DummyRegressor(strategy="mean"), []),
    "annual rain only (straight line)": (LinearRegression(), [RAIN]),
    "annual rain only (curve)": (
        make_pipeline(StandardScaler(), PolynomialFeatures(2), LinearRegression()),
        [RAIN],
    ),
}

rows = []
for target in TARGETS:
    y = df[target]
    for name, (model, cols) in baselines.items():
        X = df[cols] if cols else df[[RAIN]]
        pred = cross_val_predict(model, X, y, cv=cv, groups=groups)
        rows.append({
            "target": target,
            "baseline": name,
            "MAE (score points)": round(mean_absolute_error(y, pred), 2),
            "R2": round(r2_score(y, pred), 2),
        })

print("\nBaseline results (5-fold, spatial blocks held out):")
print(pd.DataFrame(rows).to_string(index=False))
print("\nSuitability scores run 0-100. A model is only useful if it beats these numbers.")