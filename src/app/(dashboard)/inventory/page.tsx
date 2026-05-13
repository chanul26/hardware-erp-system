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

    });

  return (
    <InventoryClient
      items={items}
    />
  );
}