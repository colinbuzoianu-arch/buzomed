-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('super_admin', 'practice_admin', 'practitioner', 'assistant');

-- CreateEnum
CREATE TYPE "SubscriptionTier" AS ENUM ('trial', 'solo', 'practice', 'enterprise');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('active', 'past_due', 'cancelled', 'suspended');

-- CreateEnum
CREATE TYPE "IdDocumentType" AS ENUM ('cnp', 'passport', 'eu_id_card', 'other');

-- CreateEnum
CREATE TYPE "EmployeeArchivedReason" AS ENUM ('left_employment', 'retired', 'deceased', 'transferred', 'other');

-- CreateEnum
CREATE TYPE "WorkAssignmentReason" AS ENUM ('hired', 'promoted', 'transferred', 'role_change', 'department_change', 'other');

-- CreateEnum
CREATE TYPE "ExaminationStatus" AS ENUM ('scheduled', 'in_progress', 'completed', 'cancelled', 'no_show');

-- CreateEnum
CREATE TYPE "ExaminationRequestSource" AS ENUM ('employer_request', 'periodic_due', 'employee_request', 'legal_obligation', 'other');

-- CreateEnum
CREATE TYPE "ExaminationVerdict" AS ENUM ('apt', 'apt_conditionat', 'inapt_temporar', 'inapt');

-- CreateEnum
CREATE TYPE "DocumentEntityType" AS ENUM ('examination', 'employee', 'workplace', 'company', 'vaccination', 'medical_event');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('fisa_aptitudine', 'fisa_factori_risc', 'dosarul_medical', 'raport_medical', 'adeverinta_medicala', 'vaccination_certificate', 'lab_result', 'referral', 'external_document', 'other');

-- CreateEnum
CREATE TYPE "SignatureMethod" AS ENUM ('digital_image', 'qualified_electronic_signature', 'physical_print_sign');

-- CreateEnum
CREATE TYPE "TemplateFormat" AS ENUM ('html_handlebars', 'docx_template');

-- CreateEnum
CREATE TYPE "AdministrationRoute" AS ENUM ('intramuscular', 'subcutaneous', 'oral', 'intranasal', 'other');

-- CreateEnum
CREATE TYPE "MedicalEventType" AS ENUM ('workplace_accident', 'sudden_illness', 'first_aid', 'evacuation', 'other');

-- CreateEnum
CREATE TYPE "MedicalEventOutcome" AS ENUM ('returned_to_work', 'sent_home', 'referred_to_hospital', 'ambulance_called', 'other');

-- CreateEnum
CREATE TYPE "RecallStatus" AS ENUM ('pending', 'scheduled', 'completed', 'overdue', 'cancelled');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('create', 'read', 'update', 'delete', 'download', 'print', 'sign', 'login', 'logout', 'export', 'import');

