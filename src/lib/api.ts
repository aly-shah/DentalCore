/**
 * API client helpers for frontend data fetching.
 */

const BASE = "";

function buildQuery(params?: Record<string, string | undefined>): string {
  if (!params) return "";
  const clean: Record<string, string> = {};
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "" && v !== "undefined") clean[k] = v;
  }
  const qs = new URLSearchParams(clean).toString();
  return qs ? `?${qs}` : "";
}

interface ApiResponse<T> {
  success: boolean;
  data: T;
  error?: string;
  total?: number;
  page?: number;
  pageSize?: number;
}

async function apiFetch<T>(url: string, options?: RequestInit): Promise<ApiResponse<T>> {
  const res = await fetch(BASE + url, {
    headers: { "Content-Type": "application/json", ...options?.headers },
    ...options,
  });

  if (res.status === 401) {
    // Session expired — redirect to login
    if (typeof window !== "undefined") {
      window.location.href = "/login";
    }
    throw new Error("Unauthorized");
  }

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error || `API error: ${res.status}`);
  }

  return data;
}

// ---- GET helpers ----
export const api = {
  // Auth
  me: () => apiFetch<unknown>("/api/auth/me"),

  // Patients
  patients: {
    list: (params?: Record<string, string>) => {
      const qs = buildQuery(params);
      return apiFetch<unknown[]>(`/api/patients${qs}`);
    },
    get: (id: string) => apiFetch<unknown>(`/api/patients/${id}`),
    create: (data: Record<string, unknown>) => apiFetch<unknown>("/api/patients", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: Record<string, unknown>) => apiFetch<unknown>(`/api/patients/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    delete: (id: string) => apiFetch<unknown>(`/api/patients/${id}`, { method: "DELETE" }),
    appointments: (id: string) => apiFetch<unknown[]>(`/api/patients/${id}/appointments`),
    notes: (id: string) => apiFetch<unknown[]>(`/api/patients/${id}/notes`),
    prescriptions: (id: string) => apiFetch<unknown[]>(`/api/patients/${id}/prescriptions`),
    documents: (id: string) => apiFetch<unknown[]>(`/api/patients/${id}/documents`),
    billing: (id: string) => apiFetch<unknown[]>(`/api/patients/${id}/billing`),
    labTests: (id: string) => apiFetch<unknown[]>(`/api/patients/${id}/lab-tests`),
    followUps: (id: string) => apiFetch<unknown[]>(`/api/patients/${id}/follow-ups`),
    triage: (id: string) => apiFetch<unknown[]>(`/api/patients/${id}/triage`),
  },

  // Appointments
  appointments: {
    list: (params?: Record<string, string>) => {
      const qs = buildQuery(params);
      return apiFetch<unknown[]>(`/api/appointments${qs}`);
    },
    get: (id: string) => apiFetch<unknown>(`/api/appointments/${id}`),
    create: (data: Record<string, unknown>) => apiFetch<unknown>("/api/appointments", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: Record<string, unknown>) => apiFetch<unknown>(`/api/appointments/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    checkIn: (id: string) => apiFetch<unknown>(`/api/appointments/${id}/check-in`, { method: "POST" }),
    checkout: (id: string) => apiFetch<unknown>(`/api/appointments/${id}/checkout`, { method: "POST" }),
    calendar: (params?: Record<string, string>) => {
      const qs = buildQuery(params);
      return apiFetch<unknown>(`/api/appointments/calendar${qs}`);
    },
  },

  // Billing
  billing: {
    invoices: (params?: Record<string, string>) => {
      const qs = buildQuery(params);
      return apiFetch<unknown[]>(`/api/billing/invoices${qs}`);
    },
    invoice: (id: string) => apiFetch<unknown>(`/api/billing/invoices/${id}`),
    createInvoice: (data: Record<string, unknown>) => apiFetch<unknown>("/api/billing/invoices", { method: "POST", body: JSON.stringify(data) }),
    updateInvoice: (id: string, data: Record<string, unknown>) => apiFetch<unknown>(`/api/billing/invoices/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    emailInvoice: (id: string, data?: Record<string, unknown>) => apiFetch<unknown>(`/api/billing/invoices/${id}/email`, { method: "POST", body: JSON.stringify(data ?? {}) }),
    whatsappInvoice: (id: string, data?: Record<string, unknown>) => apiFetch<unknown>(`/api/billing/invoices/${id}/whatsapp`, { method: "POST", body: JSON.stringify(data ?? {}) }),
    payments: (params?: Record<string, string>) => {
      const qs = buildQuery(params);
      return apiFetch<unknown[]>(`/api/billing/payments${qs}`);
    },
    pay: (data: Record<string, unknown>) => apiFetch<unknown>("/api/billing/payments", { method: "POST", body: JSON.stringify(data) }),
  },

  // Treatments & Packages
  treatments: {
    list: (params?: Record<string, string>) => {
      const qs = buildQuery(params);
      return apiFetch<unknown[]>(`/api/treatments${qs}`);
    },
    create: (data: Record<string, unknown>) => apiFetch<unknown>("/api/treatments", { method: "POST", body: JSON.stringify(data) }),
  },
  packages: {
    list: () => apiFetch<unknown[]>("/api/packages"),
    create: (data: Record<string, unknown>) => apiFetch<unknown>("/api/packages", { method: "POST", body: JSON.stringify(data) }),
  },

  // Call Center
  leads: {
    list: (params?: Record<string, string>) => {
      const qs = buildQuery(params);
      return apiFetch<unknown[]>(`/api/leads${qs}`);
    },
    get: (id: string) => apiFetch<unknown>(`/api/leads/${id}`),
    create: (data: Record<string, unknown>) => apiFetch<unknown>("/api/leads", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: Record<string, unknown>) => apiFetch<unknown>(`/api/leads/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  },
  callLogs: {
    list: () => apiFetch<unknown[]>("/api/call-logs"),
    create: (data: Record<string, unknown>) => apiFetch<unknown>("/api/call-logs", { method: "POST", body: JSON.stringify(data) }),
  },

  // Rooms
  rooms: {
    list: (params?: Record<string, string>) => {
      const qs = buildQuery(params);
      return apiFetch<unknown[]>(`/api/rooms${qs}`);
    },
    update: (id: string, data: Record<string, unknown>) => apiFetch<unknown>(`/api/rooms/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    remove: (id: string) => apiFetch<unknown>(`/api/rooms/${id}`, { method: "DELETE" }),
  },

  // Lab Tests
  labTests: {
    list: (params?: Record<string, string>) => {
      const qs = buildQuery(params);
      return apiFetch<unknown[]>(`/api/lab-tests${qs}`);
    },
    create: (data: Record<string, unknown>) => apiFetch<unknown>("/api/lab-tests", { method: "POST", body: JSON.stringify(data) }),
  },

  // Follow-ups
  followUps: {
    list: (params?: Record<string, string>) => {
      const qs = buildQuery(params);
      return apiFetch<unknown[]>(`/api/follow-ups${qs}`);
    },
    update: (id: string, data: Record<string, unknown>) => apiFetch<unknown>(`/api/follow-ups/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    create: (data: Record<string, unknown>) => apiFetch<unknown>("/api/follow-ups", { method: "POST", body: JSON.stringify(data) }),
  },

  // Dashboard
  dashboard: {
    stats: (role?: string) => apiFetch<unknown>(`/api/dashboard/stats${role ? "?role=" + role : ""}`),
  },

  // Admin
  admin: {
    users: () => apiFetch<unknown[]>("/api/admin/users"),
    createUser: (data: Record<string, unknown>) => apiFetch<unknown>("/api/admin/users", { method: "POST", body: JSON.stringify(data) }),
    updateUser: (id: string, data: Record<string, unknown>) => apiFetch<unknown>(`/api/admin/users/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    deleteUser: (id: string) => apiFetch<{ action?: string; linkedRecords?: number }>(`/api/admin/users/${id}`, { method: "DELETE" }),
    branches: () => apiFetch<unknown[]>("/api/admin/branches"),
    createBranch: (data: Record<string, unknown>) => apiFetch<unknown>("/api/admin/branches", { method: "POST", body: JSON.stringify(data) }),
    updateBranch: (id: string, data: Record<string, unknown>) => apiFetch<unknown>(`/api/admin/branches/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    deleteBranch: (id: string) => apiFetch<{ action?: string; linkedRecords?: number }>(`/api/admin/branches/${id}`, { method: "DELETE" }),
    auditLog: (params?: Record<string, string>) => {
      const qs = buildQuery(params);
      return apiFetch<unknown[]>(`/api/admin/audit-log${qs}`);
    },
  },

  // Notifications
  notifications: {
    list: () => apiFetch<unknown>("/api/notifications"),
    markRead: (ids: string[]) => apiFetch<unknown>("/api/notifications", { method: "PUT", body: JSON.stringify({ ids }) }),
  },

  // AI
  ai: {
    transcribe: (data: Record<string, unknown>) => apiFetch<unknown>("/api/ai/transcribe", { method: "POST", body: JSON.stringify(data) }),
    summarize: (data: Record<string, unknown>) => apiFetch<unknown>("/api/ai/summarize", { method: "POST", body: JSON.stringify(data) }),
  },
};
