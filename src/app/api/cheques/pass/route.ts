import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: Request) {
  try {
    const body = await req.json();

    const {
      chequeId,
      passedDate,
    } = body;

    if (!chequeId) {
      return NextResponse.json(
        {
          error:
            "Cheque ID is required",
        },
        {
          status: 400,
        }
      );
    }

    await prisma.supplierCheque.update({
      where: {
        id: chequeId,
      },

      data: {
        status: "CLEARED",

        passedDate: new Date(
          passedDate
        ),
      },
    });

    return NextResponse.json({
      success: true,
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        error:
          "Failed to update cheque",
      },
      {
        status: 500,
      }
    );
  }
}