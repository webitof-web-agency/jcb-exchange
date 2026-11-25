-- Confirm joining: access scopes remember whether HR gave them by hand (MANUAL) or they follow the person's
-- placement (PLACEMENT: a State Manager's own state), so transfers / replacements / exits move or end only the
-- latter. Additive and safe to run more than once.
ALTER TABLE "HrmAccessScope" ADD COLUMN IF NOT EXISTS "source" VARCHAR(20) NOT NULL DEFAULT 'MANUAL';
