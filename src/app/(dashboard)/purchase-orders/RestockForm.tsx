"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Calculator } from "lucide-react";

export default function RestockForm({ suppliers, items }: { suppliers: any[], items: any[] }) {
  const router = useRouter();
  
  const [supplierId, setSupplierId] = useState("");
  const [itemId, setItemId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [amountPaid, setAmountPaid] = useState(""); // NEW: Tracks Uncle's payment
  const [loading, setLoading] = useState(false);

  // Dynamic Math for the UI
  const numQty = Number(quantity) || 0;
  const numCost = Number(unitCost) || 0;
  const totalBillAmount = numQty * numCost;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await fetch("/api/restock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplierId,
          items: [{ itemId, quantity: numQty, unitCost: numCost }],
          amountPaid // Send the payment to the backend
        }),
      });

      if (!response.ok) throw new Error("Failed to restock");

      alert("✅ Delivery logged, stock updated, and supplier accounts updated!");
      
      setQuantity("");
      setUnitCost("");
      setAmountPaid("");
      router.refresh(); 
      
    } catch (error) {
      console.error(error);
      alert("❌ Error processing delivery. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white p-6 rounded-xl shadow-sm border max-w-3xl">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        
        {/* Row 1: Lookups */}
        <div className="col-span-1">
          <label className="block text-sm font-medium text-gray-700 mb-2">Select Supplier</label>
          <select required value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className="w-full border border-gray-300 rounded-md p-2.5 focus:ring-blue-500 focus:border-blue-500">
            <option value="" disabled>-- Choose a Supplier --</option>
            {suppliers.map((sup) => <option key={sup.id} value={sup.id}>{sup.name}</option>)}
          </select>
        </div>

        <div className="col-span-1">
          <label className="block text-sm font-medium text-gray-700 mb-2">Received Item</label>
          <select required value={itemId} onChange={(e) => setItemId(e.target.value)} className="w-full border border-gray-300 rounded-md p-2.5 focus:ring-blue-500 focus:border-blue-500">
            <option value="" disabled>-- Choose an Item --</option>
            {items.map((item) => <option key={item.id} value={item.id}>{item.name} (Stock: {item.stockQty})</option>)}
          </select>
        </div>

        {/* Row 2: Inbound Details */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Quantity Received</label>
          <input type="number" required min="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} className="w-full border border-gray-300 rounded-md p-2.5 focus:ring-blue-500 focus:border-blue-500" placeholder="e.g. 100" />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Unit Cost (Rs.)</label>
          <input type="number" required min="0" step="0.01" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} className="w-full border border-gray-300 rounded-md p-2.5 focus:ring-blue-500 focus:border-blue-500" placeholder="e.g. 1500.00" />
        </div>
      </div>

      {/* --- NEW: Financial Block --- */}
      <div className="border-t border-gray-200 pt-6 mb-6">
          <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2 mb-4"><Calculator className="h-4 w-4"/> Supplier Payment Details</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-blue-50/50 p-4 rounded-lg border border-blue-100">
              <div>
                  <label className="block text-xs font-medium text-blue-800 mb-1">Total Bill from Supplier</label>
                  <div className="w-full border border-blue-200 bg-white rounded-md p-2.5 font-bold text-gray-900 text-lg">
                      Rs. {totalBillAmount.toFixed(2)}
                  </div>
              </div>
              <div>
                  <label className="block text-xs font-medium text-blue-800 mb-1">Amount Paid Now (Cash/Cheque)</label>
                  <input 
                      type="number" 
                      min="0" 
                      step="0.01" 
                      value={amountPaid} 
                      onChange={(e) => setAmountPaid(e.target.value)} 
                      className={`w-full border rounded-md p-2.5 focus:ring-blue-500 focus:border-blue-500 font-medium ${amountPaid && Number(amountPaid) < totalBillAmount ? "border-orange-400 bg-orange-50 text-orange-800" : "border-gray-300 bg-white"}`}
                      placeholder={`e.g. ${totalBillAmount.toFixed(2)} (Leave blank if fully paid)`} 
                  />
                  {amountPaid && Number(amountPaid) < totalBillAmount && (
                      <p className="text-xs text-orange-700 font-bold mt-1.5 flex justify-between">
                          <span>Debt to be logged:</span>
                          <span>Rs. {(totalBillAmount - Number(amountPaid)).toFixed(2)}</span>
                      </p>
                  )}
              </div>
          </div>
      </div>

      <button type="submit" disabled={loading} className="w-full bg-blue-600 text-white font-medium py-3 rounded-md hover:bg-blue-700 transition disabled:opacity-50">
        {loading ? "Processing Transaction..." : "Log Delivery & Save Financials"}
      </button>
    </form>
  );
}