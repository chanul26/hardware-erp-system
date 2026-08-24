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

import { POST as billsPost } from "@/app/api/bills/route";
import { POST as restockPost } from "@/app/api/restock/route";
import { actAs } from "./auth-state";
import {
  addStock,
  jsonRequest,
  makeItem,
  makeSupplier,
  makeUser,
  prisma,
  readJson,
  resetDatabase,
  stockDiscrepancies,
} from "./helpers";

/** Stocks an item through the real restock route so batches carry warranty terms. */
async function receiveStock(
  supplierId: string,
  itemId: string,
  qty: number,
  warrantyMonths: number | null
) {
  const res = await restockPost(
    jsonRequest("/api/restock", {
      supplierId,
      items: [
        {
          itemId,
          quantity: qty,
          unitCost: 100,
          sellingPrice: 150,
          ...(warrantyMonths ? { warrantyMonths } : {}),
        },
      ],
      paymentMethod: "CASH",
      amountPaid: qty * 100,
    }),
    {}
  );
  expect((await readJson(res)).status).toBe(201);
}

const sell = (body: Record<string, unknown>) =>
  billsPost(jsonRequest("/api/bills", body), {});

beforeEach(async () => {
  await resetDatabase();
  const admin = await makeUser("ADMIN");
  actAs("ADMIN", { id: admin.id });
});

describe("Warranty issuance — both gates must open", () => {
  it("issues one warranty per unit when the product is eligible and the batch is covered", async () => {
    const supplier = await makeSupplier();
    const item = await makeItem({ name: "Drill", warrantyEligible: true });
    await receiveStock(supplier.id, item.id, 5, 24);

    const { status, body } = await readJson(
      await sell({
        items: [
          { id: item.id, quantity: 2, price: 150, serials: ["SN-1", "SN-2"] },
        ],
      })
    );

    expect(status).toBe(201);
    expect(body.data.warranties).toHaveLength(2);

    const warranties = await prisma.warranty.findMany({
      orderBy: { warrantyNumber: "asc" },
    });
    expect(warranties).toHaveLength(2);
    expect(warranties.map((w) => w.serialNumber)).toEqual(["SN-1", "SN-2"]);
    expect(warranties[0].months).toBe(24);
    // Provenance is recorded so a claim can be pushed back to the supplier.
    expect(warranties[0].supplierId).toBe(supplier.id);
    expect(warranties[0].batchId).not.toBeNull();
  });

  it("issues nothing for an eligible product bought without supplier cover", async () => {
    const supplier = await makeSupplier();
    const item = await makeItem({ name: "Drill", warrantyEligible: true });
    await receiveStock(supplier.id, item.id, 5, null);

    const { status, body } = await readJson(
      await sell({ items: [{ id: item.id, quantity: 1, price: 150 }] })
    );

    expect(status).toBe(201);
    expect(body.data.warranties).toEqual([]);
    expect(await prisma.warranty.count()).toBe(0);
  });

  it("issues nothing for an ineligible product even from a covered batch", async () => {
    const supplier = await makeSupplier();
    const item = await makeItem({ name: "Cement", warrantyEligible: false });
    await receiveStock(supplier.id, item.id, 5, 24);

    const { body } = await readJson(
      await sell({ items: [{ id: item.id, quantity: 1, price: 150 }] })
    );

    expect(body.data.warranties).toEqual([]);
    expect(await prisma.warranty.count()).toBe(0);
  });

  it("lets the cashier extend the term beyond what the supplier gave", async () => {
    const supplier = await makeSupplier();
    const item = await makeItem({ warrantyEligible: true });
    await receiveStock(supplier.id, item.id, 5, 12);

    const { body } = await readJson(
      await sell({
        items: [{ id: item.id, quantity: 1, price: 150, warrantyMonths: 18 }],
      })
    );

    // The shop covers the extra six months.
    expect(body.data.warranties[0].months).toBe(18);
  });

  it("lets the cashier decline with 0 months", async () => {
    const supplier = await makeSupplier();
    const item = await makeItem({ warrantyEligible: true });
    await receiveStock(supplier.id, item.id, 5, 12);

    const { body } = await readJson(
      await sell({
        items: [{ id: item.id, quantity: 1, price: 150, warrantyMonths: 0 }],
      })
    );

    expect(body.data.warranties).toEqual([]);
  });

  it("cannot conjure a warranty on stock that came without cover", async () => {
    const supplier = await makeSupplier();
    const item = await makeItem({ warrantyEligible: true });
    await receiveStock(supplier.id, item.id, 5, null);

    const { body } = await readJson(
      await sell({
        items: [{ id: item.id, quantity: 1, price: 150, warrantyMonths: 36 }],
      })
    );

    // The batch decides whether any warranty exists; the client only chooses
    // the length of one that is already on offer.
    expect(body.data.warranties).toEqual([]);
  });
});

