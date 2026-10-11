-- ledger (M2 subset): each principal's current bridge and its history.
-- M4 adds settings, quotas, reputation, blocks, endpoints and snapshots.

CREATE TABLE bridges (
    principal_id uuid PRIMARY KEY,
    emotion      smallint NOT NULL CHECK (emotion BETWEEN 0 AND 7),
    color        smallint NOT NULL CHECK (color BETWEEN 0 AND 7),
    set_at       timestamptz NOT NULL,
    source       text NOT NULL CHECK (source IN ('self', 'prompt', 'intervention', 'onboarding', 'agent'))
);

CREATE TABLE bridge_history (
    id           bigserial PRIMARY KEY,
    principal_id uuid NOT NULL,
    emotion      smallint NOT NULL,
    color        smallint NOT NULL,
    started_at   timestamptz NOT NULL,
    ended_at     timestamptz,
    source       text NOT NULL
);
CREATE INDEX bridge_history_principal_idx ON bridge_history (principal_id, started_at DESC);
