import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

// 1. GET: Fetch bill by number
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const billNumber = searchParams.get("billNumber");

  const bill = await prisma.bill.findUnique({
    where: { billNumber: billNumber || "" },
    include: { billItems: { include: { item: true } }, customer: true }
  });

  if (!bill) return NextResponse.json({ error: "Bill not found" }, { status: 404 });
  
  // CHECK: Already Returned Check
  if (bill.status === "RETURNED") {
    return NextResponse.json({ error: "This bill has already been returned" }, { status: 400 });
  }
  
  return NextResponse.json({ success: true, data: bill });
}

// 2. POST: Process the return transaction
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  // Only Admin or Manager can process returns
  if (!session || (session.user.role === "CASHIER")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { billId, itemsToReturn, totalReturnAmount } = await req.json();

  try {
    await prisma.$transaction(async (tx) => {
      // 1. Inventory Restoration
      for (const item of itemsToReturn) {
        await tx.item.update({
          where: { id: item.itemId },
          data: { stockQty: { increment: item.quantity } }
        });
        
        await tx.stockMovement.create({
          data: {
            itemId: item.itemId,
            quantity: item.quantity,
            type: "RETURN",
            note: `Returned from Bill ${billId}`
          }
        });
      }

      // 2. Ledger Adjustment (Negative Payment)
      await tx.payment.create({
        data: {
          billId: billId,
          amount: -Math.abs(totalReturnAmount),
          method: "CASH" // Or default to original payment method
        }
      });

      // 3. Update Bill Status
      await tx.bill.update({
        where: { id: billId },
        data: { status: "RETURNED" }
      });
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: "Return transaction failed" }, { status: 500 });
  }
}