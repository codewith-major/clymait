import pandas as pd

df = pd.read_csv("data/processed/state_year_climate_features.csv")

print(df.shape)                      # rows and columns
print(df.isna().sum())               # missing values per column
print(df.describe().round(1))        # min, max, average of each column

# Compare a wet southern state with a dry northern one
print(df.groupby("state")["season_rain_mm"].mean().round(0).sort_values())