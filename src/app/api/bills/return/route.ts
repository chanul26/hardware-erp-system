  import { NextResponse } from "next/server";
  import { prisma } from "@/lib/prisma";

  export const dynamic = "force-dynamic";

  export async function GET(req: Request) {
    try {
      const { searchParams } = new URL(req.url);
      const billNumber = searchParams.get("billNumber");

      if (!billNumber) {
        return NextResponse.json({ error: "Invoice number is required" }, { status: 400 });
      }

      const bill = await prisma.bill.findUnique({
        where: { billNumber },
        include: { 
          billItems: { include: { item: true } }, 
          customer: true 
        }
      });

      if (!bill) {
        return NextResponse.json({ error: "Invoice not found in the system" }, { status: 404 });
      }

      // SUPER LOGIC: Calculate exactly what is left to return based on raw math, not status text.
      const availableItems = bill.billItems
        .map(item => ({
          ...item,
          availableToReturn: item.quantity - item.returnedQty
        }))
        .filter(item => item.availableToReturn > 0); // Only keep items that haven't been fully returned

      if (availableItems.length === 0) {
        return NextResponse.json({ error: "All items from this invoice have already been returned." }, { status: 400 });
      }

      return NextResponse.json({ 
        success: true, 
        data: {
          ...bill,
          billItems: availableItems
        } 
      });

    } catch (error: any) {
      console.error("[GET /api/bills/return]", error);
      return NextResponse.json({ error: "Failed to fetch invoice data" }, { status: 500 });
    }
  }