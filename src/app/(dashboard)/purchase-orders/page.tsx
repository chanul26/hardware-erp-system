import { prisma } from "@/lib/prisma";
import RestockForm from "./RestockForm";

export const dynamic = "force-dynamic";


export default async function PurchaseOrdersPage() {
  // Securely fetch data on the server before the page even loads
  const suppliers = await prisma.supplier.findMany({
    orderBy: { name: 'asc' }
  });
  
  const items = await prisma.item.findMany({
    orderBy: { name: 'asc' }
  });

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Inbound Deliveries</h1>
        <p className="text-gray-500 mt-2">
          Log incoming shipments from suppliers to instantly update your inventory levels.
        </p>
      </div>

      {/* Inject the interactive client form and pass the data to it */}
      <RestockForm suppliers={suppliers} items={items} />
    </div>
  );
}