// File: src/app/api/finance/borrowers/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const borrowers = await prisma.borrower.findMany({ orderBy: { name: "asc" } });
    return NextResponse.json({ success: true, data: borrowers });
  } catch (error: any) {
    console.error("DB_GET_BORROWERS_FAIL:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { name, phone, details } = await request.json();
    if (!name || name.trim() === "") {
      return NextResponse.json({ success: false, error: "Person's name cannot be empty." }, { status: 400 });
    }

    const borrower = await prisma.borrower.create({ 
      data: { 
        name: name.trim(), 
        phone: phone ? phone.trim() : null, 
        details: details ? details.trim() : null 
      } 
    });
    return NextResponse.json({ success: true, data: borrower });
  } catch (error: any) {
    console.error("DB_POST_BORROWER_FAIL:", error);
    return NextResponse.json({ 
      success: false, 
      error: `Database failed to add person. Did you run migrations? Error: ${error.message}` 
    }, { status: 500 });
  }
}