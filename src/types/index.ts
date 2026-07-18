// ============================================================
// DentaCore ERP - Type Definitions
// ============================================================

export enum UserRole {
  SUPER_ADMIN = "SUPER_ADMIN",
  ADMIN = "ADMIN",
  DOCTOR = "DOCTOR",
  RECEPTIONIST = "RECEPTIONIST",
  BILLING = "BILLING",
  CALL_CENTER = "CALL_CENTER",
  ASSISTANT = "ASSISTANT",
}

export enum Gender {
  MALE = "MALE",
  FEMALE = "FEMALE",
  OTHER = "OTHER",
}

export enum AppointmentType {
  CONSULTATION = "CONSULTATION",
  PROCEDURE = "PROCEDURE",
  FOLLOW_UP = "FOLLOW_UP",
  REVIEW = "REVIEW",
  EMERGENCY = "EMERGENCY",
}

export enum AppointmentStatus {
  SCHEDULED = "SCHEDULED",
  CONFIRMED = "CONFIRMED",
  CHECKED_IN = "CHECKED_IN",
  WAITING = "WAITING",
  IN_PROGRESS = "IN_PROGRESS",
  COMPLETED = "COMPLETED",
  CANCELLED = "CANCELLED",
  NO_SHOW = "NO_SHOW",
  RESCHEDULED = "RESCHEDULED",
}

export enum Priority {
  NORMAL = "NORMAL",
  URGENT = "URGENT",
  EMERGENCY = "EMERGENCY",
}

export enum InvoiceStatus {
  DRAFT = "DRAFT",
  PENDING = "PENDING",
  PAID = "PAID",
  PARTIAL = "PARTIAL",
  OVERDUE = "OVERDUE",
  CANCELLED = "CANCELLED",
  REFUNDED = "REFUNDED",
}

export enum PaymentMethod {
  CASH = "CASH",
  CARD = "CARD",
  BANK_TRANSFER = "BANK_TRANSFER",
  DIGITAL_WALLET = "DIGITAL_WALLET",
  INSURANCE = "INSURANCE",
  PACKAGE_DEDUCTION = "PACKAGE_DEDUCTION",
}

export enum LeadStatus {
  NEW = "NEW",
  CONTACTED = "CONTACTED",
  INTERESTED = "INTERESTED",
  BOOKED = "BOOKED",
  NOT_INTERESTED = "NOT_INTERESTED",
  FOLLOW_UP = "FOLLOW_UP",
}

export enum LeadSource {
  CALL = "CALL",
  WALK_IN = "WALK_IN",
  WEBSITE = "WEBSITE",
  SOCIAL_MEDIA = "SOCIAL_MEDIA",
  REFERRAL = "REFERRAL",
}

export enum TreatmentCategory {
  PREVENTIVE = "PREVENTIVE",
  RESTORATIVE = "RESTORATIVE",
  ENDODONTIC = "ENDODONTIC",
  PROSTHODONTIC = "PROSTHODONTIC",
  PERIODONTIC = "PERIODONTIC",
  ORTHODONTIC = "ORTHODONTIC",
  SURGICAL = "SURGICAL",
  COSMETIC = "COSMETIC",
  DIAGNOSTIC = "DIAGNOSTIC",
  OTHER = "OTHER",
}

export enum WorkflowStage {
  INQUIRY = "INQUIRY",
  BOOKED = "BOOKED",
  CHECKIN = "CHECKIN",
  WAITING = "WAITING",
  CONSULT = "CONSULT",
  DIAGNOSIS = "DIAGNOSIS",
  TREATMENT = "TREATMENT",
  PRESCRIPTION = "PRESCRIPTION",
  BILLING = "BILLING",
  PAYMENT = "PAYMENT",
  CHECKOUT = "CHECKOUT",
  FOLLOWUP = "FOLLOWUP",
  HISTORY_UPDATE = "HISTORY_UPDATE",
}

export enum LabTestStatus {
  REQUESTED = "REQUESTED",
  SAMPLE_COLLECTED = "SAMPLE_COLLECTED",
  PROCESSING = "PROCESSING",
  COMPLETED = "COMPLETED",
  CANCELLED = "CANCELLED",
}

export enum DocumentType {
  REPORT = "REPORT",
  IMAGE = "IMAGE",
  CONSENT = "CONSENT",
  PRESCRIPTION = "PRESCRIPTION",
  LAB_RESULT = "LAB_RESULT",
  BEFORE_AFTER = "BEFORE_AFTER",
  OTHER = "OTHER",
}

export enum RoomType {
  CONSULTATION = "CONSULTATION",
  PROCEDURE = "PROCEDURE",
  WAITING = "WAITING",
  RECOVERY = "RECOVERY",
}

export enum RoomStatus {
  AVAILABLE = "AVAILABLE",
  OCCUPIED = "OCCUPIED",
  CLEANING = "CLEANING",
  MAINTENANCE = "MAINTENANCE",
}

// ---- Interfaces ----

