#!/usr/bin/env python3
import sys

filepath = "src/pages/reports/InventoryTurnoverReport.tsx"
with open(filepath, "r") as f:
    content = f.read()

# Step 1: Move DecisionMatrix before SmartAlerts, wrap with PieChart in grid
old_block = """            <SmartAlertsSection alerts={alerts} />

            <DecisionMatrix
              matrixCounts={matrixCounts}
              matrixFilter={matrixFilter}
              setMatrixFilter={setMatrixFilter}
              newProductsCount={newProductsCount}
            />

            <PurchaseSuggestionsTable"""

new_block = """            {/* Matrix + Pie side by side */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <DecisionMatrix
                matrixCounts={matrixCounts}
                matrixFilter={matrixFilter}
                setMatrixFilter={setMatrixFilter}
                newProductsCount={newProductsCount}
              />
              <TurnoverPieChart
                pieData={pieData}
                newProductsCount={newProductsCount}
              />
            </div>

            <SmartAlertsSection alerts={alerts} />

            <PurchaseSuggestionsTable"""

if old_block in content:
    content = content.replace(old_block, new_block)
    print("STEP1 OK")
else:
    print("STEP1 FAIL - block not found")
    sys.exit(1)

# Step 2: Remove standalone TurnoverPieChart block (now integrated in grid)
pie_block = """
            <TurnoverPieChart
              pieData={pieData}
              newProductsCount={newProductsCount}
            />"""

if pie_block in content:
    # Only remove the last occurrence (the standalone one)
    idx = content.rfind(pie_block)
    content = content[:idx] + content[idx + len(pie_block):]
    print("STEP2 OK")
else:
    print("STEP2 FAIL - pie block not found")
    sys.exit(1)

with open(filepath, "w") as f:
    f.write(content)

print("DONE")
