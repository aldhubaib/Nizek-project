-- The "Relation" layout field type is gone. Its only remaining target after the
-- Contacts, Companies and Deals removal was a user, which the "User" field type
-- already covers. Any Board layout field still of this type is dropped; its
-- stored values cascade with the field.
DELETE FROM "CustomField"
WHERE "type" = 'relation';
