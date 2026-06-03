import os
import sys
import unicodedata
import re
import math
import pandas as pd
from datetime import datetime

# Configure UTF-8 stdout
sys.stdout.reconfigure(encoding='utf-8')

# Try using rapid json parser orjson if available
try:
    import orjson
    def load_json(path):
        with open(path, 'rb') as f:
            return orjson.loads(f.read())
except ImportError:
    import json
    def load_json(path):
        with open(path, 'r', encoding='utf-8') as f:
            return json.load(f)

import json # for output serialization

# Paths
SCRATCH_DIR = os.path.dirname(os.path.abspath(__file__))
WORKSPACE = os.path.dirname(SCRATCH_DIR)
TEAMS_DB_PATH = os.path.join(WORKSPACE, "data", "teams.json")
OUTPUT_DIR = os.path.join(WORKSPACE, "data", "stats")
os.makedirs(OUTPUT_DIR, exist_ok=True)

# 1. Team Naming & Matching Mapping
sim_to_dataset = {
    'Messico': 'Mexico',
    'Sudafrica': 'South Africa',
    'Corea del Sud': 'South Korea',
    'Repubblica Ceca': 'Czechia',
    'Canada': 'Canada',
    'Bosnia Erzegovina': 'Bosnia and Herzegovina',
    'Qatar': 'Qatar',
    'Svizzera': 'Switzerland',
    'Brasile': 'Brazil',
    'Marocco': 'Morocco',
    'Haiti': 'Haiti',
    'Scozia': 'Scotland',
    'Stati Uniti': 'United States',
    'Paraguay': 'Paraguay',
    'Australia': 'Australia',
    'Turchia': 'Turkey',
    'Germania': 'Germany',
    'Curaçao': 'Curacao',
    "Costa d'Avorio": "Cote d'Ivoire",
    'Ecuador': 'Ecuador',
    'Paesi Basi': 'Netherlands', # note spelling in app
    'Paesi Bassi': 'Netherlands',
    'Giappone': 'Japan',
    'Svezia': 'Sweden',
    'Tunisia': 'Tunisia',
    'Belgio': 'Belgium',
    'Egitto': 'Egypt',
    'Iran': 'Iran',
    'Nuova Zelanda': 'New Zealand',
    'Spagna': 'Spain',
    'Capo Verde': 'Cape Verde',
    'Arabia Saudita': 'Saudi Arabia',
    'Uruguay': 'Uruguay',
    'Francia': 'France',
    'Senegal': 'Senegal',
    'Iraq': 'Iraq',
    'Norvegia': 'Norway',
    'Argentina': 'Argentina',
    'Algeria': 'Algeria',
    'Austria': 'Austria',
    'Giordania': 'Jordan',
    'Portogallo': 'Portugal',
    'RD Congo': 'DR Congo',
    'Uzbekistan': 'Uzbekistan',
    'Colombia': 'Colombia',
    'Inghilterra': 'England',
    'Croazia': 'Croatia',
    'Ghana': 'Ghana',
    'Panama': 'Panama'
}

def normalize_name(s):
    if not s:
        return ""
    s = s.lower().strip()
    s = "".join(c for c in unicodedata.normalize('NFD', s) if unicodedata.category(c) != 'Mn')
    s = s.replace('-', ' ').replace('_', ' ').replace('and', '').replace('co.', '').replace('&', '')
    return " ".join(s.split())

norm_map = {}
for sim_name, ds_name in sim_to_dataset.items():
    norm_map[normalize_name(ds_name)] = sim_name
    norm_map[normalize_name(sim_name)] = sim_name

# Add standard dataset variations
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

def get_name_tokens(name):
    if not name:
        return set()
    name = normalize_name(name)
    # Remove common words
    for word in ['junior', 'senior', 'filho', 'neto', 'jr', 'sr', 'da', 'de', 'do', 'dos', 'das', 'el']:
        name = name.replace(f" {word} ", " ")
        if name.endswith(f" {word}"):
            name = name[:-len(word)-1]
        if name.startswith(f"{word} "):
            name = name[len(word)+1:]
    return set(re.findall(r'[a-z0-9]{2,}', name))

