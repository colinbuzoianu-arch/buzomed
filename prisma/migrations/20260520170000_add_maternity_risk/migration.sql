-- Add maternity_risk JSONB column to examinations for OUG 96/2003 risk checklists.
ALTER TABLE examinations ADD COLUMN IF NOT EXISTS maternity_risk JSONB NOT NULL DEFAULT '{}';
