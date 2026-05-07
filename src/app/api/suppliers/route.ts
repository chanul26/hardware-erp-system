import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// The Advanced Tech Lead GET Route (Calculates Debt)
export async function GET() {
  try {
    // 1. Fetch all suppliers AND their purchase orders
    const suppliers = await prisma.supplier.findMany({
      include: {
        purchaseOrders: true,
      },
      orderBy: { createdAt: "desc" },
    });

    // 2. Calculate the total debt for each supplier
    const suppliersWithDebt = suppliers.map((supplier) => {
      const totalDebt = supplier.purchaseOrders.reduce((sum, order) => {
        // If the order isn't fully paid, add the remaining balance to the debt
        const balance = Number(order.totalAmount) - Number(order.amountPaid);
        return sum + (balance > 0 ? balance : 0);
      }, 0);

      return {
        id: supplier.id,
        name: supplier.name,
        phone: supplier.phone,
        email: supplier.email,
        address: supplier.address,
        createdAt: supplier.createdAt,
        totalDebt: totalDebt, // <-- THIS IS THE MAGIC VARIABLE YOUR UI NEEDS
      };
    });

    return NextResponse.json({ success: true, data: suppliersWithDebt });
  } catch (error) {
    console.error("[SUPPLIER_GET_ERROR]", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch suppliers due to a server error." },
      { status: 500 }
    );
  }
}

// The Standard POST Route (Saves new suppliers)
export async function POST(request: Request) {
  try {
    let body;
    try {
      body = await request.json();
    } catch (parseError) {
      return NextResponse.json(
        { success: false, error: "Invalid JSON payload provided." },
        { status: 400 }
      );
    }

    const { name, phone, email, address } = body;

    if (!name || typeof name !== "string" || name.trim() === "") {
      return NextResponse.json(
        { success: false, error: "Supplier name is required" },
        { status: 400 }
      );
    }

    if (email && email.trim() !== "") {
      const existing = await prisma.supplier.findUnique({ 
        where: { email: email.trim() } 
      });
      if (existing) {
        return NextResponse.json(
          { success: false, error: "A supplier with this email already exists" },
          { status: 400 }
        );
      }
    }

    const newSupplier = await prisma.supplier.create({
      data: {
        name: name.trim(),
        phone: phone?.trim() || null,
        email: email?.trim() || null,
        address: address?.trim() || null,
      },
    });

    return NextResponse.json({ success: true, data: newSupplier }, { status: 201 });
  } catch (error) {
    console.error("[SUPPLIER_POST_ERROR]", error);
    return NextResponse.json(
      { success: false, error: "An unexpected error occurred while saving the supplier." },
      { status: 500 }
    );
  }
}