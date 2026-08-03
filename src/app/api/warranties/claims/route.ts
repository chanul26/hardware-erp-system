import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { effectiveStatus, generateClaimNumber } from "@/lib/warranty";

// ─────────────────────────────────────────────
// POST: Raise a customer claim
// ─────────────────────────────────────────────

export async function POST(req: Request) {

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
      warrantyId,
      issue,
      force,
    } = body;

    if (!warrantyId || !issue?.trim()) {

      return NextResponse.json(
        {
          error:
            "Warranty and a description of the fault are required.",
        },
        {
          status: 400,
        }
      );
    }

    const warranty =
      await prisma.warranty.findUnique({

        where: {
          id: warrantyId,
        },

      });

    if (!warranty) {

      return NextResponse.json(
        {
          error:
            "Warranty not found.",
        },
        {
          status: 404,
        }
      );
    }

    const status =
      effectiveStatus(warranty);

    if (status === "VOID") {

      return NextResponse.json(
        {
          error:
            "This warranty was voided — the item was returned.",
        },
        {
          status: 400,
        }
      );
    }

    // An expired warranty can still be claimed against as a goodwill case,
    // but only deliberately.

    if (
      status === "EXPIRED" &&
      !force
    ) {

      return NextResponse.json(
        {
          error:
            "This warranty expired on " +
            new Date(
              warranty.endDate
            ).toLocaleDateString() +
            ". Confirm to log it as a goodwill claim.",

          expired: true,
        },
        {
          status: 409,
        }
      );
    }

    const claim =
      await prisma.$transaction(
        async (tx) => {

          const created =
            await tx.warrantyClaim.create({

              data: {

                claimNumber:
                  generateClaimNumber(),

                warrantyId,

                issue: issue.trim(),

                status: "RECEIVED",

                handledByUserId:
                  (session.user as any)
                    .id,

              },

            });

          // Mark the warranty as claimed so it stops reading as simply
          // "active" — the unit is in the claims process now.

          await tx.warranty.update({

            where: {
              id: warrantyId,
            },

            data: {
              status: "CLAIMED",
            },

          });

          return created;
        }
      );

    return NextResponse.json(
      {
        success: true,
        data: claim,
      },
      {
        status: 201,
      }
    );

  } catch (error: any) {

    console.error(
      "[POST /api/warranties/claims]",
      error
    );

    return NextResponse.json(
      {
        error:
          "Failed to raise claim.",
      },
      {
        status: 500,
      }
    );
  }
}
