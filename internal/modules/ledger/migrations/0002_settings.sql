-- ledger (M3 subset of M4): receiver settings, blocks and ingress endpoints.

CREATE TABLE settings (
    principal_id uuid PRIMARY KEY,
    threshold    real CHECK (threshold BETWEEN 0 AND 1),  -- NULL: the ruleset default
    filter       boolean NOT NULL DEFAULT true,
    updated_at   timestamptz NOT NULL
);

CREATE TABLE blocks (
    principal_id uuid NOT NULL,
    blocked_id   uuid NOT NULL,
    created_at   timestamptz NOT NULL,
    PRIMARY KEY (principal_id, blocked_id),
    CHECK (principal_id <> blocked_id)
);

-- Where EM2 forwards ingress traffic for a principal. Never shown to others.
CREATE TABLE endpoints (
    principal_id uuid PRIMARY KEY,
    url          text NOT NULL,
    updated_at   timestamptz NOT NULL
);
