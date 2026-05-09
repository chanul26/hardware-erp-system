import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// ─────────────────────────────────────────────
// GET: Fetch available items (Used for Billing)
// ─────────────────────────────────────────────
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

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

// ─────────────────────────────────────────────
// POST: Register a brand new item (Master Data)
// ─────────────────────────────────────────────
export async function POST(req: Request) {
  try {
    // 1. Security Check: Only logged-in staff can add items
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { 
      barcode, 
      name, 
      description, 
      category, 
      unit, 
      reorderLevel, 
      buyingPrice, 
      sellingPrice 
    } = body;

    // 2. Validation
    if (!barcode || !name || buyingPrice === undefined || sellingPrice === undefined) {
      return NextResponse.json(
        { error: "Barcode, Name, Buying Price, and Selling Price are required." },
        { status: 400 }
      );
    }

    // 3. Prevent Duplicates
    const existingItem = await prisma.item.findUnique({
      where: { barcode },
    });

    if (existingItem) {
      return NextResponse.json(
        { error: "An item with this barcode already exists in the system." },
        { status: 409 }
      );
    }

    // 4. Database Injection (Stock starts at 0)
    const newItem = await prisma.item.create({
      data: {
        barcode,
        name,
        description: description || "",
        category: category || "General",
        unit: unit || "pcs",
        reorderLevel: Number(reorderLevel) || 5,
        buyingPrice: Number(buyingPrice),
        sellingPrice: Number(sellingPrice),
        stockQty: 0, 
      },
    });

    return NextResponse.json({
      success: true,
      message: "New item registered successfully",
      data: newItem,
    });

  } catch (error: any) {
    console.error("ITEM CREATION ERROR:", error);
    return NextResponse.json(
      { error: "Failed to register item in the database." },
      { status: 500 }
    );
  }
}