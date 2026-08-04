import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { normaliseAmount } from "@/lib/money";

export const dynamic = "force-dynamic";

async function requireAdmin() {
  const session = await getServerSession(authOptions);

  if (!session || session.user.role !== "ADMIN") {
    return null;
  }

  return session;
}

// ─────────────────────────────────────────────
// PATCH: rename an account or change its savings targets
// ─────────────────────────────────────────────

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await requireAdmin();

    if (!session) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await req.json();

    const data: any = {};

    if (body.name !== undefined) {
      const name = String(body.name).trim();

      if (!name) {
        return NextResponse.json(
          { error: "Give the account a name." },
          { status: 400 }
        );
      }

      data.name = name;
    }

    if (body.bankName !== undefined) {
      data.bankName = body.bankName
        ? String(body.bankName).trim()
        : null;
    }

    if (body.accountNumber !== undefined) {
      data.accountNumber = body.accountNumber
        ? String(body.accountNumber).trim()
        : null;
    }

    if (body.notes !== undefined) {
      data.notes = body.notes ? String(body.notes).trim() : null;
    }

    if (body.isActive !== undefined) {
      data.isActive = Boolean(body.isActive);
    }

    // An empty target means "no target", which is different from zero.
    for (const field of ["dailyTarget", "monthlyTarget"] as const) {
      if (body[field] === undefined) continue;

      if (body[field] === null || body[field] === "") {
        data[field] = null;
        continue;
      }

      const amount = normaliseAmount(body[field]);

      if (amount === null) {
        return NextResponse.json(
          { error: "Targets must be a positive amount." },
          { status: 400 }
        );
      }

      data[field] = amount;
    }

    if (body.openingBalance !== undefined) {
      const opening = Number(body.openingBalance);

      if (!Number.isFinite(opening)) {
        return NextResponse.json(
          { error: "Opening balance must be a number." },
          { status: 400 }
        );
      }

      data.openingBalance = Math.round(opening * 100) / 100;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json(
        { error: "Nothing to update." },
        { status: 400 }
      );
    }

    const account = await prisma.bankAccount.update({
      where: { id: params.id },
      data,
    });

    return NextResponse.json({ success: true, data: account });
  } catch (error) {
    console.error("[PATCH /api/money/banks/[id]]", error);

    return NextResponse.json(
      { error: "Failed to update bank account." },
      { status: 500 }
    );
  }
}

// ─────────────────────────────────────────────
// DELETE: close an account
// ─────────────────────────────────────────────
//
// An account with history is only ever deactivated — deleting it would strip
// the bank end off past deposits and silently inflate the cash-in-hand figure.

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await requireAdmin();

    if (!session) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const used = await prisma.moneyTransaction.count({
      where: { bankAccountId: params.id },
    });

    if (used > 0) {
      const account = await prisma.bankAccount.update({
        where: { id: params.id },
        data: { isActive: false },
      });

      return NextResponse.json({
        success: true,
        deactivated: true,
        data: account,
        message:
          "Account has transactions, so it was closed rather than deleted.",
      });
    }

    await prisma.bankAccount.delete({
      where: { id: params.id },
    });

    return NextResponse.json({ success: true, deleted: true });
  } catch (error) {
    console.error("[DELETE /api/money/banks/[id]]", error);

    return NextResponse.json(
      { error: "Failed to remove bank account." },
      { status: 500 }
    );
  }
}
