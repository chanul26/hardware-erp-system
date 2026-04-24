import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Fetch all items from the database, ordered by name
    // We only fetch items that actually have stock left to sell
    const items = await prisma.item.findMany({
      where: {
        stockQty: {
          gt: 0,
        },
      },
      orderBy: {
        name: 'asc',
      },
    });

    return NextResponse.json({ success: true, data: items });
  } catch (error) {
    console.error("[GET /api/items]", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}