describe("Serial numbers", () => {
  it("refuses a serial already recorded on another invoice", async () => {
    const supplier = await makeSupplier();
    const item = await makeItem({ warrantyEligible: true });
    await receiveStock(supplier.id, item.id, 5, 12);

    await sell({
      items: [{ id: item.id, quantity: 1, price: 150, serials: ["DUP-1"] }],
    });

    const { status, body } = await readJson(
      await sell({
        items: [{ id: item.id, quantity: 1, price: 150, serials: ["DUP-1"] }],
      })
    );

    expect(status).toBe(409);
    expect(body.error).toMatch(/already recorded on invoice/i);
    expect(await prisma.warranty.count()).toBe(1);
  });

  it("refuses the same serial twice in one cart", async () => {
    const supplier = await makeSupplier();
    const item = await makeItem({ warrantyEligible: true });
    await receiveStock(supplier.id, item.id, 5, 12);

    const { status, body } = await readJson(
      await sell({
        items: [
          { id: item.id, quantity: 2, price: 150, serials: ["SAME", "SAME"] },
        ],
      })
    );

    expect(status).toBe(400);
    expect(body.error).toMatch(/twice/i);
    // Rejected before anything moved.
    expect(await prisma.bill.count()).toBe(0);
    expect(await prisma.warranty.count()).toBe(0);
  });

  it("allows units with no serial recorded", async () => {
    const supplier = await makeSupplier();
    const item = await makeItem({ warrantyEligible: true });
    await receiveStock(supplier.id, item.id, 5, 12);

    const { body } = await readJson(
      await sell({ items: [{ id: item.id, quantity: 2, price: 150 }] })
    );

    expect(body.data.warranties).toHaveLength(2);
    const warranties = await prisma.warranty.findMany();
    expect(warranties.every((w) => w.serialNumber === null)).toBe(true);
  });

  it("consumes one serial queue across a FIFO split of the same cart line", async () => {
    const supplier = await makeSupplier();
    const item = await makeItem({ warrantyEligible: true });

    // Two covered batches, so a 3-unit sale spans both.
    await receiveStock(supplier.id, item.id, 2, 12);
    await new Promise((r) => setTimeout(r, 10));
    await receiveStock(supplier.id, item.id, 2, 12);

    const { status } = await readJson(
      await sell({
        items: [
          {
            id: item.id,
            quantity: 3,
            price: 150,
            serials: ["A-1", "A-2", "A-3"],
          },
        ],
      })
    );

    expect(status).toBe(201);

    const serials = (
      await prisma.warranty.findMany({ orderBy: { warrantyNumber: "asc" } })
    ).map((w) => w.serialNumber);

    // Each serial used exactly once — a per-row queue would have restarted at
    // A-1 for the second batch and collided.
    expect(serials).toEqual(["A-1", "A-2", "A-3"]);
  });
});

describe("Supplier drawer accounting", () => {
  it("records how much of a cash payment left the till", async () => {
    const supplier = await makeSupplier();
    const item = await makeItem();

    const res = await restockPost(
      jsonRequest("/api/restock", {
        supplierId: supplier.id,
        items: [{ itemId: item.id, quantity: 10, unitCost: 100, sellingPrice: 150 }],
        paymentMethod: "CASH",
        amountPaid: 1000,
        // Only part of it came out of the drawer; the rest from the owner.
        drawerAmount: 400,
      }),
      {}
    );

    expect((await readJson(res)).status).toBe(201);

    const payment = await prisma.supplierPayment.findFirstOrThrow();
    expect(Number(payment.amount)).toBe(1000);
    expect(Number(payment.drawerAmount)).toBe(400);
  });

  it("never lets the drawer share exceed the payment", async () => {
    const supplier = await makeSupplier();
    const item = await makeItem();

    await restockPost(
      jsonRequest("/api/restock", {
        supplierId: supplier.id,
        items: [{ itemId: item.id, quantity: 10, unitCost: 100, sellingPrice: 150 }],
        paymentMethod: "CASH",
        amountPaid: 500,
        drawerAmount: 99999,
      }),
      {}
    );

    const payment = await prisma.supplierPayment.findFirstOrThrow();
    expect(Number(payment.drawerAmount)).toBe(500);
  });
});

describe("The merge did not break the inventory invariant", () => {
  it("holds after a warranty sale", async () => {
    const supplier = await makeSupplier();
    const item = await makeItem({ warrantyEligible: true });
    await receiveStock(supplier.id, item.id, 10, 12);

    await sell({
      items: [{ id: item.id, quantity: 4, price: 150, serials: ["S1"] }],
    });

    const after = await prisma.item.findUniqueOrThrow({ where: { id: item.id } });
    expect(after.stockQty.equals(new Prisma.Decimal(6))).toBe(true);
    expect(await stockDiscrepancies()).toEqual([]);
  });
});
