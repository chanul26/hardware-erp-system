import type { Metadata } from "next";
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

interface KpiCardProps {
  title: string;
  value: string;
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

const kpiData: KpiCardProps[] = [
  {
    title: "Total Revenue",
    value: "Rs. 0.00",
    subtitle: "This month's billing",
    icon: DollarSign,
    trend: "—",
    trendUp: true,
  },
  {
    title: "Inventory Items",
    value: "0",
    subtitle: "Total SKUs in stock",
    icon: Package,
    trend: "—",
    trendUp: true,
  },
  {
    title: "Total Customers",
    value: "0",
    subtitle: "Registered customers",
    icon: Users,
    trend: "—",
    trendUp: true,
  },
  {
    title: "Active Suppliers",
    value: "0",
    subtitle: "Registered suppliers",
    icon: Truck,
    trend: "—",
    trendUp: true,
  },
  {
    title: "Open Bills",
    value: "0",
    subtitle: "Pending / partially paid",
    icon: ShoppingCart,
  },
  {
    title: "Pending Cheques",
    value: "0",
    subtitle: "Awaiting clearance",
    icon: CreditCard,
  },
  {
    title: "Low Stock Alerts",
    value: "0",
    subtitle: "Items below reorder level",
    icon: AlertTriangle,
  },
  {
    title: "Purchase Orders",
    value: "0",
    subtitle: "Ordered / in transit",
    icon: ShoppingCart,
  },
];

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-foreground">
          Dashboard
        </h2>
        <p className="text-muted-foreground mt-1">
          Welcome back — here&apos;s your business overview.
        </p>
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpiData.map((kpi) => (
          <KpiCard key={kpi.title} {...kpi} />
        ))}
      </div>

      {/* Placeholder sections */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <h3 className="text-base font-semibold text-foreground mb-4">
            Recent Bills
          </h3>
          <div className="flex h-40 items-center justify-center rounded-lg border border-dashed border-border">
            <p className="text-sm text-muted-foreground">
              No bills yet — create your first bill to get started.
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <h3 className="text-base font-semibold text-foreground mb-4">
            Low Stock Items
          </h3>
          <div className="flex h-40 items-center justify-center rounded-lg border border-dashed border-border">
            <p className="text-sm text-muted-foreground">
              All inventory levels are healthy.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
