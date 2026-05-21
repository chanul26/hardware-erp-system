import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(
  request: Request
) {
  try {

    // AUTH

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
      await request.json();

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

    // VALIDATION

    if (
      !items ||
      items.length === 0
    ) {

      return NextResponse.json(
        {
          error:
            "Cannot process an empty cart.",
        },
        {
          status: 400,
        }
      );
    }

    // INVOICE NUMBER

    const billNumber =
      `INV-${Date.now()
        .toString()
        .slice(-6)}`;

    // TRANSACTION

    const result =
      await prisma.$transaction(
        async (tx) => {

          // CREATE BILL

          const bill =
            await tx.bill.create({
              data: {
                billNumber,

                userId:
                  (session.user as any)
                    .id,

                customerId:
                  customerId || null,

                subtotal,

                discount:
                  discount || 0,

                tax:
                  tax || 0,

                totalAmount,

                status: "PAID",
              },
            });

          // LOOP ITEMS

          for (const item of items) {

            // FIND ITEM

            const currentItem =
              await tx.item.findUnique(
                {
                  where: {
                    id: item.id,
                  },
                }
              );

            if (
              !currentItem ||
              currentItem.stockQty <
                item.quantity
            ) {

              throw new Error(
                `Insufficient stock for item: ${item.name}`
              );
            }

            // GET ALL FIFO BATCHES

            const fifoBatches =
              await tx.purchaseBatch.findMany(
                {
                  where: {
                    itemId:
                      item.id,

                    remainingQty: {
                      gt: 0,
                    },
                  },

                  orderBy: {
                    createdAt:
                      "asc",
                  },
                }
              );

            if (
              fifoBatches.length === 0
            ) {

              throw new Error(
                `No purchase batch found for ${item.name}`
              );
            }

            // TOTAL AVAILABLE

            const totalBatchStock =
              fifoBatches.reduce(
                (
                  total,
                  batch
                ) =>
                  total +
                  batch.remainingQty,
                0
              );

            if (
              totalBatchStock <
              item.quantity
            ) {

              throw new Error(
                `Not enough batch stock for ${item.name}`
              );
            }

            // FIFO SELLING

            let remainingQty =
              item.quantity;

            for (const batch of fifoBatches) {

              if (
                remainingQty <= 0
              ) {
                break;
              }

              // HOW MANY TO TAKE FROM THIS BATCH

              const qtyToTake =
                Math.min(
                  remainingQty,
                  batch.remainingQty
                );

              // CREATE BILL ITEM

              await tx.billItem.create(
                {
                  data: {
                    billId:
                      bill.id,

                    itemId:
                      item.id,

                    quantity:
                      qtyToTake,

                    unitPrice:
                      Number(
                        batch.sellingPrice
                      ),

                    totalPrice:
                      Number(
                        batch.sellingPrice
                      ) *
                      qtyToTake,
                  },
                }
              );

              // REDUCE BATCH STOCK

              await tx.purchaseBatch.update(
                {
                  where: {
                    id: batch.id,
                  },

                  data: {
                    remainingQty: {
                      decrement:
                        qtyToTake,
                    },
                  },
                }
              );

              // STOCK MOVEMENT

              await tx.stockMovement.create(
                {
                  data: {
                    itemId:
                      item.id,

                    quantity:
                      -qtyToTake,

                    type: "SALE",

                    note: `Sold ${qtyToTake} qty from FIFO batch via invoice ${billNumber}`,
                  },
                }
              );

              // REDUCE REMAINING

              remainingQty -=
                qtyToTake;
            }

            // REDUCE MAIN ITEM STOCK

            await tx.item.update({
              where: {
                id: item.id,
              },

              data: {
                stockQty: {
                  decrement:
                    item.quantity,
                },
              },
            });
          }

          // CREATE PAYMENT

          await tx.payment.create(
            {
              data: {
                billId:
                  bill.id,

                customerId:
                  customerId ||
                  null,

                amount:
                  amountPaid ||
                  totalAmount,

                method:
                  paymentMethod ||
                  "CASH",
              },
            }
          );

          return bill;
        }
      );

    return NextResponse.json(
      {
        success: true,

        bill: result,
      },
      {
        status: 201,
      }
    );

  } catch (error: any) {

    console.error(
      "[POST /api/bills]",
      error
    );

    return NextResponse.json(
      {
        error:
          error.message ||
          "Internal Server Error",
      },
      {
        status: 500,
      }
    );
  }
}