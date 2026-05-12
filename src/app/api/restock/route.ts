import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(
  req: Request
) {
  try {
    const body = await req.json();

    const {
      supplierId,
      items,
      notes,
      amountPaid,
    } = body;

    if (
      !supplierId ||
      !items ||
      items.length === 0
    ) {
      return NextResponse.json(
        {
          error:
            "Supplier ID and at least one item are required.",
        },
        {
          status: 400,
        }
      );
    }

    // TOTAL BILL AMOUNT

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

    // AMOUNT PAID

    const finalAmountPaid =
      amountPaid !==
        undefined &&
      amountPaid !== ""
        ? Number(amountPaid)
        : totalAmount;

    // PAYMENT STATUS

    let paymentStatus =
      "UNPAID";

    if (
      finalAmountPaid >=
      totalAmount
    ) {
      paymentStatus = "PAID";
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
          // STEP A
          // CREATE PURCHASE ORDER

          const po =
            await tx.purchaseOrder.create(
              {
                data: {
                  orderNumber: `RCV-${Date.now()
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

                  purchaseItems:
                    {
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
              }
            );

          // STEP B
          // CREATE SUPPLIER PAYMENT

          if (
            finalAmountPaid >
            0
          ) {
            await tx.supplierPayment.create(
              {
                data: {
                  purchaseOrderId:
                    po.id,

                  supplierId,

                  amount:
                    finalAmountPaid,

                  method:
                    "CASH",
                },
              }
            );
          }

          // STEP C
          // UPDATE INVENTORY
          // + CREATE MOVEMENT RECORDS

          for (const item of items) {
            // UPDATE STOCK

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
              },
            });

            // CREATE MOVEMENT

            await tx.stockMovement.create(
              {
                data: {
                  itemId:
                    item.itemId,

                  quantity:
                    item.quantity,

                  type:
                    "PURCHASE",

                  note: `Purchase Order: ${po.orderNumber}`,
                },
              }
            );
          }

          return po;
        }
      );

    return NextResponse.json({
      success: true,

      message:
        "Stock updated and movement history recorded",

      data: result,
    });
  } catch (error: any) {
    console.error(
      "DIRECT RESTOCK ERROR:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Failed to process restock transaction.",
      },
      {
        status: 500,
      }
    );
  }
}