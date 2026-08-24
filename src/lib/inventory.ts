import { Prisma, StockMovementType } from "@prisma/client";
import { badRequest, conflict } from "@/lib/api";

/**
 * Inventory primitives.
 *
 * Every stock mutation here is a single SQL statement with its guard in the
 * WHERE clause, so the check and the write cannot be separated by another
 * transaction. The previous read-then-write pattern let two concurrent sales
 * of the last unit both succeed and drive stock negative.
 *
 * All of these take a transaction client and must be called inside
 * `prisma.$transaction`.
 */

export type Tx = Prisma.TransactionClient;

export const dec = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);

export type FifoAllocation = {
  batchId: string;
  quantity: Prisma.Decimal;
  buyingPrice: Prisma.Decimal;
  sellingPrice: Prisma.Decimal;
  /**
   * Supplier warranty attached to this cost layer. Terms are agreed per
   * shipment, so a warranty can only be issued from a batch that came with
   * cover — null means it did not.
   */
  warrantyMonths: number | null;
  supplierId: string | null;
};

/**
 * Applies a signed change to an item's stock and returns the resulting balance.
 * Refuses to complete if the result would be negative — the guard lives in the
 * WHERE clause, so this is safe under concurrency.
 */
export async function adjustStock(
  tx: Tx,
  itemId: string,
  delta: Prisma.Decimal,
  itemName = "item"
): Promise<Prisma.Decimal> {
  const rows = await tx.$queryRaw<{ stockQty: Prisma.Decimal }[]>`
    UPDATE "Item"
       SET "stockQty" = "stockQty" + ${delta.toString()}::decimal,
           "updatedAt" = NOW()
     WHERE "id" = ${itemId}
       AND "stockQty" + ${delta.toString()}::decimal >= 0
    RETURNING "stockQty"
  `;

  if (rows.length === 0) {
    // Either the item vanished, or there was not enough stock. Distinguish so
    // the cashier gets a message they can act on.
    const exists = await tx.item.findUnique({
      where: { id: itemId },
      select: { stockQty: true, unit: true },
    });

    if (!exists) throw badRequest(`Item no longer exists: ${itemName}`);

    throw conflict(
      `Not enough stock for ${itemName}. Available: ${exists.stockQty} ${exists.unit}.`
    );
  }

  return rows[0].stockQty;
}

/**
 * Consumes `quantity` from an item's FIFO cost layers, oldest first.
 *
 * Locks the candidate batches with SELECT ... FOR UPDATE so concurrent sales of
 * the same item serialise rather than double-spending a layer.
 *
 * Throws if the batches cannot cover the quantity. That should be impossible —
 * `Item.stockQty` is maintained equal to the sum of remaining batch quantities —
 * so it means the invariant has been broken and the sale must not proceed on
 * untracked stock.
 */
export async function consumeFifo(
  tx: Tx,
  itemId: string,
  quantity: Prisma.Decimal,
  itemName = "item"
): Promise<FifoAllocation[]> {
  const batches = await tx.$queryRaw<
    {
      id: string;
      remainingQty: Prisma.Decimal;
      buyingPrice: Prisma.Decimal;
      sellingPrice: Prisma.Decimal;
      warrantyMonths: number | null;
      supplierId: string | null;
    }[]
  >`
    SELECT "id", "remainingQty", "buyingPrice", "sellingPrice",
           "warrantyMonths", "supplierId"
      FROM "PurchaseBatch"
     WHERE "itemId" = ${itemId}
       AND "remainingQty" > 0
     ORDER BY "createdAt" ASC, "id" ASC
     FOR UPDATE
  `;

  const allocations: FifoAllocation[] = [];
  let outstanding = quantity;

  for (const batch of batches) {
    if (outstanding.lte(0)) break;

    const take = Prisma.Decimal.min(outstanding, batch.remainingQty);

    await tx.purchaseBatch.update({
      where: { id: batch.id },
      data: { remainingQty: { decrement: take } },
    });

    allocations.push({
      batchId: batch.id,
      quantity: take,
      buyingPrice: batch.buyingPrice,
      sellingPrice: batch.sellingPrice,
      warrantyMonths: batch.warrantyMonths,
      supplierId: batch.supplierId,
    });

    outstanding = outstanding.minus(take);
  }

  if (outstanding.gt(0)) {
    throw conflict(
      `Stock records for ${itemName} are inconsistent: ${outstanding} unit(s) ` +
        `could not be matched to a purchase batch. Run a stock reconciliation ` +
        `before selling this item.`
    );
  }

  return allocations;
}

/**
 * Consumes from one specific batch — used when the cashier picks a price tier
 * from the batch selector rather than taking FIFO order.
 */
