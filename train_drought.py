"""
Step 4: train the drought-risk model.

Question the model answers: given how this season's climate compares with the
state's normal, how likely is a drought year (SPEI-06 for October <= -1)?

Needs:   data/processed/merged_with_spei.csv   (from add_spei.py)
Outputs: models/drought_model.joblib           (model, features, state reference climate)

Run:  py train_drought.py
"""

import warnings

warnings.filterwarnings("ignore", message=".*sklearn.utils.parallel.delayed.*")   # harmless version notice

from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import average_precision_score, precision_score, recall_score, roc_auc_score
from sklearn.model_selection import GroupKFold, cross_val_score
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

TRAIN_END = 2016   # train on 2000-2016, test on 2017-2024 (the model never sees the future)

df = pd.read_csv("data/processed/merged_with_spei.csv")
df = df.dropna(subset=["spei06_oct"]).reset_index(drop=True)   # 2025 has no SPEI yet

# Prefer CHIRPS rainfall (better than NASA POWER's) when we have it
if Path("data/processed/state_year_chirps.csv").exists():
    ch = pd.read_csv("data/processed/state_year_chirps.csv")[["state", "year", "chirps_season_rain_mm"]]
    df = df.merge(ch, on=["state", "year"], how="inner")
    df["season_rain_mm"] = df["chirps_season_rain_mm"]
    print("Using CHIRPS rainfall.")
else:
    print("Using NASA POWER rainfall.")
df["drought"] = (df["spei06_oct"] <= -1.0).astype(int)

REF_COLS = ["season_rain_mm", "season_rain_days", "season_longest_dry_spell_days",
            "season_heat_days", "season_mean_temp_c"]


def reference_climate(data):
    """Each state's normal climate (average over the given years)."""
    return data.groupby("state")[REF_COLS].mean().add_prefix("ref_")


def build_features(data, ref):
    """Describe each state-year as 'how far from normal', plus how dry the state is normally."""
    d = data.merge(ref, left_on="state", right_index=True)
    out = pd.DataFrame(index=d.index)
    out["rain_anom_pct"] = 100 * (d["season_rain_mm"] / d["ref_season_rain_mm"] - 1)
    out["rain_days_anom"] = d["season_rain_days"] - d["ref_season_rain_days"]
    out["dry_spell_anom_days"] = d["season_longest_dry_spell_days"] - d["ref_season_longest_dry_spell_days"]
    out["heat_days_anom"] = d["season_heat_days"] - d["ref_season_heat_days"]
    out["temp_anom_c"] = d["season_mean_temp_c"] - d["ref_season_mean_temp_c"]
    out["normal_season_rain_mm"] = d["ref_season_rain_mm"]
    return out


train = df[df["year"] <= TRAIN_END]
test = df[df["year"] > TRAIN_END]
ref_train = reference_climate(train)
X_train, X_test = build_features(train, ref_train), build_features(test, ref_train)
y_train, y_test = train["drought"], test["drought"]

print(f"Train years 2000-{TRAIN_END}: {len(train)} rows, {y_train.mean():.1%} drought")
print(f"Test years {TRAIN_END + 1}-{int(df['year'].max())}: {len(test)} rows, {y_test.mean():.1%} drought")

models = {
    "baseline: rain anomaly only": (
        make_pipeline(StandardScaler(), LogisticRegression(class_weight="balanced")),
        ["rain_anom_pct"]),
    "logistic (all anomalies)": (
        make_pipeline(StandardScaler(), LogisticRegression(class_weight="balanced", max_iter=1000)),
        list(X_train.columns)),
    "random forest": (
        RandomForestClassifier(n_estimators=300, min_samples_leaf=5, class_weight="balanced_subsample",
                               random_state=0, n_jobs=-1),
        list(X_train.columns)),
}

# Pick the model using only the training years (folds hold out whole years)
cv = GroupKFold(n_splits=5)
cv_auc = {}
for name, (model, cols) in models.items():
    cv_auc[name] = cross_val_score(model, X_train[cols], y_train, cv=cv,
                                   groups=train["year"], scoring="roc_auc").mean()
candidates = {k: v for k, v in cv_auc.items() if not k.startswith("baseline")}
best = max(candidates, key=candidates.get)

rows = []
for name, (model, cols) in models.items():
    model.fit(X_train[cols], y_train)
    prob = model.predict_proba(X_test[cols])[:, 1]
    flag = prob >= 0.5
    rows.append({
        "model": name + ("  <- chosen" if name == best else ""),
        "CV AUC (train yrs)": round(cv_auc[name], 2),
        "test AUC": round(roc_auc_score(y_test, prob), 2),
        "test avg precision": round(average_precision_score(y_test, prob), 2),
        "precision@0.5": round(precision_score(y_test, flag, zero_division=0), 2),
        "recall@0.5": round(recall_score(y_test, flag), 2),
    })

print("\nResults on the held-out future years (AUC 0.5 = guessing, 1.0 = perfect):")
print(pd.DataFrame(rows).to_string(index=False))
print(f"\n'avg precision' of a model with no skill equals the drought rate ({y_test.mean():.2f}).")

# Final model: refit on every year so the demo uses all the data we have
ref_all = reference_climate(df)
X_all = build_features(df, ref_all)
final_model, final_cols = models[best]
final_model.fit(X_all[final_cols], df["drought"])

Path("models").mkdir(exist_ok=True)
joblib.dump({"model": final_model, "features": final_cols, "reference": ref_all,
             "model_name": best}, "models/drought_model.joblib")
print(f"\nSaved models/drought_model.joblib ({best}).")