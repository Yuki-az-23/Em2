-- ingress: requests addressed to a principal through EM2, and their forwarding
-- to the principal's registered upstream once the receiver's verdict delivers
-- them (ADR-013).

-- The original request, kept to forward the exact bytes.
CREATE TABLE requests (
    message_id   uuid PRIMARY KEY,
    sender_id    uuid NOT NULL,
    receiver_id  uuid NOT NULL,
    content_type text NOT NULL,
    body         bytea NOT NULL,
    created_at   timestamptz NOT NULL
);

-- One forwarding attempt per delivered exchange. Never retried: a request may
-- have side effects at the upstream. error holds internal detail only.
CREATE TABLE forwards (
    exchange_id     uuid PRIMARY KEY,
    message_id      uuid NOT NULL REFERENCES requests (message_id) ON DELETE CASCADE,
    receiver_id     uuid NOT NULL,
    state           text NOT NULL CHECK (state IN ('pending', 'sending', 'done', 'failed')),
    verdict         jsonb NOT NULL,
    created_at      timestamptz NOT NULL,
    claimed_at      timestamptz,
    finished_at     timestamptz,
    upstream_status int,
    latency_ms      int,
    reply_id        uuid,
    error           text
);
CREATE INDEX forwards_pending_idx ON forwards (state, created_at);
