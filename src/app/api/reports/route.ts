import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 1. Calculate Today's Revenue (Payments made today)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const todaysPayments = await prisma.payment.aggregate({
      where: {
        createdAt: { gte: today },
      },
      _sum: { amount: true },
    });

    // 2. Calculate Total Outstanding Debt (Total Billed - Total Paid)
    // First, sum all bills
    const totalBilled = await prisma.bill.aggregate({
      _sum: { totalAmount: true }
    });
    
    // Then sum all payments
    const totalPaid = await prisma.payment.aggregate({
      _sum: { amount: true }
    });

    const outstandingDebt = (Number(totalBilled._sum.totalAmount) || 0) - (Number(totalPaid._sum.amount) || 0);

    // 3. Find Top 5 Items in Critical Low Stock
    const lowStockItems = await prisma.item.findMany({
      where: {
        stockQty: { lte: prisma.item.fields.reorderLevel }, // Compare against its own reorder level
      },
      orderBy: { stockQty: 'asc' },
      take: 5,
    });

    // 4. Find Top 5 Debtors (Customers who owe the most)
    // This is a complex query: We find bills that aren't fully paid, group them by customer.
    // For simplicity right now, we will fetch pending bills that have a customer attached.
    const unpaidBills = await prisma.bill.findMany({
      where: {
        status: { in: ["PENDING", "PARTIAL"] },
        customerId: { not: null }
      },
      include: {
        customer: true,
        payments: true
      }
    });

    // Calculate exactly how much each person owes
    const debtorsMap = new Map();
    unpaidBills.forEach(bill => {
      const paidSoFar = bill.payments.reduce((sum, p) => sum + Number(p.amount), 0);
      const debtForThisBill = Number(bill.totalAmount) - paidSoFar;
      
      if (debtForThisBill > 0) {
        const currentDebt = debtorsMap.get(bill.customer?.name) || 0;
        debtorsMap.set(bill.customer?.name, currentDebt + debtForThisBill);
      }
    });

    const topDebtors = Array.from(debtorsMap, ([name, amount]) => ({ name, amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5);

    return NextResponse.json({
      success: true,
      data: {
        todayRevenue: Number(todaysPayments._sum.amount) || 0,
        outstandingDebt,
        lowStockItems,
        topDebtors
      }
    });

  } catch (error) {
    console.error("[GET /api/reports]", error);
    return NextResponse.json({ error: "Failed to generate reports" }, { status: 500 });
  }
}