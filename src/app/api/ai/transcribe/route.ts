/**
 * @system DentaCore ERP — AI Transcription (OpenAI Whisper)
 * @route POST /api/ai/transcribe — Transcribe audio or process text into structured notes
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

import { requireAuth } from "@/lib/require-auth";
import { logger } from "@/lib/logger";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

export async function POST(request: Request) {
  try {
    const auth = await requireAuth();
    if (auth.response) return auth.response;

    const contentType = request.headers.get("content-type") || "";

    // Handle multipart (audio file upload)
    if (contentType.includes("multipart/form-data")) {
      return handleAudioTranscription(request);
    }

    // Handle JSON (text-based or record creation)
    const body = await request.json();
    const { appointmentId, patientId, doctorId, text } = body;

    // If text provided, structure it with AI
    if (text && OPENAI_API_KEY) {
      return structureNoteWithAI(text, appointmentId, patientId, doctorId);
    }

    // Return existing transcription if available
    if (appointmentId) {
      const existing = await prisma.aITranscription.findFirst({
        where: { appointmentId },
        include: {
          patient: { select: { id: true, firstName: true, lastName: true } },
          doctor: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
      });
      if (existing) return NextResponse.json({ success: true, data: existing });
    }

    // Create placeholder record
    const transcription = await prisma.aITranscription.create({
      data: {
        appointmentId, patientId, doctorId,
        rawTranscript: text || "Awaiting transcription...",
        structuredNote: JSON.stringify(text ? extractStructure(text) : { chiefComplaint: "Pending", findings: "Pending", plan: "Pending" }),
        summary: text ? text.substring(0, 200) : "Transcription pending.",
        status: text ? "COMPLETED" : "PROCESSING",
        duration: body.duration || null,
        language: body.language || "en",
      },
      include: {
        patient: { select: { id: true, firstName: true, lastName: true } },
        doctor: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({ success: true, data: transcription }, { status: 201 });
  } catch (error) {
    logger.api("POST", "/api/ai/transcribe", error);
    return NextResponse.json({ success: false, error: "Failed to transcribe" }, { status: 500 });
  }
}

// Handle actual audio file transcription via Whisper
async function handleAudioTranscription(request: Request) {
  try {
    const formData = await request.formData();
    const audioFile = formData.get("audio") as File | null;
    const appointmentId = formData.get("appointmentId") as string | null;
    const patientId = formData.get("patientId") as string | null;
    const doctorId = formData.get("doctorId") as string | null;

    if (!audioFile) {
      return NextResponse.json({ success: false, error: "No audio file" }, { status: 400 });
    }

    let transcript = "";

    if (OPENAI_API_KEY) {
      // Real Whisper transcription
      const whisperForm = new FormData();
      whisperForm.append("file", audioFile);
      whisperForm.append("model", "whisper-1");
      whisperForm.append("language", "en");

      const whisperRes = await fetch("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST",
        headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
        body: whisperForm,
      });

      if (whisperRes.ok) {
        const whisperData = await whisperRes.json();
        transcript = whisperData.text || "";
      } else {
        logger.error("Whisper API error");
        return NextResponse.json({ success: false, error: "Transcription service error" }, { status: 502 });
      }
    } else {
      transcript = "Audio transcription requires OPENAI_API_KEY configuration.";
    }

    // Structure the transcript with AI if available
    let structuredNote = extractStructure(transcript);
    let summary = transcript.substring(0, 200);

    if (OPENAI_API_KEY && transcript.length > 20) {
      try {
        const structRes = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI_API_KEY}` },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: [
              { role: "system", content: "You are a medical note structurer for a dermatology clinic. Convert the raw transcript into structured clinical notes. Output JSON: {\"chiefComplaint\": \"...\", \"findings\": \"...\", \"diagnosis\": \"...\", \"plan\": \"...\", \"summary\": \"...\"}" },
              { role: "user", content: transcript },
            ],
            response_format: { type: "json_object" },
            max_tokens: 500, temperature: 0.3,
          }),
        });
        if (structRes.ok) {
          const structData = await structRes.json();
          const parsed = JSON.parse(structData.choices[0].message.content);
          structuredNote = parsed;
          summary = parsed.summary || transcript.substring(0, 200);
        }
      } catch { /* fallback to basic extraction */ }
    }

    if (!appointmentId || !patientId || !doctorId) {
      return NextResponse.json({ success: true, data: { rawTranscript: transcript, structuredNote, summary, status: "COMPLETED" } });
    }

    // Save to database
    const record = await prisma.aITranscription.create({
      data: {
        appointmentId,
        patientId,
        doctorId,
        rawTranscript: transcript,
        structuredNote: JSON.stringify(structuredNote),
        summary,
        status: "COMPLETED",
        duration: Math.round(audioFile.size / 16000), // rough estimate
        language: "en",
      },
      include: {
        patient: { select: { id: true, firstName: true, lastName: true } },
        doctor: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({ success: true, data: record }, { status: 201 });
  } catch (error) {
    logger.error("Audio transcription failed", error);
    return NextResponse.json({ success: false, error: "Transcription failed" }, { status: 500 });
  }
}

// Structure raw text into clinical note with AI
async function structureNoteWithAI(text: string, appointmentId?: string, patientId?: string, doctorId?: string) {
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "Structure this doctor's note into clinical format. Output JSON: {\"chiefComplaint\": \"\", \"findings\": \"\", \"diagnosis\": \"\", \"plan\": \"\", \"summary\": \"\"}" },
          { role: "user", content: text },
        ],
        response_format: { type: "json_object" },
        max_tokens: 500, temperature: 0.3,
      }),
    });

    let structured = extractStructure(text);
    let summary = text.substring(0, 200);

    if (res.ok) {
      const data = await res.json();
      const parsed = JSON.parse(data.choices[0].message.content);
      structured = parsed;
      summary = parsed.summary || summary;
    }

    if (!appointmentId || !patientId || !doctorId) {
      return NextResponse.json({ success: true, data: { rawTranscript: text, structuredNote: structured, summary, status: "COMPLETED" } }, { status: 201 });
    }

    const record = await prisma.aITranscription.create({
      data: {
        appointmentId,
        patientId,
        doctorId,
        rawTranscript: text,
        structuredNote: JSON.stringify(structured),
        summary,
        status: "COMPLETED",
        language: "en",
      },
      include: {
        patient: { select: { id: true, firstName: true, lastName: true } },
        doctor: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({ success: true, data: record }, { status: 201 });
  } catch (error) {
    logger.error("Structure note failed", error);
    return NextResponse.json({ success: false, error: "Failed" }, { status: 500 });
  }
}

// Basic text extraction without AI
function extractStructure(text: string): Record<string, string> {
  const result: Record<string, string> = {};
  const patterns: [RegExp, string][] = [
    [/chief complaint[:\s]*(.*?)(?:\n|$)/i, "chiefComplaint"],
    [/complaint[:\s]*(.*?)(?:\n|$)/i, "chiefComplaint"],
    [/finding[s]?[:\s]*(.*?)(?:\n|$)/i, "findings"],
    [/diagnosis[:\s]*(.*?)(?:\n|$)/i, "diagnosis"],
    [/plan[:\s]*(.*?)(?:\n|$)/i, "plan"],
    [/treatment[:\s]*(.*?)(?:\n|$)/i, "plan"],
  ];
  for (const [regex, key] of patterns) {
    if (!result[key]) {
      const match = text.match(regex);
      if (match) result[key] = match[1].trim();
    }
  }
  return result;
}
