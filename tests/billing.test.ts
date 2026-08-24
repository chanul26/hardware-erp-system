import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

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

import { POST as createBill } from "@/app/api/bills/route";
import { actAs } from "./auth-state";
import {
  addStock,
  jsonRequest,
  makeCustomer,
  makeItem,
  makeUser,
  prisma,
  readJson,
  resetDatabase,
  stockDiscrepancies,
} from "./helpers";

let adminId: string;

beforeAll(async () => {
  await resetDatabase();
});

beforeEach(async () => {
  await resetDatabase();
  const admin = await makeUser("ADMIN");
  adminId = admin.id;
  actAs("ADMIN", { id: admin.id });
});

describe("BUG-001 — the server owns the money", () => {
  it("rejects a line priced below its cost instead of storing it", async () => {
    const item = await makeItem();
    await addStock(item.id, 10, 100, 150);

    // The classic attack: edit the price to 0 in the browser and check out.
    const res = await createBill(
      jsonRequest("/api/bills", {
        items: [{ id: item.id, quantity: 1, price: 0 }],
      }),
      {}
    );

    const { status, body } = await readJson(res);

    expect(status).toBe(400);
    expect(body.success).toBe(false);
    expect(await prisma.bill.count()).toBe(0);

    // Critically: stock must not have moved either.
    const after = await prisma.item.findUniqueOrThrow({ where: { id: item.id } });
    expect(Number(after.stockQty)).toBe(10);
  });

  it("ignores client-supplied totals and recomputes them", async () => {
    const item = await makeItem();
    await addStock(item.id, 10, 100, 150);

    const res = await createBill(
      jsonRequest("/api/bills", {
        items: [{ id: item.id, quantity: 2, price: 150 }],
        // Lies. The server must not believe any of these.
        subtotal: 1,
        totalAmount: 1,
        discount: 0,
      }),
      {}
    );

    const { status, body } = await readJson(res);
    expect(status).toBe(201);

    // 2 x 150 = 300, not the 1 the client claimed.
    expect(Number(body.data.subtotal)).toBe(300);
    expect(Number(body.data.totalAmount)).toBe(300);

    const bill = await prisma.bill.findUniqueOrThrow({
      where: { id: body.data.id },
    });
    expect(Number(bill.totalAmount)).toBe(300);
  });

  it("refuses a discount larger than the subtotal", async () => {
    const item = await makeItem();
    await addStock(item.id, 10, 100, 150);

    const res = await createBill(
      jsonRequest("/api/bills", {
        items: [{ id: item.id, quantity: 1, price: 150 }],
        discount: 500,
      }),
      {}
    );

    expect((await readJson(res)).status).toBe(400);
    expect(await prisma.bill.count()).toBe(0);
  });
});

describe("BUG-003 — stock cannot go negative", () => {
  it("rejects a sale larger than available stock", async () => {
    const item = await makeItem();
    await addStock(item.id, 3, 100, 150);

    const res = await createBill(
      jsonRequest("/api/bills", {
        items: [{ id: item.id, quantity: 5, price: 150 }],
      }),
      {}
    );

    expect((await readJson(res)).status).toBe(409);

    const after = await prisma.item.findUniqueOrThrow({ where: { id: item.id } });
    expect(Number(after.stockQty)).toBe(3);
    expect(await prisma.bill.count()).toBe(0);
  });

  it("allows selling exactly the remaining stock", async () => {
    const item = await makeItem();
    await addStock(item.id, 3, 100, 150);

    const res = await createBill(
      jsonRequest("/api/bills", {
        items: [{ id: item.id, quantity: 3, price: 150 }],
      }),
      {}
    );

    expect((await readJson(res)).status).toBe(201);

    const after = await prisma.item.findUniqueOrThrow({ where: { id: item.id } });
    expect(Number(after.stockQty)).toBe(0);
    expect(await stockDiscrepancies()).toEqual([]);
  });

  it("holds the invariant when concurrent sales race for the last unit", async () => {
    const item = await makeItem();
    await addStock(item.id, 1, 100, 150);

    // Both requests read "1 in stock" before either commits. Exactly one may win.
    const results = await Promise.allSettled([
      createBill(
        jsonRequest("/api/bills", {
          items: [{ id: item.id, quantity: 1, price: 150 }],
        }),
        {}
      ),
      createBill(
        jsonRequest("/api/bills", {
          items: [{ id: item.id, quantity: 1, price: 150 }],
        }),
        {}
      ),
    ]);

    const statuses = await Promise.all(
      results.map(async (r) =>
        r.status === "fulfilled" ? (await readJson(r.value)).status : 500
      )
    );

    expect(statuses.filter((s) => s === 201)).toHaveLength(1);
    expect(statuses.filter((s) => s !== 201)).toHaveLength(1);

    const after = await prisma.item.findUniqueOrThrow({ where: { id: item.id } });
    expect(Number(after.stockQty)).toBe(0);
    expect(Number(after.stockQty)).toBeGreaterThanOrEqual(0);
    expect(await stockDiscrepancies()).toEqual([]);
  });
});

