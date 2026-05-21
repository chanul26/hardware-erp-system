// File: src/app/api/finance/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const transactions = await prisma.financeTransaction.findMany({
      include: { bank: true, borrower: true },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ success: true, data: transactions });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { type, amount, description, bankId, borrowerId } = body;

    if (!type || !amount || !description) {
      return NextResponse.json({ success: false, error: "Missing required fields" }, { status: 400 });
    }

    const numericAmount = parseFloat(amount);
    if (isNaN(numericAmount) || numericAmount <= 0) {
      return NextResponse.json({ success: false, error: "Amount must be a valid positive number" }, { status: 400 });
    }

    const dataPayload: any = {
      type,
      amount: numericAmount,
      description: description.trim(),
    };

    // Attach target relation constraints conditionally
    if (["BANK_DEPOSIT", "BANK_WITHDRAWAL"].includes(type)) {
      if (!bankId) return NextResponse.json({ success: false, error: "Please select a target bank" }, { status: 400 });
      dataPayload.bankId = bankId;
    }
    
    if (["LOAN_GIVEN", "LOAN_REPAYMENT"].includes(type)) {
      if (!borrowerId) return NextResponse.json({ success: false, error: "Please select a registered person" }, { status: 400 });
      dataPayload.borrowerId = borrowerId;
    }

    const transaction = await prisma.financeTransaction.create({
      data: dataPayload,
      include: { bank: true, borrower: true }
    });

    return NextResponse.json({ success: true, data: transaction });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}