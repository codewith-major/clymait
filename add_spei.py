import numpy as np
import pandas as pd
import xarray as xr
from pull_power_nigeria import STATES   # reuse the state coordinates

ds = xr.open_dataset("data/raw/spei06.nc")
print(ds)                                # shows the variables and dimensions

spei = ds["spei"]
# Keep only October of each year
spei_oct = spei.isel(time=np.where(spei["time"].dt.month == 10)[0])

rows = []
for state, (lat, lon) in STATES.items():
    # Average the grid cells within about half a degree of the state point.
    # This also avoids empty ocean cells near the coast.
    box = spei_oct.where(
        (abs(spei_oct["lat"] - lat) <= 0.5) & (abs(spei_oct["lon"] - lon) <= 0.5),
        drop=True,
    ).mean(["lat", "lon"])
    for t, v in zip(box["time"].values, box.values):
        rows.append({"state": state, "year": pd.Timestamp(t).year,
                     "spei06_oct": float(v)})

spei_df = pd.DataFrame(rows)

def category(v):
    if pd.isna(v):
        return None
    if v <= -2.0:
        return "extreme"
    if v <= -1.5:
        return "severe"
    if v <= -1.0:
        return "moderate"
    return "none"

spei_df["drought_category"] = spei_df["spei06_oct"].map(category)
spei_df["drought_flag"] = (spei_df["spei06_oct"] <= -1.0).astype(float)
spei_df.loc[spei_df["spei06_oct"].isna(), "drought_flag"] = np.nan

merged = pd.read_csv("data/processed/merged.csv")
merged = merged.merge(spei_df, on=["state", "year"], how="left")
merged.to_csv("data/processed/merged_with_spei.csv", index=False)

# Checks
print(merged.shape)
print(merged["drought_category"].value_counts(dropna=False))
check = merged[["spei06_oct", "season_rain_mm", "season_longest_dry_spell_days"]]
print(check.corr().round(2))

m = merged.dropna(subset=["spei06_oct"]).copy()
for col in ["season_rain_mm", "season_longest_dry_spell_days"]:
    m[col + "_z"] = m.groupby("state")[col].transform(lambda s: (s - s.mean()) / s.std())

print(m[["spei06_oct", "season_rain_mm_z", "season_longest_dry_spell_days_z"]].corr().round(2))