/**
 * @system DentaCore ERP — Incoming Call Event API
 * @route POST /api/calls/incoming — Mobile app reports incoming call
 * @route GET /api/calls/incoming — Poll for latest incoming call (desktop dashboard)
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

import { requireAuth } from "@/lib/require-auth";
import { logger } from "@/lib/logger";
// In-memory store for live calls (in production, use Redis)
const liveCallStore: Map<string, {
  phone: string;
  agentId: string;
  branchId?: string;
  state: "ringing" | "answered" | "ended" | "missed";
  timestamp: number;
  matchResult?: Record<string, unknown>;
}> = new Map();

export async function POST(request: Request) {
  try {
    const auth = await requireAuth();
    if (auth.response) return auth.response;

    const body = await request.json();
    const { phone, agentId, branchId, state } = body;

    if (!phone || !agentId) {
      return NextResponse.json({ success: false, error: "Missing: phone, agentId" }, { status: 400 });
    }

    // Store live call state
    liveCallStore.set(agentId, {
      phone, agentId, branchId, state: state || "ringing", timestamp: Date.now(),
    });

    // Auto-match caller
    const matchRes = await fetch(`${request.url.split("/api/")[0]}/api/calls/match?phone=${encodeURIComponent(phone)}`);
    const matchData = await matchRes.json();

    if (matchData.success) {
      const entry = liveCallStore.get(agentId);
      if (entry) entry.matchResult = matchData.data;
    }

    // If call ended or missed, log it
    if (state === "ended" || state === "missed") {
      const match = matchData?.data;
      await prisma.callLog.create({
        data: {
          leadId: match?.lead?.id || null,
          patientId: match?.patient?.id || null,
          userId: agentId,
          callerName: match?.patient
            ? `${match.patient.firstName ?? ""} ${match.patient.lastName ?? ""}`.trim() || "Unknown"
            : match?.lead?.name ?? "Unknown",
          type: "INBOUND",
          duration: body.duration ?? 0,
          notes: state === "missed" ? "Missed call" : body.notes ?? null,
          outcome: state === "missed" ? "NO_ANSWER" : body.outcome || "INFO_PROVIDED",
        },
      });

      // Clean up after a delay
      setTimeout(() => liveCallStore.delete(agentId), 30000);
    }

    return NextResponse.json({
      success: true,
      data: {
        state: state || "ringing",
        match: matchData?.data || null,
      },
    });
  } catch (error) {
    logger.api("POST", "/api/calls/incoming", error);
    return NextResponse.json({ success: false, error: "Failed" }, { status: 500 });
  }
}

// Desktop dashboard polls this to get live call state
export async function GET(request: Request) {
  try {
    const auth = await requireAuth();
    if (auth.response) return auth.response;

    const { searchParams } = new URL(request.url);
    const agentId = searchParams.get("agentId");

    if (!agentId) {
      // Return all active calls for supervisors
      const calls = Array.from(liveCallStore.values())
        .filter((c) => Date.now() - c.timestamp < 120000) // Last 2 min
        .sort((a, b) => b.timestamp - a.timestamp);
      return NextResponse.json({ success: true, data: calls });
    }

    const call = liveCallStore.get(agentId);
    if (!call || Date.now() - call.timestamp > 120000) {
      return NextResponse.json({ success: true, data: null });
    }

    return NextResponse.json({ success: true, data: call });
  } catch (error) {
    logger.api("GET", "/api/calls/incoming", error);
    return NextResponse.json({ success: false, error: "Failed" }, { status: 500 });
  }
}
