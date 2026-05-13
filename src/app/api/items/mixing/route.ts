import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

export async function POST(
  req: Request
) {

  try {

    const body =
      await req.json();

    const {
      itemId,
      quantity,
      note,
      purpose,
    } = body;

    // VALIDATION

    if (
      !itemId ||
      !quantity ||
      quantity <= 0
    ) {

      return NextResponse.json(
        {
          error:
            "Invalid mixing request",
        },
        {
          status: 400,
        }
      );
    }

    // PURPOSE VALIDATION

    if (!purpose) {

      return NextResponse.json(
        {
          error:
            "Please select a purpose",
        },
        {
          status: 400,
        }
      );
    }

    // FIND ITEM

    const item =
      await prisma.item.findUnique({

        where: {
          id: itemId,
        },

      });

    if (!item) {

      return NextResponse.json(
        {
          error:
            "Item not found",
        },
        {
          status: 404,
        }
      );
    }

    // CHECK STOCK

    if (
      item.stockQty <
      quantity
    ) {

      return NextResponse.json(
        {
          error:
            "Not enough stock available",
        },
        {
          status: 400,
        }
      );
    }

    // TRANSACTION

    await prisma.$transaction(
      async (tx) => {

        // REDUCE STOCK

        await tx.item.update({

          where: {
            id: itemId,
          },

          data: {
            stockQty: {
              decrement:
                quantity,
            },
          },

        });

        // CREATE STOCK MOVEMENT

        await tx.stockMovement.create({

          data: {

            itemId,

            quantity:
              -quantity,

            type: "MIXING",

            purpose,

            note:
              note ||
              "Used for paint mixing",

          },

        });

      }
    );

    return NextResponse.json({

      success: true,

      message:
        "Stock used for mixing successfully",

    });

  } catch (error) {

    console.error(error);

    return NextResponse.json(
      {
        error:
          "Failed to process mixing",
      },
      {
        status: 500,
      }
    );
  }
}