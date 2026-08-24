"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Package,
  Users,
  Truck,
  Receipt,
  ShoppingCart,
  CreditCard,
  BarChart3,
  Shield,
  ShieldCheck,
  PiggyBank,
} from "lucide-react";

const allNavItems = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Inventory", href: "/inventory", icon: Package },
  { label: "Billing", href: "/billing", icon: Receipt },
  { label: "Customers", href: "/customers", icon: Users },
  { label: "Warranty", href: "/warranty", icon: ShieldCheck },
  { label: "Suppliers", href: "/suppliers", icon: Truck },
  { label: "Purchase Orders", href: "/purchase-orders", icon: ShoppingCart },
  { label: "Payments", href: "/payments", icon: CreditCard },
  { label: "Money", href: "/money", icon: PiggyBank },
  { label: "Reports", href: "/reports", icon: BarChart3 },
  { label: "Staff Management", href: "/users", icon: Shield },
];

type Role = "ADMIN" | "MANAGER" | "CASHIER";

export default function NavLinks({ role }: { role: Role }) {
  const pathname = usePathname();

  const navItems = allNavItems.filter((item) => {
    if (role === "ADMIN") return true;
    if (role === "MANAGER")
      // Money is the owner's own books, so it stays off the manager's sidebar
      // as well as behind the ADMIN check on the page itself.
      return !["Dashboard", "Reports", "Staff Management", "Money"].includes(
        item.label
      );
    if (role === "CASHIER")
      return ["Billing", "Customers", "Warranty"].includes(item.label);
    return false;
  });

  return (
    <ul className="space-y-1">
      {navItems.map((item) => {
        const Icon = item.icon;
        const isActive = pathname === item.href || pathname.startsWith(item.href + "/");

        return (
          <li key={item.href}>
            <Link
              href={item.href}
              className={`
                group flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-all duration-50
                ${
                  isActive
                    ? "bg-blue-500 text-gray-100 shadow-sm"
                    : "text-muted-foreground hover:bg-red-300 hover:text-blue-900"
                }
              `}
            >
              <Icon
                className={`h-4 w-4 shrink-0 transition-colors ${
                  isActive ? "text-gray" : "text-muted-foreground group-hover:text-blue-900"
                }`}
              />
              <span>{item.label}</span>

              {/* Active indicator dot on the right */}
              {isActive && (
                <span className="ml-auto h-1.5 w-1.5 rounded-full bg-primary-foreground opacity-220" />
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}