export interface Branch {
  id: string;
  name: string;
  address: string;
  phone: string;
  email: string;
  isActive: boolean;
  createdAt: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
  phone: string;
  avatar?: string;
  role: UserRole;
  branchId: string;
  branchName?: string;
  speciality?: string;
  licenseNumber?: string;
  consultationFee?: number;
  isActive: boolean;
  lastLogin?: string;
  createdAt: string;
}

export interface Patient {
  id: string;
  patientCode: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  /** Null when only an approximate age was recorded. */
  dateOfBirth: string | null;
  /** Age today, resolved by the API from `dateOfBirth` or the stored age. */
  age: number | null;
  /** True when `age` is an estimate rather than derived from a real birthday. */
  ageIsApproximate?: boolean;
  gender: Gender;
  address: string;
  city: string;
  emergencyContact: string;
  emergencyPhone: string;
  bloodType: string;
  branchId: string;
  branchName?: string;
  assignedDoctorId?: string;
  assignedDoctorName?: string;
  profileImage?: string;
  notes?: string;
  isActive: boolean;
  allergies: string[];
  skinType?: string;
  lastVisit?: string;
  nextAppointment?: string;
  outstandingBalance: number;
  createdAt: string;
}

export interface Appointment {
  id: string;
  appointmentCode: string;
  patientId: string;
  patientName: string;
  doctorId: string;
  doctorName: string;
  branchId: string;
  branchName?: string;
  roomId?: string;
  roomName?: string;
  date: string;
  startTime: string;
  endTime: string;
  type: AppointmentType;
  status: AppointmentStatus;
  notes?: string;
  priority: Priority;
  waitlistPosition?: number;
  checkinTime?: string;
  checkoutTime?: string;
  workflowStage: WorkflowStage;
  createdBy: string;
  createdAt: string;
}

export interface ConsultationNote {
  id: string;
  appointmentId: string;
  patientId: string;
  doctorId: string;
  doctorName: string;
  chiefComplaint: string;
  symptoms: string;
  examination: string;
  diagnosis: string;
  treatmentPlan: string;
  advice: string;
  followUpDate?: string;
  followUpNotes?: string;
  isSigned?: boolean;
  signedAt?: string;
  createdAt: string;
}

export interface Treatment {
  id: string;
  name: string;
  category: TreatmentCategory;
  description: string;
  duration: number;
  basePrice: number;
  isActive: boolean;
}

export interface Procedure {
  id: string;
  appointmentId: string;
  patientId: string;
  doctorId: string;
  doctorName: string;
  treatmentId: string;
  treatmentName: string;
  notes: string;
  outcome?: string;
  complications?: string;
  beforeImages: string[];
  afterImages: string[];
  performedAt: string;
}

export interface Prescription {
  id: string;
  patientId: string;
  doctorId: string;
  doctorName: string;
  appointmentId?: string;
  items: PrescriptionItem[];
  notes?: string;
  createdAt: string;
}

export interface PrescriptionItem {
  id: string;
  medicineName: string;
  dosage: string;
  frequency: string;
  duration: string;
  instructions: string;
}

export interface LabTest {
  id: string;
  patientId: string;
  patientName?: string;
  doctorId: string;
  doctorName?: string;
  appointmentId?: string;
  testName: string;
  status: LabTestStatus;
  results?: Record<string, unknown>;
  technician?: string;
  collectedAt?: string;
  completedAt?: string;
  notes?: string;
  createdAt: string;
}

export interface PatientDocument {
  id: string;
  patientId: string;
  name: string;
  type: DocumentType;
  fileUrl: string;
  fileSize: number;
  uploadedById: string;
  uploadedByName?: string;
  notes?: string;
  createdAt: string;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  patientId: string;
  patientName: string;
  appointmentId?: string;
  branchId: string;
  items: InvoiceItem[];
  subtotal: number;
  discount: number;
  discountType: "PERCENTAGE" | "FIXED";
  tax: number;
  total: number;
  status: InvoiceStatus;
  dueDate: string;
  notes?: string;
  payments: Payment[];
  createdById: string;
  createdAt: string;
}

