"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import {
  Search, ShoppingCart, Plus, Minus, Trash2, CheckCircle2,
  Loader2, Printer, Barcode, UserCircle, X, AlertTriangle, TrendingUp
} from "lucide-react";

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

interface CartItem {
  cartKey: string;
  batchId: string | null;
  id: string;
  name: string;
  price: number;
  buyingPrice: number;    
  quantity: number;
  maxStock: number;
  overridePrice?: number; 
  isReturn?: boolean;
  originalBillId?: string;
  originalBillItemId?: string;
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

  const [editingPriceId, setEditingPriceId] =  useState<string | null>(null);
  const [showBatchPopup, setShowBatchPopup] = useState(false);
  const [batchSelectionItems, setBatchSelectionItems] = useState<CatalogItem[]>([]);

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

  // ==========================================
  // AUTO-SAVE DRAFT LOGIC
  // ==========================================
  const [isStateLoaded, setIsStateLoaded] = useState(false);

  // 1. Load Draft on Mount
  useEffect(() => {
    const savedCart = localStorage.getItem("erp_cart");
    const savedCustomer = localStorage.getItem("erp_customer");
    const savedDiscount = localStorage.getItem("erp_discount");

    if (savedCart) setCart(JSON.parse(savedCart));
    if (savedCustomer) setSelectedCustomer(JSON.parse(savedCustomer));
    if (savedDiscount) setDiscount(savedDiscount);

    setIsStateLoaded(true);
  }, []);

  // 2. Save Draft on Change
  useEffect(() => {
    if (!isStateLoaded) return; // Prevent overwriting storage with empty initial state

    localStorage.setItem("erp_cart", JSON.stringify(cart));
    localStorage.setItem("erp_discount", discount);
    
    if (selectedCustomer) {
      localStorage.setItem("erp_customer", JSON.stringify(selectedCustomer));
    } else {
      localStorage.removeItem("erp_customer");
    }
  }, [cart, selectedCustomer, discount, isStateLoaded]);

  // 3. Clear Cart helper
  const clearCart = () => {
    setCart([]);
    setDiscount("");
    setAmountPaid("");
    setSelectedCustomer(null);
    setCustomerQuery("");
    
    // Nuke the local storage drafts
    localStorage.removeItem("erp_cart");
    localStorage.removeItem("erp_customer");
    localStorage.removeItem("erp_discount");
  };
  // ==========================================

