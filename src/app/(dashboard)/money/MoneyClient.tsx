"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Wallet,
  Landmark,
  TrendingUp,
  ArrowUpRight,
  Loader2,
  Trash2,
  AlertCircle,
  HeartHandshake,
  PiggyBank,
} from "lucide-react";
import { MONEY_TX_LABELS, MoneyTxType, toDayString } from "@/lib/money";
import RecordTransactionForm from "./RecordTransactionForm";
import BankAccountsPanel, { BankAccountRow } from "./BankAccountsPanel";

type BankSummary = {
  id: string;
  name: string;
  bankName: string | null;
  balance: number;
  dailyTarget: number | null;
  monthlyTarget: number | null;
  depositedToday: number;
  depositedThisMonth: number;
  dailyShortfall: number | null;
  monthlyShortfall: number | null;
  targetMet: boolean | null;
};

type Summary = {
  date: string;
  revenue: {
    total: number;
    cash: number;
    nonCash: number;
    byMethod: Record<string, number>;
  };
  today: {
    deposited: number;
    withdrawn: number;
    expenses: number;
    donations: number;
    otherIncome: number;
    supplierPaid: number;
    supplierPaidCash: number;
    unallocatedCash: number;
    totalDailyTarget: number;
    targetShortfall: number;
  };
  // null until the drawer has been counted once.
  cashInHand: number | null;
  cashTracking: {
    configured: boolean;
    startDate: string | null;
    openingFloat: number;
  };
  banks: BankSummary[];
  totalBankBalance: number;
  monthToDate: {
    revenue: number;
    deposited: number;
    expenses: number;
    donations: number;
  };
  spendingByCategory: { category: string; amount: number }[];
};

type Transaction = {
  id: string;
  type: MoneyTxType;
  amount: number;
  category: string | null;
  description: string | null;
  reference: string | null;
  occurredAt: string;
  bankAccount: { id: string; name: string; bankName: string | null } | null;
  createdByUser: { id: string; name: string | null } | null;
};

