import {
  OrderStatus,
  PaymentMethod,
  Prisma,
  StockMovementType,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { badRequest, conflict, ok, parseBody, route } from "@/lib/api";
import { requireManager } from "@/lib/authz";
import { restockSchema } from "@/lib/validation";
import { syncPurchaseOrderPaymentState } from "@/lib/ledger";
import {
  adjustStock,
  dec,
  nextDocumentNumber,
  recordMovement,
} from "@/lib/inventory";

/**
 * POST /api/restock — record an inbound delivery from a supplier.
 *
 * Three things changed from the original:
 *  1. The order total is computed here, never taken from the request.
 *  2. Payment status is derived from the supplier payment ledger *after* the
 *     cash and cheque rows are written, so a cheque-paid delivery is no longer
 *     recorded as UNPAID while a payment for the full amount sits against it.
 *  3. Every receipt writes a StockMovement, so the audit trail can actually be
 *     reconciled against Item.stockQty.
 */
export const POST = route("POST /api/restock", async (req) => {
  const user = await requireManager();
  const body = await parseBody(req, restockSchema);

  const supplier = await prisma.supplier.findUnique({
    where: { id: body.supplierId },
    select: { id: true, isActive: true, name: true },
  });

  if (!supplier) throw badRequest("The selected supplier no longer exists.");
  if (!supplier.isActive) throw conflict("That supplier is archived.");

  // Every referenced item must exist before we start writing.
  const itemIds = [...new Set(body.items.map((line) => line.itemId))];
  const items = await prisma.item.findMany({
    where: { id: { in: itemIds } },
    select: { id: true, name: true, isActive: true, warrantyEligible: true },
  });

  if (items.length !== itemIds.length) {
    throw badRequest("One or more items in this delivery no longer exist.");
  }

  const itemsById = new Map(items.map((item) => [item.id, item]));

  for (const line of body.items) {
    const item = itemsById.get(line.itemId)!;
    if (!item.isActive) throw conflict(`${item.name} is archived and cannot be restocked.`);
    if (line.sellingPrice > 0 && line.sellingPrice < line.unitCost) {
      throw badRequest(
        `${item.name}: selling price cannot be below the cost you paid.`
      );
    }
  }

  const totalAmount = body.items.reduce(
    (sum, line) => sum.plus(dec(line.quantity).mul(dec(line.unitCost))),
    dec(0)
  );

  // Cash paid to a supplier normally comes from the owner's wallet rather than
  // the shop till, and is often a mix of both — so the drawer's share is stated,
  // never assumed, and can never exceed what was actually paid in cash.
  const cashPaid = dec(body.paymentMethod === "CHEQUE" ? 0 : body.amountPaid);
  const fromDrawer = Prisma.Decimal.min(dec(body.drawerAmount ?? 0), cashPaid);
  const chequePaid = dec(body.paymentMethod === "CASH" ? 0 : body.chequeAmount);

  if (cashPaid.plus(chequePaid).gt(totalAmount)) {
    throw badRequest(
      "Total paid is more than the value of the delivery. Check the amounts."
    );
  }

  const order = await prisma.$transaction(
    async (tx) => {
      const orderNumber = await nextDocumentNumber(tx, "PURCHASE", "GRN");

      const purchaseOrder = await tx.purchaseOrder.create({
        data: {
          orderNumber,
          supplierId: supplier.id,
          status: OrderStatus.RECEIVED,
          totalAmount,
          notes: body.notes ?? "Direct inbound restock",
          receivedAt: new Date(),
          purchaseItems: {
            create: body.items.map((line) => ({
              itemId: line.itemId,
              quantity: dec(line.quantity),
              unitCost: dec(line.unitCost),
              totalCost: dec(line.quantity).mul(dec(line.unitCost)),
              receivedQty: dec(line.quantity),
            })),
          },
        },
        select: { id: true, orderNumber: true },
      });

      // ── Payments ──
      if (cashPaid.gt(0)) {
        await tx.supplierPayment.create({
          data: {
            purchaseOrderId: purchaseOrder.id,
            supplierId: supplier.id,
            amount: cashPaid,
            method: PaymentMethod.CASH,
            drawerAmount: fromDrawer,
          },
        });
      }

      if (chequePaid.gt(0)) {
        const payment = await tx.supplierPayment.create({
          data: {
            purchaseOrderId: purchaseOrder.id,
            supplierId: supplier.id,
            amount: chequePaid,
            method: PaymentMethod.CHEQUE,
            reference: body.chequeNumber ?? null,
          },
        });

        await tx.supplierCheque.create({
          data: {
            supplierPaymentId: payment.id,
            chequeNumber: body.chequeNumber!,
            bank: body.bankName!,
            amount: chequePaid,
            chequeDate: new Date(body.chequeDate!),
          },
        });
      }

      // ── Stock, batches and the audit trail ──
      for (const line of body.items) {
        const item = itemsById.get(line.itemId)!;
        const quantity = dec(line.quantity);

        const balance = await adjustStock(tx, line.itemId, quantity, item.name);

        await tx.purchaseBatch.create({
          data: {
            itemId: line.itemId,
            purchaseOrderId: purchaseOrder.id,
            supplierId: supplier.id,
            quantity,
            remainingQty: quantity,
            buyingPrice: dec(line.unitCost),
            sellingPrice: dec(line.sellingPrice),

            // Warranty terms are agreed per shipment, so they belong to the
            // batch. Recorded only for products flagged warranty-eligible —
            // terms sent for anything else are dropped rather than stored
            // against stock that can never issue a warranty.
            warrantyMonths: item.warrantyEligible
              ? (line.warrantyMonths ?? null)
              : null,
            supplierWarrantyRef: item.warrantyEligible
              ? (line.supplierWarrantyRef ?? null)
              : null,
          },
        });

        // The master price is the default for future batches; historical cost
        // stays pinned to each batch.
        await tx.item.update({
          where: { id: line.itemId },
          data: {
            buyingPrice: dec(line.unitCost),
            ...(line.sellingPrice > 0
              ? { sellingPrice: dec(line.sellingPrice) }
              : {}),
          },
        });

        await recordMovement(tx, {
          itemId: line.itemId,
          type: StockMovementType.PURCHASE,
          quantity,
          balance,
          userId: user.id,
          note: `Received on ${purchaseOrder.orderNumber} from ${supplier.name}`,
        });
      }

      const state = await syncPurchaseOrderPaymentState(tx, purchaseOrder.id);

      return {
        id: purchaseOrder.id,
        orderNumber: purchaseOrder.orderNumber,
        totalAmount,
        amountPaid: state.amountPaid,
        paymentStatus: state.paymentStatus,
        fromDrawer,
      };
    },
    { timeout: 20_000 }
  );

  return ok(order, 201);
});
