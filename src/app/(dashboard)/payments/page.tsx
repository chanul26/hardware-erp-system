import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { Wallet, ArrowDownRight, ArrowUpRight, AlertCircle } from "lucide-react";

export const metadata: Metadata = {
  title: "Master Ledger",
  description: "Unified view of all cash inflows and outflows.",
};

// RULE 1: Prevent CI/CD build crashes
export const dynamic = "force-dynamic";

export default async function PaymentsLedgerPage() {
  let customerPayments: any[] = [];
  let supplierPayments: any[] = [];
  let fetchError = false;

  try {
    // Fetch both tables at the exact same time
    const [inbound, outbound] = await Promise.all([
      prisma.payment.findMany({
        orderBy: { paidAt: "desc" },
        include: { customer: true, bill: true },
      }),
      // Using the new schema table Chanul added
      prisma.supplierPayment.findMany({
        orderBy: { paidAt: "desc" },
        include: { supplier: true },
      }),
    ]);

    customerPayments = inbound;
    supplierPayments = outbound;
  } catch (error) {
    console.error("Failed to load ledger data:", error);
    fetchError = true;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
          <Wallet className="h-6 w-6 text-primary" />
          Master Ledger
        </h2>
        <p className="text-muted-foreground mt-1">
          Unified overview of all business cash flows (Accounts Receivable & Payable).
        </p>
      </div>

      {fetchError && (
        <div className="p-4 bg-destructive/15 text-destructive rounded-lg flex items-center gap-2 font-medium">
          <AlertCircle className="h-5 w-5" />
          Database sync error. Did you run `npx prisma db push`?
        </div>
      )}

      {/* Side-by-Side Tables Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* LEFT COLUMN: CASH IN (Customers) */}
        <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden flex flex-col">
          <div className="p-4 border-b border-border bg-green-500/10 flex items-center gap-2">
            <ArrowDownRight className="h-5 w-5 text-green-600" />
            <h3 className="font-bold text-green-700 dark:text-green-500">Cash In (From Customers)</h3>
          </div>
          
          <div className="overflow-x-auto flex-1">
            <table className="w-full text-sm text-left">
              <thead className="bg-muted/50 text-muted-foreground border-b border-border">
                <tr>
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Customer</th>
                  <th className="px-4 py-3 font-medium">Method</th>
                  <th className="px-4 py-3 font-medium text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {customerPayments.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                      No inbound payments recorded.
                    </td>
                  </tr>
                ) : (
                  customerPayments.map((payment) => (
                    <tr key={payment.id} className="hover:bg-muted/20 transition-colors text-foreground">
                      <td className="px-4 py-3 whitespace-nowrap text-xs">
                        {new Date(payment.paidAt || payment.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 font-medium">
                        {payment.customer?.name || "Walk-in"}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-muted text-muted-foreground">
                          {payment.method}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-bold text-green-600 dark:text-green-500 text-right">
                        + Rs. {Number(payment.amount).toFixed(2)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* RIGHT COLUMN: CASH OUT (Suppliers) */}
        <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden flex flex-col">
          <div className="p-4 border-b border-border bg-destructive/10 flex items-center gap-2">
            <ArrowUpRight className="h-5 w-5 text-destructive" />
            <h3 className="font-bold text-destructive">Cash Out (To Suppliers)</h3>
          </div>
          
          <div className="overflow-x-auto flex-1">
            <table className="w-full text-sm text-left">
              <thead className="bg-muted/50 text-muted-foreground border-b border-border">
                <tr>
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Supplier</th>
                  <th className="px-4 py-3 font-medium">Method</th>
                  <th className="px-4 py-3 font-medium text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {supplierPayments.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                      No outbound payments recorded.
                    </td>
                  </tr>
                ) : (
                  supplierPayments.map((payment) => (
                    <tr key={payment.id} className="hover:bg-muted/20 transition-colors text-foreground">
                      <td className="px-4 py-3 whitespace-nowrap text-xs">
                        {new Date(payment.paidAt || payment.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 font-medium">
                        {payment.supplier?.name || "Unknown"}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-muted text-muted-foreground">
                          {payment.method}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-bold text-destructive text-right">
                        - Rs. {Number(payment.amount).toFixed(2)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
}