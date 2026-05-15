/**
 * AI-drafted reply for patient WhatsApp / SMS conversations.
 *
 * Given a recent message history, returns a single short suggested
 * reply in the clinic's voice. Logged in AISuggestionLog for provenance
 * (same widget as other AI features can score the draft).
 */
import crypto from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { getOpenAI, priceCents } from "./openai";

const SUBSYSTEM = "draft-reply";
const MODEL_NAME = "draft-reply";
const MODEL_ID = "gpt-4o-mini";
const PROMPT_VERSION = "v1";

const SYSTEM_PROMPT = `You draft a single short reply on behalf of a dental clinic's front desk responding to a patient's WhatsApp or SMS message.

Rules:
- Write ONE reply, 1–3 sentences, ≤ 280 chars.
- Match the patient's language (English / Spanish / Arabic / etc.) — if unsure, use English.
- Tone: warm, professional, concise. Use the patient's first name once.
- Never invent appointments, prices, prescriptions, or clinical facts the history doesn't show.
- If a question requires the doctor or a precise quote, suggest "I'll check with the doctor and get back to you shortly."
- If the patient asks to confirm or cancel an appointment, acknowledge and ask for date/time when not obvious.
- Output strict JSON. No prose outside the JSON.
- Schema: { "reply": string, "confidence": "LOW" | "MEDIUM" | "HIGH", "intent": "CONFIRMATION" | "RESCHEDULE" | "QUESTION" | "PAYMENT" | "GENERAL" }`;

export interface DraftReplyResult {
  suggestionLogId: string;
  reply: string;
  confidence: "LOW" | "MEDIUM" | "HIGH";
  intent: "CONFIRMATION" | "RESCHEDULE" | "QUESTION" | "PAYMENT" | "GENERAL";
  modelId: string;
  costCents: number;
  latencyMs: number;
}

async function ensureModelVersion() {
  return prisma.aIModelVersion.upsert({
    where: {
      name_modelId_promptVersion: {
        name: MODEL_NAME,
        modelId: MODEL_ID,
        promptVersion: PROMPT_VERSION,
      },
    },
    create: {
      name: MODEL_NAME,
      provider: "openai",
      modelId: MODEL_ID,
      promptVersion: PROMPT_VERSION,
      systemPrompt: SYSTEM_PROMPT,
      temperature: 0.4,
      maxTokens: 200,
      isActive: true,
    },
    update: {},
  });
}

function hashInput(obj: unknown): string {
  return crypto.createHash("sha256").update(JSON.stringify(obj)).digest("hex");
}

async function buildSnapshot(patientId: string) {
  const patient = await prisma.patient.findUnique({
    where: { id: patientId },
    select: { id: true, firstName: true, lastName: true, tenantId: true, nationality: true },
  });
  if (!patient) return null;

  const [recentMessages, upcomingAppt, openInvoice] = await Promise.all([
    prisma.communicationLog.findMany({
      where: { patientId, type: { in: ["WHATSAPP", "SMS"] } },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: { direction: true, content: true, createdAt: true, sentByName: true },
    }),
    prisma.appointment.findFirst({
      where: { patientId, date: { gte: new Date() }, status: { in: ["SCHEDULED", "CONFIRMED"] } },
      orderBy: { date: "asc" },
      select: { date: true, type: true, status: true, doctor: { select: { name: true } } },
    }),
    prisma.invoice.findFirst({
      where: { patientId, status: { in: ["PENDING", "PARTIAL", "OVERDUE"] } },
      orderBy: { dueDate: "asc" },
      select: { balanceDue: true, status: true, dueDate: true },
    }),
  ]);

  // Order ascending for the model (oldest → newest reads more naturally).
  const chronology = [...recentMessages].reverse();

  return {
    patient: {
      firstName: patient.firstName,
      nationality: patient.nationality ?? null,
    },
    upcomingAppointment: upcomingAppt
      ? {
          date: upcomingAppt.date.toISOString(),
          type: upcomingAppt.type,
          status: upcomingAppt.status,
          doctor: upcomingAppt.doctor?.name ?? null,
        }
      : null,
    openInvoice: openInvoice
      ? {
          balanceDue: openInvoice.balanceDue,
          status: openInvoice.status,
          dueDate: openInvoice.dueDate?.toISOString() ?? null,
        }
      : null,
    history: chronology.map((m) => ({
      from: m.direction === "INBOUND" ? "patient" : "clinic",
      text: m.content,
      at: m.createdAt.toISOString(),
    })),
  };
}