  useEffect(() => {
    let barcodeAccumulator = "";
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === "INPUT" || document.activeElement?.tagName === "SELECT") return;

      if (e.key === "Enter") {
        const matchingItems = catalog.filter((i) => i.barcode === barcodeAccumulator);
        if (matchingItems.length === 0) {
          barcodeAccumulator = "";
          return;
        }
        if (matchingItems.length === 1) {
          addToCart(matchingItems[0]);
          barcodeAccumulator = "";
          return;
        }
        setBatchSelectionItems(matchingItems);
        setShowBatchPopup(true);
        barcodeAccumulator = "";
      } else {
        if (/^[a-zA-Z0-9-]$/.test(e.key)) barcodeAccumulator += e.key;
      }
    };
    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, [catalog]);

  useEffect(() => {
    fetch("/api/items").then(res => res.json()).then(json => {
      if (json.success) setCatalog(json.data);
      setLoadingCatalog(false);
    });
  }, []);

  useEffect(() => {
    if (customerQuery.length > 1) {
      fetch(`/api/customers?search=${customerQuery}&limit=10`)
        .then(res => res.json())
        .then(data => setCustomerResults(data.customers || []));
    } else {
      setCustomerResults([]);
    }
  }, [customerQuery]);

  const addToCart = (item: CatalogItem) => {
    const price = parseFloat(item.sellingPrice);
    const buyingPrice = parseFloat(item.buyingPrice);
    const cartKey = `${item.id}-${item.batchId || 'legacy'}`;

    setCart((prev) => {
      const existing = prev.find((cartItem) => cartItem.cartKey === cartKey && !cartItem.isReturn);
      if (existing) {
        if (existing.quantity >= item.stockQty) return prev;
        return prev.map((cartItem) =>
          cartItem.cartKey === cartKey && !cartItem.isReturn ? { ...cartItem, quantity: cartItem.quantity + 1 } : cartItem
        );
      }
      return [
        ...prev,
        { cartKey, batchId: item.batchId, id: item.id, name: item.name, price, buyingPrice, quantity: 1, maxStock: item.stockQty },
      ];
    });
  };

  const updateQuantity = (cartKey: string, delta: number) => {
    if (delta < 0) {
      setCart((prev) => prev.map((item) => {
        if (item.cartKey === cartKey) {
          const newQty = item.quantity - 1;
          if (newQty <= 0) return null;
          return { ...item, quantity: newQty };
        }
        return item;
      }).filter(Boolean) as CartItem[]);
      return;
    }

    setCart((prev) => {
      const currentItem = prev.find((item) => item.cartKey === cartKey);
      if (!currentItem || currentItem.isReturn) return prev; 

      if (currentItem.quantity < currentItem.maxStock) {
        return prev.map((item) => item.cartKey === cartKey ? { ...item, quantity: item.quantity + 1 } : item);
      }

      const nextBatch = catalog.find((catalogItem) => catalogItem.id === currentItem.id && catalogItem.batchId !== currentItem.batchId);
      if (!nextBatch) return prev;

      const existingNext = prev.find((item) => item.batchId === nextBatch.batchId);
      if (existingNext) {
        if (existingNext.quantity >= existingNext.maxStock) return prev;
        return prev.map((item) => item.batchId === nextBatch.batchId ? { ...item, quantity: item.quantity + 1 } : item);
      }

      return [
        ...prev,
        {
          cartKey: `${nextBatch.id}-${nextBatch.batchId || 'legacy'}`,
          batchId: nextBatch.batchId,
          id: nextBatch.id,
          name: nextBatch.name,
          price: parseFloat(nextBatch.sellingPrice),
          buyingPrice: parseFloat(nextBatch.buyingPrice),
          quantity: 1,
          maxStock: nextBatch.stockQty,
        },
      ];
    });
  };

  const removeFromCart = (cartKey: string) => {
    setCart((prev) => prev.filter((item) => item.cartKey !== cartKey));
  };

  // FINANCIAL MATH
  const subtotal = cart.reduce((sum, item) => sum + (item.overridePrice ?? item.price) * item.quantity, 0);
  const numDiscount = parseFloat(discount) || 0;
  const finalTotal = subtotal - numDiscount;

  const belowCostItems = cart.filter(item => !item.isReturn && (item.overridePrice ?? item.price) < item.buyingPrice);
  const hasBelowCostItem = belowCostItems.length > 0;

  const totalSales = cart.filter(i => !i.isReturn).reduce((sum, item) => sum + (item.overridePrice ?? item.price) * item.quantity, 0);
  const totalCost = cart.filter(i => !i.isReturn).reduce((sum, item) => sum + item.buyingPrice * item.quantity, 0);
  const grossProfit = totalSales - totalCost - numDiscount;
  const marginPercent = totalSales > 0 ? ((grossProfit / totalSales) * 100).toFixed(1) : "0.0";

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

    if (finalTotal > 0 && finalAmountPaid < finalTotal && !selectedCustomer) {
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

      setMessage({ type: "success", text: `Transaction completed. Invoice: ${data.bill.billNumber}` });
      
      // Clean up UI and persistent storage after a successful checkout
      clearCart();

      const refresh = await fetch("/api/items").then(r => r.json());
      if (refresh.success) setCatalog(refresh.data);
      setTimeout(() => window.print(), 300);
    } catch (err: any) {
      setMessage({ type: "error", text: err.message || "Failed to process" });
    } finally {
      setIsProcessing(false);
    }
  };

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
      const quantities: { [key: string]: number } = {};
      data.data.billItems.forEach((item: any) => { quantities[item.id] = 0; });
      setReturnQuantities(quantities);
    } catch (err: any) {
      setReturnError(err.message);
    } finally {
      setReturnLoading(false);
    }
  };

  const handleProcessReturn = () => {
    if (!fetchedBill) return;

    const itemsToReturn = fetchedBill.billItems
      .filter((item: any) => returnQuantities[item.id] > 0)
      .map((item: any) => ({
        cartKey: `return-${item.id}-${Date.now()}`,
        batchId: null,
        id: item.itemId,
        name: `(RETURN) ${item.item?.name}`,
        price: parseFloat(item.unitPrice),
        buyingPrice: parseFloat(item.item?.buyingPrice || 0),
        quantity: -returnQuantities[item.id], 
        maxStock: item.quantity, 
        isReturn: true,
        originalBillId: fetchedBill.id,
        originalBillItemId: item.id, 
      }));

    if (itemsToReturn.length === 0) {
      setReturnError("Select at least one item to return");
      return;
    }

    setCart([...cart, ...itemsToReturn]);
    setIsReturnModalOpen(false);
    setReturnInvoiceNumber("");
    setFetchedBill(null);
    setReturnQuantities({});
  };

  const filteredCatalog = catalog.filter(item =>
    item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.barcode.includes(searchTerm)
  );

  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[calc(100vh-8rem)] print:hidden p-4 relative z-0">

        <div className="lg:col-span-2 flex flex-col space-y-4">
          <div className="flex items-center gap-4 rounded-xl border bg-white p-3 shadow-sm">
            <Search className="h-5 w-5 text-gray-400" />
            <input type="text" placeholder="Search by name or scan barcode..." value={searchTerm} onChange={(e) => setSearchBase(e.target.value)} className="flex-1 outline-none text-sm" />
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
                    key={`${item.id}-${item.batchId || 'legacy'}`}
                    onClick={() => {
                      const sameBarcodeItems = catalog.filter((catalogItem) => catalogItem.barcode === item.barcode);
                      if (sameBarcodeItems.length > 1) {
                        setBatchSelectionItems(sameBarcodeItems);
                        setShowBatchPopup(true);
                        return;
                      }
                      addToCart(item);
                    }}
                    className="p-4 rounded-lg border hover:border-blue-500 hover:bg-blue-50 transition-all text-left"
                  >
                    <p className="font-bold text-sm truncate">{item.name}</p>
                    <p className="text-xs text-gray-500">Stock: {item.stockQty}</p>
                    <p className="text-sm font-black text-blue-600 mt-2">Rs. {parseFloat(item.sellingPrice).toFixed(2)}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card shadow-sm flex flex-col relative z-10">
          <div className="p-4 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShoppingCart className="h-5 w-5 text-primary" />
              <h2 className="font-bold text-lg text-foreground">Current Bill</h2>
            </div>
            
            <div className="flex items-center gap-3">
              {cart.length > 0 && (
                <button onClick={clearCart} className="text-xs text-destructive hover:underline font-medium">
                  Clear Cart
                </button>
              )}
              {cart.length > 0 && !cart.every(i => i.isReturn) && (
                <div className={`flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-full ${
                  hasBelowCostItem ? "bg-red-100 text-red-700" :
                  parseFloat(marginPercent) < 10 ? "bg-yellow-100 text-yellow-700" : "bg-green-100 text-green-700"
                }`}>
                  <TrendingUp className="h-3 w-3" />
                  {marginPercent}% margin
                </div>
              )}
            </div>

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
                const isBelowCost = !item.isReturn && effectivePrice < item.buyingPrice;
                const itemMargin = ((effectivePrice - item.buyingPrice) / item.buyingPrice * 100).toFixed(0);

                return (
                <div key={item.cartKey} className={`p-2 rounded-lg border transition-colors ${isBelowCost ? "border-red-300 bg-red-50" : item.isReturn ? "border-orange-300 bg-orange-50" : "border-transparent"}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium truncate ${item.isReturn ? "text-orange-800" : "text-foreground"}`}>{item.name}</p>

                        {!item.isReturn && editingPriceId === item.id ? (
                          <div className="mt-1">
                            <select
                              value={item.price}
                              onChange={(e) => {
                                const selectedPrice = Number(e.target.value);
                                setCart((prev) => prev.map((cartItem) => cartItem.cartKey === item.cartKey ? { ...cartItem, price: selectedPrice } : cartItem));
                                setEditingPriceId(null);
                              }}
                              className="text-xs border rounded px-2 py-1"
                            >
                              {catalog.filter((catalogItem) => catalogItem.id === item.id).map((batchItem) => (
                                  <option key={`${batchItem.id}-${batchItem.batchId || 'legacy'}`} value={batchItem.sellingPrice}>
                                    Rs. {parseFloat(batchItem.sellingPrice).toFixed(2)} ({batchItem.stockQty} pcs)
                                  </option>
                              ))}
                            </select>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            <span className="text-xs font-bold text-muted-foreground">Rs. {effectivePrice.toFixed(2)} ea</span>
                            {!item.isReturn && (
                              <button onClick={() => setEditingPriceId(item.id)} className="text-[10px] px-2 py-0.5 rounded bg-blue-100 text-blue-700 hover:bg-blue-200">Edit</button>
                            )}
                            {!item.isReturn && (
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${isBelowCost ? "bg-red-200 text-red-800" : "bg-green-100 text-green-700"}`}>
                                {isBelowCost ? `LOSS` : `+${itemMargin}%`}
                              </span>
                            )}
                          </div>
                        )}

                        {isBelowCost && <p className="text-[10px] text-red-600 font-bold mt-0.5">Cost: Rs. {item.buyingPrice.toFixed(2)} — you are selling at a loss!</p>}
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {item.isReturn ? (
                          <span className="px-3 py-1 text-xs font-bold text-orange-700 bg-orange-200 rounded-md">
                            QTY: {Math.abs(item.quantity)}
                          </span>
                        ) : (
                          <div className="flex items-center border border-border rounded-md bg-background">
                            <button onClick={() => updateQuantity(item.cartKey, -1)} className="p-1 hover:bg-muted text-muted-foreground"><Minus className="h-3 w-3" /></button>
                            
                            <input 
                              type="number" 
                              step="any"
                              min="0"
                              value={item.quantity.toString()}
                              onChange={(e) => {
                                const newQty = parseFloat(e.target.value);
                                if (!isNaN(newQty) && newQty > 0) {
                                  setCart(prev => prev.map(c => c.cartKey === item.cartKey ? { ...c, quantity: newQty } : c));
                                }
                              }}
                              className="w-16 text-center text-sm font-medium bg-transparent border-none focus:ring-0 px-1" 
                            />

                            <button onClick={() => updateQuantity(item.cartKey, 1)} className="p-1 hover:bg-muted text-muted-foreground"><Plus className="h-3 w-3" /></button>
                          </div>
                        )}
                        <span className={`text-xs font-bold w-20 text-right ${item.isReturn ? "text-orange-700" : "text-foreground"}`}>
                          Rs. {(effectivePrice * item.quantity).toFixed(2)}
                        </span>
                        <button onClick={() => removeFromCart(item.cartKey)} className="text-destructive hover:opacity-70"><Trash2 className="h-4 w-4" /></button>
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
                  <p className="text-[10px] mt-0.5 opacity-90">Please fix below cost items.</p>
                </div>
              </div>
            )}

            <div className="space-y-1.5 relative">
              <div className="flex justify-between items-center">
                <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                  <UserCircle className="h-3 w-3" /> Link Customer
                </label>
                {selectedCustomer && (
                  <button onClick={() => setSelectedCustomer(null)} className="text-xs text-destructive hover:underline">Remove Link</button>
                )}
              </div>
              {selectedCustomer ? (
                <div className="w-full rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm flex justify-between items-center">
                  <div>
                    <p className="font-bold text-blue-800">{selectedCustomer.name}</p>
                  </div>
                  <CheckCircle2 className="h-5 w-5 text-blue-500" />
                </div>
              ) : (
                <div className="relative">
                  <Search className="h-4 w-4 absolute left-3 top-2.5 text-muted-foreground" />
                  <input type="text" placeholder="Search Name or NIC" value={customerQuery} onChange={(e) => { setCustomerQuery(e.target.value); setIsDropdownOpen(true); }} className="w-full rounded-md border border-input bg-background pl-9 pr-3 py-2 text-sm focus:ring-2 focus:ring-primary" />
                  {isDropdownOpen && customerQuery.length > 1 && (
                    <div className="absolute z-50 w-full mt-1 bg-white border border-border rounded-md shadow-xl max-h-48 overflow-y-auto">
                      {customerResults.length > 0 ? (
                        customerResults.map((c) => (
                          <button key={c.id} onClick={() => { setSelectedCustomer(c); setIsDropdownOpen(false); setCustomerQuery(""); }} className="w-full text-left px-4 py-2 text-sm hover:bg-muted border-b border-border">
                            <p className="font-bold text-foreground">{c.name}</p>
                          </button>
                        ))
                      ) : (
                        <div className="p-3 text-center">
                          <button onClick={() => { setIsDropdownOpen(false); setIsQuickAddOpen(true); setNewCusName(customerQuery); }} className="text-sm bg-primary text-primary-foreground px-3 py-1.5 rounded-md font-medium w-full">Add "{customerQuery}"</button>
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
                <div className={`px-3 py-2 text-sm bg-background border border-border rounded-md font-medium ${subtotal < 0 ? 'text-orange-600' : 'text-foreground'}`}>
                  Rs. {subtotal.toFixed(2)}
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-blue-600">Special Discount</label>
                <input type="number" min="0" value={discount} onChange={(e) => setDiscount(e.target.value)} placeholder="Rs. 0.00" className="w-full rounded-md border border-blue-200 bg-blue-50/50 px-3 py-2 text-sm font-medium" />
              </div>
            </div>

            <div className="flex justify-between items-center text-lg font-bold border-t border-border pt-4">
              <span className="text-foreground">{finalTotal < 0 ? "Refund Due" : "Total to Pay"}</span>
              <span className={finalTotal < 0 ? "text-orange-600" : "text-primary"}>
                Rs. {Math.abs(finalTotal).toFixed(2)}
              </span>
            </div>

            {finalTotal > 0 ? (
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Cash Received</label>
                <input
                  type="number" min="0" value={amountPaid} onChange={(e) => setAmountPaid(e.target.value)} placeholder={`Rs. ${finalTotal.toFixed(2)}`}
                  className={`w-full rounded-md border px-3 py-3 text-base font-medium ${amountPaid && parseFloat(amountPaid) < finalTotal ? "border-orange-500 bg-orange-50/50" : "border-input bg-background"}`}
                />
              </div>
            ) : finalTotal < 0 ? (
              <div className="p-3 bg-orange-100 border border-orange-300 rounded-lg flex items-center justify-between">
                <span className="text-sm font-bold text-orange-800">Please Hand Cash to Customer:</span>
                <span className="text-sm font-black text-orange-900">Rs. {Math.abs(finalTotal).toFixed(2)}</span>
              </div>
            ) : null}

            {message && (
              <div className={`p-3 rounded-md text-sm font-medium ${message.type === "success" ? "bg-green-500/15 text-green-600" : "bg-destructive/15 text-destructive"}`}>
                {message.text}
              </div>
            )}

            {session?.user.role !== "CASHIER" && (
              <button onClick={() => { setIsReturnModalOpen(true); setReturnInvoiceNumber(""); setFetchedBill(null); setReturnQuantities({}); }} className="w-full py-2 rounded-lg font-semibold bg-amber-600 text-white hover:bg-amber-700 text-sm">
                Process Customer Return
              </button>
            )}

            <button onClick={handleCheckout} disabled={cart.length === 0 || isProcessing || hasBelowCostItem} className="w-full py-3 rounded-lg font-bold bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
              {isProcessing ? "Processing..." : "Checkout & Print"}
            </button>
          </div>
        </div>
      </div>

      {showBatchPopup && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
          <div className="bg-white border shadow-2xl rounded-xl p-4 w-[320px]">
            <h2 className="text-sm font-bold text-gray-800 mb-4">Select Batch Price</h2>
            <div className="space-y-2">
              {batchSelectionItems.map((item) => (
                <button key={`${item.id}-${item.batchId || 'legacy'}`} onClick={() => { addToCart(item); setShowBatchPopup(false); }} className="w-full rounded-lg border px-3 py-3 hover:bg-blue-50 text-left flex justify-between items-center">
                  <div>
                    <p className="font-bold text-blue-600">Rs. {parseFloat(item.sellingPrice).toFixed(2)}</p>
                    <p className="text-xs text-gray-500">Stock: {item.stockQty}</p>
                  </div>
                  <div className="text-[10px] bg-blue-100 text-blue-700 px-2 py-1 rounded-full">Select</div>
                </button>
              ))}
            </div>
            <button onClick={() => setShowBatchPopup(false)} className="mt-3 w-full text-xs border rounded-lg py-2">Cancel</button>
          </div>
        </div>
      )}

      {isReturnModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-background w-full max-w-2xl rounded-xl shadow-xl overflow-hidden border border-border">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h2 className="text-lg font-bold text-amber-600">Fetch Invoice for Return</h2>
              <button onClick={() => setIsReturnModalOpen(false)} className="text-muted-foreground hover:bg-muted p-1 rounded-full"><X className="h-5 w-5" /></button>
            </div>
            <div className="p-4 space-y-4 max-h-[70vh] overflow-y-auto">
              {!fetchedBill ? (
                <>
                  <div className="flex gap-2">
                    <input type="text" placeholder="e.g., INV-001" value={returnInvoiceNumber} onChange={(e) => { setReturnInvoiceNumber(e.target.value); setReturnError(null); }} className="flex-1 border rounded-md px-3 py-2 text-sm" />
                    <button onClick={handleReturnFetch} disabled={returnLoading} className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-bold disabled:opacity-50">Fetch</button>
                  </div>
                  {returnError && <div className="text-sm text-destructive bg-destructive/15 p-3 rounded-md">{returnError}</div>}
                </>
              ) : (
                <>
                  <div className="bg-muted p-3 rounded-md">
                    <p className="text-sm font-medium">Invoice: <span className="font-bold text-primary">{fetchedBill.billNumber}</span></p>
                  </div>
                  <div className="space-y-3">
                    <h3 className="text-sm font-bold">Select Items to Return</h3>
                    {fetchedBill.billItems.map((item: any) => {
                      const availableToReturn = item.availableToReturn;
                      return (
                        <div key={item.id} className="flex items-center justify-between p-3 border rounded-md">
                          <div className="flex-1">
                            <p className="text-sm font-medium">{item.item?.name}</p>
                            <p className="text-xs text-muted-foreground">Bought at Rs. {parseFloat(item.unitPrice).toFixed(2)}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              step="any"
                              min="0"
                              max={availableToReturn}
                              value={returnQuantities[item.id] || 0}
                              onChange={(e) => {
                                setReturnQuantities({
                                  ...returnQuantities,
                                  [item.id]: Math.min(Math.max(0, parseFloat(e.target.value) || 0), availableToReturn)
                                });
                              }}
                              className="w-16 border rounded-md px-2 py-1 text-sm text-center focus:ring-2 focus:ring-amber-500"
                            />
                            <span className="text-xs text-muted-foreground">/ {availableToReturn}</span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </>
              )}
            </div>
            <div className="flex justify-end gap-2 p-4 border-t border-border">
              {fetchedBill && (
                <button
                  onClick={handleProcessReturn}
                  disabled={returnLoading || Object.values(returnQuantities).every(v => v === 0)}
                  className="px-4 py-2 bg-amber-600 text-white rounded-md text-sm font-bold disabled:opacity-50"
                >
                  Add Selected Returns to Cart
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Handle negative values gracefully in the printed receipt */}
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
            
            {/* Display Refund/Payment appropriately based on math */}
            {lastInvoice.totalAmount < 0 ? (
               <p className="font-bold border-t border-dashed border-black mt-1 pt-1">
                 REFUND GIVEN: Rs. {Math.abs(lastInvoice.totalAmount).toFixed(2)}
               </p>
            ) : (
               <>
                 <p className="mt-1 text-xs">PAID (CASH): Rs. {lastInvoice.amountPaid.toFixed(2)}</p>
                 {lastInvoice.amountPaid < lastInvoice.totalAmount ? (
                   <p className="font-bold border-t border-dashed border-black mt-1 pt-1">
                     DUE (DEBT): Rs. {(lastInvoice.totalAmount - lastInvoice.amountPaid).toFixed(2)}
                   </p>
                 ) : (
                   <p className="text-xs">CHANGE: Rs. {(lastInvoice.amountPaid - lastInvoice.totalAmount).toFixed(2)}</p>
                 )}
               </>
            )}
          </div>
        </div>
      )}
    </>
  );
}