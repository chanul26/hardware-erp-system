import { PaymentMethod, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { badRequest, notFound, ok, parseBody, route } from "@/lib/api";
import { requireManager } from "@/lib/authz";
import { settleSupplierSchema } from "@/lib/validation";
import { syncPurchaseOrderPaymentState } from "@/lib/ledger";
import { dec } from "@/lib/inventory";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { supplierId, amount } = body;

    // How the supplier was actually paid. Cash is the common case, but a
    // "cash" payment is usually funded from the owner's wallet or a bank
    // transfer — only when it came out of the shop till does it reduce cash
    // in hand, so that has to be stated rather than assumed.
    const method = ["CASH", "CARD", "CHEQUE", "BANK_TRANSFER"].includes(
      body.method
    )
      ? body.method
      : "CASH";

    let remainingCash = Number(amount);

    // How much of the settlement came out of the shop till. Often only part of
    // it — the rest from the owner's wallet — so this is an amount, not a
    // flag. It is spread across the orders in the same proportion as the
    // payment itself, so the drawer's share always sums back to what was
    // taken out of it.
    const drawerTotal =
      method === "CASH"
        ? Math.min(
            Math.max(Number(body.drawerAmount) || 0, 0),
            remainingCash
          )
        : 0;

    const drawerShare = remainingCash > 0 ? drawerTotal / remainingCash : 0;

    let drawerLeft = drawerTotal;

    if (!supplierId || remainingCash <= 0) {
      return NextResponse.json({ error: "Invalid payment data" }, { status: 400 });
    }
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

  const result = await prisma.$transaction(async (tx) => {
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

      await tx.supplierPayment.create({
        data: {
          purchaseOrderId: id,
          supplierId: supplier.id,
          amount,
          method: PaymentMethod.CASH,
        },
      });

      for (const order of unpaidOrders) {
        if (remainingCash <= 0) break; 

        const orderTotal = Number(order.totalAmount);
        
        // Calculate exact debt ignoring text status
        const paidSoFar = order.supplierPayments.reduce((sum, p) => sum + Number(p.amount), 0);
        const debtOnThisOrder = orderTotal - paidSoFar;

        if (debtOnThisOrder > 0) {
          const amountToApply = Math.min(remainingCash, debtOnThisOrder);
          const newAmountPaid = paidSoFar + amountToApply;
          const newStatus = newAmountPaid >= orderTotal ? "PAID" : "PARTIAL";

          // 2. Update the Purchase Order
          await tx.purchaseOrder.update({
            where: { id: order.id },
            data: {
              amountPaid: newAmountPaid,
              paymentStatus: newStatus
            } as any 
          });

          // The last order to be settled takes whatever drawer money is left
          // rather than its rounded share, so the parts always add back up to
          // the total taken from the till.
          const drawerForThisOrder = Math.min(
            Math.round(amountToApply * drawerShare * 100) / 100,
            drawerLeft
          );

          // 3. Log the permanent Outgoing Payment Record
          await tx.supplierPayment.create({
            data: {
              purchaseOrderId: order.id,
              supplierId: supplierId,
              amount: amountToApply,
              method,
              drawerAmount: drawerForThisOrder
            }
          });

          drawerLeft -= drawerForThisOrder;
          remainingCash -= amountToApply;
        }
      }
    });

    return NextResponse.json({ success: true, message: "Payment to supplier successfully recorded." });
  } catch (error: any) {
    console.error("SUPPLIER SETTLEMENT ERROR:", error);
    return NextResponse.json({ error: "Failed to process supplier payment" }, { status: 500 });
  }
}
      await syncPurchaseOrderPaymentState(tx, id);

      remaining = remaining.minus(amount);
      applied = applied.plus(amount);
      count += 1;
    }

    if (applied.isZero()) {
      throw badRequest(`Nothing is currently owed to ${supplier.name}.`);
    }

    return { applied, unapplied: remaining, ordersSettled: count };
  });

  return ok({
    applied: Number(result.applied),
    unapplied: Number(result.unapplied),
    ordersSettled: result.ordersSettled,
    message: result.unapplied.gt(0)
      ? `Paid Rs. ${result.applied.toFixed(2)}. Rs. ${result.unapplied.toFixed(
          2
        )} exceeded the outstanding balance and was not recorded.`
      : `Paid Rs. ${result.applied.toFixed(2)} across ${result.ordersSettled} order(s).`,
  });
});
