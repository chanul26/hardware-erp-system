// File: src/app/api/finance/banks/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const banks = await prisma.bank.findMany({ orderBy: { name: "asc" } });
    return NextResponse.json({ success: true, data: banks });
  } catch (error: any) {
    console.error("DB_GET_BANKS_FAIL:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { name, accountNumber } = await request.json();
    if (!name || name.trim() === "") {
      return NextResponse.json({ success: false, error: "Bank name cannot be empty." }, { status: 400 });
    }

    const bank = await prisma.bank.create({ 
      data: { 
        name: name.trim(), 
        accountNumber: accountNumber ? accountNumber.trim() : null 
      } 
    });
    return NextResponse.json({ success: true, data: bank });
  } catch (error: any) {
    console.error("DB_POST_BANK_FAIL:", error);
    return NextResponse.json({ 
      success: false, 
      error: `Database failed to create bank. Did you run migrations? Error: ${error.message}` 
    }, { status: 500 });
  }
}