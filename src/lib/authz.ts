import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { forbidden, unauthorized } from "@/lib/api";

export type Role = "ADMIN" | "MANAGER" | "CASHIER";

export type AuthedUser = {
  id: string;
  email: string;
  name: string | null;
  role: Role;
};

/**
 * Server-side authorization. Every API route calls one of these — the
 * middleware matcher is a second layer, not the only one, so that a change to
 * `middleware.ts` can never silently expose an endpoint.
 */

export async function requireAuth(): Promise<AuthedUser> {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    throw unauthorized();
  }

  return {
    id: session.user.id,
    email: session.user.email ?? "",
    name: session.user.name ?? null,
    role: session.user.role as Role,
  };
}

/**
 * Requires an authenticated user holding one of `roles`.
 * Returns 401 when not signed in, 403 when signed in without the role — the
 * distinction matters so the UI can redirect to login vs. show "no access".
 */
export async function requireRole(...roles: Role[]): Promise<AuthedUser> {
  const user = await requireAuth();

  if (!roles.includes(user.role)) {
    throw forbidden();
  }

  return user;
}

/** Convenience wrappers naming the app's actual privilege tiers. */
export const requireAdmin = () => requireRole("ADMIN");
export const requireManager = () => requireRole("ADMIN", "MANAGER");
export const requireStaff = () => requireRole("ADMIN", "MANAGER", "CASHIER");
