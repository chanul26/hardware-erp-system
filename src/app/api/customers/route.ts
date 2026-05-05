import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

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
      ],
    };
  }

  const total = await prisma.customer.count({ where });

  const customers = await prisma.customer.findMany({
    where,
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * limit,
    take: limit,
  });

  return NextResponse.json({ customers, total });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { name, email, phone } = body;

    if (!name || !phone) {
      return NextResponse.json(
        { error: "Name and Phone required" },
        { status: 400 }
      );
    }

    const customer = await prisma.customer.create({
      data: { name, email, phone },
    });

    return NextResponse.json(customer);
  } catch {
    return NextResponse.json(
      { error: "Customer already exists" },
      { status: 400 }
    );
  }
}

export async function PUT(req: Request) {
  const body = await req.json();
  const { id, name, email, phone } = body;

  const updated = await prisma.customer.update({
    where: { id },
    data: { name, email, phone },
  });

  return NextResponse.json(updated);
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  await prisma.customer.delete({
    where: { id: String(id) },
  });

  return NextResponse.json({ success: true });
}