import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/authz", async () => {
  const { forbidden, unauthorized } = await import("@/lib/api");
  const { authState } = await import("./auth-state");

  const requireAuth = async () => {
    if (!authState.user) throw unauthorized();
    return authState.user;
  };
  const requireRole = async (...roles: string[]) => {
    const user = await requireAuth();
    if (!roles.includes(user.role)) throw forbidden();
    return user;
  };

  return {
    requireAuth,
    requireRole,
    requireAdmin: () => requireRole("ADMIN"),
    requireManager: () => requireRole("ADMIN", "MANAGER"),
    requireStaff: () => requireRole("ADMIN", "MANAGER", "CASHIER"),
  };
});

import { GET as itemsGet, POST as itemsPost } from "@/app/api/items/route";
import { POST as mixingPost } from "@/app/api/items/mixing/route";
import { POST as billsPost } from "@/app/api/bills/route";
import { GET as billReturnGet } from "@/app/api/bills/return/route";
import {
  DELETE as customersDelete,
  GET as customersGet,
  POST as customersPost,
} from "@/app/api/customers/route";
import { GET as suppliersGet, POST as suppliersPost } from "@/app/api/suppliers/route";
import { POST as supplierSettle } from "@/app/api/suppliers/settle/route";
import { POST as paymentSettle } from "@/app/api/payments/settle/route";
import { POST as restockPost } from "@/app/api/restock/route";
import { PATCH as chequePass } from "@/app/api/cheques/pass/route";
import { PATCH as chequeReturn } from "@/app/api/cheques/return/route";
import { GET as chequeByDate } from "@/app/api/cheques/by-date/route";
import { GET as reportsGet } from "@/app/api/reports/route";
import {
  GET as usersGet,
  PATCH as usersPatch,
  POST as usersPost,
} from "@/app/api/users/route";

import { actAs, actAsNobody } from "./auth-state";
import { getRequest, jsonRequest, readJson, resetDatabase } from "./helpers";

type Handler = (req: Request, ctx: unknown) => Promise<Response>;

/**
 * The full authorization matrix.
 *
 * Eleven of these endpoints previously had no session check of any kind — the
 * middleware matcher covered only page routes. Each row asserts the minimum
 * role, so a future refactor that drops a guard fails here rather than in
 * production.
 */
const ENDPOINTS: Array<{
  name: string;
  handler: Handler;
  request: () => Request;
  minimum: "ADMIN" | "MANAGER" | "STAFF";
}> = [
  { name: "GET /api/items", handler: itemsGet as Handler, request: () => getRequest("/api/items"), minimum: "STAFF" },
  { name: "POST /api/items", handler: itemsPost as Handler, request: () => jsonRequest("/api/items", {}), minimum: "MANAGER" },
  { name: "POST /api/items/mixing", handler: mixingPost as Handler, request: () => jsonRequest("/api/items/mixing", {}), minimum: "MANAGER" },
  { name: "POST /api/bills", handler: billsPost as Handler, request: () => jsonRequest("/api/bills", {}), minimum: "STAFF" },
  { name: "GET /api/bills/return", handler: billReturnGet as Handler, request: () => getRequest("/api/bills/return?billNumber=INV-000001"), minimum: "MANAGER" },
  { name: "GET /api/customers", handler: customersGet as Handler, request: () => getRequest("/api/customers"), minimum: "STAFF" },
  { name: "POST /api/customers", handler: customersPost as Handler, request: () => jsonRequest("/api/customers", {}), minimum: "STAFF" },
  { name: "DELETE /api/customers", handler: customersDelete as Handler, request: () => getRequest("/api/customers?id=00000000-0000-4000-8000-000000000009"), minimum: "MANAGER" },
  { name: "GET /api/suppliers", handler: suppliersGet as Handler, request: () => getRequest("/api/suppliers"), minimum: "MANAGER" },
  { name: "POST /api/suppliers", handler: suppliersPost as Handler, request: () => jsonRequest("/api/suppliers", {}), minimum: "MANAGER" },
  { name: "POST /api/suppliers/settle", handler: supplierSettle as Handler, request: () => jsonRequest("/api/suppliers/settle", {}), minimum: "MANAGER" },
  { name: "POST /api/payments/settle", handler: paymentSettle as Handler, request: () => jsonRequest("/api/payments/settle", {}), minimum: "MANAGER" },
  { name: "POST /api/restock", handler: restockPost as Handler, request: () => jsonRequest("/api/restock", {}), minimum: "MANAGER" },
  { name: "PATCH /api/cheques/pass", handler: chequePass as Handler, request: () => jsonRequest("/api/cheques/pass", {}, "PATCH"), minimum: "MANAGER" },
  { name: "PATCH /api/cheques/return", handler: chequeReturn as Handler, request: () => jsonRequest("/api/cheques/return", {}, "PATCH"), minimum: "MANAGER" },
  { name: "GET /api/cheques/by-date", handler: chequeByDate as Handler, request: () => getRequest("/api/cheques/by-date?date=2026-01-01"), minimum: "MANAGER" },
  { name: "GET /api/reports", handler: reportsGet as Handler, request: () => getRequest("/api/reports"), minimum: "ADMIN" },
  { name: "GET /api/users", handler: usersGet as Handler, request: () => getRequest("/api/users"), minimum: "ADMIN" },
  { name: "POST /api/users", handler: usersPost as Handler, request: () => jsonRequest("/api/users", {}), minimum: "ADMIN" },
  { name: "PATCH /api/users", handler: usersPatch as Handler, request: () => jsonRequest("/api/users", {}, "PATCH"), minimum: "ADMIN" },
];

