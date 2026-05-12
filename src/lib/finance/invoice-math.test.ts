import { describe, expect, it } from "vitest";
import { computeInvoiceFinancials, totalPaid, validateRefund } from "./invoice-math";

describe("computeInvoiceFinancials", () => {
  it("no payments → PENDING with full balance", () => {
    const r = computeInvoiceFinancials(1000, []);
    expect(r.amountPaid).toBe(0);
    expect(r.balanceDue).toBe(1000);
    expect(r.status).toBe("PENDING");
  });

  it("preserves DRAFT when no payments", () => {
    const r = computeInvoiceFinancials(1000, [], "DRAFT");
    expect(r.status).toBe("DRAFT");
  });

  it("partial payment → PARTIAL with remaining balance", () => {
    const r = computeInvoiceFinancials(1000, [{ amount: 300 }]);
    expect(r.amountPaid).toBe(300);
    expect(r.balanceDue).toBe(700);
    expect(r.status).toBe("PARTIAL");
  });

  it("multiple partial payments sum correctly", () => {
    const r = computeInvoiceFinancials(1000, [
      { amount: 200 },
      { amount: 300 },
      { amount: 100 },
    ]);
    expect(r.amountPaid).toBe(600);
    expect(r.balanceDue).toBe(400);
    expect(r.status).toBe("PARTIAL");
  });

  it("payments exactly covering total → PAID", () => {
    const r = computeInvoiceFinancials(1000, [{ amount: 1000 }]);
    expect(r.balanceDue).toBe(0);
    expect(r.status).toBe("PAID");
  });

  it("overpayment → PAID with non-negative balance", () => {
    const r = computeInvoiceFinancials(1000, [{ amount: 1500 }]);
    expect(r.amountPaid).toBe(1500);
    expect(r.balanceDue).toBe(0); // never negative
    expect(r.status).toBe("PAID");
  });

  it("CANCELLED invoice stays CANCELLED regardless of payments", () => {
    const r = computeInvoiceFinancials(1000, [{ amount: 500 }], "CANCELLED");
    expect(r.status).toBe("CANCELLED");
  });

  it("floating-point payments add precisely enough", () => {
    const r = computeInvoiceFinancials(99.99, [{ amount: 49.995 }, { amount: 49.995 }]);
    expect(r.amountPaid).toBe(99.99);
    expect(r.balanceDue).toBeCloseTo(0, 4);
  });
});

describe("totalPaid", () => {
  it("sums an empty list to zero", () => {
    expect(totalPaid([])).toBe(0);
  });
  it("sums payments", () => {
    expect(totalPaid([{ amount: 100 }, { amount: 250 }])).toBe(350);
  });
});

describe("validateRefund", () => {
  const baseCheck = { invoiceStatus: "PAID" as const, paid: 1000, alreadyRefunded: 0 };

  it("permits a refund within paid amount", () => {
    expect(validateRefund({ ...baseCheck, requested: 300 })).toEqual({ ok: true });
  });

  it("permits a full refund (= paid)", () => {
    expect(validateRefund({ ...baseCheck, requested: 1000 })).toEqual({ ok: true });
  });

  it("rejects refund > paid", () => {
    const r = validateRefund({ ...baseCheck, requested: 1001 });
    expect(r).toEqual({ ok: false, reason: "EXCEEDS_PAID" });
  });

  it("rejects cumulative refunds exceeding paid", () => {
    const r = validateRefund({ ...baseCheck, alreadyRefunded: 800, requested: 300 });
    expect(r).toEqual({ ok: false, reason: "EXCEEDS_PAID" });
  });

  it("rejects zero amount", () => {
    expect(validateRefund({ ...baseCheck, requested: 0 })).toEqual({
      ok: false,
      reason: "INVALID_AMOUNT",
    });
  });

  it("rejects negative amount", () => {
    expect(validateRefund({ ...baseCheck, requested: -100 })).toEqual({
      ok: false,
      reason: "INVALID_AMOUNT",
    });
  });

  it("rejects refund on DRAFT invoice (nothing collected yet)", () => {
    expect(
      validateRefund({ invoiceStatus: "DRAFT", paid: 0, alreadyRefunded: 0, requested: 100 })
    ).toEqual({ ok: false, reason: "INVOICE_NOT_PAID" });
  });

  it("rejects refund on PENDING invoice with no payments", () => {
    expect(
      validateRefund({ invoiceStatus: "PENDING", paid: 0, alreadyRefunded: 0, requested: 100 })
    ).toEqual({ ok: false, reason: "INVOICE_NOT_PAID" });
  });

  it("rejects refund on CANCELLED invoice", () => {
    expect(
      validateRefund({ invoiceStatus: "CANCELLED", paid: 1000, alreadyRefunded: 0, requested: 100 })
    ).toEqual({ ok: false, reason: "INVOICE_CANCELLED" });
  });

  it("PARTIAL invoice can still be refunded for paid portion", () => {
    expect(
      validateRefund({ invoiceStatus: "PARTIAL", paid: 500, alreadyRefunded: 0, requested: 200 })
    ).toEqual({ ok: true });
  });
});
