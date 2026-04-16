path = 'src/pages/reports/InventoryTurnoverReport.tsx'
with open(path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Fix line 385 (0-indexed: 384)
old = lines[384]
print(f"Before: {old.rstrip()}")
lines[384] = old.replace('?.name | "', '?.name || "')
print(f"After:  {lines[384].rstrip()}")

with open(path, 'w', encoding='utf-8') as f:
    f.writelines(lines)
print("SAVED")
