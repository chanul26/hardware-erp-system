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

    const graphRange =
      searchParams.get(
        "graphRange"
      ) || "daily";

    const selectedDate =
      searchParams.get(
        "selectedDate"
      ) || "";

    const supplierId =
      searchParams.get("supplierId");

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

    const now = selectedDate
      ? new Date(selectedDate)
      : new Date();

    let startDate: Date | null =
      null;

    let endDate: Date | null =
      null;

    // TODAY

    if (range === "today") {
      startDate = new Date(now);

      startDate.setHours(
        0,
        0,
        0,
        0
      );

      endDate = new Date(now);

      endDate.setHours(
        23,
        59,
        59,
        999
      );
    }

    // WEEK

    if (range === "week") {
      startDate = new Date(now);

      startDate.setDate(
        now.getDate() - 7
      );

      startDate.setHours(
        0,
        0,
        0,
        0
      );

      endDate = new Date(now);

      endDate.setHours(
        23,
        59,
        59,
        999
      );
    }

    // MONTH

    if (range === "month") {
      startDate = new Date(
        now.getFullYear(),
        now.getMonth(),
        1
      );

      endDate = new Date(
        now.getFullYear(),
        now.getMonth() + 1,
        0,
        23,
        59,
        59,
        999
      );
    }

    // YEAR

    if (range === "year") {
      startDate = new Date(
        now.getFullYear(),
        0,
        1
      );

      endDate = new Date(
        now.getFullYear(),
        11,
        31,
        23,
        59,
        59,
        999
      );
    }

    // COMMON FILTER

    const dateFilter =
      startDate && endDate
        ? {
            createdAt: {
              gte: startDate,
              lte: endDate,
            },
          }
        : {};

    // =========================================
    // REVENUE
    // =========================================

    const todaysPayments =
      await prisma.payment.aggregate({
        where: {
          ...dateFilter,
        },

        _sum: {
          amount: true,
        },
      });

    // =========================================
    // PROFIT CALCULATION
    // =========================================

    const billsForProfit =
      await prisma.bill.findMany({
        where: {
          ...dateFilter,
        },

        include: {
          billItems: {
            include: {
              item: true,
            },
          },
        },
      });

    let totalProfit = 0;

    billsForProfit.forEach((bill) => {
      bill.billItems.forEach(
        (billItem) => {
          const sellingPrice =
            Number(
              billItem.unitPrice
            );

          const buyingPrice =
            Number(
              billItem.item
                .buyingPrice
            );

          const profit =
            (sellingPrice -
              buyingPrice) *
            billItem.quantity;

          totalProfit += profit;
        }
      );
    });

    // =========================================
    // PROFIT GRAPH
    // =========================================

    let profitGraph: any[] = [];

    if (graphRange === "daily") {
      for (let i = 1; i <= 30; i++) {
        const dayStart =
          new Date(
            now.getFullYear(),
            now.getMonth(),
            i,
            0,
            0,
            0
          );

        const dayEnd =
          new Date(
            now.getFullYear(),
            now.getMonth(),
            i,
            23,
            59,
            59
          );

        const dailyBills =
          await prisma.bill.findMany({
            where: {
              createdAt: {
                gte: dayStart,
                lte: dayEnd,
              },
            },

            include: {
              billItems: {
                include: {
                  item: true,
                },
              },
            },
          });

        let dailyProfit = 0;

        dailyBills.forEach(
          (bill) => {
            bill.billItems.forEach(
              (billItem) => {
                dailyProfit +=
                  (Number(
                    billItem.unitPrice
                  ) -
                    Number(
                      billItem.item
                        .buyingPrice
                    )) *
                  billItem.quantity;
              }
            );
          }
        );

        profitGraph.push({
          label: i.toString(),
          profit: dailyProfit,
        });
      }
    }

    if (graphRange === "weekly") {
      const days = [
        "Sun",
        "Mon",
        "Tue",
        "Wed",
        "Thu",
        "Fri",
        "Sat",
      ];

      for (
        let i = 0;
        i < 7;
        i++
      ) {
        const day = new Date(now);

        day.setDate(
          now.getDate() -
            now.getDay() +
            i
        );

        const dayStart =
          new Date(day);

        dayStart.setHours(
          0,
          0,
          0,
          0
        );

        const dayEnd =
          new Date(day);

        dayEnd.setHours(
          23,
          59,
          59,
          999
        );

        const weeklyBills =
          await prisma.bill.findMany({
            where: {
              createdAt: {
                gte: dayStart,
                lte: dayEnd,
              },
            },

            include: {
              billItems: {
                include: {
                  item: true,
                },
              },
            },
          });

        let weeklyProfit = 0;

        weeklyBills.forEach(
          (bill) => {
            bill.billItems.forEach(
              (billItem) => {
                weeklyProfit +=
                  (Number(
                    billItem.unitPrice
                  ) -
                    Number(
                      billItem.item
                        .buyingPrice
                    )) *
                  billItem.quantity;
              }
            );
          }
        );

        profitGraph.push({
          label: days[i],
          profit: weeklyProfit,
        });
      }
    }

    if (graphRange === "monthly") {
      const months = [
        "Jan",
        "Feb",
        "Mar",
        "Apr",
        "May",
        "Jun",
        "Jul",
        "Aug",
        "Sep",
        "Oct",
        "Nov",
        "Dec",
      ];

      for (
        let i = 0;
        i < 12;
        i++
      ) {
        const monthStart =
          new Date(
            now.getFullYear(),
            i,
            1
          );

        const monthEnd =
          new Date(
            now.getFullYear(),
            i + 1,
            0,
            23,
            59,
            59
          );

        const monthlyBills =
          await prisma.bill.findMany({
            where: {
              createdAt: {
                gte: monthStart,
                lte: monthEnd,
              },
            },

            include: {
              billItems: {
                include: {
                  item: true,
                },
              },
            },
          });

        let monthlyProfit = 0;

        monthlyBills.forEach(
          (bill) => {
            bill.billItems.forEach(
              (billItem) => {
                monthlyProfit +=
                  (Number(
                    billItem.unitPrice
                  ) -
                    Number(
                      billItem.item
                        .buyingPrice
                    )) *
                  billItem.quantity;
              }
            );
          }
        );

        profitGraph.push({
          label: months[i],
          profit: monthlyProfit,
        });
      }
    }

    if (graphRange === "yearly") {
      const currentYear =
        now.getFullYear();

      for (
        let year =
          currentYear - 5;
        year <= currentYear;
        year++
      ) {
        const yearStart =
          new Date(
            year,
            0,
            1
          );

        const yearEnd =
          new Date(
            year,
            11,
            31,
            23,
            59,
            59
          );

        const yearlyBills =
          await prisma.bill.findMany({
            where: {
              createdAt: {
                gte: yearStart,
                lte: yearEnd,
              },
            },

            include: {
              billItems: {
                include: {
                  item: true,
                },
              },
            },
          });

        let yearlyProfit = 0;

        yearlyBills.forEach(
          (bill) => {
            bill.billItems.forEach(
              (billItem) => {
                yearlyProfit +=
                  (Number(
                    billItem.unitPrice
                  ) -
                    Number(
                      billItem.item
                        .buyingPrice
                    )) *
                  billItem.quantity;
              }
            );
          }
        );

        profitGraph.push({
          label:
            year.toString(),
          profit: yearlyProfit,
        });
      }
    }

    // =========================================
    // OUTSTANDING DEBT
    // =========================================

    const totalBilled =
      await prisma.bill.aggregate({
        where: {
          ...dateFilter,
        },

        _sum: {
          totalAmount: true,
        },
      });

    const totalPaid =
      await prisma.payment.aggregate({
        where: {
          ...dateFilter,
        },

        _sum: {
          amount: true,
        },
      });

    const outstandingDebt =
      (Number(
        totalBilled._sum
          .totalAmount
      ) || 0) -
      (Number(
        totalPaid._sum.amount
      ) || 0);

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

    const debtorsMap =
      new Map<
        string,
        number
      >();

    unpaidBills.forEach(
      (bill) => {
        const paidSoFar =
          bill.payments.reduce(
            (sum, p) =>
              sum +
              Number(p.amount),
            0
          );

        const debtForThisBill =
          Number(
            bill.totalAmount
          ) - paidSoFar;

        if (
          debtForThisBill > 0
        ) {
          const customerName =
            bill.customer?.name ||
            "Unknown";

          const currentDebt =
            debtorsMap.get(
              customerName
            ) || 0;

          debtorsMap.set(
            customerName,
            currentDebt +
              debtForThisBill
          );
        }
      }
    );

    const topDebtors =
      Array.from(
        debtorsMap,
        ([name, amount]) => ({
          name,
          amount,
        })
      )
        .sort(
          (a, b) =>
            b.amount -
            a.amount
        )
        .slice(0, 5);

    // =========================================
    // SUPPLIER STOCK REPORT
    // =========================================

    const purchaseOrders =
      await prisma.purchaseOrder.findMany({
        where: {
          ...dateFilter,

          ...(supplierId
            ? {
                supplierId,
              }
            : {}),
        },

        include: {
          supplier: true,

          supplierPayments: {
            include: {
              supplierCheque: true,
            },
          },

          purchaseItems: {
            include: {
              item: true,
            },
          },
        },

        orderBy: {
          createdAt: "desc",
        },
      });

    const stockAdditions =
      purchaseOrders.map(
        (order) => ({
          id: order.id,

          supplier: {
            name:
              order.supplier
                .name,
          },

          purchaseOrder: {
            billNumber:
              order.orderNumber,

            createdAt:
              order.createdAt,

            totalAmount:
              Number(
                order.totalAmount
              ),

            paymentMethod:
              order.supplierPayments.some(
                (payment) =>
                  payment.method ===
                  "CHEQUE"
              )
                ? "Cheque"
                : "Cash",

            paymentStatus:
              order.supplierPayments.some(
                (payment) =>
                  payment.method ===
                  "CHEQUE"
              )
                ? order.supplierPayments.every(
                    (
                      payment
                    ) =>
                      payment
                        .supplierCheque
                        ?.status ===
                      "CLEARED"
                  )
                  ? "PAID"
                  : "UNPAID"
                : "PAID",

            items:
              order.purchaseItems.map(
                (item) => ({
                  id: item.id,

                  quantity:
                    item.quantity,

                  buyingPrice:
                    Number(
                      item.unitCost
                    ),

                  item: {
                    name:
                      item.item
                        .name,
                  },
                })
              ),
          },
        })
      );

    // =========================================
    // DAILY BILLS REPORT
    // =========================================

    const dailyBills =
      await prisma.bill.findMany({
        where: {
          ...dateFilter,
        },

        include: {
          customer: true,
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
      await prisma.supplierCheque.findMany(
        {
          where: {
            ...chequeDateWhere,

            OR: [
              {
                chequeNumber: {
                  contains:
                    chequeSearch,

                  mode:
                    "insensitive",
                },
              },

              {
                supplierPayment:
                  {
                    supplier: {
                      name: {
                        contains:
                          chequeSearch,

                        mode:
                          "insensitive",
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
            chequeDate:
              "desc",
          },
        }
      );

    // =========================================
    // SUPPLIERS LIST
    // =========================================

    const suppliers =
      await prisma.supplier.findMany({
        orderBy: {
          name: "asc",
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
            todaysPayments
              ._sum.amount
          ) || 0,

        totalProfit,

        profitGraph,

        outstandingDebt,

        lowStockItems,

        topDebtors,

        stockAdditions,

        dailyBills,

        chequeReports,

        suppliers,
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