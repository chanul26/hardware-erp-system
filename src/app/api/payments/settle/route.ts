import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { customerId, amount } = body;
    
    let remainingCash = Number(amount);

    if (!customerId || remainingCash <= 0) {
      return NextResponse.json({ error: "Invalid payment data" }, { status: 400 });
    }

    await prisma.$transaction(async (tx) => {
      // 1. FIX: Fetch ALL bills for the customer. 
      // We no longer trust the "status" text. We trust the raw math.
      const allCustomerBills = await tx.bill.findMany({
        where: { customerId: customerId },
        include: { payments: true },
        orderBy: { createdAt: 'asc' }
      });

      for (const bill of allCustomerBills) {
        if (remainingCash <= 0) break; 

        const billTotal = Number(bill.totalAmount);
        
        // Calculate exact debt using the ledger, ignoring the status string
        const billPaidSoFar = bill.payments.reduce((sum, p) => sum + Number(p.amount), 0);
        const debtOnThisBill = billTotal - billPaidSoFar;

        // If there is mathematical debt on this bill, apply the cash
        if (debtOnThisBill > 0) {
          const amountToApply = Math.min(remainingCash, debtOnThisBill);
          const newAmountPaid = billPaidSoFar + amountToApply;
          
          // Auto-correct the status text while we are updating it
          const newStatus = newAmountPaid >= billTotal ? "PAID" : "PARTIAL";

          // 2. Update the Bill
          await tx.bill.update({
            where: { id: bill.id },
            data: {
              amountPaid: newAmountPaid,
              status: newStatus
            } as any 
          });

          // 3. Log the permanent Payment Record
          await tx.payment.create({
            data: {
              billId: bill.id,
              customerId: customerId,
              amount: amountToApply,
              method: "CASH"
            }
          });

          remainingCash -= amountToApply;
        }
      }
    });

    return NextResponse.json({ success: true, message: "Debt successfully settled." });
  } catch (error: any) {
    console.error("SETTLEMENT ERROR:", error);
    return NextResponse.json({ error: "Failed to process settlement" }, { status: 500 });
  }
}