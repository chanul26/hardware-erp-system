import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { daysRemaining, effectiveStatus } from "@/lib/warranty";
import { normaliseNic, normalisePhone } from "@/lib/lk";

export const dynamic = "force-dynamic";

// ─────────────────────────────────────────────
// GET: Look up warranties
// ─────────────────────────────────────────────
//
// A customer walks in with a faulty drill and whatever they happen to have:
// the receipt, the warranty slip, the serial on the tool, or just their phone
// number. All four have to find the record.

export async function GET(req: Request) {

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

    const { searchParams } =
      new URL(req.url);

    const search = (
      searchParams.get("search") ||
      ""
    ).trim();

    const statusFilter =
      searchParams.get("status");

    if (!search && !statusFilter) {

      return NextResponse.json({
        success: true,
        data: [],
      });
    }

    const where: any = {};

    if (search) {

      where.OR = [
        {
          warrantyNumber: {
            contains: search,
            mode: "insensitive",
          },
        },
        {
          serialNumber: {
            contains: search,
            mode: "insensitive",
          },
        },
        {
          bill: {
            billNumber: {
              contains: search,
              mode: "insensitive",
            },
          },
        },
        {
          customer: {
            phone: {
              contains: search,
            },
          },
        },
        // A customer at the counter reads their number out however they
        // remember it — with spaces, or with +94. Matching the canonical form
        // as well means the warranty is still found.
        ...(normalisePhone(search) &&
        normalisePhone(search) !== search
          ? [
              {
                customer: {
                  phone: {
                    contains: normalisePhone(search) as string,
                  },
                },
              },
            ]
          : []),
        {
          customer: {
            name: {
              contains: search,
              mode: "insensitive",
            },
          },
        },
        {
          customer: {
            nic: {
              contains: search,
              mode: "insensitive",
            },
          },
        },
        ...(normaliseNic(search) && normaliseNic(search) !== search
          ? [
              {
                customer: {
                  nic: {
                    contains: normaliseNic(search) as string,
                    mode: "insensitive",
                  },
                },
              },
            ]
          : []),
        {
          item: {
            name: {
              contains: search,
              mode: "insensitive",
            },
          },
        },
      ];
    }

    // OPEN CLAIMS VIEW
    //
    // Anything the shop is still chasing — either not yet resolved with the
    // customer, or sitting with the supplier awaiting a response.

    if (statusFilter === "OPEN_CLAIMS") {

      where.claims = {
        some: {
          status: {
            notIn: [
              "RESOLVED",
              "REJECTED",
            ],
          },
        },
      };
    }

    const warranties =
      await prisma.warranty.findMany({

        where,

        include: {

          item: {
            select: {
              id: true,
              name: true,
              barcode: true,
              unit: true,
            },
          },

          bill: {
            select: {
              id: true,
              billNumber: true,
              createdAt: true,
            },
          },

          customer: {
            select: {
              id: true,
              name: true,
              phone: true,
              nic: true,
            },
          },

          supplier: {
            select: {
              id: true,
              name: true,
              phone: true,
            },
          },

          batch: {
            select: {
              id: true,
              warrantyMonths: true,
              supplierWarrantyRef: true,
            },
          },

          claims: {
            orderBy: {
              reportedAt: "desc",
            },
            include: {
              handledByUser: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },

        },

        orderBy: {
          startDate: "desc",
        },

        take: 100,

      });

    // Expiry is derived on read rather than swept by a job, so a warranty is
    // never wrongly shown as live just because nothing has run recently.

    const data = warranties.map(
      (warranty) => ({
        ...warranty,
        effectiveStatus:
          effectiveStatus(warranty),
        daysRemaining:
          daysRemaining(
            warranty.endDate
          ),
      })
    );

    return NextResponse.json({
      success: true,
      data,
    });

  } catch (error: any) {

    console.error(
      "[GET /api/warranties]",
      error
    );

    return NextResponse.json(
      {
        error:
          "Failed to search warranties.",
      },
      {
        status: 500,
      }
    );
  }
}
