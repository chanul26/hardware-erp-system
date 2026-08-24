import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  bankEffect,
  endOfDay,
  parseDayParam,
  startOfDay,
  startOfMonth,
  toDayString,
} from "@/lib/money";
import { computeCashInHand } from "@/lib/money-server";

export const dynamic = "force-dynamic";

// ─────────────────────────────────────────────
// GET: the day's money picture
// ─────────────────────────────────────────────
//
// Takings come from Payment and are never re-keyed here. What the owner
// records is only what he then did with the money, so the two can be compared:
// took 100,000 → banked 20,000 + 25,000 → the rest should still be in hand.
//
// Only CASH payments reach the drawer. Card, transfer and cheque money is
// real revenue but lands at the bank on its own, so it is reported separately
// and left out of the cash-in-hand figure.

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || session.user.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);

    const day = parseDayParam(searchParams.get("date"));

    const dayStart = startOfDay(day);
    const dayEnd = endOfDay(day);
    const monthStart = startOfMonth(day);

    // Cash in hand is worked out by the same helper the day-end count uses, so
    // the figure shown here and the figure a count is checked against can
    // never drift apart.
    const { cashInHand, cashStart, openingFloat } =
      await computeCashInHand(dayEnd);

    const [
      accounts,
      dayPayments,
      monthPaymentsAgg,
      daySupplierPayments,
      ledgerToDate,
      todaysCount,
    ] = await Promise.all([
      // Closed accounts are fetched too. One that still holds money must keep
      // showing, or closing it would quietly wipe that balance off the total
      // and the money would appear to have evaporated.
      prisma.bankAccount.findMany({
        orderBy: { createdAt: "asc" },
      }),

      // Split by method so the owner can see how much of the day's takings
      // could physically have been banked.
      prisma.payment.groupBy({
        by: ["method"],
        where: { paidAt: { gte: dayStart, lte: dayEnd } },
        _sum: { amount: true },
      }),

      prisma.payment.aggregate({
        where: { paidAt: { gte: monthStart, lte: dayEnd } },
        _sum: { amount: true },
      }),

      // Both figures at once: what the suppliers were paid in total, and how
      // much of that the drawer actually funded.
      prisma.supplierPayment.aggregate({
        where: { paidAt: { gte: dayStart, lte: dayEnd } },
        _sum: { amount: true, drawerAmount: true },
      }),

      // Bank balances carry their own openingBalance, so unlike the cash side
      // they need the whole ledger up to the selected day.
      prisma.moneyTransaction.findMany({
        where: { occurredAt: { lte: dayEnd } },
        select: {
          type: true,
          amount: true,
          bankAccountId: true,
          category: true,
          description: true,
          occurredAt: true,
        },
      }),

      prisma.cashCount.findUnique({
        where: { countedFor: dayStart },
        include: {
          countedByUser: { select: { id: true, name: true } },
        },
      }),
    ]);

    // ── Revenue ──

    const revenueByMethod: Record<string, number> = {
      CASH: 0,
      CARD: 0,
      CHEQUE: 0,
      BANK_TRANSFER: 0,
    };

    for (const row of dayPayments) {
      revenueByMethod[row.method] = Number(row._sum.amount) || 0;
    }

    const totalRevenue = Object.values(revenueByMethod).reduce(
      (sum, value) => sum + value,
      0
    );

    const cashRevenue = revenueByMethod.CASH;

    const supplierPaidToday =
      Number(daySupplierPayments._sum.amount) || 0;

    // Only the portion that came out of the till reduces the drawer. The rest
    // was paid from a wallet or a bank and never passed through it.
    const supplierPaidFromDrawerToday =
      Number(daySupplierPayments._sum.drawerAmount) || 0;

    // ── The day's own ledger entries ──

    const todaysEntries = ledgerToDate.filter(
      (entry) =>
        entry.occurredAt >= dayStart && entry.occurredAt <= dayEnd
    );

    const sumOf = (
      entries: typeof todaysEntries,
      predicate: (entry: (typeof todaysEntries)[number]) => boolean
    ) =>
      entries
        .filter(predicate)
        .reduce((sum, entry) => sum + (Number(entry.amount) || 0), 0);

    const depositedToday = sumOf(
      todaysEntries,
      (entry) => entry.type === "DEPOSIT"
    );

    const withdrawnToday = sumOf(
      todaysEntries,
      (entry) => entry.type === "WITHDRAWAL"
    );

    const expensesToday = sumOf(
      todaysEntries,
      (entry) => entry.type === "EXPENSE"
    );

    const donationsToday = sumOf(
      todaysEntries,
      (entry) => entry.type === "DONATION"
    );

    const otherIncomeToday = sumOf(
      todaysEntries,
      (entry) => entry.type === "OTHER_INCOME"
    );

    // What is left of *today's* cash takings once the banking and the day's
    // cash spending are accounted for. This is the number that tells the owner
    // whether he has finished putting the day away.
    const unallocatedCashToday =
      cashRevenue -
      depositedToday -
      sumOf(
        todaysEntries,
        (entry) =>
          entry.bankAccountId === null &&
          (entry.type === "EXPENSE" || entry.type === "DONATION")
      ) -
      supplierPaidFromDrawerToday;

    // ── Per bank ──

    const banks = accounts.map((account) => {
      const balance =
        (Number(account.openingBalance) || 0) +
        ledgerToDate.reduce(
          (sum, entry) => sum + bankEffect(entry, account.id),
          0
        );

      const depositedTodayForBank = sumOf(
        todaysEntries,
        (entry) =>
          entry.type === "DEPOSIT" &&
          entry.bankAccountId === account.id
      );

      const depositedThisMonth = ledgerToDate
        .filter(
          (entry) =>
            entry.type === "DEPOSIT" &&
            entry.bankAccountId === account.id &&
            entry.occurredAt >= monthStart
        )
        .reduce((sum, entry) => sum + (Number(entry.amount) || 0), 0);

      const dailyTarget =
        account.dailyTarget === null
          ? null
          : Number(account.dailyTarget);

      const monthlyTarget =
        account.monthlyTarget === null
          ? null
          : Number(account.monthlyTarget);

      return {
        id: account.id,
        name: account.name,
        bankName: account.bankName,
        accountNumber: account.accountNumber,
        isActive: account.isActive,
        balance,
        dailyTarget,
        monthlyTarget,
        depositedToday: depositedTodayForBank,
        depositedThisMonth,
        dailyShortfall:
          dailyTarget === null
            ? null
            : Math.max(dailyTarget - depositedTodayForBank, 0),
        monthlyShortfall:
          monthlyTarget === null
            ? null
            : Math.max(monthlyTarget - depositedThisMonth, 0),
        targetMet:
          dailyTarget === null
            ? null
            : depositedTodayForBank >= dailyTarget,
      };
    });

    // A closed account is only worth showing while it still holds money.
    const visibleBanks = banks.filter(
      (bank) => bank.isActive || bank.balance !== 0
    );

    // Targets belong to accounts still in use, so a closed one cannot drag the
    // day's savings target up.
    const totalDailyTarget = banks
      .filter((bank) => bank.isActive)
      .reduce((sum, bank) => sum + (bank.dailyTarget || 0), 0);

    // ── Month to date ──

    const monthEntries = ledgerToDate.filter(
      (entry) => entry.occurredAt >= monthStart
    );

    const monthToDate = {
      revenue: Number(monthPaymentsAgg._sum.amount) || 0,
      deposited: sumOf(
        monthEntries,
        (entry) => entry.type === "DEPOSIT"
      ),
      expenses: sumOf(
        monthEntries,
        (entry) => entry.type === "EXPENSE"
      ),
      donations: sumOf(
        monthEntries,
        (entry) => entry.type === "DONATION"
      ),
    };

    // ── Where the money went ──

    const categoryTotals = new Map<string, number>();

    for (const entry of monthEntries) {
      if (entry.type !== "EXPENSE" && entry.type !== "DONATION") {
        continue;
      }

      const key = entry.category?.trim() || "Uncategorised";

      categoryTotals.set(
        key,
        (categoryTotals.get(key) || 0) + (Number(entry.amount) || 0)
      );
    }

    const spendingByCategory = Array.from(
      categoryTotals,
      ([category, amount]) => ({ category, amount })
    ).sort((a, b) => b.amount - a.amount);

    return NextResponse.json({
      success: true,
      data: {
        date: toDayString(day),

        revenue: {
          total: totalRevenue,
          cash: cashRevenue,
          nonCash: totalRevenue - cashRevenue,
          byMethod: revenueByMethod,
        },

        today: {
          deposited: depositedToday,
          withdrawn: withdrawnToday,
          expenses: expensesToday,
          donations: donationsToday,
          otherIncome: otherIncomeToday,
          supplierPaid: supplierPaidToday,
          supplierPaidFromDrawer: supplierPaidFromDrawerToday,
          unallocatedCash: unallocatedCashToday,
          totalDailyTarget,
          targetShortfall: Math.max(
            totalDailyTarget - depositedToday,
            0
          ),
        },

        // null until the drawer has been counted once — the UI asks for that
        // rather than showing a figure it cannot stand behind.
        cashInHand,

        cashTracking: {
          configured: Boolean(cashStart),
          startDate: cashStart ? toDayString(cashStart) : null,
          openingFloat,
        },

        // Whether this day's drawer has been checked, and by how much it was
        // out if so.
        cashCount: todaysCount
          ? {
              countedAmount: Number(todaysCount.countedAmount),
              expectedAmount: Number(todaysCount.expectedAmount),
              variance: Number(todaysCount.variance),
              reason: todaysCount.reason,
              countedBy: todaysCount.countedByUser?.name || null,
            }
          : null,

        banks: visibleBanks,

        totalBankBalance: visibleBanks.reduce(
          (sum, bank) => sum + bank.balance,
          0
        ),

        monthToDate,

        spendingByCategory,
      },
    });
  } catch (error) {
    console.error("[GET /api/money/reports]", error);

    return NextResponse.json(
      { error: "Failed to build the money summary." },
      { status: 500 }
    );
  }
}
