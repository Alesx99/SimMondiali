import os
import json
import numpy as np
import pandas as pd
from datetime import datetime
import unicodedata
import re

# Try importing advanced GBDT packages, fall back to scikit-learn
try:
    import lightgbm as lgb
    USE_LGB = True
except ImportError:
    USE_LGB = False

try:
    import xgboost as xgb
    USE_XGB = True
except ImportError:
    USE_XGB = False

# Custom GBDT Implementation to run without sklearn
class DecisionTreeRegressorCustom:
    def __init__(self, max_depth=3):
        self.max_depth = max_depth
        self.feature_idx = None
        self.threshold = None
        self.value = None
        self.left = None
        self.right = None

    def fit(self, X, y):
        n_samples, n_features = X.shape
        
        if self.max_depth == 0 or n_samples < 10:
            self.value = np.mean(y) if n_samples > 0 else 0.0
            return self

        best_mse = np.var(y) * n_samples
        if best_mse == 0:
            self.value = np.mean(y)
            return self

        best_feat = None
        best_thresh = None

        for feat in range(n_features):
            vals = X[:, feat]
            # Use 5 percentiles to speed up split selection
            unique_vals = np.percentile(vals, [10, 30, 50, 70, 90])
            for thresh in unique_vals:
                left_mask = vals <= thresh
                n_l = np.sum(left_mask)
                n_r = n_samples - n_l
                
                if n_l < 5 or n_r < 5:
                    continue
                    
                y_l = y[left_mask]
                y_r = y[~left_mask]
                
                mse_l = np.var(y_l) * n_l
                mse_r = np.var(y_r) * n_r
                
                total_mse = mse_l + mse_r
                if total_mse < best_mse:
                    best_mse = total_mse
                    best_feat = feat
                    best_thresh = thresh

        if best_feat is None:
            self.value = np.mean(y)
            return self

        self.feature_idx = best_feat
        self.threshold = best_thresh
        
        left_mask = X[:, best_feat] <= best_thresh
        self.left = DecisionTreeRegressorCustom(max_depth=self.max_depth - 1)
        self.left.fit(X[left_mask], y[left_mask])
        
        self.right = DecisionTreeRegressorCustom(max_depth=self.max_depth - 1)
        self.right.fit(X[~left_mask], y[~left_mask])
        
        return self

    def predict(self, X):
        if self.value is not None:
            return np.full(X.shape[0], self.value)
            
        vals = X[:, self.feature_idx]
        left_mask = vals <= self.threshold
        
        preds = np.zeros(X.shape[0])
        if np.any(left_mask):
            preds[left_mask] = self.left.predict(X[left_mask])
        if np.any(~left_mask):
            preds[~left_mask] = self.right.predict(X[~left_mask])
        return preds


class GradientBoostingRegressor:
    def __init__(self, n_estimators=100, learning_rate=0.05, max_depth=3, random_state=42):
        self.n_estimators = n_estimators
        self.learning_rate = learning_rate
        self.max_depth = max_depth
        self.base_pred = 0.0
        self.estimators = []

    def fit(self, X, y):
        if hasattr(X, "values"):
            X = X.values
        if hasattr(y, "values"):
            y = y.values
            
        self.base_pred = np.mean(y)
        f_m = np.full(X.shape[0], self.base_pred)
        
        for i in range(self.n_estimators):
            residuals = y - f_m
            tree = DecisionTreeRegressorCustom(max_depth=self.max_depth)
            tree.fit(X, residuals)
            self.estimators.append(tree)
            f_m += self.learning_rate * tree.predict(X)
            
        return self

    def predict(self, X):
        if hasattr(X, "values"):
            X = X.values
        preds = np.full(X.shape[0], self.base_pred)
        for tree in self.estimators:
            preds += self.learning_rate * tree.predict(X)
        return preds


# Paths
WORKSPACE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TEAMS_DB_PATH = os.path.join(WORKSPACE, "data", "teams.json")
SQUAD_VALUES_PATH = os.path.join(WORKSPACE, "data", "stats", "squad_values.json")
RESULTS_PATH = os.path.join(WORKSPACE, "archive-historical", "results.csv")
OUTPUT_PATH = os.path.join(WORKSPACE, "data", "stats", "gbdt_baselines.json")

