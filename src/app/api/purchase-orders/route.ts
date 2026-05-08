import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const {
      billNumber,
      supplierId,
      items,
      paymentMethod,
      amountPaid,
      chequeNumber,
      bankName,
      chequeDate,
      notes,
    } = body;

    // =========================================
    // VALIDATION
    // =========================================

    if (!billNumber) {
      return NextResponse.json(
        { error: "Bill number is required" },
        { status: 400 }
      );
    }

    if (!supplierId) {
      return NextResponse.json(
        { error: "Supplier is required" },
        { status: 400 }
      );
    }

    if (!items || items.length === 0) {
      return NextResponse.json(
        { error: "At least one item is required" },
        { status: 400 }
      );
    }

    // =========================================
    // CALCULATE TOTAL
    // =========================================

    const totalAmount = items.reduce(
      (sum: number, item: any) =>
        sum +
        Number(item.quantity) *
          Number(item.unitCost),
      0
    );

    // CASH PAID
    const paidAmount = Number(
      amountPaid || 0
    );

    // CHEQUE AMOUNT
    const chequeAmount =
      totalAmount - paidAmount;

    // =========================================
    // PAYMENT STATUS
    // =========================================

    let paymentStatus = "UNPAID";

    if (paidAmount >= totalAmount) {
      paymentStatus = "PAID";
    } else if (paidAmount > 0) {
      paymentStatus = "PARTIAL";
    }

    // =========================================
    // TRANSACTION
    // =========================================

    const result = await prisma.$transaction(
      async (tx) => {
        // =====================================
        // CREATE PURCHASE ORDER
        // =====================================

        const purchaseOrder =
          await tx.purchaseOrder.create({
            data: {
              orderNumber: billNumber,

              supplierId,

              status: "RECEIVED",

              paymentStatus,

              totalAmount,

              amountPaid: paidAmount,

              notes,

              receivedAt: new Date(),

              purchaseItems: {
                create: items.map(
                  (item: any) => ({
                    itemId: item.itemId,

                    quantity: Number(
                      item.quantity
                    ),

                    unitCost: Number(
                      item.unitCost
                    ),

                    totalCost:
                      Number(item.quantity) *
                      Number(item.unitCost),

                    receivedQty: Number(
                      item.quantity
                    ),
                  })
                ),
              },
            },
          });

        // =====================================
        // UPDATE INVENTORY
        // =====================================

        for (const item of items) {
          await tx.item.update({
            where: {
              id: item.itemId,
            },

            data: {
              stockQty: {
                increment: Number(
                  item.quantity
                ),
              },
            },
          });
        }

        // =====================================
        // SAVE PAYMENT
        // =====================================

        let supplierPayment = null;

        if (
          paidAmount > 0 ||
          paymentMethod === "CHEQUE"
        ) {
          supplierPayment =
            await tx.supplierPayment.create({
              data: {
                purchaseOrderId:
                  purchaseOrder.id,

                supplierId,

                // SAVE CHEQUE VALUE FOR CHEQUE
                amount:
                  paymentMethod ===
                  "CHEQUE"
                    ? chequeAmount
                    : paidAmount,

                method: paymentMethod,

                reference:
                  paymentMethod ===
                  "CHEQUE"
                    ? chequeNumber
                    : null,
              },
            });

          // =================================
          // SAVE CHEQUE DETAILS
          // =================================

          if (
            paymentMethod === "CHEQUE" &&
            supplierPayment
          ) {
            await tx.supplierCheque.create({
              data: {
                supplierPaymentId:
                  supplierPayment.id,

                chequeNumber,

                bank: bankName,

                // SAVE CHEQUE AMOUNT
                amount: chequeAmount,

                chequeDate: new Date(
                  chequeDate
                ),
              },
            });
          }
        }

        return purchaseOrder;
      }
    );

    return NextResponse.json({
      success: true,

      message:
        "Purchase bill saved successfully",

      data: result,
    });
  } catch (error) {
    console.error(
      "PURCHASE ORDER ERROR:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Failed to save purchase order",
      },
      {
        status: 500,
      }
    );
  }
}