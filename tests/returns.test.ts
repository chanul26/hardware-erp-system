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

import { POST as billsPost } from "@/app/api/bills/route";
import { GET as billReturnGet } from "@/app/api/bills/return/route";
import { actAs } from "./auth-state";
import {
  addStock,
  getRequest,
  jsonRequest,
  makeItem,
  makeUser,
  prisma,
  readJson,
  resetDatabase,
  stockDiscrepancies,
} from "./helpers";

let itemId: string;
let batchId: string;
let saleLineId: string;
let billNumber: string;

beforeEach(async () => {
  await resetDatabase();
  const admin = await makeUser("ADMIN");
  actAs("ADMIN", { id: admin.id });

  const item = await makeItem();
  itemId = item.id;
  batchId = (await addStock(item.id, 10, 100, 150)).id;

  const { body } = await readJson(
    await billsPost(
      jsonRequest("/api/bills", {
        items: [{ id: itemId, quantity: 4, price: 150 }],
      }),
      {}
    )
  );

  billNumber = body.data.billNumber;
  saleLineId = (await prisma.billItem.findFirstOrThrow()).id;
});

describe("Returns", () => {
  it("restores stock to the batch it was sold from", async () => {
    const res = await billsPost(
      jsonRequest("/api/bills", {
        items: [
          {
            isReturn: true,
            id: itemId,
            originalBillItemId: saleLineId,
            quantity: -2,
            price: 150,
          },
        ],
      }),
      {}
    );

    expect((await readJson(res)).status).toBe(201);

    const item = await prisma.item.findUniqueOrThrow({ where: { id: itemId } });
    expect(Number(item.stockQty)).toBe(8); // 10 - 4 + 2

    const batch = await prisma.purchaseBatch.findUniqueOrThrow({
      where: { id: batchId },
    });
    expect(Number(batch.remainingQty)).toBe(8);

    const line = await prisma.billItem.findUniqueOrThrow({ where: { id: saleLineId } });
    expect(Number(line.returnedQty)).toBe(2);

    expect(await stockDiscrepancies()).toEqual([]);
  });

  it("refuses to return more than was sold", async () => {
    const res = await billsPost(
      jsonRequest("/api/bills", {
        items: [
          {
            isReturn: true,
            id: itemId,
            originalBillItemId: saleLineId,
            quantity: -5,
            price: 150,
          },
        ],
      }),
      {}
    );

    expect((await readJson(res)).status).toBe(409);

    const line = await prisma.billItem.findUniqueOrThrow({ where: { id: saleLineId } });
    expect(Number(line.returnedQty)).toBe(0);
  });

  it("refuses a second return that would exceed the original quantity", async () => {
    const makeReturn = (qty: number) =>
      billsPost(
        jsonRequest("/api/bills", {
          items: [
            {
              isReturn: true,
              id: itemId,
              originalBillItemId: saleLineId,
              quantity: -qty,
              price: 150,
            },
          ],
        }),
        {}
      );

    expect((await readJson(await makeReturn(3))).status).toBe(201);
    expect((await readJson(await makeReturn(2))).status).toBe(409);

    const line = await prisma.billItem.findUniqueOrThrow({ where: { id: saleLineId } });
    expect(Number(line.returnedQty)).toBe(3);
    expect(await stockDiscrepancies()).toEqual([]);
  });

  it("refunds at the original price, ignoring any price the client sends", async () => {
    const { body } = await readJson(
      await billsPost(
        jsonRequest("/api/bills", {
          items: [
            {
              isReturn: true,
              id: itemId,
              originalBillItemId: saleLineId,
              quantity: -1,
              // An inflated refund request.
              price: 99999,
            },
          ],
        }),
        {}
      )
    );

    // Refunded at 150, the price actually charged.
    expect(Number(body.data.totalAmount)).toBe(-150);
  });

  it("blocks a cashier from processing a return", async () => {
    actAs("CASHIER");

    const res = await billsPost(
      jsonRequest("/api/bills", {
        items: [
          {
            isReturn: true,
            id: itemId,
            originalBillItemId: saleLineId,
            quantity: -1,
            price: 150,
          },
        ],
      }),
      {}
    );

    // This rule previously existed only as a hidden button in the UI.
    expect((await readJson(res)).status).toBe(403);
  });

  it("stops offering a line once it is fully returned", async () => {
    await billsPost(
      jsonRequest("/api/bills", {
        items: [
          {
            isReturn: true,
            id: itemId,
            originalBillItemId: saleLineId,
            quantity: -4,
            price: 150,
          },
        ],
      }),
      {}
    );

    const res = await billReturnGet(
      getRequest(`/api/bills/return?billNumber=${billNumber}`),
      {}
    );

    const { status, body } = await readJson(res);
    expect(status).toBe(400);
    expect(body.error).toMatch(/already been returned/i);
  });

  it("reports what remains returnable", async () => {
    const { body } = await readJson(
      await billReturnGet(
        getRequest(`/api/bills/return?billNumber=${billNumber}`),
        {}
      )
    );

    expect(body.data.billItems).toHaveLength(1);
    expect(body.data.billItems[0].availableToReturn).toBe(4);
  });
});
