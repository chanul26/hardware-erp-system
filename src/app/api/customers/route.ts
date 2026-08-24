import { BillStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { notFound, ok, parseBody, parseQuery, route } from "@/lib/api";
import { requireManager, requireStaff } from "@/lib/authz";
import {
  customerCreateSchema,
  customerListQuerySchema,
  customerUpdateSchema,
  idQuerySchema,
} from "@/lib/validation";

export const dynamic = "force-dynamic";

/**
 * GET /api/customers — paginated list with outstanding balance.
 *
 * Balance comes from the payment ledger (bills minus payments), matching the
 * settlement endpoint exactly. Debt is aggregated for the current page in two
 * grouped queries rather than per row, so the list does not issue N+1 queries.
 */
export const GET = route("GET /api/customers", async (req) => {
  await requireStaff();
  const { search, page, limit } = parseQuery(req, customerListQuerySchema);

  const where: Prisma.CustomerWhereInput = {
    isActive: true,
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" as const } },
            { phone: { contains: search, mode: "insensitive" as const } },
            { nic: { contains: search, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [total, customers] = await Promise.all([
    prisma.customer.count({ where }),
    prisma.customer.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        name: true,
        nic: true,
        phone: true,
        email: true,
        address: true,
        createdAt: true,
      },
    }),
  ]);

  const ids = customers.map((c) => c.id);

  const [billed, paid] = await Promise.all([
    ids.length
      ? prisma.bill.groupBy({
          by: ["customerId"],
          where: { customerId: { in: ids }, status: { not: BillStatus.CANCELLED } },
          _sum: { totalAmount: true },
        })
      : [],
    ids.length
      ? prisma.payment.groupBy({
          by: ["customerId"],
          where: { customerId: { in: ids } },
          _sum: { amount: true },
        })
      : [],
  ]);

  const billedBy = new Map(
    billed.map((row) => [row.customerId, row._sum.totalAmount ?? new Prisma.Decimal(0)])
  );
  const paidBy = new Map(
    paid.map((row) => [row.customerId, row._sum.amount ?? new Prisma.Decimal(0)])
  );

  const data = customers.map((customer) => {
    const owed = (billedBy.get(customer.id) ?? new Prisma.Decimal(0)).minus(
      paidBy.get(customer.id) ?? new Prisma.Decimal(0)
    );

    return {
      ...customer,
      // Negative means the shop owes them (net refund); show it as settled.
      totalDebt: Number(Prisma.Decimal.max(owed, 0)),
    };
  });

  return ok({ customers: data, total, page, limit });
});

/** POST /api/customers — register a customer. */
export const POST = route("POST /api/customers", async (req) => {
  await requireStaff();
  const body = await parseBody(req, customerCreateSchema);

  const customer = await prisma.customer.create({
    data: {
      name: body.name,
      phone: body.phone,
      nic: body.nic ?? null,
      email: body.email ?? null,
      address: body.address ?? null,
    },
  });

  return ok(customer, 201);
});

/** PUT /api/customers — edit customer details. */
export const PUT = route("PUT /api/customers", async (req) => {
  await requireStaff();
  const body = await parseBody(req, customerUpdateSchema);

  const existing = await prisma.customer.findUnique({
    where: { id: body.id },
    select: { id: true },
  });

  if (!existing) throw notFound("Customer not found.");

  const customer = await prisma.customer.update({
    where: { id: body.id },
    data: {
      name: body.name,
      phone: body.phone,
      nic: body.nic ?? null,
      email: body.email ?? null,
      address: body.address ?? null,
    },
  });

  return ok(customer);
});

/**
 * DELETE /api/customers?id= — archive a customer.
 *
 * This is deliberately not a hard delete. The customer relations on Bill,
 * Payment and Cheque were optional, so deleting a customer used to null those
 * links and silently erase their outstanding debt while the bills remained.
 * Archiving hides them from the UI and keeps the financial trail intact.
 */
export const DELETE = route("DELETE /api/customers", async (req) => {
  await requireManager();
  const { id } = parseQuery(req, idQuerySchema);

  const customer = await prisma.customer.findUnique({
    where: { id },
    select: { id: true, name: true, isActive: true },
  });

  if (!customer) throw notFound("Customer not found.");

  const [bills, payments] = await Promise.all([
    prisma.bill.count({ where: { customerId: id } }),
    prisma.payment.count({ where: { customerId: id } }),
  ]);

  // With no history at all there is nothing to preserve, so a real delete is safe.
  if (bills === 0 && payments === 0) {
    await prisma.customer.delete({ where: { id } });
    return ok({ removed: true, archived: false, name: customer.name });
  }

  await prisma.customer.update({ where: { id }, data: { isActive: false } });

  return ok({
    removed: false,
    archived: true,
    name: customer.name,
    message:
      "This customer has billing history, so the record was archived rather than deleted.",
  });
});
