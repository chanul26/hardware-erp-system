"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Loader2 } from "lucide-react";

export default function AddSupplierForm() {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const data = {
      name: formData.get("name"),
      phone: formData.get("phone"),
      email: formData.get("email"),
      address: formData.get("address"),
    };

    try {
      const response = await fetch("/api/suppliers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Failed to add supplier");
      }

      setIsOpen(false);
      router.refresh(); 
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg hover:bg-primary/90 transition shadow-sm font-medium"
      >
        <Plus className="h-4 w-4" />
        Add New Supplier
      </button>
    );
  }

  return (
    <div className="bg-card p-6 rounded-xl shadow-sm border border-border mb-8">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-bold text-foreground">Register New Supplier</h2>
        <button 
          onClick={() => setIsOpen(false)} 
          className="text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          Cancel
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-destructive/15 text-destructive rounded-md text-sm font-medium">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-muted-foreground">Supplier Name *</label>
          <input name="name" required className="w-full border border-input bg-background p-2 rounded-md mt-1 focus:ring-2 focus:ring-primary outline-none" placeholder="e.g. BuildMart Wholesale" />
        </div>
        <div>
          <label className="block text-sm font-medium text-muted-foreground">Phone Number</label>
          <input name="phone" className="w-full border border-input bg-background p-2 rounded-md mt-1 focus:ring-2 focus:ring-primary outline-none" placeholder="e.g. 011-555-4321" />
        </div>
        <div>
          <label className="block text-sm font-medium text-muted-foreground">Email Address</label>
          <input name="email" type="email" className="w-full border border-input bg-background p-2 rounded-md mt-1 focus:ring-2 focus:ring-primary outline-none" placeholder="sales@buildmart.com" />
        </div>
        <div>
          <label className="block text-sm font-medium text-muted-foreground">Address</label>
          <input name="address" className="w-full border border-input bg-background p-2 rounded-md mt-1 focus:ring-2 focus:ring-primary outline-none" placeholder="123 Industrial Estate, Colombo" />
        </div>
        
        <div className="md:col-span-2 flex justify-end mt-2">
          <button type="submit" disabled={loading} className="flex items-center gap-2 bg-primary text-primary-foreground px-6 py-2 rounded-md hover:bg-primary/90 transition font-medium disabled:opacity-70">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {loading ? "Saving..." : "Save Supplier"}
          </button>
        </div>
      </form>
    </div>
  );
}