import { prisma } from "@/lib/prisma";
import InventoryClient from "./InventoryClient";

export const dynamic = "force-dynamic";

/** Standing options, shown even before any mixing has been recorded. */
const DEFAULT_PURPOSES = ["Machine 1", "Machine 2", "Machine 3", "Manual Mixing"];

export default async function InventoryPage() {
  const [items, usedPurposes] = await Promise.all([
    prisma.item.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: {
        id: true,
        barcode: true,
        name: true,
        description: true,
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
    }),

    // Purposes that have actually been used, so one added during mixing shows
    // up in the dropdown next time.
    prisma.stockMovement.findMany({
      where: { type: "MIXING", purpose: { not: null } },
      distinct: ["purpose"],
      select: { purpose: true },
      orderBy: { purpose: "asc" },
    }),
  ]);

  // Prisma Decimal instances cannot cross the server/client boundary, so
  // convert to plain numbers here rather than in the client component.
  const plainItems = items.map((item) => ({
    ...item,
    stockQty: Number(item.stockQty),
    buyingPrice: Number(item.buyingPrice),
    sellingPrice: Number(item.sellingPrice),
  }));

  const purposes = Array.from(
    new Set([
      ...DEFAULT_PURPOSES,
      ...usedPurposes.map((row) => row.purpose).filter((p): p is string => !!p),
    ])
  );

  return <InventoryClient items={plainItems} purposes={purposes} />;
}
