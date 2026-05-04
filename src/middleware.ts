import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token;
    const role = token?.role;
    const path = req.nextUrl.pathname;

    // 1. Root Login Page Routing
    if (path === "/") {
      if (token) {
        if (role === "ADMIN") return NextResponse.redirect(new URL("/dashboard", req.url));
        if (role === "MANAGER") return NextResponse.redirect(new URL("/inventory", req.url));
        return NextResponse.redirect(new URL("/billing", req.url)); // Cashiers
      }
      return NextResponse.next();
    }

    // 2. Define Route Hierarchies
    const isAdminRoute = path.startsWith("/dashboard") || path.startsWith("/users") || path.startsWith("/reports");
    const isManagerRoute = path.startsWith("/inventory") || path.startsWith("/purchase-orders") || path.startsWith("/suppliers") || path.startsWith("/payments");

    // 3. Admin-Only Interception
    if (isAdminRoute && role !== "ADMIN") {
      return NextResponse.redirect(new URL("/billing", req.url));
    }

    // 4. Manager & Admin Interception (Blocks Cashiers)
    if (isManagerRoute && role !== "ADMIN" && role !== "MANAGER") {
      return NextResponse.redirect(new URL("/billing", req.url));
    }

    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ req, token }) => {
        if (req.nextUrl.pathname === "/") return true;
        return !!token;
      },
    },
  }
);

// We MUST tell the middleware to watch all these paths
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
    "/"
  ],
};