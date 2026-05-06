import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma"; // Use the global prisma instance

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { supplierId, items, notes, amountPaid } = body;

    if (!supplierId || !items || items.length === 0) {
      return NextResponse.json(
        { error: "Supplier ID and at least one item are required." },
        { status: 400 }
      );
    }

    const totalAmount = items.reduce(
      (sum: number, item: any) => sum + item.quantity * item.unitCost,
      0
    );

    const finalAmountPaid = amountPaid !== undefined && amountPaid !== "" ? Number(amountPaid) : totalAmount;
    
    let paymentStatus = "UNPAID";
    if (finalAmountPaid >= totalAmount) {
        paymentStatus = "PAID";
    } else if (finalAmountPaid > 0) {
        paymentStatus = "PARTIAL";
    }

    // THE FIX: We use a sequential transaction to ensure we get the PO ID
    // so we can attach the payment ledger directly to it.
    const result = await prisma.$transaction(async (tx) => {
      
      // Step A: Create the Purchase Order
      const po = await tx.purchaseOrder.create({
        data: {
          orderNumber: `RCV-${Date.now().toString().slice(-6)}`,
          supplierId,
          status: "RECEIVED", 
          paymentStatus,      
          totalAmount,        
          amountPaid: finalAmountPaid, 
          notes: notes || "Direct Inbound Restock",
          receivedAt: new Date(),
          purchaseItems: {
            create: items.map((item: any) => ({
              itemId: item.itemId,
              quantity: item.quantity,
              unitCost: item.unitCost,
              totalCost: item.quantity * item.unitCost,
              receivedQty: item.quantity, 
            })),
          },
        },
      });

      // Step B: THE MISSING LEDGER LOGIC
      // If Uncle paid anything upfront, log it in the SupplierPayment ledger!
      if (finalAmountPaid > 0) {
        await tx.supplierPayment.create({
          data: {
            purchaseOrderId: po.id,
            supplierId: supplierId,
            amount: finalAmountPaid,
            method: "CASH"
          }
        });
      }

      // Step C: Update Inventory
      for (const item of items) {
        await tx.item.update({
          where: { id: item.itemId },
          data: {
            stockQty: {
              increment: item.quantity,
            },
          },
        });
      }

      return po;
    });

    return NextResponse.json({
      success: true,
      message: "Stock updated and supplier ledger recorded",
      data: result, 
    });

  } catch (error: any) {
    console.error("DIRECT RESTOCK ERROR:", error);
    return NextResponse.json(
      { error: "Failed to process restock transaction." },
      { status: 500 }
    );
  }
}