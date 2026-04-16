#!/usr/bin/env python3
"""Fix ALL broken || that were turned into | by the rebuild script."""

filepath = "src/pages/reports/InventoryTurnoverReport.tsx"
with open(filepath, "r") as f:
    content = f.read()

# These are ALL the patterns that need || restored (from the WARNING list)
# We'll be very specific with each replacement

replacements = [
    # Line 302: suppliers name fallback
    ("item.invoice?.suppliers?.name | map[pid].lastSupplierName;",
     "item.invoice?.suppliers?.name || map[pid].lastSupplierName;"),
    
    # Lines 318-322: numeric fallbacks
    ("sales?.soldQty | 0", "sales?.soldQty || 0"),
    ("sReturns?.returnedQty | 0", "sReturns?.returnedQty || 0"),
    ("purchases?.purchasedQty | 0", "purchases?.purchasedQty || 0"),
    ("pReturns?.returnedQty | 0", "pReturns?.returnedQty || 0"),
    
    # Line 327: supplier name fallback
    ("purchases?.lastSupplierName | null", "purchases?.lastSupplierName || null"),
    
    # Line 330: revenue fallback
    ("(sales?.revenue | 0)", "(sales?.revenue || 0)"),
    ("(sReturns?.returnedValue | 0)", "(sReturns?.returnedValue || 0)"),
    
    # Lines 332-333: date fallbacks
    ("sales?.lastDate | null", "sales?.lastDate || null"),
    ("purchases?.lastDate | null", "purchases?.lastDate || null"),
    
    # Line 438: isNewProduct check
    ("if (isNewProduct | isRecentlyAdded)", "if (isNewProduct || isRecentlyAdded)"),
    
    # Line 507: ABC class fallback
    ('abcMap.get(p.productId) | "C"', 'abcMap.get(p.productId) || "C"'),
    
    # Lines 513-514, 556-557: turnover class checks (broken new_unlisted removal)
    # These have broken patterns like: p.turnoverClass === "new" |\n          p.turnoverClass ===  |
    # Need to fix: skip new/inactive checks
    
    # Line 525: ABC class OR
    ('(p.abcClass === "A" | p.abcClass === "B")', '(p.abcClass === "A" || p.abcClass === "B")'),
    
    # Lines 712-713: prev period
    ("prevSalesByProduct[p.id]?.soldQty | 0", "prevSalesByProduct[p.id]?.soldQty || 0"),
    
    # Line 729:
    ("ps?.soldQty | 0", "ps?.soldQty || 0"),
    
    # Line 899-900: export fallbacks
    ('p.lastSaleDate | "—"', 'p.lastSaleDate || "—"'),
    ('p.lastSupplierName | "—"', 'p.lastSupplierName || "—"'),
    
    # Line 1027: null check
    ("v === null | isNaN(v)", "v === null || isNaN(v)"),
    
    # Line 1402: render condition
    ("(!allProductsNew | filteredData.length > 0)", "(!allProductsNew || filteredData.length > 0)"),
]

for old, new in replacements:
    if old in content:
        content = content.replace(old, new)
    else:
        # May have been already fixed or not present
        pass

# Fix the broken turnoverClass checks with new_unlisted remnants
# Pattern 1: p.turnoverClass === "new" |\n          p.turnoverClass ===  |
# These appear in Step D and Step E
import re

# Fix multi-line broken patterns:
# "new" |\n      p.turnoverClass ===  |\n      p.turnoverClass === "inactive"
# Should be: "new" || p.turnoverClass === "inactive"
content = re.sub(
    r'p\.turnoverClass === "new" \|\s*\n\s*p\.turnoverClass ===\s*\|\s*\n\s*p\.turnoverClass === "inactive"',
    'p.turnoverClass === "new" ||\n          p.turnoverClass === "inactive"',
    content
)

# Also fix: p.turnoverClass === "new" |\n      p.turnoverClass === ,
content = re.sub(
    r'p\.turnoverClass === "new" \|\s*p\.turnoverClass === ,',
    'p.turnoverClass === "new",',
    content
)

# Fix any remaining: p.turnoverClass === "new" | p.turnoverClass ===
content = re.sub(
    r'p\.turnoverClass === "new" \| p\.turnoverClass ===\s*\n',
    'p.turnoverClass === "new"\n',
    content
)

# Fix: "new" |\n          p.turnoverClass ===  ) return;
content = re.sub(
    r'p\.turnoverClass === "new" \|\s*\n\s*p\.turnoverClass ===\s*\) return;',
    'p.turnoverClass === "new") return;',
    content
)

# Also check for the new filter line: 
# p.turnoverClass === "new" | p.turnoverClass ===
content = re.sub(
    r'p\.turnoverClass === "new" \| p\.turnoverClass ===\s*$',
    'p.turnoverClass === "new"',
    content, flags=re.MULTILINE
)

# Clean up: purchasesByProduct lastDate check
if "(!map[pid].lastDate | d > map[pid].lastDate!)" in content:
    content = content.replace(
        "(!map[pid].lastDate | d > map[pid].lastDate!)",
        "(!map[pid].lastDate || d > map[pid].lastDate!)"
    )

# Clean up any empty lines that have just whitespace  
content = re.sub(r'\n{3,}', '\n\n', content)

with open(filepath, "w") as f:
    f.write(content)

# Verify
lines = content.split('\n')
issues = []
for i, line in enumerate(lines, 1):
    s = line.strip()
    if any(kw in s for kw in ['type ', 'interface ', 'import ', '//', 'useState<', 'useMemo<', 'Record<', 'as ']):
        continue
    # Find single | between non-type expressions
    for m in re.finditer(r'(?<!\|)\|(?!\|)', s):
        before = s[:m.start()]
        if ':' in before and '{' not in before:
            continue
        issues.append(f"  Line {i}: {s}")

if issues:
    print("REMAINING issues:")
    for iss in issues:
        print(iss)
else:
    print("No remaining issues!")

print(f"DONE - {len(lines)} lines")
