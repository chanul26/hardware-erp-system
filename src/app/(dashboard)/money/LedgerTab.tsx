"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Search, Trash2, X } from "lucide-react";
import {
  MONEY_TX_LABELS,
  MONEY_TX_TYPES,
  MoneyTxType,
  startOfMonth,
  toDayString,
} from "@/lib/money";

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

const OUTFLOW_TYPES: MoneyTxType[] = ["EXPENSE", "DONATION"];

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

/**
 * Finding an entry used to mean stepping through the calendar one day at a
 * time. The range, type filter and free-text search are all things the API
 * already accepted — they were simply never put on screen.
 */
export default function LedgerTab({
  date,
  onChanged,
}: {
  date: string;
  onChanged: () => void;
}) {
  const [search, setSearch] = useState("");
  const [type, setType] = useState<"" | MoneyTxType>("");
  const [from, setFrom] = useState(date);
  const [to, setTo] = useState(date);

  const [rows, setRows] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Following the day picker keeps the two views in step: change the day up
  // top, and the ledger is already showing it.
  useEffect(() => {
    setFrom(date);
    setTo(date);
  }, [date]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set("search", search.trim());
      if (type) params.set("type", type);
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      params.set("take", "300");

      const res = await fetch(`/api/money/transactions?${params}`);
      const json = await res.json();

      if (!res.ok) throw new Error(json.error);

      setRows(json.data || []);
    } catch (err: any) {
      setError(err.message || "Failed to load entries.");
    } finally {
      setLoading(false);
    }
  }, [search, type, from, to]);

  // Debounced so typing in the search box does not fire a request per key.
  useEffect(() => {
    const timer = setTimeout(load, 250);
    return () => clearTimeout(timer);
  }, [load]);

  const remove = async (id: string) => {
    if (!confirm("Delete this entry? Balances will re-calculate without it.")) {
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
      onChanged();
    } catch (err: any) {
      setError(err.message || "Failed to delete the entry.");
    } finally {
      setBusyId(null);
    }
  };

  const setRange = (nextFrom: string, nextTo: string) => {
    setFrom(nextFrom);
    setTo(nextTo);
  };

  const today = new Date();

  // Banking cash and drawing it back out only move money between the till and
  // the bank — the business is no richer for it. Counting them would make a
  // day of shuffling money look like a day of earning it, so the net covers
  // real inflows and outflows only, and transfers are reported beside it.
  const TRANSFER_TYPES: MoneyTxType[] = ["DEPOSIT", "WITHDRAWAL"];

  const net = rows
    .filter((row) => !TRANSFER_TYPES.includes(row.type))
    .reduce(
      (sum, row) =>
        sum + (OUTFLOW_TYPES.includes(row.type) ? -row.amount : row.amount),
      0
    );

  const transferred = rows
    .filter((row) => row.type === "DEPOSIT")
    .reduce((sum, row) => sum + row.amount, 0);

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search note, category or reference…"
              className="w-full rounded-md border border-border bg-background py-2 pl-9 pr-8 text-sm"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-muted"
                aria-label="Clear search"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <select
            value={type}
            onChange={(event) =>
              setType(event.target.value as "" | MoneyTxType)
            }
            className="rounded-md border border-border bg-background px-3 py-2 text-sm"
          >
            <option value="">All movements</option>
            {MONEY_TX_TYPES.map((value) => (
              <option key={value} value={value}>
                {MONEY_TX_LABELS[value]}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-sm">
          <input
            type="date"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
            className="rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
          <span className="text-muted-foreground">to</span>
          <input
            type="date"
            value={to}
            onChange={(event) => setTo(event.target.value)}
            className="rounded-md border border-border bg-background px-3 py-2 text-sm"
          />

          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setRange(date, date)}
              className="rounded-full border border-border px-3 py-1 text-xs font-medium text-muted-foreground hover:bg-muted"
            >
              Selected day
            </button>
            <button
              onClick={() =>
                setRange(toDayString(startOfMonth(today)), toDayString(today))
              }
              className="rounded-full border border-border px-3 py-1 text-xs font-medium text-muted-foreground hover:bg-muted"
            >
              This month
            </button>
            <button
              onClick={() => {
                const start = new Date();
                start.setDate(start.getDate() - 29);
                setRange(toDayString(start), toDayString(today));
              }}
              className="rounded-full border border-border px-3 py-1 text-xs font-medium text-muted-foreground hover:bg-muted"
            >
              Last 30 days
            </button>
          </div>

          {loading && (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-destructive/15 p-3 text-sm font-medium text-destructive">
          {error}
        </div>
      )}

      {/* Results */}
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border p-4">
          <h3 className="font-semibold text-foreground">
            {rows.length} {rows.length === 1 ? "entry" : "entries"}
          </h3>
          <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
            {transferred > 0 && (
              <span>
                Banked{" "}
                <span className="font-bold text-foreground">
                  {money(transferred)}
                </span>
              </span>
            )}
            <span>
              Net, excluding transfers{" "}
              <span
                className={`font-bold ${
                  net < 0 ? "text-destructive" : "text-foreground"
                }`}
              >
                {money(net)}
              </span>
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border bg-muted/50 text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Movement</th>
                <th className="px-4 py-3 font-medium">Where it moved</th>
                <th className="px-4 py-3 font-medium">Details</th>
                <th className="px-4 py-3 text-right font-medium">Amount</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-8 text-center text-muted-foreground"
                  >
                    {search || type
                      ? "Nothing matches those filters."
                      : "Nothing recorded in this range."}
                  </td>
                </tr>
              ) : (
                rows.map((tx) => (
                  <tr key={tx.id} className="transition-colors hover:bg-muted/20">
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                      {new Date(tx.occurredAt).toLocaleDateString()}
                      <span className="ml-1 opacity-70">
                        {new Date(tx.occurredAt).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-medium text-foreground">
                      {MONEY_TX_LABELS[tx.type]}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-foreground">
                      {describeMovement(tx)}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {[tx.category, tx.description, tx.reference]
                        .filter(Boolean)
                        .join(" · ") || "—"}
                    </td>
                    <td
                      className={`whitespace-nowrap px-4 py-3 text-right font-bold ${
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
                        onClick={() => remove(tx.id)}
                        disabled={busyId === tx.id}
                        className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-destructive disabled:opacity-60"
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
    </div>
  );
}
