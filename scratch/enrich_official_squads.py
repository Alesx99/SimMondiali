import json
import os
import re
import math
import random
import unicodedata
import pandas as pd
from bs4 import BeautifulSoup

TEAMS_DB_PATH = "data/teams.json"
WIKI_HTML_PATH = "data/wiki_squads.html"
PLAYERS_CSV_PATH = "archive-transfermarkt/players.csv"

# Mapping from Wikipedia header IDs to team codes
wiki_id_to_code = {
    'Czech_Republic': 'CZE', 'Mexico': 'MEX', 'South_Africa': 'RSA', 'South_Korea': 'KOR',
    'Bosnia_and_Herzegovina': 'BIH', 'Canada': 'CAN', 'Qatar': 'QAT', 'Switzerland': 'SUI',
    'Brazil': 'BRA', 'Haiti': 'HAI', 'Morocco': 'MAR', 'Scotland': 'SCO',
    'Australia': 'AUS', 'Paraguay': 'PAR', 'Turkey': 'TUR', 'United_States': 'USA',
    'Curaçao': 'CUW', 'Ecuador': 'ECU', 'Germany': 'GER', 'Ivory_Coast': 'CIV',
    'Japan': 'JPN', 'Netherlands': 'NED', 'Sweden': 'SWE', 'Tunisia': 'TUN',
    'Belgium': 'BEL', 'Egypt': 'EGY', 'Iran': 'IRN', 'New_Zealand': 'NZL',
    'Cape_Verde': 'CPV', 'Saudi_Arabia': 'KSA', 'Spain': 'ESP', 'Uruguay': 'URU',
    'France': 'FRA', 'Iraq': 'IRQ', 'Norway': 'NOR', 'Senegal': 'SEN',
    'Algeria': 'ALG', 'Argentina': 'ARG', 'Austria': 'AUT', 'Jordan': 'JOR',
    'Portugal': 'POR', 'DR_Congo': 'COD', 'Uzbekistan': 'UZB', 'Colombia': 'COL',
    'England': 'ENG', 'Croatia': 'CRO', 'Ghana': 'GHA', 'Panama': 'PAN'
}

