import { StockMovementType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { notFound, ok, parseBody, route } from "@/lib/api";
import { requireManager } from "@/lib/authz";
import { mixingSchema } from "@/lib/validation";
import { adjustStock, consumeFifo, dec, recordMovement } from "@/lib/inventory";

/**
 * POST /api/items/mixing — consume stock for paint mixing.
 *
 * The batch read now happens inside the transaction with row locks, and the
 * master stock is only reduced by what the batches actually covered. Previously
 * the batches were read outside the transaction and the master total was
 * decremented by the full requested amount regardless, so an over-consumption
 * silently pushed stockQty and the batch totals out of agreement.
 */
export const POST = route("POST /api/items/mixing", async (req) => {
  const user = await requireManager();
  const body = await parseBody(req, mixingSchema);

  const item = await prisma.item.findUnique({
    where: { id: body.itemId },
    select: { id: true, name: true, isActive: true },
  });

  if (!item) throw notFound("Item not found.");

  const quantity = dec(body.quantity);

  await prisma.$transaction(
    async (tx) => {
      // Throws if the batches cannot cover the quantity — the transaction rolls
      // back rather than leaving the invariant broken.
      await consumeFifo(tx, item.id, quantity, item.name);

      const balance = await adjustStock(tx, item.id, quantity.negated(), item.name);

      await recordMovement(tx, {
        itemId: item.id,
        type: StockMovementType.MIXING,
        quantity: quantity.negated(),
        balance,
        userId: user.id,
        purpose: body.purpose,
        note: body.note ?? "Used for paint mixing",
      });
    },
    { timeout: 15_000 }
  );

  return ok({ message: "Stock recorded as used for mixing." });
});
