import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

export default withAuth(
  function middleware(req) {
    // Cast token to 'any' to bypass strict TS checking for our custom role property
    const token = req.nextauth.token as any;
    const role = token?.role;
    const path = req.nextUrl.pathname;

    // 1. If already logged in and trying to access the login page:
    if (path.startsWith("/login")) {
      if (role === "ADMIN") return NextResponse.redirect(new URL("/dashboard", req.url));
      return NextResponse.redirect(new URL("/billing", req.url));
    }

    // 2. Protect Admin-Only Routes
    const isAdminRoute = path === "/dashboard" || path.startsWith("/users");
    
    if (isAdminRoute && role !== "ADMIN") {
      // Kick cashiers and managers to the billing page
      return NextResponse.redirect(new URL("/billing", req.url));
    }

    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ req, token }) => {
        // Always allow the login page to render
        if (req.nextUrl.pathname.startsWith("/login")) return true;
        // Require a valid token for all other matched routes
        return !!token;
      },
    },
  }
);

// Apply this middleware to these specific routes
export const config = {
  matcher: ["/dashboard/:path*", "/users/:path*", "/billing/:path*", "/login"],
};