# Team Naming Map (reused from crunch_archives.py)
sim_to_dataset = {
    'Messico': 'Mexico', 'Sudafrica': 'South Africa', 'Corea del Sud': 'South Korea',
    'Repubblica Ceca': 'Czechia', 'Canada': 'Canada', 'Bosnia Erzegovina': 'Bosnia and Herzegovina',
    'Qatar': 'Qatar', 'Svizzera': 'Switzerland', 'Brasile': 'Brazil', 'Marocco': 'Morocco',
    'Haiti': 'Haiti', 'Scozia': 'Scotland', 'Stati Uniti': 'United States', 'Paraguay': 'Paraguay',
    'Australia': 'Australia', 'Turchia': 'Turkey', 'Germania': 'Germany', 'Curaçao': 'Curacao',
    "Costa d'Avorio": "Cote d'Ivoire", 'Ecuador': 'Ecuador', 'Paesi Basi': 'Netherlands',
    'Paesi Bassi': 'Netherlands', 'Giappone': 'Japan', 'Svezia': 'Sweden', 'Tunisia': 'Tunisia',
    'Belgio': 'Belgium', 'Egitto': 'Egypt', 'Iran': 'Iran', 'Nuova Zelanda': 'New Zealand',
    'Spagna': 'Spain', 'Capo Verde': 'Cape Verde', 'Arabia Saudita': 'Saudi Arabia',
    'Uruguay': 'Uruguay', 'Francia': 'France', 'Senegal': 'Senegal', 'Iraq': 'Iraq',
    'Norvegia': 'Norway', 'Argentina': 'Argentina', 'Algeria': 'Algeria', 'Austria': 'Austria',
    'Giordania': 'Jordan', 'Portogallo': 'Portugal', 'RD Congo': 'DR Congo', 'Uzbekistan': 'Uzbekistan',
    'Colombia': 'Colombia', 'Inghilterra': 'England', 'Croazia': 'Croatia', 'Ghana': 'Ghana',
    'Panama': 'Panama'
}

def normalize_name(s):
    if not s: return ""
    s = s.lower().strip()
    s = "".join(c for c in unicodedata.normalize('NFD', s) if unicodedata.category(c) != 'Mn')
    s = s.replace('-', ' ').replace('_', ' ').replace('and', '').replace('co.', '').replace('&', '')
    return " ".join(s.split())

norm_map = {}
for sim_name, ds_name in sim_to_dataset.items():
    norm_map[normalize_name(ds_name)] = sim_name
    norm_map[normalize_name(sim_name)] = sim_name

# Standard variations
norm_map[normalize_name("Korea Republic")] = "Corea del Sud"
norm_map[normalize_name("South Korea")] = "Corea del Sud"
norm_map[normalize_name("Czech Republic")] = "Repubblica Ceca"
norm_map[normalize_name("Cote d'Ivoire")] = "Costa d'Avorio"
norm_map[normalize_name("Ivory Coast")] = "Costa d'Avorio"
norm_map[normalize_name("Congo DR")] = "RD Congo"
norm_map[normalize_name("DR Congo")] = "RD Congo"
norm_map[normalize_name("Democratic Republic of the Congo")] = "RD Congo"
norm_map[normalize_name("Turkey")] = "Turchia"
norm_map[normalize_name("Turkiye")] = "Turchia"
norm_map[normalize_name("USA")] = "Stati Uniti"
norm_map[normalize_name("United States")] = "Stati Uniti"

def get_sim_team_name(ds_name):
    nd = normalize_name(ds_name)
    if nd in norm_map:
        return norm_map[nd]
    for key, val in norm_map.items():
        if key in nd or nd in key:
            return val
    return None

