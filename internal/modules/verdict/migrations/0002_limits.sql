-- verdict (M4): shaped deliveries held back by the per-sender shape interval
-- wait until hold_until, then are decided again.
ALTER TABLE exchanges ADD COLUMN hold_until timestamptz;
CREATE INDEX exchanges_hold_idx ON exchanges (hold_until) WHERE state = 'deferred' AND hold_until IS NOT NULL;
CREATE INDEX exchanges_receiver_decided_idx ON exchanges (receiver_id, decided_at DESC);
