"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function RestockForm({ suppliers, items }: { suppliers: any[], items: any[] }) {
  const router = useRouter();
  
  // Form State
  const [supplierId, setSupplierId] = useState("");
  const [itemId, setItemId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await fetch("/api/restock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplierId,
          items: [{ itemId, quantity: Number(quantity), unitCost: Number(unitCost) }],
        }),
      });

      if (!response.ok) throw new Error("Failed to restock");

      alert("✅ Delivery logged and stock updated successfully!");
      
      // Clear the form for the next item
      setQuantity("");
      setUnitCost("");
      
      // Tell Next.js to refresh the server data so the new stock quantity shows up
      router.refresh(); 
      
    } catch (error) {
      console.error(error);
      alert("❌ Error processing delivery. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white p-6 rounded-lg shadow-sm border max-w-2xl">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        
        {/* Supplier Dropdown */}
        <div className="col-span-1 md:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-2">Select Supplier</label>
          <select 
            required
            value={supplierId} 
            onChange={(e) => setSupplierId(e.target.value)}
            className="w-full border border-gray-300 rounded-md p-2.5 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="" disabled>-- Choose a Supplier --</option>
            {suppliers.map((sup) => (
              <option key={sup.id} value={sup.id}>{sup.name}</option>
            ))}
          </select>
        </div>

        {/* Item Dropdown */}
        <div className="col-span-1 md:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-2">Received Item</label>
          <select 
            required
            value={itemId} 
            onChange={(e) => setItemId(e.target.value)}
            className="w-full border border-gray-300 rounded-md p-2.5 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="" disabled>-- Choose an Item --</option>
            {items.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} (Current Stock: {item.stockQty})
              </option>
            ))}
          </select>
        </div>

        {/* Quantity Input */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Quantity Received</label>
          <input 
            type="number" 
            required 
            min="1"
            value={quantity} 
            onChange={(e) => setQuantity(e.target.value)}
            className="w-full border border-gray-300 rounded-md p-2.5 focus:ring-blue-500 focus:border-blue-500"
            placeholder="e.g. 100"
          />
        </div>

        {/* Unit Cost Input */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Unit Cost (Rs.)</label>
          <input 
            type="number" 
            required 
            min="0"
            step="0.01"
            value={unitCost} 
            onChange={(e) => setUnitCost(e.target.value)}
            className="w-full border border-gray-300 rounded-md p-2.5 focus:ring-blue-500 focus:border-blue-500"
            placeholder="e.g. 1500.00"
          />
        </div>
      </div>

      <button 
        type="submit" 
        disabled={loading}
        className="w-full bg-blue-600 text-white font-medium py-3 rounded-md hover:bg-blue-700 transition disabled:opacity-50"
      >
        {loading ? "Processing Transaction..." : "Log Delivery & Update Stock"}
      </button>
    </form>
  );
}