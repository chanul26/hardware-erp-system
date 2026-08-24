"use client";

import { useState } from "react";
import { Loader2, Landmark, Pencil, X, Check, Ban } from "lucide-react";

export type BankAccountRow = {
  id: string;
  name: string;
  bankName: string | null;
  accountNumber: string | null;
  openingBalance: number;
  dailyTarget: number | null;
  monthlyTarget: number | null;
  isActive: boolean;
  balance: number;
  depositedToday: number;
  depositedThisMonth: number;
};

const money = (value: number) =>
  `Rs. ${value.toLocaleString("en-LK", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

export default function BankAccountsPanel({
  accounts,
  onChanged,
}: {
  accounts: BankAccountRow[];
  onChanged: () => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: "",
    bankName: "",
    accountNumber: "",
    openingBalance: "",
    dailyTarget: "",
    monthlyTarget: "",
  });

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDaily, setEditDaily] = useState("");
  const [editMonthly, setEditMonthly] = useState("");

  const createAccount = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!form.name.trim()) {
      setError("Give the account a name.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/money/banks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          bankName: form.bankName,
          accountNumber: form.accountNumber,
          openingBalance: Number(form.openingBalance || 0),
          dailyTarget: form.dailyTarget || null,
          monthlyTarget: form.monthlyTarget || null,
        }),
      });

      const json = await res.json();

      if (!res.ok) throw new Error(json.error);

      setForm({
        name: "",
        bankName: "",
        accountNumber: "",
        openingBalance: "",
        dailyTarget: "",
        monthlyTarget: "",
      });
      setShowForm(false);
      onChanged();
    } catch (err: any) {
      setError(err.message || "Failed to add the account.");
    } finally {
      setSaving(false);
    }
  };

  const saveTargets = async (id: string) => {
    setSaving(true);
    setError(null);

    try {
      const res = await fetch(`/api/money/banks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dailyTarget: editDaily === "" ? null : editDaily,
          monthlyTarget: editMonthly === "" ? null : editMonthly,
        }),
      });

      const json = await res.json();

      if (!res.ok) throw new Error(json.error);

      setEditingId(null);
      onChanged();
    } catch (err: any) {
      setError(err.message || "Failed to save the targets.");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (account: BankAccountRow) => {
    setSaving(true);
    setError(null);

    try {
      const res = await fetch(`/api/money/banks/${account.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !account.isActive }),
      });

      const json = await res.json();

      if (!res.ok) throw new Error(json.error);

      onChanged();
    } catch (err: any) {
      setError(err.message || "Failed to update the account.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="p-4 border-b border-border flex items-center justify-between">
        <h3 className="font-semibold text-foreground flex items-center gap-2">
          <Landmark className="h-4 w-4 text-primary" />
          Bank accounts &amp; savings targets
        </h3>

        <button
          onClick={() => setShowForm((open) => !open)}
          className="text-sm font-medium text-primary hover:underline"
        >
          {showForm ? "Cancel" : "Add account"}
        </button>
      </div>

      {error && (
        <p className="px-4 pt-3 text-sm text-destructive font-medium">
          {error}
        </p>
      )}

      {showForm && (
        <form
          onSubmit={createAccount}
          className="p-4 border-b border-border grid grid-cols-1 sm:grid-cols-3 gap-3"
        >
          <input
            value={form.name}
            onChange={(event) =>
              setForm({ ...form, name: event.target.value })
            }
            placeholder="Account name (e.g. Savings 1)"
            className="rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
          <input
            value={form.bankName}
            onChange={(event) =>
              setForm({ ...form, bankName: event.target.value })
            }
            placeholder="Bank"
            className="rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
          <input
            value={form.accountNumber}
            onChange={(event) =>
              setForm({ ...form, accountNumber: event.target.value })
            }
            placeholder="Account number"
            className="rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
          <input
            type="number"
            step="0.01"
            value={form.openingBalance}
            onChange={(event) =>
              setForm({ ...form, openingBalance: event.target.value })
            }
            placeholder="Opening balance"
            className="rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
          <input
            type="number"
            step="0.01"
            value={form.dailyTarget}
            onChange={(event) =>
              setForm({ ...form, dailyTarget: event.target.value })
            }
            placeholder="Daily target (e.g. 20000)"
            className="rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
          <input
            type="number"
            step="0.01"
            value={form.monthlyTarget}
            onChange={(event) =>
              setForm({ ...form, monthlyTarget: event.target.value })
            }
            placeholder="Monthly target"
            className="rounded-md border border-border bg-background px-3 py-2 text-sm"
          />

          <div className="sm:col-span-3">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Save account
            </button>
          </div>
        </form>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="bg-muted/50 text-muted-foreground border-b border-border">
            <tr>
              <th className="px-4 py-3 font-medium">Account</th>
              <th className="px-4 py-3 font-medium text-right">Balance</th>
              <th className="px-4 py-3 font-medium text-right">
                Daily target
              </th>
              <th className="px-4 py-3 font-medium text-right">
                Monthly target
              </th>
              <th className="px-4 py-3 font-medium text-right">
                Banked this month
              </th>
              <th className="px-4 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {accounts.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-8 text-center text-muted-foreground"
                >
                  No bank accounts yet. Add one to start recording deposits.
                </td>
              </tr>
            ) : (
              accounts.map((account) => {
                const editing = editingId === account.id;

                return (
                  <tr
                    key={account.id}
                    className={`hover:bg-muted/20 transition-colors ${
                      account.isActive ? "" : "opacity-50"
                    }`}
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium text-foreground">
                        {account.name}
                        {!account.isActive && (
                          <span className="ml-2 text-[10px] font-bold px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                            CLOSED
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {[account.bankName, account.accountNumber]
                          .filter(Boolean)
                          .join(" · ") || "—"}
                      </div>
                    </td>

                    <td className="px-4 py-3 text-right font-bold text-foreground">
                      {money(account.balance)}
                    </td>

                    <td className="px-4 py-3 text-right">
                      {editing ? (
                        <input
                          type="number"
                          step="0.01"
                          value={editDaily}
                          onChange={(event) =>
                            setEditDaily(event.target.value)
                          }
                          className="w-28 rounded-md border border-border bg-background px-2 py-1 text-sm text-right"
                        />
                      ) : account.dailyTarget === null ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        money(account.dailyTarget)
                      )}
                    </td>

                    <td className="px-4 py-3 text-right">
                      {editing ? (
                        <input
                          type="number"
                          step="0.01"
                          value={editMonthly}
                          onChange={(event) =>
                            setEditMonthly(event.target.value)
                          }
                          className="w-28 rounded-md border border-border bg-background px-2 py-1 text-sm text-right"
                        />
                      ) : account.monthlyTarget === null ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        money(account.monthlyTarget)
                      )}
                    </td>

                    <td className="px-4 py-3 text-right text-foreground">
                      {money(account.depositedThisMonth)}
                    </td>

                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        {editing ? (
                          <>
                            <button
                              onClick={() => saveTargets(account.id)}
                              disabled={saving}
                              className="p-1.5 rounded-md hover:bg-muted text-green-600"
                              title="Save"
                            >
                              <Check className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => setEditingId(null)}
                              className="p-1.5 rounded-md hover:bg-muted text-muted-foreground"
                              title="Cancel"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => {
                                setEditingId(account.id);
                                setEditDaily(
                                  account.dailyTarget === null
                                    ? ""
                                    : String(account.dailyTarget)
                                );
                                setEditMonthly(
                                  account.monthlyTarget === null
                                    ? ""
                                    : String(account.monthlyTarget)
                                );
                              }}
                              className="p-1.5 rounded-md hover:bg-muted text-muted-foreground"
                              title="Edit targets"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => toggleActive(account)}
                              disabled={saving}
                              className="p-1.5 rounded-md hover:bg-muted text-muted-foreground"
                              title={
                                account.isActive
                                  ? "Close account"
                                  : "Reopen account"
                              }
                            >
                              <Ban className="h-4 w-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
