import { supabase } from "@/integrations/supabase/client";
import { ACCOUNT_CODES } from "@/lib/constants";
import { getNextPostedNumber } from "@/lib/posted-number-utils";

export interface PostExpenseInput {
  expenseId: string;
  expenseTypeId: string;
  expenseTypeName: string;
  /** account_id of the expense type (must be non-null) */
  accountId: string;
  amount: number;
  paymentMethod: "cash" | "bank" | string;
  expenseDate: string;
  description?: string | null;
  /** Optional. When re-posting after revert-to-draft, reuse the same posted_number */
  reusePostedNumber?: number | null;
  /** Settings prefix (default EXP-) */
  expensePrefix?: string;
  /**
   * When re-posting a record that already has a journal entry, that SAME entry is
   * reused: its lines are rebuilt and it is switched back to posted (Odoo-style).
   * The entry is never deleted, so an empty/orphan JV can no longer be created.
   */
  oldJournalEntryId?: string | null;
}

export interface PostExpenseResult {
  journalEntryId: string;
  expensePostedNumber: number;
  displayNumber: string;
}

/**
 * Centralized "post an expense" routine.
 * - Validates account_id presence
 * - Resolves cash/bank account by code
 * - Creates balanced JV (2 lines) with a deterministic description
 * - Updates the expense row with status=posted, journal_entry_id, posted_number
 *
 * Throws on any failure with a human-readable Arabic message.
 */
export async function postExpense(
  input: PostExpenseInput,
): Promise<PostExpenseResult> {
  if (!input.accountId) {
    throw new Error("نوع المصروف لا يحتوي على حساب محاسبي مرتبط");
  }
  if (!(input.amount > 0)) {
    throw new Error("المبلغ يجب أن يكون أكبر من صفر");
  }

  const accountCode =
    input.paymentMethod === "cash" ? ACCOUNT_CODES.CASH : ACCOUNT_CODES.BANK;
  const { data: accounts } = await supabase
    .from("accounts")
    .select("id, code")
    .in("code", [accountCode]);
  const cashBankAcc = accounts?.find((a) => a.code === accountCode);
  if (!cashBankAcc) {
    throw new Error("تأكد من وجود حساب الصندوق/البنك في شجرة الحسابات");
  }

  const expPostedNum =
    input.reusePostedNumber ?? (await getNextPostedNumber("expenses" as any));
  const prefix = input.expensePrefix || "EXP-";
  const displayNum = `${prefix}${String(expPostedNum).padStart(4, "0")}`;
  const desc = `سند مصروف رقم ${displayNum} - ${input.expenseTypeName}${
    input.description?.trim() ? ` - ${input.description.trim()}` : ""
  }`;

  let jeId: string;

  if (input.oldJournalEntryId) {
    // Reuse the SAME journal entry: rebuild its lines in place (never delete it)
    jeId = input.oldJournalEntryId;
    const { error: delErr } = await supabase
      .from("journal_entry_lines")
      .delete()
      .eq("journal_entry_id", jeId);
    if (delErr) throw delErr;
    const { error: updJeErr } = await supabase
      .from("journal_entries")
      .update({
        description: desc,
        entry_date: input.expenseDate,
        total_debit: input.amount,
        total_credit: input.amount,
      } as any)
      .eq("id", jeId);
    if (updJeErr) throw updJeErr;
  } else {
    const jePostedNum = await getNextPostedNumber("journal_entries");
    const { data: je, error: jeError } = await supabase
      .from("journal_entries")
      .insert({
        description: desc,
        entry_date: input.expenseDate,
        total_debit: input.amount,
        total_credit: input.amount,
        status: "draft",
        posted_number: jePostedNum,
      } as any)
      .select("id")
      .single();
    if (jeError) throw jeError;
    jeId = je.id;
  }
  const je = { id: jeId };

  const { error: linesErr } = await supabase
    .from("journal_entry_lines")
    .insert([
      {
        journal_entry_id: je.id,
        account_id: input.accountId,
        debit: input.amount,
        credit: 0,
        description: desc,
      },
      {
        journal_entry_id: je.id,
        account_id: cashBankAcc.id,
        debit: 0,
        credit: input.amount,
        description: desc,
      },
    ] as any);
  if (linesErr) throw linesErr;

  const { error: updErr } = await (supabase.from("expenses" as any) as any)
    .update({
      status: "posted",
      journal_entry_id: je.id,
      posted_number: expPostedNum,
    })
    .eq("id", input.expenseId);
  if (updErr) throw updErr;

  return {
    journalEntryId: je.id,
    expensePostedNumber: expPostedNum,
    displayNumber: displayNum,
  };
}
