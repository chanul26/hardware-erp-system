import { ChequeStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { conflict, notFound, ok, parseBody, route } from "@/lib/api";
import { requireManager } from "@/lib/authz";
import { chequeReturnSchema } from "@/lib/validation";
import { syncPurchaseOrderPaymentState } from "@/lib/ledger";

/**
 * PATCH /api/cheques/return — record a supplier cheque as bounced.
 *
 * A bounce means the money never actually moved, so the original
 * SupplierPayment must be undone. This writes a reversing (negative) payment
 * rather than deleting the original, keeping both events in the ledger, then
 * re-derives the purchase order's payment status.
 *
 * Previously this flipped the status enum and nothing else, so a bounced cheque
 * silently erased a real liability and the supplier still appeared paid.
 */
export const PATCH = route("PATCH /api/cheques/return", async (req) => {
  await requireManager();
  const body = await parseBody(req, chequeReturnSchema);

  const cheque = await prisma.supplierCheque.findUnique({
    where: { id: body.chequeId },
    include: {
      supplierPayment: {
        select: {
          id: true,
          amount: true,
          supplierId: true,
          purchaseOrderId: true,
          method: true,
          reversesId: true,
        },
      },
    },
  });

  if (!cheque) throw notFound("Cheque not found.");

  if (cheque.status === ChequeStatus.BOUNCED) {
    throw conflict(`Cheque ${cheque.chequeNumber} is already marked bounced.`);
  }

  if (cheque.status === ChequeStatus.CANCELLED) {
    throw conflict(`Cheque ${cheque.chequeNumber} was cancelled.`);
  }

  const result = await prisma.$transaction(async (tx) => {
    await tx.supplierCheque.update({
      where: { id: cheque.id },
      data: { status: ChequeStatus.BOUNCED },
    });

    const original = cheque.supplierPayment;

    // Reverse the money: an equal and opposite payment row.
    await tx.supplierPayment.create({
      data: {
        purchaseOrderId: original.purchaseOrderId,
        supplierId: original.supplierId,
        amount: original.amount.negated(),
        method: original.method,
        reference: `Reversal of bounced cheque ${cheque.chequeNumber}`,
        reversesId: original.id,
      },
    });

    const state = await syncPurchaseOrderPaymentState(tx, original.purchaseOrderId);

    return {
      chequeNumber: cheque.chequeNumber,
      reversedAmount: Number(original.amount),
      purchaseOrderId: original.purchaseOrderId,
      paymentStatus: state.paymentStatus,
      amountPaid: Number(state.amountPaid),
    };
  });

  return ok({
    ...result,
    message:
      `Cheque ${result.chequeNumber} marked bounced. Rs. ${result.reversedAmount.toFixed(2)} ` +
      `has been reinstated as owed to the supplier.`,
  });
});
