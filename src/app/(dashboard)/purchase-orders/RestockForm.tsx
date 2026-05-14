"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Calculator, Barcode, X, Package, Search, Plus, Loader2, ShoppingCart, Trash2 } from "lucide-react";

export default function RestockForm({ suppliers, items: initialItems }: { suppliers: any[], items: any[] }) {
  const router = useRouter();
  
  // Master Catalog State
  const [catalog, setCatalog] = useState(initialItems);

// Form State
const [supplierId, setSupplierId] =
  useState("");

const [amountPaid, setAmountPaid] =
  useState("");

const [loading, setLoading] =
  useState(false);

// PAYMENT STATES

const [
  paymentMethod,
  setPaymentMethod,
] = useState("CASH");

const [cashAmount, setCashAmount] =
  useState("");

const [
  chequeNumber,
  setChequeNumber,
] = useState("");

const [bankName, setBankName] =
  useState("");

const [chequeDate, setChequeDate] =
  useState("");

// CHEQUE CHECKER

const [
  existingCheques,
  setExistingCheques,
] = useState<any[]>([]);

const [
  showChequeModal,
  setShowChequeModal,
] = useState(false);

  // ─── THE NEW MULTI-ITEM CART ───
  const [deliveryCart, setDeliveryCart] = useState<any[]>([]);

  // Scanner & Staging State (The item currently being scanned/edited)
  const [searchInput, setSearchInput] = useState("");
  const [stagedItem, setStagedItem] = useState<any | null>(null);
  const [stagedQuantity, setStagedQuantity] = useState("");
  const [stagedUnitCost, setStagedUnitCost] = useState("");
  const [stagedSellingPrice,setStagedSellingPrice,] = useState("");
  
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

const totalBillAmount =
  deliveryCart.reduce(
    (sum, item) =>
      sum + item.totalCost,
    0
  );

// CHEQUE AMOUNT

const chequeAmount =
  paymentMethod === "CHEQUE"
    ? totalBillAmount
    : totalBillAmount -
      Number(cashAmount || 0);

  // ─── SCANNER LOGIC ────────────────────────────────────────────────────────
const handleScannerInput = (
  e: React.KeyboardEvent<HTMLInputElement>
) => {

  if (e.key === "Enter") {

    e.preventDefault();

    const scannedCode =
      searchInput.trim();

    if (!scannedCode) return;

    const foundItem =
      catalog.find(
        (i) =>
          i.barcode === scannedCode
      );

    if (foundItem) {

      setStagedItem(foundItem);

      setStagedSellingPrice(
        String(
          foundItem.sellingPrice || ""
        )
      );

      setSearchInput("");

      setTimeout(
        () =>
          quantityInputRef.current?.focus(),
        100
      );

    } else {

      setNewItemBarcode(
        scannedCode
      );

      setIsNewItemModalOpen(
        true
      );
    }
  }
};

  const handleManualSelect = (
    item: any
  ) => {

    setStagedItem(item);

    setStagedSellingPrice(
      String(
        item.sellingPrice || ""
      )
    );

    setSearchInput("");

    setTimeout(
      () =>
        quantityInputRef.current?.focus(),
      100
    );
  };

  // ─── ADD TO DELIVERY CART ─────────────────────────────────────────────────
    const handleAddToDelivery =
      () => {

        if (
          !stagedItem ||
          !stagedQuantity ||
          !stagedUnitCost ||
          !stagedSellingPrice
        ) {
          return;
        }

        const qty =
          Number(stagedQuantity);

        const cost =
          Number(stagedUnitCost);

        const selling =
          Number(
            stagedSellingPrice
          );

        setDeliveryCart([
          ...deliveryCart,

          {
            itemId:
              stagedItem.id,

            name:
              stagedItem.name,

            barcode:
              stagedItem.barcode,

            quantity: qty,

            unitCost: cost,

            sellingPrice:
              selling,

            totalCost:
              qty * cost,
          },
        ]);

        setStagedItem(null);

        setStagedQuantity("");

        setStagedUnitCost("");

        setStagedSellingPrice("");

        setTimeout(
          () =>
            searchInputRef.current?.focus(),
          100
        );
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
  // ─── CHECK EXISTING CHEQUES ─────────────────────────────────────────────

const checkChequeAvailability =
  async () => {
    if (!chequeDate) {
      alert(
        "Please select cheque date"
      );

      return;
    }

    try {
      const res = await fetch(
        `/api/cheques/by-date?date=${chequeDate}`
      );

      const data =
        await res.json();

      setExistingCheques(
        data.data || []
      );

      setShowChequeModal(true);
    } catch (error) {
      console.error(error);

      alert(
        "Failed to check cheques"
      );
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
    // VALIDATE CHEQUE DETAILS

    if (
      paymentMethod !== "CASH"
    ) {
      if (
        !chequeNumber ||
        !bankName ||
        !chequeDate
      ) {
        alert(
          "Please fill all cheque details."
        );

        return;
      }
    }

    // VALIDATE MIXED PAYMENT

    if (
      paymentMethod === "MIXED"
    ) {
      if (
        Number(cashAmount) >=
        totalBillAmount
      ) {
        alert(
          "Cash amount should be less than total bill."
        );

        return;
      }
    }
    
    setLoading(true);

    try {
      const response = await fetch("/api/restock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplierId,

          items: deliveryCart.map(
            (item) => ({
              itemId: item.itemId,
              quantity: item.quantity,
              unitCost: item.unitCost,

              // IMPORTANT
              sellingPrice:
                Number(item.sellingPrice || 0),
            })
          ),
          // PAYMENT METHOD

          paymentMethod,

          // CASH PAID

          amountPaid:
            paymentMethod === "CASH"
              ? Number(
                  cashAmount ||
                    totalBillAmount
                )
              : paymentMethod === "MIXED"
              ? Number(cashAmount || 0)
              : 0,

          // CHEQUE DATA

          chequeNumber:
            paymentMethod !== "CASH"
              ? chequeNumber
              : null,

          bankName:
            paymentMethod !== "CASH"
              ? bankName
              : null,

          chequeDate:
            paymentMethod !== "CASH"
              ? chequeDate
              : null,

          chequeAmount:
            paymentMethod !== "CASH"
              ? chequeAmount
              : 0,
        }),
        });

      if (!response.ok) throw new Error("Failed to restock");

      alert("✅ Multi-item delivery logged, stock updated, and supplier accounts updated!");
      
      // Reset Entire Form
      setDeliveryCart([]);

      setSupplierId("");

      setAmountPaid("");

      setCashAmount("");

      setChequeNumber("");

      setBankName("");

      setChequeDate("");

      setPaymentMethod("CASH");

router.refresh();
      router.refresh(); 
      setTimeout(() => searchInputRef.current?.focus(), 100);
      
    } catch (error) {
      console.error(error);
      alert("❌ Error processing delivery. Please try again.");
    } finally {
      setLoading(false);
    }
  };

