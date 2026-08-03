import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  addMonths,
  generateWarrantyNumber,
  normaliseMonths,
} from "@/lib/warranty";

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await request.json();

    const {
      customerId,
      items,
      subtotal,
      discount,
      tax,
      totalAmount,
      paymentMethod,
      amountPaid,
    } = body;

    if (!items || items.length === 0) {
      return NextResponse.json(
        { error: "Cannot process an empty cart." },
        { status: 400 }
      );
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

    const result = await prisma.$transaction(async (tx) => {

      // =========================
      // CREATE BILL
      // =========================

      const bill = await tx.bill.create({
        data: {
          billNumber,
          userId: (session.user as any).id,
          customerId: customerId || null,
          subtotal,
          discount: discount || 0,
          tax: tax || 0,
          totalAmount,
          status: "PAID",
        },
      });

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

            if (selectedBatch.remainingQty < item.quantity) {
              throw new Error(
                `Not enough stock in selected batch for ${item.name}`
              );
            }

            // CREATE BILL ITEM

            const createdBillItem = await tx.billItem.create({
              data: {
                billId: bill.id,
                itemId: item.id,

                batchId: selectedBatch.id,

                quantity: item.quantity,

                unitPrice: Number(item.price),

                buyingPrice: Number(
                  selectedBatch.buyingPrice || 0
                ),

                totalPrice:
                  Number(item.price) * item.quantity,
              },
            });

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

            await tx.purchaseBatch.update({
              where: {
                id: selectedBatch.id,
              },
              data: {
                remainingQty: {
                  decrement: item.quantity,
                },
              },
            });

            // STOCK MOVEMENT

            await tx.stockMovement.create({
              data: {
                itemId: item.id,
                quantity: -item.quantity,
                type: "SALE",
                note: `Sold from selected batch via invoice ${billNumber}`,
              },
            });

            totalSoldQty = item.quantity;

          }

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
      }

      // =========================
      // PAYMENT
      // =========================

      const finalAmountToLog =
        amountPaid !== undefined &&
        amountPaid !== ""
          ? Number(amountPaid)
          : Number(totalAmount);

      await tx.payment.create({
        data: {
          billId: bill.id,
          customerId: customerId || null,
          amount: finalAmountToLog,
          method: paymentMethod || "CASH",
        },
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
      }
    );

  } catch (error: any) {

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