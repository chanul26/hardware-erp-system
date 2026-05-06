import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const suppliers = await prisma.supplier.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        purchaseOrders: { select: { totalAmount: true } },
        supplierPayments: { select: { amount: true } }
      }
    });

    // Calculate live debt (How much Uncle owes to each supplier)
    const suppliersWithDebt = suppliers.map(sup => {
      const totalBilled = sup.purchaseOrders.reduce((sum, po) => sum + Number(po.totalAmount), 0);
      const totalPaid = sup.supplierPayments.reduce((sum, p) => sum + Number(p.amount), 0);
      
      const { purchaseOrders, supplierPayments, ...cleanSupplier } = sup; 
      return {
        ...cleanSupplier,
        totalDebt: Math.max(0, totalBilled - totalPaid)
      };
    });

    return NextResponse.json({ success: true, data: suppliersWithDebt });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch suppliers" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, phone, email, address } = body;

    // Validation: Name is required
    if (!name) {
      return NextResponse.json(
        { success: false, error: "Supplier name is required" },
        { status: 400 }
      );
    }

    // Validation: Check if email already exists
    if (email) {
      const existing = await prisma.supplier.findUnique({ where: { email } });
      if (existing) {
        return NextResponse.json(
          { success: false, error: "A supplier with this email already exists" },
          { status: 400 }
        );
      }
    }

    // Save to the Prisma database
    const newSupplier = await prisma.supplier.create({
      data: {
        name,
        phone: phone || null,
        email: email || null,
        address: address || null,
      },
    });

    // Return the proper 201 Created status
    return NextResponse.json(
      { success: true, data: newSupplier }, 
      { status: 201 }
    );
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to create supplier" },
      { status: 500 }
    );
  }
}