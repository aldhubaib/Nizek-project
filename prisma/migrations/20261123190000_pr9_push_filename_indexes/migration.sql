-- Lookup Expo tokens by install deviceId alone (heartbeat / deregister paths).
CREATE INDEX IF NOT EXISTS "MobilePushToken_deviceId_idx"
  ON "MobilePushToken"("deviceId");

-- Speeds ILIKE '%…%' filename search in message file search (pg_trgm already enabled).
CREATE INDEX IF NOT EXISTS "MessageAttachment_filename_trgm_idx"
  ON "MessageAttachment"
  USING GIN ("filename" gin_trgm_ops);
