import type { Metadata } from "next";
import { Receipt } from "lucide-react";

export const metadata: Metadata = {
  title: "Point of Sale",
  description: "Hardware ERP Billing and POS System",
};

export default function BillingPage() {
  return (
    <div className="flex h-[80vh] flex-col items-center justify-center space-y-4">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
        <Receipt className="h-8 w-8 text-primary" />
      </div>
      <h2 className="text-2xl font-bold text-foreground">Point of Sale (POS)</h2>
      <p className="text-muted-foreground">
        The Barcode Scanner and Billing interface will be built here.
      </p>
    </div>
  );
}
