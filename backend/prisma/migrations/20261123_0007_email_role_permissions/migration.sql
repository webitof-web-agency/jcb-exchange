-- Email communications use the same view/manage capability split as WhatsApp and SMS.
-- Existing roles that already had SMS access receive the equivalent Email access so
-- the new module is not silently hidden after deployment.
UPDATE "CustomRole" AS role
SET "permissions" = (
  SELECT ARRAY(
    SELECT DISTINCT permission
    FROM unnest(
      role."permissions"
      || CASE WHEN 'sms.read' = ANY(role."permissions") THEN ARRAY['email.read']::text[] ELSE ARRAY[]::text[] END
      || CASE WHEN 'sms.manage' = ANY(role."permissions") THEN ARRAY['email.manage']::text[] ELSE ARRAY[]::text[] END
    ) AS permission
    ORDER BY permission
  )
)
WHERE 'sms.read' = ANY(role."permissions") OR 'sms.manage' = ANY(role."permissions");

-- Preserve compatibility for legacy users that still use direct AdminPermission rows.
INSERT INTO "AdminPermission" ("id", "adminUserId", "permission")
SELECT md5(source."adminUserId" || ':' || target.permission)::uuid, source."adminUserId", target.permission
FROM "AdminPermission" AS source
CROSS JOIN LATERAL (
  SELECT CASE source.permission
    WHEN 'sms.read' THEN 'email.read'
    WHEN 'sms.manage' THEN 'email.manage'
  END AS permission
) AS target
WHERE source.permission IN ('sms.read', 'sms.manage')
  AND target.permission IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "AdminPermission" AS existing
    WHERE existing."adminUserId" = source."adminUserId"
      AND existing.permission = target.permission
  );
