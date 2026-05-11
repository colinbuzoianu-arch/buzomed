-- Examination types catalog (HG 355/2007).
--
-- Idempotent: uses ON CONFLICT (code) DO NOTHING so re-running is safe.
-- Run once per database. Future Examination Types added via this file
-- + super_admin UI (later session).
--
-- These are global (no tenantId) — every tenant uses the same legal
-- catalog. Tenant-specific customizations (e.g., a cabinet-defined sub-
-- category) can be added later via a tenant-scoped overlay table.
--
-- Usage:
--   psql $DATABASE_URL -f prisma/seed-examination-types.sql
-- or:
--   supabase db push --file prisma/seed-examination-types.sql

INSERT INTO examination_types (id, code, name_ro, name_en, description, legal_reference, default_validity_months, is_active, is_system, created_at, updated_at)
VALUES
  (
    gen_random_uuid(),
    'angajare',
    'Examen medical la angajare',
    'Pre-employment medical examination',
    'Examenul medical efectuat înainte de angajare pentru a stabili aptitudinea pentru postul vizat.',
    'HG 355/2007 art. 8',
    12,
    true,
    true,
    NOW(),
    NOW()
  ),
  (
    gen_random_uuid(),
    'control_periodic',
    'Control medical periodic',
    'Periodic medical check-up',
    'Examen efectuat la intervale regulate pentru lucrătorii expuși la factori de risc profesional.',
    'HG 355/2007 art. 11',
    12,
    true,
    true,
    NOW(),
    NOW()
  ),
  (
    gen_random_uuid(),
    'reluare_munca',
    'Examen la reluarea activității',
    'Return-to-work examination',
    'Examen obligatoriu la reluarea activității după o întrerupere mai mare de 90 zile pentru motive medicale sau 6 luni pentru orice alte motive.',
    'HG 355/2007 art. 14',
    12,
    true,
    true,
    NOW(),
    NOW()
  ),
  (
    gen_random_uuid(),
    'adaptare',
    'Examen de adaptare',
    'Adaptation examination',
    'Examen efectuat după primele 30 de zile de la angajare la solicitarea medicului sau a angajatorului.',
    'HG 355/2007 art. 13',
    12,
    true,
    true,
    NOW(),
    NOW()
  ),
  (
    gen_random_uuid(),
    'schimbare_loc_munca',
    'Examen la schimbarea locului de muncă',
    'Workplace change examination',
    'Examen la schimbarea felului muncii sau a condițiilor de muncă.',
    'HG 355/2007 art. 12',
    12,
    true,
    true,
    NOW(),
    NOW()
  ),
  (
    gen_random_uuid(),
    'incetare_munca',
    'Examen la încetarea activității',
    'Departure examination',
    'Examen efectuat la încetarea activității în condiții de expunere la noxe.',
    'HG 355/2007',
    null,
    true,
    true,
    NOW(),
    NOW()
  ),
  (
    gen_random_uuid(),
    'la_cerere',
    'Examen la cerere',
    'On-request examination',
    'Examen efectuat la cererea lucrătorului sau a angajatorului în afara intervalelor planificate.',
    'HG 355/2007',
    null,
    true,
    true,
    NOW(),
    NOW()
  )
ON CONFLICT (code) DO NOTHING;
