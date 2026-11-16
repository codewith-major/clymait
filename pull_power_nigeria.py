"""
Pull NASA POWER daily climate data for Nigeria's 36 states + FCT and
compute growing-season features per state per year.

Usage:
    pip install requests pandas numpy
    python pull_power_nigeria.py

Outputs:
    data/raw/<state>.json                          (cached API responses)
    data/processed/state_year_climate_features.csv (one row per state-year)

Notes:
- Coordinates below are approximate (state capitals). For the final version,
  replace them with centroids of state boundaries (geoBoundaries or GADM).
- NASA POWER rainfall is coarse (~0.5 degree). Plan to cross-check with CHIRPS.
- The growing season is simplified to May-October for every state. The far
  north has a shorter season (about June-September), so refine this later.
"""

import json
import time
from pathlib import Path

import numpy as np
import pandas as pd
import requests

START_YEAR = 2000
END_YEAR = 2025
SEASON_MONTHS = range(5, 11)  # May to October
RAIN_DAY_MM = 1.0             # a day counts as "rainy" at or above this
HEAT_DAY_C = 35.0             # a day counts as "hot" at or above this max temp
MAX_MISSING_FRAC = 0.10       # skip state-years with more missing season data

PARAMETERS = ["PRECTOTCORR", "T2M", "T2M_MAX", "T2M_MIN", "RH2M", "ALLSKY_SFC_SW_DWN"]
API_URL = "https://power.larc.nasa.gov/api/temporal/daily/point"

RAW_DIR = Path("data/raw")
OUT_DIR = Path("data/processed")

# name: (latitude, longitude), approximate capital-city locations
STATES = {
    "Abia": (5.53, 7.49), "Adamawa": (9.20, 12.48), "Akwa Ibom": (5.05, 7.93),
    "Anambra": (6.21, 7.07), "Bauchi": (10.31, 9.84), "Bayelsa": (4.92, 6.26),
    "Benue": (7.73, 8.52), "Borno": (11.85, 13.16), "Cross River": (4.95, 8.32),
    "Delta": (6.20, 6.73), "Ebonyi": (6.32, 8.11), "Edo": (6.34, 5.63),
    "Ekiti": (7.62, 5.22), "Enugu": (6.46, 7.55), "FCT": (9.08, 7.40),
    "Gombe": (10.29, 11.17), "Imo": (5.49, 7.03), "Jigawa": (11.76, 9.34),
    "Kaduna": (10.52, 7.44), "Kano": (12.00, 8.52), "Katsina": (12.99, 7.60),
    "Kebbi": (12.45, 4.20), "Kogi": (7.80, 6.74), "Kwara": (8.50, 4.55),
    "Lagos": (6.60, 3.35), "Nasarawa": (8.49, 8.52), "Niger": (9.61, 6.55),
    "Ogun": (7.16, 3.35), "Ondo": (7.25, 5.19), "Osun": (7.77, 4.56),
    "Oyo": (7.38, 3.95), "Plateau": (9.90, 8.86), "Rivers": (4.82, 7.03),
    "Sokoto": (13.06, 5.24), "Taraba": (8.89, 11.36), "Yobe": (11.75, 11.96),
    "Zamfara": (12.17, 6.66),
}


def fetch_state(name, lat, lon, retries=3):
    """Download (or load cached) daily POWER data for one point."""
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    cache = RAW_DIR / f"{name.replace(' ', '_')}.json"
    if cache.exists():
        return json.loads(cache.read_text())

    params = {
        "parameters": ",".join(PARAMETERS),
        "community": "AG",
        "longitude": lon,
        "latitude": lat,
        "start": f"{START_YEAR}0101",
        "end": f"{END_YEAR}1231",
        "format": "JSON",
    }
    for attempt in range(1, retries + 1):
        try:
            resp = requests.get(API_URL, params=params, timeout=120)
            resp.raise_for_status()
            data = resp.json()
            cache.write_text(json.dumps(data))
            return data
        except (requests.RequestException, ValueError) as err:
            print(f"  {name}: attempt {attempt} failed ({err})")
            time.sleep(5 * attempt)
    raise RuntimeError(f"Could not download data for {name}")


def to_dataframe(data):
    """Convert the POWER JSON response to a daily DataFrame."""
    param = data["properties"]["parameter"]
    df = pd.DataFrame(param)
    df.index = pd.to_datetime(df.index, format="%Y%m%d")
    df = df.replace(-999, np.nan)  # POWER's missing-value flag
    return df


def longest_run(mask):
    """Length of the longest run of consecutive True values."""
    best = cur = 0
    for v in mask:
        cur = cur + 1 if v else 0
        best = max(best, cur)
    return best


def yearly_features(name, df):
    rows = []
    for year, ydf in df.groupby(df.index.year):
        season = ydf[ydf.index.month.isin(SEASON_MONTHS)]
        if len(season) == 0:
            continue
        missing = season[["PRECTOTCORR", "T2M", "T2M_MAX"]].isna().any(axis=1).mean()
        if missing > MAX_MISSING_FRAC:
            continue

        rain = season["PRECTOTCORR"]
        rows.append({
            "state": name,
            "year": year,
            "annual_rain_mm": ydf["PRECTOTCORR"].sum(),
            "season_rain_mm": rain.sum(),
            "season_rain_days": int((rain >= RAIN_DAY_MM).sum()),
            "season_longest_dry_spell_days": longest_run((rain < RAIN_DAY_MM).fillna(False)),
            "season_mean_temp_c": season["T2M"].mean(),
            "season_heat_days": int((season["T2M_MAX"] >= HEAT_DAY_C).sum()),
            "season_mean_tmin_c": season["T2M_MIN"].mean(),
            "season_mean_rh_pct": season["RH2M"].mean(),
            "season_mean_solar_mj_m2_day": season["ALLSKY_SFC_SW_DWN"].mean(),
        })
    return rows


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    all_rows = []
    for i, (name, (lat, lon)) in enumerate(STATES.items(), start=1):
        print(f"[{i}/{len(STATES)}] {name}")
        data = fetch_state(name, lat, lon)
        df = to_dataframe(data)
        all_rows.extend(yearly_features(name, df))
        time.sleep(1)  # be polite to the API

    out = pd.DataFrame(all_rows).round(2)
    out_path = OUT_DIR / "state_year_climate_features.csv"
    out.to_csv(out_path, index=False)
    print(f"Saved {len(out)} state-year rows to {out_path}")


if __name__ == "__main__":
    main()
