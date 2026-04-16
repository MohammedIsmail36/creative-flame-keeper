#!/usr/bin/env python3
with open('src/pages/reports/InventoryTurnoverReport.tsx', 'r') as f:
    c = f.read()

old = """      if (isNeverPurchased && !isRecentlyAdded) {
        return {
          ...baseProps,
          turnoverRate: null,
          coverageDays: null,
          turnoverClass:  as TurnoverClass,
        };
      }"""

new = """      if (isNeverPurchased && !isRecentlyAdded) {
        return; // completely exclude from report
      }"""

if old in c:
    c = c.replace(old, new)
    with open('src/pages/reports/InventoryTurnoverReport.tsx', 'w') as f:
        f.write(c)
    print("FIXED")
else:
    print("NOT FOUND")
