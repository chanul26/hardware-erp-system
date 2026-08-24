import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CASH_VARIANCE_CATEGORY } from "@/lib/money-server";

export const dynamic = "force-dynamic";

async function requireAdmin() {
  const session = await getServerSession(authOptions);

  if (!session || session.user.role !== "ADMIN") {
    return null;
  }

  return session;
}

// ─────────────────────────────────────────────
// DELETE: remove a mis-keyed entry
// ─────────────────────────────────────────────
//
// Balances are summed from the ledger rather than stored, so deleting the row
// is enough to correct them — there is nothing to unwind.

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

    const existing = await prisma.moneyTransaction.findUnique({
      where: { id: params.id },
      select: { id: true, category: true, reference: true },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "That entry no longer exists." },
        { status: 404 }
      );
    }

    // A variance correction belongs to a drawer count. Deleting it on its own
    // would leave the count claiming a reconciliation that no longer holds,
    // and jump cash in hand by the amount of the discrepancy. Correcting a
    // count means counting again, which replaces this entry.
    if (
      existing.category === CASH_VARIANCE_CATEGORY &&
      existing.reference
    ) {
      return NextResponse.json(
        {
          error:
            "This came from a drawer count. Count the drawer again for that day to change it.",
        },
        { status: 400 }
      );
    }

    await prisma.moneyTransaction.delete({
      where: { id: params.id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[DELETE /api/money/transactions/[id]]", error);

    return NextResponse.json(
      { error: "Failed to delete the entry." },
      { status: 500 }
    );
  }
}
