/**
 * AI-powered patient summary service.
 *
 * Given a patient's recent clinical history (notes, allergies, active Rx,
 * vitals, treatment plan), returns 3-5 bullet points: what to know
 * heading into this visit, what's pending, and any flags. Logged in
 * AISuggestionLog for full provenance.
 */
import crypto from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { getOpenAI, priceCents } from "./openai";

const SUBSYSTEM = "patient-summary";
const MODEL_NAME = "patient-summary";
const MODEL_ID = "gpt-4o-mini";
const PROMPT_VERSION = "v1";

const SYSTEM_PROMPT = `You are a clinical briefing assistant for a licensed dentist about to see a patient. You receive a JSON snapshot of the patient's recent record and produce a short pre-visit briefing.

Strict rules:
- Output 3-5 bullet points, each ≤ 18 words.
- Focus on what changes the dentist's plan today: active conditions, allergies, recent treatments, pending plan items, payment risk, no-show pattern.
- If allergies are present, the first bullet must mention them.
- Skip filler like "patient is otherwise well". Skip if there's nothing useful — return an empty array.
- Output strict JSON only. No prose outside the JSON.
- Schema: { "summary": [ { "text": string, "category": "ALLERGY" | "MEDICAL" | "DENTAL" | "FINANCIAL" | "OPERATIONAL" | "ROUTINE", "severity": "INFO" | "ATTENTION" | "URGENT" } ] }`;

export interface PatientSummaryItem {
  text: string;
  category: "ALLERGY" | "MEDICAL" | "DENTAL" | "FINANCIAL" | "OPERATIONAL" | "ROUTINE";
  severity: "INFO" | "ATTENTION" | "URGENT";
}

export interface PatientSummaryResult {
  suggestionLogId: string;
  summary: PatientSummaryItem[];
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
      maxTokens: 400,
      isActive: true,
    },
    update: {},
  });
}

function hashInput(obj: unknown): string {
  return crypto.createHash("sha256").update(JSON.stringify(obj)).digest("hex");
}

/** Build a compact, prompt-friendly snapshot from the patient's records. */
async function buildSnapshot(patientId: string) {
  const patient = await prisma.patient.findUnique({
    where: { id: patientId },
    include: {
      allergies: true,
      tags: true,
    },
  });
  if (!patient) return null;

  const [lastNote, latestRx, latestTriage, problemTeeth, openPlan, recentInvoices, recentAppts] = await Promise.all([
    prisma.consultationNote.findFirst({
      where: { patientId },
      orderBy: { createdAt: "desc" },
      select: { chiefComplaint: true, diagnosis: true, treatmentPlan: true, createdAt: true },
    }),
    prisma.prescription.findFirst({
      where: { patientId },
      orderBy: { createdAt: "desc" },
      include: { items: { select: { medicineName: true, dosage: true, frequency: true, duration: true } } },
    }),
    prisma.triage.findFirst({
      where: { patientId },
      orderBy: { createdAt: "desc" },
      select: { systolicBP: true, diastolicBP: true, heartRate: true, temperature: true, urgencyLevel: true, createdAt: true },
    }),
    prisma.toothRecord.findMany({
      where: {
        patientId,
        status: { notIn: ["HEALTHY", "TREATED"] },
      },
      select: { fdi: true, status: true, conditions: true, plannedTreatment: true, priority: true },
      take: 12,
    }),
    prisma.treatmentPlan.findFirst({
      where: { patientId, status: { in: ["PROPOSED", "ACCEPTED", "IN_PROGRESS"] } },
      orderBy: { createdAt: "desc" },
      include: {
        items: { select: { description: true, status: true, total: true } },
      },
    }),
    prisma.invoice.findMany({
      where: { patientId, status: { in: ["PENDING", "PARTIAL", "OVERDUE"] } },
      select: { total: true, amountPaid: true, balanceDue: true, status: true, dueDate: true },
      take: 5,
    }),
    prisma.appointment.findMany({
      where: { patientId },
      orderBy: { date: "desc" },
      select: { status: true, date: true, type: true },
      take: 6,
    }),
  ]);

  const age = patient.dateOfBirth
    ? Math.floor((Date.now() - patient.dateOfBirth.getTime()) / (365.25 * 24 * 60 * 60 * 1000))
    : null;

  const noShowCount = recentAppts.filter((a) => a.status === "NO_SHOW").length;
  const outstandingBalance = recentInvoices.reduce((s, i) => s + (i.balanceDue ?? 0), 0);

  return {
    patient: {
      firstName: patient.firstName,
      gender: patient.gender,
      age,
      isVip: patient.isVip,
      bloodType: patient.bloodType,
      tags: patient.tags.map((t) => t.tag),
    },
    allergies: patient.allergies.map((a) => ({ allergen: a.allergen, severity: a.severity })),
    lastNote: lastNote
      ? {
          daysAgo: Math.floor((Date.now() - lastNote.createdAt.getTime()) / 86400000),
          chiefComplaint: lastNote.chiefComplaint,
          diagnosis: lastNote.diagnosis,
          treatmentPlan: lastNote.treatmentPlan,
        }
      : null,
    activeRx: latestRx?.items.slice(0, 5) ?? [],
    latestTriage: latestTriage
      ? {
          daysAgo: Math.floor((Date.now() - latestTriage.createdAt.getTime()) / 86400000),
          bp: latestTriage.systolicBP && latestTriage.diastolicBP
            ? `${latestTriage.systolicBP}/${latestTriage.diastolicBP}`
            : null,
          hr: latestTriage.heartRate,
          temp: latestTriage.temperature,
          urgency: latestTriage.urgencyLevel,
        }
      : null,
    problemTeeth: problemTeeth.map((t) => ({
      fdi: t.fdi,
      status: t.status,
      planned: t.plannedTreatment,
      priority: t.priority,
    })),
    openPlan: openPlan
      ? {
          title: openPlan.title,
          status: openPlan.status,
          totalItems: openPlan.items.length,
          completedItems: openPlan.items.filter((i) => i.status === "COMPLETED").length,
          totalCost: openPlan.totalCost,
          patientPortion: openPlan.estimatedPatientPortion,
        }
      : null,
    outstandingBalance,
    noShowCount,
  };
}

export async function summarizePatient(
  patientId: string,
  context: { tenantId?: string | null; doctorId?: string | null }
): Promise<PatientSummaryResult> {
  const openai = getOpenAI();
  const modelVersion = await ensureModelVersion();
  const snapshot = await buildSnapshot(patientId);
  if (!snapshot) {
    throw new Error("Patient not found");
  }
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
      temperature: modelVersion.temperature ?? 0.2,
      max_tokens: modelVersion.maxTokens ?? 400,
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

    let parsed: { summary?: PatientSummaryItem[] } = {};
    try { parsed = JSON.parse(raw); } catch {
      throw new Error("OpenAI returned non-JSON despite response_format=json_object");
    }

    const summary = Array.isArray(parsed.summary) ? parsed.summary : [];

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

    return { suggestionLogId: log.id, summary, modelId: MODEL_ID, costCents: cost, latencyMs: latency };
  } catch (err) {
    await prisma.aISuggestionLog.update({
      where: { id: log.id },
      data: {
        status: "ERRORED",
        errorMessage: err instanceof Error ? err.message : String(err),
        latencyMs: Date.now() - started,
      },
    });
    logger.error("AI patient summary failed", err);
    throw err;
  }
}
