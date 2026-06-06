import os
from bs4 import BeautifulSoup

file_path = r"C:\Users\betaland operatore\.gemini\antigravity\brain\fd9750a8-0baf-4234-aa8f-e1a82c8299ba\.system_generated\steps\1827\content.md"

with open(file_path, 'r', encoding='utf-8') as f:
    html_content = f.read()

soup = BeautifulSoup(html_content, 'html.parser')

# Find all headings (h3 or other tags with id)
headings = []
for h in soup.find_all(['h2', 'h3', 'h4']):
    headline = h.find(class_='mw-headline')
    if headline:
        headings.append((h.name, headline.text, headline.get('id')))
    elif h.get('id'):
        headings.append((h.name, h.text.strip(), h.get('id')))
    else:
        # Check standard wiki headings
        span = h.find('span')
        if span and span.get('id'):
            headings.append((h.name, span.text.strip(), span.get('id')))
        else:
            headings.append((h.name, h.text.strip(), None))

print(f"Found {len(headings)} headings. Showing first 30:")
for name, text, hid in headings[:30]:
    print(f"  {name}: {text} (id={hid})")
