/**
 * AI-powered treatment suggestion service.
 *
 * Given a patient's diagnosis (+ optional tooth FDI and clinical context),
 * returns ranked treatment options. Every call is logged in
 * AISuggestionLog with full provenance (model version, prompt, raw
 * response, latency, cost, status) so each clinical artifact derived
 * from AI is medically defensible.
 */
import crypto from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { getOpenAI, priceCents } from "./openai";

const SUBSYSTEM = "treatment-suggestion";
const MODEL_NAME = "treatment-suggestion";
const MODEL_ID = "gpt-4o-mini";
const PROMPT_VERSION = "v1";

const SYSTEM_PROMPT = `You are a dental treatment planning assistant. The user is a licensed dentist using a clinical software. Given a diagnosis and optional clinical context, propose 2-5 ranked dental treatment options.

Strict rules:
- You must NEVER make a diagnosis or override the dentist. You only PROPOSE options for the dentist to accept or reject.
- Use standard dental terminology and, where possible, CDT codes (e.g., D2740 for porcelain crown). If a CDT code is uncertain, omit it.
- Each option must include: rationale (1-2 short sentences), CDT code if applicable, estimated visit count, urgency (ROUTINE / URGENT / EMERGENCY).
- Output strict JSON only. No prose outside the JSON.
- The output schema is:
  { "suggestions": [ { "treatment": string, "cdtCode": string | null, "rationale": string, "estimatedVisits": number, "urgency": "ROUTINE" | "URGENT" | "EMERGENCY", "confidence": number } ] }
- "confidence" is your self-assessed confidence in this option being clinically appropriate, 0..1.`;

export interface TreatmentSuggestionInput {
  diagnosis: string;
  toothFdi?: number;
  chiefComplaint?: string;
  medicalHistory?: string[];
  allergies?: string[];
  patientAge?: number;
}

export interface TreatmentSuggestion {
  treatment: string;
  cdtCode: string | null;
  rationale: string;
  estimatedVisits: number;
  urgency: "ROUTINE" | "URGENT" | "EMERGENCY";
  confidence: number;
}

export interface TreatmentSuggestionResult {
  suggestionLogId: string;
  suggestions: TreatmentSuggestion[];
  modelId: string;
  costCents: number;
  latencyMs: number;
}

/**
 * Look up or create the active AIModelVersion row for this subsystem.
 */
async function ensureModelVersion() {
  const existing = await prisma.aIModelVersion.findFirst({
    where: { name: MODEL_NAME, modelId: MODEL_ID, promptVersion: PROMPT_VERSION },
  });
  if (existing) return existing;
  return prisma.aIModelVersion.create({
    data: {
      name: MODEL_NAME,
      provider: "openai",
      modelId: MODEL_ID,
      promptVersion: PROMPT_VERSION,
      systemPrompt: SYSTEM_PROMPT,
      temperature: 0.3,
      maxTokens: 800,
      isActive: true,
    },
  });
}

function hashInput(obj: unknown): string {
  return crypto.createHash("sha256").update(JSON.stringify(obj)).digest("hex");
}

export async function suggestTreatments(
  input: TreatmentSuggestionInput,
  context: { tenantId?: string | null; patientId?: string | null; doctorId?: string | null; appointmentId?: string | null }
): Promise<TreatmentSuggestionResult> {
  const openai = getOpenAI();
  const modelVersion = await ensureModelVersion();
  const inputHash = hashInput(input);
  const started = Date.now();

  // Build a fresh suggestion log row in PROPOSED state — we mutate it as
  // we get a response (or an error).
  const log = await prisma.aISuggestionLog.create({
    data: {
      tenantId: context.tenantId ?? null,
      patientId: context.patientId ?? null,
      doctorId: context.doctorId ?? null,
      appointmentId: context.appointmentId ?? null,
      modelVersionId: modelVersion.id,
      subsystem: SUBSYSTEM,
      inputSnapshot: input as unknown as Prisma.InputJsonValue,
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
    const userMessage = JSON.stringify(input);
    const completion = await openai.chat.completions.create({
      model: MODEL_ID,
      temperature: modelVersion.temperature ?? 0.3,
      max_tokens: modelVersion.maxTokens ?? 800,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userMessage },
      ],
    });

    const latency = Date.now() - started;
    const raw = completion.choices[0]?.message?.content ?? "{}";
    const usage = completion.usage;
    const cost = usage ? priceCents(MODEL_ID, usage.prompt_tokens, usage.completion_tokens) : 0;

    let parsed: { suggestions?: TreatmentSuggestion[] } = {};
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error("OpenAI returned non-JSON despite response_format=json_object");
    }

    const suggestions = Array.isArray(parsed.suggestions) ? parsed.suggestions : [];
    const avgConfidence = suggestions.length
      ? suggestions.reduce((s, x) => s + (x.confidence ?? 0), 0) / suggestions.length
      : 0;

    await prisma.aISuggestionLog.update({
      where: { id: log.id },
      data: {
        rawResponse: completion as unknown as Prisma.InputJsonValue,
        parsedResponse: parsed as unknown as Prisma.InputJsonValue,
        confidence: avgConfidence,
        latencyMs: latency,
        costCents: cost,
        promptTokens: usage?.prompt_tokens ?? null,
        completionTokens: usage?.completion_tokens ?? null,
      },
    });

    return {
      suggestionLogId: log.id,
      suggestions,
      modelId: MODEL_ID,
      costCents: cost,
      latencyMs: latency,
    };
  } catch (err) {
    await prisma.aISuggestionLog.update({
      where: { id: log.id },
      data: {
        status: "ERRORED",
        errorMessage: err instanceof Error ? err.message : String(err),
        latencyMs: Date.now() - started,
      },
    });
    logger.error("AI treatment suggestion failed", err);
    throw err;
  }
}
