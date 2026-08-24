import { ChequeStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { conflict, notFound, ok, parseBody, route } from "@/lib/api";
import { requireManager } from "@/lib/authz";
import { chequePassSchema } from "@/lib/validation";

/**
 * PATCH /api/cheques/pass — mark a supplier cheque as cleared by the bank.
 *
 * No ledger change: the SupplierPayment was recorded when the cheque was
 * issued, and clearing merely confirms it. Only a bounce moves money back
 * (see ../return).
 */
export const PATCH = route("PATCH /api/cheques/pass", async (req) => {
  await requireManager();
  const body = await parseBody(req, chequePassSchema);

  const cheque = await prisma.supplierCheque.findUnique({
    where: { id: body.chequeId },
    select: { id: true, status: true, chequeNumber: true },
  });

  if (!cheque) throw notFound("Cheque not found.");

  if (cheque.status !== ChequeStatus.PENDING) {
    throw conflict(
      `Cheque ${cheque.chequeNumber} is already marked ${cheque.status.toLowerCase()}.`
    );
  }

  const updated = await prisma.supplierCheque.update({
    where: { id: body.chequeId },
    data: { status: ChequeStatus.CLEARED, passedDate: new Date(body.passedDate) },
    select: { id: true, chequeNumber: true, status: true, passedDate: true },
  });

  return ok(updated);
});
