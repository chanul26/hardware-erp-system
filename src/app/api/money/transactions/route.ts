import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  MONEY_TX_TYPES,
  MoneyTxType,
  allowsNegativeAmount,
  normaliseAmount,
  requiresBankAccount,
  parseDayParam,
  startOfDay,
  endOfDay,
} from "@/lib/money";

export const dynamic = "force-dynamic";

async function requireAdmin() {
  const session = await getServerSession(authOptions);

  if (!session || session.user.role !== "ADMIN") {
    return null;
  }

  return session;
}

// ─────────────────────────────────────────────
// GET: the ledger, newest first
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

    const where: any = {};

    const typeParam = searchParams.get("type");

    if (
      typeParam &&
      MONEY_TX_TYPES.includes(typeParam as MoneyTxType)
    ) {
      where.type = typeParam;
    }

    const bankAccountId = searchParams.get("bankAccountId");

    if (bankAccountId === "CASH") {
      where.bankAccountId = null;
    } else if (bankAccountId) {
      where.bankAccountId = bankAccountId;
    }

    // `date` pins one shop day; from/to give a range. A single day wins when
    // both are supplied, since it is the more specific request.
    const dateParam = searchParams.get("date");
    const fromParam = searchParams.get("from");
    const toParam = searchParams.get("to");

    if (dateParam) {
      const day = parseDayParam(dateParam);
      where.occurredAt = {
        gte: startOfDay(day),
        lte: endOfDay(day),
      };
    } else if (fromParam || toParam) {
      where.occurredAt = {};
      if (fromParam) {
        where.occurredAt.gte = startOfDay(parseDayParam(fromParam));
      }
      if (toParam) {
        where.occurredAt.lte = endOfDay(parseDayParam(toParam));
      }
    }

    const search = (searchParams.get("search") || "").trim();

    if (search) {
      where.OR = [
        { description: { contains: search, mode: "insensitive" } },
        { category: { contains: search, mode: "insensitive" } },
        { reference: { contains: search, mode: "insensitive" } },
      ];
    }

    const take = Math.min(
      Number(searchParams.get("take")) || 100,
      500
    );

    const transactions = await prisma.moneyTransaction.findMany({
      where,
      include: {
        bankAccount: {
          select: { id: true, name: true, bankName: true },
        },
        createdByUser: {
          select: { id: true, name: true },
        },
      },
      orderBy: { occurredAt: "desc" },
      take,
    });

    return NextResponse.json({
      success: true,
      data: transactions.map((tx) => ({
        ...tx,
        amount: Number(tx.amount),
      })),
    });
  } catch (error) {
    console.error("[GET /api/money/transactions]", error);

    return NextResponse.json(
      { error: "Failed to load transactions." },
      { status: 500 }
    );
  }
}

// ─────────────────────────────────────────────
// POST: record a movement
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

    const type = String(body.type || "") as MoneyTxType;

    if (!MONEY_TX_TYPES.includes(type)) {
      return NextResponse.json(
        { error: "Pick what kind of movement this is." },
        { status: 400 }
      );
    }

    const amount = normaliseAmount(body.amount, {
      allowNegative: allowsNegativeAmount(type),
    });

    if (amount === null) {
      return NextResponse.json(
        {
          error: allowsNegativeAmount(type)
            ? "Enter a non-zero amount."
            : "Enter an amount greater than zero.",
        },
        { status: 400 }
      );
    }

    const bankAccountId = body.bankAccountId
      ? String(body.bankAccountId)
      : null;

    if (requiresBankAccount(type) && !bankAccountId) {
      return NextResponse.json(
        { error: "Choose which bank this money moved to or from." },
        { status: 400 }
      );
    }

    if (bankAccountId) {
      const account = await prisma.bankAccount.findUnique({
        where: { id: bankAccountId },
        select: { id: true, isActive: true },
      });

      if (!account) {
        return NextResponse.json(
          { error: "That bank account no longer exists." },
          { status: 400 }
        );
      }

      if (!account.isActive) {
        return NextResponse.json(
          { error: "That bank account is closed." },
          { status: 400 }
        );
      }
    }

    // The shop day is decided here, not in the browser. A timestamp built from
    // the client's clock can land on the far side of midnight once the server
    // reads it back in its own timezone, which would file an entry under a day
    // the owner never chose — and then hide it from that day's totals.
    const occurredAt = startOfDay(parseDayParam(body.date ?? null));

    const now = new Date();

    // Keep the time of day so several entries on one date stay in the order
    // they were made.
    occurredAt.setHours(
      now.getHours(),
      now.getMinutes(),
      now.getSeconds(),
      0
    );

    const transaction = await prisma.moneyTransaction.create({
      data: {
        type,
        amount,
        bankAccountId,
        category: body.category
          ? String(body.category).trim()
          : null,
        description: body.description
          ? String(body.description).trim()
          : null,
        reference: body.reference
          ? String(body.reference).trim()
          : null,
        occurredAt,
        createdByUserId: session.user.id || null,
      },
      include: {
        bankAccount: {
          select: { id: true, name: true, bankName: true },
        },
      },
    });

    return NextResponse.json({
      success: true,
      data: { ...transaction, amount: Number(transaction.amount) },
    });
  } catch (error) {
    console.error("[POST /api/money/transactions]", error);

    return NextResponse.json(
      { error: "Failed to record the transaction." },
      { status: 500 }
    );
  }
}
