import type { AuthedUser } from "@/lib/authz";

/**
 * Holds the user that route handlers will see. Kept in its own module so the
 * `vi.mock("@/lib/authz")` factory can import it without pulling in the rest of
 * the test helpers (mock factories are hoisted above normal imports).
 */
export const authState: { user: AuthedUser | null } = { user: null };

export function actAs(
  role: "ADMIN" | "MANAGER" | "CASHIER",
  overrides: Partial<AuthedUser> = {}
): AuthedUser {
  authState.user = {
    id: overrides.id ?? "00000000-0000-4000-8000-000000000001",
    email: overrides.email ?? `${role.toLowerCase()}@test.local`,
    name: overrides.name ?? role,
    role,
  };
  return authState.user;
}

export function actAsNobody() {
  authState.user = null;
}
