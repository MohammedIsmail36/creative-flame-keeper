import { describe, it, expect } from "vitest";

/**
 * Integration Tests - Complete Accounting Cycle
 * 
 * Simulates a full business cycle:
 * 1. Purchase invoice → inventory in
 * 2. Sales invoice → inventory out + COGS
 * 3. Sales return → inventory back + reverse COGS
 * 4. Customer payment → balance reduction
 * 5. Account statement → running balance verification
 * 6. Trial balance → equation check
 * 7. Income statement → profit calculation
 * 8. Balance sheet → equation check
 *
 * All logic mirrors the actual app code (no DB calls).
 */

// ─── Simulated Database State ───────────────────────────────────────────

interface Account {
  code: string;
  name: string;
  type: "asset" | "liability" | "equity" | "revenue" | "expense";
}

interface JournalLine {
  accountCode: string;
  debit: number;
  credit: number;
  description: string;
}

interface JournalEntry {
  id: number;
  description: string;
  status: "posted";
  lines: JournalLine[];
}

interface InventoryMovement {
  productCode: string;
  type: "purchase" | "sale" | "sale_return" | "opening_balance" | "adjustment";
  quantity: number;
  unitCost: number;
  totalCost: number;
}

interface StatementLine {
  description: string;
  debit: number;
  credit: number;
  runningBalance: number;
}

// ─── Helper Functions (mirror app logic) ────────────────────────────────

function validateJournalEntry(lines: JournalLine[]): boolean {
  const totalDebit = lines.reduce((s, l) => s + l.debit, 0);
  const totalCredit = lines.reduce((s, l) => s + l.credit, 0);
  return Math.abs(totalDebit - totalCredit) < 0.001;
}

function getAvgPurchasePrice(movements: InventoryMovement[]): number {
  const buys = movements.filter(m => m.type === "purchase" || m.type === "opening_balance");
  const totalQty = buys.reduce((s, m) => s + m.quantity, 0);
  const totalCost = buys.reduce((s, m) => s + m.totalCost, 0);
  return totalQty > 0 ? totalCost / totalQty : 0;
}

function getAccountBalance(entries: JournalEntry[], code: string): { debit: number; credit: number; net: number } {
  let debit = 0, credit = 0;
  for (const entry of entries) {
    for (const line of entry.lines) {
      if (line.accountCode === code) {
        debit += line.debit;
        credit += line.credit;
      }
    }
  }
  return { debit, credit, net: debit - credit };
}

function buildCustomerStatement(entries: JournalEntry[], customerAccountCode: string): StatementLine[] {
  const lines: StatementLine[] = [];
  let balance = 0;
  for (const entry of entries) {
    for (const line of entry.lines) {
      if (line.accountCode === customerAccountCode) {
        balance += line.debit - line.credit;
        lines.push({
          description: entry.description,
          debit: line.debit,
          credit: line.credit,
          runningBalance: balance,
        });
      }
    }
  }
  return lines;
}

function getTrialBalance(entries: JournalEntry[], accounts: Account[]): { code: string; name: string; debit: number; credit: number }[] {
  return accounts.map(acc => {
    const bal = getAccountBalance(entries, acc.code);
    // Trial balance shows raw debit/credit totals per account
    return { code: acc.code, name: acc.name, debit: bal.debit, credit: bal.credit };
  }).filter(a => a.debit !== 0 || a.credit !== 0);
}

// ─── Tests ──────────────────────────────────────────────────────────────

