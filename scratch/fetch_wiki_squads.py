import urllib.request
import urllib.parse
import json
import os

url = "https://en.wikipedia.org/w/api.php?action=parse&page=2026_FIFA_World_Cup_squads&prop=text&format=json&redirects=true"

print("Fetching Wikipedia squads page via API...")
try:
    req = urllib.request.Request(
        url, 
        headers={'User-Agent': 'Mondiali2026Simulator/1.0 (contact: operator@example.com)'}
    )
    with urllib.request.urlopen(req) as response:
        data = json.loads(response.read().decode('utf-8'))
        
    if 'parse' in data and 'text' in data['parse']:
        html_content = data['parse']['text']['*']
        output_path = "data/wiki_squads.html"
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        with open(output_path, "w", encoding="utf-8") as f:
            f.write(html_content)
        print(f"Success! Saved {len(html_content)} bytes of HTML to {output_path}")
    else:
        print("Error: Could not parse page content from API response.")
        print(data.keys())
except Exception as e:
    print(f"Error fetching data: {e}")
