/**
 * AI-powered tooth-wise findings service.
 *
 * Takes a patient's dental chart (or a focused subset) and returns
 * per-tooth findings: likely diagnosis, recommended treatment, urgency,
 * confidence, and a short rationale. Every call is logged in
 * AISuggestionLog with full provenance.
 */
import crypto from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { getOpenAI, priceCents } from "./openai";

const SUBSYSTEM = "tooth-findings";
const MODEL_NAME = "tooth-findings";
const MODEL_ID = "gpt-4o-mini";
const PROMPT_VERSION = "v1";

const SYSTEM_PROMPT = `You are a dental charting assistant for a licensed dentist using clinical software. You receive a JSON snapshot of a patient's dental chart (an array of tooth records) and return tooth-by-tooth findings.

Strict rules:
- You must NEVER make a final diagnosis or override the dentist. You only propose findings for the dentist to accept or reject.
- Only return findings for teeth that have something to flag (a documented condition, abnormal status, surface lesion, planned treatment, etc.). Do NOT include findings for clearly HEALTHY teeth with no notes.
- Use standard dental terminology and FDI numbering. Where a CDT code is clearly indicated, include it; otherwise omit it (null).
- Output strict JSON only. No prose outside the JSON.
- The output schema is:
  { "findings": [ {
      "fdi": number,
      "diagnosis": string,
      "recommendedTreatment": string,
      "cdtCode": string | null,
      "urgency": "ROUTINE" | "URGENT" | "EMERGENCY",
      "confidence": number,
      "rationale": string,
      "estimatedVisits": number
  } ] }
- "confidence" is your self-assessed clinical appropriateness, 0..1.
- "rationale" is 1-2 short sentences explaining the finding from the chart data.
- Order findings by urgency (EMERGENCY first), then by FDI ascending.`;

export interface ToothInput {
  fdi: number;
  status?: string | null;
  conditions?: string | null;
  plannedTreatment?: string | null;
  completedTreatment?: string | null;
  surfaces?: Record<string, unknown> | null;
  notes?: string | null;
  priority?: string | null;
}

export interface ToothFindingsInput {
  teeth: ToothInput[];
  patientAge?: number;
  medicalHistory?: string[];
  allergies?: string[];
}

export interface ToothFinding {
  fdi: number;
  diagnosis: string;
  recommendedTreatment: string;
  cdtCode: string | null;
  urgency: "ROUTINE" | "URGENT" | "EMERGENCY";
  confidence: number;
  rationale: string;
  estimatedVisits: number;
}

export interface ToothFindingsResult {
  suggestionLogId: string;
  findings: ToothFinding[];
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
      temperature: 0.2,
      maxTokens: 1500,
      isActive: true,
    },
    update: {},
  });
}

function hashInput(obj: unknown): string {
  return crypto.createHash("sha256").update(JSON.stringify(obj)).digest("hex");
}

/**
 * Filter the chart down to teeth that are actually interesting. Sending
 * 32 HEALTHY teeth wastes tokens and gives the model noise.
 */
function relevantTeeth(teeth: ToothInput[]): ToothInput[] {
  return teeth.filter((t) => {
    if (t.status && t.status !== "HEALTHY") return true;
    if (t.conditions?.trim()) return true;
    if (t.plannedTreatment?.trim()) return true;
    if (t.notes?.trim()) return true;
    if (t.surfaces && Object.keys(t.surfaces).length > 0) return true;
    return false;
  });
}

export async function analyzeToothChart(
  input: ToothFindingsInput,
  context: { tenantId?: string | null; patientId?: string | null; doctorId?: string | null }
): Promise<ToothFindingsResult> {
  const openai = getOpenAI();
  const modelVersion = await ensureModelVersion();
  const focused = { ...input, teeth: relevantTeeth(input.teeth) };
  const inputHash = hashInput(focused);
  const started = Date.now();

  const log = await prisma.aISuggestionLog.create({
    data: {
      tenantId: context.tenantId ?? null,
      patientId: context.patientId ?? null,
      doctorId: context.doctorId ?? null,
      modelVersionId: modelVersion.id,
      subsystem: SUBSYSTEM,
      inputSnapshot: focused as unknown as Prisma.InputJsonValue,
      inputHash,
      status: "PROPOSED",
    },
  });

  if (focused.teeth.length === 0) {
    const latencyMs = Date.now() - started;
    await prisma.aISuggestionLog.update({
      where: { id: log.id },
      data: {
        parsedResponse: { findings: [] } as unknown as Prisma.InputJsonValue,
        confidence: 0,
        latencyMs,
        errorMessage: "no_relevant_teeth",
      },
    });
    return { suggestionLogId: log.id, findings: [], modelId: MODEL_ID, costCents: 0, latencyMs };
  }

  if (!openai) {
    await prisma.aISuggestionLog.update({
      where: { id: log.id },
      data: { status: "ERRORED", errorMessage: "OPENAI_API_KEY not configured" },
    });
    throw new Error("AI not configured: set OPENAI_API_KEY");
  }

  try {
    const userMessage = JSON.stringify(focused);
    const completion = await openai.chat.completions.create({
      model: MODEL_ID,
      temperature: modelVersion.temperature ?? 0.2,
      max_tokens: modelVersion.maxTokens ?? 1500,
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

    let parsed: { findings?: ToothFinding[] } = {};
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error("OpenAI returned non-JSON despite response_format=json_object");
    }

    const findings = Array.isArray(parsed.findings) ? parsed.findings : [];
    const avgConfidence = findings.length
      ? findings.reduce((s, x) => s + (x.confidence ?? 0), 0) / findings.length
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
      findings,
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
    logger.error("AI tooth findings failed", err);
    throw err;
  }
}
