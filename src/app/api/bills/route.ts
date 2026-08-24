import { Prisma, StockMovementType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { badRequest, conflict, forbidden, ok, parseBody, route } from "@/lib/api";
import { requireStaff } from "@/lib/authz";
import { billCreateSchema } from "@/lib/validation";
import { syncBillPaymentState } from "@/lib/ledger";
import {
  adjustStock,
  consumeBatch,
  consumeFifo,
  dec,
  nextDocumentNumber,
  recordMovement,
  restoreBatch,
  type FifoAllocation,
  type Tx,
} from "@/lib/inventory";

/**
 * POST /api/bills — record a sale (and any returns bundled into it).
 *
 * Money is never taken from the request. The client proposes a unit price; the
 * server re-reads the cost layer it is selling from, refuses anything at or
 * below cost, and computes the subtotal and total itself. A tampered cart can
 * no longer produce a Rs. 0 invoice that still moves stock.
 */

type PreparedLine = {
  itemId: string;
  batchId: string | null;
  quantity: Prisma.Decimal;
  unitPrice: Prisma.Decimal;
  buyingPrice: Prisma.Decimal;
  totalPrice: Prisma.Decimal;
};

/** Resolves a sale line into one prepared line per cost layer it draws from. */
async function prepareSaleLine(
  tx: Tx,
  line: { id: string; batchId?: string; quantity: number; price: number },
  userId: string
): Promise<{ lines: PreparedLine[]; movements: (billId: string) => Promise<void> }> {
  const item = await tx.item.findUnique({
    where: { id: line.id },
    select: { id: true, name: true, isActive: true, sellingPrice: true },
  });

  if (!item) throw badRequest("One of the items in the cart no longer exists.");
  if (!item.isActive) throw conflict(`${item.name} is no longer available for sale.`);

  const quantity = dec(line.quantity);
  const proposedPrice = dec(line.price);

  if (proposedPrice.lte(0)) {
    throw badRequest(`${item.name} must be sold at a price greater than zero.`);
  }

  // Reduce the master stock FIRST. Its guard is the one that knows how much is
  // actually available, so an ordinary oversell reports "not enough stock"
  // rather than falling through to the FIFO layer and reporting a broken
  // invariant. If FIFO then cannot cover a quantity the master total allowed,
  // the records really are inconsistent and that error is the right one.
  const balance = await adjustStock(tx, item.id, quantity.negated(), item.name);

  // Draw stock from the chosen batch, or FIFO across the oldest layers.
  const allocations: FifoAllocation[] = line.batchId
    ? [await consumeBatch(tx, line.batchId, quantity, item.name)]
    : await consumeFifo(tx, line.id, quantity, item.name);

  const lines: PreparedLine[] = allocations.map((allocation) => {
    // Margin protection, enforced server-side. This rule previously existed
    // only in the browser and was bypassable from the console.
    if (proposedPrice.lt(allocation.buyingPrice)) {
      throw badRequest(
        `${item.name} cannot be sold at Rs. ${proposedPrice.toFixed(2)} — ` +
          `that is below its cost of Rs. ${allocation.buyingPrice.toFixed(2)}.`
      );
    }

    return {
      itemId: item.id,
      batchId: allocation.batchId,
      quantity: allocation.quantity,
      unitPrice: proposedPrice,
      buyingPrice: allocation.buyingPrice,
      totalPrice: proposedPrice.mul(allocation.quantity),
    };
  });

  // Deferred only so the movement can cite the bill, which does not exist yet.
  const movements = async (billId: string) => {
    await recordMovement(tx, {
      itemId: item.id,
      type: StockMovementType.SALE,
      quantity: quantity.negated(),
      balance,
      userId,
      billId,
      note: `Sold ${quantity} ${line.batchId ? "from selected batch" : "FIFO"}`,
    });
  };

  return { lines, movements };
}

/** Resolves a return line, restoring stock to the batch it originally came from. */
async function prepareReturnLine(
  tx: Tx,
  line: { id: string; originalBillItemId: string; quantity: number },
  userId: string
): Promise<{ lines: PreparedLine[]; movements: (billId: string) => Promise<void> }> {
  const original = await tx.billItem.findUnique({
    where: { id: line.originalBillItemId },
    include: { item: { select: { id: true, name: true } } },
  });

  if (!original) throw badRequest("The original invoice line could not be found.");

  if (original.itemId !== line.id) {
    throw badRequest("Return line does not match the original invoice line.");
  }

  // Return quantities arrive negative; work with the magnitude.
  const returning = dec(line.quantity).abs();
  const alreadyReturned = original.returnedQty;
  const sold = original.quantity.abs();

  if (alreadyReturned.plus(returning).gt(sold)) {
    const left = sold.minus(alreadyReturned);
    throw conflict(
      `Cannot return ${returning} of ${original.item.name} — only ${left} remain returnable.`
    );
  }

  await tx.billItem.update({
    where: { id: original.id },
    data: { returnedQty: { increment: returning } },
  });

  if (original.batchId) {
    await restoreBatch(tx, original.batchId, returning);
  }

  // Refund at the price actually charged, never at a client-supplied price.
  const unitPrice = original.unitPrice;

  const balance = await adjustStock(tx, original.itemId, returning, original.item.name);

  const movements = async (billId: string) => {
    await recordMovement(tx, {
      itemId: original.itemId,
      type: StockMovementType.RETURN,
      quantity: returning,
      balance,
      userId,
      billId,
      note: `Returned against bill item ${original.id}`,
    });
  };

  return {
    lines: [
      {
        itemId: original.itemId,
        batchId: original.batchId,
        quantity: returning.negated(),
        unitPrice,
        buyingPrice: original.buyingPrice,
        totalPrice: unitPrice.mul(returning.negated()),
      },
    ],
    movements,
  };
}

export const POST = route("POST /api/bills", async (req) => {
  const user = await requireStaff();
  const body = await parseBody(req, billCreateSchema);

  const hasReturns = body.items.some((line) => line.isReturn === true);

  // Returns move money and stock backwards, so they stay a supervisor action.
  // The UI hides the button for cashiers; this is what actually enforces it.
  if (hasReturns && user.role === "CASHIER") {
    throw forbidden("Only a manager or admin can process a return.");
  }

  const bill = await prisma.$transaction(
    async (tx) => {
      const billNumber = await nextDocumentNumber(tx, "BILL", "INV");

      const prepared: PreparedLine[] = [];
      const pendingMovements: Array<(billId: string) => Promise<void>> = [];

      for (const line of body.items) {
        const result =
          line.isReturn === true
            ? await prepareReturnLine(tx, line, user.id)
            : await prepareSaleLine(tx, line, user.id);

        prepared.push(...result.lines);
        pendingMovements.push(result.movements);
      }

      // ── Money, computed here and nowhere else ──
      const subtotal = prepared.reduce(
        (sum, line) => sum.plus(line.totalPrice),
        new Prisma.Decimal(0)
      );
      const discount = dec(body.discount);
      const tax = dec(body.tax);

      if (discount.gt(subtotal) && subtotal.gt(0)) {
        throw badRequest("Discount cannot be greater than the subtotal.");
      }

      const totalAmount = subtotal.minus(discount).plus(tax);

      const amountPaid =
        body.amountPaid === undefined ? totalAmount : dec(body.amountPaid);

      if (amountPaid.gt(totalAmount) && totalAmount.gte(0)) {
        // Overpayment is change given at the till, not a larger payment record.
        throw badRequest(
          "Amount received is more than the total. Record the total and give change."
        );
      }

      if (amountPaid.lt(totalAmount) && !body.customerId) {
        throw badRequest(
          "Link a customer before recording an unpaid balance, so the debt can be traced."
        );
      }

      if (body.customerId) {
        const customer = await tx.customer.findUnique({
          where: { id: body.customerId },
          select: { isActive: true },
        });
        if (!customer) throw badRequest("The selected customer no longer exists.");
        if (!customer.isActive) throw conflict("That customer account is archived.");
      }

      const created = await tx.bill.create({
        data: {
          billNumber,
          userId: user.id,
          customerId: body.customerId ?? null,
          subtotal,
          discount,
          tax,
          totalAmount,
          billItems: {
            create: prepared.map((line) => ({
              itemId: line.itemId,
              batchId: line.batchId,
              quantity: line.quantity,
              unitPrice: line.unitPrice,
              buyingPrice: line.buyingPrice,
              totalPrice: line.totalPrice,
            })),
          },
        },
        select: { id: true, billNumber: true, totalAmount: true },
      });

      // Movements are written after the bill exists so each can cite it.
      for (const apply of pendingMovements) await apply(created.id);

      if (!amountPaid.isZero()) {
        await tx.payment.create({
          data: {
            billId: created.id,
            customerId: body.customerId ?? null,
            amount: amountPaid,
            method: body.paymentMethod,
          },
        });
      }

      // status / amountPaid are derived, never trusted from the request.
      const state = await syncBillPaymentState(tx, created.id);

      return {
        id: created.id,
        billNumber: created.billNumber,
        subtotal,
        discount,
        tax,
        totalAmount,
        amountPaid: state.amountPaid,
        status: state.status,
      };
    },
    // FIFO batch locking can queue behind a concurrent sale of the same item.
    { timeout: 15_000 }
  );

  return ok(bill, 201);
});
