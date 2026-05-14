import { NextResponse } from "next/server";
import { getSession, type SessionUser } from "./auth";
import { bypassTenantScope, setCurrentTenant } from "./tenant-context";
import { prisma } from "./prisma";

type Role = "SUPER_ADMIN" | "ADMIN" | "DOCTOR" | "RECEPTIONIST" | "BILLING" | "CALL_CENTER" | "ASSISTANT";

const ROLE_HIERARCHY: Record<Role, number> = {
  SUPER_ADMIN: 100,
  ADMIN: 90,
  DOCTOR: 50,
  RECEPTIONIST: 40,
  BILLING: 40,
  CALL_CENTER: 30,
  ASSISTANT: 20,
};

interface AuthResult {
  user: SessionUser;
  response?: never;
}

interface AuthError {
  user?: never;
  response: NextResponse;
}

type AuthCheck = AuthResult | AuthError;

export async function requireAuth(options?: {
  roles?: Role[];
  minRole?: Role;
}): Promise<AuthCheck> {
  const session = await getSession();

  if (!session?.user) {
    return {
      response: NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      ),
    };
  }

  const userRole = session.user.role as Role;

  if (options?.roles && !options.roles.includes(userRole)) {
    return {
      response: NextResponse.json(
        { success: false, error: "Forbidden" },
        { status: 403 }
      ),
    };
  }

  if (options?.minRole) {
    const userLevel = ROLE_HIERARCHY[userRole] ?? 0;
    const requiredLevel = ROLE_HIERARCHY[options.minRole] ?? 0;
    if (userLevel < requiredLevel) {
      return {
        response: NextResponse.json(
          { success: false, error: "Forbidden" },
          { status: 403 }
        ),
      };
    }
  }

  // Seed the per-request tenant context so the Prisma extension in
  // src/lib/prisma.ts can auto-scope queries. Prefer the tenantId baked
  // into the JWT session (new logins); fall back to a DB lookup for
  // older sessions that don't carry the field yet.
  if (typeof session.user.tenantId !== "undefined") {
    setCurrentTenant(session.user.tenantId ?? null);
  } else {
    try {
      const row = await bypassTenantScope(() =>
        prisma.user.findUnique({
          where: { id: session.user.id },
          select: { tenantId: true },
        })
      );
      setCurrentTenant(row?.tenantId ?? null);
    } catch {
      setCurrentTenant(null);
    }
  }

  return { user: session.user };
}

export function isAdmin(user: SessionUser): boolean {
  return user.role === "SUPER_ADMIN" || user.role === "ADMIN";
}
