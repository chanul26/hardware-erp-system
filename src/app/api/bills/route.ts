import { Prisma, StockMovementType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { badRequest, conflict, forbidden, ok, parseBody, route } from "@/lib/api";
import { requireStaff } from "@/lib/authz";
import { billCreateSchema } from "@/lib/validation";
import { syncBillPaymentState } from "@/lib/ledger";
import { addMonths, generateWarrantyNumber } from "@/lib/warranty";
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
  itemName: string;
  batchId: string | null;
  quantity: Prisma.Decimal;
  unitPrice: Prisma.Decimal;
  buyingPrice: Prisma.Decimal;
  totalPrice: Prisma.Decimal;

  /**
   * Warranty term to issue for this line, already gated on both conditions:
   * the product is warranty-eligible AND the batch it came from carried
   * supplier cover. Null means no warranty is issued.
   */
  warrantyMonths: number | null;
  supplierId: string | null;

  /**
   * Serials for the cart line this row came from. FIFO can split one cart line
   * across several rows, so the queue is *shared by reference* between them and
   * consumed in order — otherwise each split would restart from the first
   * serial and duplicate it.
   */
  serials: string[];
};

/** Resolves a sale line into one prepared line per cost layer it draws from. */
async function prepareSaleLine(
  tx: Tx,
  line: {
    id: string;
    batchId?: string;
    quantity: number;
    price: number;
    serials?: string[];
    warrantyMonths?: number | null;
  },
  userId: string
): Promise<{ lines: PreparedLine[]; movements: (billId: string) => Promise<void> }> {
  const item = await tx.item.findUnique({
    where: { id: line.id },
    select: {
      id: true,
      name: true,
      isActive: true,
      sellingPrice: true,
      warrantyEligible: true,
    },
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

  // One queue per cart line, shared across every FIFO split of it.
  const serialQueue = [...(line.serials ?? [])];

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
      itemName: item.name,
      batchId: allocation.batchId,
      quantity: allocation.quantity,
      unitPrice: proposedPrice,
      buyingPrice: allocation.buyingPrice,
      totalPrice: proposedPrice.mul(allocation.quantity),

      // Both gates must open. An eligible product sold from a batch bought
      // without cover carries no warranty, and neither does an ineligible
      // product from a covered batch.
      //
      // Within that, the cashier may issue a longer term than the supplier
      // gave — the shop then covers the difference — or decline entirely with
      // 0. What they cannot do is conjure a warranty on uncovered stock, so
      // the batch term still decides whether any warranty exists.
      warrantyMonths:
        item.warrantyEligible && allocation.warrantyMonths
          ? line.warrantyMonths === undefined || line.warrantyMonths === null
            ? allocation.warrantyMonths
            : line.warrantyMonths > 0
              ? line.warrantyMonths
              : null
          : null,
      supplierId: allocation.supplierId,
      serials: serialQueue,
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
        itemName: original.item.name,
        batchId: original.batchId,
        quantity: returning.negated(),
        unitPrice,
        buyingPrice: original.buyingPrice,
        totalPrice: unitPrice.mul(returning.negated()),
        // Returns never issue a warranty.
        warrantyMonths: null,
        supplierId: null,
        serials: [],
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

  // Serials are unique per product. Checking before the transaction opens means
  // a mistyped serial gets a plain-English message instead of surfacing as a
  // unique-constraint violation halfway through a sale.
  const requestedSerials: { itemId: string; serial: string }[] = [];

  for (const line of body.items) {
    if (line.isReturn === true) continue;
    for (const raw of line.serials ?? []) {
      const serial = raw.trim();
      if (serial) requestedSerials.push({ itemId: line.id, serial });
    }
  }

  if (requestedSerials.length > 0) {
    // Same serial typed twice in this one cart.
    const seen = new Set<string>();
    for (const entry of requestedSerials) {
      const key = `${entry.itemId}::${entry.serial.toLowerCase()}`;
      if (seen.has(key)) {
        throw badRequest(
          `Serial number "${entry.serial}" is entered twice on this bill. Each unit needs its own serial.`
        );
      }
      seen.add(key);
    }

    // Serial already sold on an earlier bill.
    const clash = await prisma.warranty.findFirst({
      where: {
        OR: requestedSerials.map((entry) => ({
          itemId: entry.itemId,
          serialNumber: entry.serial,
        })),
      },
      select: { serialNumber: true, bill: { select: { billNumber: true } } },
    });

    if (clash) {
      throw conflict(
        `Serial number "${clash.serialNumber}" is already recorded on invoice ${clash.bill.billNumber}. Check the serial and try again.`
      );
    }
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
        },
        select: { id: true, billNumber: true, totalAmount: true },
      });

      // Lines are created one at a time rather than nested, because each
      // warranty has to cite the bill item it covers and a nested create does
      // not hand back the generated ids.
      const checkoutTime = Date.now();
      const startDate = new Date();
      let warrantySequence = 0;

      const issuedWarranties: {
        warrantyNumber: string;
        itemName: string;
        serialNumber: string | null;
        months: number;
        endDate: Date;
      }[] = [];

      for (const line of prepared) {
        const billItem = await tx.billItem.create({
          data: {
            billId: created.id,
            itemId: line.itemId,
            batchId: line.batchId,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            buyingPrice: line.buyingPrice,
            totalPrice: line.totalPrice,
          },
          select: { id: true },
        });

        if (!line.warrantyMonths || line.quantity.lte(0)) continue;

        const endDate = addMonths(startDate, line.warrantyMonths);

        // One warranty row per physical unit. Warranty-bearing goods are sold
        // whole, so a fractional quantity here rounds rather than issuing a
        // fraction of a warranty.
        const unitCount = Math.max(1, Math.round(Number(line.quantity)));

        for (let unit = 0; unit < unitCount; unit++) {
          warrantySequence += 1;

          // Shared queue across FIFO splits of the same cart line.
          const serial = line.serials.shift()?.trim() || null;

          const warrantyNumber = generateWarrantyNumber(
            warrantySequence,
            checkoutTime
          );

          await tx.warranty.create({
            data: {
              warrantyNumber,
              billItemId: billItem.id,
              billId: created.id,
              itemId: line.itemId,
              customerId: body.customerId ?? null,
              batchId: line.batchId,
              supplierId: line.supplierId,
              serialNumber: serial,
              months: line.warrantyMonths,
              startDate,
              endDate,
            },
          });

          issuedWarranties.push({
            warrantyNumber,
            itemName: line.itemName,
            serialNumber: serial,
            months: line.warrantyMonths,
            endDate,
          });
        }
      }

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
        // Returned so the receipt can print warranty numbers.
        warranties: issuedWarranties,
      };
    },
    // FIFO batch locking can queue behind a concurrent sale of the same item.
    { timeout: 15_000 }
  );

  return ok(bill, 201);
});
