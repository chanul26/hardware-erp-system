import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseDayParam, startOfDay, toDayString } from "@/lib/money";

export const dynamic = "force-dynamic";

const SETTINGS_ID = "default";

async function requireAdmin() {
  const session = await getServerSession(authOptions);

  if (!session || session.user.role !== "ADMIN") {
    return null;
  }

  return session;
}

// ─────────────────────────────────────────────
// GET: when cash tracking started, and from what float
// ─────────────────────────────────────────────

export async function GET() {
  try {
    const session = await requireAdmin();

    if (!session) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const settings = await prisma.moneySettings.findUnique({
      where: { id: SETTINGS_ID },
    });

    return NextResponse.json({
      success: true,
      data: {
        cashTrackingStartDate: settings?.cashTrackingStartDate
          ? toDayString(settings.cashTrackingStartDate)
          : null,
        openingCashFloat: Number(settings?.openingCashFloat ?? 0),
        configured: Boolean(settings?.cashTrackingStartDate),
      },
    });
  } catch (error) {
    console.error("[GET /api/money/settings]", error);

    return NextResponse.json(
      { error: "Failed to load money settings." },
      { status: 500 }
    );
  }
}

// ─────────────────────────────────────────────
// PUT: start (or re-base) cash tracking
// ─────────────────────────────────────────────
//
// Re-basing is the intended way to correct a drifted drawer: count the cash,
// set today's date and that figure, and the running total starts again from
// something true rather than from an accumulated error.

export async function PUT(req: Request) {
  try {
    const session = await requireAdmin();

    if (!session) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await req.json();

    const startDate = startOfDay(
      parseDayParam(body.cashTrackingStartDate ?? null)
    );

    const float = Number(body.openingCashFloat ?? 0);

    if (!Number.isFinite(float) || float < 0) {
      return NextResponse.json(
        { error: "Counted cash must be zero or more." },
        { status: 400 }
      );
    }

    const data = {
      cashTrackingStartDate: startDate,
      openingCashFloat: Math.round(float * 100) / 100,
    };

    const settings = await prisma.moneySettings.upsert({
      where: { id: SETTINGS_ID },
      create: { id: SETTINGS_ID, ...data },
      update: data,
    });

    return NextResponse.json({
      success: true,
      data: {
        cashTrackingStartDate: toDayString(
          settings.cashTrackingStartDate!
        ),
        openingCashFloat: Number(settings.openingCashFloat),
        configured: true,
      },
    });
  } catch (error) {
    console.error("[PUT /api/money/settings]", error);

    return NextResponse.json(
      { error: "Failed to save money settings." },
      { status: 500 }
    );
  }
}
