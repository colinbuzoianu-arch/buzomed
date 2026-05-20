-- Add logo_url to tenants (for PDF header + sidebar branding)
ALTER TABLE "tenants" ADD COLUMN "logo_url" TEXT;

-- Add specialty to users (practitioner profile)
ALTER TABLE "users" ADD COLUMN "specialty" TEXT;
