"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Loader2, Plus, Shield, Users } from "lucide-react";

interface StaffMember {
  id: string;
  name: string | null;
  email: string;
  role: "ADMIN" | "MANAGER" | "CASHIER";
  isActive: boolean;
  createdAt?: string;
}

type Feedback = { type: "success" | "error"; text: string } | null;

const ROLE_STYLES: Record<StaffMember["role"], string> = {
  ADMIN: "bg-primary/10 text-primary",
  MANAGER: "bg-orange-500/10 text-orange-500",
  CASHIER: "bg-green-500/10 text-green-500",
};

export default function UsersPage() {
  const { data: session } = useSession();
  const currentUserId = session?.user?.id;

  const [users, setUsers] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<StaffMember["role"]>("CASHIER");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<Feedback>(null);

  const [busyId, setBusyId] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/users");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not load staff.");
      setUsers(json.data);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Could not load staff.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const describeFailure = (json: { error?: string; details?: unknown }) => {
    const detail = json.details
      ? Object.values(json.details as Record<string, string[]>)
          .flat()
          .join(" ")
      : "";
    return detail || json.error || "Something went wrong.";
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setMessage(null);

    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password, role }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(describeFailure(json));

      setMessage({ type: "success", text: `${json.data.name} can now sign in.` });
      setName("");
      setEmail("");
      setPassword("");
      setRole("CASHIER");
      fetchUsers();
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Could not create the account.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const patchUser = async (id: string, body: Record<string, unknown>, ok: string) => {
    setBusyId(id);
    setMessage(null);

    try {
      const res = await fetch("/api/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...body }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(describeFailure(json));

      setMessage({ type: "success", text: ok });
      fetchUsers();
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Could not update the account.",
      });
    } finally {
      setBusyId(null);
    }
  };

  const handleRoleChange = (user: StaffMember, next: StaffMember["role"]) => {
    if (next === user.role) return;
    patchUser(user.id, { role: next }, `${user.name ?? user.email} is now ${next}.`);
  };

  const handleToggleActive = (user: StaffMember) => {
    const activating = !user.isActive;
    if (
      !activating &&
      !confirm(
        `Deactivate ${user.name ?? user.email}?\n\nThey will not be able to sign in. Their past bills and stock movements are kept.`
      )
    )
      return;

    patchUser(
      user.id,
      { isActive: activating },
      `${user.name ?? user.email} ${activating ? "reactivated" : "deactivated"}.`
    );
  };

  const handleResetPassword = (user: StaffMember) => {
    const next = prompt(
      `New password for ${user.name ?? user.email} (at least 10 characters):`
    );
    if (!next) return;

    patchUser(
      user.id,
      { password: next },
      `Password updated for ${user.name ?? user.email}. Share it with them directly.`
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-foreground">
          Staff Management
        </h2>
        <p className="text-muted-foreground mt-1">
          Create and manage access for your cashiers and managers.
        </p>
      </div>

      {message && (
        <div
          className={`p-3 rounded-md text-sm font-medium ${
            message.type === "success"
              ? "bg-green-500/15 text-green-600"
              : "bg-destructive/15 text-destructive"
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm h-fit">
          <div className="flex items-center gap-2 mb-4">
            <Plus className="h-5 w-5 text-primary" />
            <h3 className="text-lg font-semibold text-foreground">Add new worker</h3>
          </div>

          <form onSubmit={handleCreateUser} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="staff-name" className="text-sm font-medium">
                Full name
              </label>
              <input
                id="staff-name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-primary"
                placeholder="John Doe"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="staff-email" className="text-sm font-medium">
                Email
              </label>
              <input
                id="staff-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-primary"
                placeholder="john@hardware.com"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="staff-password" className="text-sm font-medium">
                Temporary password
              </label>
              <input
                id="staff-password"
                type="password"
                required
                minLength={10}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-primary"
                placeholder="At least 10 characters"
              />
              <p className="text-xs text-muted-foreground">
                Minimum 10 characters. Ask them to change it after signing in.
              </p>
            </div>

            <div className="space-y-2">
              <label htmlFor="staff-role" className="text-sm font-medium">
                Role
              </label>
              <select
                id="staff-role"
                value={role}
                onChange={(e) => setRole(e.target.value as StaffMember["role"])}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-primary"
              >
                <option value="CASHIER">Cashier (point of sale only)</option>
                <option value="MANAGER">Manager (inventory + POS)</option>
                <option value="ADMIN">Admin (full access)</option>
              </select>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 mt-4 flex items-center justify-center gap-2"
            >
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {isSubmitting ? "Creating..." : "Create account"}
            </button>
          </form>
        </div>

        <div className="lg:col-span-2 rounded-xl border border-border bg-card p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <Users className="h-5 w-5 text-primary" />
            <h3 className="text-lg font-semibold text-foreground">Staff accounts</h3>
          </div>

          {loading ? (
            <p className="text-sm text-muted-foreground">Loading staff...</p>
          ) : loadError ? (
            <div className="text-sm">
              <p className="text-destructive font-medium">{loadError}</p>
              <button
                onClick={fetchUsers}
                className="mt-2 border border-input px-3 py-1.5 rounded-md hover:bg-muted"
              >
                Try again
              </button>
            </div>
          ) : (
            <div className="border rounded-md overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-muted text-muted-foreground">
                  <tr>
                    <th scope="col" className="px-4 py-3 font-medium">Name</th>
                    <th scope="col" className="px-4 py-3 font-medium">Email</th>
                    <th scope="col" className="px-4 py-3 font-medium">Role</th>
                    <th scope="col" className="px-4 py-3 font-medium">Status</th>
                    <th scope="col" className="px-4 py-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {users.map((user) => {
                    const isSelf = user.id === currentUserId;
                    const busy = busyId === user.id;

                    return (
                      <tr
                        key={user.id}
                        className={`bg-card hover:bg-muted/50 ${
                          user.isActive ? "" : "opacity-60"
                        }`}
                      >
                        <td className="px-4 py-3 font-medium text-foreground">
                          {user.name}
                          {isSelf && (
                            <span className="ml-2 text-xs text-muted-foreground">(you)</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{user.email}</td>
                        <td className="px-4 py-3">
                          <select
                            aria-label={`Role for ${user.name ?? user.email}`}
                            value={user.role}
                            disabled={busy || isSelf}
                            onChange={(e) =>
                              handleRoleChange(
                                user,
                                e.target.value as StaffMember["role"]
                              )
                            }
                            className={`rounded-full px-2 py-1 text-xs font-medium border-0 ${
                              ROLE_STYLES[user.role]
                            } disabled:cursor-not-allowed`}
                            title={
                              isSelf
                                ? "You cannot change your own role"
                                : undefined
                            }
                          >
                            <option value="ADMIN">ADMIN</option>
                            <option value="MANAGER">MANAGER</option>
                            <option value="CASHIER">CASHIER</option>
                          </select>
                        </td>
                        <td className="px-4 py-3">
                          {user.isActive ? (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-green-600">
                              {user.role === "ADMIN" && <Shield className="w-3 h-3" />}
                              Active
                            </span>
                          ) : (
                            <span className="text-xs font-medium text-muted-foreground">
                              Deactivated
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => handleResetPassword(user)}
                              disabled={busy}
                              className="text-xs px-2 py-1 rounded border border-input hover:bg-muted disabled:opacity-50"
                            >
                              Reset password
                            </button>
                            <button
                              onClick={() => handleToggleActive(user)}
                              disabled={busy || isSelf}
                              title={
                                isSelf ? "You cannot deactivate yourself" : undefined
                              }
                              className={`text-xs px-2 py-1 rounded disabled:opacity-50 ${
                                user.isActive
                                  ? "bg-destructive/10 text-destructive hover:bg-destructive/20"
                                  : "bg-green-500/10 text-green-600 hover:bg-green-500/20"
                              }`}
                            >
                              {user.isActive ? "Deactivate" : "Reactivate"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <p className="text-xs text-muted-foreground mt-3">
            Staff who have raised bills cannot be deleted — deactivate them instead, so
            their invoices and stock movements stay intact.
          </p>
        </div>
      </div>
    </div>
  );
}
