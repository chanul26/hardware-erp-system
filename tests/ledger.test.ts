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

import { POST as restockPost } from "@/app/api/restock/route";
import { GET as suppliersGet } from "@/app/api/suppliers/route";
import { POST as supplierSettle } from "@/app/api/suppliers/settle/route";
import { POST as paymentSettle } from "@/app/api/payments/settle/route";
import { POST as billsPost } from "@/app/api/bills/route";
import { PATCH as chequeReturn } from "@/app/api/cheques/return/route";

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
  stockDiscrepancies,
} from "./helpers";

/** Debt as the suppliers list reports it. */
async function listedSupplierDebt(supplierId: string) {
  const { body } = await readJson(await suppliersGet(getRequest("/api/suppliers"), {}));
  return body.data.find((s: { id: string }) => s.id === supplierId)?.totalDebt ?? 0;
}

/** Debt as the ledger defines it — the settlement endpoint's view. */
async function ledgerSupplierDebt(supplierId: string) {
  const [ordered, paid] = await Promise.all([
    prisma.purchaseOrder.aggregate({
      where: { supplierId },
      _sum: { totalAmount: true },
    }),
    prisma.supplierPayment.aggregate({
      where: { supplierId },
      _sum: { amount: true },
    }),
  ]);
  return (
    Number(ordered._sum.totalAmount ?? 0) - Number(paid._sum.amount ?? 0)
  );
}

beforeEach(async () => {
  await resetDatabase();
  const admin = await makeUser("ADMIN");
  actAs("ADMIN", { id: admin.id });
});

describe("BUG-004 — one definition of supplier debt", () => {
  it("agrees between the list and the ledger for a cheque-paid delivery", async () => {
    const supplier = await makeSupplier();
    const item = await makeItem();

    // The exact case that used to break: paid entirely by cheque.
    const res = await restockPost(
      jsonRequest("/api/restock", {
        supplierId: supplier.id,
        items: [{ itemId: item.id, quantity: 10, unitCost: 100, sellingPrice: 150 }],
        paymentMethod: "CHEQUE",
        amountPaid: 0,
        chequeAmount: 1000,
        chequeNumber: "CHQ-001",
        bankName: "Test Bank",
        chequeDate: "2026-09-01",
      }),
      {}
    );

    const { status, body } = await readJson(res);
    expect(status).toBe(201);

    // A fully cheque-paid order is PAID, not UNPAID.
    expect(body.data.paymentStatus).toBe("PAID");
    expect(Number(body.data.amountPaid)).toBe(1000);

    expect(await listedSupplierDebt(supplier.id)).toBe(0);
    expect(await ledgerSupplierDebt(supplier.id)).toBe(0);
    expect(await listedSupplierDebt(supplier.id)).toBe(
      await ledgerSupplierDebt(supplier.id)
    );
  });

  it("agrees for a mixed cash-and-cheque delivery", async () => {
    const supplier = await makeSupplier();
    const item = await makeItem();

    await restockPost(
      jsonRequest("/api/restock", {
        supplierId: supplier.id,
        items: [{ itemId: item.id, quantity: 10, unitCost: 100, sellingPrice: 150 }],
        paymentMethod: "MIXED",
        amountPaid: 400,
        chequeAmount: 600,
        chequeNumber: "CHQ-002",
        bankName: "Test Bank",
        chequeDate: "2026-09-01",
      }),
      {}
    );

    const order = await prisma.purchaseOrder.findFirstOrThrow();
    expect(Number(order.amountPaid)).toBe(1000);
    expect(order.paymentStatus).toBe("PAID");

    expect(await listedSupplierDebt(supplier.id)).toBe(
      await ledgerSupplierDebt(supplier.id)
    );
  });

  it("reports the true balance for a partly paid delivery", async () => {
    const supplier = await makeSupplier();
    const item = await makeItem();

    await restockPost(
      jsonRequest("/api/restock", {
        supplierId: supplier.id,
        items: [{ itemId: item.id, quantity: 10, unitCost: 100, sellingPrice: 150 }],
        paymentMethod: "CASH",
        amountPaid: 300,
      }),
      {}
    );

    const order = await prisma.purchaseOrder.findFirstOrThrow();
    expect(order.paymentStatus).toBe("PARTIAL");
    expect(await listedSupplierDebt(supplier.id)).toBe(700);

    // Settling the rest must clear it and agree with the list.
    const settled = await supplierSettle(
      jsonRequest("/api/suppliers/settle", {
        supplierId: supplier.id,
        amount: 700,
      }),
      {}
    );

    expect((await readJson(settled)).status).toBe(200);
    expect(await listedSupplierDebt(supplier.id)).toBe(0);

    const after = await prisma.purchaseOrder.findFirstOrThrow();
    expect(after.paymentStatus).toBe("PAID");
  });

  it("refuses to settle when nothing is owed", async () => {
    const supplier = await makeSupplier();

    const res = await supplierSettle(
      jsonRequest("/api/suppliers/settle", { supplierId: supplier.id, amount: 100 }),
      {}
    );

    expect((await readJson(res)).status).toBe(400);
  });
});

