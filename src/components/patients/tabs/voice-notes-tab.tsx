"use client";

import { useQuery } from "@tanstack/react-query";
import { Mic, Clock } from "lucide-react";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LoadingSpinner } from "@/components/ui/loading";
import { formatDate } from "@/lib/utils";

interface VoiceNote {
  id: string;
  status: string;
  audioUrl: string;
  durationSec: number;
  transcript: string | null;
  structuredNote: string | null;
  createdAt: string;
}

function fmtDuration(s: number) {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function summaryOf(structuredNote: string | null): string | null {
  if (!structuredNote) return null;
  try {
    return (JSON.parse(structuredNote) as { summary?: string }).summary ?? null;
  } catch {
    return null;
  }
}

export function VoiceNotesTab({ patientId }: { patientId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["voice-notes", patientId],
    queryFn: async () => {
      const r = await fetch(`/api/patients/${patientId}/voice-notes`);
      const j = await r.json();
      if (!j.success) throw new Error(j.error || "Failed to load voice notes");
      return j.data as VoiceNote[];
    },
  });

  if (isLoading) return <LoadingSpinner />;
  const notes = data ?? [];

  return (
    <div data-id="PATIENT-VOICE-NOTES-TAB" className="space-y-4">
      {notes.length > 0 ? (
        notes.map((n) => {
          const transcribed = n.status === "SAVED";
          const summary = summaryOf(n.structuredNote);
          return (
            <Card key={n.id} padding="md">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Mic className="w-4 h-4 text-violet-600" />
                    <h3 className="text-sm font-semibold text-stone-900">{fmtDuration(n.durationSec)} recording</h3>
                    {transcribed ? (
                      <Badge variant="success" dot>Transcribed</Badge>
                    ) : (
                      <Badge variant="warning" dot>Awaiting transcription</Badge>
                    )}
                  </div>
                  <span className="text-xs text-stone-500">{formatDate(n.createdAt)}</span>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 text-sm">
                  {n.audioUrl && <audio controls preload="none" src={n.audioUrl} className="w-full h-9" />}
                  {transcribed ? (
                    <>
                      {summary && (
                        <div>
                          <p className="text-xs font-semibold text-stone-500 uppercase mb-1">Summary</p>
                          <p>{summary}</p>
                        </div>
                      )}
                      <div>
                        <p className="text-xs font-semibold text-stone-500 uppercase mb-1">Transcript</p>
                        <p className="whitespace-pre-wrap text-stone-700">{n.transcript || "—"}</p>
                      </div>
                    </>
                  ) : (
                    <p className="text-xs text-stone-400 flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5" /> Not transcribed yet.
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })
      ) : (
        <Card padding="md">
          <CardContent>
            <p className="text-sm text-stone-500 text-center py-4">No voice notes for this patient</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