export async function consumeBatch(
  tx: Tx,
  batchId: string,
  quantity: Prisma.Decimal,
  itemName = "item"
): Promise<FifoAllocation> {
  const rows = await tx.$queryRaw<
    {
      id: string;
      remainingQty: Prisma.Decimal;
      buyingPrice: Prisma.Decimal;
      sellingPrice: Prisma.Decimal;
      warrantyMonths: number | null;
      supplierId: string | null;
    }[]
  >`
    UPDATE "PurchaseBatch"
       SET "remainingQty" = "remainingQty" - ${quantity.toString()}::decimal
     WHERE "id" = ${batchId}
       AND "remainingQty" >= ${quantity.toString()}::decimal
    RETURNING "id", "remainingQty", "buyingPrice", "sellingPrice",
              "warrantyMonths", "supplierId"
  `;

  if (rows.length === 0) {
    const batch = await tx.purchaseBatch.findUnique({
      where: { id: batchId },
      select: { remainingQty: true },
    });

    if (!batch) throw badRequest(`Selected batch no longer exists for ${itemName}.`);

    throw conflict(
      `Not enough stock in the selected batch for ${itemName}. Available: ${batch.remainingQty}.`
    );
  }

  return {
    batchId: rows[0].id,
    quantity,
    buyingPrice: rows[0].buyingPrice,
    sellingPrice: rows[0].sellingPrice,
    warrantyMonths: rows[0].warrantyMonths,
    supplierId: rows[0].supplierId,
  };
}

/** Returns stock to a batch, capped at that batch's original quantity. */
export async function restoreBatch(
  tx: Tx,
  batchId: string,
  quantity: Prisma.Decimal
): Promise<void> {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    UPDATE "PurchaseBatch"
       SET "remainingQty" = "remainingQty" + ${quantity.toString()}::decimal
     WHERE "id" = ${batchId}
       AND "remainingQty" + ${quantity.toString()}::decimal <= "quantity"
    RETURNING "id"
  `;

  if (rows.length === 0) {
    throw conflict(
      "Cannot return this quantity — it would exceed the original batch size."
    );
  }
}

/**
 * Writes an audit row. Every stock change in the system goes through here, so
 * the movement log can be reconciled against Item.stockQty.
 */
export async function recordMovement(
  tx: Tx,
  input: {
    itemId: string;
    type: StockMovementType;
    quantity: Prisma.Decimal;
    balance: Prisma.Decimal;
    userId?: string | null;
    billId?: string | null;
    purpose?: string | null;
    note?: string | null;
  }
): Promise<void> {
  await tx.stockMovement.create({
    data: {
      itemId: input.itemId,
      type: input.type,
      quantity: input.quantity,
      balance: input.balance,
      userId: input.userId ?? null,
      billId: input.billId ?? null,
      purpose: input.purpose ?? null,
      note: input.note ?? null,
    },
  });
}

/**
 * The system's central inventory invariant:
 *   Item.stockQty === SUM(PurchaseBatch.remainingQty)
 *
 * Returns every item that violates it. Should always be empty; exposed so it
 * can be asserted in tests and surfaced as an admin health check.
 */
export async function findStockDiscrepancies(client: Tx | typeof import("@/lib/prisma").prisma) {
  return client.$queryRaw<
    { id: string; name: string; stockQty: Prisma.Decimal; batchTotal: Prisma.Decimal }[]
  >`
    SELECT i."id",
           i."name",
           i."stockQty",
           COALESCE(SUM(b."remainingQty"), 0) AS "batchTotal"
      FROM "Item" i
      LEFT JOIN "PurchaseBatch" b ON b."itemId" = i."id"
     GROUP BY i."id", i."name", i."stockQty"
    HAVING i."stockQty" <> COALESCE(SUM(b."remainingQty"), 0)
  `;
}

/**
 * Allocates the next number for a document type. The UPDATE ... RETURNING is
 * atomic and holds a row lock for the rest of the transaction, so concurrent
 * checkouts get distinct, gapless numbers instead of colliding on a truncated
 * timestamp.
 */
export async function nextDocumentNumber(
  tx: Tx,
  kind: "BILL" | "PURCHASE",
  prefix: string
): Promise<string> {
  const rows = await tx.$queryRaw<{ value: number }[]>`
    UPDATE "DocumentCounter"
       SET "value" = "value" + 1
     WHERE "id" = ${kind}
    RETURNING "value"
  `;

  if (rows.length === 0) {
    throw new Error(`Document counter '${kind}' is missing. Run migrations.`);
  }

  return `${prefix}-${String(rows[0].value).padStart(6, "0")}`;
}
