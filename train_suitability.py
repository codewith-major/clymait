"""
Step 3: train suitability models (cassava, yam, rice) and compare them with the baselines.

Needs:   data/processed/grid_dataset.csv   (from baseline_suitability.py)
Outputs: models/suitability_<crop>.joblib              (best model per crop, trained on all cells)
         data/processed/suitability_cv_predictions.csv (honest out-of-sample predictions)

Run:  py train_suitability.py
"""

import warnings

warnings.filterwarnings("ignore", message=".*sklearn.utils.parallel.delayed.*")   # harmless version notice

from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import GradientBoostingRegressor, RandomForestRegressor
from sklearn.inspection import permutation_importance
from sklearn.linear_model import Ridge
from sklearn.metrics import mean_absolute_error, r2_score
from sklearn.model_selection import GroupKFold
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

df = pd.read_csv("data/processed/grid_dataset.csv")
FEATURES = [c for c in df.columns if c.startswith("mean_") or c.startswith("std_")]
TARGETS = {"cassava": "cassava_suit_all", "yam": "yam_suit_all", "rice": "rice_suit_all"}

# Hold out whole 2x2 degree blocks so neighbouring cells never sit on both sides
groups = (np.floor(df["lat"] / 2).astype(int).astype(str) + "_"
          + np.floor(df["lon"] / 2).astype(int).astype(str))
cv = GroupKFold(n_splits=5)


def make_models():
    return {
        "linear (all features)": make_pipeline(StandardScaler(), Ridge(alpha=1.0)),
        "random forest": RandomForestRegressor(
            n_estimators=300, min_samples_leaf=3, random_state=0, n_jobs=-1),
        "gradient boosting": GradientBoostingRegressor(
            n_estimators=200, max_depth=3, learning_rate=0.05, subsample=0.8, random_state=0),
    }


Path("models").mkdir(exist_ok=True)
results, cv_rows, importances = [], [], {}

for crop, target in TARGETS.items():
    X, y = df[FEATURES], df[target]
    oof = {name: np.zeros(len(df)) for name in make_models()}
    perm = pd.Series(0.0, index=FEATURES)

    for train_idx, test_idx in cv.split(X, y, groups):
        for name, model in make_models().items():
            model.fit(X.iloc[train_idx], y.iloc[train_idx])
            oof[name][test_idx] = model.predict(X.iloc[test_idx])
            if name == "random forest":   # importance measured on unseen cells
                r = permutation_importance(model, X.iloc[test_idx], y.iloc[test_idx],
                                           n_repeats=5, random_state=0)
                perm += pd.Series(r.importances_mean, index=FEATURES) / cv.n_splits
    importances[crop] = perm.sort_values(ascending=False)

    scores = {}
    for name, pred in oof.items():
        mae = mean_absolute_error(y, pred)
        scores[name] = mae
        results.append({"crop": crop, "model": name,
                        "MAE (score points)": round(mae, 2),
                        "R2": round(r2_score(y, pred), 2)})

    best = min(scores, key=scores.get)
    print(f"{crop}: best model = {best}")
    final = make_models()[best].fit(X, y)          # refit on all cells for later use
    joblib.dump({"model": final, "features": FEATURES, "target": target},
                f"models/suitability_{crop}.joblib")

    cv_rows.append(pd.DataFrame({"cell_id": df["cell_id"], "lat": df["lat"], "lon": df["lon"],
                                 "crop": crop, "actual": y, "predicted": oof[best].round(1)}))

pd.concat(cv_rows).to_csv("data/processed/suitability_cv_predictions.csv", index=False)

print("\nResults (spatial 5-fold CV). Compare with the rainfall-curve baseline:")
print(pd.DataFrame(results).to_string(index=False))

print("\nMost useful climate features (drop in R2 when shuffled, random forest):")
for crop, imp in importances.items():
    print(f"  {crop}: " + ", ".join(f"{k.replace('mean_', '')} ({v:.2f})"
                                    for k, v in imp.head(4).items()))