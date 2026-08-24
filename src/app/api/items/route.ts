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

          // WARRANTY
          // Legacy stock predates batch tracking, so there is no supplier
          // warranty on record and none can be issued.

          warrantyEligible:
            item.warrantyEligible,

          requiresSerial:
            item.requiresSerial,

          warrantyMonths:
            null,

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

          // WARRANTY
          // Both gates must pass: the product must be warranty-eligible AND
          // this specific batch must have come with supplier cover.

          warrantyEligible:
            item.warrantyEligible,

          requiresSerial:
            item.requiresSerial,

          warrantyMonths:
            item.warrantyEligible
              ? batch.warrantyMonths
              : null,

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
import { conflict, notFound, ok, parseBody, route } from "@/lib/api";
import { requireManager, requireStaff } from "@/lib/authz";
import { itemCreateSchema, itemUpdateSchema } from "@/lib/validation";

/**
 * GET /api/items — the POS catalogue.
 *
 * Returns one entry per cost layer, because the same product can be in stock at
 * two different prices and the cashier must be able to pick which one is being
 * sold. Items with stock but no batch are not returned: they cannot be costed,
 * and selling them would break the FIFO invariant.
 */
export const GET = route("GET /api/items", async () => {
  await requireStaff();

  const items = await prisma.item.findMany({
    where: { isActive: true, stockQty: { gt: 0 } },
    orderBy: { name: "asc" },
    include: {
      purchaseBatches: {
        where: { remainingQty: { gt: 0 } },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  const catalog = items.flatMap((item) => {
    const base = {
      id: item.id,
      barcode: item.barcode,
      name: item.name,
      description: item.description,
      category: item.category,
      unit: item.unit,
      reorderLevel: item.reorderLevel,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    };

    return item.purchaseBatches.map((batch) => ({
      ...base,
      // Stock shown is what this specific layer holds, not the item total.
      stockQty: Number(batch.remainingQty),
      buyingPrice: Number(batch.buyingPrice),
      sellingPrice: Number(batch.sellingPrice),
      batchId: batch.id,
    }));
  });

  return ok(catalog);
});

/** POST /api/items — register a new product. */
export const POST = route("POST /api/items", async (req) => {
  await requireManager();
  const body = await parseBody(req, itemCreateSchema);

  if (body.sellingPrice > 0 && body.sellingPrice < body.buyingPrice) {
    throw conflict(
      "Selling price is below the buying price. Correct the prices before saving."
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
      warrantyEligible,
      defaultWarrantyMonths,
      requiresSerial,
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

  const existing = await prisma.item.findUnique({
    where: { barcode: body.barcode },
    select: { id: true },
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

          // WARRANTY

          warrantyEligible:
            Boolean(
              warrantyEligible
            ),

          defaultWarrantyMonths:
            warrantyEligible &&
            Number(
              defaultWarrantyMonths
            ) > 0
              ? Math.round(
                  Number(
                    defaultWarrantyMonths
                  )
                )
              : null,

          requiresSerial:
            requiresSerial ===
            undefined
              ? true
              : Boolean(
                  requiresSerial
                ),
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
  if (existing) {
    throw conflict("An item with this barcode already exists.");
  }

  const item = await prisma.item.create({
    data: {
      barcode: body.barcode,
      name: body.name,
      description: body.description ?? null,
      category: body.category ?? "General",
      unit: body.unit,
      reorderLevel: body.reorderLevel,
      buyingPrice: body.buyingPrice,
      sellingPrice: body.sellingPrice,
      stockQty: 0,
    },
  });

  return ok(item, 201);
});

/**
 * PUT /api/items — edit a product's details.
 *
 * Deliberately cannot change `barcode` (it identifies the physical label) or
 * `buyingPrice` (cost comes from the purchase batches, not from typing).
 */
export const PUT = route("PUT /api/items", async (req) => {
  await requireManager();
  const body = await parseBody(req, itemUpdateSchema);

  const existing = await prisma.item.findUnique({
    where: { id: body.id },
    select: { id: true, buyingPrice: true },
  });

  if (!existing) throw notFound("Item not found.");

  if (body.sellingPrice > 0 && Number(existing.buyingPrice) > body.sellingPrice) {
    throw conflict(
      `Selling price cannot be below the current cost of Rs. ${Number(
        existing.buyingPrice
      ).toFixed(2)}.`
    );
  }

  const item = await prisma.item.update({
    where: { id: body.id },
    data: {
      name: body.name,
      description: body.description ?? null,
      category: body.category ?? "General",
      unit: body.unit,
      reorderLevel: body.reorderLevel,
      sellingPrice: body.sellingPrice,
    },
  });

  return ok(item);
});