describe("BUG-008 — a bounced cheque reinstates the debt", () => {
  it("reverses the payment and returns the order to unpaid", async () => {
    const supplier = await makeSupplier();
    const item = await makeItem();

    await restockPost(
      jsonRequest("/api/restock", {
        supplierId: supplier.id,
        items: [{ itemId: item.id, quantity: 10, unitCost: 100, sellingPrice: 150 }],
        paymentMethod: "CHEQUE",
        amountPaid: 0,
        chequeAmount: 1000,
        chequeNumber: "CHQ-BOUNCE",
        bankName: "Test Bank",
        chequeDate: "2026-09-01",
      }),
      {}
    );

    expect(await listedSupplierDebt(supplier.id)).toBe(0);

    const cheque = await prisma.supplierCheque.findFirstOrThrow();

    const res = await chequeReturn(
      jsonRequest("/api/cheques/return", { chequeId: cheque.id }, "PATCH"),
      {}
    );
    expect((await readJson(res)).status).toBe(200);

    // The money is owed again.
    expect(await listedSupplierDebt(supplier.id)).toBe(1000);
    expect(await ledgerSupplierDebt(supplier.id)).toBe(1000);

    const order = await prisma.purchaseOrder.findFirstOrThrow();
    expect(order.paymentStatus).toBe("UNPAID");
    expect(Number(order.amountPaid)).toBe(0);

    // Both events survive in the ledger: the original and its reversal.
    const payments = await prisma.supplierPayment.findMany({
      orderBy: { createdAt: "asc" },
    });
    expect(payments).toHaveLength(2);
    expect(Number(payments[0].amount)).toBe(1000);
    expect(Number(payments[1].amount)).toBe(-1000);
    expect(payments[1].reversesId).toBe(payments[0].id);

    const updated = await prisma.supplierCheque.findUniqueOrThrow({
      where: { id: cheque.id },
    });
    expect(updated.status).toBe("BOUNCED");
  });

  it("refuses to bounce the same cheque twice", async () => {
    const supplier = await makeSupplier();
    const item = await makeItem();

    await restockPost(
      jsonRequest("/api/restock", {
        supplierId: supplier.id,
        items: [{ itemId: item.id, quantity: 1, unitCost: 100, sellingPrice: 150 }],
        paymentMethod: "CHEQUE",
        amountPaid: 0,
        chequeAmount: 100,
        chequeNumber: "CHQ-TWICE",
        bankName: "Test Bank",
        chequeDate: "2026-09-01",
      }),
      {}
    );

    const cheque = await prisma.supplierCheque.findFirstOrThrow();
    const body = jsonRequest("/api/cheques/return", { chequeId: cheque.id }, "PATCH");

    expect((await readJson(await chequeReturn(body, {}))).status).toBe(200);

    const second = jsonRequest(
      "/api/cheques/return",
      { chequeId: cheque.id },
      "PATCH"
    );
    expect((await readJson(await chequeReturn(second, {}))).status).toBe(409);

    // Still exactly one reversal, not two.
    expect(await prisma.supplierPayment.count()).toBe(2);
  });
});

