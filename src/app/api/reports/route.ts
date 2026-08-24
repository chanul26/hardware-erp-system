import { BillStatus, ChequeStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ok, parseQuery, route } from "@/lib/api";
import { requireAdmin } from "@/lib/authz";
import { reportsQuerySchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

/**
 * Hard ceiling on any list this endpoint returns.
 *
 * The previous version loaded every bill ever written (with customer and
 * payment rows attached) just to compute a top-5 list, so it got slower every
 * day the shop traded. Aggregates are now done in the database, and the
 * remaining detail lists are capped. When a list is truncated the response says
 * so, rather than quietly showing partial data.
 */
const MAX_ROWS = 500;

function startOfRange(range: "today" | "week" | "month" | "year"): Date {
  const from = new Date();

  switch (range) {
    case "today":
      from.setHours(0, 0, 0, 0);
      break;
    case "week":
      from.setDate(from.getDate() - 7);
      break;
    case "month":
      from.setMonth(from.getMonth() - 1);
      break;
    case "year":
      from.setFullYear(from.getFullYear() - 1);
      break;
  }

  return from;
}

const capped = <T>(rows: T[]) => ({
  rows: rows.slice(0, MAX_ROWS),
  truncated: rows.length > MAX_ROWS,
});

export const GET = route("GET /api/reports", async (req) => {
  await requireAdmin();

  const query = parseQuery(req, reportsQuerySchema);
  const from = startOfRange(query.range);
  // Previously ignored: the UI sent `stockRange` and the API filtered stock
  // additions by `range`, so the control appeared to work but did nothing.
  const stockFrom = startOfRange(query.stockRange);

  const [
    revenueAgg,
    billedAgg,
    paidAgg,
    lowStockItems,
    billsByCustomer,
    paymentsByCustomer,
    stockAdditions,
    dailyBills,
    chequeReports,
    upcomingCheques,
    suppliers,
    returnedBills,
  ] = await Promise.all([
    prisma.payment.aggregate({
      where: { paidAt: { gte: from } },
      _sum: { amount: true },
    }),

    prisma.bill.aggregate({
      where: { status: { not: BillStatus.CANCELLED } },
      _sum: { totalAmount: true },
    }),

    prisma.payment.aggregate({ _sum: { amount: true } }),

    // Compares against each item's own reorderLevel. The old query hardcoded
    // `stockQty <= 5`, so the configurable field was ignored and this panel
    // disagreed with the inventory table.
    prisma.$queryRaw<
      {
        id: string;
        name: string;
        barcode: string;
        unit: string;
        stockQty: Prisma.Decimal;
        reorderLevel: number;
      }[]
    >`
      SELECT "id", "name", "barcode", "unit", "stockQty", "reorderLevel"
        FROM "Item"
       WHERE "isActive" = true
         AND "stockQty" <= "reorderLevel"
       ORDER BY ("stockQty" - "reorderLevel") ASC, "name" ASC
       LIMIT 50
    `,

    // Debtors computed by the database, not by loading every bill into memory.
    prisma.bill.groupBy({
      by: ["customerId"],
      where: { customerId: { not: null }, status: { not: BillStatus.CANCELLED } },
      _sum: { totalAmount: true },
    }),

    prisma.payment.groupBy({
      by: ["customerId"],
      where: { customerId: { not: null } },
      _sum: { amount: true },
    }),

    prisma.purchaseOrder.findMany({
      where: {
        createdAt: { gte: stockFrom },
        ...(query.supplierId ? { supplierId: query.supplierId } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: MAX_ROWS + 1,
      include: {
        supplier: { select: { id: true, name: true } },
        purchaseItems: { include: { item: { select: { name: true, unit: true } } } },
        supplierPayments: { include: { supplierCheque: true } },
      },
    }),

    prisma.bill.findMany({
      where: { createdAt: { gte: from } },
      orderBy: { createdAt: "desc" },
      take: MAX_ROWS + 1,
      include: {
        customer: { select: { id: true, name: true } },
        billItems: { include: { item: { select: { name: true, unit: true } } } },
        payments: true,
        cheques: true,
      },
    }),

    prisma.supplierCheque.findMany({
      where: {
        ...(query.chequeDate && !Number.isNaN(Date.parse(query.chequeDate))
          ? {
              chequeDate: {
                gte: new Date(`${query.chequeDate}T00:00:00`),
                lte: new Date(`${query.chequeDate}T23:59:59.999`),
              },
            }
          : {}),
        ...(query.chequeSearch
          ? {
              OR: [
                {
                  chequeNumber: {
                    contains: query.chequeSearch,
                    mode: "insensitive" as const,
                  },
                },
                {
                  supplierPayment: {
                    supplier: {
                      name: {
                        contains: query.chequeSearch,
                        mode: "insensitive" as const,
                      },
                    },
                  },
                },
              ],
            }
          : {}),
      },
      orderBy: { chequeDate: "desc" },
      take: MAX_ROWS + 1,
      include: {
        supplierPayment: { include: { supplier: { select: { name: true } } } },
      },
    }),

    prisma.supplierCheque.findMany({
      where: {
        status: ChequeStatus.PENDING,
        chequeDate: {
          gte: new Date(),
          lte: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
        },
      },
      orderBy: { chequeDate: "asc" },
      take: 50,
      include: {
        supplierPayment: { include: { supplier: { select: { name: true } } } },
      },
    }),

    prisma.supplier.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),

    prisma.bill.findMany({
      where: {
        createdAt: { gte: from },
        billItems: { some: { quantity: { lt: 0 } } },
      },
      orderBy: { createdAt: "desc" },
      take: MAX_ROWS + 1,
      include: {
        customer: { select: { id: true, name: true } },
        billItems: { include: { item: { select: { name: true, unit: true } } } },
        payments: true,
      },
    }),
  ]);

  // ── Top debtors, assembled from the two aggregates ──
  const paidByCustomer = new Map(
    paymentsByCustomer.map((row) => [
      row.customerId,
      row._sum.amount ?? new Prisma.Decimal(0),
    ])
  );

  const debtorTotals = billsByCustomer
    .map((row) => ({
      customerId: row.customerId!,
      amount: (row._sum.totalAmount ?? new Prisma.Decimal(0)).minus(
        paidByCustomer.get(row.customerId) ?? new Prisma.Decimal(0)
      ),
    }))
    .filter((row) => row.amount.gt(0))
    .sort((a, b) => b.amount.comparedTo(a.amount))
    .slice(0, 10);

  const debtorNames = debtorTotals.length
    ? await prisma.customer.findMany({
        where: { id: { in: debtorTotals.map((d) => d.customerId) } },
        select: { id: true, name: true },
      })
    : [];

  const nameById = new Map(debtorNames.map((c) => [c.id, c.name]));

  const topDebtors = debtorTotals.map((row) => ({
    id: row.customerId,
    name: nameById.get(row.customerId) ?? "Unknown",
    amount: Number(row.amount),
  }));

  const outstandingDebt = (billedAgg._sum.totalAmount ?? new Prisma.Decimal(0)).minus(
    paidAgg._sum.amount ?? new Prisma.Decimal(0)
  );

  const stock = capped(stockAdditions);
  const bills = capped(dailyBills);
  const cheques = capped(chequeReports);
  const returns = capped(returnedBills);

  return ok({
    todayRevenue: Number(revenueAgg._sum.amount ?? 0),
    outstandingDebt: Number(Prisma.Decimal.max(outstandingDebt, 0)),
    lowStockItems: lowStockItems.map((item) => ({
      ...item,
      stockQty: Number(item.stockQty),
    })),
    topDebtors,
    stockAdditions: stock.rows,
    dailyBills: bills.rows,
    chequeReports: cheques.rows,
    upcomingCheques,
    suppliers,
    returnedBills: returns.rows,
    meta: {
      range: query.range,
      stockRange: query.stockRange,
      maxRows: MAX_ROWS,
      truncated: {
        stockAdditions: stock.truncated,
        dailyBills: bills.truncated,
        chequeReports: cheques.truncated,
        returnedBills: returns.truncated,
      },
    },
  });
});
