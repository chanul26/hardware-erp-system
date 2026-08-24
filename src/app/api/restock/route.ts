import { OrderStatus, PaymentMethod, StockMovementType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { badRequest, conflict, ok, parseBody, route } from "@/lib/api";
import { requireManager } from "@/lib/authz";
import { restockSchema } from "@/lib/validation";
import { syncPurchaseOrderPaymentState } from "@/lib/ledger";
import {
  adjustStock,
  dec,
  nextDocumentNumber,
  recordMovement,
} from "@/lib/inventory";

/**
 * POST /api/restock — record an inbound delivery from a supplier.
 *
 * Three things changed from the original:
 *  1. The order total is computed here, never taken from the request.
 *  2. Payment status is derived from the supplier payment ledger *after* the
 *     cash and cheque rows are written, so a cheque-paid delivery is no longer
 *     recorded as UNPAID while a payment for the full amount sits against it.
 *  3. Every receipt writes a StockMovement, so the audit trail can actually be
 *     reconciled against Item.stockQty.
 */
export const POST = route("POST /api/restock", async (req) => {
  const user = await requireManager();
  const body = await parseBody(req, restockSchema);

  const supplier = await prisma.supplier.findUnique({
    where: { id: body.supplierId },
    select: { id: true, isActive: true, name: true },
  });

  if (!supplier) throw badRequest("The selected supplier no longer exists.");
  if (!supplier.isActive) throw conflict("That supplier is archived.");

  // Every referenced item must exist before we start writing.
  const itemIds = [...new Set(body.items.map((line) => line.itemId))];
  const items = await prisma.item.findMany({
    where: { id: { in: itemIds } },
    select: { id: true, name: true, isActive: true },
  });

  if (items.length !== itemIds.length) {
    throw badRequest("One or more items in this delivery no longer exist.");
  }

  const itemsById = new Map(items.map((item) => [item.id, item]));

  for (const line of body.items) {
    const item = itemsById.get(line.itemId)!;
    if (!item.isActive) throw conflict(`${item.name} is archived and cannot be restocked.`);
    if (line.sellingPrice > 0 && line.sellingPrice < line.unitCost) {
      throw badRequest(
        `${item.name}: selling price cannot be below the cost you paid.`
      );
    }
  }

    // TOTAL

    const totalAmount =
      items.reduce(
        (
          sum: number,
          item: any
        ) =>
          sum +
          item.quantity *
            item.unitCost,
        0
      );

    // PAID AMOUNT

    const finalAmountPaid =
      amountPaid !==
        undefined &&
      amountPaid !== ""
        ? Number(amountPaid)
        : 0;

    // PAYMENT STATUS

    let paymentStatus =
      "UNPAID";

    if (
      finalAmountPaid >=
      totalAmount
    ) {

      paymentStatus =
        "PAID";

    } else if (
      finalAmountPaid > 0
    ) {

      paymentStatus =
        "PARTIAL";
    }

    // TRANSACTION

    const result =
      await prisma.$transaction(
        async (tx) => {

          // CREATE PURCHASE ORDER

          const po =
            await tx.purchaseOrder.create({

              data: {

                orderNumber:
                  `RCV-${Date.now()
                    .toString()
                    .slice(-6)}`,

                supplierId,

                status:
                  "RECEIVED",

                paymentStatus,

                totalAmount,

                amountPaid:
                  finalAmountPaid,

                notes:
                  notes ||
                  "Direct Inbound Restock",

                receivedAt:
                  new Date(),

                purchaseItems: {

                  create:
                    items.map(
                      (
                        item: any
                      ) => ({

                        itemId:
                          item.itemId,

                        quantity:
                          item.quantity,

                        unitCost:
                          item.unitCost,

                        totalCost:
                          item.quantity *
                          item.unitCost,

                        receivedQty:
                          item.quantity,

                      })
                    ),

                },

              },

            });

          // CASH PAYMENT

          if (
            paymentMethod ===
              "CASH" &&
            finalAmountPaid >
              0
          ) {

            await tx.supplierPayment.create({

              data: {

                purchaseOrderId:
                  po.id,

                supplierId,

                amount:
                  finalAmountPaid,

                method:
                  "CASH",

                // Cash paid to a supplier normally comes from the owner's
                // wallet rather than the shop till, and is often a mix of
                // both — so the drawer's share is stated, not assumed, and
                // can never exceed what was actually paid.
                drawerAmount:
                  Math.min(
                    Math.max(
                      Number(
                        body.drawerAmount
                      ) || 0,
                      0
                    ),
                    finalAmountPaid
                  ),

              },

            });
          }

          // CHEQUE PAYMENT

          if (
            paymentMethod ===
            "CHEQUE"
          ) {

            const payment =
              await tx.supplierPayment.create({

                data: {

                  purchaseOrderId:
                    po.id,

                  supplierId,

                  amount:
                    Number(
                      chequeAmount
                    ),

                  method:
                    "CHEQUE",

                },

              });

            await tx.supplierCheque.create({

              data: {

                supplierPaymentId:
                  payment.id,

                chequeNumber,

                bank:
                  bankName,

                amount:
                  Number(
                    chequeAmount
                  ),

                chequeDate:
                  new Date(
                    chequeDate
                  ),

                status:
                  "PENDING",

              },

            });
          }

          // MIXED PAYMENT

          if (
            paymentMethod ===
            "MIXED"
          ) {

            // CASH PART

            if (
              finalAmountPaid >
              0
            ) {

              await tx.supplierPayment.create({

                data: {

                  purchaseOrderId:
                    po.id,

                  supplierId,

                  amount:
                    finalAmountPaid,

                  method:
                    "CASH",

                },

              });
            }

            // CHEQUE PART

            const remainingCheque =
              Number(
                chequeAmount
              );

            if (
              remainingCheque >
              0
            ) {

              const payment =
                await tx.supplierPayment.create({

                  data: {

                    purchaseOrderId:
                      po.id,

                    supplierId,

                    amount:
                      remainingCheque,

                    method:
                      "CHEQUE",

                  },

                });

              await tx.supplierCheque.create({

                data: {

                  supplierPaymentId:
                    payment.id,

                  chequeNumber,

                  bank:
                    bankName,

                  amount:
                    remainingCheque,

                  chequeDate:
                    new Date(
                      chequeDate
                    ),

                  status:
                    "PENDING",

                },

              });
            }
          }

          // WARRANTY ELIGIBILITY
          //
          // Warranty terms are only recorded for products flagged as
          // warranty-eligible. Anything else silently drops the terms even if
          // the client sent them.

          const eligibleItems =
            await tx.item.findMany({

              where: {

                id: {
                  in: items.map(
                    (
                      item: any
                    ) =>
                      item.itemId
                  ),
                },

                warrantyEligible:
                  true,
              },

              select: {
                id: true,
              },

            });

          const eligibleIds =
            new Set(
              eligibleItems.map(
                (
                  item
                ) => item.id
              )
            );

          // UPDATE INVENTORY + CREATE FIFO BATCHES

          for (const item of items) {

            // UPDATE ITEM STOCK

            await tx.item.update({

              where: {
                id: item.itemId,
              },

              data: {

                stockQty: {
                  increment:
                    item.quantity,
                },

                buyingPrice:
                  Number(
                    item.unitCost
                  ),

                // LATEST SELLING PRICE

                sellingPrice:
                  Number(
                    item.sellingPrice
                  ),

              },

            });

            // WARRANTY TERMS FOR THIS SHIPMENT

            const isEligible =
              eligibleIds.has(
                item.itemId
              );

            const months =
              Number(
                item.warrantyMonths
              );

            const warrantyMonths =
              isEligible &&
              Number.isFinite(
                months
              ) &&
              months > 0
                ? Math.round(
                    months
                  )
                : null;

            // CREATE PURCHASE BATCH

            await tx.purchaseBatch.create({

              data: {

                itemId:
                  item.itemId,

                quantity:
                  item.quantity,

                remainingQty:
                  item.quantity,

                buyingPrice:
                  Number(
                    item.unitCost
                  ),

                sellingPrice:
                  Number(
                    item.sellingPrice
                  ),

                // WARRANTY

                warrantyMonths,

                supplierWarrantyRef:
                  warrantyMonths
                    ? item.supplierWarrantyRef ||
                      null
                    : null,

                supplierId,

                purchaseOrderId:
                  po.id,

              },

            });

          }

          return po;
        }
      );

    return NextResponse.json({

      success: true,

      message:
        "Stock updated successfully",
  const totalAmount = body.items.reduce(
    (sum, line) => sum.plus(dec(line.quantity).mul(dec(line.unitCost))),
    dec(0)
  );

  const cashPaid = dec(body.paymentMethod === "CHEQUE" ? 0 : body.amountPaid);
  const chequePaid = dec(body.paymentMethod === "CASH" ? 0 : body.chequeAmount);

  if (cashPaid.plus(chequePaid).gt(totalAmount)) {
    throw badRequest(
      "Total paid is more than the value of the delivery. Check the amounts."
    );
  }

  const order = await prisma.$transaction(
    async (tx) => {
      const orderNumber = await nextDocumentNumber(tx, "PURCHASE", "GRN");

      const purchaseOrder = await tx.purchaseOrder.create({
        data: {
          orderNumber,
          supplierId: supplier.id,
          status: OrderStatus.RECEIVED,
          totalAmount,
          notes: body.notes ?? "Direct inbound restock",
          receivedAt: new Date(),
          purchaseItems: {
            create: body.items.map((line) => ({
              itemId: line.itemId,
              quantity: dec(line.quantity),
              unitCost: dec(line.unitCost),
              totalCost: dec(line.quantity).mul(dec(line.unitCost)),
              receivedQty: dec(line.quantity),
            })),
          },
        },
        select: { id: true, orderNumber: true },
      });

      // ── Payments ──
      if (cashPaid.gt(0)) {
        await tx.supplierPayment.create({
          data: {
            purchaseOrderId: purchaseOrder.id,
            supplierId: supplier.id,
            amount: cashPaid,
            method: PaymentMethod.CASH,
          },
        });
      }

      if (chequePaid.gt(0)) {
        const payment = await tx.supplierPayment.create({
          data: {
            purchaseOrderId: purchaseOrder.id,
            supplierId: supplier.id,
            amount: chequePaid,
            method: PaymentMethod.CHEQUE,
            reference: body.chequeNumber ?? null,
          },
        });

        await tx.supplierCheque.create({
          data: {
            supplierPaymentId: payment.id,
            chequeNumber: body.chequeNumber!,
            bank: body.bankName!,
            amount: chequePaid,
            chequeDate: new Date(body.chequeDate!),
          },
        });
      }

      // ── Stock, batches and the audit trail ──
      for (const line of body.items) {
        const item = itemsById.get(line.itemId)!;
        const quantity = dec(line.quantity);

        const balance = await adjustStock(tx, line.itemId, quantity, item.name);

        await tx.purchaseBatch.create({
          data: {
            itemId: line.itemId,
            purchaseOrderId: purchaseOrder.id,
            supplierId: supplier.id,
            quantity,
            remainingQty: quantity,
            buyingPrice: dec(line.unitCost),
            sellingPrice: dec(line.sellingPrice),
          },
        });

        // The master price is the default for future batches; historical cost
        // stays pinned to each batch.
        await tx.item.update({
          where: { id: line.itemId },
          data: {
            buyingPrice: dec(line.unitCost),
            ...(line.sellingPrice > 0
              ? { sellingPrice: dec(line.sellingPrice) }
              : {}),
          },
        });

        await recordMovement(tx, {
          itemId: line.itemId,
          type: StockMovementType.PURCHASE,
          quantity,
          balance,
          userId: user.id,
          note: `Received on ${purchaseOrder.orderNumber} from ${supplier.name}`,
        });
      }

      const state = await syncPurchaseOrderPaymentState(tx, purchaseOrder.id);

      return {
        id: purchaseOrder.id,
        orderNumber: purchaseOrder.orderNumber,
        totalAmount,
        amountPaid: state.amountPaid,
        paymentStatus: state.paymentStatus,
      };
    },
    { timeout: 20_000 }
  );

  return ok(order, 201);
});
