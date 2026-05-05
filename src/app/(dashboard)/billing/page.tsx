"use client";

import { useState, useEffect } from "react";
import { Search, ShoppingCart, Plus, Minus, Trash2, CheckCircle2, Loader2, Printer, Barcode, UserCircle } from "lucide-react";

interface CatalogItem { id: string; barcode: string; name: string; sellingPrice: string; stockQty: number; }
interface CartItem { id: string; name: string; price: number; quantity: number; maxStock: number; }
interface InvoiceData { billNumber: string; items: CartItem[]; subtotal: number; discount: number; totalAmount: number; amountPaid: number; date: string; }

export default function BillingPage() {
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [searchTerm, setSearchBase] = useState(""); 
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customerId, setCustomerId] = useState<string>("");
  const [discount, setDiscount] = useState<string>("");
  const [amountPaid, setAmountPaid] = useState<string>("");
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [lastInvoice, setLastInvoice] = useState<InvoiceData | null>(null);

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

  useEffect(() => {
    fetch("/api/items").then(res => res.json()).then(json => {
      if (json.success) setCatalog(json.data);
      setLoadingCatalog(false);
    });
    // Fetch customers so cashiers can attach debt to a specific person
    fetch("/api/customers").then(res => res.json()).then(json => {
      if (json.success) setCustomers(json.data);
    }).catch(() => console.log("Waiting for customer API..."));
  }, []);

  const addToCart = (item: CatalogItem) => {
    const price = parseFloat(item.sellingPrice);
    setCart((prev) => {
      const existing = prev.find((i) => i.id === item.id);
      if (existing) {
        if (existing.quantity >= item.stockQty) return prev;
        return prev.map((i) => (i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i));
      }
      return [...prev, { id: item.id, name: item.name, price, quantity: 1, maxStock: item.stockQty }];
    });
  };

  const updateQuantity = (id: string, delta: number) => {
    setCart((prev) => prev.map((item) => {
        if (item.id === id) {
          const newQty = item.quantity + delta;
          if (newQty > 0 && newQty <= item.maxStock) return { ...item, quantity: newQty };
        }
        return item;
      })
    );
  };

  const removeFromCart = (id: string) => setCart((prev) => prev.filter((item) => item.id !== id));
  
  // Financial Math
  const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const numDiscount = parseFloat(discount) || 0;
  const finalTotal = Math.max(0, subtotal - numDiscount);

  const handleCheckout = async () => {
    if (cart.length === 0) return;
    
    // Default to full payment if they leave the box blank
    const finalAmountPaid = amountPaid !== "" ? parseFloat(amountPaid) : finalTotal;

    // SECURITY BLOCK: Cannot give credit without selecting a customer
    if (finalAmountPaid < finalTotal && !customerId) {
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
            items: cart, 
            customerId: customerId || undefined,
            subtotal, 
            discount: numDiscount,
            totalAmount: finalTotal, 
            amountPaid: finalAmountPaid 
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setLastInvoice({ 
          billNumber: data.bill.billNumber, 
          items: [...cart], 
          subtotal,
          discount: numDiscount,
          totalAmount: finalTotal, 
          amountPaid: finalAmountPaid, 
          date: new Date().toLocaleString() 
      });
      
      setMessage({ type: "success", text: `Invoice ${data.bill.billNumber} generated.` });
      setCart([]); setAmountPaid(""); setDiscount(""); setCustomerId("");
      
      const refresh = await fetch("/api/items").then(r => r.json());
      if (refresh.success) setCatalog(refresh.data);
      setTimeout(() => window.print(), 300);
    } catch (err: any) {
      setMessage({ type: "error", text: err.message || "Failed" });
    } finally { setIsProcessing(false); }
  };

  const filteredCatalog = catalog.filter(item => 
    item.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    item.barcode.includes(searchTerm)
  );

  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[calc(100vh-8rem)] print:hidden p-4">
        {/* Left Side: Catalog */}
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
                  <button key={item.id} onClick={() => addToCart(item)} className="p-4 rounded-lg border hover:border-blue-500 hover:bg-blue-50 transition-all text-left">
                    <p className="font-bold text-sm truncate">{item.name}</p>
                    <p className="text-xs text-gray-500">Stock: {item.stockQty}</p>
                    <p className="text-sm font-black text-blue-600 mt-2">Rs. {parseFloat(item.sellingPrice).toFixed(2)}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Side: Cart & Financials */}
        <div className="rounded-xl border border-border bg-card shadow-sm flex flex-col">
          <div className="p-4 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShoppingCart className="h-5 w-5 text-primary" />
              <h2 className="font-bold text-lg text-foreground">Current Bill</h2>
            </div>
            {lastInvoice && (
               <button onClick={() => window.print()} className="text-xs flex items-center gap-1 text-muted-foreground hover:text-primary">
                 <Printer className="h-3 w-3"/> Print Last
               </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {cart.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
                <ShoppingCart className="h-10 w-10 mb-2 opacity-20" />
                <p className="text-sm">Cart is empty</p>
              </div>
            ) : (
              cart.map((item) => (
                <div key={item.id} className="flex items-center justify-between">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-foreground">{item.name}</p>
                    <p className="text-xs text-muted-foreground">Rs. {item.price.toFixed(2)} each</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center border border-border rounded-md bg-background">
                      <button onClick={() => updateQuantity(item.id, -1)} className="p-1 hover:bg-muted text-muted-foreground"><Minus className="h-3 w-3" /></button>
                      <span className="px-2 text-sm font-medium">{item.quantity}</span>
                      <button onClick={() => updateQuantity(item.id, 1)} className="p-1 hover:bg-muted text-muted-foreground"><Plus className="h-3 w-3" /></button>
                    </div>
                    <button onClick={() => removeFromCart(item.id)} className="text-destructive hover:opacity-70">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="p-4 border-t border-border bg-muted/30 space-y-4">
            {/* Customer Linker */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground flex items-center gap-1"><UserCircle className="h-3 w-3"/> Link Customer</label>
              <select 
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-primary"
              >
                <option value="">Walk-in Customer (No Credit Allowed)</option>
                {customers.map((c: any) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            {/* Discount & Subtotal */}
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

            {/* Amount Paid */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Cash Received</label>
              <input 
                type="number" 
                min="0"
                value={amountPaid}
                onChange={(e) => setAmountPaid(e.target.value)}
                placeholder={`Rs. ${finalTotal.toFixed(2)}`}
                className={`w-full rounded-md border px-3 py-3 text-base font-medium focus:ring-2 focus:ring-primary transition-colors ${
                   amountPaid && parseFloat(amountPaid) < finalTotal ? "border-orange-500 bg-orange-50/50 text-orange-700" : "border-input bg-background"
                }`} 
              />
              {amountPaid && parseFloat(amountPaid) < finalTotal && !customerId && (
                  <p className="text-xs text-destructive mt-1 font-medium">⚠️ Error: Must link a customer to give credit.</p>
              )}
            </div>

            {message && (
              <div className={`flex items-center gap-2 text-sm font-medium p-3 rounded-md ${message.type === 'success' ? 'bg-green-500/15 text-green-600' : 'bg-destructive/15 text-destructive'}`}>
                {message.type === 'success' && <CheckCircle2 className="h-4 w-4 shrink-0" />}
                {message.text}
              </div>
            )}

            <button 
              onClick={handleCheckout} 
              disabled={cart.length === 0 || isProcessing}
              className="w-full py-3 rounded-lg bg-primary text-primary-foreground font-bold hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isProcessing ? "Processing..." : (
                <>Checkout & Print <Printer className="h-4 w-4"/></>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* ── Receipt Template ── */}
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