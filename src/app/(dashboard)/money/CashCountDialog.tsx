"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, X, CheckCircle2, AlertTriangle } from "lucide-react";

type CashCount = {
  id: string;
  countedFor: string;
  expectedAmount: number;
  countedAmount: number;
  variance: number;
  reason: string | null;
};

type TodaysCount = {
  countedAmount: number;
  expectedAmount: number;
  variance: number;
  reason: string | null;
  countedBy: string | null;
} | null;

const money = (value: number) =>
  `Rs. ${value.toLocaleString("en-LK", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

/**
 * The drawer check.
 *
 * The system already knows what should be there; this is where the owner says
 * what actually is. The gap is the point — it is recorded and booked as a
 * visible correction rather than quietly absorbed.
 */
export default function CashCountDialog({
  date,
  expected,
  todaysCount,
  onClose,
  onCounted,
}: {
  date: string;
  expected: number;
  todaysCount: TodaysCount;
  onClose: () => void;
  onCounted: () => void;
}) {
  const [counted, setCounted] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<CashCount[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (!showHistory) return;

    fetch("/api/money/cash-counts?take=30")
      .then((res) => res.json())
      .then((json) => setHistory(json.data || []))
      .catch(() => setError("Failed to load past counts."));
  }, [showHistory]);

  const variance =
    counted !== "" && Number.isFinite(Number(counted))
      ? Math.round((Number(counted) - expected) * 100) / 100
      : null;

  const save = async (event?: React.FormEvent) => {
    event?.preventDefault();

    if (counted === "") {
      setError("Enter the cash you counted.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/money/cash-counts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date,
          countedAmount: Number(counted),
          reason,
        }),
      });

      const json = await res.json();

      if (!res.ok) throw new Error(json.error);

      onCounted();
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to save the count.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:items-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-xl border border-border bg-card shadow-lg"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border p-4">
          <h3 className="font-semibold text-foreground">
            Count the drawer — {date}
          </h3>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={save} className="space-y-4 p-4">
          <div className="rounded-lg bg-muted/50 p-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                The system expects
              </span>
              <span className="text-lg font-bold text-foreground">
                {money(expected)}
              </span>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Cash you counted
            </label>
            <input
              ref={inputRef}
              type="number"
              step="0.01"
              value={counted}
              onChange={(event) => setCounted(event.target.value)}
              placeholder="0.00"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-lg font-semibold"
            />
          </div>

          {variance !== null && (
            <div
              className={`rounded-lg p-3 text-sm font-semibold ${
                variance === 0
                  ? "bg-green-500/10 text-green-700 dark:text-green-500"
                  : "bg-amber-500/10 text-amber-700 dark:text-amber-500"
              }`}
            >
              {variance === 0
                ? "Balances exactly."
                : variance < 0
                ? `Short by ${money(Math.abs(variance))}.`
                : `Over by ${money(variance)}.`}
            </div>
          )}

          {variance !== null && variance !== 0 && (
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Why, if you know
              </label>
              <input
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Wrong change, unrecorded spend…"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
            </div>
          )}

          {todaysCount && (
            <div className="flex items-start gap-2 rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
              {todaysCount.variance === 0 ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
              ) : (
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              )}
              <span>
                Already counted for this day: {money(todaysCount.countedAmount)}{" "}
                against {money(todaysCount.expectedAmount)} expected
                {todaysCount.variance !== 0 &&
                  ` (${todaysCount.variance < 0 ? "short" : "over"} ${money(
                    Math.abs(todaysCount.variance)
                  )})`}
                . Saving again replaces it.
              </span>
            </div>
          )}

          {error && (
            <p className="text-sm font-medium text-destructive">{error}</p>
          )}

          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {todaysCount ? "Replace count" : "Save count"}
            </button>
            <button
              type="button"
              onClick={() => setShowHistory((open) => !open)}
              className="rounded-md border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted"
            >
              {showHistory ? "Hide history" : "History"}
            </button>
          </div>

          {showHistory && (
            <div className="max-h-60 overflow-y-auto border-t border-border pt-3">
              <table className="w-full text-left text-sm">
                <thead className="text-xs text-muted-foreground">
                  <tr>
                    <th className="py-1 font-medium">Day</th>
                    <th className="py-1 text-right font-medium">Expected</th>
                    <th className="py-1 text-right font-medium">Counted</th>
                    <th className="py-1 text-right font-medium">Diff</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {history.length === 0 ? (
                    <tr>
                      <td
                        colSpan={4}
                        className="py-3 text-center text-muted-foreground"
                      >
                        No counts yet.
                      </td>
                    </tr>
                  ) : (
                    history.map((count) => (
                      <tr key={count.id}>
                        <td className="py-1.5 whitespace-nowrap text-foreground">
                          {count.countedFor}
                        </td>
                        <td className="py-1.5 text-right text-muted-foreground">
                          {money(count.expectedAmount)}
                        </td>
                        <td className="py-1.5 text-right text-foreground">
                          {money(count.countedAmount)}
                        </td>
                        <td
                          className={`py-1.5 text-right font-semibold ${
                            count.variance === 0
                              ? "text-green-600 dark:text-green-500"
                              : "text-amber-600 dark:text-amber-500"
                          }`}
                        >
                          {count.variance === 0
                            ? "—"
                            : `${count.variance < 0 ? "−" : "+"}${money(
                                Math.abs(count.variance)
                              )}`}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
