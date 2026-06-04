/**
 * @system DentaCore ERP — Voice Note Transcription (deferred)
 * @route POST /api/voice-notes/:id/transcribe
 *
 * Reads the stored audio, transcribes it with OpenAI Whisper, structures it
 * with GPT, files it as a ConsultationNote on the patient, and marks the
 * voice note SAVED. This is the "transcribe later" half of the flow.
 */
import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { join } from "path";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/require-auth";
import { logger } from "@/lib/logger";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth({ roles: ["SUPER_ADMIN", "ADMIN", "DOCTOR", "ASSISTANT"] });
    if (auth.response) return auth.response;
    const { id } = await params;

    const vn = await prisma.voiceNote.findUnique({ where: { id } });
    if (!vn) return NextResponse.json({ success: false, error: "not_found" }, { status: 404 });
    if (!OPENAI_API_KEY) {
      return NextResponse.json({ success: false, error: "Transcription needs OPENAI_API_KEY" }, { status: 503 });
    }
    // Only allow reading from the uploads dir — guard against path traversal.
    if (!/^\/uploads\/[A-Za-z0-9._-]+$/.test(vn.audioUrl)) {
      return NextResponse.json({ success: false, error: "bad_audio_path" }, { status: 400 });
    }

    let buf: Buffer;
    try {
      buf = await readFile(join(process.cwd(), "public", vn.audioUrl));
    } catch {
      return NextResponse.json({ success: false, error: "audio_file_missing" }, { status: 410 });
    }

    // 1) Whisper transcription
    const wForm = new FormData();
    wForm.append("file", new Blob([new Uint8Array(buf)]), "voice-note.webm");
    wForm.append("model", "whisper-1");
    wForm.append("language", "en");
    const wRes = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
      body: wForm,
    });
    if (!wRes.ok) {
      logger.error("Whisper API error (voice-note transcribe)");
      return NextResponse.json({ success: false, error: "transcription_service_error" }, { status: 502 });
    }
    const transcript: string = (await wRes.json()).text || "";

    // 2) Structure with GPT
    let structured: Record<string, string> = {};
    if (transcript.trim().length > 15) {
      try {
        const sRes = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI_API_KEY}` },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: [
              { role: "system", content: "You are a medical note structurer for a dental clinic. Convert the raw transcript into structured clinical notes. Output JSON: {\"chiefComplaint\": \"...\", \"findings\": \"...\", \"diagnosis\": \"...\", \"plan\": \"...\", \"summary\": \"...\"}" },
              { role: "user", content: transcript },
            ],
            response_format: { type: "json_object" },
            max_tokens: 500, temperature: 0.3,
          }),
        });
        if (sRes.ok) structured = JSON.parse((await sRes.json()).choices[0].message.content);
      } catch { /* fall back to raw transcript only */ }
    }

    // 3) File it as a ConsultationNote. appointmentId is required + unique
    //    (one note per appointment): if the voice note is tied to an
    //    appointment, create that note or append to the existing one; with no
    //    appointment we keep the transcript on the voice note only.
    let noteId: string | null = null;
    if (vn.appointmentId) {
      const existing = await prisma.consultationNote.findUnique({ where: { appointmentId: vn.appointmentId } });
      if (existing) {
        const merged = [existing.internalNotes, transcript].filter(Boolean).join("\n\n");
        await prisma.consultationNote.update({ where: { id: existing.id }, data: { internalNotes: merged } });
        noteId = existing.id;
      } else {
        const note = await prisma.consultationNote.create({
          data: {
            patientId: vn.patientId,
            doctorId: vn.doctorId,
            appointmentId: vn.appointmentId,
            chiefComplaint: structured.chiefComplaint || undefined,
            examination: structured.findings || undefined,
            diagnosis: structured.diagnosis || undefined,
            treatmentPlan: structured.plan || undefined,
            internalNotes: transcript || undefined,
          },
        });
        noteId = note.id;
      }
    }

    // 4) Mark the voice note saved + keep the transcript on it
    await prisma.voiceNote.update({
      where: { id },
      data: { status: "SAVED", transcript, structuredNote: JSON.stringify(structured) },
    });

    return NextResponse.json({ success: true, data: { noteId, filedAsNote: !!noteId, transcript, structured } });
  } catch (error) {
    logger.api("POST", "/api/voice-notes/[id]/transcribe", error);
    return NextResponse.json({ success: false, error: "internal_error" }, { status: 500 });
  }
}