describe("FIFO costing", () => {
  it("consumes the oldest batch first and records each layer's real cost", async () => {
    const item = await makeItem();
    const older = await addStock(item.id, 5, 100, 150);
    // Ensure a deterministic ordering by createdAt.
    await new Promise((r) => setTimeout(r, 10));
    const newer = await addStock(item.id, 5, 120, 150);

    const res = await createBill(
      jsonRequest("/api/bills", {
        items: [{ id: item.id, quantity: 8, price: 150 }],
      }),
      {}
    );

    expect((await readJson(res)).status).toBe(201);

    const olderAfter = await prisma.purchaseBatch.findUniqueOrThrow({
      where: { id: older.id },
    });
    const newerAfter = await prisma.purchaseBatch.findUniqueOrThrow({
      where: { id: newer.id },
    });

    expect(Number(olderAfter.remainingQty)).toBe(0);
    expect(Number(newerAfter.remainingQty)).toBe(2);

    // Two bill lines, each carrying the cost of the layer it came from.
    const lines = await prisma.billItem.findMany({ orderBy: { buyingPrice: "asc" } });
    expect(lines).toHaveLength(2);
    expect(Number(lines[0].buyingPrice)).toBe(100);
    expect(Number(lines[0].quantity)).toBe(5);
    expect(Number(lines[1].buyingPrice)).toBe(120);
    expect(Number(lines[1].quantity)).toBe(3);

    expect(await stockDiscrepancies()).toEqual([]);
  });

  it("supports fractional quantities without drift", async () => {
    const item = await makeItem({ unit: "kg" });
    await addStock(item.id, 10, 100, 150);

    for (let i = 0; i < 3; i++) {
      const res = await createBill(
        jsonRequest("/api/bills", {
          items: [{ id: item.id, quantity: 0.1, price: 150 }],
        }),
        {}
      );
      expect((await readJson(res)).status).toBe(201);
    }

    const after = await prisma.item.findUniqueOrThrow({ where: { id: item.id } });
    // Decimal arithmetic: exactly 9.7, not 9.699999999999999.
    expect(after.stockQty.equals(new Prisma.Decimal("9.7"))).toBe(true);
    expect(await stockDiscrepancies()).toEqual([]);
  });
});

