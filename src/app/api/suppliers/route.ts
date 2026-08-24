import { OrderStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ok, parseBody, route } from "@/lib/api";
import { requireManager } from "@/lib/authz";
import { supplierCreateSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

/**
 * GET /api/suppliers — suppliers with what the business still owes each of them.
 *
 * Debt is `SUM(purchase order totals) - SUM(supplier payments)` — the same
 * definition the settlement endpoint uses. The previous version derived it from
 * PurchaseOrder.amountPaid instead, which excluded cheque payments entirely and
 * so disagreed with the settlement logic on every cheque-paid delivery.
 */
export const GET = route("GET /api/suppliers", async () => {
  await requireManager();

  const suppliers = await prisma.supplier.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      phone: true,
      email: true,
      address: true,
      createdAt: true,
    },
  });

  const ids = suppliers.map((s) => s.id);

  const [ordered, paid] = await Promise.all([
    ids.length
      ? prisma.purchaseOrder.groupBy({
          by: ["supplierId"],
          where: { supplierId: { in: ids }, status: { not: OrderStatus.CANCELLED } },
          _sum: { totalAmount: true },
        })
      : [],
    ids.length
      ? prisma.supplierPayment.groupBy({
          by: ["supplierId"],
          where: { supplierId: { in: ids } },
          _sum: { amount: true },
        })
      : [],
  ]);

  const orderedBy = new Map(
    ordered.map((r) => [r.supplierId, r._sum.totalAmount ?? new Prisma.Decimal(0)])
  );
  const paidBy = new Map(
    paid.map((r) => [r.supplierId, r._sum.amount ?? new Prisma.Decimal(0)])
  );

  const data = suppliers.map((supplier) => {
    const owed = (orderedBy.get(supplier.id) ?? new Prisma.Decimal(0)).minus(
      paidBy.get(supplier.id) ?? new Prisma.Decimal(0)
    );

    return { ...supplier, totalDebt: Number(Prisma.Decimal.max(owed, 0)) };
  });

  return ok(data);
});

/** POST /api/suppliers — register a supplier. */
export const POST = route("POST /api/suppliers", async (req) => {
  await requireManager();
  const body = await parseBody(req, supplierCreateSchema);

  const supplier = await prisma.supplier.create({
    data: {
      name: body.name,
      phone: body.phone ?? null,
      email: body.email ?? null,
      address: body.address ?? null,
    },
  });

  return ok(supplier, 201);
});
