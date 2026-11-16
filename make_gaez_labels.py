"""
Turn the GAEZ v5 state summary into clean state-level suitability labels.

Input : data/raw/gaez/Nigeria_state_summary_2001-2020.csv   (from the GAEZ zip)
Output: data/processed/gaez_state_labels.csv                (one row per state)

Why this script exists:
GAEZ exports 0 as "no data", so the summary's state means only average the cells
that have some suitability. A state with a tiny suitable area could look as good
as a state that is suitable everywhere. Here we also estimate the share of each
state's cells that are suitable, and compute a whole-state mean that counts
unsuitable cells as zero.

Assumption: dryland rice has a value in (almost) every cell, so the largest
valid-cell count across the four crops is used as a stand-in for the state's
total cells. Check this later against state boundaries (geoBoundaries ADM1).
"""

from pathlib import Path

import numpy as np
import pandas as pd

SRC = Path("data/raw/gaez/Nigeria_state_summary_2001-2020.csv")
OUT = Path("data/processed/gaez_state_labels.csv")
CROPS = ["cassava", "dryland_rice", "wetland_rice", "yam"]

df = pd.read_csv(SRC)
df["state"] = df["state"].replace({"Abuja Federal Capital Territory": "FCT"})

total_cells = df[[f"{c}_suitability_index_valid_cells" for c in CROPS]].max(axis=1)

out = pd.DataFrame({"state": df["state"]})
for c in CROPS:
    valid = df[f"{c}_suitability_index_valid_cells"]
    share = (valid / total_cells).clip(upper=1.0)
    mean_suitable = df[f"{c}_suitability_index_mean"].fillna(0)
    yield_valid = df[f"{c}_attainable_yield_valid_cells"]
    yield_share = (yield_valid / total_cells).clip(upper=1.0)
    yield_mean = df[f"{c}_attainable_yield_mean"].fillna(0)

    out[f"{c}_share_suitable"] = share.round(3)
    # Suitability index is 0-10,000 in GAEZ; rescale to 0-100
    out[f"{c}_suit_all"] = (mean_suitable * share / 100).round(1)
    # Attainable yield is kg of dry weight per hectare (not fresh weight)
    out[f"{c}_yield_kgdw_ha_all"] = (yield_mean * yield_share).round(0)

# Rice in Nigeria is grown both on uplands and in lowlands: take the better of the two
out["rice_suit_all"] = out[["dryland_rice_suit_all", "wetland_rice_suit_all"]].max(axis=1)

OUT.parent.mkdir(parents=True, exist_ok=True)
out.to_csv(OUT, index=False)

print(out.shape)
for col in ["rice_suit_all", "cassava_suit_all", "yam_suit_all"]:
    s = out.set_index("state")[col].sort_values()
    print(f"\n{col}: lowest 5 -> {dict(s.head(5))}")
    print(f"{col}: highest 5 -> {dict(s.tail(5))}")
print("\nStates with no wetland-rice suitable land:",
      out.loc[out["wetland_rice_share_suitable"] == 0, "state"].tolist())
