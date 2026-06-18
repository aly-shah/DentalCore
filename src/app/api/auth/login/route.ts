import { NextResponse } from "next/server";
import { authenticate, createToken } from "@/lib/auth";
import { loginSchema, validate } from "@/lib/validations";
import { logger } from "@/lib/logger";

const COOKIE_NAME = "dentacore-session";
const SESSION_DURATION = 60 * 60 * 24 * 7; // 7 days

export async function POST(request: Request) {
  try {
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
