import { z } from "zod";

export const signupSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email().max(200),
  password: z.string().min(8).max(128),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const createUserSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email().max(200),
  password: z.string().min(8).max(128),
  phone: z.string().max(50).optional().nullable(),
  avatar: z.string().url().optional().nullable(),
  role: z.enum(["DOCTOR", "RECEPTIONIST", "BILLING", "CALL_CENTER", "ASSISTANT"]),
  branchId: z.string().min(1),
  speciality: z.string().max(200).optional().nullable(),
  licenseNumber: z.string().max(100).optional().nullable(),
});

export const createAppointmentSchema = z.object({
  patientId: z.string().min(1),
  doctorId: z.string().min(1),
  branchId: z.string().min(1),
  roomId: z.string().min(1).optional().nullable(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  durationMinutes: z.number().int().min(5).max(480).optional(),
  type: z.enum(["CONSULTATION", "PROCEDURE", "FOLLOW_UP", "REVIEW", "EMERGENCY"]).optional(),
  notes: z.string().max(2000).optional().nullable(),
  priority: z.enum(["NORMAL", "URGENT", "EMERGENCY"]).optional(),
  createdById: z.string().min(1).optional(),
  /**
   * Optional recurrence. When set, the endpoint creates N copies of the
   * appointment at the specified interval. The first occurrence uses the
   * `date` field above; subsequent occurrences add `intervalWeeks` to it.
   */
  recurrence: z.object({
    pattern: z.enum(["WEEKLY", "BIWEEKLY", "MONTHLY", "EVERY_N_WEEKS"]),
    intervalWeeks: z.number().int().min(1).max(52).optional(),
    count: z.number().int().min(2).max(52),
  }).optional(),
});

export const createPatientSchema = z.object({
  firstName: z.string().min(1).max(200),
  lastName: z.string().min(1).max(200),
  email: z.string().email().max(200).optional().nullable(),
  phone: z.string().min(1).max(50),
  dateOfBirth: z.string().optional().nullable(),
  gender: z.enum(["MALE", "FEMALE", "OTHER"]).optional(),
  address: z.string().max(500).optional().nullable(),
  city: z.string().max(100).optional().nullable(),
  emergencyContactName: z.string().max(200).optional().nullable(),
  emergencyContactPhone: z.string().max(50).optional().nullable(),
  bloodGroup: z.string().max(10).optional().nullable(),
  allergies: z.string().max(2000).optional().nullable(),
  notes: z.string().max(5000).optional().nullable(),
  branchId: z.string().min(1).optional(),
  assignedDoctorId: z.string().min(1).optional().nullable(),
  referralSource: z.string().max(200).optional().nullable(),
  insuranceProvider: z.string().max(200).optional().nullable(),
  insurancePolicyNumber: z.string().max(200).optional().nullable(),
});

export const createPaymentSchema = z.object({
  invoiceId: z.string().min(1),
  amount: z.number().positive(),
  method: z.enum(["CASH", "CARD", "BANK_TRANSFER", "DIGITAL_WALLET", "INSURANCE", "PACKAGE_DEDUCTION"]),
  reference: z.string().max(200).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  processedById: z.string().min(1).optional(),
});

export function validate<T>(schema: z.ZodSchema<T>, data: unknown): { success: true; data: T } | { success: false; error: string } {
  const result = schema.safeParse(data);
  if (!result.success) {
    const msg = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    return { success: false, error: msg };
  }
  return { success: true, data: result.data };
}