export interface InvoiceItem {
  description: string;
  type: "CONSULTATION" | "PROCEDURE" | "PRODUCT" | "PACKAGE";
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface Payment {
  id: string;
  invoiceId: string;
  amount: number;
  method: PaymentMethod;
  reference?: string;
  status: "PENDING" | "COMPLETED" | "FAILED" | "REFUNDED";
  processedById: string;
  processedByName?: string;
  processedAt: string;
  createdAt: string;
}

export interface Package {
  id: string;
  name: string;
  description: string;
  treatments: PackageTreatment[];
  price: number;
  validityDays: number;
  isActive: boolean;
  subscriberCount?: number;
  createdAt: string;
}

export interface PackageTreatment {
  treatmentId: string;
  treatmentName: string;
  sessions: number;
}

export interface PatientPackage {
  id: string;
  patientId: string;
  packageId: string;
  packageName: string;
  purchaseDate: string;
  expiryDate: string;
  remainingSessions: Record<string, number>;
  status: "ACTIVE" | "EXPIRED" | "CANCELLED";
  invoiceId?: string;
}

export interface Lead {
  id: string;
  name: string;
  phone: string;
  email?: string;
  source: LeadSource;
  status: LeadStatus;
  interest?: string;
  assignedToId: string;
  assignedToName?: string;
  branchId: string;
  notes?: string;
  convertedPatientId?: string;
  callbackDate?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CallLog {
  id: string;
  leadId?: string;
  patientId?: string;
  callerName: string;
  userId: string;
  agentName: string;
  type: "INBOUND" | "OUTBOUND";
  duration: number;
  notes?: string;
  outcome: "BOOKED" | "CALLBACK" | "NOT_INTERESTED" | "NO_ANSWER" | "INFO_PROVIDED";
  createdAt: string;
}

export interface CommunicationLog {
  id: string;
  patientId: string;
  type: "CALL" | "SMS" | "EMAIL" | "WHATSAPP" | "SYSTEM";
  direction: "INBOUND" | "OUTBOUND";
  subject: string;
  content: string;
  mediaUrl?: string | null;
  mediaMimeType?: string | null;
  sentById: string;
  sentByName?: string;
  createdAt: string;
}

export interface FollowUp {
  id: string;
  patientId: string;
  patientName: string;
  doctorId: string;
  doctorName: string;
  appointmentId?: string;
  dueDate: string;
  reason: string;
  status: "PENDING" | "COMPLETED" | "MISSED" | "CANCELLED";
  notes?: string;
  completedAt?: string;
  createdAt: string;
}

export interface AITranscription {
  id: string;
  appointmentId: string;
  patientId: string;
  patientName: string;
  doctorId: string;
  doctorName: string;
  rawTranscript: string;
  structuredNote?: Record<string, unknown>;
  summary?: string;
  status: "RECORDING" | "PROCESSING" | "COMPLETED" | "FAILED";
  duration: number;
  createdAt: string;
}

export interface Notification {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: "APPOINTMENT" | "BILLING" | "LAB" | "FOLLOW_UP" | "SYSTEM" | "ALERT" | "COMMUNICATION";
  isRead: boolean;
  link?: string;
  createdAt: string;
}

export interface Triage {
  id: string;
  patientId: string;
  patientName?: string;
  appointmentId?: string;
  temperature?: number;
  systolicBP?: number;
  diastolicBP?: number;
  heartRate?: number;
  respiratoryRate?: number;
  weight?: number;
  height?: number;
  oxygenSaturation?: number;
  bmi?: string;
  notes?: string;
  skinObservations?: string;
  urgencyLevel?: "ROUTINE" | "URGENT" | "EMERGENCY";
  recordedById: string;
  recordedByName?: string;
  createdAt: string;
}

export interface Room {
  id: string;
  branchId: string;
  name: string;
  type: RoomType;
  status: RoomStatus;
  isAvailable: boolean;
  capacity: number;
  currentPatientId?: string;
  currentPatientName?: string;
  currentDoctorName?: string;
  occupiedSince?: string;
}

export interface RoomAllocation {
  id: string;
  patientId: string;
  patientName: string;
  roomId: string;
  roomName: string;
  doctorId: string;
  doctorName: string;
  bedNumber?: string;
  admissionDate: string;
  dischargeDate?: string;
  status: "ACTIVE" | "DISCHARGED";
}

export interface AuditLog {
  id: string;
  userId: string;
  userName: string;
  action: string;
  module: string;
  entityType: string;
  entityId: string;
  details?: string;
  ipAddress: string;
  createdAt: string;
}

export interface SkinHistory {
  id: string;
  patientId: string;
  condition: string;
  affectedArea: string;
  severity: "MILD" | "MODERATE" | "SEVERE";
  onsetDate: string;
  treatmentHistory: string;
  notes: string;
  images: string[];
}

export interface MedicalHistory {
  id: string;
  patientId: string;
  condition: string;
  diagnosedDate: string;
  status: "ACTIVE" | "RESOLVED" | "CHRONIC";
  notes: string;
}

export interface Insurance {
  id: string;
  patientId: string;
  provider: string;
  policyNumber: string;
  coverageType: string;
  expiryDate: string;
  isActive: boolean;
}

// ---- Permission System ----
export interface Permission {
  id: string;
  module: string;
  action: "VIEW" | "CREATE" | "EDIT" | "DELETE" | "EXPORT";
  granted: boolean;
}

export interface RolePermissions {
  role: UserRole;
  permissions: Permission[];
}

// ---- Dashboard Types ----
export interface DashboardStat {
  id: string;
  label: string;
  value: string | number;
  icon: string;
  trend?: number;
  trendLabel?: string;
  color: "primary" | "success" | "warning" | "danger" | "info";
}

export interface ActivityItem {
  id: string;
  user: string;
  action: string;
  target: string;
  time: string;
  type: string;
}

// ---- API Response Types ----
export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

export interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
