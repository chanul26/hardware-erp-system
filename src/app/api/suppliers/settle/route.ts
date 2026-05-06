import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { supplierId, amount } = body;
    
    let remainingCash = Number(amount);

    if (!supplierId || remainingCash <= 0) {
      return NextResponse.json({ error: "Invalid payment data" }, { status: 400 });
    }

    await prisma.$transaction(async (tx) => {
      // 1. Fetch all unpaid Purchase Orders for this supplier, oldest first
      const unpaidOrders = await tx.purchaseOrder.findMany({
        where: {
          supplierId: supplierId,
          paymentStatus: { in: ["UNPAID", "PARTIAL"] }
        },
        include: { supplierPayments: true }, // Pull the exact ledger
        orderBy: { createdAt: 'asc' }
      });

      for (const order of unpaidOrders) {
        if (remainingCash <= 0) break; 

        const orderTotal = Number(order.totalAmount);
        
        // Calculate exact debt ignoring text status
        const paidSoFar = order.supplierPayments.reduce((sum, p) => sum + Number(p.amount), 0);
        const debtOnThisOrder = orderTotal - paidSoFar;

        if (debtOnThisOrder > 0) {
          const amountToApply = Math.min(remainingCash, debtOnThisOrder);
          const newAmountPaid = paidSoFar + amountToApply;
          const newStatus = newAmountPaid >= orderTotal ? "PAID" : "PARTIAL";

          // 2. Update the Purchase Order
          await tx.purchaseOrder.update({
            where: { id: order.id },
            data: {
              amountPaid: newAmountPaid,
              paymentStatus: newStatus
            } as any 
          });

          // 3. Log the permanent Outgoing Payment Record
          await tx.supplierPayment.create({
            data: {
              purchaseOrderId: order.id,
              supplierId: supplierId,
              amount: amountToApply,
              method: "CASH"
            }
          });

          remainingCash -= amountToApply;
        }
      }
    });

    return NextResponse.json({ success: true, message: "Payment to supplier successfully recorded." });
  } catch (error: any) {
    console.error("SUPPLIER SETTLEMENT ERROR:", error);
    return NextResponse.json({ error: "Failed to process supplier payment" }, { status: 500 });
  }
}