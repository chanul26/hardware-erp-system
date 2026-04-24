import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  try {
    // 1. Authenticate the Cashier/Admin
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { customerId, items, subtotal, discount, tax, totalAmount, paymentMethod, amountPaid } = body;

    // 2. Initial Validation
    if (!items || items.length === 0) {
      return NextResponse.json({ error: "Cannot process an empty cart." }, { status: 400 });
    }

    // Generate a unique bill invoice number
    const billNumber = `INV-${Date.now().toString().slice(-6)}`;

    // 3. The Unbreakable Prisma Transaction
    const result = await prisma.$transaction(async (tx) => {
      
      // A. Create the master Bill record
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

      // B. Loop through cart items
      for (const item of items) {
        
        // Critical: Verify stock hasn't changed before selling
        const currentItem = await tx.item.findUnique({ where: { id: item.id } });
        if (!currentItem || currentItem.stockQty < item.quantity) {
          throw new Error(`Insufficient stock for item: ${item.name}`); // This aborts the whole transaction
        }

        // C. Log the individual line item
        await tx.billItem.create({
          data: {
            billId: bill.id,
            itemId: item.id,
            quantity: item.quantity,
            unitPrice: item.price,
            totalPrice: item.quantity * item.price,
          },
        });

        // D. Deduct the stock quantity from inventory
        await tx.item.update({
          where: { id: item.id },
          data: {
            stockQty: {
              decrement: item.quantity,
            },
          },
        });
      }

      // E. Record the Ledger Payment
      await tx.payment.create({
        data: {
          billId: bill.id,
          customerId: customerId || null,
          amount: amountPaid || totalAmount,
          method: paymentMethod || "CASH",
        },
      });

      return bill;
    });

    return NextResponse.json({ success: true, bill: result }, { status: 201 });

  } catch (error: any) {
    console.error("[POST /api/bills]", error);
    
    // Safely catch our custom inventory errors and send them to the frontend
    if (error.message && error.message.includes("Insufficient stock")) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}