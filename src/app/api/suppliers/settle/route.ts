import { PaymentMethod, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { badRequest, notFound, ok, parseBody, route } from "@/lib/api";
import { requireManager } from "@/lib/authz";
import { settleSupplierSchema } from "@/lib/validation";
import { syncPurchaseOrderPaymentState } from "@/lib/ledger";
import { dec } from "@/lib/inventory";

/**
 * POST /api/suppliers/settle — pay a supplier against outstanding deliveries.
 *
 * Oldest order first, amount owed read from the supplier payment ledger, and
 * the order's cached totals re-derived after each payment.
 */
export const POST = route("POST /api/suppliers/settle", async (req) => {
  // Authorization first: an unauthenticated caller must never reach validation,
  // or the error it gets back tells them about the request shape.
  await requireManager();
  const body = await parseBody(req, settleSupplierSchema);

  const supplier = await prisma.supplier.findUnique({
    where: { id: body.supplierId },
    select: { id: true, name: true },
  });

  if (!supplier) throw notFound("Supplier not found.");

  // How the supplier was actually paid, and how much of it physically left the
  // shop drawer. A "cash" payment is often funded from the owner's wallet or a
  // bank transfer, and is routinely split between the two — so the drawer's
  // share is an amount, not a flag, and only that much reduces cash in hand.
  const drawerTotal =
    body.method === "CASH"
      ? Prisma.Decimal.min(dec(body.drawerAmount ?? 0), dec(body.amount))
      : dec(0);

  // Spread across the orders in the same proportion as the payment, so the
  // drawer's share always sums back to what was taken out of the till.
  const drawerShare = dec(body.amount).gt(0)
    ? drawerTotal.div(dec(body.amount))
    : dec(0);

  const result = await prisma.$transaction(async (tx) => {
    let drawerLeft = drawerTotal;
    const orders = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "PurchaseOrder"
       WHERE "supplierId" = ${supplier.id}
         AND "status" <> 'CANCELLED'
       ORDER BY "createdAt" ASC
       FOR UPDATE
    `;

    let remaining = dec(body.amount);
    let applied = dec(0);
    let count = 0;

    for (const { id } of orders) {
      if (remaining.lte(0)) break;

      const order = await tx.purchaseOrder.findUniqueOrThrow({
        where: { id },
        select: { id: true, totalAmount: true },
      });

      const paidSoFar =
        (
          await tx.supplierPayment.aggregate({
            where: { purchaseOrderId: id },
            _sum: { amount: true },
          })
        )._sum.amount ?? new Prisma.Decimal(0);

      const owed = order.totalAmount.minus(paidSoFar);
      if (owed.lte(0)) continue;

      const amount = Prisma.Decimal.min(remaining, owed);

      // The last order settled takes whatever drawer money is left rather than
      // its rounded share, so the parts always add back up to the total.
      const drawerForThisOrder = Prisma.Decimal.min(
        amount.mul(drawerShare).toDecimalPlaces(2),
        drawerLeft
      );

      await tx.supplierPayment.create({
        data: {
          purchaseOrderId: id,
          supplierId: supplier.id,
          amount,
          method: body.method as PaymentMethod,
          drawerAmount: drawerForThisOrder,
        },
      });

      drawerLeft = drawerLeft.minus(drawerForThisOrder);

      await syncPurchaseOrderPaymentState(tx, id);

      remaining = remaining.minus(amount);
      applied = applied.plus(amount);
      count += 1;
    }

    if (applied.isZero()) {
      throw badRequest(`Nothing is currently owed to ${supplier.name}.`);
    }

    return {
      applied,
      unapplied: remaining,
      ordersSettled: count,
      fromDrawer: drawerTotal.minus(drawerLeft),
    };
  });

  return ok({
    applied: Number(result.applied),
    unapplied: Number(result.unapplied),
    ordersSettled: result.ordersSettled,
    fromDrawer: Number(result.fromDrawer),
    message: result.unapplied.gt(0)
      ? `Paid Rs. ${result.applied.toFixed(2)}. Rs. ${result.unapplied.toFixed(
          2
        )} exceeded the outstanding balance and was not recorded.`
      : `Paid Rs. ${result.applied.toFixed(2)} across ${result.ordersSettled} order(s).`,
  });
});