def run_elo_simulation(df_res):
    """
    Run an ELO simulation over all matches to compute historical ELO ratings.
    """
    print("Running ELO simulation over history...")
    elo = {}
    elo_history = []  # List of dicts matching (date, team) -> ELO rating
    
    # Sort matches chronologically
    df_res = df_res.sort_values(by="date").copy()
    
    for idx, row in df_res.iterrows():
        date_str = str(row['date'])
        team_h = str(row['home_team'])
        team_a = str(row['away_team'])
        
        home_score = row['home_score']
        away_score = row['away_score']
        
        if pd.isna(home_score) or pd.isna(away_score):
            continue
            
        # Initialize if not present
        if team_h not in elo: elo[team_h] = 1500.0
        if team_a not in elo: elo[team_a] = 1500.0
        
        r_h = elo[team_h]
        r_a = elo[team_a]
        
        # Save ELO before the match
        elo_history.append({"date": date_str, "team": team_h, "elo": r_h})
        elo_history.append({"date": date_str, "team": team_a, "elo": r_a})
        
        # Determine K-factor based on tournament
        tournament = str(row['tournament'])
        if "World Cup" in tournament:
            K = 50
        elif "Championship" in tournament or "Copa" in tournament or "Euro" in tournament:
            K = 40
        elif "Qualifiers" in tournament:
            K = 30
        else:
            K = 20
            
        # Expected outcomes (Home advantage of +100 ELO points if not neutral)
        neutral = bool(row['neutral'])
        r_h_adj = r_h + (100.0 if not neutral else 0.0)
        
        exp_h = 1.0 / (1.0 + 10.0 ** ((r_a - r_h_adj) / 400.0))
        exp_a = 1.0 - exp_h
        
        # Actual outcomes
        w_h = 1.0 if home_score > away_score else (0.5 if home_score == away_score else 0.0)
        w_a = 1.0 - w_h
        
        # Updates
        elo[team_h] = r_h + K * (w_h - exp_h)
        elo[team_a] = r_a + K * (w_a - exp_a)
        
    df_elo = pd.DataFrame(elo_history)
    df_elo_lookup = df_elo.groupby(["date", "team"])["elo"].last().unstack().ffill().fillna(1500.0)
    print(f"ELO simulation finished. Current tracked teams: {len(elo)}")
    return df_elo_lookup, elo

