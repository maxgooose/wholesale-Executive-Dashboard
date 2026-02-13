import json
from collections import Counter

file_path = 'wholesale-Executive-Dashboard/assets/wholecell-data-backup-2025-11-24.json'

try:
    print(f"Loading {file_path}...")
    with open(file_path, 'r') as f:
        data = json.load(f)
    
    items = data.get('items', [])
    
    statuses = []
    for item in items:
        s = item.get('status', 'Unknown')
        statuses.append(s)
        
    counts = Counter(statuses)
    print("\nStatus Breakdown:")
    for status, count in counts.most_common():
        print(f"{status}: {count}")
        
except Exception as e:
    print(f"Error: {e}")
