import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const { customerId, items, subtotal, discount, tax, totalAmount, paymentMethod, amountPaid } = body;

    if (!items || items.length === 0) {
      return NextResponse.json({ error: "Cannot process an empty cart." }, { status: 400 });
    }

    const billNumber = `INV-${Date.now().toString().slice(-6)}`;

    const result = await prisma.$transaction(async (tx) => {
      // 1. CREATE THE MASTER INVOICE
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

      // 2. PROCESS EVERY ITEM (Exchanges support both Negative and Positive items)
      for (const item of items) {
        
        // ==========================================                                                     
        // SCENARIO A: THIS IS A RETURNED ITEM (Negative Qty)
        // ==========================================
        if (item.isReturn) {
          const absQty = Math.abs(item.quantity);  

          // 1. Mark original invoice item as returned
          const originalItem = await tx.billItem.findUnique({ where: { id: item.originalBillItemId } });
          if (!originalItem) throw new Error("Original bill item missing");
          if (originalItem.returnedQty + absQty > originalItem.quantity) {
             throw new Error(`Cannot return more than purchased for ${item.name}`);
          }

          await tx.billItem.update({
            where: { id: item.originalBillItemId },
            data: { returnedQty: { increment: absQty } }
          });

          // 2. Increment Master Stock (return ONLY)
          const currentItem = await tx.item.findUnique({ where: { id: item.id } });
          if (!currentItem) throw new Error("Item missing for return");

          await tx.item.update({
            where: { id: item.id },
            data: { stockQty: { increment: absQty } },
          });

          // 3. Create a new PurchaseBatch so it can be sold again
          await tx.purchaseBatch.create({
            data: {
              itemId: item.id,
              quantity: absQty,
              remainingQty: absQty,
              buyingPrice: currentItem.buyingPrice,
              sellingPrice: item.price,
            },
          });

          // 4. Stock Movement Audit
          await tx.stockMovement.create({
            data: {
              itemId: item.id,
              quantity: absQty,
              type: "RETURN",
              note: `Returned from Bill ${item.originalBillId} via Exchange Invoice ${billNumber}`
            }
          });

          // 5. Add the negative line item to the current bill
          await tx.billItem.create({
            data: {
              billId: bill.id,
              itemId: item.id,
              quantity: item.quantity, // Negative
              unitPrice: item.price,
              totalPrice: item.price * item.quantity, // Negative
            }
          });

        } else {
          // ==========================================
          // SCENARIO B: STANDARD SALE (Positive Qty)
          // ==========================================
          const currentItem = await tx.item.findUnique({ where: { id: item.id } });
          if (!currentItem || currentItem.stockQty < item.quantity) {
            throw new Error(`Insufficient stock for item: ${item.name}`);
          }

          const fifoBatches = await tx.purchaseBatch.findMany({
            where: { itemId: item.id, remainingQty: { gt: 0 } },
            orderBy: { createdAt: "asc" },
          });

          let remainingQty = item.quantity;

          for (const batch of fifoBatches) {
            if (remainingQty <= 0) break;
            const qtyToTake = Math.min(remainingQty, batch.remainingQty);

            await tx.billItem.create({
              data: {
                billId: bill.id,
                itemId: item.id,
                quantity: qtyToTake,
                unitPrice: Number(item.price || batch.sellingPrice),
                totalPrice: Number(item.price || batch.sellingPrice) * qtyToTake,
              },
            });

            await tx.purchaseBatch.update({
              where: { id: batch.id },
              data: { remainingQty: { decrement: qtyToTake } },
            });

            await tx.stockMovement.create({
              data: {
                itemId: item.id,
                quantity: -qtyToTake,
                type: "SALE",
                note: `Sold ${qtyToTake} qty from FIFO batch via invoice ${billNumber}`,
              },
            });

            remainingQty -= qtyToTake;
          }

          if (remainingQty > 0) {
            await tx.billItem.create({
              data: {
                billId: bill.id,
                itemId: item.id,
                quantity: remainingQty,
                unitPrice: Number(item.price || currentItem.sellingPrice),
                totalPrice: Number(item.price || currentItem.sellingPrice) * remainingQty,
              },
            });

            await tx.stockMovement.create({
              data: {
                itemId: item.id,
                quantity: -remainingQty,
                type: "SALE",
                note: `Sold ${remainingQty} legacy stock via invoice ${billNumber}`,
              },
            });
          }

          await tx.item.update({
            where: { id: item.id },
            data: { stockQty: { decrement: item.quantity } },
          });
        }
      }

      // 3. CREATE THE LEDGER PAYMENT (Handles Positive Revenue AND Negative Refunds seamlessly)
      const finalAmountToLog = amountPaid !== undefined && amountPaid !== "" ? Number(amountPaid) : Number(totalAmount);
      
      await tx.payment.create({
        data: {
          billId: bill.id,
          customerId: customerId || null,
          amount: finalAmountToLog, 
          method: paymentMethod || "CASH",
        },
      });

      return bill;
    });

    return NextResponse.json({ success: true, bill: result }, { status: 201 });

  } catch (error: any) {
    console.error("[POST /api/bills]", error);
    return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 });
  }
}