"use client";

import { cn } from "@/lib/utils";

export function LoadingSpinner({ size = "md", className }: { size?: "sm" | "md" | "lg"; className?: string }) {
  const sizes = { sm: "w-4 h-4 border-2", md: "w-8 h-8 border-3", lg: "w-12 h-12 border-4" };
  return <div className={cn("border-blue-500 border-t-transparent rounded-full animate-spin", sizes[size], className)} />;
}

export function Skeleton({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return <div className={cn("bg-stone-100 rounded-xl animate-pulse", className)} style={style} />;
}

/**
 * Card list skeleton — used wherever a page loads a list of cards
 * (patients, plans, blocks, templates).
 */
export function CardListSkeleton({ rows = 4, withMeta = true }: { rows?: number; withMeta?: boolean }) {
  return (
    <div className="space-y-3 animate-fade-in">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="bg-white rounded-2xl border-2 border-stone-200 p-4 flex items-center gap-3">
          <Skeleton className="w-10 h-10 rounded-xl" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 rounded" style={{ width: `${60 + (i % 3) * 10}%` }} />
            {withMeta && <Skeleton className="h-2.5 rounded" style={{ width: `${30 + (i % 3) * 10}%` }} />}
          </div>
          <Skeleton className="h-3 w-16 rounded" />
        </div>
      ))}
    </div>
  );
}

/**
 * Grid skeleton — for image grids / card tiles (documents, templates,
 * before/after gallery).
 */
export function GridSkeleton({ items = 6, aspect = "aspect-square" }: { items?: number; aspect?: string }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 animate-fade-in">
      {Array.from({ length: items }).map((_, i) => (
        <Skeleton key={i} className={cn(aspect, "rounded-2xl")} />
      ))}
    </div>
  );
}

/** Table row skeleton — for table-heavy pages (appointments, invoices). */
export function TableSkeleton({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden animate-fade-in">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex items-center gap-3 px-4 py-3 border-b border-stone-100 last:border-b-0">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} className={cn(
              "h-3 rounded",
              c === 0 ? "w-10 h-10 rounded-xl" : c === 1 ? "flex-[2]" : "flex-1"
            )} />
          ))}
        </div>
      ))}
    </div>
  );
}

/** Inline 1-line stat skeleton (KPI tile). */
export function KpiSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className={cn("grid gap-3", count === 4 ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-2 sm:grid-cols-3")}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-white rounded-2xl border border-stone-200 p-4 space-y-2">
          <Skeleton className="h-2.5 w-2/3 rounded" />
          <Skeleton className="h-5 w-1/2 rounded" />
        </div>
      ))}
    </div>
  );
}
