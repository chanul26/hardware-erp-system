import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const suppliers = await prisma.supplier.findMany({
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ success: true, data: suppliers });
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

    if (!name) {
      return NextResponse.json(
        { success: false, error: "Supplier name is required" },
        { status: 400 }
      );
    }

    if (email) {
      const existing = await prisma.supplier.findUnique({ where: { email } });
      if (existing) {
        return NextResponse.json(
          { success: false, error: "A supplier with this email already exists" },
          { status: 400 }
        );
      }
    }

    const newSupplier = await prisma.supplier.create({
      data: {
        name,
        phone: phone || null,
        email: email || null,
        address: address || null,
      },
    });

    return NextResponse.json({ success: true, data: newSupplier });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to create supplier" },
      { status: 500 }
    );
  }
}