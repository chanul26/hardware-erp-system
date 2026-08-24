import { prisma } from "@/lib/prisma";
import { badRequest, notFound, ok, parseQuery, route } from "@/lib/api";
import { requireManager } from "@/lib/authz";
import { billNumberQuerySchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

/**
 * GET /api/bills/return?billNumber= — look up an invoice to return against.
 *
 * Manager-only. This exposes full invoice contents and the linked customer, so
 * it was previously an unauthenticated enumeration of every sale in the system.
 */
export const GET = route("GET /api/bills/return", async (req) => {
  await requireManager();
  const { billNumber } = parseQuery(req, billNumberQuerySchema);

  const bill = await prisma.bill.findUnique({
    where: { billNumber },
    include: {
      billItems: {
        include: { item: { select: { id: true, name: true, unit: true } } },
      },
      customer: { select: { id: true, name: true, phone: true } },
    },
  });

  if (!bill) throw notFound("No invoice found with that number.");

  // Only original sale lines can be returned; the negative lines on this bill
  // are themselves returns.
  const returnable = bill.billItems
    .filter((line) => line.quantity.gt(0))
    .map((line) => ({
      id: line.id,
      itemId: line.itemId,
      item: line.item,
      quantity: Number(line.quantity),
      returnedQty: Number(line.returnedQty),
      unitPrice: Number(line.unitPrice),
      availableToReturn: Number(line.quantity.minus(line.returnedQty)),
    }))
    .filter((line) => line.availableToReturn > 0);

  if (returnable.length === 0) {
    throw badRequest("Every item on this invoice has already been returned.");
  }

  return ok({
    id: bill.id,
    billNumber: bill.billNumber,
    createdAt: bill.createdAt,
    totalAmount: Number(bill.totalAmount),
    status: bill.status,
    customer: bill.customer,
    billItems: returnable,
  });
});
