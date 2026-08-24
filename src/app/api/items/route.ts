import { prisma } from "@/lib/prisma";
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

  const existing = await prisma.item.findUnique({
    where: { barcode: body.barcode },
    select: { id: true },
  });

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
