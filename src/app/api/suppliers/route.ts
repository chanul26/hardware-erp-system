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
    return NextResponse.json({ success: true, data: suppliers });
  } catch (error) {
    console.error("[SUPPLIER_GET_ERROR]", error); // Log to server console for debugging
    return NextResponse.json(
      { success: false, error: "Failed to fetch suppliers due to a server error." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    // Safely parse JSON to prevent crashes on bad payloads
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

    // Validation: Trim spaces and ensure name exists
    if (!name || typeof name !== "string" || name.trim() === "") {
      return NextResponse.json(
        { success: false, error: "Supplier name is required" },
        { status: 400 }
      );
    }

    // Validation: Check if email already exists
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

    // Save to the Prisma database
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
    console.error("[SUPPLIER_POST_ERROR]", error); // Log to server console
    return NextResponse.json(
      { success: false, error: "An unexpected error occurred while saving the supplier." },
      { status: 500 }
    );
  }
}