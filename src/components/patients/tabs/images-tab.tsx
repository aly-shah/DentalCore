"use client";

import { useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ImageIcon,
  Upload,
  Trash2,
  X as XIcon,
  Maximize2,
  Plus,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { LoadingSpinner } from "@/components/ui/loading";
import { formatDate, cn } from "@/lib/utils";

interface BeforeAfterImage {
  id: string;
  patientId: string;
  beforeUrl: string;
  afterUrl: string | null;
  title: string | null;
  description: string | null;
  toothFdi: number | null;
  procedure: string | null;
  takenAt: string;
  uploadedByName: string | null;
  createdAt: string;
}

export function ImagesTab({ patientId }: { patientId: string }) {
  const qc = useQueryClient();
  const queryKey = ["patients", patientId, "before-after"] as const;

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      const res = await fetch(`/api/patients/${patientId}/before-after`);
      const json = await res.json();
      return (json?.data ?? []) as BeforeAfterImage[];
    },
    enabled: !!patientId,
  });

  const images = data ?? [];

  const [showUpload, setShowUpload] = useState(false);
  const [viewer, setViewer] = useState<BeforeAfterImage | null>(null);

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/before-after/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("delete failed");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-10">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div data-id="PATIENT-IMAGES-TAB" className="space-y-4">
      <Card padding="md">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <ImageIcon className="w-4 h-4 text-blue-600" />
              <h3 className="text-sm font-semibold text-stone-900">
                Before / After ({images.length})
              </h3>
            </div>
            <Button
              size="sm"
              variant="primary"
              iconLeft={<Plus className="w-3.5 h-3.5" />}
              onClick={() => setShowUpload(true)}
            >
              <span className="hidden sm:inline">Add before/after</span>
              <span className="sm:hidden">Add</span>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {images.length === 0 ? (
            <div className="text-center py-12">
              <ImageIcon className="w-12 h-12 text-stone-200 mx-auto" />
              <p className="text-sm text-stone-500 mt-3">
                No before/after images yet.
              </p>
              <Button
                size="sm"
                variant="primary"
                iconLeft={<Upload className="w-3.5 h-3.5" />}
                className="mt-4"
                onClick={() => setShowUpload(true)}
              >
                Upload first set
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {images.map((img) => (
                <ImageCard
                  key={img.id}
                  img={img}
                  onView={() => setViewer(img)}
                  onDelete={() => {
                    if (confirm("Delete this before/after pair?")) {
                      remove.mutate(img.id);
                    }
                  }}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <UploadModal
        open={showUpload}
        onClose={() => setShowUpload(false)}
        patientId={patientId}
        onCreated={() => {
          qc.invalidateQueries({ queryKey });
          setShowUpload(false);
        }}
      />

      <Viewer img={viewer} onClose={() => setViewer(null)} />
    </div>
  );
}

function ImageCard({
  img,
  onView,
  onDelete,
}: {
  img: BeforeAfterImage;
  onView: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="bg-white rounded-xl overflow-hidden border border-stone-200 group">
      <button
        type="button"
        onClick={onView}
        className="block w-full text-left cursor-pointer"
      >
        <div className="grid grid-cols-2 gap-px bg-stone-100">
          <div className="aspect-square bg-stone-100 relative overflow-hidden">
            <img
              src={img.beforeUrl}
              alt="Before"
              loading="lazy"
              decoding="async"
              className="w-full h-full object-cover"
            />
            <span className="absolute top-1.5 left-1.5 text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-black/60 text-white">
              Before
            </span>
          </div>
          <div className="aspect-square bg-stone-100 relative overflow-hidden">
            {img.afterUrl ? (
              <>
                <img
                  src={img.afterUrl}
                  alt="After"
                  loading="lazy"
                  decoding="async"
                  className="w-full h-full object-cover"
                />
                <span className="absolute top-1.5 right-1.5 text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-600 text-white">
                  After
                </span>
              </>
            ) : (
              <div className="w-full h-full flex items-center justify-center text-xs text-stone-400">
                Pending
              </div>
            )}
          </div>
        </div>
      </button>
      <div className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h4 className="text-sm font-semibold text-stone-900 truncate">
              {img.title || "Untitled"}
            </h4>
            <p className="text-[11px] text-stone-500 mt-0.5">
              {formatDate(img.takenAt)}
              {img.uploadedByName && ` · ${img.uploadedByName}`}
            </p>
            {(img.toothFdi || img.procedure) && (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {img.toothFdi && (
                  <span className="inline-block text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 font-semibold">
                    Tooth {img.toothFdi}
                  </span>
                )}
                {img.procedure && (
                  <span className="inline-block text-[10px] px-1.5 py-0.5 rounded bg-stone-100 text-stone-600">
                    {img.procedure}
                  </span>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center gap-0.5 shrink-0">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onView();
              }}
              className="p-1.5 rounded-lg text-stone-400 hover:bg-stone-100 hover:text-stone-700 cursor-pointer"
              aria-label="View"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 cursor-pointer"
              aria-label="Delete"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
        {img.description && (
          <p className="text-xs text-stone-600 mt-2 line-clamp-2">
            {img.description}
          </p>
        )}
      </div>
    </div>
  );
}

function UploadModal({
  open,
  onClose,
  patientId,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  patientId: string;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [toothFdi, setToothFdi] = useState<string>("");
  const [procedure, setProcedure] = useState("");
  const [beforeFile, setBeforeFile] = useState<File | null>(null);
  const [afterFile, setAfterFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const reset = () => {
    setTitle("");
    setDescription("");
    setToothFdi("");
    setProcedure("");
    setBeforeFile(null);
    setAfterFile(null);
    setError("");
  };

  const beforePreview = useMemo(
    () => (beforeFile ? URL.createObjectURL(beforeFile) : null),
    [beforeFile]
  );
  const afterPreview = useMemo(
    () => (afterFile ? URL.createObjectURL(afterFile) : null),
    [afterFile]
  );

  async function uploadOne(file: File): Promise<string> {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/upload", { method: "POST", body: fd });
    const json = await res.json();
    if (!res.ok || !json?.data?.url) {
      throw new Error(json?.error || "Upload failed");
    }
    return json.data.url as string;
  }

  async function onSubmit() {
    setError("");
    if (!beforeFile) {
      setError("Before image is required.");
      return;
    }
    setSubmitting(true);
    try {
      const beforeUrl = await uploadOne(beforeFile);
      const afterUrl = afterFile ? await uploadOne(afterFile) : null;
      const res = await fetch(`/api/patients/${patientId}/before-after`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          beforeUrl,
          afterUrl,
          title: title || null,
          description: description || null,
          toothFdi: toothFdi ? Number(toothFdi) : null,
          procedure: procedure || null,
        }),
      });
      if (!res.ok) throw new Error("Save failed");
      reset();
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      isOpen={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title="Add before / after photos"
      subtitle="Upload paired clinical images with notes"
      size="lg"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={onSubmit}
            loading={submitting}
            disabled={!beforeFile}
          >
            Save
          </Button>
        </>
      }
    >
      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <FilePicker
          label="Before"
          file={beforeFile}
          preview={beforePreview}
          onChange={setBeforeFile}
          accent="amber"
        />
        <FilePicker
          label="After"
          file={afterFile}
          preview={afterPreview}
          onChange={setAfterFile}
          accent="emerald"
          optional
        />
      </div>

      <div className="mt-4 space-y-3">
        <Input
          label="Title"
          placeholder="e.g. Tooth 16 root canal"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input
            label="Tooth FDI (optional)"
            type="number"
            min={11}
            max={48}
            placeholder="e.g. 16"
            value={toothFdi}
            onChange={(e) => setToothFdi(e.target.value)}
          />
          <Input
            label="Procedure (optional)"
            placeholder="e.g. Root canal, Filling"
            value={procedure}
            onChange={(e) => setProcedure(e.target.value)}
          />
        </div>
        <Textarea
          label="Notes"
          rows={3}
          placeholder="Clinical notes, observations…"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
    </Modal>
  );
}

function FilePicker({
  label,
  preview,
  onChange,
  accent,
  optional,
}: {
  label: string;
  file: File | null;
  preview: string | null;
  onChange: (f: File | null) => void;
  accent: "amber" | "emerald";
  optional?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const accentRing =
    accent === "amber"
      ? "border-amber-300 hover:border-amber-500 hover:bg-amber-50"
      : "border-emerald-300 hover:border-emerald-500 hover:bg-emerald-50";
  const accentLabel =
    accent === "amber"
      ? "bg-amber-100 text-amber-700"
      : "bg-emerald-100 text-emerald-700";

  return (
    <div>
      <span className="block text-xs font-semibold uppercase tracking-wider text-stone-500 mb-1.5">
        {label}{" "}
        {optional && (
          <span className="text-stone-400 normal-case font-normal">
            (optional)
          </span>
        )}
      </span>
      <div className="relative">
        {preview ? (
          <div className="relative aspect-[4/3] rounded-xl overflow-hidden border-2 border-stone-200">
            <img
              src={preview}
              alt={label}
              className="w-full h-full object-cover"
            />
            <span
              className={cn(
                "absolute top-2 left-2 text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded",
                accentLabel
              )}
            >
              {label}
            </span>
            <button
              type="button"
              onClick={() => onChange(null)}
              className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80 cursor-pointer"
              aria-label="Remove"
            >
              <XIcon className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className={cn(
              "w-full aspect-[4/3] border-2 border-dashed rounded-xl flex flex-col items-center justify-center gap-2 transition-colors cursor-pointer",
              accentRing
            )}
          >
            <Upload className="w-6 h-6 text-stone-400" />
            <span className="text-sm font-semibold text-stone-700">
              Tap to choose
            </span>
            <span className="text-xs text-stone-500">JPG, PNG, WEBP · 10 MB</span>
          </button>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="hidden"
          onChange={(e) => onChange(e.target.files?.[0] ?? null)}
        />
      </div>
    </div>
  );
}

function Viewer({
  img,
  onClose,
}: {
  img: BeforeAfterImage | null;
  onClose: () => void;
}) {
  const [pos, setPos] = useState(50);
  const [view, setView] = useState<"compare" | "before" | "after">("compare");

  if (!img) return null;
  const hasAfter = !!img.afterUrl;

  return (
    <div className="fixed inset-0 z-50 bg-stone-950 flex flex-col" role="dialog">
      <div className="shrink-0 px-4 sm:px-6 py-3 flex items-center gap-3 border-b border-white/10 text-white">
        <button
          onClick={onClose}
          className="p-2 rounded-lg hover:bg-white/10 cursor-pointer"
          aria-label="Close"
        >
          <XIcon className="w-5 h-5" />
        </button>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold truncate">
            {img.title || "Before / After"}
          </h3>
          <p className="text-[11px] text-stone-400">
            {formatDate(img.takenAt)}
            {img.uploadedByName && ` · ${img.uploadedByName}`}
          </p>
        </div>
        {hasAfter && (
          <div className="hidden sm:flex items-center gap-1 bg-white/10 rounded-full p-1">
            {(["before", "compare", "after"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={cn(
                  "px-3 py-1 rounded-full text-xs font-semibold cursor-pointer transition-colors",
                  view === v ? "bg-white text-stone-900" : "text-white hover:bg-white/10"
                )}
              >
                {v === "compare" ? "Compare" : v[0].toUpperCase() + v.slice(1)}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex-1 min-h-0 flex items-center justify-center p-4 sm:p-6">
        {!hasAfter || view === "before" ? (
          <img
            src={img.beforeUrl}
            alt="Before"
            className="max-w-full max-h-full object-contain rounded-lg"
          />
        ) : view === "after" ? (
          <img
            src={img.afterUrl!}
            alt="After"
            className="max-w-full max-h-full object-contain rounded-lg"
          />
        ) : (
          <CompareSlider
            before={img.beforeUrl}
            after={img.afterUrl!}
            pos={pos}
            onPos={setPos}
          />
        )}
      </div>

      {hasAfter && (
        <div className="sm:hidden shrink-0 p-3 border-t border-white/10 flex items-center justify-center gap-2">
          {(["before", "compare", "after"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={cn(
                "px-4 py-1.5 rounded-full text-xs font-semibold cursor-pointer",
                view === v ? "bg-white text-stone-900" : "bg-white/10 text-white"
              )}
            >
              {v === "compare" ? "Compare" : v[0].toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>
      )}

      {img.description && (
        <div className="shrink-0 px-4 sm:px-6 py-3 border-t border-white/10 text-stone-200 text-sm max-h-32 overflow-y-auto">
          {img.description}
        </div>
      )}
    </div>
  );
}

function CompareSlider({
  before,
  after,
  pos,
  onPos,
}: {
  before: string;
  after: string;
  pos: number;
  onPos: (v: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  const updateFromClient = (clientX: number) => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * 100;
    onPos(Math.max(0, Math.min(100, x)));
  };

  return (
    <div
      ref={ref}
      className="relative w-full max-w-4xl aspect-[4/3] select-none touch-none"
      onMouseDown={(e) => {
        setDragging(true);
        updateFromClient(e.clientX);
      }}
      onMouseUp={() => setDragging(false)}
      onMouseLeave={() => setDragging(false)}
      onMouseMove={(e) => dragging && updateFromClient(e.clientX)}
      onTouchStart={(e) => {
        setDragging(true);
        updateFromClient(e.touches[0].clientX);
      }}
      onTouchMove={(e) => dragging && updateFromClient(e.touches[0].clientX)}
      onTouchEnd={() => setDragging(false)}
    >
      <img
        src={after}
        alt="After"
        className="absolute inset-0 w-full h-full object-contain rounded-lg"
        draggable={false}
      />
      <div
        className="absolute inset-0 overflow-hidden rounded-lg"
        style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}
      >
        <img
          src={before}
          alt="Before"
          className="absolute inset-0 w-full h-full object-contain rounded-lg"
          draggable={false}
        />
      </div>
      <div
        className="absolute top-0 bottom-0 w-0.5 bg-white pointer-events-none"
        style={{ left: `${pos}%` }}
      >
        <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-10 h-10 rounded-full bg-white shadow-lg flex items-center justify-center">
          <ChevronLeft className="w-4 h-4 text-stone-700 -mr-1" />
          <ChevronRight className="w-4 h-4 text-stone-700 -ml-1" />
        </div>
      </div>
      <span className="absolute top-3 left-3 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded bg-amber-500 text-white">
        Before
      </span>
      <span className="absolute top-3 right-3 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded bg-emerald-500 text-white">
        After
      </span>
    </div>
  );
}
