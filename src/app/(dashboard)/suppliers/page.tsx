import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import AddSupplierForm from "./AddSupplierForm";
import { Truck } from "lucide-react";

export const metadata: Metadata = {
  title: "Suppliers",
  description: "Manage hardware suppliers and vendors.",
};

// RULE 1: This prevents CI/CD build crashes
export const dynamic = "force-dynamic";

export default async function SuppliersPage() {
  const suppliers = await prisma.supplier.findMany({
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Truck className="h-6 w-6 text-primary" />
            Supplier Management
          </h2>
          <p className="text-muted-foreground mt-1">
            View and register companies you purchase hardware from.
          </p>
        </div>
        <AddSupplierForm />
      </div>

      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-muted/50 text-muted-foreground border-b border-border">
              <tr>
                <th className="px-6 py-4 font-medium">Name</th>
                <th className="px-6 py-4 font-medium">Phone</th>
                <th className="px-6 py-4 font-medium">Email</th>
                <th className="px-6 py-4 font-medium">Address</th>
                <th className="px-6 py-4 font-medium">Date Added</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {suppliers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-muted-foreground">
                    No suppliers found. Register your first supplier above.
                  </td>
                </tr>
              ) : (
                suppliers.map((supplier) => (
                  <tr key={supplier.id} className="hover:bg-muted/20 transition-colors text-foreground">
                    <td className="px-6 py-4 font-medium">{supplier.name}</td>
                    <td className="px-6 py-4">{supplier.phone || "—"}</td>
                    <td className="px-6 py-4">{supplier.email || "—"}</td>
                    <td className="px-6 py-4 truncate max-w-[200px]" title={supplier.address || ""}>
                      {supplier.address || "—"}
                    </td>
                    <td className="px-6 py-4 text-muted-foreground">
                      {new Date(supplier.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}