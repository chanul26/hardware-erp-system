import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);

    const chequeDate =
      searchParams.get("date");

    if (!chequeDate) {
      return NextResponse.json(
        { error: "Date is required" },
        { status: 400 }
      );
    }

    const start = new Date(chequeDate);
    start.setHours(0, 0, 0, 0);

    const end = new Date(chequeDate);
    end.setHours(23, 59, 59, 999);

    const cheques =
      await prisma.supplierCheque.findMany({
        where: {
          chequeDate: {
            gte: start,
            lte: end,
          },

          status: "PENDING",
        },

        include: {
          supplierPayment: {
            include: {
              supplier: true,
            },
          },
        },

        orderBy: {
          chequeDate: "asc",
        },
      });

    return NextResponse.json({
      success: true,
      data: cheques,
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        error:
          "Failed to load cheque data",
      },
      {
        status: 500,
      }
    );
  }
}