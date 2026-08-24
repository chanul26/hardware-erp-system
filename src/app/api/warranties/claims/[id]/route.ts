import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// ─────────────────────────────────────────────
// PATCH: Advance a claim
// ─────────────────────────────────────────────
//
// The shop is the middle link: a claim moves from the customer, out to the
// supplier, and back again. Each transition stamps its own date so the shop
// can see how long a supplier has been sitting on a unit.

const CLAIM_STATUSES = [
  "RECEIVED",
  "SENT_TO_SUPPLIER",
  "SUPPLIER_APPROVED",
  "SUPPLIER_REJECTED",
  "RESOLVED",
  "REJECTED",
] as const;

const RESOLUTIONS = [
  "REPAIR",
  "REPLACE",
  "REFUND",
  "REJECTED",
] as const;

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
      status,
      resolution,
      supplierClaimRef,
      supplierNotes,
      notes,
    } = body;

    const data: any = {};

    if (status !== undefined) {

      if (
        !CLAIM_STATUSES.includes(
          status
        )
      ) {

        return NextResponse.json(
          {
            error:
              "Unknown claim status.",
          },
          {
            status: 400,
          }
        );
      }

      data.status = status;

      // TIMESTAMP THE TRANSITIONS

      if (
        status === "SENT_TO_SUPPLIER"
      ) {
        data.sentToSupplierAt =
          new Date();
      }

      if (
        status === "SUPPLIER_APPROVED" ||
        status === "SUPPLIER_REJECTED"
      ) {
        data.supplierRespondedAt =
          new Date();
      }

      if (
        status === "RESOLVED" ||
        status === "REJECTED"
      ) {
        data.resolvedAt = new Date();
      }
    }

    if (resolution !== undefined) {

      if (
        resolution !== null &&
        !RESOLUTIONS.includes(
          resolution
        )
      ) {

        return NextResponse.json(
          {
            error:
              "Unknown resolution.",
          },
          {
            status: 400,
          }
        );
      }

      data.resolution = resolution;
    }

    if (
      supplierClaimRef !== undefined
    ) {
      data.supplierClaimRef =
        String(
          supplierClaimRef
        ).trim() || null;
    }

    if (supplierNotes !== undefined) {
      data.supplierNotes =
        String(supplierNotes).trim() ||
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
      await prisma.$transaction(
        async (tx) => {

          const claim =
            await tx.warrantyClaim.update({

              where: {
                id: params.id,
              },

              data,

              include: {
                warranty: true,
              },

            });

          // CLOSING A CLAIM RELEASES THE WARRANTY
          //
          // CLAIMED means "this unit is in the claims process". Once the
          // claim is settled the unit is back with the customer, so the
          // warranty must go back to being judged on its dates — otherwise
          // it reads as permanently mid-claim. A voided warranty stays void.

          const isClosed =
            data.status === "RESOLVED" ||
            data.status === "REJECTED";

          if (
            isClosed &&
            claim.warranty.status ===
              "CLAIMED"
          ) {

            const stillOpen =
              await tx.warrantyClaim.count({

                where: {
                  warrantyId:
                    claim.warrantyId,

                  status: {
                    notIn: [
                      "RESOLVED",
                      "REJECTED",
                    ],
                  },
                },

              });

            if (stillOpen === 0) {

              await tx.warranty.update({

                where: {
                  id: claim.warrantyId,
                },

                data: {
                  status: "ACTIVE",
                },

              });
            }
          }

          return claim;
        }
      );

    return NextResponse.json({
      success: true,
      data: updated,
    });

  } catch (error: any) {

    console.error(
      "[PATCH /api/warranties/claims/[id]]",
      error
    );

    return NextResponse.json(
      {
        error:
          "Failed to update claim.",
      },
      {
        status: 500,
      }
    );
  }
}
