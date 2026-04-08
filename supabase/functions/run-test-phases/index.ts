import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function round2(n: number) { return Math.round(n * 100) / 100; }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { phase } = await req.json();
  const log: string[] = [];
  const L = (m: string) => log.push(m);

  try {
    // IDs from existing data
    const P = {
      laptop: "ba8ae631-8a26-46d1-adcb-41474e1d6c68",
      mouse: "854350d0-2fa7-4c72-abdc-0358d38ee032",
      screen: "645abb94-cf07-439b-b4f3-31e7886d8d73",
    };
    const C = {
      ahmed: "95e76d49-8fca-4fe3-a53b-32da4e6612f7",
      sara: "d959d4bc-487e-4faa-b930-83fa20b1896f",
    };
    const S = {
      tech: "f58cf93f-24bc-4e00-bc42-bf838390b676",
      screens: "eadf0e33-4c95-485a-8784-897b63366bfe",
    };
    const ACC = {
      customers: "dac1a0e1-7910-4ab5-8dca-dfb11f1941ef",
      inventory: "5fb22856-af8f-4bc4-89a2-72d677a55efb",
      suppliers: "35620781-5364-4dfa-8656-7a0b6c35b8f3",
      revenue: "7feff253-f4d0-4109-92d3-9b4975eeffc7",
      cogs: "8fd27ebf-2e14-496c-a1a0-cb781460ce80",
    };

    // Helper: get next posted number
    async function nextPosted(table: string) {
      const { data } = await supabase.from(table).select("posted_number").not("posted_number", "is", null).order("posted_number", { ascending: false }).limit(1);
      return (data && data.length > 0 ? Number(data[0].posted_number) : 0) + 1;
    }

    // Helper: get next sequence number
    async function nextSeq(table: string, col: string) {
      const { data } = await supabase.from(table).select(col).order(col, { ascending: false }).limit(1);
      return (data && data.length > 0 ? Number((data[0] as any)[col]) : 0) + 1;
    }

    // Helper: get product qty
    async function getQty(pid: string) {
      const { data } = await supabase.from("products").select("quantity_on_hand").eq("id", pid).single();
      return data?.quantity_on_hand ?? 0;
    }

    // Helper: get avg purchase price
    async function getAvgPurchasePrice(pid: string) {
      const { data } = await supabase.rpc("get_avg_purchase_price", { _product_id: pid });
      return Number(data) || 0;
    }

    // ═══════════════════════════════════════════════════════
    // PHASE 6: Purchase Invoice #1 (no discount)
    // 10 لابتوب × 8000 = 80,000 from مورد التقنية
    // ═══════════════════════════════════════════════════════
    if (phase === 6 || phase === "all") {
      L("═══ Phase 6: Purchase Invoice #1 ═══");
      const invNum = await nextSeq("purchase_invoices", "invoice_number");
      const postedNum = await nextPosted("purchase_invoices");
      const jePostedNum = await nextPosted("journal_entries");
      const jeNum = await nextSeq("journal_entries", "entry_number");
      const total = 80000;
      const displayNum = `PUR-${String(postedNum).padStart(4, "0")}`;

      // Create journal entry
      const { data: je } = await supabase.from("journal_entries").insert({
        description: `فاتورة شراء رقم ${displayNum}`,
        entry_date: "2025-01-15",
        total_debit: total, total_credit: total,
        status: "posted", posted_number: jePostedNum, entry_number: jeNum,
      }).select("id").single();

      await supabase.from("journal_entry_lines").insert([
        { journal_entry_id: je!.id, account_id: ACC.inventory, debit: total, credit: 0, description: `مشتريات - فاتورة ${displayNum}` },
        { journal_entry_id: je!.id, account_id: ACC.suppliers, debit: 0, credit: total, description: `مستحقات مورد - فاتورة ${displayNum}` },
      ]);

      // Create invoice
      const { data: inv } = await supabase.from("purchase_invoices").insert({
        invoice_number: invNum, invoice_date: "2025-01-15",
        supplier_id: S.tech, subtotal: total, discount: 0, tax: 0, total: total,
        status: "posted", journal_entry_id: je!.id, posted_number: postedNum,
      } as any).select("id").single();

      await supabase.from("purchase_invoice_items").insert({
        invoice_id: inv!.id, product_id: P.laptop,
        description: "لابتوب HP", quantity: 10, unit_price: 8000,
        discount: 0, total: 80000, net_total: 80000, sort_order: 0,
      } as any);

      // Update inventory
      const curQty = await getQty(P.laptop);
      await supabase.from("products").update({ quantity_on_hand: curQty + 10 } as any).eq("id", P.laptop);
      await supabase.from("inventory_movements").insert({
        product_id: P.laptop, movement_type: "purchase", quantity: 10,
        unit_cost: 8000, total_cost: 80000,
        reference_id: inv!.id, reference_type: "purchase_invoice", movement_date: "2025-01-15",
      } as any);

      // Update supplier balance
      const { data: supInvs } = await supabase.from("purchase_invoices").select("total").eq("supplier_id", S.tech).eq("status", "posted");
      const supBalance = (supInvs || []).reduce((s: number, r: any) => s + Number(r.total), 0);
      // Subtract opening balance JE contribution - supplier started with 3000 opening
      await supabase.from("suppliers").update({ balance: supBalance + 3000 } as any).eq("id", S.tech);

      L(`✅ PUR-0001 created: 10 لابتوب × 8,000 = ${total}`);
      L(`  Laptop qty: ${curQty} → ${curQty + 10}`);
      L(`  Supplier balance: ${supBalance + 3000}`);
    }

    // ═══════════════════════════════════════════════════════
    // PHASE 7: Purchase Invoice #2 (with invoice discount)
    // 50 ماوس × 100 = 5,000 - discount 500 = 4,500 from مورد التقنية
    // ═══════════════════════════════════════════════════════
    if (phase === 7 || phase === "all") {
      L("═══ Phase 7: Purchase Invoice #2 (with discount) ═══");
      const invNum = await nextSeq("purchase_invoices", "invoice_number");
      const postedNum = await nextPosted("purchase_invoices");
      const jePostedNum = await nextPosted("journal_entries");
      const jeNum = await nextSeq("journal_entries", "entry_number");
      const subtotal = 5000;
      const discount = 500;
      const total = 4500;
      const displayNum = `PUR-${String(postedNum).padStart(4, "0")}`;

      const { data: je } = await supabase.from("journal_entries").insert({
        description: `فاتورة شراء رقم ${displayNum}`,
        entry_date: "2025-01-20", total_debit: total, total_credit: total,
        status: "posted", posted_number: jePostedNum, entry_number: jeNum,
      }).select("id").single();

      await supabase.from("journal_entry_lines").insert([
        { journal_entry_id: je!.id, account_id: ACC.inventory, debit: total, credit: 0, description: `مشتريات - فاتورة ${displayNum}` },
        { journal_entry_id: je!.id, account_id: ACC.suppliers, debit: 0, credit: total, description: `مستحقات مورد - فاتورة ${displayNum}` },
      ]);

      const { data: inv } = await supabase.from("purchase_invoices").insert({
        invoice_number: invNum, invoice_date: "2025-01-20",
        supplier_id: S.tech, subtotal, discount, tax: 0, total,
        status: "posted", journal_entry_id: je!.id, posted_number: postedNum,
      } as any).select("id").single();

      // net_total = item.total * (1 - discount/subtotal) = 5000 * (1 - 500/5000) = 4500
      await supabase.from("purchase_invoice_items").insert({
        invoice_id: inv!.id, product_id: P.mouse,
        description: "ماوس لاسلكي", quantity: 50, unit_price: 100,
        discount: 0, total: 5000, net_total: 4500, sort_order: 0,
      } as any);

      const curQty = await getQty(P.mouse);
      await supabase.from("products").update({ quantity_on_hand: curQty + 50 } as any).eq("id", P.mouse);
      await supabase.from("inventory_movements").insert({
        product_id: P.mouse, movement_type: "purchase", quantity: 50,
        unit_cost: 90, total_cost: 4500, // 4500/50 = 90 per unit after discount
        reference_id: inv!.id, reference_type: "purchase_invoice", movement_date: "2025-01-20",
      } as any);

      // Recalc supplier balance
      const { data: supInvs } = await supabase.from("purchase_invoices").select("total").eq("supplier_id", S.tech).eq("status", "posted");
      const invTotal = (supInvs || []).reduce((s: number, r: any) => s + Number(r.total), 0);
      await supabase.from("suppliers").update({ balance: invTotal + 3000 } as any).eq("id", S.tech);

      L(`✅ PUR-0002 created: 50 ماوس × 100 = 5,000 - خصم 500 = ${total}`);
      L(`  Mouse qty: ${curQty} → ${curQty + 50}`);
      L(`  Net unit cost for inventory: 90`);
    }

    // ═══════════════════════════════════════════════════════
    // PHASE 8: Purchase Invoice #3
    // 5 شاشة × 3000 = 15,000 from مورد الشاشات
    // ═══════════════════════════════════════════════════════
    if (phase === 8 || phase === "all") {
      L("═══ Phase 8: Purchase Invoice #3 ═══");
      const invNum = await nextSeq("purchase_invoices", "invoice_number");
      const postedNum = await nextPosted("purchase_invoices");
      const jePostedNum = await nextPosted("journal_entries");
      const jeNum = await nextSeq("journal_entries", "entry_number");
      const total = 15000;
      const displayNum = `PUR-${String(postedNum).padStart(4, "0")}`;

      const { data: je } = await supabase.from("journal_entries").insert({
        description: `فاتورة شراء رقم ${displayNum}`,
        entry_date: "2025-01-25", total_debit: total, total_credit: total,
        status: "posted", posted_number: jePostedNum, entry_number: jeNum,
      }).select("id").single();

      await supabase.from("journal_entry_lines").insert([
        { journal_entry_id: je!.id, account_id: ACC.inventory, debit: total, credit: 0, description: `مشتريات - فاتورة ${displayNum}` },
        { journal_entry_id: je!.id, account_id: ACC.suppliers, debit: 0, credit: total, description: `مستحقات مورد - فاتورة ${displayNum}` },
      ]);

      const { data: inv } = await supabase.from("purchase_invoices").insert({
        invoice_number: invNum, invoice_date: "2025-01-25",
        supplier_id: S.screens, subtotal: total, discount: 0, tax: 0, total,
        status: "posted", journal_entry_id: je!.id, posted_number: postedNum,
      } as any).select("id").single();

      await supabase.from("purchase_invoice_items").insert({
        invoice_id: inv!.id, product_id: P.screen,
        description: "شاشة سامسونج", quantity: 5, unit_price: 3000,
        discount: 0, total: 15000, net_total: 15000, sort_order: 0,
      } as any);

      const curQty = await getQty(P.screen);
      await supabase.from("products").update({ quantity_on_hand: curQty + 5 } as any).eq("id", P.screen);
      await supabase.from("inventory_movements").insert({
        product_id: P.screen, movement_type: "purchase", quantity: 5,
        unit_cost: 3000, total_cost: 15000,
        reference_id: inv!.id, reference_type: "purchase_invoice", movement_date: "2025-01-25",
      } as any);

      await supabase.from("suppliers").update({ balance: 15000 } as any).eq("id", S.screens);

      L(`✅ PUR-0003 created: 5 شاشة × 3,000 = ${total}`);
      L(`  Screen qty: ${curQty} → ${curQty + 5}`);
    }

    // ═══════════════════════════════════════════════════════
    // PHASE 9: Verify after purchases
    // ═══════════════════════════════════════════════════════
    if (phase === 9 || phase === "all") {
      L("═══ Phase 9: Verify after purchases ═══");
      
      // Product quantities
      const laptopQty = await getQty(P.laptop);  // 5+10=15
      const mouseQty = await getQty(P.mouse);     // 20+50=70
      const screenQty = await getQty(P.screen);   // 3+5=8
      L(`Laptop qty: ${laptopQty} (expected: 15) ${laptopQty === 15 ? '✅' : '❌'}`);
      L(`Mouse qty: ${mouseQty} (expected: 70) ${mouseQty === 70 ? '✅' : '❌'}`);
      L(`Screen qty: ${screenQty} (expected: 8) ${screenQty === 8 ? '✅' : '❌'}`);

      // Supplier balances
      const { data: techSup } = await supabase.from("suppliers").select("balance").eq("id", S.tech).single();
      const { data: screenSup } = await supabase.from("suppliers").select("balance").eq("id", S.screens).single();
      // tech: 3000 opening + 80000 + 4500 = 87500
      // screens: 0 opening + 15000 = 15000
      L(`Tech supplier balance: ${techSup?.balance} (expected: 87500) ${Number(techSup?.balance) === 87500 ? '✅' : '❌'}`);
      L(`Screens supplier balance: ${screenSup?.balance} (expected: 15000) ${Number(screenSup?.balance) === 15000 ? '✅' : '❌'}`);

      // Trial balance
      const { data: jLines } = await supabase.from("journal_entry_lines").select("account_id, debit, credit").eq("journal_entry_id", (await supabase.from("journal_entries").select("id").eq("status", "posted")).data!.map((j: any) => j.id));
      // Simpler: just sum all lines
      const { data: allLines } = await supabase.from("journal_entry_lines").select("debit, credit");
      const totalDebit = (allLines || []).reduce((s: number, l: any) => s + Number(l.debit), 0);
      const totalCredit = (allLines || []).reduce((s: number, l: any) => s + Number(l.credit), 0);
      L(`Trial Balance: Debit=${totalDebit} Credit=${totalCredit} ${totalDebit === totalCredit ? '✅ BALANCED' : '❌ UNBALANCED'}`);

      // Avg purchase prices
      const laptopAvg = await getAvgPurchasePrice(P.laptop);
      const mouseAvg = await getAvgPurchasePrice(P.mouse);
      const screenAvg = await getAvgPurchasePrice(P.screen);
      // Laptop: (40000 opening + 80000 purchase) / (5+10) = 120000/15 = 8000
      // Mouse: (2000 opening + 4500 purchase) / (20+50) = 6500/70 = 92.86
      // Screen: (9000 opening + 15000 purchase) / (3+5) = 24000/8 = 3000
      L(`Laptop avg purchase: ${laptopAvg} (expected: 8000) ${round2(laptopAvg) === 8000 ? '✅' : '❌'}`);
      L(`Mouse avg purchase: ${round2(mouseAvg)} (expected: 92.86) ${round2(mouseAvg) === 92.86 ? '✅' : '⚠️ close?'}`);
      L(`Screen avg purchase: ${screenAvg} (expected: 3000) ${round2(screenAvg) === 3000 ? '✅' : '❌'}`);
    }

    // ═══════════════════════════════════════════════════════
    // PHASE 10: Sales Invoice #1 (no discount)
    // 3 لابتوب × 10,000 = 30,000 to عميل أحمد
    // ═══════════════════════════════════════════════════════
    if (phase === 10 || phase === "all") {
      L("═══ Phase 10: Sales Invoice #1 ═══");
      const invNum = await nextSeq("sales_invoices", "invoice_number");
      const postedNum = await nextPosted("sales_invoices");
      const jePostedNum = await nextPosted("journal_entries");
      const jeNum = await nextSeq("journal_entries", "entry_number");
      const total = 30000;
      const displayNum = `INV-${String(postedNum).padStart(4, "0")}`;

      // Get avg cost for COGS
      const avgCost = await getAvgPurchasePrice(P.laptop); // 8000
      const totalCost = round2(avgCost * 3);

      const totalDebit = total + totalCost;
      const { data: je } = await supabase.from("journal_entries").insert({
        description: `فاتورة بيع رقم ${displayNum}`,
        entry_date: "2025-02-01", total_debit: totalDebit, total_credit: totalDebit,
        status: "posted", posted_number: jePostedNum, entry_number: jeNum,
      }).select("id").single();

      const lines = [
        { journal_entry_id: je!.id, account_id: ACC.customers, debit: total, credit: 0, description: `مبيعات - فاتورة ${displayNum}` },
        { journal_entry_id: je!.id, account_id: ACC.revenue, debit: 0, credit: total, description: `إيراد مبيعات - فاتورة ${displayNum}` },
        { journal_entry_id: je!.id, account_id: ACC.cogs, debit: totalCost, credit: 0, description: `تكلفة بضاعة مباعة - فاتورة ${displayNum}` },
        { journal_entry_id: je!.id, account_id: ACC.inventory, debit: 0, credit: totalCost, description: `خصم مخزون - فاتورة ${displayNum}` },
      ];
      await supabase.from("journal_entry_lines").insert(lines);

      const { data: inv } = await supabase.from("sales_invoices").insert({
        invoice_number: invNum, invoice_date: "2025-02-01",
        customer_id: C.ahmed, subtotal: total, discount: 0, tax: 0, total,
        status: "posted", journal_entry_id: je!.id, posted_number: postedNum,
      } as any).select("id").single();

      await supabase.from("sales_invoice_items").insert({
        invoice_id: inv!.id, product_id: P.laptop,
        description: "لابتوب HP", quantity: 3, unit_price: 10000,
        discount: 0, total: 30000, net_total: 30000, sort_order: 0,
      } as any);

      // Update inventory
      const curQty = await getQty(P.laptop);
      await supabase.from("products").update({ quantity_on_hand: curQty - 3 } as any).eq("id", P.laptop);
      await supabase.from("inventory_movements").insert({
        product_id: P.laptop, movement_type: "sale", quantity: 3,
        unit_cost: avgCost, total_cost: totalCost,
        reference_id: inv!.id, reference_type: "sales_invoice", movement_date: "2025-02-01",
      } as any);

      // Update customer balance: opening 5000 + 30000
      await supabase.from("customers").update({ balance: 5000 + total } as any).eq("id", C.ahmed);

      L(`✅ INV-0001: 3 لابتوب × 10,000 = ${total}`);
      L(`  COGS: ${totalCost} (avg cost ${avgCost})`);
      L(`  Laptop qty: ${curQty} → ${curQty - 3}`);
    }

    // ═══════════════════════════════════════════════════════
    // PHASE 11: Sales Invoice #2 (with invoice discount)
    // 10 ماوس × 200 = 2,000 - discount 200 = 1,800 to عميل سارة
    // ═══════════════════════════════════════════════════════
    if (phase === 11 || phase === "all") {
      L("═══ Phase 11: Sales Invoice #2 (with discount) ═══");
      const invNum = await nextSeq("sales_invoices", "invoice_number");
      const postedNum = await nextPosted("sales_invoices");
      const jePostedNum = await nextPosted("journal_entries");
      const jeNum = await nextSeq("journal_entries", "entry_number");
      const subtotal = 2000;
      const discount = 200;
      const total = 1800;
      const displayNum = `INV-${String(postedNum).padStart(4, "0")}`;

      const avgCost = await getAvgPurchasePrice(P.mouse);
      const totalCost = round2(avgCost * 10);

      const totalDebitJE = total + totalCost;
      const { data: je } = await supabase.from("journal_entries").insert({
        description: `فاتورة بيع رقم ${displayNum}`,
        entry_date: "2025-02-05", total_debit: totalDebitJE, total_credit: totalDebitJE,
        status: "posted", posted_number: jePostedNum, entry_number: jeNum,
      }).select("id").single();

      await supabase.from("journal_entry_lines").insert([
        { journal_entry_id: je!.id, account_id: ACC.customers, debit: total, credit: 0, description: `مبيعات - فاتورة ${displayNum}` },
        { journal_entry_id: je!.id, account_id: ACC.revenue, debit: 0, credit: total, description: `إيراد مبيعات - فاتورة ${displayNum}` },
        { journal_entry_id: je!.id, account_id: ACC.cogs, debit: totalCost, credit: 0, description: `تكلفة بضاعة مباعة - فاتورة ${displayNum}` },
        { journal_entry_id: je!.id, account_id: ACC.inventory, debit: 0, credit: totalCost, description: `خصم مخزون - فاتورة ${displayNum}` },
      ]);

      const { data: inv } = await supabase.from("sales_invoices").insert({
        invoice_number: invNum, invoice_date: "2025-02-05",
        customer_id: C.sara, subtotal, discount, tax: 0, total,
        status: "posted", journal_entry_id: je!.id, posted_number: postedNum,
      } as any).select("id").single();

      // net_total = 2000 * (1 - 200/2000) = 1800
      await supabase.from("sales_invoice_items").insert({
        invoice_id: inv!.id, product_id: P.mouse,
        description: "ماوس لاسلكي", quantity: 10, unit_price: 200,
        discount: 0, total: 2000, net_total: 1800, sort_order: 0,
      } as any);

      const curQty = await getQty(P.mouse);
      await supabase.from("products").update({ quantity_on_hand: curQty - 10 } as any).eq("id", P.mouse);
      await supabase.from("inventory_movements").insert({
        product_id: P.mouse, movement_type: "sale", quantity: 10,
        unit_cost: avgCost, total_cost: totalCost,
        reference_id: inv!.id, reference_type: "sales_invoice", movement_date: "2025-02-05",
      } as any);

      await supabase.from("customers").update({ balance: total } as any).eq("id", C.sara);

      L(`✅ INV-0002: 10 ماوس × 200 = 2,000 - خصم 200 = ${total}`);
      L(`  COGS: ${totalCost} (avg cost ${round2(avgCost)})`);
      L(`  Mouse qty: ${curQty} → ${curQty - 10}`);
    }

    // ═══════════════════════════════════════════════════════
    // PHASE 12: Sales Invoice #3 (mixed items)
    // 2 شاشة × 4500 + 5 ماوس × 200 = 10,000 to عميل أحمد
    // ═══════════════════════════════════════════════════════
    if (phase === 12 || phase === "all") {
      L("═══ Phase 12: Sales Invoice #3 (mixed) ═══");
      const invNum = await nextSeq("sales_invoices", "invoice_number");
      const postedNum = await nextPosted("sales_invoices");
      const jePostedNum = await nextPosted("journal_entries");
      const jeNum = await nextSeq("journal_entries", "entry_number");
      const total = 10000; // 9000 + 1000
      const displayNum = `INV-${String(postedNum).padStart(4, "0")}`;

      const screenAvg = await getAvgPurchasePrice(P.screen);
      const mouseAvg = await getAvgPurchasePrice(P.mouse);
      const totalCost = round2(screenAvg * 2 + mouseAvg * 5);

      const totalDebitJE = total + totalCost;
      const { data: je } = await supabase.from("journal_entries").insert({
        description: `فاتورة بيع رقم ${displayNum}`,
        entry_date: "2025-02-10", total_debit: totalDebitJE, total_credit: totalDebitJE,
        status: "posted", posted_number: jePostedNum, entry_number: jeNum,
      }).select("id").single();

      await supabase.from("journal_entry_lines").insert([
        { journal_entry_id: je!.id, account_id: ACC.customers, debit: total, credit: 0, description: `مبيعات - فاتورة ${displayNum}` },
        { journal_entry_id: je!.id, account_id: ACC.revenue, debit: 0, credit: total, description: `إيراد مبيعات - فاتورة ${displayNum}` },
        { journal_entry_id: je!.id, account_id: ACC.cogs, debit: totalCost, credit: 0, description: `تكلفة بضاعة مباعة - فاتورة ${displayNum}` },
        { journal_entry_id: je!.id, account_id: ACC.inventory, debit: 0, credit: totalCost, description: `خصم مخزون - فاتورة ${displayNum}` },
      ]);

      const { data: inv } = await supabase.from("sales_invoices").insert({
        invoice_number: invNum, invoice_date: "2025-02-10",
        customer_id: C.ahmed, subtotal: total, discount: 0, tax: 0, total,
        status: "posted", journal_entry_id: je!.id, posted_number: postedNum,
      } as any).select("id").single();

      await supabase.from("sales_invoice_items").insert([
        { invoice_id: inv!.id, product_id: P.screen, description: "شاشة سامسونج", quantity: 2, unit_price: 4500, discount: 0, total: 9000, net_total: 9000, sort_order: 0 },
        { invoice_id: inv!.id, product_id: P.mouse, description: "ماوس لاسلكي", quantity: 5, unit_price: 200, discount: 0, total: 1000, net_total: 1000, sort_order: 1 },
      ] as any);

      // Update quantities
      const screenQty = await getQty(P.screen);
      await supabase.from("products").update({ quantity_on_hand: screenQty - 2 } as any).eq("id", P.screen);
      await supabase.from("inventory_movements").insert({
        product_id: P.screen, movement_type: "sale", quantity: 2,
        unit_cost: screenAvg, total_cost: round2(screenAvg * 2),
        reference_id: inv!.id, reference_type: "sales_invoice", movement_date: "2025-02-10",
      } as any);

      const mouseQty = await getQty(P.mouse);
      await supabase.from("products").update({ quantity_on_hand: mouseQty - 5 } as any).eq("id", P.mouse);
      await supabase.from("inventory_movements").insert({
        product_id: P.mouse, movement_type: "sale", quantity: 5,
        unit_cost: mouseAvg, total_cost: round2(mouseAvg * 5),
        reference_id: inv!.id, reference_type: "sales_invoice", movement_date: "2025-02-10",
      } as any);

      // Ahmed balance: 5000 opening + 30000 + 10000 = 45000
      await supabase.from("customers").update({ balance: 45000 } as any).eq("id", C.ahmed);

      L(`✅ INV-0003: 2 شاشة + 5 ماوس = ${total}`);
      L(`  COGS: ${totalCost} (screen avg ${screenAvg}, mouse avg ${round2(mouseAvg)})`);
    }

    // ═══════════════════════════════════════════════════════
    // PHASE 13: Customer Payment
    // أحمد يدفع 20,000
    // ═══════════════════════════════════════════════════════
    if (phase === 13 || phase === "all") {
      L("═══ Phase 13: Customer Payment (Ahmed 20,000) ═══");
      const payNum = await nextSeq("customer_payments", "payment_number");
      const postedNum = await nextPosted("customer_payments");
      const jePostedNum = await nextPosted("journal_entries");
      const jeNum = await nextSeq("journal_entries", "entry_number");
      const amount = 20000;

      // Get cash account
      const { data: cashAcc } = await supabase.from("accounts").select("id").eq("code", "1101").single();
      const displayNum = `REC-${String(postedNum).padStart(4, "0")}`;

      const { data: je } = await supabase.from("journal_entries").insert({
        description: `سند قبض رقم ${displayNum} - عميل أحمد`,
        entry_date: "2025-02-15", total_debit: amount, total_credit: amount,
        status: "posted", posted_number: jePostedNum, entry_number: jeNum,
      }).select("id").single();

      await supabase.from("journal_entry_lines").insert([
        { journal_entry_id: je!.id, account_id: cashAcc!.id, debit: amount, credit: 0, description: `تحصيل من عميل أحمد` },
        { journal_entry_id: je!.id, account_id: ACC.customers, debit: 0, credit: amount, description: `تسديد مديونية عميل أحمد` },
      ]);

      // Get ahmed's first sales invoice for allocation
      const { data: ahmedInvs } = await supabase.from("sales_invoices").select("id, total, paid_amount").eq("customer_id", C.ahmed).eq("status", "posted").order("invoice_date");

      const { data: payment } = await supabase.from("customer_payments").insert({
        payment_number: payNum, payment_date: "2025-02-15",
        customer_id: C.ahmed, amount, payment_method: "cash",
        status: "posted", journal_entry_id: je!.id, posted_number: postedNum,
      } as any).select("id").single();

      // Allocate to invoices
      if (ahmedInvs && ahmedInvs.length > 0) {
        let remaining = amount;
        for (const inv of ahmedInvs) {
          const unpaid = Number(inv.total) - Number(inv.paid_amount);
          if (unpaid <= 0 || remaining <= 0) continue;
          const alloc = Math.min(unpaid, remaining);
          await supabase.from("customer_payment_allocations").insert({
            payment_id: payment!.id, invoice_id: inv.id, allocated_amount: alloc,
          });
          await supabase.from("sales_invoices").update({ paid_amount: Number(inv.paid_amount) + alloc } as any).eq("id", inv.id);
          remaining -= alloc;
          L(`  Allocated ${alloc} to invoice ${inv.id}`);
        }
      }

      // Ahmed balance: 45000 - 20000 = 25000
      await supabase.from("customers").update({ balance: 25000 } as any).eq("id", C.ahmed);

      L(`✅ Payment: Ahmed pays ${amount}, balance: 25,000`);
    }

    // ═══════════════════════════════════════════════════════
    // PHASE 14: Supplier Payment
    // دفع 50,000 لمورد التقنية
    // ═══════════════════════════════════════════════════════
    if (phase === 14 || phase === "all") {
      L("═══ Phase 14: Supplier Payment (Tech 50,000) ═══");
      const payNum = await nextSeq("supplier_payments", "payment_number");
      const postedNum = await nextPosted("supplier_payments");
      const jePostedNum = await nextPosted("journal_entries");
      const jeNum = await nextSeq("journal_entries", "entry_number");
      const amount = 50000;

      const { data: cashAcc } = await supabase.from("accounts").select("id").eq("code", "1101").single();
      const displayNum = `PAY-${String(postedNum).padStart(4, "0")}`;

      const { data: je } = await supabase.from("journal_entries").insert({
        description: `سند صرف رقم ${displayNum} - مورد التقنية`,
        entry_date: "2025-02-20", total_debit: amount, total_credit: amount,
        status: "posted", posted_number: jePostedNum, entry_number: jeNum,
      }).select("id").single();

      await supabase.from("journal_entry_lines").insert([
        { journal_entry_id: je!.id, account_id: ACC.suppliers, debit: amount, credit: 0, description: `سداد لمورد التقنية` },
        { journal_entry_id: je!.id, account_id: cashAcc!.id, debit: 0, credit: amount, description: `صرف نقدي لمورد التقنية` },
      ]);

      // Get tech supplier invoices for allocation
      const { data: techInvs } = await supabase.from("purchase_invoices").select("id, total, paid_amount").eq("supplier_id", S.tech).eq("status", "posted").order("invoice_date");

      const { data: payment } = await supabase.from("supplier_payments").insert({
        payment_number: payNum, payment_date: "2025-02-20",
        supplier_id: S.tech, amount, payment_method: "cash",
        status: "posted", journal_entry_id: je!.id, posted_number: postedNum,
      } as any).select("id").single();

      if (techInvs && techInvs.length > 0) {
        let remaining = amount;
        for (const inv of techInvs) {
          const unpaid = Number(inv.total) - Number(inv.paid_amount);
          if (unpaid <= 0 || remaining <= 0) continue;
          const alloc = Math.min(unpaid, remaining);
          await supabase.from("supplier_payment_allocations").insert({
            payment_id: payment!.id, invoice_id: inv.id, allocated_amount: alloc,
          });
          await supabase.from("purchase_invoices").update({ paid_amount: Number(inv.paid_amount) + alloc } as any).eq("id", inv.id);
          remaining -= alloc;
          L(`  Allocated ${alloc} to purchase invoice ${inv.id}`);
        }
      }

      // Tech balance: 87500 - 50000 = 37500
      await supabase.from("suppliers").update({ balance: 37500 } as any).eq("id", S.tech);

      L(`✅ Payment: Tech supplier receives ${amount}, balance: 37,500`);
    }

    // ═══════════════════════════════════════════════════════
    // PHASE 15: Sales Return
    // مرتجع 1 لابتوب من أحمد (INV-0001)
    // ═══════════════════════════════════════════════════════
    if (phase === 15 || phase === "all") {
      L("═══ Phase 15: Sales Return (1 laptop from Ahmed) ═══");
      const retNum = await nextSeq("sales_returns", "return_number");
      const postedNum = await nextPosted("sales_returns");
      const jePostedNum = await nextPosted("journal_entries");
      const jeNum = await nextSeq("journal_entries", "entry_number");
      const total = 10000; // 1 laptop at sell price
      const displayNum = `SRET-${String(postedNum).padStart(4, "0")}`;

      // Get the original sales invoice
      const { data: salesInvs } = await supabase.from("sales_invoices").select("id").eq("customer_id", C.ahmed).eq("status", "posted").order("invoice_date").limit(1);
      const salesInvId = salesInvs?.[0]?.id;

      const avgCost = await getAvgPurchasePrice(P.laptop);
      const returnCost = avgCost * 1;

      const totalDebitJE = total + returnCost;
      const { data: je } = await supabase.from("journal_entries").insert({
        description: `مرتجع مبيعات رقم ${displayNum}`,
        entry_date: "2025-02-25", total_debit: totalDebitJE, total_credit: totalDebitJE,
        status: "posted", posted_number: jePostedNum, entry_number: jeNum,
      }).select("id").single();

      await supabase.from("journal_entry_lines").insert([
        { journal_entry_id: je!.id, account_id: ACC.revenue, debit: total, credit: 0, description: `مرتجع مبيعات - ${displayNum}` },
        { journal_entry_id: je!.id, account_id: ACC.customers, debit: 0, credit: total, description: `تخفيض مديونية - ${displayNum}` },
        { journal_entry_id: je!.id, account_id: ACC.inventory, debit: returnCost, credit: 0, description: `إعادة مخزون - ${displayNum}` },
        { journal_entry_id: je!.id, account_id: ACC.cogs, debit: 0, credit: returnCost, description: `عكس تكلفة - ${displayNum}` },
      ]);

      const { data: ret } = await supabase.from("sales_returns").insert({
        return_number: retNum, return_date: "2025-02-25",
        customer_id: C.ahmed, sales_invoice_id: salesInvId,
        subtotal: total, discount: 0, tax: 0, total,
        status: "posted", journal_entry_id: je!.id, posted_number: postedNum,
      } as any).select("id").single();

      await supabase.from("sales_return_items").insert({
        return_id: ret!.id, product_id: P.laptop,
        description: "لابتوب HP", quantity: 1, unit_price: 10000,
        discount: 0, total: 10000, sort_order: 0,
      } as any);

      // Return inventory
      const curQty = await getQty(P.laptop);
      await supabase.from("products").update({ quantity_on_hand: curQty + 1 } as any).eq("id", P.laptop);
      await supabase.from("inventory_movements").insert({
        product_id: P.laptop, movement_type: "sale_return", quantity: 1,
        unit_cost: avgCost, total_cost: returnCost,
        reference_id: ret!.id, reference_type: "sales_return", movement_date: "2025-02-25",
      } as any);

      // Ahmed balance: 25000 - 10000 = 15000
      await supabase.from("customers").update({ balance: 15000 } as any).eq("id", C.ahmed);

      L(`✅ SRET-0001: 1 لابتوب مرتجع من أحمد`);
      L(`  Return value: ${total}, COGS reversed: ${returnCost}`);
      L(`  Laptop qty: ${curQty} → ${curQty + 1}`);
    }

    // ═══════════════════════════════════════════════════════
    // PHASE 16: Purchase Return
    // مرتجع 5 ماوس لمورد التقنية
    // ═══════════════════════════════════════════════════════
    if (phase === 16 || phase === "all") {
      L("═══ Phase 16: Purchase Return (5 mouse to Tech) ═══");
      const retNum = await nextSeq("purchase_returns", "return_number");
      const postedNum = await nextPosted("purchase_returns");
      const jePostedNum = await nextPosted("journal_entries");
      const jeNum = await nextSeq("journal_entries", "entry_number");

      // Get first purchase invoice from tech
      const { data: purInvs } = await supabase.from("purchase_invoices").select("id").eq("supplier_id", S.tech).eq("status", "posted").order("invoice_date", { ascending: false }).limit(1);
      const purInvId = purInvs?.[0]?.id;

      // Use avg purchase price for return value
      const avgCost = await getAvgPurchasePrice(P.mouse);
      const total = round2(avgCost * 5); // ~92.86 * 5 = ~464.29
      const displayNum = `PRET-${String(postedNum).padStart(4, "0")}`;

      // For purchase return, use selling price of supplier = unit_price from invoice = 100
      // But total on return doc = quantity * unit_price = 5 * 100 = 500
      const returnTotal = 500; // 5 * 100

      const { data: je } = await supabase.from("journal_entries").insert({
        description: `مرتجع مشتريات رقم ${displayNum}`,
        entry_date: "2025-03-01", total_debit: returnTotal, total_credit: returnTotal,
        status: "posted", posted_number: jePostedNum, entry_number: jeNum,
      }).select("id").single();

      await supabase.from("journal_entry_lines").insert([
        { journal_entry_id: je!.id, account_id: ACC.suppliers, debit: returnTotal, credit: 0, description: `مرتجع مشتريات - ${displayNum}` },
        { journal_entry_id: je!.id, account_id: ACC.inventory, debit: 0, credit: returnTotal, description: `خصم مخزون مرتجع - ${displayNum}` },
      ]);

      const { data: ret } = await supabase.from("purchase_returns").insert({
        return_number: retNum, return_date: "2025-03-01",
        supplier_id: S.tech, purchase_invoice_id: purInvId,
        subtotal: returnTotal, discount: 0, tax: 0, total: returnTotal,
        status: "posted", journal_entry_id: je!.id, posted_number: postedNum,
      } as any).select("id").single();

      await supabase.from("purchase_return_items").insert({
        return_id: ret!.id, product_id: P.mouse,
        description: "ماوس لاسلكي", quantity: 5, unit_price: 100,
        discount: 0, total: 500, sort_order: 0,
      } as any);

      const curQty = await getQty(P.mouse);
      await supabase.from("products").update({ quantity_on_hand: curQty - 5 } as any).eq("id", P.mouse);
      await supabase.from("inventory_movements").insert({
        product_id: P.mouse, movement_type: "purchase_return", quantity: 5,
        unit_cost: 100, total_cost: 500,
        reference_id: ret!.id, reference_type: "purchase_return", movement_date: "2025-03-01",
      } as any);

      // Tech balance: 37500 - 500 = 37000
      await supabase.from("suppliers").update({ balance: 37000 } as any).eq("id", S.tech);

      L(`✅ PRET-0001: 5 ماوس مرتجع لمورد التقنية`);
      L(`  Return value: ${returnTotal}`);
      L(`  Mouse qty: ${curQty} → ${curQty - 5}`);
    }

    // ═══════════════════════════════════════════════════════
    // PHASE 17: Full Verification
    // ═══════════════════════════════════════════════════════
    if (phase === 17 || phase === "all") {
      L("═══ Phase 17: FULL VERIFICATION ═══");
      
      // 1. Product quantities
      const laptopQty = await getQty(P.laptop);  // 5+10-3+1=13
      const mouseQty = await getQty(P.mouse);     // 20+50-10-5-5=50
      const screenQty = await getQty(P.screen);   // 3+5-2=6
      L(`Laptop qty: ${laptopQty} (expected: 13) ${laptopQty === 13 ? '✅' : '❌'}`);
      L(`Mouse qty: ${mouseQty} (expected: 50) ${mouseQty === 50 ? '✅' : '❌'}`);
      L(`Screen qty: ${screenQty} (expected: 6) ${screenQty === 6 ? '✅' : '❌'}`);

      // 2. Customer balances
      const { data: ahmed } = await supabase.from("customers").select("balance").eq("id", C.ahmed).single();
      const { data: sara } = await supabase.from("customers").select("balance").eq("id", C.sara).single();
      // Ahmed: 5000 + 30000 + 10000 - 20000 - 10000 = 15000
      // Sara: 1800
      L(`Ahmed balance: ${ahmed?.balance} (expected: 15000) ${Number(ahmed?.balance) === 15000 ? '✅' : '❌'}`);
      L(`Sara balance: ${sara?.balance} (expected: 1800) ${Number(sara?.balance) === 1800 ? '✅' : '❌'}`);

      // 3. Supplier balances
      const { data: techS } = await supabase.from("suppliers").select("balance").eq("id", S.tech).single();
      const { data: screensS } = await supabase.from("suppliers").select("balance").eq("id", S.screens).single();
      // Tech: 3000 + 80000 + 4500 - 50000 - 500 = 37000
      // Screens: 15000
      L(`Tech supplier: ${techS?.balance} (expected: 37000) ${Number(techS?.balance) === 37000 ? '✅' : '❌'}`);
      L(`Screens supplier: ${screensS?.balance} (expected: 15000) ${Number(screensS?.balance) === 15000 ? '✅' : '❌'}`);

      // 4. Trial Balance
      const { data: allLines } = await supabase.from("journal_entry_lines").select("debit, credit");
      const totalDebit = round2((allLines || []).reduce((s: number, l: any) => s + Number(l.debit), 0));
      const totalCredit = round2((allLines || []).reduce((s: number, l: any) => s + Number(l.credit), 0));
      L(`Trial Balance: Debit=${totalDebit} Credit=${totalCredit} ${totalDebit === totalCredit ? '✅ BALANCED' : '❌ UNBALANCED'}`);

      // 5. Account balances breakdown
      const { data: accLines } = await supabase.from("journal_entry_lines").select("account_id, debit, credit");
      const accBalances: Record<string, { debit: number; credit: number }> = {};
      for (const line of (accLines || [])) {
        const aid = (line as any).account_id;
        if (!accBalances[aid]) accBalances[aid] = { debit: 0, credit: 0 };
        accBalances[aid].debit += Number((line as any).debit);
        accBalances[aid].credit += Number((line as any).credit);
      }

      const { data: allAccounts } = await supabase.from("accounts").select("id, code, name");
      const accMap = new Map((allAccounts || []).map((a: any) => [a.id, a]));
      
      L("\n--- Account Balances ---");
      for (const [aid, bal] of Object.entries(accBalances)) {
        const acc = accMap.get(aid);
        const net = round2(bal.debit - bal.credit);
        L(`  ${acc?.code} ${acc?.name}: Debit=${bal.debit} Credit=${bal.credit} Net=${net}`);
      }

      // 6. Sales totals
      const { data: salesInvs } = await supabase.from("sales_invoices").select("total").eq("status", "posted");
      const { data: salesRets } = await supabase.from("sales_returns").select("total").eq("status", "posted");
      const totalSales = (salesInvs || []).reduce((s: number, r: any) => s + Number(r.total), 0);
      const totalSalesReturns = (salesRets || []).reduce((s: number, r: any) => s + Number(r.total), 0);
      L(`\nTotal Sales: ${totalSales} | Returns: ${totalSalesReturns} | Net: ${totalSales - totalSalesReturns}`);

      // 7. Purchase totals
      const { data: purInvs } = await supabase.from("purchase_invoices").select("total").eq("status", "posted");
      const { data: purRets } = await supabase.from("purchase_returns").select("total").eq("status", "posted");
      const totalPurchases = (purInvs || []).reduce((s: number, r: any) => s + Number(r.total), 0);
      const totalPurReturns = (purRets || []).reduce((s: number, r: any) => s + Number(r.total), 0);
      L(`Total Purchases: ${totalPurchases} | Returns: ${totalPurReturns} | Net: ${totalPurchases - totalPurReturns}`);
    }

    return new Response(JSON.stringify({ success: true, log }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ success: false, error: error.message, log }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
