"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Loader2, X } from "lucide-react";

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

  return (
    <>
      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg hover:bg-primary/90 transition shadow-sm font-medium text-sm"
      >
        <Plus className="h-4 w-4" />
        Add New Supplier
      </button>

      {/* Modal Overlay */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 sm:p-0 animate-in fade-in duration-200">
          <div className="bg-background w-full max-w-2xl rounded-xl shadow-xl overflow-hidden border border-border animate-in zoom-in-95 duration-200">
            
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-border">
              <h2 className="text-lg font-semibold text-foreground tracking-tight">
                Add New Supplier
              </h2>
              <button 
                onClick={() => setIsOpen(false)} 
                className="text-muted-foreground hover:text-foreground hover:bg-muted p-1.5 rounded-full transition-colors"
                type="button"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Form Content */}
            <form onSubmit={handleSubmit}>
              <div className="p-6 space-y-6">
                
                {/* Error Banner */}
                {error && (
                  <div className="p-3 bg-destructive/15 text-destructive rounded-md text-sm font-medium border border-destructive/20">
                    {error}
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Name Field */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium leading-none text-foreground">
                      Supplier Name <span className="text-destructive">*</span>
                    </label>
                    <input 
                      name="name" 
                      required 
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:border-primary transition-colors disabled:opacity-50" 
                      placeholder="e.g. BuildMart Wholesale" 
                    />
                  </div>

                  {/* Phone Field */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium leading-none text-foreground">
                      Phone Number
                    </label>
                    <input 
                      name="phone" 
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:border-primary transition-colors disabled:opacity-50" 
                      placeholder="e.g. 011-555-4321" 
                    />
                  </div>

                  {/* Email Field */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium leading-none text-foreground">
                      Email Address
                    </label>
                    <input 
                      name="email" 
                      type="email"
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:border-primary transition-colors disabled:opacity-50" 
                      placeholder="sales@buildmart.com" 
                    />
                  </div>

                  {/* Address Field */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium leading-none text-foreground">
                      Address
                    </label>
                    <input 
                      name="address" 
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:border-primary transition-colors disabled:opacity-50" 
                      placeholder="123 Industrial Estate, Colombo" 
                    />
                  </div>
                </div>
              </div>
              
              {/* Footer Actions */}
              <div className="flex items-center justify-end gap-3 p-6 border-t border-border bg-muted/10">
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="h-10 px-4 py-2 rounded-md border border-input bg-background text-sm font-medium hover:bg-accent hover:text-accent-foreground transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex items-center gap-2 h-10 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-70"
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {loading ? "Saving..." : "Save Supplier"}
                </button>
              </div>
            </form>

          </div>
        </div>
      )}
    </>
  );
}