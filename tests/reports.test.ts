import { beforeEach, describe, expect, it, vi } from "vitest";
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

import { GET as reportsGet } from "@/app/api/reports/route";
import { POST as billsPost } from "@/app/api/bills/route";
import { actAs } from "./auth-state";
import {
  addStock,
  getRequest,
  jsonRequest,
  makeCustomer,
  makeItem,
  makeSupplier,
  makeUser,
  prisma,
  readJson,
  resetDatabase,
} from "./helpers";

const load = async (query = "") =>
  (await readJson(await reportsGet(getRequest(`/api/reports${query}`), {}))).body.data;

beforeEach(async () => {
  await resetDatabase();
  const admin = await makeUser("ADMIN");
  actAs("ADMIN", { id: admin.id });
});

describe("BUG-010 — low stock respects each item's reorder level", () => {
  it("flags a high-turnover item above the old hardcoded threshold of 5", async () => {
    // 20 in stock, reorder at 50 — the old `stockQty <= 5` rule missed this
    // entirely, so the shop ran out of its fastest-moving lines.
    const busy = await makeItem({ name: "Cement", reorderLevel: 50 });
    await addStock(busy.id, 20);

    // 8 in stock, reorder at 5 — comfortably stocked, but the old rule would
    // not have flagged it either. Included to prove the comparison is per-item.
    const calm = await makeItem({ name: "Hammer", reorderLevel: 5 });
    await addStock(calm.id, 8);

    const data = await load();
    const names = data.lowStockItems.map((i: { name: string }) => i.name);

    expect(names).toContain("Cement");
    expect(names).not.toContain("Hammer");
  });

  it("treats stock exactly at the reorder level as low", async () => {
    const item = await makeItem({ name: "Wire", reorderLevel: 10 });
    await addStock(item.id, 10);

    const data = await load();
    expect(data.lowStockItems.map((i: { name: string }) => i.name)).toContain("Wire");
  });
});

describe("BUG-012 — the stock-additions range filter is honoured", () => {
  it("filters stock additions independently of the main range", async () => {
    const supplier = await makeSupplier();
    const item = await makeItem();

    // A delivery from two months ago.
    const old = await prisma.purchaseOrder.create({
      data: {
        orderNumber: "GRN-OLD-1",
        supplierId: supplier.id,
        status: "RECEIVED",
        totalAmount: new Prisma.Decimal(1000),
        purchaseItems: {
          create: {
            itemId: item.id,
            quantity: new Prisma.Decimal(1),
            unitCost: new Prisma.Decimal(1000),
            totalCost: new Prisma.Decimal(1000),
            receivedQty: new Prisma.Decimal(1),
          },
        },
      },
    });

    const twoMonthsAgo = new Date();
    twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);
    await prisma.purchaseOrder.update({
      where: { id: old.id },
      data: { createdAt: twoMonthsAgo },
    });

    // And one from today.
    await prisma.purchaseOrder.create({
      data: {
        orderNumber: "GRN-NEW-1",
        supplierId: supplier.id,
        status: "RECEIVED",
        totalAmount: new Prisma.Decimal(500),
      },
    });

    const today = await load("?range=today&stockRange=today");
    const year = await load("?range=today&stockRange=year");

    const numbers = (d: { stockAdditions: { orderNumber: string }[] }) =>
      d.stockAdditions.map((o) => o.orderNumber);

    expect(numbers(today)).toEqual(["GRN-NEW-1"]);
    expect(numbers(year)).toContain("GRN-OLD-1");
    expect(numbers(year)).toContain("GRN-NEW-1");
  });

  it("rejects a range value that is not one of the allowed options", async () => {
    const { status } = await readJson(
      await reportsGet(getRequest("/api/reports?range=alltime"), {})
    );
    expect(status).toBe(400);
  });
});

describe("Debtors are aggregated in the database", () => {
  it("reports outstanding balances without loading every bill", async () => {
    const customer = await makeCustomer("Nimal");
    const item = await makeItem();
    await addStock(item.id, 100, 100, 150);

    await billsPost(
      jsonRequest("/api/bills", {
        items: [{ id: item.id, quantity: 4, price: 150 }],
        customerId: customer.id,
        amountPaid: 200,
      }),
      {}
    );

    const data = await load();

    expect(data.topDebtors).toHaveLength(1);
    expect(data.topDebtors[0].name).toBe("Nimal");
    expect(data.topDebtors[0].amount).toBe(400); // 600 billed - 200 paid
  });

  it("excludes customers who owe nothing", async () => {
    const customer = await makeCustomer("Paid Up");
    const item = await makeItem();
    await addStock(item.id, 100, 100, 150);

    await billsPost(
      jsonRequest("/api/bills", {
        items: [{ id: item.id, quantity: 1, price: 150 }],
        customerId: customer.id,
      }),
      {}
    );

    const data = await load();
    expect(data.topDebtors).toEqual([]);
  });
});

describe("Response is bounded", () => {
  it("reports whether any list was truncated", async () => {
    const data = await load();
    expect(data.meta.maxRows).toBeGreaterThan(0);
    expect(data.meta.truncated).toMatchObject({
      stockAdditions: false,
      dailyBills: false,
      chequeReports: false,
      returnedBills: false,
    });
  });
});
