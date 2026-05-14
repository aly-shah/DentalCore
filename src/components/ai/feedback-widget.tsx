"use client";

/**
 * Inline 👍/👎 + flag-inaccurate widget for AI suggestion surfaces.
 * Writes to /api/ai/suggestions/[suggestionLogId]/feedback. Designed
 * to be unobtrusive — collapsed by default, expands on click.
 */
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ThumbsUp, ThumbsDown, Flag, Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Mood = "up" | "down" | null;

export function AIFeedbackWidget({
  suggestionLogId,
  className,
  compact,
}: {
  suggestionLogId: string;
  className?: string;
  /** Even tighter layout — no labels, just icons. */
  compact?: boolean;
}) {
  const [mood, setMood] = useState<Mood>(null);
  const [note, setNote] = useState("");
  const [flagInaccurate, setFlagInaccurate] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const submit = useMutation({
    mutationFn: async (payload: { rating: number; feedback?: string; flagAsInaccurate?: boolean }) => {
      const r = await fetch(`/api/ai/suggestions/${suggestionLogId}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.error || "Failed");
      return j.data;
    },
    onSuccess: () => setSubmitted(true),
  });

  // Quick path: thumbs-up sends a rating of 5 with no note; thumbs-down
  // opens the inline form for an optional note + the flag toggle.
  const quickThumb = (up: boolean) => {
    setMood(up ? "up" : "down");
    if (up) {
      submit.mutate({ rating: 5 });
    } else {
      setExpanded(true);
    }
  };

  const submitDownVote = () => {
    submit.mutate({
      rating: 1,
      feedback: note.trim() || undefined,
      flagAsInaccurate: flagInaccurate,
    });
  };

  if (submitted) {
    return (
      <div className={cn("flex items-center gap-1.5 text-[10px] text-emerald-600 font-semibold", className)}>
        <Check className="w-3 h-3" /> Thanks for the feedback
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => quickThumb(true)}
          disabled={submit.isPending}
          aria-label="Helpful"
          className={cn(
            "p-1 rounded-md transition-colors disabled:opacity-50",
            mood === "up"
              ? "bg-emerald-100 text-emerald-700"
              : "text-stone-400 hover:bg-emerald-50 hover:text-emerald-600"
          )}
        >
          {submit.isPending && mood === "up"
            ? <Loader2 className="w-3 h-3 animate-spin" />
            : <ThumbsUp className="w-3 h-3" />}
        </button>
        <button
          onClick={() => quickThumb(false)}
          disabled={submit.isPending}
          aria-label="Not helpful"
          className={cn(
            "p-1 rounded-md transition-colors disabled:opacity-50",
            mood === "down"
              ? "bg-red-100 text-red-700"
              : "text-stone-400 hover:bg-red-50 hover:text-red-600"
          )}
        >
          <ThumbsDown className="w-3 h-3" />
        </button>
        {!compact && (
          <span className="text-[9px] text-stone-400 uppercase tracking-wider">Rate AI</span>
        )}
      </div>

      {expanded && mood === "down" && !submitted && (
        <div className="rounded-lg border border-red-200 bg-red-50/40 p-2 space-y-1.5 animate-fade-in">
          <textarea
            rows={2}
            placeholder="What was wrong? (optional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="w-full px-2 py-1 text-[11px] rounded border border-red-200 bg-white focus:border-red-400 focus:outline-none resize-none"
          />
          <label className="flex items-center gap-1.5 text-[10px] text-red-700 cursor-pointer">
            <input
              type="checkbox"
              checked={flagInaccurate}
              onChange={(e) => setFlagInaccurate(e.target.checked)}
              className="w-3 h-3"
            />
            <Flag className="w-2.5 h-2.5" />
            Flag as clinically inaccurate
          </label>
          <div className="flex items-center justify-end gap-1.5">
            <button
              onClick={() => { setExpanded(false); setMood(null); }}
              className="text-[10px] text-stone-500 hover:text-stone-700 font-semibold px-2 py-0.5"
            >
              Cancel
            </button>
            <button
              onClick={submitDownVote}
              disabled={submit.isPending}
              className="text-[10px] font-bold text-white bg-red-600 hover:bg-red-700 px-2 py-1 rounded-md disabled:opacity-60 flex items-center gap-1"
            >
              {submit.isPending && <Loader2 className="w-2.5 h-2.5 animate-spin" />}
              Submit
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
