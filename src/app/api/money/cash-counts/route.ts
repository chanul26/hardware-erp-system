import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { endOfDay, parseDayParam, startOfDay, toDayString } from "@/lib/money";
import {
  CASH_VARIANCE_CATEGORY,
  computeCashInHand,
} from "@/lib/money-server";

export const dynamic = "force-dynamic";

async function requireAdmin() {
  const session = await getServerSession(authOptions);

  if (!session || session.user.role !== "ADMIN") {
    return null;
  }

  return session;
}

// ─────────────────────────────────────────────
// GET: past counts, newest first
// ─────────────────────────────────────────────
//
// The history is the point: one short day is a miscount, the same shortfall
// every Friday is something else.

export async function GET(req: Request) {
  try {
    const session = await requireAdmin();

    if (!session) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);

    const take = Math.min(Number(searchParams.get("take")) || 30, 200);

    const counts = await prisma.cashCount.findMany({
      include: {
        countedByUser: { select: { id: true, name: true } },
      },
      orderBy: { countedFor: "desc" },
      take,
    });

    return NextResponse.json({
      success: true,
      data: counts.map((count) => ({
        ...count,
        countedFor: toDayString(count.countedFor),
        expectedAmount: Number(count.expectedAmount),
        countedAmount: Number(count.countedAmount),
        variance: Number(count.variance),
      })),
    });
  } catch (error) {
    console.error("[GET /api/money/cash-counts]", error);

    return NextResponse.json(
      { error: "Failed to load cash counts." },
      { status: 500 }
    );
  }
}

// ─────────────────────────────────────────────
// POST: count the drawer for a day
// ─────────────────────────────────────────────
//
// A count never silently re-bases the balance. The gap between expected and
// counted is stored, and booked to the ledger as a visible, dated correction —
// so the running total matches the drawer again, but the discrepancy is on the
// record rather than absorbed.

export async function POST(req: Request) {
  try {
    const session = await requireAdmin();

    if (!session) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await req.json();

    const counted = Number(body.countedAmount);

    if (!Number.isFinite(counted) || counted < 0) {
      return NextResponse.json(
        { error: "Enter the cash you counted, or 0." },
        { status: 400 }
      );
    }

    const day = parseDayParam(body.date ?? null);
    const dayStart = startOfDay(day);
    const dayEnd = endOfDay(day);

    const { cashInHand, cashStart } = await computeCashInHand(dayEnd);

    if (cashInHand === null) {
      return NextResponse.json(
        {
          error: cashStart
            ? `Cash tracking only starts on ${toDayString(
                cashStart
              )}, so there is nothing to check this day against.`
            : "Set the opening cash float before counting the drawer.",
        },
        { status: 400 }
      );
    }

    const countedAmount = Math.round(counted * 100) / 100;

    // Re-counting a day replaces its previous correction, so the expected
    // figure must be measured without it — otherwise the second count would
    // compare against a balance the first count had already fixed.
    const previous = await prisma.cashCount.findUnique({
      where: { countedFor: dayStart },
    });

    let expected = cashInHand;

    if (previous) {
      expected = cashInHand - Number(previous.variance);
    }

    const expectedAmount = Math.round(expected * 100) / 100;
    const variance =
      Math.round((countedAmount - expectedAmount) * 100) / 100;

    const reason = body.reason ? String(body.reason).trim() : null;

    const result = await prisma.$transaction(async (tx) => {
      const count = await tx.cashCount.upsert({
        where: { countedFor: dayStart },
        create: {
          countedFor: dayStart,
          expectedAmount,
          countedAmount,
          variance,
          reason,
          countedByUserId: session.user.id || null,
        },
        update: {
          expectedAmount,
          countedAmount,
          variance,
          reason,
          countedByUserId: session.user.id || null,
        },
      });

      // Drop the previous correction before writing the new one, so re-counting
      // a day cannot stack two adjustments on top of each other.
      await tx.moneyTransaction.deleteMany({
        where: {
          category: CASH_VARIANCE_CATEGORY,
          reference: count.id,
        },
      });

      if (variance !== 0) {
        // Timed to the end of the day so it lands after the day's trading.
        const occurredAt = new Date(dayEnd.getTime());

        await tx.moneyTransaction.create({
          data: {
            type: "ADJUSTMENT",
            amount: variance,
            bankAccountId: null,
            category: CASH_VARIANCE_CATEGORY,
            description:
              variance < 0
                ? `Drawer short at count${reason ? ` — ${reason}` : ""}`
                : `Drawer over at count${reason ? ` — ${reason}` : ""}`,
            reference: count.id,
            occurredAt,
            createdByUserId: session.user.id || null,
          },
        });
      }

      return count;
    });

    return NextResponse.json({
      success: true,
      data: {
        ...result,
        countedFor: toDayString(result.countedFor),
        expectedAmount,
        countedAmount,
        variance,
      },
    });
  } catch (error) {
    console.error("[POST /api/money/cash-counts]", error);

    return NextResponse.json(
      { error: "Failed to save the cash count." },
      { status: 500 }
    );
  }
}
