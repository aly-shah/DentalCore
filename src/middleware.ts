import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

const SECRET = new TextEncoder().encode(process.env.AUTH_SECRET || "");
const COOKIE_NAME = "dentacore-session";

// Public paths bypass the JWT session middleware. /api/cron/reminders
// has its own CRON_SECRET-based auth (header / query / Bearer); the
// middleware must NOT intercept it or the cron caller can never reach
// the route handler.
const publicPaths = [
  "/login",
  "/signup",
  "/api/auth/login",
  "/api/auth/signup",
  "/portal",
  "/api/app/session",
  "/api/health",
  "/api/cron/reminders",
  "/doctor-app",
];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public paths and static files
  if (
    publicPaths.some((p) => pathname.startsWith(p)) ||
    pathname.startsWith("/_next") ||
    pathname === "/api/auth/login" ||
    pathname === "/api/auth/signup" ||
    pathname === "/favicon.ico" ||
    pathname.endsWith(".apk") ||
    pathname.startsWith("/sw.js") ||
    pathname.startsWith("/manifest")
  ) {
    return NextResponse.next();
  }

  // Check session cookie
  const token = request.cookies.get(COOKIE_NAME)?.value;

  if (!token) {
    // Redirect to login for page requests, 401 for API
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }

  try {
    await jwtVerify(token, SECRET);

    // If authenticated user hits login/signup, redirect to dashboard
    if (pathname === "/login" || pathname === "/signup") {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }

    return NextResponse.next();
  } catch {
    // Invalid token — clear and redirect
    const response = pathname.startsWith("/api/")
      ? NextResponse.json({ success: false, error: "Session expired" }, { status: 401 })
      : NextResponse.redirect(new URL("/login", request.url));

    response.cookies.delete(COOKIE_NAME);
    return response;
  }
}

export const config = {
  matcher: [
    // Match all paths except static files and public assets
    "/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.json|.*\\.apk|.*\\.png|.*\\.ico).*)",
  ],
};
