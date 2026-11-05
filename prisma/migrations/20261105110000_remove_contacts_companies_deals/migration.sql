-- Remove the Contacts, Companies and Deals modules. This drops data: the three
-- directories, their per-user access grants, and the flows, layouts, fields,
-- roles and history that belonged to them. The project Board keeps the shared
-- workflow + layout engine.

-- Board layout fields that linked a card to a contact or a company have no
-- target any more. Their stored values cascade with the field.
DELETE FROM "CustomField"
WHERE "type" = 'relation'
  AND "options" LIKE '{%'
  AND ("options"::jsonb ->> 'model') IN ('contact', 'company', 'deal');

-- Calendar-invite attendees drawn from the Contacts directory are dropped from
-- stored invite values; user attendees stay.
UPDATE "CustomFieldValue" v
SET "value" = (
  SELECT jsonb_set(
    v."value"::jsonb,
    '{attendees}',
    COALESCE(
      (
        SELECT jsonb_agg(a)
        FROM jsonb_array_elements(v."value"::jsonb -> 'attendees') a
        WHERE a ->> 'kind' <> 'contact'
      ),
      '[]'::jsonb
    )
  )::text
)
FROM "CustomField" f
WHERE f."id" = v."fieldId"
  AND f."type" = 'invite'
  AND v."value" LIKE '{%'
  AND (v."value"::jsonb -> 'attendees') IS NOT NULL
  AND jsonb_typeof(v."value"::jsonb -> 'attendees') = 'array';

-- The modules themselves go first: their rows hold RESTRICT references to the
-- flows deleted below.
DROP TABLE IF EXISTS "DealContact";
DROP TABLE IF EXISTS "DealCompany";
DROP TABLE IF EXISTS "Deal";
DROP TABLE IF EXISTS "Contact";
DROP TABLE IF EXISTS "Company";
DROP TABLE IF EXISTS "ContactsPermission";

-- Engine rows that belonged to the three modules.
DELETE FROM "RecordHistory"        WHERE "entityType" IN ('deal', 'contact', 'company');
DELETE FROM "RecordComment"        WHERE "entityType" IN ('deal', 'contact', 'company');
DELETE FROM "CustomFieldValue"     WHERE "entityType" IN ('deal', 'contact', 'company');
DELETE FROM "ModuleRoleMember"     WHERE "entityType" IN ('deal', 'contact', 'company');
DELETE FROM "ModuleRole"           WHERE "entityType" IN ('deal', 'contact', 'company');
DELETE FROM "Workflow"             WHERE "entityType" IN ('deal', 'contact', 'company');
DELETE FROM "CustomField"          WHERE "entityType" IN ('deal', 'contact', 'company');
DELETE FROM "CustomFieldSection"   WHERE "entityType" IN ('deal', 'contact', 'company');
DELETE FROM "FormLayout"           WHERE "entityType" IN ('deal', 'contact', 'company');
DELETE FROM "ModuleRecordCounter"  WHERE "entityType" IN ('deal', 'contact', 'company');
