import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  bankEffect,
  normaliseAmount,
  startOfDay,
  endOfDay,
  startOfMonth,
  parseDayParam,
} from "@/lib/money";

export const dynamic = "force-dynamic";

// The ledger is the owner's own books, so it stays with ADMIN.
async function requireAdmin() {
  const session = await getServerSession(authOptions);

  if (!session || session.user.role !== "ADMIN") {
    return null;
  }

  return session;
}

// ─────────────────────────────────────────────
// GET: every bank, with its balance and how it is tracking against target
// ─────────────────────────────────────────────

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

    const day = parseDayParam(searchParams.get("date"));
    const includeInactive =
      searchParams.get("includeInactive") === "true";

    const accounts = await prisma.bankAccount.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: { createdAt: "asc" },
    });

    // Balances are summed from the whole ledger rather than kept on the row,
    // so one query serves every account.
    const entries = await prisma.moneyTransaction.findMany({
      where: { bankAccountId: { not: null } },
      select: {
        type: true,
        amount: true,
        bankAccountId: true,
        occurredAt: true,
      },
    });

    const dayStart = startOfDay(day);
    const dayEnd = endOfDay(day);
    const monthStart = startOfMonth(day);

    const data = accounts.map((account) => {
      let balance = Number(account.openingBalance) || 0;
      let depositedToday = 0;
      let depositedThisMonth = 0;

      for (const entry of entries) {
        const effect = bankEffect(entry, account.id);

        if (effect === 0) continue;

        // Anything after the selected day is a future-dated entry and must not
        // count towards a balance the owner is checking as of that day.
        if (entry.occurredAt <= dayEnd) {
          balance += effect;
        }

        if (entry.type !== "DEPOSIT") continue;

        const amount = Number(entry.amount) || 0;

        if (
          entry.occurredAt >= dayStart &&
          entry.occurredAt <= dayEnd
        ) {
          depositedToday += amount;
        }

        if (
          entry.occurredAt >= monthStart &&
          entry.occurredAt <= dayEnd
        ) {
          depositedThisMonth += amount;
        }
      }

      const dailyTarget =
        account.dailyTarget === null
          ? null
          : Number(account.dailyTarget);

      const monthlyTarget =
        account.monthlyTarget === null
          ? null
          : Number(account.monthlyTarget);

      return {
        ...account,
        openingBalance: Number(account.openingBalance),
        dailyTarget,
        monthlyTarget,
        balance,
        depositedToday,
        depositedThisMonth,
        dailyShortfall:
          dailyTarget === null
            ? null
            : Math.max(dailyTarget - depositedToday, 0),
        monthlyShortfall:
          monthlyTarget === null
            ? null
            : Math.max(monthlyTarget - depositedThisMonth, 0),
      };
    });

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[GET /api/money/banks]", error);

    return NextResponse.json(
      { error: "Failed to load bank accounts." },
      { status: 500 }
    );
  }
}

// ─────────────────────────────────────────────
// POST: add a bank account
// ─────────────────────────────────────────────

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

    const name = String(body.name || "").trim();

    if (!name) {
      return NextResponse.json(
        { error: "Give the account a name." },
        { status: 400 }
      );
    }

    // Opening balance may legitimately be zero, so it bypasses the
    // reject-zero rule the transaction amounts use.
    const openingRaw = Number(body.openingBalance ?? 0);

    if (!Number.isFinite(openingRaw)) {
      return NextResponse.json(
        { error: "Opening balance must be a number." },
        { status: 400 }
      );
    }

    const dailyTarget =
      body.dailyTarget === "" || body.dailyTarget == null
        ? null
        : normaliseAmount(body.dailyTarget);

    const monthlyTarget =
      body.monthlyTarget === "" || body.monthlyTarget == null
        ? null
        : normaliseAmount(body.monthlyTarget);

    if (body.dailyTarget && dailyTarget === null) {
      return NextResponse.json(
        { error: "Daily target must be a positive amount." },
        { status: 400 }
      );
    }

    if (body.monthlyTarget && monthlyTarget === null) {
      return NextResponse.json(
        { error: "Monthly target must be a positive amount." },
        { status: 400 }
      );
    }

    const account = await prisma.bankAccount.create({
      data: {
        name,
        bankName: body.bankName
          ? String(body.bankName).trim()
          : null,
        accountNumber: body.accountNumber
          ? String(body.accountNumber).trim()
          : null,
        openingBalance: Math.round(openingRaw * 100) / 100,
        dailyTarget,
        monthlyTarget,
        notes: body.notes ? String(body.notes).trim() : null,
      },
    });

    return NextResponse.json({ success: true, data: account });
  } catch (error) {
    console.error("[POST /api/money/banks]", error);

    return NextResponse.json(
      { error: "Failed to create bank account." },
      { status: 500 }
    );
  }
}
