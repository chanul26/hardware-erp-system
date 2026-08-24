import { BillStatus, Prisma, PurchasePaymentStatus } from "@prisma/client";
import type { Tx } from "@/lib/inventory";

/**
 * Debt has exactly one definition in this system: the payment ledger.
 *
 * `Bill.amountPaid` / `Bill.status` and `PurchaseOrder.amountPaid` /
 * `.paymentStatus` are caches of that ledger, never independent facts. Every
 * write that touches a payment calls the matching sync function here, so the
 * two can never drift apart.
 *
 * Previously the suppliers list derived debt from `amountPaid` while the
 * settlement endpoint derived it from the payment rows, and the two disagreed
 * on every cheque purchase.
 */

/** Recomputes a bill's paid amount and status from its payments. */
export async function syncBillPaymentState(
  tx: Tx,
  billId: string
): Promise<{ amountPaid: Prisma.Decimal; status: BillStatus }> {
  const [bill, aggregate] = await Promise.all([
    tx.bill.findUnique({
      where: { id: billId },
      select: { totalAmount: true, status: true },
    }),
    tx.payment.aggregate({
      where: { billId },
      _sum: { amount: true },
    }),
  ]);

  if (!bill) {
    throw new Error(`Cannot sync payment state: bill ${billId} not found.`);
  }

  const amountPaid = aggregate._sum.amount ?? new Prisma.Decimal(0);
  const total = bill.totalAmount;

  // A cancelled bill stays cancelled regardless of its ledger.
  const status: BillStatus =
    bill.status === BillStatus.CANCELLED
      ? BillStatus.CANCELLED
      : amountPaid.gte(total)
        ? BillStatus.PAID
        : amountPaid.isZero()
          ? BillStatus.PENDING
          : BillStatus.PARTIAL;

  await tx.bill.update({
    where: { id: billId },
    data: { amountPaid, status },
  });

  return { amountPaid, status };
}

/** Recomputes a purchase order's paid amount and status from its supplier payments. */
export async function syncPurchaseOrderPaymentState(
  tx: Tx,
  purchaseOrderId: string
): Promise<{ amountPaid: Prisma.Decimal; paymentStatus: PurchasePaymentStatus }> {
  const [order, aggregate] = await Promise.all([
    tx.purchaseOrder.findUnique({
      where: { id: purchaseOrderId },
      select: { totalAmount: true },
    }),
    tx.supplierPayment.aggregate({
      where: { purchaseOrderId },
      _sum: { amount: true },
    }),
  ]);

  if (!order) {
    throw new Error(
      `Cannot sync payment state: purchase order ${purchaseOrderId} not found.`
    );
  }

  const amountPaid = aggregate._sum.amount ?? new Prisma.Decimal(0);

  const paymentStatus: PurchasePaymentStatus = amountPaid.gte(order.totalAmount)
    ? PurchasePaymentStatus.PAID
    : amountPaid.lte(0)
      ? PurchasePaymentStatus.UNPAID
      : PurchasePaymentStatus.PARTIAL;

  await tx.purchaseOrder.update({
    where: { id: purchaseOrderId },
    data: { amountPaid, paymentStatus },
  });

  return { amountPaid, paymentStatus };
}

/**
 * What a customer still owes, computed from the ledger.
 * Refund bills (negative totals) net off against outstanding balances.
 */
export async function customerOutstanding(
  tx: Tx,
  customerId: string
): Promise<Prisma.Decimal> {
  const [billed, paid] = await Promise.all([
    tx.bill.aggregate({
      where: { customerId, status: { not: BillStatus.CANCELLED } },
      _sum: { totalAmount: true },
    }),
    tx.payment.aggregate({ where: { customerId }, _sum: { amount: true } }),
  ]);

  const total = billed._sum.totalAmount ?? new Prisma.Decimal(0);
  const settled = paid._sum.amount ?? new Prisma.Decimal(0);

  return total.minus(settled);
}

/** What the business still owes a supplier, computed from the ledger. */
export async function supplierOutstanding(
  tx: Tx,
  supplierId: string
): Promise<Prisma.Decimal> {
  const [ordered, paid] = await Promise.all([
    tx.purchaseOrder.aggregate({
      where: { supplierId, status: { not: "CANCELLED" } },
      _sum: { totalAmount: true },
    }),
    tx.supplierPayment.aggregate({
      where: { supplierId },
      _sum: { amount: true },
    }),
  ]);

  const total = ordered._sum.totalAmount ?? new Prisma.Decimal(0);
  const settled = paid._sum.amount ?? new Prisma.Decimal(0);

  return total.minus(settled);
}
