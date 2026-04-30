import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { supplierId, items, notes } = body;

    // 1. Input Validation
    if (!supplierId || !items || items.length === 0) {
      return NextResponse.json(
        { error: "Supplier ID and at least one item are required." },
        { status: 400 }
      );
    }

    // 2. Calculate the exact total cost of this delivery
    const totalAmount = items.reduce(
      (sum: number, item: any) => sum + item.quantity * item.unitCost,
      0
    );

    // 3. THE UNBREAKABLE TRANSACTION
    // We execute the PO creation, the Line Items, and the Stock Update all at once.
    // If any single step fails, Prisma rolls back the entire database to protect your data.
    const transactionSteps = [];

    // Step A: Create the Purchase Order immediately as "RECEIVED"
    const orderNumber = `RCV-${Date.now().toString().slice(-6)}`;
    const createRestockBill = prisma.purchaseOrder.create({
      data: {
        orderNumber,
        supplierId,
        status: "RECEIVED",
        totalAmount,
        notes: notes || "Direct Inbound Restock",
        receivedAt: new Date(),
        purchaseItems: {
          create: items.map((item: any) => ({
            itemId: item.itemId,
            quantity: item.quantity,
            unitCost: item.unitCost,
            totalCost: item.quantity * item.unitCost,
            receivedQty: item.quantity, // Fully received instantly
          })),
        },
      },
    });
    transactionSteps.push(createRestockBill);

    // Step B: Loop through every item and increment the global stock quantity
    for (const item of items) {
      const updateStock = prisma.item.update({
        where: { id: item.itemId },
        data: {
          stockQty: {
            increment: item.quantity,
          },
        },
      });
      transactionSteps.push(updateStock);
    }

    // Execute the transaction
    const result = await prisma.$transaction(transactionSteps);

    return NextResponse.json({
      success: true,
      message: "Stock successfully updated",
      data: result[0], // Returns the created Purchase Order
    });

  } catch (error: any) {
    console.error("DIRECT RESTOCK ERROR:", error);
    return NextResponse.json(
      { error: "Failed to process restock transaction. Please try again." },
      { status: 500 }
    );
  }
}