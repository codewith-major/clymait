"""
Merge FAOSTAT national yields (rice, cassava, yam) onto the state-year climate table.

Run order for the whole pipeline:
    py pull_power_nigeria.py
    py merge_faostat.py
    py add_spei.py
"""

import numpy as np
import pandas as pd

climate = pd.read_csv("data/processed/state_year_climate_features.csv")
fao = pd.read_csv("data/raw/faostat_nigeria.csv")

# Keep only yield rows
fao = fao[fao["Element"] == "Yield"].copy()


def short_name(item):
    item = item.lower()
    for crop in ["rice", "cassava", "yam"]:
        if crop in item:
            return crop
    return None


fao["crop"] = fao["Item"].map(short_name)
fao = fao.dropna(subset=["crop"]).rename(columns={"Year": "year"})
if fao.empty:
    raise SystemExit("No rice, cassava or yam rows found. Check the Element and Item columns.")

# Convert yields to tonnes per hectare using the file's own Unit column
DIVISORS = {"kg/ha": 1000, "hg/ha": 10000, "100 g/ha": 10000, "100g/ha": 10000, "t/ha": 1}
divisor = fao["Unit"].str.lower().str.strip().map(DIVISORS)
if divisor.isna().any():
    raise SystemExit(f"Unknown yield unit(s): {fao['Unit'].unique()}")
fao["yield_t_ha"] = fao["Value"] / divisor

# For each crop, compare each year with the average of the surrounding years
# (a centred 5-year window). A large negative number marks an unusually bad year.
parts = []
for crop, g in fao.groupby("crop"):
    g = g.sort_values("year").copy()
    rolling = g["yield_t_ha"].rolling(5, center=True, min_periods=3).mean()
    g["yield_anomaly_pct"] = 100 * (g["yield_t_ha"] - rolling) / rolling
    parts.append(g[["crop", "year", "yield_t_ha", "yield_anomaly_pct"]])
fao = pd.concat(parts)

# One row per year, with a column group per crop
wide = fao.pivot(index="year", columns="crop", values=["yield_t_ha", "yield_anomaly_pct"])
wide.columns = [f"{a}_{b}" for a, b in wide.columns]
wide = wide.reset_index()

# Attach each year's national yields to every state in that year
merged = climate.merge(wide, on="year", how="left")
merged.to_csv("data/processed/merged.csv", index=False)

print(merged.shape)
print(wide.round(2).to_string(index=False))
