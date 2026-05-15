-- Online payment gateway support: extend Payment with gateway provenance
-- and add PaymentSession to track in-flight checkouts.

ALTER TABLE "Payment"
  ADD COLUMN "gatewayProvider"  TEXT,
  ADD COLUMN "gatewayReference" TEXT,
  ADD COLUMN "gatewayFeeCents"  INTEGER;

CREATE INDEX "Payment_gatewayProvider_gatewayReference_idx"
  ON "Payment"("gatewayProvider", "gatewayReference");

CREATE TABLE "PaymentSession" (
  "id"               TEXT NOT NULL PRIMARY KEY,
  "tenantId"         TEXT,
  "invoiceId"        TEXT NOT NULL,
  "provider"         TEXT NOT NULL,
  "gatewayReference" TEXT NOT NULL,
  "amount"           DOUBLE PRECISION NOT NULL,
  "currency"         TEXT NOT NULL DEFAULT 'USD',
  "status"           TEXT NOT NULL DEFAULT 'PENDING',
  "checkoutUrl"      TEXT,
  "returnUrl"        TEXT,
  "createdById"      TEXT,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt"      TIMESTAMP(3),

  CONSTRAINT "PaymentSession_invoiceId_fkey"
    FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "PaymentSession_gatewayReference_key"
  ON "PaymentSession"("gatewayReference");
CREATE INDEX "PaymentSession_invoiceId_idx"     ON "PaymentSession"("invoiceId");
CREATE INDEX "PaymentSession_status_idx"        ON "PaymentSession"("status");
CREATE INDEX "PaymentSession_tenantId_idx"      ON "PaymentSession"("tenantId");
