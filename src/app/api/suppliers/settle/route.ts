import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { supplierId, amount } = body;

    // How the supplier was actually paid. Cash is the common case, but a
    // "cash" payment is usually funded from the owner's wallet or a bank
    // transfer — only when it came out of the shop till does it reduce cash
    // in hand, so that has to be stated rather than assumed.
    const method = ["CASH", "CARD", "CHEQUE", "BANK_TRANSFER"].includes(
      body.method
    )
      ? body.method
      : "CASH";

    let remainingCash = Number(amount);

    // How much of the settlement came out of the shop till. Often only part of
    // it — the rest from the owner's wallet — so this is an amount, not a
    // flag. It is spread across the orders in the same proportion as the
    // payment itself, so the drawer's share always sums back to what was
    // taken out of it.
    const drawerTotal =
      method === "CASH"
        ? Math.min(
            Math.max(Number(body.drawerAmount) || 0, 0),
            remainingCash
          )
        : 0;

    const drawerShare = remainingCash > 0 ? drawerTotal / remainingCash : 0;

    let drawerLeft = drawerTotal;

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

          // The last order to be settled takes whatever drawer money is left
          // rather than its rounded share, so the parts always add back up to
          // the total taken from the till.
          const drawerForThisOrder = Math.min(
            Math.round(amountToApply * drawerShare * 100) / 100,
            drawerLeft
          );

          // 3. Log the permanent Outgoing Payment Record
          await tx.supplierPayment.create({
            data: {
              purchaseOrderId: order.id,
              supplierId: supplierId,
              amount: amountToApply,
              method,
              drawerAmount: drawerForThisOrder
            }
          });

          drawerLeft -= drawerForThisOrder;
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