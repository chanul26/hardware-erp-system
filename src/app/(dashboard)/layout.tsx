import Link from "next/link";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import {
  Settings,
  Hammer,
} from "lucide-react";
import { LogoutButton } from "@/components/auth/logout-button";
import NavLinks from "@/components/nav/NavLinks";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // 1. Securely fetch the session on the server
  const session = await getServerSession(authOptions);
  const role = (session?.user?.role || "CASHIER") as "ADMIN" | "MANAGER" | "CASHIER";

  return (
    <div className="flex min-h-screen bg-background">
      {/* ── Sidebar (Hidden on Print) ── */}
      <aside className="fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-border bg-gray-300 shadow-sm print:hidden">
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

        {/* Nav — NavLinks is a client component so it can use usePathname() */}
        <nav className="flex-1 overflow-y-auto bg-orange-100 py-4 px-3">
          <NavLinks role={role} />
        </nav>

        {/* Bottom actions — Settings (Admin only) + Sign Out */}
        <div className="border-t border-border p-3 space-y-1">
          {role === "ADMIN" && (
            <Link
              href="/settings"
              className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-gray-400 hover:text-accent-foreground"
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
        <header className="sticky top-0 z-40 flex h-16 items-center border-b border-border bg-orange-100 backdrop-blur px-6 print:hidden">
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
        <main className="flex-1 p-6 print:p-0 bg-gray-50">{children}</main>
      </div>
    </div>
  );
}