/**
 * Strip PHI + secrets from Sentry events before transmission.
 *
 * Sentry's default scrubbing handles auth headers and common password
 * fields, but doesn't know about our domain (patient names, phone
 * numbers, insurance member IDs, prescription content). This function
 * walks the event payload and redacts anything that looks like PHI.
 */
import type { ErrorEvent, EventHint, TransactionEvent } from "@sentry/core";

type AnyEvent = ErrorEvent | TransactionEvent;

const PHI_FIELD_NAMES = new Set([
  "firstname", "lastname", "middlename", "name", "fullname",
  "email", "phone", "phonenumber", "mobile", "emergencycontact",
  "address", "city", "dateofbirth", "dob", "ssn",
  "policynumber", "membernumber", "groupnumber",
  "diagnosis", "chiefcomplaint", "treatmentplan", "notes",
  "internalnotes", "rawtranscript", "structurednote",
  "medicinename", "dosage", "instructions",
  "password", "passwordhash", "passphrase", "token", "secret",
  "apikey", "authorization", "cookie",
]);

const PHI_FIELD_PATTERNS = [
  /password/i,
  /secret/i,
  /token/i,
  /api[_-]?key/i,
  /authorization/i,
];

const REDACTED = "[Filtered]";

function shouldRedactKey(key: string): boolean {
  const norm = key.toLowerCase().replace(/[_-]/g, "");
  if (PHI_FIELD_NAMES.has(norm)) return true;
  return PHI_FIELD_PATTERNS.some((re) => re.test(key));
}

function scrubValue(value: unknown, depth: number): unknown {
  if (depth > 5) return REDACTED; // bail on deep structures
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return value;
  if (typeof value !== "object") return value;

  if (Array.isArray(value)) {
    return value.map((v) => scrubValue(v, depth + 1));
  }

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = shouldRedactKey(k) ? REDACTED : scrubValue(v, depth + 1);
  }
  return out;
}

export function scrubSentryEvent(event: AnyEvent, _hint?: EventHint): AnyEvent | null {
  // Strip request body / query / cookies — these almost always contain
  // either a session cookie (no PHI but still a credential) or form data
  // with patient inputs.
  if (event.request) {
    if (event.request.data) {
      event.request.data = scrubValue(event.request.data, 0) as typeof event.request.data;
    }
    if (event.request.cookies) {
      event.request.cookies = REDACTED as unknown as typeof event.request.cookies;
    }
    if (event.request.headers) {
      const headers = event.request.headers as Record<string, string>;
      for (const k of Object.keys(headers)) {
        if (shouldRedactKey(k)) headers[k] = REDACTED;
      }
    }
    if (event.request.query_string && typeof event.request.query_string === "string") {
      // Don't try to redact specific query params — they may contain
      // patient codes, ids etc. The query string is rarely useful for
      // debugging; replace it entirely if it looks long.
      if (event.request.query_string.length > 100) {
        event.request.query_string = "[Filtered]";
      }
    }
  }

  // Strip "extra" data
  if (event.extra) {
    event.extra = scrubValue(event.extra, 0) as typeof event.extra;
  }

  // Strip breadcrumbs that look like fetch bodies
  if (event.breadcrumbs) {
    for (const b of event.breadcrumbs) {
      if (b.data) {
        b.data = scrubValue(b.data, 0) as typeof b.data;
      }
    }
  }

  // User: keep only id + role; drop name / email
  if (event.user) {
    const u = event.user as Record<string, unknown>;
    event.user = {
      id: typeof u.id === "string" ? u.id : undefined,
      ip_address: typeof u.ip_address === "string" ? u.ip_address : undefined,
      segment: typeof u.role === "string" ? u.role : undefined,
    };
  }

  return event;
}
