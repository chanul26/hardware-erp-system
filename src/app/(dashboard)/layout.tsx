"use client";

import Link from "next/link";
import { useState } from "react";

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
  ChevronDown,
  ChevronRight,
} from "lucide-react";

import { LogoutButton } from "@/components/auth/logout-button";

const allNavItems = [
  {
    label: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
  },

  {
    label: "Inventory",
    href: "/inventory",
    icon: Package,
  },

  {
    label: "Billing",
    href: "/billing",
    icon: Receipt,
  },

  {
    label: "Customers",
    href: "/customers",
    icon: Users,
  },

  {
    label: "Suppliers",
    href: "/suppliers",
    icon: Truck,
  },

  {
    label: "Purchase Orders",
    href: "/purchase-orders",
    icon: ShoppingCart,
  },

  {
    label: "Payments",
    href: "/payments",
    icon: CreditCard,
  },

  // REPORTS
  {
    label: "Reports Dashboard",
    href: "/reports",
    icon: BarChart3,
  },

  {
    label: "Staff Management",
    href: "/users",
    icon: Shield,
  },
];

// REPORT SUB MENUS

const reportSubItems = [
  {
    label: "Supplier Stock Report",
    href: "/reports/supplier-stock",
  },

  {
    label: "Low Stock Report",
    href: "/reports/low-stock",
  },

  {
    label: "Top Debtors Report",
    href: "/reports/debtors",
  },

  {
    label: "Supplier Cheque Report",
    href: "/reports/cheques",
  },

  {
    label: "Daily Bills Report",
    href: "/reports/daily-bills",
  },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // TEMP ROLE

  const role = "ADMIN";

  const [showReports, setShowReports] =
    useState(false);

  // ROLE FILTER

  const navItems = allNavItems.filter((item) => {
    if (role === "ADMIN") return true;

    if (role === "MANAGER") {
      return ![
        "Dashboard",
        "Reports Dashboard",
        "Staff Management",
      ].includes(item.label);
    }

    if (role === "CASHIER") {
      return ["Billing", "Customers"].includes(
        item.label
      );
    }

    return false;
  });

  return (
    <div className="flex min-h-screen bg-background">
      {/* SIDEBAR */}

      <aside className="fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-border bg-card shadow-sm print:hidden">
        {/* LOGO */}

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

        {/* NAVIGATION */}

        <nav className="flex-1 overflow-y-auto py-4 px-3">
          <ul className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;

              // REPORT DROPDOWN

              if (
                item.label ===
                "Reports Dashboard"
              ) {
                return (
                  <li key={item.href}>
                    <div className="flex items-center justify-between rounded-md hover:bg-accent hover:text-accent-foreground">
                      
                      {/* REPORT PAGE LINK */}

                      <Link
                        href={item.href}
                        className="flex flex-1 items-center gap-3 px-3 py-2 text-sm font-medium text-muted-foreground"
                      >
                        <Icon className="h-4 w-4 shrink-0" />

                        {item.label}
                      </Link>

                      {/* DROPDOWN BUTTON */}

                      <button
                        onClick={() =>
                          setShowReports(
                            !showReports
                          )
                        }
                        className="px-3 text-muted-foreground"
                      >
                        {showReports ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </button>
                    </div>

                    {/* SUB MENUS */}

                    {showReports && (
                      <ul className="mt-1 ml-6 space-y-1">
                        {reportSubItems.map(
                          (subItem) => (
                            <li
                              key={
                                subItem.href
                              }
                            >
                              <Link
                                href={
                                  subItem.href
                                }
                                className="block rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                              >
                                {
                                  subItem.label
                                }
                              </Link>
                            </li>
                          )
                        )}
                      </ul>
                    )}
                  </li>
                );
              }

              // NORMAL MENU

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

        {/* BOTTOM */}

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

      {/* MAIN */}

      <div className="flex flex-1 flex-col pl-64 print:pl-0">
        {/* HEADER */}

        <header className="sticky top-0 z-40 flex h-16 items-center border-b border-border bg-background/95 backdrop-blur px-6 print:hidden">
          <h1 className="text-lg font-semibold text-foreground">
            Hardware ERP
          </h1>

          <div className="ml-auto flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
              {role.charAt(0)}
            </div>
          </div>
        </header>

        {/* PAGE */}

        <main className="flex-1 p-6 print:p-0 bg-white">
          {children}
        </main>
      </div>
    </div>
  );
}