import { Prisma, StockMovementType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  addMonths,
  generateWarrantyNumber,
  normaliseMonths,
} from "@/lib/warranty";
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

    // =========================
    // SERIAL NUMBER VALIDATION
    // =========================
    //
    // Serials are unique per product. Checking before the sale opens means a
    // mistyped serial gets a plain-English message instead of aborting the
    // whole checkout with a database error.

    const requestedSerials: {
      itemId: string;
      serial: string;
    }[] = [];

    for (const item of items) {

      if (item.isReturn || !Array.isArray(item.serials)) continue;

      for (const raw of item.serials) {

        const serial = String(raw || "").trim();

        if (serial) {
          requestedSerials.push({ itemId: item.id, serial });
        }
      }
    }

    if (requestedSerials.length > 0) {

      // Same serial typed twice in this one cart.

      const seen = new Set<string>();

      for (const entry of requestedSerials) {

        const key = `${entry.itemId}::${entry.serial.toLowerCase()}`;

        if (seen.has(key)) {
          return NextResponse.json(
            {
              error: `Serial number "${entry.serial}" is entered twice in this bill. Each unit needs its own serial.`,
            },
            { status: 400 }
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
        include: {
          bill: { select: { billNumber: true } },
        },
      });

      if (clash) {
        return NextResponse.json(
          {
            error: `Serial number "${clash.serialNumber}" is already recorded on invoice ${clash.bill.billNumber}. Check the serial and try again.`,
          },
          { status: 409 }
        );
      }
    }

    const billNumber = `INV-${Date.now().toString().slice(-6)}`;
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

      // =========================
      // WARRANTY ISSUANCE
      // =========================
      //
      // A warranty is only issued when BOTH gates pass: the product is
      // flagged warranty-eligible, and the batch it was sold from actually
      // came with supplier cover. The customer's clock starts now.

      const checkoutTime = Date.now();
      let warrantySequence = 0;

      // Returned to the client so the receipt can print warranty numbers.
      const issuedWarranties: {
        warrantyNumber: string;
        itemName: string;
        serialNumber: string | null;
        months: number;
        endDate: Date;
      }[] = [];

      // FIFO can split one cart line across several bill items, so serials
      // are consumed from a single queue per cart line rather than per row.

      const issueWarranties = async (opts: {
        billItemId: string;
        itemId: string;
        batchId: string | null;
        quantity: number;
        months: number | null;
        serials: string[];
        itemName: string;
      }) => {

        if (!opts.months || opts.quantity <= 0) return;

        const batch = opts.batchId
          ? await tx.purchaseBatch.findUnique({
              where: { id: opts.batchId },
            })
          : null;

        // No batch on record means legacy stock with no supplier warranty.
        if (!batch?.warrantyMonths) return;

        const startDate = new Date();
        const endDate = addMonths(startDate, opts.months);

        // One row per physical unit.
        const unitCount = Math.max(
          1,
          Math.round(opts.quantity)
        );

        for (let unit = 0; unit < unitCount; unit++) {

          warrantySequence += 1;

          const serial = opts.serials.shift()?.trim() || null;

          const warrantyNumber = generateWarrantyNumber(
            warrantySequence,
            checkoutTime
          );

          await tx.warranty.create({
            data: {
              warrantyNumber,

              billItemId: opts.billItemId,
              billId: bill.id,
              itemId: opts.itemId,
              customerId: customerId || null,

              batchId: batch.id,
              supplierId: batch.supplierId,

              serialNumber: serial,

              months: opts.months,
              startDate,
              endDate,
            },
          });

          issuedWarranties.push({
            warrantyNumber,
            itemName: opts.itemName,
            serialNumber: serial,
            months: opts.months,
            endDate,
          });
        }
      };

      // =========================
      // PROCESS ITEMS
      // =========================

      for (const item of items) {

        // ====================================================
        // RETURN ITEM
        // ====================================================

        if (item.isReturn) {

          const absQty = Math.abs(item.quantity);

          const originalItem = await tx.billItem.findUnique({
            where: {
              id: item.originalBillItemId,
            },
          });

          if (!originalItem) {
            throw new Error("Original bill item missing");
          }

          if (
            Number(originalItem.returnedQty || 0) + absQty >
            Number(originalItem.quantity)
          ) {
            throw new Error(
              `Cannot return more than purchased for ${item.name}`
            );
          }

          // UPDATE RETURNED QTY

          await tx.billItem.update({
            where: {
              id: item.originalBillItemId,
            },
            data: {
              returnedQty: {
                increment: absQty,
              },
            },
          });

          // VOID WARRANTIES ON THE RETURNED UNITS
          //
          // Returned goods must not keep live cover. One warranty row per
          // unit, so void as many as came back — already-claimed ones are
          // left alone since that history still matters.

          const warrantiesToVoid = await tx.warranty.findMany({
            where: {
              billItemId: item.originalBillItemId,
              status: { in: ["ACTIVE", "EXPIRED"] },
            },
            orderBy: { createdAt: "asc" },
            take: Math.max(1, Math.round(absQty)),
          });

          if (warrantiesToVoid.length > 0) {
            await tx.warranty.updateMany({
              where: {
                id: {
                  in: warrantiesToVoid.map((w) => w.id),
                },
              },
              data: {
                status: "VOID",
                notes: `Voided — item returned on invoice ${billNumber}`,
              },
            });
          }

          // RESTORE ORIGINAL BATCH STOCK

          if (originalItem.batchId) {
            await tx.purchaseBatch.update({
              where: {
                id: originalItem.batchId,
              },
              data: {
                remainingQty: {
                  increment: absQty,
                },
              },
            });
          }

          // UPDATE MASTER STOCK

          await tx.item.update({
            where: {
              id: item.id,
            },
            data: {
              stockQty: {
                increment: absQty,
              },
            },
          });

          // STOCK MOVEMENT

          await tx.stockMovement.create({
            data: {
              itemId: item.id,
              quantity: absQty,
              type: "RETURN",
              note: `Returned from invoice ${item.originalBillId}`,
            },
          });

          // SAVE NEGATIVE BILL ITEM

          await tx.billItem.create({
            data: {
              billId: bill.id,
              itemId: item.id,

              quantity: item.quantity,

              unitPrice: Number(item.price),

              buyingPrice: Number(originalItem.buyingPrice || 0),

              batchId: originalItem.batchId,

              totalPrice: Number(item.price) * item.quantity,
            },
          });

        }

        // ====================================================
        // NORMAL SALE
        // ====================================================

        else {

          const currentItem = await tx.item.findUnique({
            where: {
              id: item.id,
            },
          });

          if (!currentItem) {
            throw new Error(`Item missing: ${item.name}`);
          }

          if (currentItem.stockQty < item.quantity) {
            throw new Error(
              `Insufficient stock for item: ${item.name}`
            );
          }

          let totalSoldQty = 0;

          // WARRANTY REQUEST FOR THIS CART LINE
          //
          // The cashier may adjust the term at the till, but the product must
          // be flagged eligible before anything is issued at all.

          const warrantyMonths = currentItem.warrantyEligible
            ? normaliseMonths(item.warrantyMonths)
            : null;

          const serialQueue: string[] = Array.isArray(item.serials)
            ? [...item.serials]
            : [];

          // ======================================================
          // CASE 1: USER SELECTED SPECIFIC BATCH
          // ======================================================

          if (item.batchId) {

            const selectedBatch = await tx.purchaseBatch.findUnique({
              where: {
                id: item.batchId,
              },
            });

            if (!selectedBatch) {
              throw new Error(
                `Selected batch not found for ${item.name}`
              );
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

            const createdBillItem = await tx.billItem.create({
              data: {
                billId: bill.id,
                itemId: item.id,
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

            await issueWarranties({
              billItemId: createdBillItem.id,
              itemId: item.id,
              batchId: selectedBatch.id,
              quantity: item.quantity,
              months: warrantyMonths,
              serials: serialQueue,
              itemName: currentItem.name,
            });

            // REDUCE SELECTED BATCH ONLY
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

          // ======================================================
          // CASE 2: FIFO LEGACY SALE
          // ======================================================

          else {

            const fifoBatches = await tx.purchaseBatch.findMany({
              where: {
                itemId: item.id,
                remainingQty: {
                  gt: 0,
                },
              },
              orderBy: {
                createdAt: "asc",
              },
            });

            let remainingQty = item.quantity;

            for (const batch of fifoBatches) {

              if (remainingQty <= 0) break;

              const qtyToTake = Math.min(
                remainingQty,
                batch.remainingQty
              );

              // CREATE BILL ITEM

              const createdBillItem = await tx.billItem.create({
                data: {
                  billId: bill.id,
                  itemId: item.id,

                  batchId: batch.id,

                  quantity: qtyToTake,

                  unitPrice: Number(
                    item.price || batch.sellingPrice
                  ),

                  buyingPrice: Number(
                    batch.buyingPrice || 0
                  ),

                  totalPrice:
                    Number(item.price || batch.sellingPrice) *
                    qtyToTake,
                },
              });

              await issueWarranties({
                billItemId: createdBillItem.id,
                itemId: item.id,
                batchId: batch.id,
                quantity: qtyToTake,
                months: warrantyMonths,
                serials: serialQueue,
                itemName: currentItem.name,
              });

              // REDUCE BATCH

              await tx.purchaseBatch.update({
                where: {
                  id: batch.id,
                },
                data: {
                  remainingQty: {
                    decrement: qtyToTake,
                  },
                },
              });

              // STOCK MOVEMENT

              await tx.stockMovement.create({
                data: {
                  itemId: item.id,
                  quantity: -qtyToTake,
                  type: "SALE",
                  note: `Sold FIFO stock via invoice ${billNumber}`,
                },
              });

              remainingQty -= qtyToTake;
              totalSoldQty += qtyToTake;
            }

            // LEGACY STOCK

            if (remainingQty > 0) {

              await tx.billItem.create({
                data: {
                  billId: bill.id,
                  itemId: item.id,

                  quantity: remainingQty,

                  unitPrice: Number(
                    item.price || currentItem.sellingPrice
                  ),

                  buyingPrice: Number(
                    currentItem.buyingPrice || 0
                  ),

                  totalPrice:
                    Number(
                      item.price || currentItem.sellingPrice
                    ) * remainingQty,
                },
              });

              await tx.stockMovement.create({
                data: {
                  itemId: item.id,
                  quantity: -remainingQty,
                  type: "SALE",
                  note: `Sold legacy stock via invoice ${billNumber}`,
                },
              });

              totalSoldQty += remainingQty;
            }
          }

          // UPDATE MASTER STOCK

          await tx.item.update({
            where: {
              id: item.id,
            },
            data: {
              stockQty: {
                decrement: totalSoldQty,
              },
            },
          });
        }
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

      return { bill, issuedWarranties };
    });

    return NextResponse.json(
      {
        success: true,
        bill: result.bill,
        warranties: result.issuedWarranties,
      },
      {
        status: 201,
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

    console.error("[POST /api/bills]", error);

    // Two tills can pass the pre-check and still collide on the same serial.

    if (error?.code === "P2002") {

      return NextResponse.json(
        {
          error:
            "That serial number was just recorded on another bill. Check the serial and try again.",
        },
        { status: 409 }
      );
    }

    return NextResponse.json(
      {
        error: error.message || "Internal Server Error",
      },
      {
        status: 500,
      }
    );
  }
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