def train_models():
    # 1. Load active databases
    print("Loading active databases...")
    with open(TEAMS_DB_PATH, 'r', encoding='utf-8') as f:
        teams_db = json.load(f)
        
    with open(SQUAD_VALUES_PATH, 'r', encoding='utf-8') as f:
        squad_values = json.load(f)
        
    # Get the 48 qualified team names and codes
    qualified_names = {}
    qualified_codes = {}
    for code, info in teams_db.items():
        qualified_names[info["name"]] = code
        qualified_codes[code] = info["name"]
        
    # Load historical results
    df_res = pd.read_csv(RESULTS_PATH)
    
    # 2. Run ELO Simulation
    df_elo, final_elos = run_elo_simulation(df_res)
    
    # 3. Fit ELO to Squad Value regression for imputation
    # We map current baseStrength (from teams.json) and ELO to current squad values
    print("Fitting ELO-to-Squad-Value regression for historical valuation imputation...")
    impute_data = []
    for t_name, val_info in squad_values.items():
        code = val_info["code"]
        db_team = teams_db[code]
        base_strength = db_team["baseStrength"] # proxy for modern ELO
        total_value = val_info["total_value"]
        if total_value > 0:
            impute_data.append({"strength": base_strength, "log_value": np.log10(total_value)})
            
    df_imp = pd.DataFrame(impute_data)
    # Simple linear fit log10(Value) = a * strength + b
    slope, intercept = np.polyfit(df_imp["strength"], df_imp["log_value"], 1)
    print(f"Imputation model: log10(Value) = {slope:.4f} * Strength + {intercept:.4f}")
    
    def get_imputed_value(strength):
        log_val = slope * strength + intercept
        return 10 ** log_val
        
    # 4. Feature Extraction for Training Set
    # We train on matches from 2005 onwards to ensure relevancy to modern game
    print("Extracting features from matches since 2005...")
    df_res['date_parsed'] = pd.to_datetime(df_res['date'])
    df_recent = df_res[df_res['date_parsed'] >= datetime(2005, 1, 1)].copy()
    
    train_rows = []
    
    for idx, row in df_recent.iterrows():
        date_str = str(row['date'])
        team_h = str(row['home_team'])
        team_a = str(row['away_team'])
        
        h_score = row['home_score']
        a_score = row['away_score']
        if pd.isna(h_score) or pd.isna(a_score):
            continue
            
        # Get ELO at match date
        try:
            elo_h = df_elo.loc[date_str, team_h]
            elo_a = df_elo.loc[date_str, team_a]
        except KeyError:
            elo_h = 1500.0
            elo_a = 1500.0
            
        # Get simulator names if they map
        sim_h = get_sim_team_name(team_h)
        sim_a = get_sim_team_name(team_a)
        
        # Determine squad valuations
        # If they are in squad_values.json, we use their current squad value as a proxy.
        # Otherwise, we impute based on ELO.
        val_h = squad_values[sim_h]["total_value"] if (sim_h and sim_h in squad_values) else get_imputed_value(elo_h / 20.0)
        val_a = squad_values[sim_a]["total_value"] if (sim_a and sim_a in squad_values) else get_imputed_value(elo_a / 20.0)
        
        neutral = int(row['neutral'])
        
        # Build symmetric training instances
        # Instance 1: Home/Focus Team H
        train_rows.append({
            "elo_focus": elo_h,
            "elo_opp": elo_a,
            "elo_diff": elo_h - elo_a,
            "log_value_focus": np.log10(val_h),
            "log_value_opp": np.log10(val_a),
            "log_value_ratio": np.log10(val_h / val_a),
            "is_home": int(not neutral),
            "is_neutral": neutral,
            "opponent_goals": a_score, # to calculate residuals for covariance later
            "goals": h_score
        })
        
        # Instance 2: Away/Focus Team A
        train_rows.append({
            "elo_focus": elo_a,
            "elo_opp": elo_h,
            "elo_diff": elo_a - elo_h,
            "log_value_focus": np.log10(val_a),
            "log_value_opp": np.log10(val_h),
            "log_value_ratio": np.log10(val_a / val_h),
            "is_home": 0,
            "is_neutral": neutral,
            "opponent_goals": h_score,
            "goals": a_score
        })
        
    df_train = pd.DataFrame(train_rows)
    print(f"Constructed {len(df_train)} training instances.")
    
    # 5. Train GBDT for Expected Goals (Lambda)
    X = df_train[["elo_focus", "elo_opp", "elo_diff", "log_value_focus", "log_value_opp", "log_value_ratio", "is_home", "is_neutral"]]
    y = df_train["goals"]
    
    print("Training GBDT expected goals (lambda) model...")
    if USE_LGB:
        print("  Using LightGBM Regressor")
        model_lambda = lgb.LGBMRegressor(n_estimators=100, learning_rate=0.05, max_depth=5, random_state=42)
    elif USE_XGB:
        print("  Using XGBoost Regressor")
        model_lambda = xgb.XGBRegressor(n_estimators=100, learning_rate=0.05, max_depth=5, random_state=42)
    else:
        print("  Using Scikit-Learn GradientBoostingRegressor")
        model_lambda = GradientBoostingRegressor(n_estimators=100, learning_rate=0.05, max_depth=4, random_state=42)
        
    model_lambda.fit(X, y)
    
    # 6. Fit GBDT for Bivariate Poisson Correlation (Gamma / Dixon-Coles rho)
    print("Computing residuals for Dixon-Coles correlation (gamma) training...")
    df_train["pred_goals"] = model_lambda.predict(X)
    
    # Match-level aggregation for covariance
    # We group by pairs to reconstruct match-level residuals
    match_pairs = []
    for i in range(0, len(df_train), 2):
        r1 = df_train.iloc[i]
        r2 = df_train.iloc[i+1]
        
        # Residuals
        e1 = r1["goals"] - r1["pred_goals"]
        e2 = r2["goals"] - r2["pred_goals"]
        
        # Target: standard residual product
        target_z = (e1 * e2) / np.sqrt(max(0.1, r1["pred_goals"]) * max(0.1, r2["pred_goals"]))
        
        match_pairs.append({
            "elo_diff_abs": abs(r1["elo_focus"] - r2["elo_focus"]),
            "elo_avg": (r1["elo_focus"] + r2["elo_focus"]) / 2.0,
            "log_value_ratio_abs": abs(r1["log_value_ratio"]),
            "sum_pred_goals": r1["pred_goals"] + r2["pred_goals"],
            "is_neutral": r1["is_neutral"],
            "z": target_z
        })
        
    df_match = pd.DataFrame(match_pairs)
    
    print("Training GBDT Dixon-Coles correlation (gamma) model...")
    X_g = df_match[["elo_diff_abs", "elo_avg", "log_value_ratio_abs", "sum_pred_goals", "is_neutral"]]
    y_g = df_match["z"]
    
    if USE_LGB:
        model_gamma = lgb.LGBMRegressor(n_estimators=50, learning_rate=0.03, max_depth=3, random_state=42)
    elif USE_XGB:
        model_gamma = xgb.XGBRegressor(n_estimators=50, learning_rate=0.03, max_depth=3, random_state=42)
    else:
        model_gamma = GradientBoostingRegressor(n_estimators=50, learning_rate=0.03, max_depth=3, random_state=42)
        
    model_gamma.fit(X_g, y_g)
    
    # 7. Generate baselines for all 48 qualified World Cup teams
    print("Generating pre-computed baselines for all pairings of World Cup 2026 teams...")
    baselines = {}
    
    # List of qualified team codes
    codes = list(qualified_codes.keys())
    
    # We compute baseline expectations under World Cup conditions: neutral = 1, is_home = 0
    # For host nations (MEX, USA, CAN), their host bonus is applied dynamically client-side in engine.js
    # so we pre-compute neutral-ground baselines here.
    
    for i in range(len(codes)):
        for j in range(i+1, len(codes)):
            codeA = codes[i]
            codeB = codes[j]
            
            # Sort codes alphabetically to build order-independent key
            sorted_codes = sorted([codeA, codeB])
            key = f"{sorted_codes[0]}_{sorted_codes[1]}"
            
            # Retrieve squad names
            nameA = qualified_codes[sorted_codes[0]]
            nameB = qualified_codes[sorted_codes[1]]
            
            # Get values
            valA = squad_values[nameA]["total_value"]
            valB = squad_values[nameB]["total_value"]
            
            # Get ELOs (using baseStrength scaled to standard ELO scale: strength * 20)
            eloA = teams_db[sorted_codes[0]]["baseStrength"] * 20.0
            eloB = teams_db[sorted_codes[1]]["baseStrength"] * 20.0
            
            # Predict goals A vs B
            featuresA = pd.DataFrame([{
                "elo_focus": eloA, "elo_opp": eloB, "elo_diff": eloA - eloB,
                "log_value_focus": np.log10(valA), "log_value_opp": np.log10(valB),
                "log_value_ratio": np.log10(valA / valB),
                "is_home": 0, "is_neutral": 1
            }])
            
            featuresB = pd.DataFrame([{
                "elo_focus": eloB, "elo_opp": eloA, "elo_diff": eloB - eloA,
                "log_value_focus": np.log10(valB), "log_value_opp": np.log10(valA),
                "log_value_ratio": np.log10(valB / valA),
                "is_home": 0, "is_neutral": 1
            }])
            
            lambdaA = float(model_lambda.predict(featuresA)[0])
            lambdaB = float(model_lambda.predict(featuresB)[0])
            
            # Predict Dixon-Coles rho (gamma)
            features_g = pd.DataFrame([{
                "elo_diff_abs": abs(eloA - eloB),
                "elo_avg": (eloA + eloB) / 2.0,
                "log_value_ratio_abs": abs(np.log10(valA / valB)),
                "sum_pred_goals": lambdaA + lambdaB,
                "is_neutral": 1
            }])
            gamma_pred = float(model_gamma.predict(features_g)[0])
            
            # Post-processing and safety clamping
            # Clamping lambda to typical ranges [0.1, 8.0]
            lambdaA_clamped = max(0.1, min(8.0, lambdaA))
            lambdaB_clamped = max(0.1, min(8.0, lambdaB))
            
            # Clamping Dixon-Coles correlation coefficient (gamma) to [-0.25, 0.25]
            # Dixon-Coles is valid only inside this region to guarantee positive probabilities
            gamma_clamped = max(-0.25, min(0.25, gamma_pred))
            
            # Save
            baselines[key] = {
                "lambdaA": round(lambdaA_clamped, 4),
                "lambdaB": round(lambdaB_clamped, 4),
                "gamma": round(gamma_clamped, 4)
            }
            
    # Write output JSON
    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
    with open(OUTPUT_PATH, 'w', encoding='utf-8') as f:
        json.dump(baselines, f, indent=2, ensure_ascii=False)
        
    print(f"Pre-computed baselines written to {OUTPUT_PATH}. Total pairs: {len(baselines)}")

if __name__ == "__main__":
    train_models()
