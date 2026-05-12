-- Buzomed session 7 — Storage bucket setup.
--
-- Creates a single private bucket 'documents' used for ALL tenant document
-- uploads. Tenant isolation is enforced in application code (route handlers
-- check tenantId on every read/write) — there's no per-tenant bucket policy.
-- This mirrors how we treat the rest of the data model (shared Postgres
-- schema, app-layer tenant enforcement).
--
-- Path layout inside the bucket:
--   {tenantId}/{entityType}/{entityId}/{uuid}-{safeFilename}
--
-- Idempotent: re-running this script is safe (INSERT ... ON CONFLICT).
--
-- Run once per Supabase project:
--   psql "$DATABASE_URL" -f prisma/setup-storage-bucket.sql
--   OR paste into Supabase Dashboard → SQL Editor → Run
--
-- Verifies after creation:
--   select id, name, public, file_size_limit, allowed_mime_types
--     from storage.buckets where id = 'documents';

INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
VALUES (
  'documents',
  'documents',
  false,                            -- private; downloads only via signed URLs
  15728640,                         -- 15 MB; matches our application-level cap
  ARRAY[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
ON CONFLICT (id) DO UPDATE
  SET file_size_limit    = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types,
      public             = EXCLUDED.public;

-- We do NOT define storage.objects RLS policies here. Authenticated reads
-- and writes happen via the service-role key (server-side) and signed URLs
-- (client downloads). RLS policies for storage.objects only matter if you
-- expose the storage REST API directly to client-side anon keys, which we
-- don't.