const money = (value: number) =>
  `Rs. ${value.toLocaleString("en-LK", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

// Money leaving the business shows in red, money arriving in green — the
// direction has to be readable without stopping to read the label.
const OUTFLOW_TYPES: MoneyTxType[] = ["EXPENSE", "DONATION"];

/**
 * Spells out where the money actually went. "Deposit / BOC Savings" leaves the
 * reader to work out which side the cash came off; "Cash → BOC Savings" does
 * not.
 */
function describeMovement(tx: Transaction): string {
  const bank = tx.bankAccount?.name || "Cash in hand";

  switch (tx.type) {
    case "DEPOSIT":
      return `Cash in hand → ${bank}`;
    case "WITHDRAWAL":
      return `${bank} → Cash in hand`;
    case "EXPENSE":
    case "DONATION":
      return `${bank} → out of the business`;
    case "OTHER_INCOME":
      return `In from outside → ${bank}`;
    default:
      return `Correction on ${bank}`;
  }
}

export default function MoneyClient() {
  const [date, setDate] = useState(() => toDayString(new Date()));

  const [summary, setSummary] = useState<Summary | null>(null);
  const [accounts, setAccounts] = useState<BankAccountRow[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Counting the drawer
  const [countOpen, setCountOpen] = useState(false);
  const [countedCash, setCountedCash] = useState("");
  const [countSaving, setCountSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [summaryRes, banksRes, txRes] = await Promise.all([
        fetch(`/api/money/reports?date=${date}`),
        fetch(`/api/money/banks?date=${date}&includeInactive=true`),
        fetch(`/api/money/transactions?date=${date}`),
      ]);

      const [summaryJson, banksJson, txJson] = await Promise.all([
        summaryRes.json(),
        banksRes.json(),
        txRes.json(),
      ]);

      if (!summaryRes.ok) throw new Error(summaryJson.error);
      if (!banksRes.ok) throw new Error(banksJson.error);
      if (!txRes.ok) throw new Error(txJson.error);

      setSummary(summaryJson.data);
      setAccounts(banksJson.data || []);
      setTransactions(txJson.data || []);
    } catch (err: any) {
      setError(err.message || "Failed to load the money summary.");
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    load();
  }, [load]);

  const activeBanks = useMemo(
    () => accounts.filter((account) => account.isActive),
    [accounts]
  );

  const saveCashCount = async () => {
    const counted = Number(countedCash);

    if (!Number.isFinite(counted) || counted < 0) {
      setError("Enter the cash you counted, or 0.");
      return;
    }

    setCountSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/money/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cashTrackingStartDate: date,
          openingCashFloat: counted,
        }),
      });

      const json = await res.json();

      if (!res.ok) throw new Error(json.error);

      setCountOpen(false);
      setCountedCash("");
      await load();
    } catch (err: any) {
      setError(err.message || "Failed to save the cash count.");
    } finally {
      setCountSaving(false);
    }
  };

  // One-tap banking: fills the day's remaining target for that account, so the
  // common case — "put the usual 20,000 in" — is a single click.
  const quickDeposit = async (bank: BankSummary, amount: number) => {
    if (amount <= 0) return;

    setBusyId(bank.id);
    setError(null);

    try {
      const now = new Date();
      const occurredAt = new Date(`${date}T00:00:00`);
      occurredAt.setHours(
        now.getHours(),
        now.getMinutes(),
        now.getSeconds(),
        0
      );

      const res = await fetch("/api/money/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "DEPOSIT",
          amount,
          bankAccountId: bank.id,
          description: "Daily savings",
          occurredAt: occurredAt.toISOString(),
        }),
      });

      const json = await res.json();

      if (!res.ok) throw new Error(json.error);

      await load();
    } catch (err: any) {
      setError(err.message || "Failed to record the deposit.");
    } finally {
      setBusyId(null);
    }
  };

  const deleteTransaction = async (id: string) => {
    if (
      !confirm(
        "Delete this entry? The balances will re-calculate without it."
      )
    ) {
      return;
    }

    setBusyId(id);
    setError(null);

    try {
      const res = await fetch(`/api/money/transactions/${id}`, {
        method: "DELETE",
      });

      const json = await res.json();

      if (!res.ok) throw new Error(json.error);

      await load();
    } catch (err: any) {
      setError(err.message || "Failed to delete the entry.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Day picker */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="date"
          value={date}
          onChange={(event) => setDate(event.target.value)}
          className="rounded-md border border-border bg-background px-3 py-2 text-sm"
        />
        <button
          onClick={() => setDate(toDayString(new Date()))}
          className="text-sm font-medium text-primary hover:underline"
        >
          Today
        </button>
        {loading && (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        )}
      </div>

      {error && (
        <div className="p-4 bg-destructive/15 text-destructive rounded-lg flex items-center gap-2 font-medium">
          <AlertCircle className="h-5 w-5" />
          {error}
        </div>
      )}

      {/* Counting the drawer — the starting point for cash in hand */}
      {summary && (!summary.cashTracking.configured || countOpen) && (
        <div className="rounded-xl border border-primary/40 bg-primary/5 p-4">
          <div className="font-semibold text-foreground flex items-center gap-2">
            <Wallet className="h-5 w-5 text-primary" />
            {summary.cashTracking.configured
              ? "Re-count the drawer"
              : "Start tracking cash in hand"}
          </div>

          <p className="mt-1 text-sm text-muted-foreground">
            Count what is physically in the drawer today and enter it below.
            Cash in hand is worked out from that figure onwards — sales before
            today are left out, because that money has already been spent or
            banked outside this system.
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input
              type="number"
              step="0.01"
              value={countedCash}
              onChange={(event) => setCountedCash(event.target.value)}
              placeholder="Cash counted today"
              className="rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
            <button
              onClick={saveCashCount}
              disabled={countSaving}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
            >
              {countSaving && (
                <Loader2 className="h-4 w-4 animate-spin" />
              )}
              Save count for {date}
            </button>
            {summary.cashTracking.configured && (
              <button
                onClick={() => setCountOpen(false)}
                className="text-sm font-medium text-muted-foreground hover:underline"
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      )}

      {summary && (
        <>
          {/* Headline figures */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <TrendingUp className="h-4 w-4" />
                Revenue this day
              </div>
              <div className="mt-2 text-2xl font-bold text-foreground">
                {money(summary.revenue.total)}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {money(summary.revenue.cash)} cash ·{" "}
                {money(summary.revenue.nonCash)} card / cheque / transfer
              </div>
            </div>

            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <PiggyBank className="h-4 w-4" />
                Banked this day
              </div>
              <div className="mt-2 text-2xl font-bold text-green-600 dark:text-green-500">
                {money(summary.today.deposited)}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {summary.today.totalDailyTarget > 0
                  ? `Target ${money(summary.today.totalDailyTarget)}${
                      summary.today.targetShortfall > 0
                        ? ` · ${money(
                            summary.today.targetShortfall
                          )} short`
                        : " · met"
                    }`
                  : "No savings target set"}
              </div>
            </div>

            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <Wallet className="h-4 w-4" />
                Cash in hand
              </div>

              {summary.cashInHand === null ? (
                <>
                  <div className="mt-2 text-2xl font-bold text-muted-foreground">
                    —
                  </div>
                  <button
                    onClick={() => setCountOpen(true)}
                    className="mt-1 text-xs font-medium text-primary hover:underline"
                  >
                    Count the drawer to start tracking
                  </button>
                </>
              ) : (
                <>
                  <div
                    className={`mt-2 text-2xl font-bold ${
                      summary.cashInHand < 0
                        ? "text-destructive"
                        : "text-foreground"
                    }`}
                  >
                    {money(summary.cashInHand)}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    Counted {summary.cashTracking.startDate}, plus cash sales
                    since, less banking and cash spending
                  </div>
                </>
              )}
            </div>

            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <ArrowUpRight className="h-4 w-4" />
                Out this day
              </div>
              <div className="mt-2 text-2xl font-bold text-destructive">
                {money(
                  summary.today.expenses + summary.today.donations
                )}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {money(summary.today.expenses)} expenses ·{" "}
                {money(summary.today.donations)} donations
              </div>
              {summary.today.supplierPaidCash > 0 && (
                <div className="mt-1 text-xs text-muted-foreground">
                  Plus {money(summary.today.supplierPaidCash)} cash paid to
                  suppliers, recorded on purchase orders
                </div>
              )}
            </div>
          </div>

          {/* Still to put away */}
          {summary.today.unallocatedCash > 0 &&
            activeBanks.length > 0 && (
              <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4">
                <div className="flex items-center gap-2 font-semibold text-amber-700 dark:text-amber-500">
                  <AlertCircle className="h-5 w-5" />
                  {money(summary.today.unallocatedCash)} of this day&apos;s
                  cash is not yet banked or spent
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {summary.banks.map((bank) => {
                    // Offer the rest of the day's target, but never more cash
                    // than is actually left to bank — otherwise one tap can
                    // drive cash in hand negative.
                    const target =
                      bank.dailyShortfall && bank.dailyShortfall > 0
                        ? bank.dailyShortfall
                        : summary.today.unallocatedCash;

                    const suggested = Math.min(
                      target,
                      summary.today.unallocatedCash
                    );

                    if (suggested <= 0) return null;

                    return (
                      <button
                        key={bank.id}
                        onClick={() => quickDeposit(bank, suggested)}
                        disabled={busyId === bank.id}
                        className="inline-flex items-center gap-2 rounded-md bg-card border border-border px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-60"
                      >
                        {busyId === bank.id && (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        )}
                        Bank {money(suggested)} to {bank.name}
                      </button>
                    );
                  })}
                </div>

                <p className="mt-2 text-xs text-amber-700/80 dark:text-amber-500/80">
                  Or use the form below for a different amount.
                </p>
              </div>
            )}

          {/* Per-bank progress */}
          {summary.banks.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {summary.banks.map((bank) => {
                const progress =
                  bank.dailyTarget && bank.dailyTarget > 0
                    ? Math.min(
                        (bank.depositedToday / bank.dailyTarget) * 100,
                        100
                      )
                    : null;

                return (
                  <div
                    key={bank.id}
                    className="rounded-xl border border-border bg-card p-4"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-semibold text-foreground flex items-center gap-2">
                          <Landmark className="h-4 w-4 text-primary" />
                          {bank.name}
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {bank.bankName || "—"}
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="text-lg font-bold text-foreground">
                          {money(bank.balance)}
                        </div>
                        <div className="text-[10px] text-muted-foreground uppercase tracking-wide">
                          balance
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 text-sm text-foreground">
                      {money(bank.depositedToday)} banked this day
                      {bank.dailyTarget !== null && (
                        <span className="text-muted-foreground">
                          {" "}
                          of {money(bank.dailyTarget)}
                        </span>
                      )}
                    </div>

                    {progress !== null && (
                      <div className="mt-2 h-2 w-full rounded-full bg-muted overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            bank.targetMet
                              ? "bg-green-500"
                              : "bg-amber-500"
                          }`}
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                    )}

                    <div className="mt-3 text-xs text-muted-foreground">
                      {money(bank.depositedThisMonth)} this month
                      {bank.monthlyTarget !== null &&
                        ` of ${money(bank.monthlyTarget)}`}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <RecordTransactionForm
              banks={activeBanks}
              date={date}
              cashInHand={summary.cashInHand}
              onSaved={load}
            />

            {/* Month to date */}
            <div className="rounded-xl border border-border bg-card p-4">
              <h3 className="font-semibold text-foreground flex items-center gap-2">
                <HeartHandshake className="h-4 w-4 text-primary" />
                Month to date
              </h3>

              <dl className="mt-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Revenue</dt>
                  <dd className="font-semibold text-foreground">
                    {money(summary.monthToDate.revenue)}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Banked</dt>
                  <dd className="font-semibold text-green-600 dark:text-green-500">
                    {money(summary.monthToDate.deposited)}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Expenses</dt>
                  <dd className="font-semibold text-destructive">
                    {money(summary.monthToDate.expenses)}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Donations</dt>
                  <dd className="font-semibold text-destructive">
                    {money(summary.monthToDate.donations)}
                  </dd>
                </div>
                <div className="flex justify-between border-t border-border pt-2">
                  <dt className="text-muted-foreground">
                    Total in all banks
                  </dt>
                  <dd className="font-bold text-foreground">
                    {money(summary.totalBankBalance)}
                  </dd>
                </div>
              </dl>

              {summary.spendingByCategory.length > 0 && (
                <div className="mt-4 border-t border-border pt-3">
                  <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Where it went this month
                  </div>
                  <ul className="mt-2 space-y-1 text-sm">
                    {summary.spendingByCategory
                      .slice(0, 6)
                      .map((row) => (
                        <li
                          key={row.category}
                          className="flex justify-between"
                        >
                          <span className="text-foreground">
                            {row.category}
                          </span>
                          <span className="text-muted-foreground">
                            {money(row.amount)}
                          </span>
                        </li>
                      ))}
                  </ul>
                </div>
              )}
            </div>
          </div>

          {/* Ledger for the day */}
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="p-4 border-b border-border">
              <h3 className="font-semibold text-foreground">
                Entries on {summary.date}
              </h3>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-muted/50 text-muted-foreground border-b border-border">
                  <tr>
                    <th className="px-4 py-3 font-medium">Time</th>
                    <th className="px-4 py-3 font-medium">Movement</th>
                    <th className="px-4 py-3 font-medium">
                      Where it moved
                    </th>
                    <th className="px-4 py-3 font-medium">Details</th>
                    <th className="px-4 py-3 font-medium text-right">
                      Amount
                    </th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {transactions.length === 0 ? (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-4 py-8 text-center text-muted-foreground"
                      >
                        Nothing recorded for this day yet.
                      </td>
                    </tr>
                  ) : (
                    transactions.map((tx) => (
                      <tr
                        key={tx.id}
                        className="hover:bg-muted/20 transition-colors"
                      >
                        <td className="px-4 py-3 text-xs whitespace-nowrap text-muted-foreground">
                          {new Date(tx.occurredAt).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </td>
                        <td className="px-4 py-3 font-medium text-foreground">
                          {MONEY_TX_LABELS[tx.type]}
                        </td>
                        <td className="px-4 py-3 text-foreground whitespace-nowrap">
                          {describeMovement(tx)}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {[tx.category, tx.description, tx.reference]
                            .filter(Boolean)
                            .join(" · ") || "—"}
                        </td>
                        <td
                          className={`px-4 py-3 text-right font-bold whitespace-nowrap ${
                            OUTFLOW_TYPES.includes(tx.type)
                              ? "text-destructive"
                              : "text-foreground"
                          }`}
                        >
                          {OUTFLOW_TYPES.includes(tx.type) ? "− " : ""}
                          {money(tx.amount)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => deleteTransaction(tx.id)}
                            disabled={busyId === tx.id}
                            className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-destructive disabled:opacity-60"
                            title="Delete entry"
                          >
                            {busyId === tx.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <BankAccountsPanel accounts={accounts} onChanged={load} />
        </>
      )}
    </div>
  );
}
