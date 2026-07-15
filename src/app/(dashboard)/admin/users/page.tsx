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
import { useStaff, useCreateUser, useDeleteUser, useBranches } from "@/hooks/use-queries";
import { useAuth } from "@/lib/auth-context";
import { UserRole } from "@/types";
import type { User, Branch } from "@/types";
import { timeAgo } from "@/lib/utils";

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
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { data: staffResponse, isLoading } = useStaff();
  const { data: branchesResponse } = useBranches();
  const createUser = useCreateUser();
  const deleteUser = useDeleteUser();
  const { user: currentUser } = useAuth();
  const users = (staffResponse?.data || []) as User[];
  const branches = (branchesResponse?.data || []) as Branch[];

  function handleDelete(user: User) {
    const ok = window.confirm(
      `Remove ${user.name}?\n\nIf they have appointments, notes or invoices they'll be deactivated (hidden but history kept). Otherwise they'll be permanently deleted.`
    );
    if (!ok) return;
    deleteUser.mutate(user.id, {
      onSuccess: (res) => {
        const action = (res as { action?: string })?.action;
        window.alert(action === "deactivated" ? `${user.name} was deactivated (linked records kept).` : `${user.name} was deleted.`);
      },
      onError: () => window.alert(`Could not remove ${user.name}. Please try again.`),
    });
  }

  function setField(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors((prev) => { const next = { ...prev }; delete next[field]; return next; });
  }

  function validate() {
    const errs: Record<string, string> = {};
    if (!form.name.trim()) errs.name = "Name is required";
    if (!form.email.trim()) errs.email = "Email is required";
    else if (!/\S+@\S+\.\S+/.test(form.email)) errs.email = "Invalid email";
    if (!form.password.trim()) errs.password = "Password is required";
    else if (form.password.length < 6) errs.password = "Min 6 characters";
    if (!form.role) errs.role = "Role is required";
    return errs;
  }

  function handleSubmit() {
    const errs = validate();
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }
    createUser.mutate(form, {
      onSuccess: () => {
        setPanelOpen(false);
        setForm(emptyForm);
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
        <Button iconLeft={<Plus className="w-4 h-4" />} onClick={() => setPanelOpen(true)}>Add Member</Button>
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
                  <span>{user.lastLogin ? timeAgo(user.lastLogin) : "Never logged in"}</span>
                </div>
                {user.role === UserRole.DOCTOR && (user.consultationFee ?? 0) > 0 && (
                  <div className="flex items-center justify-center gap-1.5 text-xs text-stone-400">
                    <Stethoscope className="w-3.5 h-3.5" />
                    <span>Consultation fee: {user.consultationFee}</span>
                  </div>
                )}
                {currentUser?.id !== user.id && (
                  <button
                    onClick={() => handleDelete(user)}
                    disabled={deleteUser.isPending}
                    className="w-full mt-1 flex items-center justify-center gap-1.5 text-xs font-medium text-red-500 hover:text-red-600 hover:bg-red-50 rounded-lg py-1.5 transition-colors disabled:opacity-50"
                    aria-label={`Remove ${user.name}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Remove
                  </button>
                )}
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

      {/* Add Member Panel */}
      <SlidePanel
        isOpen={panelOpen}
        onClose={() => { setPanelOpen(false); setForm(emptyForm); setErrors({}); createUser.reset(); }}
        title="Add Team Member"
        subtitle="Create a new staff account"
        width="md"
        footer={
          <>
            <Button variant="ghost" onClick={() => { setPanelOpen(false); setForm(emptyForm); setErrors({}); createUser.reset(); }}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={createUser.isPending}>
              {createUser.isPending ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Creating...</> : "Create Member"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {createUser.isError && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-100 text-sm text-red-600">
              {createUser.error?.message || "Failed to create user"}
            </div>
          )}
          <Input label="Full Name" required placeholder="e.g. Dr. Sarah Ahmed" value={form.name} onChange={(e) => setField("name", e.target.value)} error={errors.name} />
          <Input label="Email" required type="email" placeholder="sarah@clinic.com" value={form.email} onChange={(e) => setField("email", e.target.value)} error={errors.email} />
          <Input label="Password" required type="password" placeholder="Min 6 characters" value={form.password} onChange={(e) => setField("password", e.target.value)} error={errors.password} />
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
