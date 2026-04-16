import re

path = 'src/pages/reports/InventoryTurnoverReport.tsx'
with open(path, 'r') as f:
    content = f.read()

old = 'TURNOVER_PIE_COLORS[name] | "hsl(0,0%,60%)"'
new = 'TURNOVER_PIE_COLORS[name] || "hsl(0,0%,60%)"'

if old in content:
    content = content.replace(old, new, 1)
    with open(path, 'w') as f:
        f.write(content)
    print("FIXED")
else:
    print("NOT FOUND - searching for other | patterns...")
    # Search for any remaining single | that should be ||
    matches = [(i, line.strip()) for i, line in enumerate(content.split('\n'), 1) 
               if re.search(r'[^|&]\s*\|\s*[^|&]', line) and 'PIE' in line]
    for m in matches:
        print(f"  Line {m[0]}: {m[1]}")
