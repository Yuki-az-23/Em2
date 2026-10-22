-- ledger (M4): quotas, reputation, penalties, snapshots and reconciliation.

-- Whether the public card shows the principal's current emotion.
ALTER TABLE settings ADD COLUMN card text NOT NULL DEFAULT 'emotion' CHECK (card IN ('emotion', 'hidden'));

-- Metered use per fixed window (hour for messages, day for egress).
CREATE TABLE usage (
    principal_id uuid NOT NULL,
    kind         text NOT NULL CHECK (kind IN ('messages', 'egress')),
    window_start timestamptz NOT NULL,
    used         int NOT NULL,
    PRIMARY KEY (principal_id, kind, window_start)
);

-- One row per exchange decided for a sender: the source of the reputation
-- counters, which the reconciliation job recomputes from it.
CREATE TABLE outcomes (
    exchange_id uuid PRIMARY KEY,
    sender_id   uuid NOT NULL,
    kind        text NOT NULL CHECK (kind IN ('pass', 'shape', 'defer', 'deny')),
    at          timestamptz NOT NULL
);
CREATE INDEX outcomes_sender_idx ON outcomes (sender_id);

CREATE TABLE reputation (
    principal_id uuid PRIMARY KEY,
    passes       int NOT NULL DEFAULT 0,
    shapes       int NOT NULL DEFAULT 0,
    defers       int NOT NULL DEFAULT 0,
    denies       int NOT NULL DEFAULT 0,
    probes       int NOT NULL DEFAULT 0,
    updated_at   timestamptz NOT NULL
);

-- Temporary quota reductions, for example after probing a receiver.
CREATE TABLE penalties (
    id           bigserial PRIMARY KEY,
    principal_id uuid NOT NULL,
    reason       text NOT NULL,
    factor       real NOT NULL CHECK (factor > 0 AND factor <= 1),
    created_at   timestamptz NOT NULL,
    until        timestamptz NOT NULL
);
CREATE INDEX penalties_principal_idx ON penalties (principal_id, until);

CREATE TABLE snapshots (
    id           bigserial PRIMARY KEY,
    principal_id uuid NOT NULL,
    at           timestamptz NOT NULL,
    body         jsonb NOT NULL
);
CREATE INDEX snapshots_principal_idx ON snapshots (principal_id, at DESC);

-- What each reconciliation run found and repaired.
CREATE TABLE reconciliations (
    id       bigserial PRIMARY KEY,
    at       timestamptz NOT NULL,
    checked  int NOT NULL,
    repaired int NOT NULL
);
