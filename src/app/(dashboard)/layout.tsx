import Link from "next/link";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import {
  LayoutDashboard,
  Package,
  Users,
  Truck,
  Receipt,
  ShoppingCart,
  CreditCard,
  BarChart3,
  Settings,
  Hammer,
  Shield,
} from "lucide-react";
import { LogoutButton } from "@/components/auth/logout-button";

const allNavItems = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Inventory", href: "/inventory", icon: Package },
  { label: "Billing", href: "/billing", icon: Receipt },
  { label: "Customers", href: "/customers", icon: Users },
  { label: "Suppliers", href: "/suppliers", icon: Truck },
  { label: "Purchase Orders", href: "/purchase-orders", icon: ShoppingCart },
  { label: "Payments", href: "/payments", icon: CreditCard },
  { label: "Reports", href: "/reports", icon: BarChart3 },
  { label: "Staff Management", href: "/users", icon: Shield },
];

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // 1. Securely fetch the session on the server
  const session = await getServerSession(authOptions);
  const role = session?.user?.role || "CASHIER";

  // 2. Filter the navigation items based on the strict RBAC hierarchy
  const navItems = allNavItems.filter((item) => {
    if (role === "ADMIN") return true; // Uncle gets everything
    
    if (role === "MANAGER") {
      // Managers get everything EXCEPT Dashboard, Reports, and Staff
      return !["Dashboard", "Reports", "Staff Management"].includes(item.label);
    }
    
    if (role === "CASHIER") {
      // Cashiers ONLY get Billing and Customers
      return ["Billing", "Customers"].includes(item.label);
    }
    
    return false;
  });

  return (
    <div className="flex min-h-screen bg-background">
      {/* ── Sidebar (Hidden on Print) ── */}
      <aside className="fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-border bg-card shadow-sm print:hidden">
        {/* Logo */}
        <div className="flex h-16 items-center gap-3 border-b border-border px-6">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
            <Hammer className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <p className="text-sm font-bold text-foreground leading-none">
              HardwareERP
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Management System
            </p>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-4 px-3">
          <ul className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="group flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Bottom actions */}
        <div className="border-t border-border p-3 space-y-1">
          {role === "ADMIN" && (
            <Link
              href="/settings"
              className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              <Settings className="h-4 w-4" />
              Settings
            </Link>
          )}
          <LogoutButton />
        </div>
      </aside>

      {/* ── Main content (Padding removed on Print) ── */}
      <div className="flex flex-1 flex-col pl-64 print:pl-0">
        {/* Top bar (Hidden on Print) */}
        <header className="sticky top-0 z-40 flex h-16 items-center border-b border-border bg-background/95 backdrop-blur px-6 print:hidden">
          <h1 className="text-lg font-semibold text-foreground">
            Hardware ERP
          </h1>
          <div className="ml-auto flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
              {role.charAt(0)} {/* Shows 'A' for Admin, 'M' for Manager, 'C' for Cashier */}
            </div>
          </div>
        </header>

        {/* Page content (Padding removed on Print) */}
        <main className="flex-1 p-6 print:p-0 bg-white">{children}</main>
      </div>
    </div>
  );
}