describe("Integration: Complete Sales Cycle", () => {
  // Shared state across the cycle
  const accounts: Account[] = [
    { code: "1101", name: "الصندوق", type: "asset" },
    { code: "1103", name: "العملاء", type: "asset" },
    { code: "1104", name: "المخزون", type: "asset" },
    { code: "2101", name: "الموردون", type: "liability" },
    { code: "3101", name: "رأس المال", type: "equity" },
    { code: "4101", name: "إيرادات المبيعات", type: "revenue" },
    { code: "5101", name: "تكلفة البضاعة المباعة", type: "expense" },
  ];

  const entries: JournalEntry[] = [];
  const movements: InventoryMovement[] = [];
  let entryId = 0;
  let productQty = 0;
  let customerBalance = 0;
  let supplierBalance = 0;

  // ── Step 1: Purchase 20 units @ 100 each = 2,000 ──
  it("Step 1: Purchase invoice creates correct journal & inventory", () => {
    const qty = 20, unitPrice = 100, total = qty * unitPrice;

    // Journal: Dr Inventory 2000, Cr Supplier 2000
    const lines: JournalLine[] = [
      { accountCode: "1104", debit: total, credit: 0, description: "المخزون" },
      { accountCode: "2101", debit: 0, credit: total, description: "الموردون" },
    ];
    expect(validateJournalEntry(lines)).toBe(true);

    entries.push({ id: ++entryId, description: "فاتورة شراء #1", status: "posted", lines });
    movements.push({ productCode: "P001", type: "purchase", quantity: qty, unitCost: unitPrice, totalCost: total });
    productQty += qty;
    supplierBalance += total;

    expect(productQty).toBe(20);
    expect(supplierBalance).toBe(2000);
  });

  // ── Step 2: Purchase another 10 units @ 120 each = 1,200 ──
  it("Step 2: Second purchase updates avg cost correctly", () => {
    const qty = 10, unitPrice = 120, total = qty * unitPrice;

    const lines: JournalLine[] = [
      { accountCode: "1104", debit: total, credit: 0, description: "المخزون" },
      { accountCode: "2101", debit: 0, credit: total, description: "الموردون" },
    ];
    expect(validateJournalEntry(lines)).toBe(true);

    entries.push({ id: ++entryId, description: "فاتورة شراء #2", status: "posted", lines });
    movements.push({ productCode: "P001", type: "purchase", quantity: qty, unitCost: unitPrice, totalCost: total });
    productQty += qty;
    supplierBalance += total;

    // Avg = (2000 + 1200) / (20 + 10) = 3200 / 30 = 106.67
    const avgCost = getAvgPurchasePrice(movements);
    expect(avgCost).toBeCloseTo(106.67, 2);
    expect(productQty).toBe(30);
    expect(supplierBalance).toBe(3200);
  });

  // ── Step 3: Sell 8 units @ 200 each = 1,600 ──
  it("Step 3: Sales invoice uses avg cost for COGS", () => {
    const qty = 8, sellingPrice = 200;
    const revenue = qty * sellingPrice; // 1600
    const avgCost = getAvgPurchasePrice(movements); // 106.67
    const cogs = Math.round(avgCost * qty * 100) / 100; // 853.33

    // Journal: Dr Customer 1600, Cr Revenue 1600, Dr COGS 853.33, Cr Inventory 853.33
    const lines: JournalLine[] = [
      { accountCode: "1103", debit: revenue, credit: 0, description: "العملاء" },
      { accountCode: "4101", debit: 0, credit: revenue, description: "إيرادات المبيعات" },
      { accountCode: "5101", debit: cogs, credit: 0, description: "تكلفة البضاعة" },
      { accountCode: "1104", debit: 0, credit: cogs, description: "المخزون" },
    ];
    expect(validateJournalEntry(lines)).toBe(true);

    entries.push({ id: ++entryId, description: "فاتورة بيع #1", status: "posted", lines });
    movements.push({ productCode: "P001", type: "sale", quantity: qty, unitCost: avgCost, totalCost: cogs });
    productQty -= qty;
    customerBalance += revenue;

    expect(productQty).toBe(22);
    expect(customerBalance).toBe(1600);
  });

  // ── Step 4: Sales return 2 units ──
  it("Step 4: Sales return reverses revenue & COGS at avg cost", () => {
    const qty = 2, sellingPrice = 200;
    const returnValue = qty * sellingPrice; // 400
    const avgCost = getAvgPurchasePrice(movements); // still 106.67
    const costReturn = Math.round(avgCost * qty * 100) / 100; // 213.33

    // Journal: Dr Revenue 400, Cr Customer 400, Dr Inventory 213.33, Cr COGS 213.33
    const lines: JournalLine[] = [
      { accountCode: "4101", debit: returnValue, credit: 0, description: "مرتجع مبيعات" },
      { accountCode: "1103", debit: 0, credit: returnValue, description: "العملاء" },
      { accountCode: "1104", debit: costReturn, credit: 0, description: "المخزون" },
      { accountCode: "5101", debit: 0, credit: costReturn, description: "عكس تكلفة" },
    ];
    expect(validateJournalEntry(lines)).toBe(true);

    entries.push({ id: ++entryId, description: "مرتجع بيع #1", status: "posted", lines });
    movements.push({ productCode: "P001", type: "sale_return", quantity: qty, unitCost: avgCost, totalCost: costReturn });
    productQty += qty;
    customerBalance -= returnValue;

    expect(productQty).toBe(24);
    expect(customerBalance).toBe(1200);
  });

  // ── Step 5: Customer payment 500 ──
  it("Step 5: Customer payment reduces balance correctly", () => {
    const paymentAmount = 500;

    // Journal: Dr Cash 500, Cr Customer 500
    const lines: JournalLine[] = [
      { accountCode: "1101", debit: paymentAmount, credit: 0, description: "سند قبض" },
      { accountCode: "1103", debit: 0, credit: paymentAmount, description: "العملاء" },
    ];
    expect(validateJournalEntry(lines)).toBe(true);

    entries.push({ id: ++entryId, description: "سند قبض #1", status: "posted", lines });
    customerBalance -= paymentAmount;

    expect(customerBalance).toBe(700);
  });

  // ── Step 6: Supplier payment 1000 ──
  it("Step 6: Supplier payment reduces supplier balance", () => {
    const paymentAmount = 1000;

    const lines: JournalLine[] = [
      { accountCode: "2101", debit: paymentAmount, credit: 0, description: "سند صرف" },
      { accountCode: "1101", debit: 0, credit: paymentAmount, description: "الصندوق" },
    ];
    expect(validateJournalEntry(lines)).toBe(true);

    entries.push({ id: ++entryId, description: "سند صرف #1", status: "posted", lines });
    supplierBalance -= paymentAmount;

    expect(supplierBalance).toBe(2200);
  });

  // ── Step 7: Verify customer account statement ──
  it("Step 7: Customer account statement shows correct running balance", () => {
    const statement = buildCustomerStatement(entries, "1103");

    // Expected: sale +1600, return -400, payment -500
    expect(statement.length).toBe(3);
    expect(statement[0].debit).toBe(1600);
    expect(statement[0].runningBalance).toBe(1600);
    expect(statement[1].credit).toBe(400);
    expect(statement[1].runningBalance).toBe(1200);
    expect(statement[2].credit).toBe(500);
    expect(statement[2].runningBalance).toBe(700);

    // Final balance matches tracked balance
    expect(statement[statement.length - 1].runningBalance).toBe(customerBalance);
  });

  // ── Step 8: Verify trial balance equation ──
  it("Step 8: Trial balance total debits = total credits", () => {
    const tb = getTrialBalance(entries, accounts);
    const totalDebit = tb.reduce((s, a) => s + a.debit, 0);
    const totalCredit = tb.reduce((s, a) => s + a.credit, 0);
    expect(Math.abs(totalDebit - totalCredit)).toBeLessThan(0.01);
  });

  // ── Step 9: Verify income statement ──
  it("Step 9: Income statement calculates net profit correctly", () => {
    // Net revenue = 1600 (sale) - 400 (return) = 1200
    const revenueBal = getAccountBalance(entries, "4101");
    const netRevenue = revenueBal.credit - revenueBal.debit; // credit nature
    expect(netRevenue).toBe(1200);

    // Net COGS = 853.33 (sale) - 213.33 (return) = 640
    const cogsBal = getAccountBalance(entries, "5101");
    const netCOGS = cogsBal.debit - cogsBal.credit; // debit nature
    expect(netCOGS).toBeCloseTo(640, 2);

    // Gross profit = 1200 - 640 = 560
    const grossProfit = netRevenue - netCOGS;
    expect(grossProfit).toBeCloseTo(560, 2);
  });

  // ── Step 10: Verify balance sheet equation ──
  it("Step 10: Balance sheet: Assets = Liabilities + Equity + Profit", () => {
    // Assets
    const cash = getAccountBalance(entries, "1101").net;       // 500 - 1000 = -500
    const customers = getAccountBalance(entries, "1103").net;  // 1600 - 400 - 500 = 700
    const inventory = getAccountBalance(entries, "1104").net;  // 3200 - 853.33 + 213.33 = 2560
    const totalAssets = cash + customers + inventory;

    // Liabilities
    const suppliers = -(getAccountBalance(entries, "2101").net); // credit nature: 3200 - 1000 = 2200
    
    // Net profit (revenue - expenses)
    const revenue = getAccountBalance(entries, "4101");
    const netRevenue = revenue.credit - revenue.debit;
    const cogs = getAccountBalance(entries, "5101");
    const netCOGS = cogs.debit - cogs.credit;
    const netProfit = netRevenue - netCOGS;

    // Assets = Liabilities + Equity + Profit (no equity injected in this cycle)
    // totalAssets = -500 + 700 + 2560 = 2760
    // suppliers + profit = 2200 + 560 = 2760
    expect(totalAssets).toBeCloseTo(suppliers + netProfit, 2);
  });

  // ── Step 11: Verify inventory quantity matches movements ──
  it("Step 11: Inventory quantity reconciles with movements", () => {
    let calculatedQty = 0;
    for (const m of movements) {
      if (m.type === "purchase" || m.type === "opening_balance" || m.type === "sale_return") {
        calculatedQty += m.quantity;
      } else if (m.type === "sale") {
        calculatedQty -= m.quantity;
      }
    }
    expect(calculatedQty).toBe(productQty);
    expect(calculatedQty).toBe(24);
  });

  // ── Step 12: All journal entries are balanced ──
  it("Step 12: Every single journal entry is balanced", () => {
    for (const entry of entries) {
      const totalDebit = entry.lines.reduce((s, l) => s + l.debit, 0);
      const totalCredit = entry.lines.reduce((s, l) => s + l.credit, 0);
      expect(Math.abs(totalDebit - totalCredit)).toBeLessThan(0.01);
    }
  });
});

