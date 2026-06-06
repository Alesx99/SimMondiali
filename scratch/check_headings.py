import json
from bs4 import BeautifulSoup

file_path = "data/wiki_squads.html"
with open(file_path, 'r', encoding='utf-8') as f:
    html_content = f.read()

soup = BeautifulSoup(html_content, 'html.parser')

wiki_id_to_code = {
    'Czech_Republic': 'CZE',
    'Mexico': 'MEX',
    'South_Africa': 'RSA',
    'South_Korea': 'KOR',
    'Bosnia_and_Herzegovina': 'BIH',
    'Canada': 'CAN',
    'Qatar': 'QAT',
    'Switzerland': 'SUI',
    'Brazil': 'BRA',
    'Haiti': 'HAI',
    'Morocco': 'MAR',
    'Scotland': 'SCO',
    'Australia': 'AUS',
    'Paraguay': 'PAR',
    'Turkey': 'TUR',
    'United_States': 'USA',
    'Curaçao': 'CUW',
    'Ecuador': 'ECU',
    'Germany': 'GER',
    'Ivory_Coast': 'CIV',
    'Japan': 'JPN',
    'Netherlands': 'NED',
    'Sweden': 'SWE',
    'Tunisia': 'TUN',
    'Belgium': 'BEL',
    'Egypt': 'EGY',
    'Iran': 'IRN',
    'New_Zealand': 'NZL',
    'Cape_Verde': 'CPV',
    'Saudi_Arabia': 'KSA',
    'Spain': 'ESP',
    'Uruguay': 'URU',
    'France': 'FRA',
    'Iraq': 'IRQ',
    'Norway': 'NOR',
    'Senegal': 'SEN',
    'Algeria': 'ALG',
    'Argentina': 'ARG',
    'Austria': 'AUT',
    'Jordan': 'JOR',
    'Colombia': 'COL',
    'DR_Congo': 'COD',
    'Portugal': 'POR',
    'Uzbekistan': 'UZB',
    'Croatia': 'CRO',
    'England': 'ENG',
    'Ghana': 'GHA',
    'Panama': 'PAN'
}

found_headings = set()
for h in soup.find_all(['h3', 'h4']):
    # Check span with class mw-headline or id
    span = h.find('span', class_='mw-headline')
    if span and span.get('id'):
        found_headings.add(span.get('id'))
    elif h.get('id'):
        found_headings.add(h.get('id'))

missing = []
for key in wiki_id_to_code:
    if key not in found_headings:
        # Try to find partial matches
        matched = [f for f in found_headings if key.lower() in f.lower() or f.lower() in key.lower()]
        missing.append((key, wiki_id_to_code[key], matched))

print(f"Total teams mapped: {len(wiki_id_to_code)}")
print(f"Matched directly: {len(wiki_id_to_code) - len(missing)}")
if missing:
    print("\nMissing headings or spelling differences:")
    for m in missing:
        print(f"  {m[0]} ({m[1]}) -> candidates in HTML: {m[2]}")
else:
    print("\nAll 48 headings successfully matched!")
