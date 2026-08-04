"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Wallet,
  Landmark,
  TrendingUp,
  ArrowUpRight,
  Loader2,
  AlertCircle,
  PiggyBank,
  ChevronLeft,
  ChevronRight,
  Scale,
  HeartHandshake,
  Receipt,
  Plus,
  CheckCircle2,
} from "lucide-react";
import { MoneyTxType, toDayString } from "@/lib/money";
import QuickEntryDialog from "./QuickEntryDialog";
import CashCountDialog from "./CashCountDialog";
import LedgerTab from "./LedgerTab";
import BankAccountsPanel, { BankAccountRow } from "./BankAccountsPanel";

type BankSummary = {
  id: string;
  name: string;
  bankName: string | null;
  isActive: boolean;
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
    supplierPaidFromDrawer: number;
    unallocatedCash: number;
    totalDailyTarget: number;
    targetShortfall: number;
  };
  cashInHand: number | null;
  cashTracking: {
    configured: boolean;
    startDate: string | null;
    openingFloat: number;
  };
  cashCount: {
    countedAmount: number;
    expectedAmount: number;
    variance: number;
    reason: string | null;
    countedBy: string | null;
  } | null;
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

const money = (value: number) =>
  `Rs. ${value.toLocaleString("en-LK", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

// Compact form for the headline tiles, where the cents add noise.
const short = (value: number) =>
  `Rs. ${Math.round(value).toLocaleString("en-LK")}`;

const shiftDay = (day: string, delta: number) => {
  const parts = day.split("-").map(Number);
  const date = new Date(parts[0], parts[1] - 1, parts[2]);
  date.setDate(date.getDate() + delta);
  return toDayString(date);
};

const prettyDay = (day: string) => {
  const parts = day.split("-").map(Number);
  const date = new Date(parts[0], parts[1] - 1, parts[2]);
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
};

type Tab = "overview" | "ledger" | "setup";

export default function MoneyClient() {
  const [date, setDate] = useState(() => toDayString(new Date()));
  const [tab, setTab] = useState<Tab>("overview");

  const [summary, setSummary] = useState<Summary | null>(null);
  const [accounts, setAccounts] = useState<BankAccountRow[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Dialogs
  const [entryType, setEntryType] = useState<MoneyTxType | null>(null);
  const [countOpen, setCountOpen] = useState(false);

  // First-run float
  const [countedCash, setCountedCash] = useState("");
  const [countSaving, setCountSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [summaryRes, banksRes] = await Promise.all([
        fetch(`/api/money/reports?date=${date}`),
        fetch(`/api/money/banks?date=${date}&includeInactive=true`),
      ]);

      const [summaryJson, banksJson] = await Promise.all([
        summaryRes.json(),
        banksRes.json(),
      ]);

      if (!summaryRes.ok) throw new Error(summaryJson.error);
      if (!banksRes.ok) throw new Error(banksJson.error);

      setSummary(summaryJson.data);
      setAccounts(banksJson.data || []);
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

  // Carries each account's remaining daily target into the dialog, so banking
  // opens pre-filled with the usual amount.
  const bankOptions = useMemo(
    () =>
      activeBanks.map((account) => ({
        id: account.id,
        name: account.name,
        bankName: account.bankName,
        dailyShortfall:
          summary?.banks.find((bank) => bank.id === account.id)
            ?.dailyShortfall ?? null,
      })),
    [activeBanks, summary]
  );

  const saveFloat = async () => {
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

      setCountedCash("");
      await load();
    } catch (err: any) {
      setError(err.message || "Failed to save the cash count.");
    } finally {
      setCountSaving(false);
    }
  };

  const quickDeposit = async (bank: BankSummary, amount: number) => {
    if (amount <= 0) return;

    setBusyId(bank.id);
    setError(null);

    try {
      const res = await fetch("/api/money/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "DEPOSIT",
          amount,
          bankAccountId: bank.id,
          description: "Daily savings",
          date,
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

  const isToday = date === toDayString(new Date());

  return (
    <div className="space-y-5">
      {/* ── Day navigation ── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center rounded-md border border-border bg-card">
          <button
            onClick={() => setDate(shiftDay(date, -1))}
            className="rounded-l-md px-2 py-2 text-muted-foreground hover:bg-muted"
            aria-label="Previous day"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>

          <span className="min-w-[150px] px-3 text-center text-sm font-semibold text-foreground">
            {prettyDay(date)}
          </span>

          <button
            onClick={() => setDate(shiftDay(date, 1))}
            className="rounded-r-md px-2 py-2 text-muted-foreground hover:bg-muted"
            aria-label="Next day"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <input
          type="date"
          value={date}
          onChange={(event) => setDate(event.target.value)}
          className="rounded-md border border-border bg-background px-3 py-2 text-sm"
        />

        {!isToday && (
          <button
            onClick={() => setDate(toDayString(new Date()))}
            className="rounded-md border border-border px-3 py-2 text-sm font-medium text-primary hover:bg-muted"
          >
            Today
          </button>
        )}

        {loading && (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        )}
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-destructive/15 p-4 font-medium text-destructive">
          <AlertCircle className="h-5 w-5" />
          {error}
        </div>
      )}

      {/* ── First run: set the opening float ── */}
      {summary && !summary.cashTracking.configured && (
        <div className="rounded-xl border border-primary/40 bg-primary/5 p-4">
          <div className="flex items-center gap-2 font-semibold text-foreground">
            <Wallet className="h-5 w-5 text-primary" />
            Start tracking cash in hand
          </div>

          <p className="mt-1 text-sm text-muted-foreground">
            Count what is in the drawer today and enter it once. After this you
            never type the drawer value again — you only check it.
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
              onClick={saveFloat}
              disabled={countSaving}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
            >
              {countSaving && <Loader2 className="h-4 w-4 animate-spin" />}
              Start from {date}
            </button>
          </div>
        </div>
      )}

      {summary && (
        <>
          {/* ── Headline figures ── */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div className="rounded-xl border border-border bg-card p-3">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <TrendingUp className="h-3.5 w-3.5" />
                Revenue
              </div>
              <div className="mt-1 text-xl font-bold text-foreground">
                {short(summary.revenue.total)}
              </div>
              <div className="mt-0.5 text-[11px] text-muted-foreground">
                {short(summary.revenue.cash)} cash
              </div>
            </div>

            <div className="rounded-xl border border-border bg-card p-3">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <PiggyBank className="h-3.5 w-3.5" />
                Banked
              </div>
              <div className="mt-1 text-xl font-bold text-green-600 dark:text-green-500">
                {short(summary.today.deposited)}
              </div>
              <div className="mt-0.5 text-[11px] text-muted-foreground">
                {summary.today.totalDailyTarget > 0
                  ? summary.today.targetShortfall > 0
                    ? `${short(summary.today.targetShortfall)} to go`
                    : "target met"
                  : "no target set"}
              </div>
            </div>

            <div className="rounded-xl border border-border bg-card p-3">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Wallet className="h-3.5 w-3.5" />
                Cash in hand
              </div>
              <div
                className={`mt-1 text-xl font-bold ${
                  summary.cashInHand === null
                    ? "text-muted-foreground"
                    : summary.cashInHand < 0
                    ? "text-destructive"
                    : "text-foreground"
                }`}
              >
                {summary.cashInHand === null
                  ? "—"
                  : short(summary.cashInHand)}
              </div>
              <div className="mt-0.5 text-[11px] text-muted-foreground">
                {summary.cashInHand === null
                  ? summary.cashTracking.configured
                    ? "not tracked this day"
                    : "not started"
                  : summary.cashCount
                  ? "counted"
                  : "not counted yet"}
              </div>
            </div>

            <div className="rounded-xl border border-border bg-card p-3">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <ArrowUpRight className="h-3.5 w-3.5" />
                Out
              </div>
              <div className="mt-1 text-xl font-bold text-destructive">
                {short(summary.today.expenses + summary.today.donations)}
              </div>
              <div className="mt-0.5 text-[11px] text-muted-foreground">
                {short(summary.today.donations)} donations
              </div>
            </div>
          </div>

          {/* ── The day's jobs, one tap each ── */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setEntryType("DEPOSIT")}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
            >
              <PiggyBank className="h-4 w-4" />
              Bank cash
            </button>

            <button
              onClick={() => setEntryType("EXPENSE")}
              className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-4 py-2.5 text-sm font-semibold text-foreground hover:bg-muted"
            >
              <Receipt className="h-4 w-4" />
              Expense
            </button>

            <button
              onClick={() => setEntryType("DONATION")}
              className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-4 py-2.5 text-sm font-semibold text-foreground hover:bg-muted"
            >
              <HeartHandshake className="h-4 w-4" />
              Donation
            </button>

            {summary.cashInHand !== null && (
              <button
                onClick={() => setCountOpen(true)}
                className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-4 py-2.5 text-sm font-semibold text-foreground hover:bg-muted"
              >
                <Scale className="h-4 w-4" />
                Count drawer
              </button>
            )}

            <button
              onClick={() => setEntryType("WITHDRAWAL")}
              className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-4 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted"
            >
              <Plus className="h-4 w-4" />
              Other
            </button>
          </div>

          {/* ── Tabs ── */}
          <div className="flex gap-1 border-b border-border">
            {(
              [
                ["overview", "Overview"],
                ["ledger", "Ledger"],
                ["setup", "Setup"],
              ] as [Tab, string][]
            ).map(([value, label]) => (
              <button
                key={value}
                onClick={() => setTab(value)}
                className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
                  tab === value
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === "overview" && (
            <div className="space-y-5">
              {/* Still to put away */}
              {summary.today.unallocatedCash > 0 &&
                summary.cashInHand !== null &&
                activeBanks.length > 0 && (
                  <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4">
                    <div className="flex items-center gap-2 font-semibold text-amber-700 dark:text-amber-500">
                      <AlertCircle className="h-5 w-5" />
                      {money(
                        Math.min(
                          summary.today.unallocatedCash,
                          summary.cashInHand
                        )
                      )}{" "}
                      of this day&apos;s cash is not yet banked or spent
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      {summary.banks
                        .filter((bank) => bank.isActive)
                        .map((bank) => {
                          const target =
                            bank.dailyShortfall && bank.dailyShortfall > 0
                              ? bank.dailyShortfall
                              : summary.today.unallocatedCash;

                          const ceilings = [
                            target,
                            summary.today.unallocatedCash,
                          ];

                          if (summary.cashInHand !== null) {
                            ceilings.push(summary.cashInHand);
                          }

                          const suggested = Math.min(...ceilings);

                          if (suggested <= 0) return null;

                          return (
                            <button
                              key={bank.id}
                              onClick={() => quickDeposit(bank, suggested)}
                              disabled={busyId === bank.id}
                              className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-60"
                            >
                              {busyId === bank.id && (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              )}
                              Bank {money(suggested)} to {bank.name}
                            </button>
                          );
                        })}
                    </div>
                  </div>
                )}

              {/* A negative drawer is arithmetically possible but physically
                  impossible, so it always means an input is wrong. Showing the
                  working is the only way the owner can tell which one. */}
              {summary.cashInHand !== null && summary.cashInHand < 0 && (
                <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4">
                  <div className="flex items-center gap-2 font-semibold text-destructive">
                    <AlertCircle className="h-5 w-5" />
                    Cash in hand is negative — {money(summary.cashInHand)}
                  </div>

                  <p className="mt-1 text-sm text-muted-foreground">
                    A drawer cannot hold less than nothing, so something going
                    in is not being counted. Here is how the figure is built:
                  </p>

                  <dl className="mt-3 space-y-1 text-sm">
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">
                        Counted float on {summary.cashTracking.startDate}
                      </dt>
                      <dd className="text-foreground">
                        {money(summary.cashTracking.openingFloat)}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">
                        Cash sales since
                      </dt>
                      <dd className="text-green-600 dark:text-green-500">
                        + {money(summary.revenue.cash)}
                      </dd>
                    </div>
                    {summary.today.supplierPaidFromDrawer > 0 && (
                      <div className="flex justify-between">
                        <dt className="text-muted-foreground">
                          Paid to suppliers from the drawer
                        </dt>
                        <dd className="text-destructive">
                          − {money(summary.today.supplierPaidFromDrawer)}
                        </dd>
                      </div>
                    )}
                    {summary.today.deposited > 0 && (
                      <div className="flex justify-between">
                        <dt className="text-muted-foreground">Banked</dt>
                        <dd className="text-destructive">
                          − {money(summary.today.deposited)}
                        </dd>
                      </div>
                    )}
                  </dl>

                  <p className="mt-3 text-sm text-muted-foreground">
                    {summary.today.supplierPaidFromDrawer >
                    summary.revenue.cash +
                      summary.cashTracking.openingFloat ? (
                      <>
                        The supplier payments marked as taken from the drawer
                        are larger than the float plus the day&apos;s cash
                        sales. If any of those were really paid from a wallet
                        or by bank transfer, untick &ldquo;paid from the shop
                        drawer&rdquo; on the purchase order.
                      </>
                    ) : (
                      <>
                        Check for cash sales recorded under another method, or
                        count the drawer to reset the figure to what is really
                        there.
                      </>
                    )}
                  </p>
                </div>
              )}

              {/* Drawer status */}
              {summary.cashCount && (
                <div
                  className={`flex flex-wrap items-center gap-2 rounded-xl p-3 text-sm ${
                    summary.cashCount.variance === 0
                      ? "bg-green-500/10 text-green-700 dark:text-green-500"
                      : "bg-amber-500/10 text-amber-700 dark:text-amber-500"
                  }`}
                >
                  {summary.cashCount.variance === 0 ? (
                    <CheckCircle2 className="h-4 w-4" />
                  ) : (
                    <AlertCircle className="h-4 w-4" />
                  )}
                  <span className="font-semibold">
                    {summary.cashCount.variance === 0
                      ? "Drawer counted and balanced"
                      : `Drawer ${
                          summary.cashCount.variance < 0 ? "short" : "over"
                        } by ${money(Math.abs(summary.cashCount.variance))}`}
                  </span>
                  <span className="text-muted-foreground">
                    expected {money(summary.cashCount.expectedAmount)}, counted{" "}
                    {money(summary.cashCount.countedAmount)}
                    {summary.cashCount.reason
                      ? ` — ${summary.cashCount.reason}`
                      : ""}
                  </span>
                </div>
              )}

              {/* Banks */}
              {summary.banks.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border p-6 text-center">
                  <p className="text-sm text-muted-foreground">
                    No bank accounts yet.
                  </p>
                  <button
                    onClick={() => setTab("setup")}
                    className="mt-2 text-sm font-semibold text-primary hover:underline"
                  >
                    Add one under Setup
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
                            <div className="flex items-center gap-2 font-semibold text-foreground">
                              <Landmark className="h-4 w-4 text-primary" />
                              {bank.name}
                              {!bank.isActive && (
                                <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
                                  CLOSED
                                </span>
                              )}
                            </div>
                            <div className="mt-0.5 text-xs text-muted-foreground">
                              {bank.bankName || "—"}
                            </div>
                          </div>

                          <div className="text-right">
                            <div className="text-lg font-bold text-foreground">
                              {money(bank.balance)}
                            </div>
                            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                              balance
                            </div>
                          </div>
                        </div>

                        <div className="mt-4 text-sm text-foreground">
                          {money(bank.depositedToday)} banked
                          {bank.dailyTarget !== null && (
                            <span className="text-muted-foreground">
                              {" "}
                              of {money(bank.dailyTarget)}
                            </span>
                          )}
                        </div>

                        {progress !== null && (
                          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
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

              {/* Month to date */}
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div className="rounded-xl border border-border bg-card p-4">
                  <h3 className="font-semibold text-foreground">
                    Month to date
                  </h3>

                  <dl className="mt-3 space-y-2 text-sm">
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
                </div>

                <div className="rounded-xl border border-border bg-card p-4">
                  <h3 className="font-semibold text-foreground">
                    Where it went this month
                  </h3>

                  {summary.spendingByCategory.length === 0 ? (
                    <p className="mt-3 text-sm text-muted-foreground">
                      Nothing spent yet this month.
                    </p>
                  ) : (
                    <ul className="mt-3 space-y-2 text-sm">
                      {summary.spendingByCategory.slice(0, 7).map((row) => {
                        const top = summary.spendingByCategory[0].amount || 1;

                        return (
                          <li key={row.category}>
                            <div className="flex justify-between">
                              <span className="text-foreground">
                                {row.category}
                              </span>
                              <span className="text-muted-foreground">
                                {money(row.amount)}
                              </span>
                            </div>
                            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                              <div
                                className="h-full rounded-full bg-primary/60"
                                style={{
                                  width: `${(row.amount / top) * 100}%`,
                                }}
                              />
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </div>

              {summary.today.supplierPaid > 0 && (
                <p className="text-xs text-muted-foreground">
                  {money(summary.today.supplierPaid)} was paid to suppliers this
                  day on purchase orders
                  {summary.today.supplierPaidFromDrawer > 0
                    ? `, of which ${money(
                        summary.today.supplierPaidFromDrawer
                      )} came out of the drawer and is already deducted from cash in hand.`
                    : ". None of it was marked as coming from the drawer, so cash in hand is untouched."}
                </p>
              )}
            </div>
          )}

          {tab === "ledger" && <LedgerTab date={date} onChanged={load} />}

          {tab === "setup" && (
            <div className="space-y-5">
              <BankAccountsPanel accounts={accounts} onChanged={load} />

              {summary.cashTracking.configured && (
                <div className="rounded-xl border border-border bg-card p-4">
                  <h3 className="font-semibold text-foreground">
                    Cash tracking
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Started {summary.cashTracking.startDate} from a counted
                    float of {money(summary.cashTracking.openingFloat)}. Cash
                    sales before that date are excluded, because that money was
                    banked or spent outside this system.
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    To correct a drifted drawer, use{" "}
                    <span className="font-medium text-foreground">
                      Count drawer
                    </span>{" "}
                    rather than changing the float — a count records the
                    difference instead of hiding it.
                  </p>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {entryType && summary && (
        <QuickEntryDialog
          initialType={entryType}
          banks={bankOptions}
          date={date}
          cashInHand={summary.cashInHand}
          onClose={() => setEntryType(null)}
          onSaved={load}
        />
      )}

      {countOpen && summary?.cashInHand !== null && summary && (
        <CashCountDialog
          date={date}
          expected={summary.cashInHand as number}
          todaysCount={summary.cashCount}
          onClose={() => setCountOpen(false)}
          onCounted={load}
        />
      )}
    </div>
  );
}
