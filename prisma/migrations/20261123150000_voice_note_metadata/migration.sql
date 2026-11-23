-- Voice notes carry their length and loudness bars so players can draw them
-- before the audio downloads. Both stay empty for every other attachment.
ALTER TABLE "MessageAttachment" ADD COLUMN "durationMs" INTEGER;
ALTER TABLE "MessageAttachment" ADD COLUMN "waveform" JSONB;