def is_player_match(name1, name2):
    t1 = get_name_tokens(name1)
    t2 = get_name_tokens(name2)
    if not t1 or not t2:
        return False
    if t1 == t2 or t1.issubset(t2) or t2.issubset(t1):
        return True
    return len(t1.intersection(t2)) >= 2

def is_player_match_tokens(t1, t2):
    if not t1 or not t2:
        return False
    if t1 == t2 or t1.issubset(t2) or t2.issubset(t1):
        return True
    return len(t1.intersection(t2)) >= 2

def main():
    print("========================================")
    print("STARTING BULK DATA ARCHIVE PROCESSING")
    print("========================================")

    # 1. Load active database
    print(f"Loading current teams database from {TEAMS_DB_PATH}...")
    with open(TEAMS_DB_PATH, 'r', encoding='utf-8') as f:
        teams_db = json.load(f)

    # Collect team details
    all_sim_teams = set()
    for team_code, t_info in teams_db.items():
        all_sim_teams.add(t_info["name"])
    print(f"Loaded {len(all_sim_teams)} teams from database.")

    # ========================================
    # PART A: HISTORICAL H2H & RECURRENCES (results.csv & shootouts.csv)
    # ========================================
    results_path = os.path.join(WORKSPACE, "archive", "results.csv")
    shootouts_path = os.path.join(WORKSPACE, "archive", "shootouts.csv")

    print("\n[PART A] Processing historical matches...")
    if not os.path.exists(results_path):
        print(f"Warning: results.csv not found at {results_path}!")
        return

    # Load shootouts to check penalty wins
    shootouts = {}
    if os.path.exists(shootouts_path):
        print("Loading shootouts database...")
        df_sh = pd.read_csv(shootouts_path)
        for _, row in df_sh.iterrows():
            key = (str(row['date']), str(row['home_team']), str(row['away_team']))
            shootouts[key] = str(row['winner'])

    # Read matches
    df_res = pd.read_csv(results_path)
    print(f"Loaded {len(df_res)} matches from results.csv.")

    h2h = {}
    wc_matches = []
    
    # Initialize H2H for all active teams
    for t1 in all_sim_teams:
        h2h[t1] = {}
        for t2 in all_sim_teams:
            if t1 != t2:
                h2h[t1][t2] = {"played": 0, "win": 0, "draw": 0, "loss": 0, "gf": 0, "ga": 0, "shootout_wins": 0, "matches": []}

    print("Analyzing matches and building H2H records...")
    for _, row in df_res.iterrows():
        home_raw = str(row['home_team'])
        away_raw = str(row['away_team'])
        home_sim = get_sim_team_name(home_raw)
        away_sim = get_sim_team_name(away_raw)
        
        home_score = int(row['home_score']) if not pd.isna(row['home_score']) else None
        away_score = int(row['away_score']) if not pd.isna(row['away_score']) else None
        
        if home_score is None or away_score is None:
            continue
            
        tournament = str(row['tournament'])
        date_str = str(row['date'])
        
        # Track World Cup specific match details for tournament statistics
        if tournament == "FIFA World Cup":
            wc_matches.append({
                "date": date_str,
                "home": home_sim or home_raw,
                "away": away_sim or away_raw,
                "home_score": home_score,
                "away_score": away_score,
                "neutral": bool(row['neutral'])
            })

        # H2H tracking
        if home_sim and away_sim and home_sim in all_sim_teams and away_sim in all_sim_teams:
            if home_sim == away_sim:
                continue
            # We found a match between two World Cup 2026 teams!
            sh_key = (date_str, home_raw, away_raw)
            sh_winner = shootouts.get(sh_key)
            sh_winner_sim = get_sim_team_name(sh_winner) if sh_winner else None
            
            # Update Team A -> Team B
            h2h[home_sim][away_sim]["played"] += 1
            h2h[home_sim][away_sim]["gf"] += home_score
            h2h[home_sim][away_sim]["ga"] += away_score
            
            # Update Team B -> Team A
            h2h[away_sim][home_sim]["played"] += 1
            h2h[away_sim][home_sim]["gf"] += away_score
            h2h[away_sim][home_sim]["ga"] += home_score
            
            # Log individual match for historical timeline
            match_summary = {
                "date": date_str,
                "tournament": tournament,
                "score": f"{home_score}-{away_score}",
                "neutral": bool(row['neutral']),
                "shootout_winner": sh_winner_sim
            }
            h2h[home_sim][away_sim]["matches"].append(match_summary)
            # Reverted for the other side
            h2h[away_sim][home_sim]["matches"].append(match_summary)
            
            if home_score > away_score:
                h2h[home_sim][away_sim]["win"] += 1
                h2h[away_sim][home_sim]["loss"] += 1
            elif home_score < away_score:
                h2h[home_sim][away_sim]["loss"] += 1
                h2h[away_sim][home_sim]["win"] += 1
            else: # Draw
                h2h[home_sim][away_sim]["draw"] += 1
                h2h[away_sim][home_sim]["draw"] += 1
                
                # Check shootout winner
                if sh_winner_sim == home_sim:
                    h2h[home_sim][away_sim]["shootout_wins"] += 1
                elif sh_winner_sim == away_sim:
                    h2h[away_sim][home_sim]["shootout_wins"] += 1

    # Cleanup empty H2H pairs to keep output compact
    h2h_compact = {}
    for t1, opponents in h2h.items():
        h2h_compact[t1] = {}
        for t2, data in opponents.items():
            if data["played"] > 0:
                # Keep latest 5 matches to avoid bloat
                data["matches"] = sorted(data["matches"], key=lambda x: x["date"], reverse=True)[:5]
                h2h_compact[t1][t2] = data

    # Calculate Recurrences (World Cup statistics)
    print("Calculating World Cup tournament trends & recurrences...")
    total_wc_goals = 0
    total_wc_matches = len(wc_matches)
    exact_scores_count = {}
    neutral_draw_count = 0
    neutral_match_count = 0
    
    for m in wc_matches:
        home_s = m["home_score"]
        away_s = m["away_score"]
        total_wc_goals += (home_s + away_s)
        
        # Sort score to count combinations neutrally (e.g. 2-1 and 1-2 are the same exact result)
        score_key = f"{max(home_s, away_s)}-{min(home_s, away_s)}"
        exact_scores_count[score_key] = exact_scores_count.get(score_key, 0) + 1
        
        if m["neutral"]:
            neutral_match_count += 1
            if home_s == away_s:
                neutral_draw_count += 1

    avg_wc_goals = total_wc_goals / total_wc_matches if total_wc_matches > 0 else 2.65
    neutral_draw_rate = neutral_draw_count / neutral_match_count if neutral_match_count > 0 else 0.25
    
    # Sort exact scores by frequency
    sorted_scores = sorted(exact_scores_count.items(), key=lambda x: x[1], reverse=True)
    exact_scores_pct = []
    for score_key, count in sorted_scores[:10]:
        exact_scores_pct.append({
            "score": score_key,
            "count": count,
            "pct": round((count / total_wc_matches) * 100, 2) if total_wc_matches > 0 else 0
        })
        
    recurrences_data = {
        "avg_goals_wc": round(avg_wc_goals, 3),
        "total_wc_matches_analyzed": total_wc_matches,
        "knockout_draw_rate": round(neutral_draw_rate, 3),
        "exact_scores": exact_scores_pct
    }

    # Write Part A outputs
    with open(os.path.join(OUTPUT_DIR, "h2h_stats.json"), 'w', encoding='utf-8') as f:
        json.dump(h2h_compact, f, indent=2, ensure_ascii=False)
    with open(os.path.join(OUTPUT_DIR, "recurrences.json"), 'w', encoding='utf-8') as f:
        json.dump(recurrences_data, f, indent=2, ensure_ascii=False)
    print("Part A completed and files written successfully.")

    # ========================================
    # PART B: SQUAD VALUATIONS (players.csv & players_data-2025_2026.csv)
    # ========================================
    players_csv_path = os.path.join(WORKSPACE, "archive (1)", "players.csv")
    players_2526_csv_path = os.path.join(WORKSPACE, "archive (3)", "players_data-2025_2026.csv")

    print("\n[PART B] Processing squad valuations...")
    
    # Load valuations database from Transfermarkt
    tm_players = []
    if os.path.exists(players_csv_path):
        print(f"Loading valuations from {players_csv_path}...")
        df_p = pd.read_csv(players_csv_path)
        for _, row in df_p.iterrows():
            tm_players.append({
                "name": str(row['name']),
                "tokens": get_name_tokens(str(row['name'])),
                "country": str(row['country_of_citizenship']),
                "market_value": float(row['market_value_in_eur']) if not pd.isna(row['market_value_in_eur']) else 0,
                "date_of_birth": str(row['date_of_birth']) if not pd.isna(row['date_of_birth']) else None
            })
        print(f"Loaded {len(tm_players)} players from Transfermarkt.")
        
    # Match players and estimate valuations
    squad_values = {}
    for team_code, t_info in teams_db.items():
        squad_values[t_info["name"]] = {
            "code": team_code,
            "total_value": 0,
            "avg_age": 0.0,
            "player_count": 0,
            "top_players": []
        }

    total_matched_players = 0
    total_players = 0
    
    # Iterate and match
    for team_code, t_info in teams_db.items():
        t_name = t_info["name"]
        ages = []
        player_values = []
        
        for p in t_info.get("players", []):
            total_players += 1
            p_name = p["name"]
            p_tokens = get_name_tokens(p_name)
            matched_val = 0
            matched_age = None
            
            # Check matching in TM players
            best_match = None
            for tmp in tm_players:
                if is_player_match_tokens(p_tokens, tmp["tokens"]):
                    if not best_match or tmp["market_value"] > best_match["market_value"]:
                        best_match = tmp
                        
            if best_match:
                matched_val = best_match["market_value"]
                # Calculate age from DOB
                if best_match["date_of_birth"]:
                    try:
                        dob_str = best_match["date_of_birth"].split()[0] # YYYY-MM-DD
                        dob = datetime.strptime(dob_str, "%Y-%m-%d")
                        matched_age = (datetime.now() - dob).days / 365.25
                    except Exception:
                        pass
                total_matched_players += 1
                
            # Fallback estimation based on rating
            if matched_val == 0:
                r = p.get("rating", 75)
                if r >= 90: matched_val = 110_000_000
                elif r >= 86: matched_val = 70_000_000
                elif r >= 83: matched_val = 40_000_000
                elif r >= 80: matched_val = 18_000_000
                elif r >= 75: matched_val = 6_000_000
                else: matched_val = 1_500_000
                
            if matched_age is None:
                # Guess age based on average player profile
                matched_age = 26.5
                
            p["value"] = matched_val
            p["age"] = round(matched_age, 1)
            
            ages.append(matched_age)
            player_values.append((p_name, matched_val, p["age"]))
            squad_values[t_name]["total_value"] += matched_val
            squad_values[t_name]["player_count"] += 1
            
        if ages:
            squad_values[t_name]["avg_age"] = round(sum(ages) / len(ages), 1)
            
        # Top 3 players by value
        sorted_p = sorted(player_values, key=lambda x: x[1], reverse=True)
        squad_values[t_name]["top_players"] = [
            {"name": name, "value_str": f"€{val/1e6:.1f}M" if val >= 1e6 else f"€{val/1e3:.0f}K", "age": age}
            for name, val, age in sorted_p[:3]
        ]

    print(f"Matched {total_matched_players} out of {total_players} players from Transfermarkt archives.")
    
    # Save updated teams_db with player valuations and ages
    print(f"Saving updated database with player valuations back to {TEAMS_DB_PATH}...")
    with open(TEAMS_DB_PATH, 'w', encoding='utf-8') as f:
        json.dump(teams_db, f, indent=2, ensure_ascii=False)

    # Write Squad Values JSON
    with open(os.path.join(OUTPUT_DIR, "squad_values.json"), 'w', encoding='utf-8') as f:
        json.dump(squad_values, f, indent=2, ensure_ascii=False)
    print("Part B completed and files written successfully.")

    # ========================================
    # PART C: STATSBOMB EVENTS AGGREGATION (data/events/ & data/matches/)
    # ========================================
    matches_root = os.path.join(WORKSPACE, "archive (2)", "data", "matches")
    events_root = os.path.join(WORKSPACE, "archive (2)", "data", "events")

    print("\n[PART C] Processing StatsBomb event data...")
    if not os.path.exists(matches_root) or not os.path.exists(events_root):
        print("Warning: StatsBomb matches or events directory not found!")
        return

    # 1. Load matches metadata to map match_id to teams
    print("Reading matches metadata files...")
    sb_matches = {}
    for comp_id in os.listdir(matches_root):
        comp_dir = os.path.join(matches_root, comp_id)
        if not os.path.isdir(comp_dir):
            continue
        for season_file in os.listdir(comp_dir):
            if not season_file.endswith('.json'):
                continue
            file_path = os.path.join(comp_dir, season_file)
            try:
                matches_list = load_json(file_path)
                for m in matches_list:
                    match_id = m.get("match_id")
                    h_team_name = m.get("home_team", {}).get("home_team_name")
                    a_team_name = m.get("away_team", {}).get("away_team_name")
                    comp_name = m.get("competition", {}).get("competition_name")
                    season_name = m.get("season", {}).get("season_name")
                    
                    sb_matches[match_id] = {
                        "home": h_team_name,
                        "away": a_team_name,
                        "competition": comp_name,
                        "season": season_name
                    }
            except Exception as e:
                print(f"Error reading {file_path}: {e}")

    print(f"Loaded metadata for {len(sb_matches)} matches.")

    # Filter matches involving our 48 teams
    relevant_matches = {}
    for match_id, info in sb_matches.items():
        home_sim = get_sim_team_name(info["home"])
        away_sim = get_sim_team_name(info["away"])
        
        if home_sim or away_sim:
            relevant_matches[match_id] = {
                "home": info["home"],
                "away": info["away"],
                "home_sim": home_sim,
                "away_sim": away_sim,
                "competition": info["competition"],
                "season": info["season"]
            }

    print(f"Identified {len(relevant_matches)} StatsBomb matches involving qualified World Cup teams.")

    # 2. Process events files for relevant matches
    team_sb_aggregates = {}
    for sim_t in all_sim_teams:
        team_sb_aggregates[sim_t] = {
            "match_count": 0,
            "possession_sums": 0.0,
            "pass_accuracy_sums": 0.0,
            "xg_sums": 0.0,
            "shots_sums": 0,
            "sot_sums": 0,
            "fouls_sums": 0
        }

    print("Parsing event files...")
    processed_count = 0
    for match_id, m_info in relevant_matches.items():
        event_file = os.path.join(events_root, f"{match_id}.json")
        if not os.path.exists(event_file):
            continue

        try:
            events = load_json(event_file)
            
            # Aggregation arrays
            # StatsBomb matches track stats by team name raw
            home_raw = m_info["home"]
            away_raw = m_info["away"]
            
            stats = {
                home_raw: {"passes": 0, "completed_passes": 0, "shots": 0, "sot": 0, "xg": 0.0, "fouls": 0},
                away_raw: {"passes": 0, "completed_passes": 0, "shots": 0, "sot": 0, "xg": 0.0, "fouls": 0}
            }
            
            for ev in events:
                e_type = ev.get("type", {}).get("name")
                e_team = ev.get("team", {}).get("name")
                
                if e_team not in stats:
                    continue
                    
                if e_type == "Pass":
                    stats[e_team]["passes"] += 1
                    # Pass outcome 'None' means completed in StatsBomb
                    outcome = ev.get("pass", {}).get("outcome", {}).get("name")
                    if not outcome:
                        stats[e_team]["completed_passes"] += 1
                elif e_type == "Shot":
                    stats[e_team]["shots"] += 1
                    # Shot outcome
                    outcome = ev.get("shot", {}).get("outcome", {}).get("name")
                    if outcome in ["Goal", "Saved", "Saved to Post"]:
                        stats[e_team]["sot"] += 1
                    xg = ev.get("shot", {}).get("statsbomb_xg", 0.0)
                    stats[e_team]["xg"] += xg
                elif e_type == "Foul Committed":
                    stats[e_team]["fouls"] += 1

            # Calculate match aggregates
            h_passes = stats[home_raw]["passes"]
            a_passes = stats[away_raw]["passes"]
            total_passes = h_passes + a_passes
            
            h_poss = (h_passes / total_passes) * 100 if total_passes > 0 else 50.0
            a_poss = 100.0 - h_poss
            
            h_acc = (stats[home_raw]["completed_passes"] / h_passes) * 100 if h_passes > 0 else 75.0
            a_acc = (stats[away_raw]["completed_passes"] / a_passes) * 100 if a_passes > 0 else 75.0
            
            # Map back to simulator teams
            h_sim = m_info["home_sim"]
            a_sim = m_info["away_sim"]
            
            if h_sim and h_sim in all_sim_teams:
                ta = team_sb_aggregates[h_sim]
                ta["match_count"] += 1
                ta["possession_sums"] += h_poss
                ta["pass_accuracy_sums"] += h_acc
                ta["xg_sums"] += stats[home_raw]["xg"]
                ta["shots_sums"] += stats[home_raw]["shots"]
                ta["sot_sums"] += stats[home_raw]["sot"]
                ta["fouls_sums"] += stats[home_raw]["fouls"]
                
            if a_sim and a_sim in all_sim_teams:
                ta = team_sb_aggregates[a_sim]
                ta["match_count"] += 1
                ta["possession_sums"] += a_poss
                ta["pass_accuracy_sums"] += a_acc
                ta["xg_sums"] += stats[away_raw]["xg"]
                ta["shots_sums"] += stats[away_raw]["shots"]
                ta["sot_sums"] += stats[away_raw]["sot"]
                ta["fouls_sums"] += stats[away_raw]["fouls"]
                
            processed_count += 1
            if processed_count % 100 == 0:
                print(f"Processed {processed_count} files...")
        except Exception as e:
            print(f"Error parsing events for match {match_id}: {e}")

    print(f"Successfully processed events for {processed_count} matches.")

    # Calculate final averages
    statsbomb_final = {}
    for team, data in team_sb_aggregates.items():
        count = data["match_count"]
        if count > 0:
            statsbomb_final[team] = {
                "match_count": count,
                "possession": round(data["possession_sums"] / count, 1),
                "pass_accuracy": round(data["pass_accuracy_sums"] / count, 1),
                "xg": round(data["xg_sums"] / count, 2),
                "shots": round(data["shots_sums"] / count, 1),
                "shots_on_target": round(data["sot_sums"] / count, 1),
                "fouls": round(data["fouls_sums"] / count, 1),
                "is_estimate": False
            }
        else:
            # Fallback estimation for teams with NO StatsBomb data (e.g. Curacao, Jordan)
            # Use general averages based on rating strengths in database
            t_strength = 70.0 # default
            for t_code, t_info in teams_db.items():
                if t_info["name"] == team:
                    t_strength = t_info.get("baseStrength", 72)
                    break
            
            # Map rating to likely possession/pass percentages
            est_poss = 50.0 + (t_strength - 75) * 0.4
            est_pass = 78.0 + (t_strength - 75) * 0.5
            est_xg = 1.2 + (t_strength - 75) * 0.04
            est_shots = 11.5 + (t_strength - 75) * 0.2
            
            statsbomb_final[team] = {
                "match_count": 0,
                "possession": round(max(38.0, min(65.0, est_poss)), 1),
                "pass_accuracy": round(max(70.0, min(90.0, est_pass)), 1),
                "xg": round(max(0.6, min(2.5, est_xg)), 2),
                "shots": round(max(7.0, min(18.0, est_shots)), 1),
                "shots_on_target": round(max(2.0, min(7.5, est_shots * 0.35)), 1),
                "fouls": 12.0,
                "is_estimate": True
            }

    # Write StatsBomb JSON
    with open(os.path.join(OUTPUT_DIR, "statsbomb_aggregated.json"), 'w', encoding='utf-8') as f:
        json.dump(statsbomb_final, f, indent=2, ensure_ascii=False)
    print("Part C completed and files written successfully.")
    
    print("\n========================================")
    print("ALL DATA ARCHIVES SUCCESSFULLY PROCESSED")
    print("========================================")

if __name__ == "__main__":
    main()
