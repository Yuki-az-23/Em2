-- ingest (M3): direct messages and the current emotional state.
--
-- receiver_id addresses a message to one principal (ingress requests, their
-- replies, egress fetches); channel_id stays NULL for those. state_* is the
-- message's current state, projected from verdict.message.transitioned; NULL
-- means it is still the sender's stance. origin is the external source of an
-- egress message, whose sender is the agent that fetched it.

ALTER TABLE messages ADD COLUMN receiver_id uuid;
ALTER TABLE messages ADD COLUMN state_emotion smallint CHECK (state_emotion BETWEEN 0 AND 7);
ALTER TABLE messages ADD COLUMN state_color smallint CHECK (state_color BETWEEN 0 AND 7);
ALTER TABLE messages ADD COLUMN state_version int NOT NULL DEFAULT 1;
ALTER TABLE messages ADD COLUMN origin text;
ALTER TABLE messages ADD CONSTRAINT messages_addressed CHECK ((channel_id IS NULL) <> (receiver_id IS NULL));
CREATE INDEX messages_receiver_idx ON messages (receiver_id, at DESC) WHERE receiver_id IS NOT NULL;
