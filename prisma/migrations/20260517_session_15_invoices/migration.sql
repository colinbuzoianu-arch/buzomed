-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('draft', 'issued', 'paid', 'overdue', 'cancelled');

-- CreateTable: invoices
CREATE TABLE "invoices" (
    "id"               UUID          NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id"        UUID          NOT NULL,
    "company_id"       UUID          NOT NULL,
    "contract_id"      UUID,
    "invoice_number"   TEXT          NOT NULL,
    "invoice_year"     INTEGER       NOT NULL,
    "invoice_sequence" INTEGER       NOT NULL,
    "status"           "InvoiceStatus" NOT NULL DEFAULT 'draft',
    "issued_at"        TIMESTAMPTZ,
    "due_date"         DATE,
    "paid_at"          TIMESTAMPTZ,
    "subtotal"         DECIMAL(12,2) NOT NULL,
    "vat_rate"         DECIMAL(5,4)  NOT NULL DEFAULT 0,
    "vat_amount"       DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total"            DECIMAL(12,2) NOT NULL,
    "currency"         TEXT          NOT NULL DEFAULT 'RON',
    "vat_exempt_reason" TEXT,
    "notes"            TEXT,
    "created_at"       TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"       TIMESTAMPTZ   NOT NULL,
    "deleted_at"       TIMESTAMPTZ,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable: invoice_items
CREATE TABLE "invoice_items" (
    "id"          UUID          NOT NULL DEFAULT gen_random_uuid(),
    "invoice_id"  UUID          NOT NULL,
    "tenant_id"   UUID          NOT NULL,
    "description" TEXT          NOT NULL,
    "quantity"    DECIMAL(10,2) NOT NULL,
    "unit_price"  DECIMAL(12,2) NOT NULL,
    "line_total"  DECIMAL(12,2) NOT NULL,
    "sort_order"  INTEGER       NOT NULL DEFAULT 0,

    CONSTRAINT "invoice_items_pkey" PRIMARY KEY ("id")
);

-- Unique index
CREATE UNIQUE INDEX "invoices_tenant_id_invoice_year_invoice_sequence_key"
    ON "invoices"("tenant_id", "invoice_year", "invoice_sequence");

-- Indexes: invoices
CREATE INDEX "invoices_tenant_id_idx"        ON "invoices"("tenant_id");
CREATE INDEX "invoices_company_id_idx"       ON "invoices"("company_id");
CREATE INDEX "invoices_tenant_id_status_idx" ON "invoices"("tenant_id", "status");
CREATE INDEX "invoices_deleted_at_idx"       ON "invoices"("deleted_at");

-- Indexes: invoice_items
CREATE INDEX "invoice_items_invoice_id_idx" ON "invoice_items"("invoice_id");
CREATE INDEX "invoice_items_tenant_id_idx"  ON "invoice_items"("tenant_id");

-- FK: invoices
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "invoices" ADD CONSTRAINT "invoices_company_id_fkey"
    FOREIGN KEY ("company_id") REFERENCES "companies"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "invoices" ADD CONSTRAINT "invoices_contract_id_fkey"
    FOREIGN KEY ("contract_id") REFERENCES "contracts"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- FK: invoice_items
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_invoice_id_fkey"
    FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