describe("BUG-005 — bill status is derived, not asserted", () => {
  it("records a fully paid sale as PAID", async () => {
    const item = await makeItem();
    await addStock(item.id, 10, 100, 150);

    const res = await createBill(
      jsonRequest("/api/bills", {
        items: [{ id: item.id, quantity: 1, price: 150 }],
      }),
      {}
    );

    const { body } = await readJson(res);
    expect(body.data.status).toBe("PAID");
    expect(Number(body.data.amountPaid)).toBe(150);
  });

  it("records a partly paid credit sale as PARTIAL, not PAID", async () => {
    const item = await makeItem();
    await addStock(item.id, 10, 100, 150);
    const customer = await makeCustomer();

    const res = await createBill(
      jsonRequest("/api/bills", {
        items: [{ id: item.id, quantity: 2, price: 150 }],
        customerId: customer.id,
        amountPaid: 100,
      }),
      {}
    );

    const { status, body } = await readJson(res);
    expect(status).toBe(201);
    expect(body.data.status).toBe("PARTIAL");

    const bill = await prisma.bill.findUniqueOrThrow({
      where: { id: body.data.id },
    });
    // The cached column must agree with the ledger.
    const paid = await prisma.payment.aggregate({
      where: { billId: bill.id },
      _sum: { amount: true },
    });
    expect(Number(bill.amountPaid)).toBe(100);
    expect(Number(paid._sum.amount)).toBe(100);
  });

  it("refuses an unpaid balance with no customer attached", async () => {
    const item = await makeItem();
    await addStock(item.id, 10, 100, 150);

    const res = await createBill(
      jsonRequest("/api/bills", {
        items: [{ id: item.id, quantity: 2, price: 150 }],
        amountPaid: 100,
      }),
      {}
    );

    expect((await readJson(res)).status).toBe(400);
    expect(await prisma.bill.count()).toBe(0);
  });
});

describe("Invoice numbering", () => {
  it("issues sequential, non-colliding numbers", async () => {
    const item = await makeItem();
    await addStock(item.id, 10, 100, 150);

    const numbers: string[] = [];
    for (let i = 0; i < 3; i++) {
      const res = await createBill(
        jsonRequest("/api/bills", {
          items: [{ id: item.id, quantity: 1, price: 150 }],
        }),
        {}
      );
      numbers.push((await readJson(res)).body.data.billNumber);
    }

    expect(numbers).toEqual(["INV-000001", "INV-000002", "INV-000003"]);
    expect(new Set(numbers).size).toBe(3);
  });
});

describe("Audit trail", () => {
  it("writes a stock movement carrying the acting user and running balance", async () => {
    const item = await makeItem();
    await addStock(item.id, 10, 100, 150);

    await createBill(
      jsonRequest("/api/bills", {
        items: [{ id: item.id, quantity: 4, price: 150 }],
      }),
      {}
    );

    const movements = await prisma.stockMovement.findMany({
      where: { itemId: item.id },
    });

    expect(movements).toHaveLength(1);
    expect(movements[0].type).toBe("SALE");
    expect(Number(movements[0].quantity)).toBe(-4);
    expect(Number(movements[0].balance)).toBe(6);
    expect(movements[0].userId).toBe(adminId);
  });
});

describe("Error messages are diagnostic, not alarming", () => {
  it("reports an ordinary oversell as insufficient stock, not broken records", async () => {
    const item = await makeItem();
    await addStock(item.id, 100, 100, 150);

    const res = await createBill(
      jsonRequest("/api/bills", {
        items: [{ id: item.id, quantity: 500, price: 150 }],
      }),
      {}
    );

    const { status, body } = await readJson(res);

    expect(status).toBe(409);
    // The stock guard must answer first. Falling through to the FIFO layer
    // produced a "records are inconsistent" message for a routine oversell.
    expect(body.error).toMatch(/not enough stock/i);
    expect(body.error).toMatch(/available: 100/i);
    expect(body.error).not.toMatch(/inconsistent/i);
  });

  it("links each stock movement to the bill that caused it", async () => {
    const item = await makeItem();
    await addStock(item.id, 10, 100, 150);

    const { body } = await readJson(
      await createBill(
        jsonRequest("/api/bills", {
          items: [{ id: item.id, quantity: 2, price: 150 }],
        }),
        {}
      )
    );

    const movement = await prisma.stockMovement.findFirstOrThrow({
      where: { itemId: item.id },
    });
    expect(movement.billId).toBe(body.data.id);
  });
});
