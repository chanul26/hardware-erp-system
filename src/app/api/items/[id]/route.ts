import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// ─────────────────────────────────────────────
// PATCH: Update warranty settings on an item
// ─────────────────────────────────────────────
//
// This is the "selected items only" switch. Turning warrantyEligible off does
// NOT touch warranties already issued to customers — those were promises made
// at the time of sale and must stand.

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

    // ONLY ADMIN / MANAGER MAY CHANGE WARRANTY POLICY

    const role =
      (session.user as any)
        ?.role;

    if (
      role !== "ADMIN" &&
      role !== "MANAGER"
    ) {

      return NextResponse.json(
        {
          error:
            "You do not have permission to change warranty settings.",
        },
        {
          status: 403,
        }
      );
    }

    const { id } = params;

    const body =
      await req.json();

    const {
      warrantyEligible,
      defaultWarrantyMonths,
      requiresSerial,
    } = body;

    const data: any = {};

    if (
      warrantyEligible !==
      undefined
    ) {

      data.warrantyEligible =
        Boolean(
          warrantyEligible
        );
    }

    if (
      defaultWarrantyMonths !==
      undefined
    ) {

      const months =
        Number(
          defaultWarrantyMonths
        );

      data.defaultWarrantyMonths =
        Number.isFinite(months) &&
        months > 0
          ? Math.round(months)
          : null;
    }

    if (
      requiresSerial !==
      undefined
    ) {

      data.requiresSerial =
        Boolean(requiresSerial);
    }

    // TURNING ELIGIBILITY OFF CLEARS THE DEFAULT TERM

    if (
      data.warrantyEligible ===
      false
    ) {

      data.defaultWarrantyMonths =
        null;
    }

    if (
      Object.keys(data).length ===
      0
    ) {

      return NextResponse.json(
        {
          error:
            "No warranty settings supplied.",
        },
        {
          status: 400,
        }
      );
    }

    const updated =
      await prisma.item.update({

        where: {
          id,
        },

        data,

        select: {
          id: true,
          name: true,
          warrantyEligible: true,
          defaultWarrantyMonths: true,
          requiresSerial: true,
        },

      });

    return NextResponse.json({

      success: true,

      data: updated,

    });

  } catch (error: any) {

    console.error(
      "[PATCH /api/items/[id]]",
      error
    );

    return NextResponse.json(
      {
        error:
          "Failed to update item.",
      },
      {
        status: 500,
      }
    );
  }
}