describe("Integration: Inventory Adjustment Cycle", () => {
  it("Deficit adjustment creates correct journal, movements & balances", () => {
    const movements: InventoryMovement[] = [
      { productCode: "P001", type: "purchase", quantity: 100, unitCost: 50, totalCost: 5000 },
    ];
    const avgCost = getAvgPurchasePrice(movements); // 50
    
    const systemQty = 100;
    const actualQty = 95;
    const deficit = systemQty - actualQty; // 5
    const deficitCost = deficit * avgCost; // 250

    // Journal: Dr Inventory Loss 250, Cr Inventory 250
    const lines: JournalLine[] = [
      { accountCode: "5201", debit: deficitCost, credit: 0, description: "عجز مخزون" },
      { accountCode: "1104", debit: 0, credit: deficitCost, description: "المخزون" },
    ];
    expect(validateJournalEntry(lines)).toBe(true);

    // Inventory balance after: 5000 - 250 = 4750
    const inventoryValue = 5000 - deficitCost;
    expect(inventoryValue).toBe(4750);

    // Quantity after: 100 - 5 = 95
    expect(actualQty).toBe(95);
  });

  it("Surplus adjustment creates correct journal & movements", () => {
    const avgCost = 50;
    const systemQty = 100;
    const actualQty = 103;
    const surplus = actualQty - systemQty; // 3
    const surplusCost = surplus * avgCost; // 150

    const lines: JournalLine[] = [
      { accountCode: "1104", debit: surplusCost, credit: 0, description: "المخزون" },
      { accountCode: "4201", debit: 0, credit: surplusCost, description: "فائض مخزون" },
    ];
    expect(validateJournalEntry(lines)).toBe(true);
    expect(surplusCost).toBe(150);
  });
});