const filteredCatalog =
  searchInput.trim().length > 0
    ? catalog
        .filter(
          (item) =>
            item.name
              .toLowerCase()
              .includes(
                searchInput.toLowerCase()
              ) ||
            item.barcode.includes(
              searchInput
            )
        )
        .slice(0, 5)
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
          
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
            
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

              <div className="col-span-1">
                <label className="block text-xs font-medium text-blue-800 mb-1">
                  Buying Price
                </label>

                <input
                  ref={costInputRef}
                  type="number"
                  min="0"
                  step="0.01"
                  disabled={!stagedItem}
                  value={stagedUnitCost}
                  onChange={(e) =>
                    setStagedUnitCost(
                      e.target.value
                    )
                  }
                  className="w-full border border-blue-300 rounded-md p-2 h-10 focus:ring-blue-500 disabled:opacity-50 text-sm"
                  placeholder="Buying Price"
                />
              </div>

              <div className="col-span-1">
                <label className="block text-xs font-medium text-blue-800 mb-1">
                  Selling Price
                </label>

                <input
                  type="number"
                  min="0"
                  step="0.01"
                  disabled={!stagedItem}
                  value={stagedSellingPrice}
                  onChange={(e) =>
                    setStagedSellingPrice(
                      e.target.value
                    )
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();

                      handleAddToDelivery();
                    }
                  }}
                  className="w-full border border-blue-300 rounded-md p-2 h-10 focus:ring-blue-500 disabled:opacity-50 text-sm"
                  placeholder="Selling Price"
                />
              </div>

              <div className="col-span-1 flex items-end">
                <button
                  type="button"
                  onClick={handleAddToDelivery}
                  disabled={
                    !stagedItem ||
                    !stagedQuantity ||
                    !stagedUnitCost ||
                    !stagedSellingPrice
                  }
                  className="h-10 w-full bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center"
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
                <th className="px-4 py-3 font-medium text-right">  Buying</th>

                <th className="px-4 py-3 font-medium text-right">  Selling</th>

                <th className="px-4 py-3 font-medium text-right">  Total Cost</th>
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
                    <td className="px-4 py-3 text-right">  Rs. {item.unitCost.toFixed(2)}</td>

                    <td className="px-4 py-3 text-right font-semibold text-green-700">  Rs. {item.sellingPrice.toFixed(2)}</td>

                    <td className="px-4 py-3 text-right font-bold text-blue-700">  Rs. {item.totalCost.toFixed(2)}</td>
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

        /* ── FINANCIAL BLOCK ── */

        <div className="border-t border-gray-200 pt-6 mb-6">
          <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2 mb-4">
            <Calculator className="h-4 w-4" />
            Supplier Payment Details
          </h3>

          <div className="bg-gray-50 p-5 rounded-xl border border-gray-200 space-y-5">

            {/* TOTAL */}

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Total Supplier Bill
              </label>

              <div className="w-full border border-gray-300 bg-white rounded-md p-3 font-bold text-gray-900 text-xl">
                Rs. {totalBillAmount.toFixed(2)}
              </div>
            </div>

            {/* PAYMENT METHOD */}

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Payment Method
              </label>

              <select
                value={paymentMethod}
                onChange={(e) =>
                  setPaymentMethod(
                    e.target.value
                  )
                }
                className="w-full border border-gray-300 rounded-md p-2.5"
              >
                <option value="CASH">
                  Cash
                </option>

                <option value="CHEQUE">
                  Cheque
                </option>

                <option value="MIXED">
                  Cash + Cheque
                </option>
              </select>
            </div>

            {/* CASH SECTION */}

            {(
              paymentMethod === "MIXED") && (
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Amount Paid by Cash
                </label>

                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={cashAmount}
                  onChange={(e) =>
                    setCashAmount(
                      e.target.value
                    )
                  }
                  className="w-full border border-gray-300 rounded-md p-2.5"
                  placeholder="Enter cash amount"
                />
              </div>
            )}

            {/* CHEQUE SECTION */}

            {(paymentMethod === "CHEQUE" ||
              paymentMethod === "MIXED") && (
              <div className="space-y-4 bg-blue-50 border border-blue-200 rounded-xl p-4">

                {/* CHEQUE AMOUNT */}

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Cheque Amount
                  </label>

                  <div className="w-full border border-blue-300 bg-white rounded-md p-3 font-bold text-blue-700">
                    Rs.{" "}
                    {chequeAmount.toFixed(2)}
                  </div>
                </div>

                {/* CHEQUE NUMBER */}

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Cheque Number
                  </label>

                  <input
                    type="text"
                    value={chequeNumber}
                    onChange={(e) =>
                      setChequeNumber(
                        e.target.value
                      )
                    }
                    className="w-full border border-gray-300 rounded-md p-2.5"
                    placeholder="Enter cheque number"
                  />
                </div>

                {/* BANK */}

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Bank Name
                  </label>

                  <input
                    type="text"
                    value={bankName}
                    onChange={(e) =>
                      setBankName(
                        e.target.value
                      )
                    }
                    className="w-full border border-gray-300 rounded-md p-2.5"
                    placeholder="Enter bank name"
                  />
                </div>

                {/* DATE */}

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Cheque Date
                  </label>

                  <input
                    type="date"
                    value={chequeDate}
                    onChange={(e) =>
                      setChequeDate(
                        e.target.value
                      )
                    }
                    className="w-full border border-gray-300 rounded-md p-2.5"
                  />

                  <button
                    type="button"
                    onClick={
                      checkChequeAvailability
                    }
                    className="text-blue-600 text-sm mt-2 underline hover:text-blue-800"
                  >
                    Check other cheques available on this day
                  </button>
                </div>
              </div>
            )}

            {/* DEBT */}

            {(paymentMethod === "CASH" &&
              Number(cashAmount) <
                totalBillAmount) ||
            paymentMethod === "CHEQUE" ||
            paymentMethod === "MIXED" ? (
              <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
                <p className="text-sm font-medium text-orange-700 flex justify-between">
                  <span>
                    Remaining Supplier Debt
                  </span>

                  <span>
                    Rs.{" "}
                    {(
                      totalBillAmount -
                      Number(cashAmount || 0)
                    ).toFixed(2)}
                  </span>
                </p>
              </div>
            ) : null}
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

      {/* ── CHEQUE AVAILABILITY MODAL ── */}

