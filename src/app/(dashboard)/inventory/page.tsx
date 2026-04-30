import { PrismaClient } from "@prisma/client";
import AddItemForm from "./AddItemForm";

const prisma = new PrismaClient();

export default async function InventoryPage() {
  // Fetch all items directly from the database
  const items = await prisma.item.findMany({
    orderBy: { name: 'asc' }
  });

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Inventory Catalog</h1>
          <p className="text-gray-500 mt-1">Manage your product database and track stock levels.</p>
        </div>
        <AddItemForm />
      </div>

      {/* The Master Data Table */}
      <div className="bg-white shadow-sm border rounded-lg overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-gray-50 border-b">
              <th className="p-4 font-medium text-gray-600">Product Name</th>
              <th className="p-4 font-medium text-gray-600">Barcode</th>
              <th className="p-4 font-medium text-gray-600">Category</th>
              <th className="p-4 font-medium text-gray-600 text-right">Price (Rs.)</th>
              <th className="p-4 font-medium text-gray-600 text-right">Current Stock</th>
              <th className="p-4 font-medium text-gray-600 text-center">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {items.map((item) => (
              <tr key={item.id} className="hover:bg-gray-50 transition">
                <td className="p-4 font-medium text-gray-900">{item.name}</td>
                <td className="p-4 text-gray-500 text-sm">{item.barcode}</td>
                <td className="p-4 text-gray-500">
                  <span className="bg-gray-100 text-gray-600 px-2 py-1 rounded text-xs">{item.category}</span>
                </td>
                <td className="p-4 text-right font-medium">Rs. {Number(item.sellingPrice).toFixed(2)}</td>
                <td className="p-4 text-right font-bold text-gray-800">{item.stockQty} {item.unit}</td>
                <td className="p-4 text-center">
                  {item.stockQty <= item.reorderLevel ? (
                    <span className="bg-red-100 text-red-700 px-2 py-1 rounded text-xs font-bold">Low Stock</span>
                  ) : (
                    <span className="bg-green-100 text-green-700 px-2 py-1 rounded text-xs font-bold">In Stock</span>
                  )}
                </td>
              </tr>
            ))}
            
            {items.length === 0 && (
              <tr>
                <td colSpan={6} className="p-8 text-center text-gray-500">
                  No items found. Click "Register New Item" to start building your catalog.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}