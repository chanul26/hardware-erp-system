import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic"; // TECH LEAD FIX: Prevents Vercel caching crash

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  const search = searchParams.get("search") || "";
  const page = Number(searchParams.get("page") || 1);
  const limit = Number(searchParams.get("limit") || 5);

  let where = {};
  if (search !== "") {
    where = {
      OR: [
        { name: { contains: search, mode: "insensitive" } },
        { phone: { contains: search } },
        { nic: { contains: search, mode: "insensitive" } },
      ],
    };
  }

  const total = await prisma.customer.count({ where });

  // Fetch customers along with their financial history
  const customers = await prisma.customer.findMany({
    where,
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * limit,
    take: limit,
    include: {
      bills: { select: { totalAmount: true } },
      payments: { select: { amount: true } }
    }
  });

  // Calculate live debt for each customer
  const customersWithDebt = customers.map(c => {
    const totalBilled = c.bills.reduce((sum, b) => sum + Number(b.totalAmount), 0);
    const totalPaid = c.payments.reduce((sum, p) => sum + Number(p.amount), 0);
    
    // Strip the heavy arrays before sending to the frontend
    const { bills, payments, ...cleanCustomer } = c; 
    return {
      ...cleanCustomer,
      totalDebt: Math.max(0, totalBilled - totalPaid)
    };
  });

  return NextResponse.json({ customers: customersWithDebt, total });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { name, nic, email, phone } = body;

    if (!name || !phone) {
      return NextResponse.json(
        { error: "Name and Phone required" },
        { status: 400 }
      );
    }

    const customer = await prisma.customer.create({
      data: { name, nic: nic || null, email: email || null, phone },
    });

    return NextResponse.json(customer);
  } catch (error: any) {
    // Better error handling for unique constraints
    if (error.code === 'P2002') {
      return NextResponse.json({ error: "A customer with this NIC or Email already exists" }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to create customer" }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const body = await req.json();
    const { id, name, nic, email, phone } = body;

    const updated = await prisma.customer.update({
      where: { id },
      data: { name, nic: nic || null, email: email || null, phone },
    });

    return NextResponse.json(updated);
  } catch (error: any) {
    return NextResponse.json({ error: "Update failed. Check if NIC/Email is unique." }, { status: 400 });
  }
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  await prisma.customer.delete({
    where: { id: String(id) },
  });

  return NextResponse.json({ success: true });
}