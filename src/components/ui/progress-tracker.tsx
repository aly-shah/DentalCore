"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface Step {
  id: string;
  label: string;
  status: "completed" | "current" | "pending";
}

interface ProgressTrackerProps {
  steps: Step[];
  className?: string;
  "data-id"?: string;
}

export function ProgressTracker({ steps, className, ...props }: ProgressTrackerProps) {
  // Fixed-width steps that lay out at their natural width; the parent should
  // wrap this in an `overflow-x-auto` container so a long journey scrolls
  // inside its card instead of pushing off-screen on narrow panels.
  return (
    <div className={cn("flex items-start min-w-max", className)} {...props}>
      {steps.map((step, index) => (
        <div key={step.id} className="flex items-start">
          <div className="flex flex-col items-center gap-1.5 w-14 shrink-0">
            <div
              data-id={step.id}
              className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold transition-all shrink-0",
                step.status === "completed" && "bg-emerald-500 text-white shadow-sm shadow-emerald-200",
                step.status === "current" && "bg-blue-500 text-white shadow-md shadow-blue-200 animate-pulse-dot",
                step.status === "pending" && "bg-stone-100 text-stone-400"
              )}
            >
              {step.status === "completed" ? <Check className="w-4 h-4" /> : index + 1}
            </div>
            <span className={cn(
              "text-[10px] font-medium text-center leading-tight",
              step.status === "completed" && "text-emerald-600",
              step.status === "current" && "text-blue-600",
              step.status === "pending" && "text-stone-400"
            )}>
              {step.label}
            </span>
          </div>
          {index < steps.length - 1 && (
            <div className={cn(
              "w-5 h-0.5 mt-4 rounded-full shrink-0",
              step.status === "completed" ? "bg-emerald-400" : "bg-stone-200"
            )} />
          )}
        </div>
      ))}
    </div>
  );
}
