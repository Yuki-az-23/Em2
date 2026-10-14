-- Stored results of idempotent requests (Route.Idempotent). A retry with the
-- same key replays the first result; the same key with a different request
-- is refused. Rows older than 24 hours are deleted by the kernel.
CREATE TABLE kernel.idempotency (
    principal_id text        NOT NULL,
    route        text        NOT NULL,
    key          text        NOT NULL,
    request_hash bytea       NOT NULL,
    status       int         NOT NULL,
    location     text        NOT NULL DEFAULT '',
    body         bytea,
    created_at   timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (principal_id, route, key)
);
CREATE INDEX idempotency_created_idx ON kernel.idempotency (created_at);
