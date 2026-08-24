"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, X } from "lucide-react";
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
  dailyShortfall?: number | null;
};

const ACCOUNT_LABELS: Record<MoneyTxType, string> = {
  DEPOSIT: "Into which bank",
  WITHDRAWAL: "Out of which bank",
  EXPENSE: "Paid from",
  DONATION: "Given from",
  OTHER_INCOME: "Received into",
  ADJUSTMENT: "Correct which balance",
};

const TITLES: Record<MoneyTxType, string> = {
  DEPOSIT: "Bank cash",
  WITHDRAWAL: "Withdraw from bank",
  EXPENSE: "Record an expense",
  DONATION: "Record a donation",
  OTHER_INCOME: "Record other income",
  ADJUSTMENT: "Correct a balance",
};

const CATEGORY_SUGGESTIONS: Partial<Record<MoneyTxType, string[]>> = {
  EXPENSE: [
    "Rent",
    "Salaries",
    "Electricity",
    "Water",
    "Fuel",
    "Transport",
    "Repairs",
    "Tea / meals",
    "Loan repayment",
    "Owner drawings",
  ],
  DONATION: ["Temple", "Charity", "School", "Community"],
};

/**
 * One movement, one dialog.
 *
 * The type is chosen by the button that opened this, so the common jobs are
 * two fields deep instead of six. Everything else is optional and stays out of
 * the way until it is needed.
 */
export default function QuickEntryDialog({
  initialType,
  banks,
  date,
  cashInHand,
  onClose,
  onSaved,
}: {
  initialType: MoneyTxType;
  banks: BankOption[];
  date: string;
  cashInHand: number | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [type, setType] = useState<MoneyTxType>(initialType);
  const [amount, setAmount] = useState("");
  const [bankAccountId, setBankAccountId] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [reference, setReference] = useState("");
  const [showMore, setShowMore] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const amountRef = useRef<HTMLInputElement>(null);

  const needsBank = requiresBankAccount(type);
  const showCategory = type === "EXPENSE" || type === "DONATION";

  useEffect(() => {
    amountRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Banking is nearly always "the usual amount into the usual account", so
  // both are filled in ahead of time when there is an obvious answer.
  useEffect(() => {
    if (!needsBank) {
      setBankAccountId("");
      return;
    }

    const firstShort = banks.find(
      (bank) => (bank.dailyShortfall ?? 0) > 0
    );

    const chosen = firstShort ?? (banks.length === 1 ? banks[0] : null);

    if (chosen) {
      setBankAccountId(chosen.id);

      if (type === "DEPOSIT" && (chosen.dailyShortfall ?? 0) > 0) {
        setAmount(String(chosen.dailyShortfall));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type]);

  const submit = async (event?: React.FormEvent) => {
    event?.preventDefault();

    if (!amount) {
      setError("Enter an amount.");
      return;
    }

    if (needsBank && !bankAccountId) {
      setError("Choose which bank.");
      return;
    }

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
          date,
        }),
      });

      const json = await res.json();

      if (!res.ok) throw new Error(json.error);

      onSaved();
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to record the entry.");
    } finally {
      setSaving(false);
    }
  };

  const suggestions = CATEGORY_SUGGESTIONS[type] || [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:items-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl border border-border bg-card shadow-lg"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border p-4">
          <h3 className="font-semibold text-foreground">{TITLES[type]}</h3>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={submit} className="space-y-4 p-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Amount (Rs.)
            </label>
            <input
              ref={amountRef}
              type="number"
              step="0.01"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="0.00"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-lg font-semibold"
            />
          </div>

          {(needsBank || showMore || type === "OTHER_INCOME") && (
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
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
              {needsBank && banks.length === 0 && (
                <p className="mt-1 text-xs text-muted-foreground">
                  No bank accounts yet — add one under Setup.
                </p>
              )}
            </div>
          )}

          {showCategory && (
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                What for
              </label>
              <input
                list="quick-categories"
                value={category}
                onChange={(event) => setCategory(event.target.value)}
                placeholder={
                  type === "DONATION" ? "Temple, charity…" : "Rent, fuel…"
                }
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
              <datalist id="quick-categories">
                {suggestions.map((suggestion) => (
                  <option key={suggestion} value={suggestion} />
                ))}
              </datalist>

              {suggestions.length > 0 && !category && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {suggestions.slice(0, 5).map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      onClick={() => setCategory(suggestion)}
                      className="rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {showMore && (
            <>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  Note
                </label>
                <input
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  Reference (slip no.)
                </label>
                <input
                  value={reference}
                  onChange={(event) => setReference(event.target.value)}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  Change the kind of movement
                </label>
                <select
                  value={type}
                  onChange={(event) =>
                    setType(event.target.value as MoneyTxType)
                  }
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                >
                  {MONEY_TX_TYPES.map((value) => (
                    <option key={value} value={value}>
                      {MONEY_TX_LABELS[value]}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}

          {!showMore && (
            <button
              type="button"
              onClick={() => setShowMore(true)}
              className="text-xs font-medium text-primary hover:underline"
            >
              Add a note, reference or change the type
            </button>
          )}

          {error && (
            <p className="text-sm font-medium text-destructive">{error}</p>
          )}

          <div className="flex items-center gap-2 pt-1">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Save
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted"
            >
              Cancel
            </button>
          </div>

          <p className="text-center text-xs text-muted-foreground">
            Saving to {date}
          </p>
        </form>
      </div>
    </div>
  );
}