describe("Customer debt settlement", () => {
  it("keeps the bill cache and the payment ledger in agreement", async () => {
    const customer = await makeCustomer();
    const item = await makeItem();
    await addStock(item.id, 20, 100, 150);

    // Two credit sales, partly paid.
    for (const paid of [50, 0]) {
      await billsPost(
        jsonRequest("/api/bills", {
          items: [{ id: item.id, quantity: 2, price: 150 }],
          customerId: customer.id,
          amountPaid: paid,
        }),
        {}
      );
    }

    const owedBefore = 300 + 300 - 50;

    const res = await paymentSettle(
      jsonRequest("/api/payments/settle", {
        customerId: customer.id,
        amount: owedBefore,
      }),
      {}
    );
    expect((await readJson(res)).status).toBe(200);

    const bills = await prisma.bill.findMany();
    for (const bill of bills) {
      const paid = await prisma.payment.aggregate({
        where: { billId: bill.id },
        _sum: { amount: true },
      });
      // The cached column must equal the ledger, for every bill.
      expect(Number(bill.amountPaid)).toBe(Number(paid._sum.amount ?? 0));
      expect(bill.status).toBe("PAID");
    }
  });

  it("does not record more than is owed", async () => {
    const customer = await makeCustomer();
    const item = await makeItem();
    await addStock(item.id, 20, 100, 150);

    await billsPost(
      jsonRequest("/api/bills", {
        items: [{ id: item.id, quantity: 1, price: 150 }],
        customerId: customer.id,
        amountPaid: 0,
      }),
      {}
    );

    const { body } = await readJson(
      await paymentSettle(
        jsonRequest("/api/payments/settle", {
          customerId: customer.id,
          amount: 1000,
        }),
        {}
      )
    );

    expect(body.data.applied).toBe(150);
    expect(body.data.unapplied).toBe(850);

    const total = await prisma.payment.aggregate({ _sum: { amount: true } });
    expect(Number(total._sum.amount)).toBe(150);
  });
});

describe("Restock keeps inventory consistent", () => {
  it("creates a batch, writes a movement, and holds the invariant", async () => {
    const supplier = await makeSupplier();
    const item = await makeItem();

    await restockPost(
      jsonRequest("/api/restock", {
        supplierId: supplier.id,
        items: [{ itemId: item.id, quantity: 25, unitCost: 80, sellingPrice: 120 }],
        paymentMethod: "CASH",
        amountPaid: 2000,
      }),
      {}
    );

    const after = await prisma.item.findUniqueOrThrow({ where: { id: item.id } });
    expect(Number(after.stockQty)).toBe(25);

    const batch = await prisma.purchaseBatch.findFirstOrThrow();
    expect(Number(batch.remainingQty)).toBe(25);
    expect(batch.supplierId).toBe(supplier.id);
    expect(batch.purchaseOrderId).not.toBeNull();

    // Inbound stock is now recorded in the audit trail — it previously was not,
    // which made reconciliation impossible.
    const movement = await prisma.stockMovement.findFirstOrThrow();
    expect(movement.type).toBe("PURCHASE");
    expect(Number(movement.quantity)).toBe(25);
    expect(Number(movement.balance)).toBe(25);

    expect(await stockDiscrepancies()).toEqual([]);
  });

  it("rejects a delivery paid for more than its value", async () => {
    const supplier = await makeSupplier();
    const item = await makeItem();

    const res = await restockPost(
      jsonRequest("/api/restock", {
        supplierId: supplier.id,
        items: [{ itemId: item.id, quantity: 1, unitCost: 100, sellingPrice: 150 }],
        paymentMethod: "CASH",
        amountPaid: 5000,
      }),
      {}
    );

    expect((await readJson(res)).status).toBe(400);
    expect(await prisma.purchaseOrder.count()).toBe(0);
  });
});
