"""
Step 4 (revised): build a state-level climate risk table from observed data.

The drought prediction model did not beat chance on future years, so we do not
ship it. Instead the tool reports measured climate risk, which is more honest.

Needs:
    data/raw/spei06.nc                                (6-month SPEI, 1901-2024)
    data/processed/state_year_climate_features.csv    (from pull_power_nigeria.py)
Output:
    data/processed/state_risk_table.csv

Run:  py build_risk_table.py
"""

import numpy as np
import pandas as pd
import xarray as xr

from pull_power_nigeria import STATES

SPEI_FIRST, SPEI_LAST = 1981, 2024      # 44 years of drought history
RECENT_FIRST = 2005                     # "recent" = 2005-2024 (20 years)

# ---------- 1. Drought history from SPEI (October value = whole May-Oct season) ----------
ds = xr.open_dataset("data/raw/spei06.nc")
spei = ds["spei"].sel(lat=slice(3, 15), lon=slice(2, 16))          # Nigeria area only
spei = spei.isel(time=np.where(spei["time"].dt.month == 10)[0]).load()
spei = spei.sel(time=slice(f"{SPEI_FIRST}-01-01", f"{SPEI_LAST}-12-31"))

drought_rows = []
for state, (lat, lon) in STATES.items():
    box = spei.where((abs(spei["lat"] - lat) <= 0.5) & (abs(spei["lon"] - lon) <= 0.5),
                     drop=True).mean(["lat", "lon"])
    s = pd.Series(box.values, index=pd.DatetimeIndex(box["time"].values).year).dropna()
    recent = s[s.index >= RECENT_FIRST]
    drought_rows.append({
        "state": state,
        "drought_years_pct_1981_2024": round(100 * (s <= -1.0).mean(), 1),
        "drought_years_pct_recent": round(100 * (recent <= -1.0).mean(), 1),
        "worst_drought_year": int(s.idxmin()),
        "worst_spei": round(float(s.min()), 2),
    })
drought = pd.DataFrame(drought_rows)

# ---------- 2. Absolute stress indicators from NASA POWER (2000-2024) ----------
clim = pd.read_csv("data/processed/state_year_climate_features.csv")
clim = clim[clim["year"] <= 2024]

# Prefer CHIRPS rainfall (better than NASA POWER's) when we have it
import os
if os.path.exists("data/processed/state_year_chirps.csv"):
    ch = pd.read_csv("data/processed/state_year_chirps.csv")[["state", "year", "chirps_season_rain_mm"]]
    clim = clim.merge(ch, on=["state", "year"])
    clim["season_rain_mm"] = clim["chirps_season_rain_mm"]
    print("Using CHIRPS rainfall for rain amount and variability.")
g = clim.groupby("state")
stress = pd.DataFrame({
    "normal_season_rain_mm": g["season_rain_mm"].mean(),
    "rain_variability_pct": 100 * g["season_rain_mm"].std() / g["season_rain_mm"].mean(),
    "avg_longest_dry_spell_days": g["season_longest_dry_spell_days"].mean(),
    "avg_heat_days": g["season_heat_days"].mean(),
}).round(1).reset_index()

risk = stress.merge(drought, on="state")

# ---------- 3. Simple, explainable climate stress index (0-100) ----------
# Average of percentile ranks: more variable rain, longer dry spells, more heat
# days, and less rain all push the index up. It ranks states against each other;
# it is not a probability.
parts = pd.DataFrame({
    "var": risk["rain_variability_pct"].rank(pct=True),
    "dry": risk["avg_longest_dry_spell_days"].rank(pct=True),
    "heat": risk["avg_heat_days"].rank(pct=True),
    "low_rain": (-risk["normal_season_rain_mm"]).rank(pct=True),
})
risk["climate_stress_index"] = (100 * parts.mean(axis=1)).round(0)
risk["risk_level"] = pd.cut(risk["climate_stress_index"], [-1, 40, 70, 101],
                            labels=["lower", "medium", "higher"]).astype(str)

risk = risk.sort_values("climate_stress_index", ascending=False)
risk.to_csv("data/processed/state_risk_table.csv", index=False)

print(risk[["state", "climate_stress_index", "risk_level", "rain_variability_pct",
            "avg_longest_dry_spell_days", "avg_heat_days",
            "drought_years_pct_recent"]].to_string(index=False))
print("\nTop of list = most climate-stressed. SPEI compares each place with its own normal,")
print("so drought-year percentages are similar everywhere by design; use the stress")
print("index to compare states, and the SPEI columns to see change over time.")