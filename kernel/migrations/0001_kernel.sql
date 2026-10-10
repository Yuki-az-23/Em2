-- Kernel schema: transactional outbox and per-subscriber delivery records.
-- kernel.migrations is created by the migration runner itself (bootstrap).

CREATE TABLE kernel.outbox (
    id              uuid PRIMARY KEY,
    name            text        NOT NULL,
    version         int         NOT NULL,
    payload         jsonb       NOT NULL,
    actor           jsonb,
    trace_id        text,
    occurred_at     timestamptz NOT NULL,
    dispatched_at   timestamptz,
    attempts        int         NOT NULL DEFAULT 0,
    next_attempt_at timestamptz NOT NULL DEFAULT now(),
    last_error_at   timestamptz
);
CREATE INDEX outbox_pending_idx ON kernel.outbox (next_attempt_at, occurred_at) WHERE dispatched_at IS NULL;

-- One row per (event, subscriber) once the subscriber's transaction commits.
-- Written inside the subscriber's own transaction, so an effect and its
-- delivery record commit together. No foreign key: the dispatcher holds a
-- row lock on the outbox entry while subscribers run.
CREATE TABLE kernel.deliveries (
    event_id     uuid        NOT NULL,
    subscriber   text        NOT NULL,
    delivered_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (event_id, subscriber)
);
