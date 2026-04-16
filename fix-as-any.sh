#!/bin/bash
cd /home/moh/creative-flame-keeper

# Remove "as any" from table name string literals inside supabase.from() calls
# Pattern: from("table_name" as any) -> from("table_name")
FILES=(
  src/pages/ProductView.tsx
  src/pages/Expenses.tsx
  src/pages/FiscalYearClosing.tsx
  src/pages/SalesReturns.tsx
  src/pages/SalesInvoiceForm.tsx
  src/pages/Purchases.tsx
  src/pages/InventoryAdjustmentForm.tsx
  src/pages/Customers.tsx
  src/pages/ExpenseForm.tsx
  src/pages/InventoryMovements.tsx
  src/pages/CustomerPayments.tsx
  src/pages/CashFlowStatement.tsx
  src/pages/SupplierPayments.tsx
  src/pages/Products.tsx
  src/pages/ProductForm.tsx
)

for f in "${FILES[@]}"; do
  if [ -f "$f" ]; then
    sed -i 's/from("\([^"]*\)" as any)/from("\1")/g' "$f"
    echo "Fixed: $f"
  else
    echo "Not found: $f"
  fi
done

echo "DONE"