beforeEach(async () => {
  await resetDatabase();
});

describe("BUG-002 — every endpoint requires a session", () => {
  it.each(ENDPOINTS)("$name returns 401 when signed out", async ({ handler, request }) => {
    actAsNobody();
    const { status } = await readJson(await handler(request(), {}));
    expect(status).toBe(401);
  });
});

describe("Role enforcement", () => {
  const adminOnly = ENDPOINTS.filter((e) => e.minimum === "ADMIN");
  const managerPlus = ENDPOINTS.filter((e) => e.minimum === "MANAGER");

  it.each(adminOnly)("$name refuses a MANAGER", async ({ handler, request }) => {
    actAs("MANAGER");
    const { status } = await readJson(await handler(request(), {}));
    expect(status).toBe(403);
  });

  it.each(adminOnly)("$name refuses a CASHIER", async ({ handler, request }) => {
    actAs("CASHIER");
    const { status } = await readJson(await handler(request(), {}));
    expect(status).toBe(403);
  });

  it.each(managerPlus)("$name refuses a CASHIER", async ({ handler, request }) => {
    actAs("CASHIER");
    const { status } = await readJson(await handler(request(), {}));
    expect(status).toBe(403);
  });

  it.each(managerPlus)("$name allows a MANAGER past the guard", async ({ handler, request }) => {
    actAs("MANAGER");
    const { status } = await readJson(await handler(request(), {}));
    // Past authorization: whatever comes back must not be 401/403.
    expect([401, 403]).not.toContain(status);
  });
});

describe("Error responses do not leak internals", () => {
  it("returns a structured failure envelope, never a stack trace", async () => {
    actAs("ADMIN");
    const { status, body } = await readJson(
      await (itemsPost as Handler)(jsonRequest("/api/items", { name: "" }), {})
    );

    expect(status).toBe(400);
    expect(body).toMatchObject({ success: false });
    expect(typeof body.error).toBe("string");
    expect(JSON.stringify(body)).not.toMatch(/at .*\(.*:\d+:\d+\)/);
    expect(JSON.stringify(body)).not.toMatch(/prisma|PrismaClient/i);
  });

  it("rejects malformed JSON with 400 rather than 500", async () => {
    actAs("ADMIN");
    const bad = new Request("http://localhost:3001/api/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{not json",
    });

    const { status, body } = await readJson(await (itemsPost as Handler)(bad, {}));
    expect(status).toBe(400);
    expect(body.success).toBe(false);
  });
});
