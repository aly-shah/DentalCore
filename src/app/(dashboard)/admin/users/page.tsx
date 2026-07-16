"use client";

import { useState } from "react";
import { useModuleAccess } from "@/modules/core/hooks";
import {
  Users,
  Plus,
  Stethoscope,
  UserCheck,
  MapPin,
  Clock,
  Loader2,
  Trash2,
  Pencil,
} from "lucide-react";
import {
  Button,
  StatCard,
  Card,
  SearchInput,
  Avatar,
  Badge,
  Input,
  Select,
} from "@/components/ui";
import { SlidePanel } from "@/components/ui/slide-panel";
import { RelativeTime } from "@/components/ui/relative-time";
import { useStaff, useCreateUser, useUpdateUser, useDeleteUser, useBranches } from "@/hooks/use-queries";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { useAuth } from "@/lib/auth-context";
import { UserRole } from "@/types";
import type { User, Branch } from "@/types";

const roleBadgeVariant: Record<string, "primary" | "info" | "success" | "warning" | "danger" | "default" | "purple"> = {
  [UserRole.SUPER_ADMIN]: "danger",
  [UserRole.ADMIN]: "primary",
  [UserRole.DOCTOR]: "info",
  [UserRole.RECEPTIONIST]: "success",
  [UserRole.BILLING]: "warning",
  [UserRole.CALL_CENTER]: "purple",
  [UserRole.ASSISTANT]: "default",
};

const roleLabel: Record<string, string> = {
  [UserRole.SUPER_ADMIN]: "Super Admin",
  [UserRole.ADMIN]: "Admin",
  [UserRole.DOCTOR]: "Doctor",
  [UserRole.RECEPTIONIST]: "Receptionist",
  [UserRole.BILLING]: "Billing",
  [UserRole.CALL_CENTER]: "Call Center",
  [UserRole.ASSISTANT]: "Assistant",
};

const roleOptions = [
  { value: UserRole.ADMIN, label: "Admin" },
  { value: UserRole.DOCTOR, label: "Doctor" },
  { value: UserRole.RECEPTIONIST, label: "Receptionist" },
  { value: UserRole.BILLING, label: "Billing" },
  { value: UserRole.CALL_CENTER, label: "Call Center" },
  { value: UserRole.ASSISTANT, label: "Assistant" },
];

const emptyForm = { name: "", email: "", password: "", role: "", phone: "", branchId: "", consultationFee: "" };

