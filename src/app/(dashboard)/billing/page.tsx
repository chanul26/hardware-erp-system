"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import {
  Search, ShoppingCart, Plus, Minus, Trash2, CheckCircle2,
  Loader2, Printer, Barcode, UserCircle, X, AlertTriangle, TrendingUp
} from "lucide-react";

// Phase 2: buyingPrice is now part of the catalog interface
interface CatalogItem {
  id: string;
  barcode: string;
  name: string;
  sellingPrice: string;
  buyingPrice: string;
  stockQty: number;
  cartKey: string;
batchId: string;
}

// Phase 3: Cart items track cost and can have an override price
interface CartItem {
  cartKey: string;
  batchId: string;
  id: string;
  name: string;
  price: number;
  buyingPrice: number;    
  quantity: number;
  maxStock: number;
  overridePrice?: number; 
}

interface InvoiceData {
  billNumber: string;
  items: CartItem[];
  subtotal: number;
  discount: number;
  totalAmount: number;
  amountPaid: number;
  date: string;
}

export default function BillingPage() {
  const { data: session } = useSession();
  
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [searchTerm, setSearchBase] = useState("");
  const [loadingCatalog, setLoadingCatalog] = useState(true);

  const [cart, setCart] = useState<CartItem[]>([]);
  const [discount, setDiscount] = useState<string>("");
  const [amountPaid, setAmountPaid] = useState<string>("");

  // Phase 3: Price override editing state
  const [editingPriceId, setEditingPriceId] =  useState<string | null>(null);
  const [showBatchPopup, setShowBatchPopup] =useState(false);

  const [batchSelectionItems, setBatchSelectionItems] =useState<CatalogItem[]>([]);

  // Customer state
  const [customerQuery, setCustomerQuery] = useState("");
  const [customerResults, setCustomerResults] = useState<any[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<any | null>(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
  const [newCusName, setNewCusName] = useState("");
  const [newCusNic, setNewCusNic] = useState("");
  const [newCusPhone, setNewCusPhone] = useState("");
  const [quickAddLoading, setQuickAddLoading] = useState(false);
  const [quickAddError, setQuickAddError] = useState("");

  const [isProcessing, setIsProcessing] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [lastInvoice, setLastInvoice] = useState<InvoiceData | null>(null);

  // Return Module State
  const [isReturnModalOpen, setIsReturnModalOpen] = useState(false);
  const [returnInvoiceNumber, setReturnInvoiceNumber] = useState("");
  const [fetchedBill, setFetchedBill] = useState<any | null>(null);
  const [returnQuantities, setReturnQuantities] = useState<{ [itemId: string]: number }>({});
  const [returnLoading, setReturnLoading] = useState(false);
  const [returnError, setReturnError] = useState<string | null>(null);

  // Hardware Scanner Hook
  useEffect(() => {

    let barcodeAccumulator = "";

    const handleGlobalKeyDown = (
      e: KeyboardEvent
    ) => {

      if (
        document.activeElement?.tagName === "INPUT" ||
        document.activeElement?.tagName === "SELECT"
      ) {
        return;
      }

      if (e.key === "Enter") {

        const matchingItems =
          catalog.filter(
            (i) =>
              i.barcode ===
              barcodeAccumulator
          );

        // NO MATCH
        if (
          matchingItems.length === 0
        ) {

          barcodeAccumulator = "";
          return;
        }

        // SINGLE BATCH
        if (
          matchingItems.length === 1
        ) {

          addToCart(
            matchingItems[0]
          );

          barcodeAccumulator = "";
          return;
        }

        // MULTIPLE BATCHES
        setBatchSelectionItems(
          matchingItems
        );

        setShowBatchPopup(true);

        barcodeAccumulator = "";
      }

      else {

        if (
          /^[a-zA-Z0-9-]$/.test(e.key)
        ) {

          barcodeAccumulator +=
            e.key;
        }
      }
    };

    window.addEventListener(
      "keydown",
      handleGlobalKeyDown
    );

    return () =>
      window.removeEventListener(
        "keydown",
        handleGlobalKeyDown
      );

  }, [catalog]);

  // Initial Catalog Load
  useEffect(() => {
    fetch("/api/items").then(res => res.json()).then(json => {
      if (json.success) setCatalog(json.data);
      setLoadingCatalog(false);
    });
  }, []);

  // Live Customer Search
  useEffect(() => {
    if (customerQuery.length > 1) {
      fetch(`/api/customers?search=${customerQuery}&limit=10`)
        .then(res => res.json())
        .then(data => setCustomerResults(data.customers || []));
    } else {
      setCustomerResults([]);
    }
  }, [customerQuery]);

  // ─── Cart Functions ───────────────────────────────────────────────────────

const addToCart = (item: CatalogItem) => {

  const price =
    parseFloat(item.sellingPrice);

  const buyingPrice =
    parseFloat(item.buyingPrice);

  // FIX: Combine item ID and batch ID. Fallback to 'legacy' if no batch exists.
  const cartKey = `${item.id}-${item.batchId || 'legacy'}`;

  setCart((prev) => {

    // FIND SAME FIFO BATCH

    const existing =
      prev.find(
        (cartItem) =>
          cartItem.cartKey === cartKey
      );

    // IF EXISTS → INCREASE ONLY THAT BATCH

    if (existing) {

      if (
        existing.quantity >=
        item.stockQty
      ) {
        return prev;
      }

      return prev.map((cartItem) =>

        cartItem.cartKey === cartKey
          ? {
              ...cartItem,
              quantity:
                cartItem.quantity + 1,
            }
          : cartItem
      );
    }

    // NEW FIFO BATCH ENTRY

    return [
      ...prev,
      {
        cartKey,
        batchId: item.batchId,

        id: item.id,

        name: item.name,

        price,

        buyingPrice,

        quantity: 1,

        maxStock:
          item.stockQty,
      },
    ];
  });
};;
const updateQuantity = (
  cartKey: string,
  delta: number
) => {

  // DECREASE
  if (delta < 0) {

    setCart((prev) =>
      prev
        .map((item) => {

          if (
            item.cartKey === cartKey
          ) {

            const newQty =
              item.quantity - 1;

            if (newQty <= 0) {
              return null;
            }

            return {
              ...item,
              quantity: newQty,
            };
          }

          return item;
        })
        .filter(Boolean) as CartItem[]
    );

    return;
  }

  // INCREASE
  setCart((prev) => {

    const currentItem =
      prev.find(
        (item) =>
          item.cartKey === cartKey
      );

    if (!currentItem)
      return prev;

    // CURRENT BATCH STILL HAS STOCK
    if (
      currentItem.quantity <
      currentItem.maxStock
    ) {

      return prev.map((item) =>

        item.cartKey === cartKey
          ? {
              ...item,
              quantity:
                item.quantity + 1,
            }
          : item
      );
    }

    // FIND NEXT FIFO BATCH
    const nextBatch =
      catalog.find(
        (catalogItem) =>
          catalogItem.id ===
            currentItem.id &&
          catalogItem.batchId !==
            currentItem.batchId
      );

    if (!nextBatch)
      return prev;

    const existingNext =
      prev.find(
        (item) =>
          item.batchId ===
          nextBatch.batchId
      );

    // NEXT BATCH ALREADY IN CART
    if (existingNext) {

      // STOP IF NEXT BATCH FULL
      if (
        existingNext.quantity >=
        existingNext.maxStock
      ) {
        return prev;
      }

      return prev.map((item) =>

        item.batchId ===
        nextBatch.batchId
          ? {
              ...item,
              quantity:
                item.quantity + 1,
            }
          : item
      );
    }

    // ADD NEW FIFO BATCH
    return [
      ...prev,
      {
        // FIX: Ensure the next batch also generates a secure, unique key
        cartKey: `${nextBatch.id}-${nextBatch.batchId || 'legacy'}`,

        batchId:
          nextBatch.batchId,

        id: nextBatch.id,

        name: nextBatch.name,

        price: parseFloat(
          nextBatch.sellingPrice
        ),

        buyingPrice:
          parseFloat(
            nextBatch.buyingPrice
          ),

        quantity: 1,

        maxStock:
          nextBatch.stockQty,
      },
    ];
  });
};

  const removeFromCart = (
    cartKey: string
  ) => {

    setCart((prev) =>
      prev.filter(
        (item) =>
          item.cartKey !== cartKey
      )
    );
  };
  // ─── Phase 3: Price Override Functions ───────────────────────────────────


  // ─── Financial Math (all using effective prices) ──────────────────────────

  const subtotal = cart.reduce((sum, item) => sum + (item.overridePrice ?? item.price) * item.quantity, 0);
  const numDiscount = parseFloat(discount) || 0;
  const finalTotal = Math.max(0, subtotal - numDiscount);

  // Phase 3: PROFIT SHIELD — identify any item sold below cost
  const belowCostItems = cart.filter(item => (item.overridePrice ?? item.price) < item.buyingPrice);
  const hasBelowCostItem = belowCostItems.length > 0;

  // Overall margin indicator
  const totalCost = cart.reduce((sum, item) => sum + item.buyingPrice * item.quantity, 0);
  const grossProfit = subtotal - totalCost - numDiscount;
  const marginPercent = subtotal > 0 ? ((grossProfit / subtotal) * 100).toFixed(1) : "0.0";

  // ─── Handlers ─────────────────────────────────────────────────────────────

  const handleQuickAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setQuickAddLoading(true);
    setQuickAddError("");
    try {
      const res = await fetch("/api/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newCusName, nic: newCusNic, phone: newCusPhone }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSelectedCustomer(data);
      setCustomerQuery("");
      setIsQuickAddOpen(false);
      setNewCusName(""); setNewCusNic(""); setNewCusPhone("");
    } catch (err: any) {
      setQuickAddError(err.message);
    } finally {
      setQuickAddLoading(false);
    }
  };

  const handleCheckout = async () => {
    if (cart.length === 0 || hasBelowCostItem) return;

    const finalAmountPaid = amountPaid !== "" ? parseFloat(amountPaid) : finalTotal;

    if (finalAmountPaid < finalTotal && !selectedCustomer) {
      setMessage({ type: "error", text: "You must link a Customer to log unpaid debt." });
      return;
    }
    setIsProcessing(true);
    setMessage(null);
    try {
      const res = await fetch("/api/bills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: cart.map(item => ({ ...item, price: item.overridePrice ?? item.price })),
          customerId: selectedCustomer?.id || undefined,
          subtotal,
          discount: numDiscount,
          totalAmount: finalTotal,
          amountPaid: finalAmountPaid,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setLastInvoice({
        billNumber: data.bill.billNumber,
        items: cart.map(item => ({ ...item, price: item.overridePrice ?? item.price })),
        subtotal,
        discount: numDiscount,
        totalAmount: finalTotal,
        amountPaid: finalAmountPaid,
        date: new Date().toLocaleString(),
      });

      setMessage({ type: "success", text: `Invoice ${data.bill.billNumber} generated.` });
      setCart([]); setAmountPaid(""); setDiscount(""); setSelectedCustomer(null); setCustomerQuery("");

      const refresh = await fetch("/api/items").then(r => r.json());
      if (refresh.success) setCatalog(refresh.data);
      setTimeout(() => window.print(), 300);
    } catch (err: any) {
      setMessage({ type: "error", text: err.message || "Failed" });
    } finally {
      setIsProcessing(false);
    }
  };

  // ─── Return Functions ─────────────────────────────────────────────────────

  const handleReturnFetch = async () => {
    if (!returnInvoiceNumber.trim()) {
      setReturnError("Please enter an invoice number");
      return;
    }
    setReturnLoading(true);
    setReturnError(null);
    setFetchedBill(null);
    setReturnQuantities({});
    try {
      const res = await fetch(`/api/bills/return?billNumber=${returnInvoiceNumber}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setFetchedBill(data.data);
      // Initialize return quantities to 0 for all items
      const quantities: { [key: string]: number } = {};
      data.data.billItems.forEach((item: any) => {
        quantities[item.id] = 0;
      });
      setReturnQuantities(quantities);
    } catch (err: any) {
      setReturnError(err.message);
    } finally {
      setReturnLoading(false);
    }
  };

  const handleProcessReturn = async () => {
    if (!fetchedBill) return;
    const itemsToReturn = fetchedBill.billItems
      .filter((item: any) => returnQuantities[item.id] > 0)
      .map((item: any) => ({
        itemId: item.itemId,
        quantity: returnQuantities[item.id],
      }));

    if (itemsToReturn.length === 0) {
      setReturnError("Select at least one item to return");
      return;
    }

    const totalReturnAmount = fetchedBill.billItems.reduce((sum: number, item: any) => {
      return sum + (item.price * returnQuantities[item.id]);
    }, 0);

    setReturnLoading(true);
    try {
      const res = await fetch("/api/bills/return", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          billId: fetchedBill.id,
          itemsToReturn,
          totalReturnAmount,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMessage({ type: "success", text: `Return processed successfully for ${returnInvoiceNumber}` });
      setIsReturnModalOpen(false);
      setReturnInvoiceNumber("");
      setFetchedBill(null);
      setReturnQuantities({});
    } catch (err: any) {
      setReturnError(err.message);
    } finally {
      setReturnLoading(false);
    }
  };

  const filteredCatalog = catalog.filter(item =>
    item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.barcode.includes(searchTerm)
  );

  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[calc(100vh-8rem)] print:hidden p-4 relative z-0">

        {/* Left: Product Catalog */}
        <div className="lg:col-span-2 flex flex-col space-y-4">
          <div className="flex items-center gap-4 rounded-xl border bg-white p-3 shadow-sm">
            <Search className="h-5 w-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search by name or scan barcode..."
              value={searchTerm}
              onChange={(e) => setSearchBase(e.target.value)}
              className="flex-1 outline-none text-sm"
            />
            <div className="flex items-center gap-2 text-xs font-medium text-blue-600 bg-blue-50 px-2 py-1 rounded-md">
              <Barcode className="h-3 w-3" /> Scanner Ready
            </div>
          </div>
          <div className="flex-1 rounded-xl border bg-white p-4 shadow-sm overflow-y-auto">
            <h3 className="font-bold text-gray-700 mb-4">Product Catalog</h3>
            {loadingCatalog ? (
              <Loader2 className="animate-spin mx-auto mt-10" />
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {filteredCatalog.map((item) => (

                  <button
                    key={item.cartKey}

                    onClick={() => {

                      const sameBarcodeItems =
                        catalog.filter(
                          (catalogItem) =>
                            catalogItem.barcode ===
                            item.barcode
                        );

                      // SHOW PRICE SELECTION POPUP
                      if (
                        sameBarcodeItems.length > 1
                      ) {

                        setBatchSelectionItems(
                          sameBarcodeItems
                        );

                        setShowBatchPopup(true);

                        return;
                      }

                      // NORMAL SINGLE PRICE ITEM
                      addToCart(item);

                    }}

                    className="p-4 rounded-lg border hover:border-blue-500 hover:bg-blue-50 transition-all text-left"
                  >

                    <p className="font-bold text-sm truncate">
                      {item.name}
                    </p>

                    <p className="text-xs text-gray-500">
                      Stock: {item.stockQty}
                    </p>

                    <p className="text-sm font-black text-blue-600 mt-2">
                      Rs.{" "}
                      {parseFloat(
                        item.sellingPrice
                      ).toFixed(2)}
                    </p>

                  </button>

                ))}
                
              </div>
            )}
          </div>
        </div>

        {/* Right: Cart + Financials */}
        <div className="rounded-xl border border-border bg-card shadow-sm flex flex-col relative z-10">

          <div className="p-4 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShoppingCart className="h-5 w-5 text-primary" />
              <h2 className="font-bold text-lg text-foreground">Current Bill</h2>
            </div>
            {cart.length > 0 && (
              <div className={`flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-full ${
                hasBelowCostItem       ? "bg-red-100 text-red-700" :
                parseFloat(marginPercent) < 10 ? "bg-yellow-100 text-yellow-700" :
                                         "bg-green-100 text-green-700"
              }`}>
                <TrendingUp className="h-3 w-3" />
                {marginPercent}% margin
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {cart.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
                <ShoppingCart className="h-10 w-10 mb-2 opacity-20" />
                <p className="text-sm">Cart is empty</p>
              </div>
            ) : (
              cart.map((item) => {
                const effectivePrice = item.overridePrice ?? item.price;
                const isBelowCost = effectivePrice < item.buyingPrice;
                const itemMargin = ((effectivePrice - item.buyingPrice) / item.buyingPrice * 100).toFixed(0);
                const hasOverride = item.overridePrice !== undefined;

                return (
                <div
                  key={item.cartKey}
                    className={`p-2 rounded-lg border transition-colors ${isBelowCost ? "border-red-300 bg-red-50" : "border-transparent"}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{item.name}</p>

                        {editingPriceId === item.id ? (

                          <div className="mt-1">

                            <select
                              value={item.price}
                              onChange={(e) => {

                                const selectedPrice =
                                  Number(e.target.value);

                                setCart((prev) =>
                                  prev.map((cartItem) =>
                                    cartItem.cartKey === item.cartKey
                                      ? {
                                          ...cartItem,
                                          price: selectedPrice,
                                        }
                                      : cartItem
                                  )
                                );

                                setEditingPriceId(null);
                              }}
                              className="text-xs border rounded px-2 py-1"
                            >

                              {catalog
                                .filter(
                                  (catalogItem) =>
                                    catalogItem.id === item.id
                                )
                                .map((batchItem) => (

                                  <option
                                    key={batchItem.cartKey}
                                    value={batchItem.sellingPrice}
                                  >

                                    Rs.
                                    {parseFloat(
                                      batchItem.sellingPrice
                                    ).toFixed(2)}
                                    {" "}
                                    ({batchItem.stockQty} pcs)

                                  </option>
                                ))}

                            </select>

                          </div>

                        ) : (

                          <div className="flex items-center gap-2 mt-1 flex-wrap">

                            <span className="text-xs font-bold text-muted-foreground">
                              Rs. {effectivePrice.toFixed(2)} ea
                            </span>

                            <button
                              onClick={() =>
                                setEditingPriceId(item.id)
                              }
                              className="text-[10px] px-2 py-0.5 rounded bg-blue-100 text-blue-700 hover:bg-blue-200"
                            >
                              Edit
                            </button>

                            <span
                              className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                                isBelowCost
                                  ? "bg-red-200 text-red-800"
                                  : "bg-green-100 text-green-700"
                              }`}
                            >

                              {isBelowCost
                                ? `LOSS`
                                : `+${itemMargin}%`}

                            </span>

                          </div>

                        )}

                        {isBelowCost && (
                          <p className="text-[10px] text-red-600 font-bold mt-0.5">
                            Cost: Rs. {item.buyingPrice.toFixed(2)} — you are selling at a loss!
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <div className="flex items-center border border-border rounded-md bg-background">
                          <button onClick={() => updateQuantity(item.cartKey, -1)} className="p-1 hover:bg-muted text-muted-foreground">
                            <Minus className="h-3 w-3" />
                          </button>
                          <span className="px-2 text-sm font-medium">{item.quantity}</span>
                          <button onClick={() => updateQuantity(item.cartKey, 1)} className="p-1 hover:bg-muted text-muted-foreground">
                            <Plus className="h-3 w-3" />
                          </button>
                        </div>
                        <span className="text-xs font-bold text-foreground w-16 text-right">
                          Rs. {(effectivePrice * item.quantity).toFixed(2)}
                        </span>
                        <button onClick={() => removeFromCart(item.cartKey)} className="text-destructive hover:opacity-70">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="p-4 border-t border-border bg-muted/30 space-y-4">
            {hasBelowCostItem && (
              <div className="p-3 bg-red-600 text-white rounded-lg flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-bold uppercase">Loss Alert — Checkout Blocked</p>
                  <p className="text-[10px] mt-0.5 opacity-90">
                    {belowCostItems.map(i => i.name).join(", ")} {belowCostItems.length === 1 ? "is" : "are"} priced below cost. Click the price to fix it.
                  </p>
                </div>
              </div>
            )}

            <div className="space-y-1.5 relative">
              <div className="flex justify-between items-center">
                <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                  <UserCircle className="h-3 w-3" /> Link Customer
                </label>
                {selectedCustomer && (
                  <button onClick={() => setSelectedCustomer(null)} className="text-xs text-destructive hover:underline">
                    Remove Link
                  </button>
                )}
              </div>
              {selectedCustomer ? (
                <div className="w-full rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm flex justify-between items-center">
                  <div>
                    <p className="font-bold text-blue-800">{selectedCustomer.name}</p>
                    <p className="text-xs text-blue-600">NIC: {selectedCustomer.nic || "No NIC"} | Ph: {selectedCustomer.phone}</p>
                  </div>
                  <CheckCircle2 className="h-5 w-5 text-blue-500" />
                </div>
              ) : (
                <div className="relative">
                  <Search className="h-4 w-4 absolute left-3 top-2.5 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="Search Name or NIC (or leave blank for Walk-in)"
                    value={customerQuery}
                    onChange={(e) => { setCustomerQuery(e.target.value); setIsDropdownOpen(true); }}
                    className="w-full rounded-md border border-input bg-background pl-9 pr-3 py-2 text-sm focus:ring-2 focus:ring-primary"
                  />
                  {isDropdownOpen && customerQuery.length > 1 && (
                    <div className="absolute z-50 w-full mt-1 bg-white border border-border rounded-md shadow-xl max-h-48 overflow-y-auto">
                      {customerResults.length > 0 ? (
                        customerResults.map((c) => (
                          <button
                            key={c.id}
                            onClick={() => { setSelectedCustomer(c); setIsDropdownOpen(false); setCustomerQuery(""); }}
                            className="w-full text-left px-4 py-2 text-sm hover:bg-muted border-b border-border last:border-0"
                          >
                            <p className="font-bold text-foreground">{c.name}</p>
                            <p className="text-xs text-muted-foreground">NIC: {c.nic || "None"} | Ph: {c.phone}</p>
                          </button>
                        ))
                      ) : (
                        <div className="p-3 text-center">
                          <p className="text-sm text-muted-foreground mb-2">No matching customers found.</p>
                          <button
                            onClick={() => { setIsDropdownOpen(false); setIsQuickAddOpen(true); setNewCusName(customerQuery); }}
                            className="text-sm bg-primary text-primary-foreground px-3 py-1.5 rounded-md font-medium flex items-center gap-2 justify-center w-full"
                          >
                            <Plus className="h-4 w-4" /> Add "{customerQuery}"
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Subtotal</label>
                <div className="px-3 py-2 text-sm bg-background border border-border rounded-md text-foreground font-medium">
                  Rs. {subtotal.toFixed(2)}
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-blue-600">Special Discount</label>
                <input
                  type="number"
                  min="0"
                  value={discount}
                  onChange={(e) => setDiscount(e.target.value)}
                  placeholder="Rs. 0.00"
                  className="w-full rounded-md border border-blue-200 bg-blue-50/50 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 text-blue-700 font-medium"
                />
              </div>
            </div>

            <div className="flex justify-between items-center text-lg font-bold border-t border-border pt-4">
              <span className="text-foreground">Total to Pay</span>
              <span className="text-primary">Rs. {finalTotal.toFixed(2)}</span>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Cash Received</label>
              <input
                type="number"
                min="0"
                value={amountPaid}
                onChange={(e) => setAmountPaid(e.target.value)}
                placeholder={`Rs. ${finalTotal.toFixed(2)}`}
                className={`w-full rounded-md border px-3 py-3 text-base font-medium focus:ring-2 focus:ring-primary transition-colors ${
                  amountPaid && parseFloat(amountPaid) < finalTotal
                    ? "border-orange-500 bg-orange-50/50 text-orange-700"
                    : "border-input bg-background"
                }`}
              />
              {amountPaid && parseFloat(amountPaid) < finalTotal && !selectedCustomer && (
                <p className="text-xs text-destructive mt-1 font-medium">⚠️ Must link a customer to give credit.</p>
              )}
            </div>

            {message && (
              <div className={`flex items-center gap-2 text-sm font-medium p-3 rounded-md ${
                message.type === "success" ? "bg-green-500/15 text-green-600" : "bg-destructive/15 text-destructive"
              }`}>
                {message.type === "success" && <CheckCircle2 className="h-4 w-4 shrink-0" />}
                {message.text}
              </div>
            )}

            {/* Process Return Button - Only for non-CASHIER roles */}
            {session?.user.role !== "CASHIER" && (
              <button
                onClick={() => {
                  setIsReturnModalOpen(true);
                  setReturnInvoiceNumber("");
                  setFetchedBill(null);
                  setReturnQuantities({});
                  setReturnError(null);
                }}
                className="w-full py-2 rounded-lg font-semibold transition-colors bg-amber-600 text-white hover:bg-amber-700 text-sm"
              >
                Process Return
              </button>
            )}

            <button
              onClick={handleCheckout}
              disabled={cart.length === 0 || isProcessing || hasBelowCostItem}
              className={`w-full py-3 rounded-lg font-bold transition-colors flex items-center justify-center gap-2 disabled:cursor-not-allowed ${
                hasBelowCostItem
                  ? "bg-red-600 text-white opacity-70"
                  : "bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              }`}
            >
              {hasBelowCostItem ? (
                <><AlertTriangle className="h-4 w-4" /> Below Cost — Cannot Checkout</>
              ) : isProcessing ? (
                "Processing..."
              ) : (
                <>Checkout & Print <Printer className="h-4 w-4" /></>
              )}
            </button>
          </div>
        </div>
      </div>

      {isQuickAddOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-background w-full max-w-md rounded-xl shadow-xl overflow-hidden border border-border">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h2 className="text-lg font-bold">Quick Register Customer</h2>
              <button onClick={() => setIsQuickAddOpen(false)} className="text-muted-foreground hover:bg-muted p-1 rounded-full">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleQuickAdd} className="p-4 space-y-4">
              {quickAddError && <p className="text-sm text-destructive bg-destructive/15 p-2 rounded">{quickAddError}</p>}
              <div>
                <label className="text-sm font-medium">Name *</label>
                <input required value={newCusName} onChange={(e) => setNewCusName(e.target.value)} className="w-full mt-1 border p-2 rounded-md" />
              </div>
              <div>
                <label className="text-sm font-medium text-blue-600">NIC Number (Required for Debt)</label>
                <input value={newCusNic} onChange={(e) => setNewCusNic(e.target.value)} placeholder="e.g. 199012345678" className="w-full mt-1 border border-blue-200 bg-blue-50/50 p-2 rounded-md" />
              </div>
              <div>
                <label className="text-sm font-medium">Phone *</label>
                <input required value={newCusPhone} onChange={(e) => setNewCusPhone(e.target.value)} className="w-full mt-1 border p-2 rounded-md" />
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t mt-4">
                <button type="button" onClick={() => setIsQuickAddOpen(false)} className="px-4 py-2 border rounded-md text-sm">Cancel</button>
                <button type="submit" disabled={quickAddLoading} className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-bold disabled:opacity-50">
                  {quickAddLoading ? "Saving..." : "Save & Link to Bill"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {lastInvoice && (
        <div className="hidden print:block font-mono text-black bg-white w-[80mm] p-4 text-sm leading-tight fixed top-0 left-0 z-[9999]">
          <div className="text-center mb-4">
            <h1 className="font-bold text-xl">HARDWARE ERP</h1>
            <p>123 Main Road, Panadura</p>
            <p>Tel: 011-2345678</p>
          </div>
          <div className="border-b border-dashed border-black pb-2 mb-2">
            <p>Invoice: {lastInvoice.billNumber}</p>
            <p>Date: {lastInvoice.date}</p>
          </div>
          <table className="w-full mb-2 text-left">
            <thead>
              <tr className="border-b border-dashed border-black">
                <th className="font-normal w-1/2 pb-1">Item</th>
                <th className="font-normal w-1/4 pb-1 text-center">Qty</th>
                <th className="font-normal w-1/4 pb-1 text-right">Price</th>
              </tr>
            </thead>
            <tbody>
              {lastInvoice.items.map((item) => (
                <tr key={item.id}>
                  <td className="pt-1">{item.name.substring(0, 14)}</td>
                  <td className="pt-1 text-center">{item.quantity}</td>
                  <td className="pt-1 text-right">{(item.price * item.quantity).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="border-t border-dashed border-black pt-2 mb-6 text-right">
            <p>SUBTOTAL: Rs. {lastInvoice.subtotal.toFixed(2)}</p>
            {lastInvoice.discount > 0 && <p className="text-xs uppercase">DISCOUNT: - Rs. {lastInvoice.discount.toFixed(2)}</p>}
            <p className="font-bold text-base mt-1">TOTAL: Rs. {lastInvoice.totalAmount.toFixed(2)}</p>
            <p className="mt-1 text-xs">PAID (CASH): Rs. {lastInvoice.amountPaid.toFixed(2)}</p>
            {lastInvoice.amountPaid < lastInvoice.totalAmount ? (
              <p className="font-bold border-t border-dashed border-black mt-1 pt-1">
                DUE (DEBT): Rs. {(lastInvoice.totalAmount - lastInvoice.amountPaid).toFixed(2)}
              </p>
            ) : (
              <p className="text-xs">CHANGE: Rs. {(lastInvoice.amountPaid - lastInvoice.totalAmount).toFixed(2)}</p>
            )}
          </div>
        </div>
      )}
    {showBatchPopup && (

      <div className="fixed inset-0 z-[100] flex items-center justify-center">

        <div className="bg-white border shadow-2xl rounded-xl p-4 w-[320px] animate-in fade-in zoom-in-95">

          <h2 className="text-sm font-bold text-gray-800 mb-1">
            Multiple Prices Available
          </h2>

          <p className="text-xs text-gray-500 mb-4">
            Select selling price
          </p>

          <div className="space-y-2">

            {batchSelectionItems.map((item) => (

              <button
                key={item.cartKey}
                onClick={() => {

                  addToCart(item);

                  setShowBatchPopup(false);

                  setBatchSelectionItems([]);

                }}
                className="w-full rounded-lg border px-3 py-3 hover:bg-blue-50 hover:border-blue-500 transition-all text-left"
              >

                <div className="flex items-center justify-between">

                  <div>

                    <p className="font-bold text-blue-600">
                      Rs. {parseFloat(item.sellingPrice).toFixed(2)}
                    </p>

                    <p className="text-xs text-gray-500">
                      Stock: {item.stockQty}
                    </p>

                  </div>

                  <div className="text-[10px] bg-blue-100 text-blue-700 px-2 py-1 rounded-full">
                    Select
                  </div>

                </div>

              </button>

            ))}

          </div>

          <button
            onClick={() => {

              setShowBatchPopup(false);

              setBatchSelectionItems([]);

            }}
            className="mt-3 w-full text-xs border rounded-lg py-2 hover:bg-gray-50"
          >
            Cancel
          </button>

        </div>

      </div>

    )}

    {/* Return Modal */}
    {isReturnModalOpen && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
        <div className="bg-background w-full max-w-2xl rounded-xl shadow-xl overflow-hidden border border-border">
          <div className="flex items-center justify-between p-4 border-b border-border">
            <h2 className="text-lg font-bold">Process Return</h2>
            <button 
              onClick={() => {
                setIsReturnModalOpen(false);
                setReturnInvoiceNumber("");
                setFetchedBill(null);
                setReturnQuantities({});
                setReturnError(null);
              }} 
              className="text-muted-foreground hover:bg-muted p-1 rounded-full"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="p-4 space-y-4 max-h-[70vh] overflow-y-auto">
            {!fetchedBill ? (
              <>
                <div>
                  <label className="text-sm font-medium">Invoice Number</label>
                  <div className="flex gap-2 mt-2">
                    <input
                      type="text"
                      placeholder="e.g., INV-001"
                      value={returnInvoiceNumber}
                      onChange={(e) => {
                        setReturnInvoiceNumber(e.target.value);
                        setReturnError(null);
                      }}
                      className="flex-1 border rounded-md px-3 py-2 text-sm"
                    />
                    <button
                      onClick={handleReturnFetch}
                      disabled={returnLoading}
                      className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-bold disabled:opacity-50"
                    >
                      {returnLoading ? "Loading..." : "Fetch"}
                    </button>
                  </div>
                </div>
                {returnError && (
                  <div className="flex items-start gap-2 text-sm text-destructive bg-destructive/15 p-3 rounded-md">
                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                    {returnError}
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="bg-muted p-3 rounded-md">
                  <p className="text-sm font-medium">Invoice: <span className="font-bold text-primary">{fetchedBill.billNumber}</span></p>
                  <p className="text-xs text-muted-foreground">Customer: {fetchedBill.customer?.name || "N/A"}</p>
                </div>

                <div className="space-y-3">
                  <h3 className="text-sm font-bold">Select Items to Return</h3>
                  {fetchedBill.billItems.map((item: any) => (
                    <div key={item.id} className="flex items-center justify-between p-3 border rounded-md">
                      <div className="flex-1">
                        <p className="text-sm font-medium">{item.item?.name}</p>
                        <p className="text-xs text-muted-foreground">
                          Rs. {parseFloat(item.price).toFixed(2)} × {item.quantity} = Rs. {(parseFloat(item.price) * item.quantity).toFixed(2)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min="0"
                          max={item.quantity}
                          value={returnQuantities[item.id] || 0}
                          onChange={(e) => {
                            setReturnQuantities({
                              ...returnQuantities,
                              [item.id]: Math.min(Math.max(0, parseInt(e.target.value) || 0), item.quantity)
                            });
                          }}
                          className="w-16 border rounded-md px-2 py-1 text-sm text-center"
                        />
                        <span className="text-xs text-muted-foreground">/ {item.quantity}</span>
                      </div>
                    </div>
                  ))}
                </div>

                {returnError && (
                  <div className="flex items-start gap-2 text-sm text-destructive bg-destructive/15 p-3 rounded-md">
                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                    {returnError}
                  </div>
                )}

                <div className="bg-blue-50 border border-blue-200 p-3 rounded-md">
                  <p className="text-sm font-medium text-blue-900">
                    Return Amount: Rs. {fetchedBill.billItems.reduce((sum: number, item: any) => 
                      sum + (item.price * returnQuantities[item.id]), 0).toFixed(2)}
                  </p>
                </div>
              </>
            )}
          </div>

          <div className="flex justify-end gap-2 p-4 border-t border-border">
            <button
              onClick={() => {
                setIsReturnModalOpen(false);
                setReturnInvoiceNumber("");
                setFetchedBill(null);
                setReturnQuantities({});
                setReturnError(null);
              }}
              className="px-4 py-2 border rounded-md text-sm"
            >
              Close
            </button>
            {fetchedBill && (
              <button
                onClick={handleProcessReturn}
                disabled={returnLoading || Object.values(returnQuantities).every(v => v === 0)}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-bold disabled:opacity-50"
              >
                {returnLoading ? "Processing..." : "Confirm Return"}
              </button>
            )}
          </div>
        </div>
      </div>
    )}
    </>
  );
}