# Mapping of Italian name to Transfermarkt English country name for cross-referencing
sim_to_csv_country = {
    'Messico': ['Mexico'], 'Sudafrica': ['South Africa'], 'Corea del Sud': ['Korea, South'],
    'Repubblica Ceca': ['Czech Republic', 'Czechia'], 'Canada': ['Canada'],
    'Bosnia Erzegovina': ['Bosnia-Herzegovina', 'Bosnia and Herzegovina'],
    'Qatar': ['Qatar'], 'Svizzera': ['Switzerland'], 'Brasile': ['Brazil'],
    'Marocco': ['Morocco'], 'Haiti': ['Haiti'], 'Scozia': ['Scotland'],
    'Stati Uniti': ['United States', 'USA'], 'Paraguay': ['Paraguay'],
    'Australia': ['Australia'], 'Turchia': ['Tűrkiye', 'Turkey', 'Törkiye', 'Trkiye'],
    'Germania': ['Germany'], 'Curaçao': ['Curacao', 'Curaçao'],
    "Costa d'Avorio": ["Cote d'Ivoire", "Ivory Coast", "Côte d'Ivoire"],
    'Ecuador': ['Ecuador'], 'Paesi Bassi': ['Netherlands'], 'Paesi Basi': ['Netherlands'],
    'Giappone': ['Japan'], 'Svezia': ['Sweden'], 'Tunisia': ['Tunisia'],
    'Belgio': ['Belgium'], 'Egitto': ['Egypt'], 'Iran': ['Iran', 'Islamic Republic of Iran'],
    'Nuova Zelanda': ['New Zealand'], 'Spagna': ['Spain'], 'Capo Verde': ['Cape Verde', 'Cabo Verde'],
    'Arabia Saudita': ['Saudi Arabia'], 'Uruguay': ['Uruguay'], 'Francia': ['France'],
    'Senegal': ['Senegal'], 'Iraq': ['Iraq'], 'Norvegia': ['Norway'],
    'Argentina': ['Argentina'], 'Algeria': ['Algeria'], 'Austria': ['Austria'],
    'Giordania': ['Jordan'], 'Portogallo': ['Portugal'],
    'RD Congo': ['DR Congo', 'Congo DR', 'Democratic Republic of the Congo'],
    'Uzbekistan': ['Uzbekistan'], 'Colombia': ['Colombia'], 'Inghilterra': ['England'],
    'Croazia': ['Croatia'], 'Ghana': ['Ghana'], 'Panama': ['Panama']
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

def clean_player_name(name):
    name = re.sub(r'\(captain\)', '', name, flags=re.IGNORECASE)
    name = re.sub(r'\(vice-captain\)', '', name, flags=re.IGNORECASE)
    name = re.sub(r'\(c\)', '', name, flags=re.IGNORECASE)
    name = re.sub(r'\(vc\)', '', name, flags=re.IGNORECASE)
    name = name.replace('*', '')
    return name.strip()

def clean_club_name(td):
    links = td.find_all('a')
    if links:
        for l in reversed(links):
            title = l.get('title', '').lower()
            if 'flag' not in title and 'association' not in title and 'national' not in title:
                return l.text.strip()
        return links[-1].text.strip()
    return td.text.strip()

def parse_age(td):
    bday_span = td.find('span', class_='bday')
    if bday_span:
        try:
            bday_text = bday_span.text.strip()
            birth_year = int(bday_text.split('-')[0])
            return float(2026 - birth_year)
        except:
            pass
    # Try regex search in text
    text = td.text
    m = re.search(r'aged?\s+(\d+)', text, re.IGNORECASE)
    if m:
        return float(m.group(1))
    return 26.5

def map_value_to_rating(value, base_strength):
    log_v = math.log10(max(100000, value))
    rating = 65 + (log_v - 5) * 8.33
    rating = int(round(rating))
    
    # Cap rating relative to team baseStrength to keep simulator balanced
    max_cap = max(88, base_strength + 8)
    rating = min(max_cap, rating)
    rating = max(63, rating)
    return rating

def main():
    print("Loading current teams database...")
    with open(TEAMS_DB_PATH, 'r', encoding='utf-8') as f:
        teams_db = json.load(f)

    print("Loading Transfermarkt players database...")
    df_p = pd.read_csv(PLAYERS_CSV_PATH)
    df_active = df_p[df_p['last_season'] >= 2023].copy()
    df_active['market_value_in_eur'] = df_active['market_value_in_eur'].fillna(100000)
    print(f"Loaded {len(df_active)} active players for cross-referencing.")

    print("Loading Wikipedia HTML squads page...")
    with open(WIKI_HTML_PATH, 'r', encoding='utf-8') as f:
        html_content = f.read()
    
    soup = BeautifulSoup(html_content, 'html.parser')
    
    # Track parse stats
    parsed_teams = 0
    total_parsed_players = 0
    matched_players_count = 0

    # Build a lookup map of Wikipedia heading IDs -> country headings in DOM
    heading_elements = {}
    for h in soup.find_all(['h3', 'h4']):
        span = h.find('span', class_='mw-headline')
        if span and span.get('id'):
            heading_elements[span.get('id')] = h
        elif h.get('id'):
            heading_elements[h.get('id')] = h

    # Iterate over our teams in teams.json
    for team_code, info in teams_db.items():
        name = info['name']
        base_strength = info.get('baseStrength', 75)
        
        # Find Wikipedia heading ID for this team
        wiki_id = None
        for k, v in wiki_id_to_code.items():
            if v == team_code:
                wiki_id = k
                break
                
        if not wiki_id or wiki_id not in heading_elements:
            print(f"[WARNING] Heading not found for {name} ({team_code})")
            continue
            
        h_el = heading_elements[wiki_id]
        
        # Find next table (which represents the squad list)
        table_el = h_el.find_next('table')
        if not table_el:
            print(f"[WARNING] Table not found under heading for {name} ({team_code})")
            continue
            
        player_rows = table_el.find_all('tr', class_='nat-fs-player')
        if not player_rows:
            print(f"[WARNING] No rows of class 'nat-fs-player' in table for {name} ({team_code})")
            continue

        print(f"Parsing official squad for {name} ({team_code}): found {len(player_rows)} players in table.")
        
        # Get matching country names in our Transfermarkt database
        csv_countries = sim_to_csv_country.get(name, [name])
        df_team_candidates = df_active[df_active['country_of_citizenship'].isin(csv_countries)]
        if len(df_team_candidates) == 0:
            norm_countries = [normalize_name(c) for c in csv_countries]
            df_team_candidates = df_active[df_active['country_of_citizenship'].apply(lambda x: normalize_name(str(x)) in norm_countries)]

        # Pre-tokenize all candidate names from Transfermarkt for faster token matching
        candidates = []
        for _, row in df_team_candidates.iterrows():
            candidates.append({
                "name": row['name'],
                "tokens": get_name_tokens(row['name']),
                "market_value": float(row['market_value_in_eur']),
                "club": row['current_club_name']
            })

        squad_players = []

        for row in player_rows:
            cols = row.find_all(['td', 'th'])
            if len(cols) < 7:
                continue
                
            shirt_no = cols[0].text.strip()
            pos_text = cols[1].text.strip().upper()
            
            # Map position
            sim_pos = 'D'
            if 'GK' in pos_text:
                sim_pos = 'P'
            elif 'DF' in pos_text:
                sim_pos = 'D'
            elif 'MF' in pos_text:
                sim_pos = 'C'
            elif 'FW' in pos_text:
                sim_pos = 'A'
                
            raw_name = cols[2].text
            p_name = clean_player_name(raw_name)
            p_tokens = get_name_tokens(p_name)
            
            age = parse_age(cols[3])
            club = clean_club_name(cols[6])
            
            # Cross-reference Transfermarkt for market value and rating
            market_val = 0
            best_match = None
            for cand in candidates:
                if is_player_match_tokens(p_tokens, cand["tokens"]):
                    if not best_match or cand["market_value"] > best_match["market_value"]:
                        best_match = cand
                        
            if best_match:
                market_val = best_match["market_value"]
                rating = map_value_to_rating(market_val, base_strength)
                matched_players_count += 1
            else:
                # Fallback based on team strength
                rating = max(63, int(base_strength - 3 + random.randint(-2, 2)))
                market_val = int(10 ** ((rating - 65) / 8.33 + 5))
                market_val = max(50000, market_val)

            player_profile = {
                "name": p_name,
                "pos": sim_pos,
                "club": club,
                "rating": rating,
                "goals": 0,
                "assists": 0,
                "yellowCards": 0,
                "status": "bench", # default status
                "value": market_val,
                "age": round(age, 1)
            }
            squad_players.append(player_profile)
            total_parsed_players += 1

        # Now select the starting 11 using a realistic 4-3-3 formation
        # 1 Goalkeeper (P), 4 Defenders (D), 3 Midfielders (C), 3 Attackers (A)
        gks = [p for p in squad_players if p['pos'] == 'P']
        dfs = [p for p in squad_players if p['pos'] == 'D']
        mfs = [p for p in squad_players if p['pos'] == 'C']
        fws = [p for p in squad_players if p['pos'] == 'A']

        # Sort each position by rating descending to pick the best starters
        gks.sort(key=lambda x: x['rating'], reverse=True)
        dfs.sort(key=lambda x: x['rating'], reverse=True)
        mfs.sort(key=lambda x: x['rating'], reverse=True)
        fws.sort(key=lambda x: x['rating'], reverse=True)

        starters = []
        if len(gks) >= 1: starters.append(gks[0])
        starters.extend(dfs[:4])
        starters.extend(mfs[:3])
        starters.extend(fws[:3])

        # If we couldn't get exactly 11 due to position shortage, fall back to best players
        if len(starters) < 11:
            all_sorted = sorted(squad_players, key=lambda x: x['rating'], reverse=True)
            for p in all_sorted:
                if p not in starters and len(starters) < 11:
                    starters.append(p)

        # Set status
        for p in squad_players:
            if p in starters:
                p['status'] = 'starting'
            else:
                p['status'] = 'bench'

        info['players'] = squad_players
        parsed_teams += 1
        print(f"   Successfully integrated official roster for {name}: {len(squad_players)} players total.")

    print(f"\nIntegration summary:")
    print(f"  Teams parsed: {parsed_teams}/48")
    print(f"  Total players added: {total_parsed_players}")
    print(f"  Matched with Transfermarkt: {matched_players_count} ({matched_players_count/total_parsed_players*100:.1f}%)")

    # Save to data/teams.json
    print(f"Saving final database to {TEAMS_DB_PATH}...")
    with open(TEAMS_DB_PATH, 'w', encoding='utf-8') as f:
        json.dump(teams_db, f, indent=2, ensure_ascii=False)
    print("Enrichment of official rosters completed successfully!")

if __name__ == '__main__':
    main()
