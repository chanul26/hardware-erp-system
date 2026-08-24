import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

/**
 * Coarse access gate.
 *
 * This is the first of two layers. Every API route independently calls
 * `requireAuth` / `requireRole` from `@/lib/authz`, so a mistake in the matcher
 * below cannot expose an endpoint on its own. Previously the matcher listed
 * only page routes and most handlers had no check at all, which left eleven
 * endpoints reachable without any session.
 */

type Role = "ADMIN" | "MANAGER" | "CASHIER";

/** Longest-prefix wins, so ordering here does not matter. */
const PAGE_ACCESS: Array<{ prefix: string; roles: Role[] }> = [
  { prefix: "/dashboard", roles: ["ADMIN"] },
  { prefix: "/users", roles: ["ADMIN"] },
  { prefix: "/reports", roles: ["ADMIN"] },
  { prefix: "/inventory", roles: ["ADMIN", "MANAGER"] },
  { prefix: "/purchase-orders", roles: ["ADMIN", "MANAGER"] },
  { prefix: "/suppliers", roles: ["ADMIN", "MANAGER"] },
  { prefix: "/payments", roles: ["ADMIN", "MANAGER"] },
  { prefix: "/mixing-history", roles: ["ADMIN", "MANAGER"] },
  { prefix: "/billing", roles: ["ADMIN", "MANAGER", "CASHIER"] },
  { prefix: "/customers", roles: ["ADMIN", "MANAGER", "CASHIER"] },
];

/** Where each role lands when it has nowhere better to go. */
const HOME_FOR: Record<Role, string> = {
  ADMIN: "/dashboard",
  MANAGER: "/inventory",
  CASHIER: "/billing",
};

export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token;
    const role = token?.role as Role | undefined;
    const path = req.nextUrl.pathname;

    // API: answer with JSON, never an HTML redirect, so fetch callers can
    // distinguish "signed out" from "server error".
    if (path.startsWith("/api")) {
      if (!token) {
        return NextResponse.json(
          { success: false, error: "You must be signed in." },
          { status: 401 }
        );
      }
      // Per-route role rules live in the handlers, which know the method.
      return NextResponse.next();
    }

    // Root: send a signed-in user to their home screen.
    if (path === "/") {
      return token && role
        ? NextResponse.redirect(new URL(HOME_FOR[role] ?? "/billing", req.url))
        : NextResponse.next();
    }

    if (!role) {
      return NextResponse.redirect(new URL("/", req.url));
    }

    const rule = PAGE_ACCESS.filter((entry) => path.startsWith(entry.prefix)).sort(
      (a, b) => b.prefix.length - a.prefix.length
    )[0];

    if (rule && !rule.roles.includes(role)) {
      return NextResponse.redirect(new URL(HOME_FOR[role] ?? "/billing", req.url));
    }

    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ req, token }) => {
        const path = req.nextUrl.pathname;
        // The login page is public, and API routes are handled above so they
        // can return JSON instead of being redirected.
        if (path === "/" || path.startsWith("/api")) return true;
        return !!token;
      },
    },
  }
);

export const config = {
  matcher: [
    "/dashboard/:path*", 
    "/users/:path*", 
    "/reports/:path*", 
    "/inventory/:path*", 
    "/purchase-orders/:path*", 
    "/suppliers/:path*", 
    "/payments/:path*", 
    "/customers/:path*",
    "/billing/:path*",
    "/warranty/:path*",
    "/"
    /**
     * Everything except Next internals, static assets, the NextAuth endpoints
     * and the health probe. Written as an exclusion so a new page or API route
     * is protected by default rather than only when someone remembers to add it.
     */
    "/((?!api/auth|api/health|_next/static|_next/image|favicon.ico|fonts/).*)",
  ],
};
