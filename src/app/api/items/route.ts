import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// ─────────────────────────────────────────────
// GET: Fetch available items (FIFO Billing)
// ─────────────────────────────────────────────
// ─────────────────────────────────────────────
// GET: Fetch available items (REAL FIFO BILLING)
// ─────────────────────────────────────────────

export async function GET() {

  try {

    const session =
      await getServerSession(
        authOptions
      );

    if (!session) {

      return NextResponse.json(
        {
          error: "Unauthorized",
        },
        {
          status: 401,
        }
      );
    }

    // GET ITEMS WITH ALL ACTIVE BATCHES

    const items =
      await prisma.item.findMany({

        where: {
          stockQty: {
            gt: 0,
          },
        },

        include: {

          purchaseBatches: {

            where: {
              remainingQty: {
                gt: 0,
              },
            },

            orderBy: {
              createdAt: "asc",
            },
          },
        },

        orderBy: {
          name: "asc",
        },
      });

    // CONVERT EACH BATCH INTO SEPARATE CATALOG ITEM

    const formattedItems: any[] = [];

    for (const item of items) {

      // NO BATCHES

      if (
        item.purchaseBatches.length === 0
      ) {

        formattedItems.push({

          id: item.id,

          barcode:
            item.barcode,

          name:
            item.name,

          description:
            item.description,

          category:
            item.category,

          unit:
            item.unit,

          stockQty:
            item.stockQty,

          reorderLevel:
            item.reorderLevel,

          buyingPrice:
            Number(
              item.buyingPrice
            ),

          sellingPrice:
            Number(
              item.sellingPrice
            ),

          batchId: null,

          createdAt:
            item.createdAt,

          updatedAt:
            item.updatedAt,
        });

        continue;
      }

      // CREATE SEPARATE ENTRY FOR EACH BATCH

      for (const batch of item.purchaseBatches) {

        formattedItems.push({

          id: item.id,

          barcode:
            item.barcode,

          name:
            item.name,

          description:
            item.description,

          category:
            item.category,

          unit:
            item.unit,

          // IMPORTANT:
          // STOCK ONLY FOR THIS BATCH

          stockQty:
            batch.remainingQty,

          reorderLevel:
            item.reorderLevel,

          buyingPrice:
            Number(
              batch.buyingPrice
            ),

          sellingPrice:
            Number(
              batch.sellingPrice
            ),

          batchId:
            batch.id,

          createdAt:
            item.createdAt,

          updatedAt:
            item.updatedAt,
        });
      }
    }

    return NextResponse.json({

      success: true,

      data: formattedItems,

    });

  } catch (error) {

    console.error(
      "[GET /api/items]",
      error
    );

    return NextResponse.json(
      {
        error:
          "Internal Server Error",
      },
      {
        status: 500,
      }
    );
  }
}

// ─────────────────────────────────────────────
// POST: Register New Item
// ─────────────────────────────────────────────

export async function POST(
  req: Request
) {

  try {

    // AUTH CHECK

    const session =
      await getServerSession(
        authOptions
      );

    if (!session) {

      return NextResponse.json(
        {
          error: "Unauthorized",
        },
        {
          status: 401,
        }
      );
    }

    const body =
      await req.json();

    const {
      barcode,
      name,
      description,
      category,
      unit,
      reorderLevel,
      buyingPrice,
      sellingPrice,
    } = body;

    // VALIDATION

    if (
      !barcode ||
      !name ||
      buyingPrice === undefined ||
      sellingPrice === undefined
    ) {

      return NextResponse.json(
        {
          error:
            "Barcode, Name, Buying Price and Selling Price are required.",
        },
        {
          status: 400,
        }
      );
    }

    // CHECK DUPLICATE

    const existingItem =
      await prisma.item.findUnique({

        where: {
          barcode,
        },
      });

    if (existingItem) {

      return NextResponse.json(
        {
          error:
            "An item with this barcode already exists.",
        },
        {
          status: 409,
        }
      );
    }

    // CREATE ITEM

    const newItem =
      await prisma.item.create({

        data: {

          barcode,

          name,

          description:
            description || "",

          category:
            category || "General",

          unit:
            unit || "pcs",

          reorderLevel:
            Number(
              reorderLevel
            ) || 5,

          buyingPrice:
            Number(
              buyingPrice
            ),

          sellingPrice:
            Number(
              sellingPrice
            ),

          stockQty: 0,
        },
      });

    return NextResponse.json({

      success: true,

      message:
        "New item registered successfully",

      data: newItem,

    });

  } catch (error: any) {

    console.error(
      "ITEM CREATION ERROR:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Failed to register item in database.",
      },
      {
        status: 500,
      }
    );
  }
}