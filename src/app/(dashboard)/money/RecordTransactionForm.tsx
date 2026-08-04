"use client";

import { useState } from "react";
import { Loader2, Plus } from "lucide-react";
import {
  MONEY_TX_LABELS,
  MONEY_TX_TYPES,
  MoneyTxType,
  requiresBankAccount,
} from "@/lib/money";

type BankOption = {
  id: string;
  name: string;
  bankName?: string | null;
};

// Suggestions only — the API takes any category, because a hardware shop's
// spending does not stay inside a fixed list.
const CATEGORY_SUGGESTIONS = [
  "Rent",
  "Salaries",
  "Electricity",
  "Water",
  "Fuel",
  "Transport",
  "Repairs",
  "Stationery",
  "Tea / meals",
  "Loan repayment",
  "Temple / charity",
  "Owner drawings",
  "Other",
];

// Each type moves money in its own direction, and the form should say which
// rather than making the owner work it out from a generic label.
const ACCOUNT_LABELS: Record<MoneyTxType, string> = {
  DEPOSIT: "Into which bank",
  WITHDRAWAL: "Out of which bank",
  EXPENSE: "Paid from",
  DONATION: "Given from",
  OTHER_INCOME: "Received into",
  ADJUSTMENT: "Correct which balance",
};

const HINTS: Record<MoneyTxType, string> = {
  DEPOSIT: "Cash leaves the drawer and lands in the bank.",
  WITHDRAWAL: "Money comes out of the bank and into the drawer.",
  EXPENSE: "Money leaves the business — rent, salaries, fuel.",
  DONATION: "Money given away — temple, charity, donations.",
  OTHER_INCOME: "Money in from something that is not a sale.",
  ADJUSTMENT:
    "A correction. Use a negative amount to reduce a balance.",
};

export default function RecordTransactionForm({
  banks,
  date,
  cashInHand,
  onSaved,
}: {
  banks: BankOption[];
  date: string;
  cashInHand: number | null;
  onSaved: () => void;
}) {
  const [type, setType] = useState<MoneyTxType>("DEPOSIT");
  const [amount, setAmount] = useState("");
  const [bankAccountId, setBankAccountId] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [reference, setReference] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const needsBank = requiresBankAccount(type);
  const showCategory = type === "EXPENSE" || type === "DONATION";

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!amount) {
      setError("Enter an amount.");
      return;
    }

    if (needsBank && !bankAccountId) {
      setError("Choose which bank this money moved to or from.");
      return;
    }

    // Taking more cash out of the drawer than it holds is usually a slip, but
    // a float the shop never recorded makes it legitimate — so warn, don't
    // block.
    const leavesDrawer =
      (type === "DEPOSIT" ||
        ((type === "EXPENSE" || type === "DONATION") &&
          !bankAccountId)) &&
      cashInHand !== null &&
      Number(amount) > cashInHand;

    if (
      leavesDrawer &&
      !confirm(
        `That is more than the ${cashInHand.toLocaleString("en-LK", {
          minimumFractionDigits: 2,
        })} showing as cash in hand. Record it anyway?`
      )
    ) {
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/money/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          amount: Number(amount),
          bankAccountId: bankAccountId || null,
          category: showCategory ? category : null,
          description,
          reference,
          // The server turns this into a timestamp so the entry always lands
          // on the day the owner picked, whatever timezone the browser is in.
          date,
        }),
      });

      const json = await res.json();

      if (!res.ok) throw new Error(json.error);

      setAmount("");
      setDescription("");
      setReference("");
      setCategory("");
      onSaved();
    } catch (err: any) {
      setError(err.message || "Failed to record the transaction.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      onSubmit={submit}
      className="rounded-xl border border-border bg-card p-4 space-y-4"
    >
      <h3 className="font-semibold text-foreground flex items-center gap-2">
        <Plus className="h-4 w-4 text-primary" />
        Record a movement
      </h3>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            What happened
          </label>
          <select
            value={type}
            onChange={(event) => {
              const next = event.target.value as MoneyTxType;
              setType(next);
              // Only a deposit or withdrawal must name a bank; everything else
              // defaults back to the cash drawer.
              if (!requiresBankAccount(next)) setBankAccountId("");
            }}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          >
            {MONEY_TX_TYPES.map((value) => (
              <option key={value} value={value}>
                {MONEY_TX_LABELS[value]}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-muted-foreground">
            {HINTS[type]}
          </p>
        </div>

        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            Amount (Rs.)
          </label>
          <input
            type="number"
            step="0.01"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            placeholder="0.00"
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            {ACCOUNT_LABELS[type]}
          </label>
          <select
            value={bankAccountId}
            onChange={(event) => setBankAccountId(event.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          >
            {!needsBank && <option value="">Cash in hand</option>}
            {needsBank && <option value="">Select a bank…</option>}
            {banks.map((bank) => (
              <option key={bank.id} value={bank.id}>
                {bank.name}
                {bank.bankName ? ` — ${bank.bankName}` : ""}
              </option>
            ))}
          </select>
        </div>

        {showCategory && (
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              Category
            </label>
            <input
              list="money-categories"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              placeholder="Rent, salaries, temple…"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
            <datalist id="money-categories">
              {CATEGORY_SUGGESTIONS.map((suggestion) => (
                <option key={suggestion} value={suggestion} />
              ))}
            </datalist>
          </div>
        )}

        <div className={showCategory ? "sm:col-span-2" : ""}>
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            Note
          </label>
          <input
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="What was this for?"
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            Reference (slip no.)
          </label>
          <input
            value={reference}
            onChange={(event) => setReference(event.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
        </div>
      </div>

      {banks.length === 0 && needsBank && (
        <p className="text-sm text-muted-foreground">
          No bank accounts yet — add one under “Bank accounts &amp; savings
          targets” below before recording a deposit.
        </p>
      )}

      {error && (
        <p className="text-sm text-destructive font-medium">{error}</p>
      )}

      <button
        type="submit"
        disabled={saving}
        className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
      >
        {saving && <Loader2 className="h-4 w-4 animate-spin" />}
        Record
      </button>
    </form>
  );
}
