import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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
      select: { id: true },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "That entry no longer exists." },
        { status: 404 }
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
