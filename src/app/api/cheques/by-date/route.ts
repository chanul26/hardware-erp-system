import { ChequeStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ok, parseQuery, route } from "@/lib/api";
import { requireManager } from "@/lib/authz";
import { chequeByDateQuerySchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

/**
 * GET /api/cheques/by-date?date= — pending supplier cheques dated that day.
 * Used before writing a new cheque, to see what is already due to clear.
 */
export const GET = route("GET /api/cheques/by-date", async (req) => {
  await requireManager();
  const { date } = parseQuery(req, chequeByDateQuerySchema);

  const start = new Date(date);
  start.setHours(0, 0, 0, 0);

  const end = new Date(date);
  end.setHours(23, 59, 59, 999);

  const cheques = await prisma.supplierCheque.findMany({
    where: {
      chequeDate: { gte: start, lte: end },
      status: ChequeStatus.PENDING,
    },
    orderBy: { chequeDate: "asc" },
    include: {
      supplierPayment: { include: { supplier: { select: { name: true } } } },
    },
  });

  return ok(
    cheques.map((cheque) => ({
      id: cheque.id,
      supplierName: cheque.supplierPayment?.supplier?.name ?? "Unknown supplier",
      bank: cheque.bank,
      amount: Number(cheque.amount),
      chequeNumber: cheque.chequeNumber,
    }))
  );
});
