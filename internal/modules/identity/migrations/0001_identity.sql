-- identity: principals (humans and agents), credentials, sessions.
-- Runs with search_path = identity.

CREATE TABLE principals (
    id         uuid PRIMARY KEY,
    kind       text NOT NULL CHECK (kind IN ('human', 'agent', 'campaign', 'system')),
    handle     text NOT NULL UNIQUE CHECK (handle ~ '^[a-z][a-z0-9_]{2,31}$'),
    owner_id   uuid REFERENCES principals (id),
    status     text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'deleted')),
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL,
    CHECK ((kind = 'agent') = (owner_id IS NOT NULL))
);
CREATE INDEX principals_owner_idx ON principals (owner_id) WHERE owner_id IS NOT NULL;

CREATE TABLE humans (
    principal_id  uuid PRIMARY KEY REFERENCES principals (id) ON DELETE CASCADE,
    email         text NOT NULL,
    password_hash text NOT NULL,
    roles         text[] NOT NULL DEFAULT '{user}'
);
CREATE UNIQUE INDEX humans_email_key ON humans (lower(email));

CREATE TABLE agents (
    principal_id uuid PRIMARY KEY REFERENCES principals (id) ON DELETE CASCADE,
    name         text NOT NULL,
    description  text NOT NULL DEFAULT '',
    scopes       text[] NOT NULL
);

-- An agent key is stored as an 8-character lookup prefix plus a peppered
-- HMAC-SHA-256 of the whole key. The key itself is never stored.
CREATE TABLE agent_keys (
    id           uuid PRIMARY KEY,
    agent_id     uuid NOT NULL REFERENCES agents (principal_id) ON DELETE CASCADE,
    lookup       text NOT NULL,
    key_hash     bytea NOT NULL,
    created_at   timestamptz NOT NULL,
    last_used_at timestamptz,
    expires_at   timestamptz,
    revoked_at   timestamptz
);
CREATE INDEX agent_keys_lookup_idx ON agent_keys (lookup) WHERE revoked_at IS NULL;

-- One row per refresh token. Rotation creates a new row in the same family
-- and marks the old one replaced; presenting a replaced token revokes the family.
CREATE TABLE sessions (
    id           uuid PRIMARY KEY,
    principal_id uuid NOT NULL REFERENCES principals (id) ON DELETE CASCADE,
    family_id    uuid NOT NULL,
    refresh_hash bytea NOT NULL UNIQUE,
    user_agent   text NOT NULL DEFAULT '',
    created_at   timestamptz NOT NULL,
    last_used_at timestamptz,
    expires_at   timestamptz NOT NULL,
    revoked_at   timestamptz,
    replaced_by  uuid
);
CREATE INDEX sessions_family_idx ON sessions (family_id);
CREATE INDEX sessions_principal_idx ON sessions (principal_id) WHERE revoked_at IS NULL AND replaced_by IS NULL;
