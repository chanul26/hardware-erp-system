import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

export async function POST(
  req: Request
) {

  try {

    const body =
      await req.json();

    const {

      supplierId,
      items,
      notes,

      amountPaid,

      paymentMethod,

      chequeNumber,
      chequeDate,
      chequeAmount,
      bankName,

    } = body;

    if (
      !supplierId ||
      !items ||
      items.length === 0
    ) {

      return NextResponse.json(
        {
          error:
            "Supplier ID and items are required.",
        },
        {
          status: 400,
        }
      );
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

      data: result,

    });

  } catch (error: any) {

    console.error(
      "RESTOCK ERROR:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Failed to process restock.",
      },
      {
        status: 500,
      }
    );
  }
}