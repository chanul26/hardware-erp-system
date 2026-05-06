"use client";

import { useEffect, useState } from "react";
import AddSupplierForm from "./AddSupplierForm";
import { Truck, CheckCircle2, Loader2 } from "lucide-react";

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Settlement Modal State
  const [settleOpen, setSettleOpen] = useState(false);
  const [settleAmount, setSettleAmount] = useState("");
  const [selectedSupplier, setSelectedSupplier] = useState<any | null>(null);
  const [isSettling, setIsSettling] = useState(false);
  const [message, setMessage] = useState<{type: "success"|"error", text: string} | null>(null);

  const loadSuppliers = async () => {
    setLoading(true);
    const res = await fetch("/api/suppliers", { cache: "no-store" });
    const json = await res.json();
    if (json.success) setSuppliers(json.data);
    setLoading(false);
  };

  useEffect(() => {
    loadSuppliers();
  }, []);

  const handleSettleDebt = async () => {
    if (!selectedSupplier || !settleAmount || Number(settleAmount) <= 0) return;
    setIsSettling(true);
    setMessage(null);

    const res = await fetch("/api/suppliers/settle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        supplierId: selectedSupplier.id,
        amount: Number(settleAmount)
      })
    });

    if (res.ok) {
      setSettleOpen(false);
      setSettleAmount("");
      setMessage({ type: "success", text: `Successfully logged Rs. ${settleAmount} payment to ${selectedSupplier.name}` });
      loadSuppliers(); 
      setTimeout(() => setMessage(null), 4000);
    } else {
      setMessage({ type: "error", text: "Failed to process payment." });
    }
    setIsSettling(false);
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto p-4 md:p-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Truck className="h-6 w-6 text-primary" />
            Supplier Management
          </h2>
          <p className="text-muted-foreground mt-1">
            Manage vendors and track your accounts payable.
          </p>
        </div>
        <AddSupplierForm />
      </div>

      {message && (
        <div className={`p-4 rounded-md flex items-center gap-2 font-medium ${message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
           {message.type === 'success' && <CheckCircle2 className="h-5 w-5"/>}
           {message.text}
        </div>
      )}

      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-muted/50 text-muted-foreground border-b border-border">
              <tr>
                <th className="px-6 py-4 font-medium">Name</th>
                <th className="px-6 py-4 font-medium">Contact</th>
                <th className="px-6 py-4 font-medium">Date Added</th>
                <th className="px-6 py-4 font-medium text-right">You Owe (Debt)</th>
                <th className="px-6 py-4 font-medium text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-primary"/></td>
                </tr>
              ) : suppliers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-muted-foreground">
                    No suppliers found. Register your first supplier above.
                  </td>
                </tr>
              ) : (
                suppliers.map((supplier) => (
                  <tr key={supplier.id} className="hover:bg-muted/20 transition-colors text-foreground">
                    <td className="px-6 py-4 font-medium">{supplier.name}</td>
                    <td className="px-6 py-4">
                        <p>{supplier.phone || "—"}</p>
                        <p className="text-xs text-muted-foreground">{supplier.email}</p>
                    </td>
                    <td className="px-6 py-4 text-muted-foreground">
                      {new Date(supplier.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 text-right font-bold">
                        {supplier.totalDebt > 0 ? (
                            <span className="text-orange-600">Rs. {supplier.totalDebt.toFixed(2)}</span>
                        ) : (
                            <span className="text-green-600">Cleared</span>
                        )}
                    </td>
                    <td className="px-6 py-4 text-center">
                        {supplier.totalDebt > 0 && (
                            <button
                                onClick={() => { setSelectedSupplier(supplier); setSettleAmount(""); setSettleOpen(true); }}
                                className="bg-primary text-primary-foreground px-3 py-1.5 rounded-md text-xs font-bold hover:bg-primary/90 transition shadow-sm"
                            >
                                Issue Payment
                            </button>
                        )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Settlement Modal */}
      {settleOpen && selectedSupplier && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-background p-6 rounded-xl w-full max-w-md shadow-xl border border-border animate-in zoom-in-95">
            <h2 className="text-lg font-bold text-foreground mb-1">Issue Payment to Supplier</h2>
            <p className="text-sm text-muted-foreground mb-4">Clearing debt for {selectedSupplier.name}</p>

            <div className="bg-orange-50 p-4 rounded-lg border border-orange-100 mb-6 flex justify-between items-center">
              <span className="text-sm font-medium text-orange-800">Total Outstanding:</span>
              <span className="font-bold text-orange-600 text-lg">Rs. {selectedSupplier.totalDebt.toFixed(2)}</span>
            </div>

            <label className="block text-sm font-medium mb-2">Payment Amount (Rs.)</label>
            <input
              type="number"
              placeholder="Enter Cash/Cheque Amount"
              className="border border-input p-3 w-full mb-6 rounded-md focus:ring-2 focus:ring-primary font-bold bg-background"
              value={settleAmount}
              onChange={(e) => setSettleAmount(e.target.value)}
            />

            <div className="flex justify-end gap-3 pt-4 border-t border-border">
              <button onClick={() => setSettleOpen(false)} className="px-4 py-2 text-foreground border border-input rounded-md hover:bg-muted font-medium transition">
                Cancel
              </button>
              <button 
                onClick={handleSettleDebt} 
                disabled={isSettling}
                className="bg-primary text-primary-foreground px-6 py-2 rounded-md font-bold disabled:opacity-50 transition hover:bg-primary/90 flex items-center gap-2"
              >
                {isSettling && <Loader2 className="h-4 w-4 animate-spin"/>}
                {isSettling ? "Processing..." : "Confirm Payment"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}