{showChequeModal && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">

    <div className="bg-white w-full max-w-2xl rounded-2xl shadow-xl border border-gray-200 overflow-hidden">

      {/* HEADER */}

      <div className="flex items-center justify-between p-5 border-b bg-gray-50">

        <div>
          <h2 className="text-xl font-bold text-gray-800">
            Existing Cheques
          </h2>

          <p className="text-sm text-gray-500 mt-1">
            Cheques scheduled on selected date
          </p>
        </div>

        <button
          onClick={() =>
            setShowChequeModal(false)
          }
          className="text-gray-500 hover:text-black"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* BODY */}

      <div className="p-5">

        {existingCheques.length === 0 ? (
          <div className="bg-green-50 border border-green-200 rounded-xl p-5 text-center">

            <h3 className="text-green-700 font-bold text-lg">
              This date is safe
            </h3>

            <p className="text-green-600 text-sm mt-2">
              No other cheques are scheduled on this date.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">

            <table className="w-full text-sm">

              <thead className="bg-gray-100">
                <tr>
                  <th className="p-3 text-left">
                    Supplier
                  </th>

                  <th className="p-3 text-left">
                    Bank
                  </th>

                  <th className="p-3 text-left">
                    Amount
                  </th>

                  <th className="p-3 text-left">
                    Cheque No
                  </th>
                </tr>
              </thead>

              <tbody>

                {existingCheques.map(
                  (cheque) => (
                    <tr
                      key={cheque.id}
                      className="border-t"
                    >
                      <td className="p-3">
                        {
                          cheque.supplierName
                        }
                      </td>

                      <td className="p-3">
                        {cheque.bank}
                      </td>

                      <td className="p-3 font-semibold text-blue-700">
                        Rs.{" "}
                        {cheque.amount}
                      </td>

                      <td className="p-3">
                        {
                          cheque.chequeNumber
                        }
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* FOOTER */}

      <div className="p-5 border-t bg-gray-50 flex justify-end">

        <button
          onClick={() =>
            setShowChequeModal(false)
          }
          className="px-5 py-2 border rounded-lg hover:bg-gray-100"
        >
          Close
        </button>
      </div>
    </div>
  </div>
)}
    </>
  );
}