-- CreateTable
CREATE TABLE "tenants" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "legal_name" TEXT,
    "cui" TEXT,
    "registration_number" TEXT,
    "address_line1" TEXT,
    "address_line2" TEXT,
    "city" TEXT,
    "county" TEXT,
    "postal_code" TEXT,
    "country" TEXT NOT NULL DEFAULT 'RO',
    "phone" TEXT,
    "email" TEXT,
    "website" TEXT,
    "subscription_tier" "SubscriptionTier" NOT NULL DEFAULT 'trial',
    "subscription_status" "SubscriptionStatus" NOT NULL DEFAULT 'active',
    "trial_ends_at" TIMESTAMPTZ,
    "feature_flags" JSONB NOT NULL DEFAULT '{}',
    "settings" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "locations" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "address_line1" TEXT,
    "address_line2" TEXT,
    "city" TEXT,
    "county" TEXT,
    "postal_code" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "tenant_id" UUID,
    "email" TEXT NOT NULL,
    "auth_user_id" UUID,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "phone" TEXT,
    "roles" "UserRole"[],
    "professional_title" TEXT,
    "professional_code" TEXT,
    "cnp_encrypted" TEXT,
    "cnp_hash" TEXT,
    "signature_image_url" TEXT,
    "stamp_image_url" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_login_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_location_assignments" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_location_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "companies" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "cui" TEXT,
    "registration_number" TEXT,
    "caen_code" TEXT,
    "address_line1" TEXT,
    "address_line2" TEXT,
    "city" TEXT,
    "county" TEXT,
    "postal_code" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "website" TEXT,
    "contact_person_name" TEXT,
    "contact_person_role" TEXT,
    "contact_person_phone" TEXT,
    "contact_person_email" TEXT,
    "contract_start_date" DATE,
    "contract_end_date" DATE,
    "notes" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workplaces" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "department" TEXT,
    "description" TEXT,
    "risk_profile" JSONB NOT NULL DEFAULT '{}',
    "required_examination_type_ids" UUID[],
    "examination_interval_months" INTEGER NOT NULL DEFAULT 12,
    "risk_assessment_signed_by_company" BOOLEAN NOT NULL DEFAULT false,
    "risk_assessment_signed_at" DATE,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by_user_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "workplaces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employees" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "cnp_encrypted" TEXT,
    "cnp_hash" TEXT,
    "id_document_type" "IdDocumentType" NOT NULL DEFAULT 'cnp',
    "id_document_number" TEXT,
    "company_employee_id" TEXT,
    "last_name" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "birth_date" DATE,
    "gender" TEXT,
    "nationality" TEXT NOT NULL DEFAULT 'RO',
    "address_line1" TEXT,
    "address_line2" TEXT,
    "city" TEXT,
    "county" TEXT,
    "postal_code" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "emergency_contact_name" TEXT,
    "emergency_contact_phone" TEXT,
    "emergency_contact_relationship" TEXT,
    "medical_history_summary" TEXT,
    "chronic_conditions" JSONB NOT NULL DEFAULT '[]',
    "chronic_medications" JSONB NOT NULL DEFAULT '[]',
    "allergies" JSONB NOT NULL DEFAULT '[]',
    "vaccinations_summary" TEXT,
    "blood_type" TEXT,
    "notes" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "archived_at" TIMESTAMPTZ,
    "archived_reason" "EmployeeArchivedReason",
    "created_by_user_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_workplace_assignments" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "workplace_id" UUID NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "is_current" BOOLEAN NOT NULL DEFAULT true,
    "reason_for_change" "WorkAssignmentReason",
    "notes" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "employee_workplace_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "examination_types" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name_ro" TEXT NOT NULL,
    "name_de" TEXT,
    "name_en" TEXT,
    "description" TEXT,
    "legal_reference" TEXT,
    "default_validity_months" INTEGER NOT NULL DEFAULT 12,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_system" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "examination_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "examinations" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "workplace_id" UUID NOT NULL,
    "examination_type_id" UUID NOT NULL,
    "practitioner_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "examination_number" TEXT NOT NULL,
    "examination_year" INTEGER NOT NULL,
    "examination_sequence" INTEGER NOT NULL,
    "scheduled_at" TIMESTAMPTZ,
    "started_at" TIMESTAMPTZ,
    "completed_at" TIMESTAMPTZ,
    "status" "ExaminationStatus" NOT NULL DEFAULT 'scheduled',
    "request_source" "ExaminationRequestSource",
    "referring_document_number" TEXT,
    "anamnesis" JSONB NOT NULL DEFAULT '{}',
    "vital_signs" JSONB NOT NULL DEFAULT '{}',
    "vision_test" JSONB NOT NULL DEFAULT '{}',
    "hearing_test" JSONB NOT NULL DEFAULT '{}',
    "lung_function" JSONB NOT NULL DEFAULT '{}',
    "additional_tests" JSONB NOT NULL DEFAULT '{}',
    "clinical_findings" TEXT,
    "diagnoses" JSONB NOT NULL DEFAULT '[]',
    "recommendations" TEXT,
    "verdict" "ExaminationVerdict",
    "verdict_conditions" TEXT,
    "inapt_temporar_until" DATE,
    "next_examination_due_date" DATE,
    "notes" TEXT,
    "signed_at" TIMESTAMPTZ,
    "signed_by_user_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "examinations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "entity_type" "DocumentEntityType" NOT NULL,
    "entity_id" UUID NOT NULL,
    "document_type" "DocumentType" NOT NULL,
    "filename" TEXT NOT NULL,
    "storage_path" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "file_size_bytes" BIGINT NOT NULL,
    "is_generated" BOOLEAN NOT NULL DEFAULT false,
    "generated_from_template_id" UUID,
    "generated_data_snapshot" JSONB,
    "document_number" TEXT,
    "document_year" INTEGER,
    "document_sequence" INTEGER,
    "issued_at" TIMESTAMPTZ,
    "signed_by_user_id" UUID,
    "signature_method" "SignatureMethod",
    "is_official" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "replaces_document_id" UUID,
    "uploaded_by_user_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_templates" (
    "id" UUID NOT NULL,
    "tenant_id" UUID,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "document_type" "DocumentType" NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "template_format" "TemplateFormat" NOT NULL DEFAULT 'html_handlebars',
    "template_content" TEXT NOT NULL,
    "field_mappings" JSONB NOT NULL DEFAULT '{}',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "document_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vaccinations" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "examination_id" UUID,
    "vaccine_name" TEXT NOT NULL,
    "vaccine_code" TEXT,
    "manufacturer" TEXT,
    "batch_number" TEXT,
    "dose_number" INTEGER NOT NULL,
    "administration_date" DATE NOT NULL,
    "next_dose_due_date" DATE,
    "administered_by_user_id" UUID NOT NULL,
    "administration_route" "AdministrationRoute",
    "injection_site" TEXT,
    "reactions_observed" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "vaccinations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "medical_events" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "employee_id" UUID,
    "company_id" UUID,
    "practitioner_id" UUID NOT NULL,
    "event_type" "MedicalEventType" NOT NULL,
    "occurred_at" TIMESTAMPTZ NOT NULL,
    "location_description" TEXT,
    "description" TEXT NOT NULL,
    "actions_taken" TEXT,
    "outcome" "MedicalEventOutcome",
    "outcome_notes" TEXT,
    "requires_iths_report" BOOLEAN NOT NULL DEFAULT false,
    "iths_report_filed" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "medical_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recalls" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "workplace_id" UUID NOT NULL,
    "examination_type_id" UUID NOT NULL,
    "due_date" DATE NOT NULL,
    "created_from_examination_id" UUID,
    "completed_examination_id" UUID,
    "status" "RecallStatus" NOT NULL DEFAULT 'pending',
    "notification_sent_at" TIMESTAMPTZ,
    "notification_count" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "recalls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log_entries" (
    "id" UUID NOT NULL,
    "tenant_id" UUID,
    "user_id" UUID,
    "action" "AuditAction" NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" UUID,
    "entity_summary" TEXT,
    "changes" JSONB,
    "ip_address" INET,
    "user_agent" TEXT,
    "session_id" TEXT,
    "occurred_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants"("slug");

-- CreateIndex
CREATE INDEX "tenants_slug_idx" ON "tenants"("slug");

-- CreateIndex
CREATE INDEX "tenants_deleted_at_idx" ON "tenants"("deleted_at");

-- CreateIndex
CREATE INDEX "locations_tenant_id_idx" ON "locations"("tenant_id");

-- CreateIndex
CREATE INDEX "locations_tenant_id_is_primary_idx" ON "locations"("tenant_id", "is_primary");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_auth_user_id_key" ON "users"("auth_user_id");

-- CreateIndex
CREATE INDEX "users_tenant_id_idx" ON "users"("tenant_id");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_auth_user_id_idx" ON "users"("auth_user_id");

-- CreateIndex
CREATE INDEX "user_location_assignments_user_id_idx" ON "user_location_assignments"("user_id");

-- CreateIndex
CREATE INDEX "user_location_assignments_location_id_idx" ON "user_location_assignments"("location_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_location_assignments_user_id_location_id_key" ON "user_location_assignments"("user_id", "location_id");

-- CreateIndex
CREATE INDEX "companies_tenant_id_idx" ON "companies"("tenant_id");

-- CreateIndex
CREATE INDEX "companies_tenant_id_name_idx" ON "companies"("tenant_id", "name");

-- CreateIndex
CREATE INDEX "companies_cui_idx" ON "companies"("cui");

-- CreateIndex
CREATE INDEX "workplaces_tenant_id_idx" ON "workplaces"("tenant_id");

-- CreateIndex
CREATE INDEX "workplaces_company_id_idx" ON "workplaces"("company_id");

-- CreateIndex
CREATE INDEX "employees_tenant_id_idx" ON "employees"("tenant_id");

-- CreateIndex
CREATE INDEX "employees_tenant_id_cnp_hash_idx" ON "employees"("tenant_id", "cnp_hash");

-- CreateIndex
CREATE INDEX "employees_tenant_id_last_name_first_name_idx" ON "employees"("tenant_id", "last_name", "first_name");

-- CreateIndex
CREATE INDEX "employees_tenant_id_company_employee_id_idx" ON "employees"("tenant_id", "company_employee_id");

-- CreateIndex
CREATE INDEX "employees_archived_at_idx" ON "employees"("archived_at");

-- CreateIndex
CREATE INDEX "employee_workplace_assignments_tenant_id_idx" ON "employee_workplace_assignments"("tenant_id");

-- CreateIndex
CREATE INDEX "employee_workplace_assignments_employee_id_is_current_idx" ON "employee_workplace_assignments"("employee_id", "is_current");

-- CreateIndex
CREATE INDEX "employee_workplace_assignments_workplace_id_idx" ON "employee_workplace_assignments"("workplace_id");

-- CreateIndex
CREATE UNIQUE INDEX "examination_types_code_key" ON "examination_types"("code");

-- CreateIndex
CREATE INDEX "examinations_tenant_id_idx" ON "examinations"("tenant_id");

-- CreateIndex
CREATE INDEX "examinations_tenant_id_completed_at_idx" ON "examinations"("tenant_id", "completed_at");

-- CreateIndex
CREATE INDEX "examinations_employee_id_completed_at_idx" ON "examinations"("employee_id", "completed_at");

-- CreateIndex
CREATE INDEX "examinations_practitioner_id_completed_at_idx" ON "examinations"("practitioner_id", "completed_at");

-- CreateIndex
CREATE INDEX "examinations_status_idx" ON "examinations"("status");

-- CreateIndex
CREATE UNIQUE INDEX "examinations_tenant_id_examination_year_examination_sequenc_key" ON "examinations"("tenant_id", "examination_year", "examination_sequence");

-- CreateIndex
CREATE INDEX "documents_tenant_id_idx" ON "documents"("tenant_id");

-- CreateIndex
CREATE INDEX "documents_tenant_id_entity_type_entity_id_idx" ON "documents"("tenant_id", "entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "documents_tenant_id_document_type_idx" ON "documents"("tenant_id", "document_type");

-- CreateIndex
CREATE INDEX "documents_tenant_id_document_year_document_sequence_idx" ON "documents"("tenant_id", "document_year", "document_sequence");

-- CreateIndex
CREATE INDEX "document_templates_tenant_id_idx" ON "document_templates"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "document_templates_tenant_id_code_version_key" ON "document_templates"("tenant_id", "code", "version");

-- CreateIndex
CREATE INDEX "vaccinations_tenant_id_idx" ON "vaccinations"("tenant_id");

-- CreateIndex
CREATE INDEX "vaccinations_employee_id_administration_date_idx" ON "vaccinations"("employee_id", "administration_date");

-- CreateIndex
CREATE INDEX "vaccinations_next_dose_due_date_idx" ON "vaccinations"("next_dose_due_date");

-- CreateIndex
CREATE INDEX "medical_events_tenant_id_idx" ON "medical_events"("tenant_id");

-- CreateIndex
CREATE INDEX "medical_events_tenant_id_occurred_at_idx" ON "medical_events"("tenant_id", "occurred_at");

-- CreateIndex
CREATE INDEX "medical_events_employee_id_idx" ON "medical_events"("employee_id");

-- CreateIndex
CREATE INDEX "recalls_tenant_id_idx" ON "recalls"("tenant_id");

-- CreateIndex
CREATE INDEX "recalls_tenant_id_due_date_status_idx" ON "recalls"("tenant_id", "due_date", "status");

-- CreateIndex
CREATE INDEX "recalls_employee_id_idx" ON "recalls"("employee_id");

-- CreateIndex
CREATE INDEX "recalls_status_idx" ON "recalls"("status");

-- CreateIndex
CREATE INDEX "audit_log_entries_tenant_id_occurred_at_idx" ON "audit_log_entries"("tenant_id", "occurred_at");

-- CreateIndex
CREATE INDEX "audit_log_entries_user_id_occurred_at_idx" ON "audit_log_entries"("user_id", "occurred_at");

-- CreateIndex
CREATE INDEX "audit_log_entries_entity_type_entity_id_occurred_at_idx" ON "audit_log_entries"("entity_type", "entity_id", "occurred_at");

-- AddForeignKey
ALTER TABLE "locations" ADD CONSTRAINT "locations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_location_assignments" ADD CONSTRAINT "user_location_assignments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_location_assignments" ADD CONSTRAINT "user_location_assignments_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "companies" ADD CONSTRAINT "companies_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workplaces" ADD CONSTRAINT "workplaces_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workplaces" ADD CONSTRAINT "workplaces_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workplaces" ADD CONSTRAINT "workplaces_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_workplace_assignments" ADD CONSTRAINT "employee_workplace_assignments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_workplace_assignments" ADD CONSTRAINT "employee_workplace_assignments_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_workplace_assignments" ADD CONSTRAINT "employee_workplace_assignments_workplace_id_fkey" FOREIGN KEY ("workplace_id") REFERENCES "workplaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "examinations" ADD CONSTRAINT "examinations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "examinations" ADD CONSTRAINT "examinations_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "examinations" ADD CONSTRAINT "examinations_workplace_id_fkey" FOREIGN KEY ("workplace_id") REFERENCES "workplaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "examinations" ADD CONSTRAINT "examinations_examination_type_id_fkey" FOREIGN KEY ("examination_type_id") REFERENCES "examination_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "examinations" ADD CONSTRAINT "examinations_practitioner_id_fkey" FOREIGN KEY ("practitioner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "examinations" ADD CONSTRAINT "examinations_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "examinations" ADD CONSTRAINT "examinations_signed_by_user_id_fkey" FOREIGN KEY ("signed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_generated_from_template_id_fkey" FOREIGN KEY ("generated_from_template_id") REFERENCES "document_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_signed_by_user_id_fkey" FOREIGN KEY ("signed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_uploaded_by_user_id_fkey" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_replaces_document_id_fkey" FOREIGN KEY ("replaces_document_id") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_templates" ADD CONSTRAINT "document_templates_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vaccinations" ADD CONSTRAINT "vaccinations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vaccinations" ADD CONSTRAINT "vaccinations_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vaccinations" ADD CONSTRAINT "vaccinations_examination_id_fkey" FOREIGN KEY ("examination_id") REFERENCES "examinations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vaccinations" ADD CONSTRAINT "vaccinations_administered_by_user_id_fkey" FOREIGN KEY ("administered_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medical_events" ADD CONSTRAINT "medical_events_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medical_events" ADD CONSTRAINT "medical_events_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medical_events" ADD CONSTRAINT "medical_events_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medical_events" ADD CONSTRAINT "medical_events_practitioner_id_fkey" FOREIGN KEY ("practitioner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recalls" ADD CONSTRAINT "recalls_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recalls" ADD CONSTRAINT "recalls_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recalls" ADD CONSTRAINT "recalls_workplace_id_fkey" FOREIGN KEY ("workplace_id") REFERENCES "workplaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recalls" ADD CONSTRAINT "recalls_examination_type_id_fkey" FOREIGN KEY ("examination_type_id") REFERENCES "examination_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recalls" ADD CONSTRAINT "recalls_created_from_examination_id_fkey" FOREIGN KEY ("created_from_examination_id") REFERENCES "examinations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recalls" ADD CONSTRAINT "recalls_completed_examination_id_fkey" FOREIGN KEY ("completed_examination_id") REFERENCES "examinations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log_entries" ADD CONSTRAINT "audit_log_entries_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log_entries" ADD CONSTRAINT "audit_log_entries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
