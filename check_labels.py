import pandas as pd

m = pd.read_csv("data/processed/merged_with_spei.csv")
cols = ["season_rain_mm", "season_longest_dry_spell_days", "spei06_oct"]
ycols = [c for c in m.columns if c.startswith("yield_anomaly_pct")]

# Average across states for each year, to compare with national yields
national = m.groupby("year")[cols + ycols].mean().dropna()
print(len(national), "years")
print(national.corr().loc[cols, ycols].round(2))