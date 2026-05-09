"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Calculator, Barcode, X, Package, Search, Plus, Loader2, ShoppingCart, Trash2 } from "lucide-react";

export default function RestockForm({ suppliers, items: initialItems }: { suppliers: any[], items: any[] }) {
  const router = useRouter();
  
  // Master Catalog State
  const [catalog, setCatalog] = useState(initialItems);

  // Form State
  const [supplierId, setSupplierId] = useState("");
  const [amountPaid, setAmountPaid] = useState(""); 
  const [loading, setLoading] = useState(false);

  // ─── THE NEW MULTI-ITEM CART ───
  const [deliveryCart, setDeliveryCart] = useState<any[]>([]);

  // Scanner & Staging State (The item currently being scanned/edited)
  const [searchInput, setSearchInput] = useState("");
  const [stagedItem, setStagedItem] = useState<any | null>(null);
  const [stagedQuantity, setStagedQuantity] = useState("");
  const [stagedUnitCost, setStagedUnitCost] = useState("");
  
  // "Unknown Barcode" Modal State
  const [isNewItemModalOpen, setIsNewItemModalOpen] = useState(false);
  const [newItemBarcode, setNewItemBarcode] = useState("");
  const [newItemName, setNewItemName] = useState("");
  const [newItemSellingPrice, setNewItemSellingPrice] = useState("");
  const [registeringItem, setRegisteringItem] = useState(false);

  // Refs for auto-focusing
  const searchInputRef = useRef<HTMLInputElement>(null);
  const quantityInputRef = useRef<HTMLInputElement>(null);
  const costInputRef = useRef<HTMLInputElement>(null);

  // Dynamic Math for the UI
  const totalBillAmount = deliveryCart.reduce((sum, item) => sum + item.totalCost, 0);

  // ─── SCANNER LOGIC ────────────────────────────────────────────────────────
  const handleScannerInput = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const scannedCode = searchInput.trim();
      if (!scannedCode) return;

      const foundItem = catalog.find((i) => i.barcode === scannedCode);

      if (foundItem) {
        setStagedItem(foundItem);
        setSearchInput("");
        setTimeout(() => quantityInputRef.current?.focus(), 100);
      } else {
        setNewItemBarcode(scannedCode);
        setIsNewItemModalOpen(true);
      }
    }
  };

  const handleManualSelect = (item: any) => {
    setStagedItem(item);
    setSearchInput("");
    setTimeout(() => quantityInputRef.current?.focus(), 100);
  };

  // ─── ADD TO DELIVERY CART ─────────────────────────────────────────────────
  const handleAddToDelivery = () => {
    if (!stagedItem || !stagedQuantity || !stagedUnitCost) return;

    const qty = Number(stagedQuantity);
    const cost = Number(stagedUnitCost);

    setDeliveryCart([...deliveryCart, {
      itemId: stagedItem.id,
      name: stagedItem.name,
      barcode: stagedItem.barcode,
      quantity: qty,
      unitCost: cost,
      totalCost: qty * cost
    }]);

    // Reset Staging Area
    setStagedItem(null);
    setStagedQuantity("");
    setStagedUnitCost("");
    setTimeout(() => searchInputRef.current?.focus(), 100);
  };

  const removeFromCart = (index: number) => {
    const newCart = [...deliveryCart];
    newCart.splice(index, 1);
    setDeliveryCart(newCart);
  };

  // ─── REGISTER UNKNOWN ITEM ON THE FLY ─────────────────────────────────────
  const handleRegisterNewItem = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegisteringItem(true);

    try {
      const res = await fetch("/api/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          barcode: newItemBarcode,
          name: newItemName,
          buyingPrice: 0, 
          sellingPrice: Number(newItemSellingPrice),
          category: "General",
          unit: "pcs",
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error);

      setCatalog([...catalog, json.data]);
      setStagedItem(json.data);
      
      setIsNewItemModalOpen(false);
      setNewItemBarcode("");
      setNewItemName("");
      setNewItemSellingPrice("");
      setSearchInput("");
      
      setTimeout(() => quantityInputRef.current?.focus(), 100);

    } catch (error: any) {
      alert(`Error registering item: ${error.message}`);
    } finally {
      setRegisteringItem(false);
    }
  };

  // ─── SUBMIT THE BILL ──────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (deliveryCart.length === 0) {
      alert("Please add at least one item to the delivery list.");
      return;
    }
    if (!supplierId) {
      alert("Please select a supplier.");
      return;
    }
    
    setLoading(true);

    try {
      const response = await fetch("/api/restock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplierId,
          items: deliveryCart.map(item => ({
            itemId: item.itemId,
            quantity: item.quantity,
            unitCost: item.unitCost
          })),
          amountPaid 
        }),
      });

      if (!response.ok) throw new Error("Failed to restock");

      alert("✅ Multi-item delivery logged, stock updated, and supplier accounts updated!");
      
      // Reset Entire Form
      setDeliveryCart([]);
      setSupplierId("");
      setAmountPaid("");
      router.refresh(); 
      setTimeout(() => searchInputRef.current?.focus(), 100);
      
    } catch (error) {
      console.error(error);
      alert("❌ Error processing delivery. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const filteredCatalog = searchInput.length > 0 
    ? catalog.filter(i => i.name.toLowerCase().includes(searchInput.toLowerCase()) || i.barcode.includes(searchInput)).slice(0, 5)
    : [];

  return (
    <>
      <form onSubmit={handleSubmit} className="bg-white p-6 rounded-xl shadow-sm border max-w-4xl mx-auto">
        
        {/* ROW 1: SUPPLIER */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">Select Supplier</label>
          <select required value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className="w-full border border-gray-300 rounded-md p-2.5 focus:ring-blue-500 focus:border-blue-500">
            <option value="" disabled>-- Choose a Supplier --</option>
            {suppliers.map((sup) => <option key={sup.id} value={sup.id}>{sup.name}</option>)}
          </select>
        </div>

        {/* ── STAGING AREA (SCAN & SET QTY/COST) ── */}
        <div className="bg-blue-50 p-4 rounded-lg border border-blue-100 mb-6">
          <h3 className="text-sm font-bold text-blue-900 mb-3 flex items-center gap-2">
            <Barcode className="h-4 w-4"/> Scan Items into Shipment
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
            
            <div className="col-span-1 md:col-span-2 relative">
              <label className="block text-xs font-medium text-blue-800 mb-1">Scanner Input</label>
              {stagedItem ? (
                <div className="w-full border border-green-400 bg-green-100 rounded-md p-2 flex items-center justify-between h-10">
                  <span className="font-bold text-green-900 text-sm truncate">{stagedItem.name}</span>
                  <button type="button" onClick={() => { setStagedItem(null); setTimeout(() => searchInputRef.current?.focus(), 100); }} className="text-green-700 hover:text-green-900 p-1">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Search className="h-4 w-4 text-blue-400" />
                  </div>
                  <input 
                    ref={searchInputRef}
                    type="text" 
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    onKeyDown={handleScannerInput}
                    className="w-full border border-blue-300 rounded-md pl-10 p-2 h-10 focus:ring-blue-500 focus:border-blue-500 text-sm" 
                    placeholder="Scan barcode or type name..." 
                  />
                  {searchInput.length > 0 && (
                    <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-60 overflow-y-auto">
                      {filteredCatalog.map(item => (
                        <button key={item.id} type="button" onClick={() => handleManualSelect(item)} className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 border-b last:border-0 flex justify-between items-center">
                          <span className="font-medium">{item.name}</span>
                          <span className="text-xs text-gray-500 font-mono">{item.barcode}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="col-span-1">
              <label className="block text-xs font-medium text-blue-800 mb-1">Quantity</label>
              <input 
                ref={quantityInputRef} 
                type="number" 
                min="1" 
                disabled={!stagedItem}
                value={stagedQuantity} 
                onChange={(e) => setStagedQuantity(e.target.value)} 
                className="w-full border border-blue-300 rounded-md p-2 h-10 focus:ring-blue-500 disabled:opacity-50 text-sm" 
                placeholder="Qty" 
              />
            </div>

            <div className="col-span-1 flex gap-2">
              <div className="flex-1">
                <label className="block text-xs font-medium text-blue-800 mb-1">Unit Cost (Rs.)</label>
                <input 
                  ref={costInputRef}
                  type="number" 
                  min="0" step="0.01" 
                  disabled={!stagedItem}
                  value={stagedUnitCost} 
                  onChange={(e) => setStagedUnitCost(e.target.value)} 
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddToDelivery(); }}}
                  className="w-full border border-blue-300 rounded-md p-2 h-10 focus:ring-blue-500 disabled:opacity-50 text-sm" 
                  placeholder="Cost" 
                />
              </div>
              <button 
                type="button" 
                onClick={handleAddToDelivery}
                disabled={!stagedItem || !stagedQuantity || !stagedUnitCost}
                className="h-10 px-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center"
              >
                <Plus className="h-5 w-5" />
              </button>
            </div>

          </div>
        </div>

        {/* ── THE DELIVERY CART TABLE ── */}
        <div className="border border-gray-200 rounded-lg overflow-hidden mb-6">
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-50 border-b border-gray-200 text-gray-600">
              <tr>
                <th className="px-4 py-3 font-medium">Item Name</th>
                <th className="px-4 py-3 font-medium">Barcode</th>
                <th className="px-4 py-3 font-medium text-center">Qty</th>
                <th className="px-4 py-3 font-medium text-right">Unit Cost</th>
                <th className="px-4 py-3 font-medium text-right">Total Cost</th>
                <th className="px-4 py-3 text-center"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {deliveryCart.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                    <ShoppingCart className="h-8 w-8 mx-auto mb-2 opacity-20" />
                    No items added to this shipment yet. Scan an item above.
                  </td>
                </tr>
              ) : (
                deliveryCart.map((item, idx) => (
                  <tr key={idx} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{item.name}</td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">{item.barcode}</td>
                    <td className="px-4 py-3 text-center font-bold">{item.quantity}</td>
                    <td className="px-4 py-3 text-right">Rs. {item.unitCost.toFixed(2)}</td>
                    <td className="px-4 py-3 text-right font-bold text-blue-700">Rs. {item.totalCost.toFixed(2)}</td>
                    <td className="px-4 py-3 text-center">
                      <button type="button" onClick={() => removeFromCart(idx)} className="text-red-500 hover:text-red-700">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* ── FINANCIAL BLOCK ── */}
        <div className="border-t border-gray-200 pt-6 mb-6">
            <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2 mb-4"><Calculator className="h-4 w-4"/> Supplier Payment Details</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-gray-50 p-4 rounded-lg border border-gray-200">
                <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Total Bill from Supplier</label>
                    <div className="w-full border border-gray-300 bg-white rounded-md p-2.5 font-bold text-gray-900 text-lg">
                        Rs. {totalBillAmount.toFixed(2)}
                    </div>
                </div>
                <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Amount Paid Now (Cash/Cheque)</label>
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

        <button type="submit" disabled={loading || deliveryCart.length === 0} className="w-full bg-blue-600 text-white font-medium py-3 rounded-md hover:bg-blue-700 transition disabled:opacity-50">
          {loading ? "Processing Transaction..." : "Save Purchase Order & Update Stock"}
        </button>
      </form>

      {/* ── UNKNOWN BARCODE REGISTRATION MODAL ── */}
      {isNewItemModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white w-full max-w-md rounded-xl shadow-xl overflow-hidden border border-gray-200">
            <div className="flex items-center justify-between p-4 border-b border-gray-100 bg-gray-50">
              <div className="flex items-center gap-2 text-gray-800">
                <Package className="h-5 w-5 text-blue-600" />
                <h2 className="text-lg font-bold">Register Unknown Item</h2>
              </div>
              <button onClick={() => { setIsNewItemModalOpen(false); setTimeout(() => searchInputRef.current?.focus(), 100); }} className="text-gray-400 hover:text-gray-800 p-1 rounded-full">
                <X className="h-5 w-5" />
              </button>
            </div>
            
            <form onSubmit={handleRegisterNewItem} className="p-4 space-y-4">
              <div className="bg-blue-50 text-blue-800 p-3 rounded-md text-sm border border-blue-100">
                Barcode <strong>{newItemBarcode}</strong> is not in the system. Register it now to continue receiving stock.
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700">Item Name *</label>
                <input required autoFocus value={newItemName} onChange={(e) => setNewItemName(e.target.value)} className="w-full mt-1 border border-gray-300 p-2.5 rounded-md focus:ring-blue-500 focus:border-blue-500" placeholder="e.g. Makita 18V Drill" />
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700">Planned Selling Price (Rs.) *</label>
                <input required type="number" min="0" step="0.01" value={newItemSellingPrice} onChange={(e) => setNewItemSellingPrice(e.target.value)} className="w-full mt-1 border border-gray-300 p-2.5 rounded-md focus:ring-blue-500 focus:border-blue-500" placeholder="e.g. 6500.00" />
                <p className="text-xs text-gray-500 mt-1">Cost price will be updated automatically when you save the bill.</p>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t mt-6">
                <button type="button" onClick={() => { setIsNewItemModalOpen(false); setTimeout(() => searchInputRef.current?.focus(), 100); }} className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50">
                  Cancel
                </button>
                <button type="submit" disabled={registeringItem} className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-bold disabled:opacity-50 hover:bg-blue-700 flex items-center gap-2">
                  {registeringItem ? <Loader2 className="h-4 w-4 animate-spin"/> : <Plus className="h-4 w-4"/>}
                  {registeringItem ? "Saving..." : "Save & Continue Restock"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}