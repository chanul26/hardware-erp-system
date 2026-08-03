import { PrismaClient } from "@prisma/client";

import InventoryClient from "./InventoryClient";

export const dynamic =
  "force-dynamic";

const prisma =
  new PrismaClient();

export default async function InventoryPage() {

  const items =
    await prisma.item.findMany({

      orderBy: {
        name: "asc",
      },

      select: {
        id: true,
        barcode: true,
        name: true,
        category: true,
        unit: true,
        stockQty: true,
        reorderLevel: true,
        buyingPrice: true,
        sellingPrice: true,
        warrantyEligible: true,
        defaultWarrantyMonths: true,
        requiresSerial: true,
      },

    });

  return (
    <InventoryClient
      items={items}
    />
  );
}