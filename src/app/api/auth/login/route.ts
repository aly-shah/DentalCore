import { NextResponse } from "next/server";
import { authenticate, createToken } from "@/lib/auth";
import { loginSchema, validate } from "@/lib/validations";
import { logger } from "@/lib/logger";
import { rateLimit, resetRateLimit } from "@/lib/redis";

const COOKIE_NAME = "dentacore-session";
const SESSION_DURATION = 60 * 60 * 24 * 7; // 7 days

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const RETRY_AFTER_SECONDS = Math.floor(WINDOW_MS / 1000);

function getClientIP(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

export async function POST(request: Request) {
  try {
    const ip = getClientIP(request);
    const limit = await rateLimit(`login:ip:${ip}`, MAX_ATTEMPTS, WINDOW_MS);
    if (!limit.allowed) {
      const retryAfter = Math.ceil(limit.resetMs / 1000) || RETRY_AFTER_SECONDS;
      return NextResponse.json(
        { success: false, error: "Too many login attempts. Try again later." },
        { status: 429, headers: { "Retry-After": String(retryAfter) } }
      );
    }

    const body = await request.json();
    const v = validate(loginSchema, body);
    if (!v.success) {
      return NextResponse.json({ success: false, error: v.error }, { status: 400 });
    }

    const user = await authenticate(v.data.email, v.data.password);

    if (!user) {
      return NextResponse.json(
        { success: false, error: "Invalid email or password" },
        { status: 401 }
      );
    }

    // Clear rate limit on success
    await resetRateLimit(`login:ip:${ip}`);

    const token = await createToken(user);
    const response = NextResponse.json({ success: true, data: { user } });

    response.cookies.set(COOKIE_NAME, token, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: SESSION_DURATION,
      path: "/",
    });

    return response;
  } catch (error) {
    logger.error("Login failed", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
