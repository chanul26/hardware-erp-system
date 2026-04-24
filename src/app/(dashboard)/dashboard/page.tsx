import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import {
  Package,
  Users,
  Truck,
  DollarSign,
  TrendingUp,
  AlertTriangle,
  ShoppingCart,
  CreditCard,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Dashboard",
  description: "Hardware ERP system overview — sales, inventory, and key metrics.",
};

// Make sure Next.js doesn't cache this page forever. We want live data.
export const dynamic = "force-dynamic";

interface KpiCardProps {
  title: string;
  value: string | number;
  subtitle: string;
  icon: React.ElementType;
  trend?: string;
  trendUp?: boolean;
}

function KpiCard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  trendUp,
}: KpiCardProps) {
  return (
    <div className="rounded-xl border border-border bg-card p-6 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <p className="text-2xl font-bold text-foreground">{value}</p>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
        <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10">
          <Icon className="h-5 w-5 text-primary" />
        </div>
      </div>
      {trend && (
        <div className="mt-4 flex items-center gap-1">
          <TrendingUp
            className={`h-3.5 w-3.5 ${trendUp ? "text-green-500" : "text-destructive rotate-180"}`}
          />
          <span
            className={`text-xs font-medium ${trendUp ? "text-green-600" : "text-destructive"}`}
          >
            {trend}
          </span>
          <span className="text-xs text-muted-foreground">vs last month</span>
        </div>
      )}
    </div>
  );
}

export default async function DashboardPage() {
  // Execute all database queries concurrently for maximum performance
  const [
    revenueResult,
    itemCount,
    customerCount,
    supplierCount,
    lowStockCount,
    pendingBillsCount,
    recentBills
  ] = await Promise.all([
    prisma.bill.aggregate({
      _sum: { totalAmount: true },
      where: { status: "PAID" }, // Only count actual collected money
    }),
    prisma.item.count(),
    prisma.customer.count(),
    prisma.supplier.count(),
    prisma.item.count({
      where: { stockQty: { lte: 5 } }, // Alert on anything with 5 or less units
    }),
    prisma.bill.count({
      where: { status: "PENDING" }, // Bills that haven't been paid
    }),
    prisma.bill.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' },
      include: { customer: true }, // Join the customer table to get their name
    })
  ]);

  // Format the revenue safely
  const totalRevenue = revenueResult._sum.totalAmount 
    ? Number(revenueResult._sum.totalAmount) 
    : 0;

  const kpiData: KpiCardProps[] = [
    {
      title: "Total Revenue",
      value: `Rs. ${totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
      subtitle: "All-time paid invoices",
      icon: DollarSign,
      trend: "+12.5%",
      trendUp: true,
    },
    {
      title: "Inventory Items",
      value: itemCount,
      subtitle: "Total SKUs in stock",
      icon: Package,
      trend: "+4",
      trendUp: true,
    },
    {
      title: "Total Customers",
      value: customerCount,
      subtitle: "Registered customers",
      icon: Users,
    },
    {
      title: "Active Suppliers",
      value: supplierCount,
      subtitle: "Registered suppliers",
      icon: Truck,
    },
    {
      title: "Open Bills",
      value: pendingBillsCount,
      subtitle: "Pending / partially paid",
      icon: ShoppingCart,
    },
    {
      title: "Low Stock Alerts",
      value: lowStockCount,
      subtitle: "Items at or below 5 units",
      icon: AlertTriangle,
    }
  ];

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-foreground">
          Dashboard
        </h2>
        <p className="text-muted-foreground mt-1">
          Welcome back — here&apos;s your live business overview.
        </p>
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {kpiData.map((kpi) => (
          <KpiCard key={kpi.title} {...kpi} />
        ))}
      </div>

      {/* Recent Activity Section */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <h3 className="text-base font-semibold text-foreground mb-4">
            Recent Transactions
          </h3>
          {recentBills.length === 0 ? (
            <div className="flex h-40 items-center justify-center rounded-lg border border-dashed border-border">
              <p className="text-sm text-muted-foreground">
                No bills yet — create your first bill to get started.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {recentBills.map((bill) => (
                <div key={bill.id} className="flex items-center justify-between border-b border-border pb-4 last:border-0 last:pb-0">
                  <div>
                    <p className="text-sm font-medium text-foreground">{bill.billNumber}</p>
                    <p className="text-xs text-muted-foreground">
                      {bill.customer?.name || "Walk-in Customer"}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-primary">Rs. {Number(bill.totalAmount).toFixed(2)}</p>
                    <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-green-500/10 text-green-500">
                      {bill.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <h3 className="text-base font-semibold text-foreground mb-4">
            System Status
          </h3>
          <div className="space-y-4">
             <div className="flex items-center gap-3">
               <div className={`flex h-2 w-2 rounded-full ${lowStockCount > 0 ? 'bg-destructive' : 'bg-green-500'}`}></div>
               <p className="text-sm text-foreground">
                 {lowStockCount > 0 ? `${lowStockCount} items need restocking` : 'Inventory levels are healthy'}
               </p>
             </div>
             <div className="flex items-center gap-3">
               <div className="flex h-2 w-2 rounded-full bg-green-500"></div>
               <p className="text-sm text-foreground">Database connected successfully</p>
             </div>
          </div>
        </div>
      </div>
    </div>
  );
}