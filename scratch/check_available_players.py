import json
import os
import pandas as pd

with open('data/teams.json', 'r', encoding='utf-8') as f:
    teams_db = json.load(f)

sim_to_dataset = {
    'Messico': 'Mexico', 'Sudafrica': 'South Africa', 'Corea del Sud': 'South Korea',
    'Repubblica Ceca': 'Czechia', 'Canada': 'Canada', 'Bosnia Erzegovina': 'Bosnia and Herzegovina',
    'Qatar': 'Qatar', 'Svizzera': 'Switzerland', 'Brasile': 'Brazil', 'Marocco': 'Morocco',
    'Haiti': 'Haiti', 'Scozia': 'Scotland', 'Stati Uniti': 'United States', 'Paraguay': 'Paraguay',
    'Australia': 'Australia', 'Turchia': 'Turkey', 'Germania': 'Germany', 'Curaçao': 'Curacao',
    "Costa d'Avorio": "Cote d'Ivoire", 'Ecuador': 'Ecuador', 'Paesi Bassi': 'Netherlands',
    'Paesi Basi': 'Netherlands', 'Giappone': 'Japan', 'Svezia': 'Sweden', 'Tunisia': 'Tunisia',
    'Belgio': 'Belgium', 'Egitto': 'Egypt', 'Iran': 'Iran', 'Nuova Zelanda': 'New Zealand',
    'Spagna': 'Spain', 'Capo Verde': 'Cape Verde', 'Arabia Saudita': 'Saudi Arabia',
    'Uruguay': 'Uruguay', 'Francia': 'France', 'Senegal': 'Senegal', 'Iraq': 'Iraq',
    'Norvegia': 'Norway', 'Argentina': 'Argentina', 'Algeria': 'Algeria', 'Austria': 'Austria',
    'Giordania': 'Jordan', 'Portogallo': 'Portugal', 'RD Congo': 'DR Congo', 'Uzbekistan': 'Uzbekistan',
    'Colombia': 'Colombia', 'Inghilterra': 'England', 'Croazia': 'Croatia', 'Ghana': 'Ghana',
    'Panama': 'Panama'
}

df_p = pd.read_csv('archive-transfermarkt/players.csv')
df_active = df_p[df_p['last_season'] >= 2023]

low_countries = []
for code, info in teams_db.items():
    name = info['name']
    ds_name = sim_to_dataset.get(name, name)
    matched = df_active[df_active['country_of_citizenship'] == ds_name]
    count = len(matched)
    print(f"{code} ({name}): {count}")
    if count < 23:
        low_countries.append((code, name, count))

print("\nCountries with less than 23 players in Transfermarkt:")
for c in low_countries:
    print(c)
