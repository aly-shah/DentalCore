"use client";

import { useState } from "react";
import { useModuleAccess } from "@/modules/core/hooks";
import {
  Building2,
  Plus,
  MapPin,
  Phone,
  Users,
  Mail,
  Loader2,
  Trash2,
} from "lucide-react";
import {
  Button,
  Card,
  Badge,
  StatCard,
  Input,
} from "@/components/ui";
import { SlidePanel } from "@/components/ui/slide-panel";
import { useBranches, useStaff, useCreateBranch, useDeleteBranch } from "@/hooks/use-queries";
import type { Branch, User } from "@/types";

const emptyBranchForm = { name: "", code: "", address: "", phone: "", email: "" };

export default function BranchesPage() {
  const access = useModuleAccess("MOD-BRANCH");
  const [panelOpen, setPanelOpen] = useState(false);
  const [form, setForm] = useState(emptyBranchForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { data: branchesResponse, isLoading: branchesLoading } = useBranches();
  const { data: staffResponse, isLoading: staffLoading } = useStaff();
  const createBranch = useCreateBranch();
  const deleteBranch = useDeleteBranch();
  const branches = (branchesResponse?.data || []) as Branch[];
  const users = (staffResponse?.data || []) as User[];
  const isLoading = branchesLoading || staffLoading;

  function handleDelete(branch: Branch) {
    const ok = window.confirm(
      `Remove ${branch.name}?\n\nIf it has staff, patients, appointments or invoices it'll be deactivated (hidden but data kept). Otherwise it'll be permanently deleted.`
    );
    if (!ok) return;
    deleteBranch.mutate(branch.id, {
      onSuccess: (res) => {
        const action = (res as { action?: string })?.action;
        window.alert(action === "deactivated" ? `${branch.name} was deactivated (linked data kept).` : `${branch.name} was deleted.`);
      },
      onError: () => window.alert(`Could not remove ${branch.name}. Please try again.`),
    });
  }

  function setField(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors((prev) => { const next = { ...prev }; delete next[field]; return next; });
  }

  function validate() {
    const errs: Record<string, string> = {};
    if (!form.name.trim()) errs.name = "Name is required";
    if (!form.code.trim()) errs.code = "Code is required";
    if (!form.address.trim()) errs.address = "Address is required";
    return errs;
  }

  function handleSubmit() {
    const errs = validate();
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }
    createBranch.mutate(form, {
      onSuccess: () => {
        setPanelOpen(false);
        setForm(emptyBranchForm);
        setErrors({});
      },
    });
  }

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
        Loading branches...
      </div>
    );
  }

  const activeBranches = branches.filter((b) => b.isActive).length;

  function getStaffCount(branchId: string) {
    return users.filter((u) => u.branchId === branchId).length;
  }

  return (
    <div className="space-y-4 sm:space-y-6 animate-fade-in" data-id="ADMIN-BRANCHES">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-stone-900">Branches</h1>
          <p className="text-sm text-stone-500 mt-1">All clinic locations at a glance</p>
        </div>
        <Button iconLeft={<Plus className="w-4 h-4" />} onClick={() => setPanelOpen(true)}>Add Branch</Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
        <StatCard label="Total Branches" value={branches.length} icon={<Building2 className="w-6 h-6" />} color="primary" />
        <StatCard label="Active" value={activeBranches} icon={<Building2 className="w-6 h-6" />} color="success" />
        <StatCard label="Total Staff" value={users.length} icon={<Users className="w-6 h-6" />} color="info" />
      </div>

      {/* Branch Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
        {branches.map((branch) => {
          const staffCount = getStaffCount(branch.id);
          return (
            <Card key={branch.id} hover padding="lg" className="animate-fade-in">
              <div className="flex flex-col gap-4">
                {/* Header */}
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-xl bg-blue-50 flex items-center justify-center">
                      <Building2 className="w-5 h-5 text-blue-600" />
                    </div>
                    <div>
                      <p className="font-semibold text-stone-800 truncate min-w-0">{branch.name}</p>
                      <Badge variant={branch.isActive ? "success" : "danger"} dot className="mt-1">
                        {branch.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                  </div>
                </div>

                {/* Details */}
                <div className="space-y-2.5 pt-3 border-t border-stone-100">
                  <div className="flex items-start gap-2 text-sm text-stone-500">
                    <MapPin className="w-4 h-4 mt-0.5 shrink-0" />
                    <span>{branch.address}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-stone-500">
                    <Phone className="w-4 h-4 shrink-0" />
                    <span>{branch.phone}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-stone-500">
                    <Mail className="w-4 h-4 shrink-0" />
                    <span>{branch.email}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-stone-500">
                    <Users className="w-4 h-4 shrink-0" />
                    <span>{staffCount} staff member{staffCount !== 1 ? "s" : ""}</span>
                  </div>
                </div>

                <button
                  onClick={() => handleDelete(branch)}
                  disabled={deleteBranch.isPending}
                  className="mt-1 flex items-center justify-center gap-1.5 text-xs font-medium text-red-500 hover:text-red-600 hover:bg-red-50 rounded-lg py-1.5 transition-colors disabled:opacity-50"
                  aria-label={`Remove ${branch.name}`}
                >
                  <Trash2 className="w-3.5 h-3.5" /> Remove branch
                </button>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Add Branch Panel */}
      <SlidePanel
        isOpen={panelOpen}
        onClose={() => { setPanelOpen(false); setForm(emptyBranchForm); setErrors({}); createBranch.reset(); }}
        title="Add Branch"
        subtitle="Create a new clinic location"
        width="md"
        footer={
          <>
            <Button variant="ghost" onClick={() => { setPanelOpen(false); setForm(emptyBranchForm); setErrors({}); createBranch.reset(); }}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={createBranch.isPending}>
              {createBranch.isPending ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Creating...</> : "Create Branch"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {createBranch.isError && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-100 text-sm text-red-600">
              {createBranch.error?.message || "Failed to create branch"}
            </div>
          )}
          <Input label="Branch Name" required placeholder="e.g. Downtown Clinic" value={form.name} onChange={(e) => setField("name", e.target.value)} error={errors.name} />
          <Input label="Code" required placeholder="e.g. DTC" helperText="Short unique identifier" value={form.code} onChange={(e) => setField("code", e.target.value)} error={errors.code} />
          <Input label="Address" required placeholder="Full street address" value={form.address} onChange={(e) => setField("address", e.target.value)} error={errors.address} />
          <Input label="Phone" placeholder="+20 2 000 0000" value={form.phone} onChange={(e) => setField("phone", e.target.value)} />
          <Input label="Email" type="email" placeholder="branch@clinic.com" value={form.email} onChange={(e) => setField("email", e.target.value)} />
        </div>
      </SlidePanel>
    </div>
  );
}
