import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  try {
    const session = await getServerSession(
      authOptions
    );

    if (
      !session ||
      session.user.role !== "ADMIN"
    ) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // =========================================
    // FILTERS
    // =========================================

    const { searchParams } = new URL(
      req.url
    );

    const range =
      searchParams.get("range") ||
      "today";

    const supplierId =
      searchParams.get("supplierId");

    // NEW CHEQUE FILTERS

    const chequeSearch =
      searchParams.get(
        "chequeSearch"
      ) || "";

    const chequeDateFilter =
      searchParams.get(
        "chequeDate"
      ) || "";

    // =========================================
    // DATE FILTER
    // =========================================

    const startDate = new Date();

    if (range === "today") {
      startDate.setHours(
        0,
        0,
        0,
        0
      );
    }

    if (range === "week") {
      startDate.setDate(
        startDate.getDate() - 7
      );
    }

    if (range === "month") {
      startDate.setMonth(
        startDate.getMonth() - 1
      );
    }

    if (range === "year") {
      startDate.setFullYear(
        startDate.getFullYear() - 1
      );
    }

    // =========================================
    // REVENUE
    // =========================================

    const todaysPayments =
      await prisma.payment.aggregate({
        where: {
          createdAt: {
            gte: startDate,
          },
        },

        _sum: {
          amount: true,
        },
      });

    // =========================================
    // OUTSTANDING DEBT
    // =========================================

    const totalBilled =
      await prisma.bill.aggregate({
        _sum: {
          totalAmount: true,
        },
      });

    const totalPaid =
      await prisma.payment.aggregate({
        _sum: {
          amount: true,
        },
      });

    const outstandingDebt =
      (Number(
        totalBilled._sum.totalAmount
      ) || 0) -
      (Number(totalPaid._sum.amount) ||
        0);

    // =========================================
    // LOW STOCK ITEMS
    // =========================================

    const lowStockItems =
      await prisma.item.findMany({
        where: {
          stockQty: {
            lte: 5,
          },
        },

        orderBy: {
          stockQty: "asc",
        },

        take: 5,
      });

    // =========================================
    // TOP DEBTORS
    // =========================================

    const unpaidBills =
      await prisma.bill.findMany({
        where: {
          customerId: {
            not: null,
          },
        },

        include: {
          customer: true,
          payments: true,
        },
      });

    const debtorsMap = new Map<
      string,
      number
    >();

    unpaidBills.forEach((bill) => {
      const paidSoFar =
        bill.payments.reduce(
          (sum, p) =>
            sum + Number(p.amount),
          0
        );

      const debtForThisBill =
        Number(bill.totalAmount) -
        paidSoFar;

      if (debtForThisBill > 0) {
        const customerName =
          bill.customer?.name ||
          "Unknown";

        const currentDebt =
          debtorsMap.get(customerName) ||
          0;

        debtorsMap.set(
          customerName,
          currentDebt + debtForThisBill
        );
      }
    });

    const topDebtors = Array.from(
      debtorsMap,
      ([name, amount]) => ({
        name,
        amount,
      })
    )
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5);

    // =========================================
    // STOCK ADDITIONS REPORT
    // =========================================

    const stockAdditions =
      await prisma.purchaseItem.findMany({
        where: {
          purchaseOrder: {
            createdAt: {
              gte: startDate,
            },

            ...(supplierId
              ? {
                  supplierId,
                }
              : {}),
          },
        },

        include: {
          item: true,

          purchaseOrder: {
            include: {
              supplier: true,
            },
          },
        },

        orderBy: {
          purchaseOrder: {
            createdAt: "desc",
          },
        },
      });

    // =========================================
    // DAILY BILLS REPORT
    // =========================================

    const dailyBills =
      await prisma.bill.findMany({

        where: {
          createdAt: {
            gte: startDate,
          },
        },

        include: {

          customer: true,

          billItems: {

            include: {

              item: true,

            },

          },

          payments: true,

          cheques: true,

        },

        orderBy: {
          createdAt: "desc",
        },

      });

    // =========================================
    // CHEQUE REPORT
    // =========================================

    const chequeDateWhere =
      chequeDateFilter
        ? {
            chequeDate: {
              gte: new Date(
                `${chequeDateFilter}T00:00:00`
              ),

              lte: new Date(
                `${chequeDateFilter}T23:59:59`
              ),
            },
          }
        : {};

    const chequeReports =
      await prisma.supplierCheque.findMany({
        where: {
          ...chequeDateWhere,

          OR: [
            {
              chequeNumber: {
                contains:
                  chequeSearch,
                mode: "insensitive",
              },
            },

            {
              supplierPayment: {
                supplier: {
                  name: {
                    contains:
                      chequeSearch,
                    mode: "insensitive",
                  },
                },
              },
            },
          ],
        },

        include: {
          supplierPayment: {
            include: {
              supplier: true,
            },
          },
        },

        orderBy: {
          chequeDate: "desc",
        },
      });
      // =========================================
      // UPCOMING CHEQUE ALERTS
      // =========================================

      const today = new Date();

      const twoDaysLater = new Date();
      twoDaysLater.setDate(
        twoDaysLater.getDate() + 2
      );

      const upcomingCheques =
        await prisma.supplierCheque.findMany({
          where: {
            status: "PENDING",

            chequeDate: {
              gte: today,
              lte: twoDaysLater,
            },
          },

          include: {
            supplierPayment: {
              include: {
                supplier: true,
              },
            },
          },

          orderBy: {
            chequeDate: "asc",
          },
        });    

    // =========================================
    // SUPPLIERS LIST
    // =========================================

    const suppliers =
      await prisma.supplier.findMany({
        orderBy: {
          name: "asc",
        },
      });

    const returnedBills =
      await prisma.bill.findMany({
        where: {
          billItems: {
            some: {
              quantity: {
                lt: 0,
              },
            },
          },

          createdAt: {
            gte: startDate,
          },
        },

        include: {
          customer: true,

          billItems: {
            include: {
              item: true,
            },
          },

          payments: true,
        },

        orderBy: {
          createdAt: "desc",
        },
      });      

    // =========================================
    // RETURN RESPONSE
    // =========================================

    return NextResponse.json({
      success: true,

      data: {
        todayRevenue:
          Number(
            todaysPayments._sum.amount
          ) || 0,

        outstandingDebt,

        lowStockItems,

        topDebtors,

        stockAdditions,

        dailyBills,

        chequeReports,

        suppliers,

        returnedBills,
        upcomingCheques,
      },
    });
  } catch (error) {
    console.error(
      "[GET /api/reports]",
      error
    );

    return NextResponse.json(
      {
        error:
          "Failed to generate reports",
      },
      {
        status: 500,
      }
    );
  }
}