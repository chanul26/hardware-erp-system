import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// ─────────────────────────────────────────────
// PATCH: Fill in a serial number after the sale
// ─────────────────────────────────────────────
//
// Serials are often skipped at the till when there is a queue. This lets them
// be added later without touching the warranty's dates or status.

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {

  try {

    const session =
      await getServerSession(
        authOptions
      );

    if (!session) {

      return NextResponse.json(
        {
          error: "Unauthorized",
        },
        {
          status: 401,
        }
      );
    }

    const body =
      await req.json();

    const {
      serialNumber,
      notes,
    } = body;

    const data: any = {};

    if (
      serialNumber !== undefined
    ) {

      data.serialNumber =
        String(serialNumber).trim() ||
        null;
    }

    if (notes !== undefined) {
      data.notes =
        String(notes).trim() || null;
    }

    if (
      Object.keys(data).length === 0
    ) {

      return NextResponse.json(
        {
          error:
            "Nothing to update.",
        },
        {
          status: 400,
        }
      );
    }

    const updated =
      await prisma.warranty.update({

        where: {
          id: params.id,
        },

        data,

      });

    return NextResponse.json({
      success: true,
      data: updated,
    });

  } catch (error: any) {

    // A serial must be unique per product — two units cannot share one.

    if (error?.code === "P2002") {

      return NextResponse.json(
        {
          error:
            "That serial number is already recorded against another unit of this product.",
        },
        {
          status: 409,
        }
      );
    }

    console.error(
      "[PATCH /api/warranties/[id]]",
      error
    );

    return NextResponse.json(
      {
        error:
          "Failed to update warranty.",
      },
      {
        status: 500,
      }
    );
  }
}
