"use client";

import { useState, useEffect } from "react";
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
}

// Phase 3: Cart items track cost and can have an override price
interface CartItem {
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
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [searchTerm, setSearchBase] = useState("");
  const [loadingCatalog, setLoadingCatalog] = useState(true);

  const [cart, setCart] = useState<CartItem[]>([]);
  const [discount, setDiscount] = useState<string>("");
  const [amountPaid, setAmountPaid] = useState<string>("");

  // Phase 3: Price override editing state
  const [editingPriceId, setEditingPriceId] = useState<string | null>(null);
  const [editingPriceValue, setEditingPriceValue] = useState<string>("");

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

  // Hardware Scanner Hook
  useEffect(() => {
    let barcodeAccumulator = "";
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === "INPUT" || document.activeElement?.tagName === "SELECT") return;
      if (e.key === "Enter") {
        const item = catalog.find(i => i.barcode === barcodeAccumulator);
        if (item) addToCart(item);
        barcodeAccumulator = "";
      } else {
        if (/^[a-zA-Z0-9-]$/.test(e.key)) barcodeAccumulator += e.key;
      }
    };
    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
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
    const price = parseFloat(item.sellingPrice);
    const buyingPrice = parseFloat(item.buyingPrice); 
    setCart((prev) => {
      const existing = prev.find((i) => i.id === item.id);
      if (existing) {
        if (existing.quantity >= item.stockQty) return prev;
        return prev.map((i) => i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i);
      }
      return [...prev, { id: item.id, name: item.name, price, buyingPrice, quantity: 1, maxStock: item.stockQty }];
    });
  };

  const updateQuantity = (id: string, delta: number) => {
    setCart((prev) => prev.map((item) => {
      if (item.id === id) {
        const newQty = item.quantity + delta;
        if (newQty > 0 && newQty <= item.maxStock) return { ...item, quantity: newQty };
      }
      return item;
    }));
  };

  const removeFromCart = (id: string) => setCart((prev) => prev.filter((item) => item.id !== id));

  // ─── Phase 3: Price Override Functions ───────────────────────────────────

  const startEditingPrice = (item: CartItem) => {
    setEditingPriceId(item.id);
    setEditingPriceValue(String(item.overridePrice ?? item.price));
  };

  const commitPriceOverride = (id: string) => {
    const newPrice = parseFloat(editingPriceValue);
    if (!isNaN(newPrice) && newPrice > 0) {
      setCart(prev => prev.map(item =>
        item.id === id ? { ...item, overridePrice: newPrice } : item
      ));
    }
    setEditingPriceId(null);
  };

  const clearOverride = (id: string) => {
    setCart(prev => prev.map(item =>
      item.id === id ? { ...item, overridePrice: undefined } : item
    ));
  };

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
                    key={item.id}
                    onClick={() => addToCart(item)}
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
                    key={item.id}
                    className={`p-2 rounded-lg border transition-colors ${isBelowCost ? "border-red-300 bg-red-50" : "border-transparent"}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{item.name}</p>

                        {editingPriceId === item.id ? (
                          <div className="flex items-center gap-1 mt-1">
                            <span className="text-xs text-muted-foreground">Rs.</span>
                            <input
                              type="number"
                              autoFocus
                              value={editingPriceValue}
                              onChange={(e) => setEditingPriceValue(e.target.value)}
                              onBlur={() => commitPriceOverride(item.id)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") commitPriceOverride(item.id);
                                if (e.key === "Escape") setEditingPriceId(null);
                              }}
                              className="w-20 border border-blue-400 rounded px-1 py-0.5 text-xs font-bold"
                            />
                            <span className="text-xs text-muted-foreground">↵ to confirm</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            <button
                              onClick={() => startEditingPrice(item)}
                              title="Click to correct sticker price for old stock"
                              className={`text-xs font-bold underline decoration-dotted cursor-pointer hover:opacity-70 ${isBelowCost ? "text-red-600" : "text-muted-foreground"}`}
                            >
                              Rs. {effectivePrice.toFixed(2)} ea
                            </button>
                            {hasOverride && (
                              <button
                                onClick={() => clearOverride(item.id)}
                                className="text-[10px] text-blue-500 hover:text-blue-700"
                              >
                                (reset to Rs. {item.price.toFixed(2)})
                              </button>
                            )}
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                              isBelowCost ? "bg-red-200 text-red-800" : "bg-green-100 text-green-700"
                            }`}>
                              {isBelowCost ? `⚠ LOSS` : `+${itemMargin}%`}
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
                          <button onClick={() => updateQuantity(item.id, -1)} className="p-1 hover:bg-muted text-muted-foreground">
                            <Minus className="h-3 w-3" />
                          </button>
                          <span className="px-2 text-sm font-medium">{item.quantity}</span>
                          <button onClick={() => updateQuantity(item.id, 1)} className="p-1 hover:bg-muted text-muted-foreground">
                            <Plus className="h-3 w-3" />
                          </button>
                        </div>
                        <span className="text-xs font-bold text-foreground w-16 text-right">
                          Rs. {(effectivePrice * item.quantity).toFixed(2)}
                        </span>
                        <button onClick={() => removeFromCart(item.id)} className="text-destructive hover:opacity-70">
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
    </>
  );
}