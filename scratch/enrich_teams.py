import json
import os
import math
import unicodedata
import pandas as pd

TEAMS_DB_PATH = "data/teams.json"
PLAYERS_CSV_PATH = "archive-transfermarkt/players.csv"

# 1. Team Naming & Matching Mapping
sim_to_csv_country = {
    'Messico': ['Mexico'],
    'Sudafrica': ['South Africa'],
    'Corea del Sud': ['Korea, South'],
    'Repubblica Ceca': ['Czech Republic', 'Czechia'],
    'Canada': ['Canada'],
    'Bosnia Erzegovina': ['Bosnia-Herzegovina', 'Bosnia and Herzegovina'],
    'Qatar': ['Qatar'],
    'Svizzera': ['Switzerland'],
    'Brasile': ['Brazil'],
    'Marocco': ['Morocco'],
    'Haiti': ['Haiti'],
    'Scozia': ['Scotland'],
    'Stati Uniti': ['United States', 'USA'],
    'Paraguay': ['Paraguay'],
    'Australia': ['Australia'],
    'Turchia': ['Tűrkiye', 'Turkey', 'Törkiye', 'Trkiye'],
    'Germania': ['Germany'],
    'Curaçao': ['Curacao', 'Curaçao'],
    "Costa d'Avorio": ["Cote d'Ivoire", "Ivory Coast", "Côte d'Ivoire"],
    'Ecuador': ['Ecuador'],
    'Paesi Bassi': ['Netherlands'],
    'Paesi Basi': ['Netherlands'],
    'Giappone': ['Japan'],
    'Svezia': ['Sweden'],
    'Tunisia': ['Tunisia'],
    'Belgio': ['Belgium'],
    'Egitto': ['Egypt'],
    'Iran': ['Iran', 'Islamic Republic of Iran'],
    'Nuova Zelanda': ['New Zealand'],
    'Spagna': ['Spain'],
    'Capo Verde': ['Cape Verde', 'Cabo Verde'],
    'Arabia Saudita': ['Saudi Arabia'],
    'Uruguay': ['Uruguay'],
    'Francia': ['France'],
    'Senegal': ['Senegal'],
    'Iraq': ['Iraq'],
    'Norvegia': ['Norway'],
    'Argentina': ['Argentina'],
    'Algeria': ['Algeria'],
    'Austria': ['Austria'],
    'Giordania': ['Jordan'],
    'Portogallo': ['Portugal'],
    'RD Congo': ['DR Congo', 'Congo DR', 'Democratic Republic of the Congo'],
    'Uzbekistan': ['Uzbekistan'],
    'Colombia': ['Colombia'],
    'Inghilterra': ['England'],
    'Croazia': ['Croatia'],
    'Ghana': ['Ghana'],
    'Panama': ['Panama']
}

def normalize_name(s):
    if not s:
        return ""
    s = s.lower().strip()
    s = "".join(c for c in unicodedata.normalize('NFD', s) if unicodedata.category(c) != 'Mn')
    s = s.replace('-', ' ').replace('_', ' ').replace('and', '').replace('co.', '').replace('&', '')
    return " ".join(s.split())

def get_name_tokens(name):
    if not name:
        return set()
    name = normalize_name(name)
    return set(name.split())

def is_player_match_tokens(t1, t2):
    if not t1 or not t2:
        return False
    if len(t1) == 1 or len(t2) == 1:
        return len(t1.intersection(t2)) >= 1
    if len(t1) >= 2 and len(t2) >= 2:
        return len(t1.intersection(t2)) >= 2
    return len(t1.intersection(t2)) >= 1

def map_value_to_rating(value, base_strength):
    # Logarithmic scaling
    # Value 100k -> rating 65
    # Value 100M -> rating 90
    log_v = math.log10(max(100000, value))
    rating = 65 + (log_v - 5) * 8.33
    rating = int(round(rating))
    
    # Cap rating based on team's baseStrength to avoid imbalance
    # We allow rating to go slightly above baseStrength, but cap it at a reasonable maximum
    max_cap = max(88, base_strength + 8)
    rating = min(max_cap, rating)
    rating = max(63, rating) # absolute minimum
    return rating

