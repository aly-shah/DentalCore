"use client";

import { useState } from "react";
import { useModuleAccess } from "@/modules/core/hooks";
import {
  Plus,
  Clock,
  DollarSign,
  Sparkles,
} from "lucide-react";
import {
  Button,
  Card,
  Badge,
  SearchInput,
} from "@/components/ui";
import { useTreatments } from "@/hooks/use-queries";
import { TreatmentCategory } from "@/types";
import type { Treatment } from "@/types";
import { formatCurrency } from "@/lib/utils";

const categoryLabel: Record<string, string> = {
  [TreatmentCategory.PREVENTIVE]:    "Preventive",
  [TreatmentCategory.RESTORATIVE]:   "Restorative",
  [TreatmentCategory.ENDODONTIC]:    "Endodontic",
  [TreatmentCategory.PROSTHODONTIC]: "Prosthodontic",
  [TreatmentCategory.PERIODONTIC]:   "Periodontic",
  [TreatmentCategory.ORTHODONTIC]:   "Orthodontic",
  [TreatmentCategory.SURGICAL]:      "Surgical",
  [TreatmentCategory.COSMETIC]:      "Cosmetic",
  [TreatmentCategory.DIAGNOSTIC]:    "Diagnostic",
  [TreatmentCategory.OTHER]:         "Other",
};

const categoryBadge: Record<string, "primary" | "info" | "success" | "warning" | "danger" | "default" | "purple"> = {
  [TreatmentCategory.PREVENTIVE]:    "success",
  [TreatmentCategory.RESTORATIVE]:   "info",
  [TreatmentCategory.ENDODONTIC]:    "danger",
  [TreatmentCategory.PROSTHODONTIC]: "purple",
  [TreatmentCategory.PERIODONTIC]:   "warning",
  [TreatmentCategory.ORTHODONTIC]:   "primary",
  [TreatmentCategory.SURGICAL]:      "danger",
  [TreatmentCategory.COSMETIC]:      "purple",
  [TreatmentCategory.DIAGNOSTIC]:    "default",
  [TreatmentCategory.OTHER]:         "default",
};

const tabs = [
  { label: "All", value: "ALL" },
  { label: "Preventive",    value: TreatmentCategory.PREVENTIVE },
  { label: "Restorative",   value: TreatmentCategory.RESTORATIVE },
  { label: "Endodontic",    value: TreatmentCategory.ENDODONTIC },
  { label: "Prosthodontic", value: TreatmentCategory.PROSTHODONTIC },
  { label: "Surgical",      value: TreatmentCategory.SURGICAL },
  { label: "Cosmetic",      value: TreatmentCategory.COSMETIC },
  { label: "Other",         value: "OTHER_ALL" },
];

export default function TreatmentsPage() {
  const access = useModuleAccess("MOD-PROCEDURE");
  const [activeTab, setActiveTab] = useState("ALL");
  const [search, setSearch] = useState("");
  const { data: treatmentsResponse, isLoading } = useTreatments();
  const treatments = (Array.isArray(treatmentsResponse?.data)
    ? treatmentsResponse?.data
    : []) as Treatment[];

  if (!access.canView) {
    return (
      <div className="flex items-center justify-center py-20 text-stone-500">
        You don&apos;t have access to this module.
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-stone-500">
        Loading treatments...
      </div>
    );
  }

  const q = search.toLowerCase();
  const filtered = treatments.filter((t) => {
    const matchesTab =
      activeTab === "ALL" ||
      (activeTab === "OTHER_ALL"
        ? t.category === TreatmentCategory.OTHER ||
          t.category === TreatmentCategory.PERIODONTIC ||
          t.category === TreatmentCategory.ORTHODONTIC ||
          t.category === TreatmentCategory.DIAGNOSTIC
        : t.category === activeTab);
    const matchesSearch =
      (t.name ?? "").toLowerCase().includes(q) ||
      (t.description ?? "").toLowerCase().includes(q);
    return matchesTab && matchesSearch;
  });

  return (
    <div className="space-y-4 sm:space-y-6 animate-fade-in" data-id="ADMIN-TREATMENTS">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-stone-900">Treatments</h1>
          <p className="text-sm text-stone-500 mt-1">Browse and manage your treatment catalog</p>
        </div>
        <Button iconLeft={<Plus className="w-4 h-4" />}>Add Treatment</Button>
      </div>

      {/* Pill Tabs */}
      <div className="flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setActiveTab(tab.value)}
            className={`px-4 py-2 text-sm font-medium rounded-full transition-all cursor-pointer ${
              activeTab === tab.value
                ? "bg-blue-600 text-white shadow-sm"
                : "bg-stone-100 text-stone-600 hover:bg-stone-200"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Search */}
      <SearchInput placeholder="Search treatments..." onChange={setSearch} />

      {/* Treatment Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
        {filtered.map((treatment) => (
          <Card key={treatment.id} hover padding="lg" className="animate-fade-in">
            <div className="flex flex-col gap-3">
              {/* Top row */}
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
                    <Sparkles className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="font-semibold text-stone-800 truncate min-w-0">{treatment.name || "Untitled treatment"}</p>
                    <Badge variant={categoryBadge[treatment.category] || "default"} className="mt-1">
                      {categoryLabel[treatment.category] || treatment.category || "Other"}
                    </Badge>
                  </div>
                </div>
                <span
                  className={`w-2.5 h-2.5 rounded-full mt-1.5 ${
                    treatment.isActive ? "bg-emerald-400" : "bg-stone-300"
                  }`}
                />
              </div>

              {/* Description */}
              <p className="text-sm text-stone-500 line-clamp-2">
                {treatment.description || (
                  <span className="text-stone-300 italic">No description</span>
                )}
              </p>

              {/* Footer */}
              <div className="flex items-center justify-between pt-3 border-t border-stone-100">
                <div className="flex items-center gap-1.5 text-sm text-stone-500">
                  <Clock className="w-4 h-4" />
                  <span>{treatment.duration ?? 0} min</span>
                </div>
                <div className="flex items-center gap-1.5 text-sm font-semibold text-stone-700">
                  <DollarSign className="w-4 h-4 text-blue-600" />
                  <span>{formatCurrency(treatment.basePrice ?? 0)}</span>
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {filtered.length === 0 && (
        <Card padding="lg">
          <p className="text-center text-stone-400 py-8">No treatments found.</p>
        </Card>
      )}
    </div>
  );
}
