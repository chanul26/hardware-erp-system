"use client";

import { useState, useEffect } from "react";
import { Search, ShoppingCart, Plus, Minus, Trash2, CheckCircle2, Loader2 } from "lucide-react";

interface CatalogItem {
  id: string;
  barcode: string;
  name: string;
  sellingPrice: string; // Comes as string from Prisma Decimal
  stockQty: number;
}

interface CartItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  maxStock: number;
}

export default function BillingPage() {
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  
  const [cart, setCart] = useState<CartItem[]>([]);
  const [amountPaid, setAmountPaid] = useState<string>("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Fetch real data from the database on load
  useEffect(() => {
    const fetchItems = async () => {
      try {
        const res = await fetch("/api/items");
        const json = await res.json();
        if (json.success) {
          setCatalog(json.data);
        }
      } catch (err) {
        console.error("Failed to fetch catalog items", err);
      } finally {
        setLoadingCatalog(false);
      }
    };
    fetchItems();
  }, []);

  // Cart Logic
  const addToCart = (item: CatalogItem) => {
    const price = parseFloat(item.sellingPrice);
    setCart((prev) => {
      const existing = prev.find((i) => i.id === item.id);
      if (existing) {
        // Prevent adding more than we have in stock
        if (existing.quantity >= item.stockQty) return prev;
        return prev.map((i) => (i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i));
      }
      return [...prev, { id: item.id, name: item.name, price: price, quantity: 1, maxStock: item.stockQty }];
    });
  };

  const updateQuantity = (id: string, delta: number) => {
    setCart((prev) =>
      prev.map((item) => {
        if (item.id === id) {
          const newQty = item.quantity + delta;
          // Ensure we don't go below 1 or above max stock
          if (newQty > 0 && newQty <= item.maxStock) {
            return { ...item, quantity: newQty };
          }
        }
        return item;
      })
    );
  };

  const removeFromCart = (id: string) => {
    setCart((prev) => prev.filter((item) => item.id !== id));
  };

  // Math
  const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const totalAmount = subtotal;

  // API Call
  const handleCheckout = async () => {
    if (cart.length === 0) return;
    setIsProcessing(true);
    setMessage(null);

    const payload = {
      customerId: null,
      items: cart,
      subtotal,
      discount: 0,
      tax: 0,
      totalAmount,
      paymentMethod: "CASH",
      amountPaid: amountPaid ? parseFloat(amountPaid) : totalAmount,
    };

    try {
      const res = await fetch("/api/bills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        setMessage({ type: "error", text: data.error || "Checkout failed." });
      } else {
        setMessage({ type: "success", text: `Success! Invoice ${data.bill.billNumber} generated.` });
        setCart([]); 
        setAmountPaid(""); 
        
        // Optionally: Refresh the catalog to show updated stock levels
        const refreshRes = await fetch("/api/items");
        const refreshJson = await refreshRes.json();
        if (refreshJson.success) setCatalog(refreshJson.data);
      }
    } catch (error) {
      setMessage({ type: "error", text: "Network error. Please try again." });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[calc(100vh-8rem)]">
      
      {/* ── Left Side: Item Selection ── */}
      <div className="lg:col-span-2 flex flex-col space-y-4">
        <div className="flex items-center gap-2 rounded-xl border border-border bg-card p-3 shadow-sm">
          <Search className="h-5 w-5 text-muted-foreground" />
          <input 
            type="text" 
            placeholder="Scan barcode or search items..." 
            className="flex-1 bg-transparent outline-none text-sm placeholder:text-muted-foreground"
          />
        </div>

        <div className="flex-1 rounded-xl border border-border bg-card p-4 shadow-sm overflow-y-auto">
          <h3 className="font-semibold text-foreground mb-4">Quick Add (Catalog)</h3>
          
          {loadingCatalog ? (
            <div className="flex justify-center items-center h-32">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : catalog.length === 0 ? (
            <p className="text-sm text-muted-foreground">No items in stock. Add items from the Inventory module.</p>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {catalog.map((item) => (
                <button
                  key={item.id}
                  onClick={() => addToCart(item)}
                  className="flex flex-col items-start justify-between p-4 rounded-lg border border-border hover:border-primary hover:bg-primary/5 transition-colors text-left"
                >
                  <span className="text-sm font-medium text-foreground">{item.name}</span>
                  <span className="text-xs text-muted-foreground mt-1">Stock: {item.stockQty}</span>
                  <span className="text-sm font-bold text-primary mt-2">Rs. {parseFloat(item.sellingPrice).toFixed(2)}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Right Side: The Ledger / Cart ── */}
      <div className="rounded-xl border border-border bg-card shadow-sm flex flex-col">
        <div className="p-4 border-b border-border flex items-center gap-2">
          <ShoppingCart className="h-5 w-5 text-primary" />
          <h2 className="font-bold text-lg text-foreground">Current Bill</h2>
        </div>

        {/* Cart Items */}
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
                  <div className="flex items-center border border-border rounded-md">
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

        {/* Checkout Section */}
        <div className="p-4 border-t border-border bg-muted/30 space-y-4">
          <div className="flex justify-between items-center text-sm">
            <span className="text-muted-foreground">Subtotal</span>
            <span className="font-medium text-foreground">Rs. {subtotal.toFixed(2)}</span>
          </div>
          
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Amount Paid (Cash)</label>
            <input 
              type="number" 
              value={amountPaid}
              onChange={(e) => setAmountPaid(e.target.value)}
              placeholder={`Rs. ${totalAmount.toFixed(2)}`}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-primary" 
            />
          </div>

          <div className="flex justify-between items-center text-lg font-bold border-t border-border pt-4">
            <span className="text-foreground">Total</span>
            <span className="text-primary">Rs. {totalAmount.toFixed(2)}</span>
          </div>

          {message && (
            <div className={`flex items-center gap-2 text-sm font-medium p-3 rounded-md ${message.type === 'success' ? 'bg-green-500/15 text-green-600' : 'bg-destructive/15 text-destructive'}`}>
              {message.type === 'success' && <CheckCircle2 className="h-4 w-4" />}
              {message.text}
            </div>
          )}

          <button 
            onClick={handleCheckout} 
            disabled={cart.length === 0 || isProcessing}
            className="w-full py-3 rounded-lg bg-primary text-primary-foreground font-bold hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isProcessing ? "Processing..." : "Complete Checkout"}
          </button>
        </div>
      </div>

    </div>
  );
}