import { PaymentMethod, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { badRequest, notFound, ok, parseBody, route } from "@/lib/api";
import { requireManager } from "@/lib/authz";
import { settleCustomerSchema } from "@/lib/validation";
import { syncBillPaymentState } from "@/lib/ledger";
import { dec } from "@/lib/inventory";

/**
 * POST /api/payments/settle — receive cash from a customer against their debt.
 *
 * Applies oldest bill first. The amount owed on each bill is read from that
 * bill's payment rows, and the bill's cached `amountPaid` / `status` are
 * re-derived afterwards, so the cache can never diverge from the ledger.
 */
export const POST = route("POST /api/payments/settle", async (req) => {
  // Authorization first: an unauthenticated caller must never reach validation,
  // or the error it gets back tells them about the request shape.
  await requireManager();
  const body = await parseBody(req, settleCustomerSchema);

  const customer = await prisma.customer.findUnique({
    where: { id: body.customerId },
    select: { id: true, name: true },
  });

  if (!customer) throw notFound("Customer not found.");

  const result = await prisma.$transaction(async (tx) => {
    // Lock the customer's bills so two tills cannot apply the same cash twice.
    const bills = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "Bill"
       WHERE "customerId" = ${customer.id}
         AND "status" <> 'CANCELLED'
       ORDER BY "createdAt" ASC
       FOR UPDATE
    `;

    let remaining = dec(body.amount);
    let applied = dec(0);
    const touched: string[] = [];

    for (const { id } of bills) {
      if (remaining.lte(0)) break;

      const bill = await tx.bill.findUniqueOrThrow({
        where: { id },
        select: { id: true, totalAmount: true },
      });

      const paidSoFar =
        (await tx.payment.aggregate({ where: { billId: id }, _sum: { amount: true } }))
          ._sum.amount ?? new Prisma.Decimal(0);

      const owed = bill.totalAmount.minus(paidSoFar);
      if (owed.lte(0)) continue;

      const amount = Prisma.Decimal.min(remaining, owed);

      await tx.payment.create({
        data: {
          billId: id,
          customerId: customer.id,
          amount,
          method: PaymentMethod.CASH,
        },
      });

      await syncBillPaymentState(tx, id);

      remaining = remaining.minus(amount);
      applied = applied.plus(amount);
      touched.push(id);
    }

    if (applied.isZero()) {
      throw badRequest(`${customer.name} has no outstanding balance to settle.`);
    }

    return { applied, unapplied: remaining, billsSettled: touched.length };
  });

  return ok({
    applied: Number(result.applied),
    unapplied: Number(result.unapplied),
    billsSettled: result.billsSettled,
    message: result.unapplied.gt(0)
      ? `Applied Rs. ${result.applied.toFixed(2)}. Rs. ${result.unapplied.toFixed(
          2
        )} was more than the outstanding balance and was not recorded.`
      : `Applied Rs. ${result.applied.toFixed(2)} across ${result.billsSettled} bill(s).`,
  });
});