def main():
    print("Loading current teams database...")
    with open(TEAMS_DB_PATH, 'r', encoding='utf-8') as f:
        teams_db = json.load(f)

    print("Loading Transfermarkt players database...")
    df_p = pd.read_csv(PLAYERS_CSV_PATH)
    # Filter for active players in recent seasons to keep data realistic
    df_active = df_p[df_p['last_season'] >= 2023].copy()
    print(f"Loaded {len(df_active)} active players.")

    # Fill NaN values
    df_active['market_value_in_eur'] = df_active['market_value_in_eur'].fillna(100000)
    df_active['current_club_name'] = df_active['current_club_name'].fillna('Svincolato')
    df_active['date_of_birth'] = df_active['date_of_birth'].fillna('')

    total_added = 0

    for team_code, info in teams_db.items():
        name = info['name']
        base_strength = info.get('baseStrength', 75)
        existing_players = info.get('players', [])
        
        # Tokenize existing player names to prevent duplicates
        existing_tokens = [get_name_tokens(p['name']) for p in existing_players]
        
        # Count existing positions
        existing_gks = sum(1 for p in existing_players if p['pos'] == 'P')
        existing_outfield = sum(1 for p in existing_players if p['pos'] != 'P')
        
        # Find matches in Transfermarkt
        csv_countries = sim_to_csv_country.get(name, [name])
        
        # Try finding players matching any of the csv_countries
        df_team_players = df_active[df_active['country_of_citizenship'].isin(csv_countries)]
        
        # If still empty, try case insensitive matching
        if len(df_team_players) == 0:
            norm_countries = [normalize_name(c) for c in csv_countries]
            df_team_players = df_active[df_active['country_of_citizenship'].apply(lambda x: normalize_name(str(x)) in norm_countries)]
            
        print(f"Processing {name} ({team_code}): existing={len(existing_players)} (GK={existing_gks}, Outfield={existing_outfield}), found in CSV={len(df_team_players)}")

        # Separate goalkeepers and outfield players in CSV candidates
        df_gks = df_team_players[df_team_players['position'] == 'Goalkeeper'].sort_values(by='market_value_in_eur', ascending=False)
        df_outfield = df_team_players[df_team_players['position'] != 'Goalkeeper'].sort_values(by='market_value_in_eur', ascending=False)

        new_players = []

        # 1. Fill Goalkeepers up to 3
        needed_gks = max(0, 3 - existing_gks)
        added_gks = 0
        for _, row in df_gks.iterrows():
            if added_gks >= needed_gks:
                break
            p_name = row['name']
            p_tokens = get_name_tokens(p_name)
            
            # Check if duplicate
            is_dup = False
            for et in existing_tokens:
                if is_player_match_tokens(p_tokens, et):
                    is_dup = True
                    break
            if is_dup:
                continue
                
            # Create player profile
            dob = row['date_of_birth']
            age = 26.5
            if dob and '-' in dob:
                try:
                    age = 2026 - int(dob.split('-')[0])
                except:
                    pass
                    
            val = float(row['market_value_in_eur'])
            rating = map_value_to_rating(val, base_strength)
            
            new_player = {
                "name": p_name,
                "pos": "P",
                "club": row['current_club_name'],
                "rating": rating,
                "goals": 0,
                "assists": 0,
                "yellowCards": 0,
                "status": "bench",
                "value": val,
                "age": round(age, 1)
            }
            new_players.append(new_player)
            existing_tokens.append(p_tokens)
            added_gks += 1

        # 2. Fill Outfield players up to 20
        needed_outfield = max(0, 20 - existing_outfield)
        added_outfield = 0
        for _, row in df_outfield.iterrows():
            if added_outfield >= needed_outfield:
                break
            p_name = row['name']
            p_tokens = get_name_tokens(p_name)
            
            # Check if duplicate
            is_dup = False
            for et in existing_tokens:
                if is_player_match_tokens(p_tokens, et):
                    is_dup = True
                    break
            if is_dup:
                continue
                
            # Map position
            csv_pos = row['position']
            sim_pos = 'D'
            if csv_pos == 'Defender':
                sim_pos = 'D'
            elif csv_pos == 'Midfielder':
                sim_pos = 'C'
            elif csv_pos == 'Attack':
                sim_pos = 'A'
                
            dob = row['date_of_birth']
            age = 26.5
            if dob and '-' in dob:
                try:
                    age = 2026 - int(dob.split('-')[0])
                except:
                    pass
                    
            val = float(row['market_value_in_eur'])
            rating = map_value_to_rating(val, base_strength)
            
            new_player = {
                "name": p_name,
                "pos": sim_pos,
                "club": row['current_club_name'],
                "rating": rating,
                "goals": 0,
                "assists": 0,
                "yellowCards": 0,
                "status": "bench",
                "value": val,
                "age": round(age, 1)
            }
            new_players.append(new_player)
            existing_tokens.append(p_tokens)
            added_outfield += 1

        # Append new players to team
        info['players'] = existing_players + new_players
        total_added += len(new_players)
        print(f"   Added {len(new_players)} players (GK={added_gks}, Outfield={added_outfield}). New Total={len(info['players'])}")

    print(f"Finished. Added {total_added} players to the database across all teams.")
    
    # Save back to teams.json
    print(f"Saving enriched database to {TEAMS_DB_PATH}...")
    with open(TEAMS_DB_PATH, 'w', encoding='utf-8') as f:
        json.dump(teams_db, f, indent=2, ensure_ascii=False)
    print("Done!")

if __name__ == '__main__':
    main()
