import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

export async function GET(
  req: Request
) {
  try {
    const { searchParams } =
      new URL(req.url);

    const id =
      searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        {
          error:
            "Bill ID is required",
        },
        {
          status: 400,
        }
      );
    }

    const bill =
      await prisma.bill.findUnique({
        where: {
          id,
        },

        include: {
          billItems: {
            include: {
              item: true,
            },
          },
        },
      });

    if (!bill) {
      return NextResponse.json(
        {
          error:
            "Bill not found",
        },
        {
          status: 404,
        }
      );
    }

    // FORMAT ITEMS

    const formattedItems =
      bill.billItems.map(
        (billItem) => ({
          quantity:
            billItem.quantity,

          unitPrice:
            Number(
              billItem.unitPrice
            ),

          buyingPrice:
            Number(
              billItem
                .item.buyingPrice || 0
                
            ),

          item: {
            code:
              billItem.item.barcode,

            name:
              billItem.item.name,
          },
        })
      );

    return NextResponse.json({
      success: true,

      data: {
        billNumber:
          bill.billNumber,

        items: formattedItems,
      },
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        error:
          "Failed to load bill details",
      },
      {
        status: 500,
      }
    );
  }
}