export default function TeamPage() {
  const access = useModuleAccess("MOD-STAFF");
  const [search, setSearch] = useState("");
  const [panelOpen, setPanelOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { data: staffResponse, isLoading } = useStaff();
  const { data: branchesResponse } = useBranches();
  const createUser = useCreateUser();
  const updateUser = useUpdateUser();
  const deleteUser = useDeleteUser();
  const { confirm } = useConfirm();
  const toast = useToast();
  const { user: currentUser } = useAuth();
  const users = (staffResponse?.data || []) as User[];
  const branches = (branchesResponse?.data || []) as Branch[];

  async function handleDelete(user: User) {
    const ok = await confirm({
      title: `Delete ${user.name}?`,
      message: "The account is removed for good. Any past appointments, notes and invoices are kept but reassigned to you.",
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (!ok) return;
    deleteUser.mutate(user.id, {
      onSuccess: () => toast.success(`${user.name} was deleted.`),
      onError: () => toast.error(`Could not delete ${user.name}. Please try again.`),
    });
  }

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setErrors({});
    createUser.reset();
    updateUser.reset();
    setPanelOpen(true);
  }

  function openEdit(user: User) {
    setEditingId(user.id);
    setForm({
      name: user.name || "",
      email: user.email || "",
      password: "",
      role: user.role || "",
      phone: user.phone || "",
      branchId: user.branchId || "",
      consultationFee: user.consultationFee != null ? String(user.consultationFee) : "",
    });
    setErrors({});
    createUser.reset();
    updateUser.reset();
    setPanelOpen(true);
  }

  function closePanel() {
    setPanelOpen(false);
    setEditingId(null);
    setForm(emptyForm);
    setErrors({});
    createUser.reset();
    updateUser.reset();
  }

  function setField(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors((prev) => { const next = { ...prev }; delete next[field]; return next; });
  }

  function validate() {
    const errs: Record<string, string> = {};
    if (!form.name.trim()) errs.name = "Name is required";
    // Email + password are set at creation only (not editable via PATCH).
    if (!editingId) {
      if (!form.email.trim()) errs.email = "Email is required";
      else if (!/\S+@\S+\.\S+/.test(form.email)) errs.email = "Invalid email";
      if (!form.password.trim()) errs.password = "Password is required";
      else if (form.password.length < 6) errs.password = "Min 6 characters";
    }
    if (!form.role) errs.role = "Role is required";
    return errs;
  }

  const isSaving = createUser.isPending || updateUser.isPending;

  function handleSubmit() {
    const errs = validate();
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }
    if (editingId) {
      const data: Record<string, unknown> = {
        name: form.name,
        role: form.role,
        phone: form.phone || null,
        consultationFee: form.role === UserRole.DOCTOR ? Number(form.consultationFee) || 0 : 0,
      };
      if (form.branchId) data.branchId = form.branchId;
      updateUser.mutate({ id: editingId, data }, {
        onSuccess: () => { closePanel(); toast.success(`${form.name} updated.`); },
        onError: () => toast.error("Could not save changes. Please try again."),
      });
    } else {
      createUser.mutate(form, {
        onSuccess: () => { closePanel(); },
      });
    }
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
        Loading team members...
      </div>
    );
  }

  const totalStaff = users.length;
  const totalDoctors = users.filter((u) => u.role === UserRole.DOCTOR).length;
  const activeStaff = users.filter((u) => u.isActive).length;

  const filteredUsers = users.filter(
    (u) =>
      u.name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase()) ||
      u.role.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4 sm:space-y-6 animate-fade-in" data-id="ADMIN-USERS">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-stone-900">Team</h1>
          <p className="text-sm text-stone-500 mt-1">Your people, all in one place</p>
        </div>
        <Button iconLeft={<Plus className="w-4 h-4" />} onClick={openCreate}>Add Member</Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
        <StatCard label="Team Members" value={totalStaff} icon={<Users className="w-6 h-6" />} color="primary" />
        <StatCard label="Doctors" value={totalDoctors} icon={<Stethoscope className="w-6 h-6" />} color="info" />
        <StatCard label="Active Now" value={activeStaff} icon={<UserCheck className="w-6 h-6" />} color="success" />
      </div>

      {/* Search */}
      <SearchInput placeholder="Find a team member..." onChange={setSearch} />

      {/* Team Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
        {filteredUsers.map((user) => (
          <Card key={user.id} hover padding="lg" className="animate-fade-in">
            <div className="flex flex-col items-center text-center gap-3">
              {/* Avatar + Status Dot */}
              <div className="relative">
                <Avatar name={user.name} src={user.avatar} size="xl" />
                <span
                  className={`absolute bottom-0 right-0 w-4 h-4 rounded-full border-2 border-white ${
                    user.isActive ? "bg-emerald-400" : "bg-stone-300"
                  }`}
                />
              </div>

              {/* Name */}
              <div>
                <p className="font-semibold text-stone-800 truncate">{user.name}</p>
                <p className="text-xs text-stone-400 mt-0.5 truncate">{user.email}</p>
              </div>

              {/* Role Badge */}
              <Badge variant={roleBadgeVariant[user.role] || "default"}>
                {roleLabel[user.role] || user.role}
              </Badge>

              {/* Branch + Last Active */}
              <div className="w-full pt-3 border-t border-stone-100 space-y-2">
                <div className="flex items-center justify-center gap-1.5 text-xs text-stone-500">
                  <MapPin className="w-3.5 h-3.5" />
                  <span>{user.branchName || "Unassigned"}</span>
                </div>
                <div className="flex items-center justify-center gap-1.5 text-xs text-stone-400">
                  <Clock className="w-3.5 h-3.5" />
                  <span>
                    {user.lastLogin
                      ? <RelativeTime date={user.lastLogin} fallback="Recently" />
                      : "Never logged in"}
                  </span>
                </div>
                {user.role === UserRole.DOCTOR && (user.consultationFee ?? 0) > 0 && (
                  <div className="flex items-center justify-center gap-1.5 text-xs text-stone-400">
                    <Stethoscope className="w-3.5 h-3.5" />
                    <span>Consultation fee: {user.consultationFee}</span>
                  </div>
                )}
                <div className="w-full mt-1 flex items-center gap-2">
                  <button
                    onClick={() => openEdit(user)}
                    className="flex-1 flex items-center justify-center gap-1.5 text-xs font-medium text-stone-500 hover:text-stone-800 hover:bg-stone-100 rounded-lg py-1.5 transition-colors"
                    aria-label={`Edit ${user.name}`}
                  >
                    <Pencil className="w-3.5 h-3.5" /> Edit
                  </button>
                  {currentUser?.id !== user.id && (
                    <button
                      onClick={() => handleDelete(user)}
                      disabled={deleteUser.isPending}
                      className="flex-1 flex items-center justify-center gap-1.5 text-xs font-medium text-red-500 hover:text-red-600 hover:bg-red-50 rounded-lg py-1.5 transition-colors disabled:opacity-50"
                      aria-label={`Remove ${user.name}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Remove
                    </button>
                  )}
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {filteredUsers.length === 0 && (
        <Card padding="lg">
          <p className="text-center text-stone-400 py-8">No team members found matching your search.</p>
        </Card>
      )}

      {/* Add / Edit Member Panel */}
      <SlidePanel
        isOpen={panelOpen}
        onClose={closePanel}
        title={editingId ? "Edit Team Member" : "Add Team Member"}
        subtitle={editingId ? "Update this staff member's details" : "Create a new staff account"}
        width="md"
        footer={
          <>
            <Button variant="ghost" onClick={closePanel}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={isSaving}>
              {isSaving
                ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Saving...</>
                : editingId ? "Save Changes" : "Create Member"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {(createUser.isError || updateUser.isError) && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-100 text-sm text-red-600">
              {createUser.error?.message || updateUser.error?.message || "Failed to save user"}
            </div>
          )}
          <Input label="Full Name" required placeholder="e.g. Dr. Sarah Ahmed" value={form.name} onChange={(e) => setField("name", e.target.value)} error={errors.name} />
          {!editingId && (
            <>
              <Input label="Email" required type="email" placeholder="sarah@clinic.com" value={form.email} onChange={(e) => setField("email", e.target.value)} error={errors.email} />
              <Input label="Password" required type="password" placeholder="Min 6 characters" value={form.password} onChange={(e) => setField("password", e.target.value)} error={errors.password} />
            </>
          )}
          <Select label="Role" required placeholder="Select role..." options={roleOptions} value={form.role} onChange={(e) => setField("role", e.target.value)} error={errors.role} />
          <Input label="Phone" placeholder="+20 100 000 0000" value={form.phone} onChange={(e) => setField("phone", e.target.value)} />
          <Select
            label="Branch"
            placeholder="Select branch..."
            options={branches.map((b) => ({ value: b.id, label: b.name }))}
            value={form.branchId}
            onChange={(e) => setField("branchId", e.target.value)}
          />
          {form.role === UserRole.DOCTOR && (
            <Input
              label="Consultation Fee"
              type="number"
              min={0}
              placeholder="e.g. 100"
              value={form.consultationFee}
              onChange={(e) => setField("consultationFee", e.target.value)}
              helperText="Auto-added to the invoice when a patient checks in for this doctor."
            />
          )}
        </div>
      </SlidePanel>
    </div>
  );
}