export async function draftReply(
  patientId: string,
  context: { tenantId?: string | null; doctorId?: string | null }
): Promise<DraftReplyResult> {
  const openai = getOpenAI();
  const modelVersion = await ensureModelVersion();
  const snapshot = await buildSnapshot(patientId);
  if (!snapshot) throw new Error("Patient not found");
  if (snapshot.history.length === 0) throw new Error("No message history to draft from");

  const inputHash = hashInput(snapshot);
  const started = Date.now();

  const log = await prisma.aISuggestionLog.create({
    data: {
      tenantId: context.tenantId ?? null,
      patientId,
      doctorId: context.doctorId ?? null,
      modelVersionId: modelVersion.id,
      subsystem: SUBSYSTEM,
      inputSnapshot: snapshot as unknown as Prisma.InputJsonValue,
      inputHash,
      status: "PROPOSED",
    },
  });

  if (!openai) {
    await prisma.aISuggestionLog.update({
      where: { id: log.id },
      data: { status: "ERRORED", errorMessage: "OPENAI_API_KEY not configured" },
    });
    throw new Error("AI not configured: set OPENAI_API_KEY");
  }

  try {
    const completion = await openai.chat.completions.create({
      model: MODEL_ID,
      temperature: modelVersion.temperature ?? 0.4,
      max_tokens: modelVersion.maxTokens ?? 200,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: JSON.stringify(snapshot) },
      ],
    });

    const latency = Date.now() - started;
    const raw = completion.choices[0]?.message?.content ?? "{}";
    const usage = completion.usage;
    const cost = usage ? priceCents(MODEL_ID, usage.prompt_tokens, usage.completion_tokens) : 0;

    let parsed: { reply?: string; confidence?: string; intent?: string } = {};
    try { parsed = JSON.parse(raw); } catch {
      throw new Error("OpenAI returned non-JSON despite response_format=json_object");
    }

    const reply = (parsed.reply ?? "").trim();
    if (!reply) throw new Error("AI returned an empty reply");
    const confidence = (["LOW", "MEDIUM", "HIGH"].includes(parsed.confidence ?? "")
      ? parsed.confidence
      : "MEDIUM") as DraftReplyResult["confidence"];
    const intent = (["CONFIRMATION", "RESCHEDULE", "QUESTION", "PAYMENT", "GENERAL"].includes(parsed.intent ?? "")
      ? parsed.intent
      : "GENERAL") as DraftReplyResult["intent"];

    await prisma.aISuggestionLog.update({
      where: { id: log.id },
      data: {
        rawResponse: completion as unknown as Prisma.InputJsonValue,
        parsedResponse: parsed as unknown as Prisma.InputJsonValue,
        latencyMs: latency,
        costCents: cost,
        promptTokens: usage?.prompt_tokens ?? null,
        completionTokens: usage?.completion_tokens ?? null,
      },
    });

    return { suggestionLogId: log.id, reply, confidence, intent, modelId: MODEL_ID, costCents: cost, latencyMs: latency };
  } catch (err) {
    await prisma.aISuggestionLog.update({
      where: { id: log.id },
      data: {
        status: "ERRORED",
        errorMessage: err instanceof Error ? err.message : String(err),
        latencyMs: Date.now() - started,
      },
    });
    logger.error("AI draft reply failed", err);
    throw err;
  }
}
