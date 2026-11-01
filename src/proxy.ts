import { NextResponse, type NextRequest } from "next/server";
import { isAdminRequest } from "@/lib/admin/auth";

/**
 * Gate for the admin area. `/admin/**` (except the login page) redirects to
 * `/admin/login` without a valid session; `/api/admin/**` answers 401. This is
 * the optimistic check; every page, action, and route re-verifies on its own.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname === "/admin/login") return NextResponse.next();
  if (isAdminRequest(request)) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const login = new URL("/admin/login", request.url);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};
