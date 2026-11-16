"""
Turn the CHIRPS monthly rainfall into model features, and check CHIRPS against
SPEI and NASA POWER.

Needs:
    data/raw/chirps_monthly_points.csv         (from chirps_extract.py, run in Colab)
    data/processed/merged_with_spei.csv        (for the comparison check)
Outputs:
    data/processed/state_year_chirps.csv       (state, year: rainfall features)
    data/processed/grid_chirps_means.csv       (grid cell: long-term rainfall features, 2001-2020)

Run:  py chirps_features.py
"""

import numpy as np
import pandas as pd

SEASON = range(5, 11)          # May to October, same as the rest of the project
DRY_MONTH_MM = 50              # a month under 50 mm counts as "dry"
GAEZ_FIRST, GAEZ_LAST = 2001, 2020

m = pd.read_csv("data/raw/chirps_monthly_points.csv")
print(f"{len(m)} monthly values, {m['point_id'].nunique()} points, "
      f"{int(m['rain_mm'].isna().sum())} missing")

# One row per point and year; keep only years with all 12 months present
g = m.groupby(["kind", "point_id", "year"])
yearly = pd.DataFrame({
    "chirps_annual_rain_mm": g["rain_mm"].sum(min_count=12),
    "chirps_season_rain_mm": m[m["month"].isin(SEASON)].groupby(["kind", "point_id", "year"])["rain_mm"].sum(min_count=6),
    "chirps_dry_months": g["rain_mm"].apply(lambda s: int((s < DRY_MONTH_MM).sum()) if s.notna().all() else np.nan),
}).reset_index().dropna()

# ---- State-year table (for the risk table and the drought model) ----
states = yearly[yearly["kind"] == "state"].drop(columns="kind").rename(columns={"point_id": "state"})
states.round(1).to_csv("data/processed/state_year_chirps.csv", index=False)

# ---- Grid-cell long-term means (for the suitability model) ----
cells = yearly[(yearly["kind"] == "cell") & yearly["year"].between(GAEZ_FIRST, GAEZ_LAST)]
gm = cells.groupby("point_id")
grid = pd.DataFrame({
    "mean_chirps_annual_rain_mm": gm["chirps_annual_rain_mm"].mean(),
    "mean_chirps_season_rain_mm": gm["chirps_season_rain_mm"].mean(),
    "mean_chirps_dry_months": gm["chirps_dry_months"].mean(),
    "std_chirps_season_rain_mm": gm["chirps_season_rain_mm"].std(),
}).round(1).reset_index().rename(columns={"point_id": "cell_id"})
grid.to_csv("data/processed/grid_chirps_means.csv", index=False)
print(f"Saved {len(states)} state-years and {len(grid)} grid cells.")

# ---- Check: does CHIRPS agree with SPEI better than NASA POWER did? ----
spei = pd.read_csv("data/processed/merged_with_spei.csv")
chk = spei.merge(states, on=["state", "year"]).dropna(subset=["spei06_oct"])
for col in ["season_rain_mm", "chirps_season_rain_mm"]:      # z-score within each state
    chk[col + "_z"] = chk.groupby("state")[col].transform(lambda s: (s - s.mean()) / s.std())
print("\nWithin-state correlation of season rainfall with SPEI (October, 6-month):")
print(f"  NASA POWER rainfall: {chk['spei06_oct'].corr(chk['season_rain_mm_z']):.2f}")
print(f"  CHIRPS rainfall:     {chk['spei06_oct'].corr(chk['chirps_season_rain_mm_z']):.2f}")
print("Higher is better. NASA POWER was about 0.30 earlier.")

print("\nYear-to-year rainfall variability (std / mean) for a few states:")
v = states.groupby("state")["chirps_season_rain_mm"].agg(["mean", "std"])
v["variability_pct"] = (100 * v["std"] / v["mean"]).round(1)
print(v.loc[["Kano", "Plateau", "Kaduna", "Bauchi", "Rivers"], ["mean", "variability_pct"]].round(0))
