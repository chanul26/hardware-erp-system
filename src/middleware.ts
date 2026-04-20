import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token;
    const role = token?.role;
    const path = req.nextUrl.pathname;

    // 1. If already logged in and trying to access the root login page:
    if (path === "/") {
      if (role === "ADMIN") return NextResponse.redirect(new URL("/dashboard", req.url));
      return NextResponse.redirect(new URL("/billing", req.url));
    }

    // 2. Protect Admin-Only Routes
    const isAdminRoute = path === "/dashboard" || path.startsWith("/users");
    
    if (isAdminRoute && role !== "ADMIN") {
      return NextResponse.redirect(new URL("/billing", req.url));
    }

    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ req, token }) => {
        // Always allow the root (login) page to render
        if (req.nextUrl.pathname === "/") return true;
        return !!token;
      },
    },
  }
);

export const config = {
  matcher: ["/dashboard/:path*", "/users/:path*", "/billing/:path*", "/"],
};