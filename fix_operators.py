#!/usr/bin/env python3
"""Fix the broken operators and new_unlisted remnants."""

filepath = "src/pages/reports/InventoryTurnoverReport.tsx"
with open(filepath, "r") as f:
    lines = f.readlines()

fixed_lines = []
for i, line in enumerate(lines):
    original = line
    
    # Fix 1: broken newProductsCount filter (line with "=== ,")
    if 'p.turnoverClass === "new" | p.turnoverClass === ,' in line:
        line = line.replace(
            'p.turnoverClass === "new" | p.turnoverClass === ,',
            'p.turnoverClass === "new",'
        )
    
    # Fix 2: bitwise OR that should be logical OR in boolean contexts
    # isLoading = loadingProducts | loadingSales | loadingPurchases
    if 'loadingProducts | loadingSales | loadingPurchases' in line:
        line = line.replace(
            'loadingProducts | loadingSales | loadingPurchases',
            'loadingProducts || loadingSales || loadingPurchases'
        )
    
    # Fix 3: d > map[pid].lastDate
    if "(!map[pid].lastDate | d > map[pid].lastDate!)" in line:
        line = line.replace(
            "(!map[pid].lastDate | d > map[pid].lastDate!)",
            "(!map[pid].lastDate || d > map[pid].lastDate!)"
        )
    
    # Fix 4: purchaseSuggestions filter  
    if 'p.suggestedPurchaseQty > 0 | p.belowMinStock' in line:
        line = line.replace(
            'p.suggestedPurchaseQty > 0 | p.belowMinStock',
            'p.suggestedPurchaseQty > 0 || p.belowMinStock'
        )
    
    # Fix 5: any other single | between expressions (not in type annotations)
    # Type annotations have | surrounded by types, not expressions with > 0
    # Let's be specific about known patterns
    
    # Fix 6: map[pid].lastDate lines in purchasesByProduct
    if "(!map[pid].lastDate | d > map[pid].lastDate!)" in line:
        line = line.replace(
            "(!map[pid].lastDate | d > map[pid].lastDate!)",
            "(!map[pid].lastDate || d > map[pid].lastDate!)"
        )
    
    fixed_lines.append(line)

content = "".join(fixed_lines)

# Double check: find any remaining problematic single | (not in type annotations)
import re
# Find lines with single | that look like boolean contexts
issues = []
for i, line in enumerate(content.split("\n"), 1):
    stripped = line.strip()
    # Skip type annotations, imports, and comments
    if any(kw in stripped for kw in ['type ', 'interface ', 'import ', '//', 'useState<', 'useMemo<']):
        continue
    # Find single | between expressions (not ||)
    matches = list(re.finditer(r'(?<!\|)\|(?!\|)', stripped))
    for m in matches:
        # Check context - is it in a type annotation (has : before it)?
        before = stripped[:m.start()]
        if ':' in before and '{' not in before:
            continue  # type annotation
        if 'Record<' in before or 'as ' in before:
            continue  # type context
        issues.append(f"  Line {i}: {stripped}")

if issues:
    print("WARNING - potential single | issues:")
    for iss in issues:
        print(iss)

with open(filepath, "w") as f:
    f.write(content)

print(f"DONE - fixed file has {content.count(chr(10)) + 1} lines")
