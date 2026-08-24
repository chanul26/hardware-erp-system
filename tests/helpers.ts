import { Prisma, PrismaClient, Role } from "@prisma/client";

export const prisma = new PrismaClient();

/** Truncates every business table between tests, leaving the schema in place. */
export async function resetDatabase() {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      "StockMovement", "BillItem", "Payment", "Cheque", "Bill",
      "SupplierCheque", "SupplierPayment", "PurchaseItem", "PurchaseBatch",
      "PurchaseOrder", "Item", "Customer", "Supplier",
      "Account", "Session", "User"
    RESTART IDENTITY CASCADE
  `);

  await prisma.documentCounter.upsert({
    where: { id: "BILL" },
    create: { id: "BILL", value: 0 },
    update: { value: 0 },
  });
  await prisma.documentCounter.upsert({
    where: { id: "PURCHASE" },
    create: { id: "PURCHASE", value: 0 },
    update: { value: 0 },
  });
}

/** Builds a request object of the shape route handlers expect. */
export function jsonRequest(
  url: string,
  body?: unknown,
  method = "POST"
): Request {
  return new Request(`http://localhost:3001${url}`, {
    method,
    headers: { "Content-Type": "application/json" },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

export function getRequest(url: string): Request {
  return new Request(`http://localhost:3001${url}`, { method: "GET" });
}

export async function readJson(response: Response) {
  return { status: response.status, body: await response.json() };
}

// ── Fixtures ──────────────────────────────────────────────────────────

export async function makeUser(role: Role = Role.ADMIN) {
  return prisma.user.create({
    data: {
      email: `${role.toLowerCase()}-${Date.now()}-${Math.random()}@test.local`,
      name: role,
      password: "not-used",
      role,
    },
  });
}

export async function makeSupplier(name = "Test Supplier") {
  return prisma.supplier.create({ data: { name } });
}

export async function makeCustomer(name = "Test Customer") {
  return prisma.customer.create({ data: { name, phone: "0770000000" } });
}

export async function makeItem(
  overrides: Partial<Prisma.ItemCreateInput> = {}
) {
  return prisma.item.create({
    data: {
      barcode: `BC-${Math.random().toString(36).slice(2, 10)}`,
      name: "Test Item",
      unit: "pcs",
      buyingPrice: new Prisma.Decimal(100),
      sellingPrice: new Prisma.Decimal(150),
      stockQty: new Prisma.Decimal(0),
      ...overrides,
    },
  });
}

/**
 * Adds stock as a purchase batch, keeping the
 * `Item.stockQty === SUM(batch.remainingQty)` invariant intact.
 */
export async function addStock(
  itemId: string,
  qty: number,
  buyingPrice = 100,
  sellingPrice = 150
) {
  const batch = await prisma.purchaseBatch.create({
    data: {
      itemId,
      quantity: new Prisma.Decimal(qty),
      remainingQty: new Prisma.Decimal(qty),
      buyingPrice: new Prisma.Decimal(buyingPrice),
      sellingPrice: new Prisma.Decimal(sellingPrice),
    },
  });

  await prisma.item.update({
    where: { id: itemId },
    data: { stockQty: { increment: new Prisma.Decimal(qty) } },
  });

  return batch;
}

/** The system's central inventory invariant. Should always return []. */
export async function stockDiscrepancies() {
  return prisma.$queryRaw<
    { id: string; name: string; stockQty: Prisma.Decimal; batchTotal: Prisma.Decimal }[]
  >`
    SELECT i."id", i."name", i."stockQty",
           COALESCE(SUM(b."remainingQty"), 0) AS "batchTotal"
      FROM "Item" i
      LEFT JOIN "PurchaseBatch" b ON b."itemId" = i."id"
     GROUP BY i."id", i."name", i."stockQty"
    HAVING i."stockQty" <> COALESCE(SUM(b."remainingQty"), 0)
  `;
}