describe("Integration: Multi-Customer Payment Allocation", () => {
  it("Multiple payments correctly reduce customer balance", () => {
    let balance = 5000; // initial invoice
    const payments = [1000, 1500, 500, 2000];
    
    for (const payment of payments) {
      balance -= payment;
    }
    expect(balance).toBe(0);
  });

  it("Partial payment leaves correct remaining balance", () => {
    const invoiceTotal = 3000;
    const payment1 = 1000;
    const payment2 = 800;
    const remaining = invoiceTotal - payment1 - payment2;
    expect(remaining).toBe(1200);
  });
});

describe("Integration: Purchase Return Cycle", () => {
  it("Purchase return reverses inventory and supplier balance correctly", () => {
    // Initial: purchased 50 @ 80 = 4000
    let productQty = 50;
    let supplierBalance = 4000;
    let inventoryValue = 4000;

    // Return 10 units @ 80
    const returnQty = 10;
    const returnUnitCost = 80;
    const returnTotal = returnQty * returnUnitCost; // 800

    // Journal: Dr Supplier 800, Cr Inventory 800
    const lines: JournalLine[] = [
      { accountCode: "2101", debit: returnTotal, credit: 0, description: "مرتجع مشتريات" },
      { accountCode: "1104", debit: 0, credit: returnTotal, description: "المخزون" },
    ];
    expect(validateJournalEntry(lines)).toBe(true);

    productQty -= returnQty;
    supplierBalance -= returnTotal;
    inventoryValue -= returnTotal;

    expect(productQty).toBe(40);
    expect(supplierBalance).toBe(3200);
    expect(inventoryValue).toBe(3200);
  });
});

describe("Integration: Tax Calculation in Full Cycle", () => {
  it("Tax is correctly calculated and flows through the system", () => {
    const subtotal = 1000;
    const taxRate = 0.14;
    const tax = subtotal * taxRate; // 140
    const total = subtotal + tax; // 1140

    // Sales invoice with tax: Dr Customer 1140, Cr Revenue 1000, Cr Tax Payable 140
    const lines: JournalLine[] = [
      { accountCode: "1103", debit: total, credit: 0, description: "العملاء" },
      { accountCode: "4101", debit: 0, credit: subtotal, description: "إيرادات" },
      { accountCode: "2102", debit: 0, credit: tax, description: "ضريبة مستحقة" },
    ];
    expect(validateJournalEntry(lines)).toBe(true);
    expect(tax).toBe(140);
    expect(total).toBe(1140);
  });

  it("Discount applied before tax calculation", () => {
    const subtotal = 2000;
    const discount = 200;
    const afterDiscount = subtotal - discount; // 1800
    const taxRate = 0.14;
    const tax = afterDiscount * taxRate; // 252
    const total = afterDiscount + tax; // 2052

    expect(afterDiscount).toBe(1800);
    expect(tax).toBeCloseTo(252, 2);
    expect(total).toBeCloseTo(2052, 2);
  });
});
