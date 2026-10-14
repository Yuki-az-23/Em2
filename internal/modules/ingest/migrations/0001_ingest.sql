-- ingest: the data engine. Channels, canonical messages, content dossiers and media.

CREATE TABLE channels (
    id          uuid PRIMARY KEY,
    handle      text NOT NULL UNIQUE CHECK (handle ~ '^[a-z][a-z0-9_-]{2,31}$'),
    title       text NOT NULL,
    description text NOT NULL DEFAULT '',
    owner_id    uuid NOT NULL,
    created_at  timestamptz NOT NULL
);

-- One row per canonical core.Message. stance_* is the sender's ledger bridge
-- at send time (trusted); claims holds what the sender asserted (untrusted).
CREATE TABLE messages (
    id             uuid PRIMARY KEY,
    at             timestamptz NOT NULL,
    plane          text NOT NULL CHECK (plane IN ('bus', 'ingress', 'egress')),
    direction      text NOT NULL CHECK (direction IN ('inbound', 'outbound')),
    sender_id      uuid NOT NULL,
    sender_kind    text NOT NULL,
    channel_id     uuid REFERENCES channels (id),
    parent_id      uuid REFERENCES messages (id),
    stance_emotion smallint CHECK (stance_emotion BETWEEN 0 AND 7),
    stance_color   smallint CHECK (stance_color BETWEEN 0 AND 7),
    content_hash   bytea NOT NULL,
    mime           text NOT NULL,
    body_md        text NOT NULL,
    body_ast       jsonb NOT NULL,
    bytes          int NOT NULL,
    links          text[] NOT NULL DEFAULT '{}',
    claims         jsonb NOT NULL DEFAULT '{}',
    provenance     jsonb NOT NULL DEFAULT '{}'
);
CREATE INDEX messages_channel_idx ON messages (channel_id, at DESC, id DESC);
CREATE INDEX messages_hash_idx ON messages (content_hash, at DESC);
CREATE INDEX messages_sender_idx ON messages (sender_id, at DESC);

CREATE TABLE dossiers (
    content_hash bytea PRIMARY KEY,
    first_seen   timestamptz NOT NULL,
    last_seen    timestamptz NOT NULL,
    seen_count   int NOT NULL,
    risk         real NOT NULL,
    version      text NOT NULL,
    body         jsonb NOT NULL,
    updated_at   timestamptz NOT NULL
);

CREATE TABLE media (
    id         uuid PRIMARY KEY,
    owner_id   uuid NOT NULL,
    mime       text NOT NULL,
    bytes      int NOT NULL,
    sha256     bytea NOT NULL,
    created_at timestamptz NOT NULL
);
CREATE INDEX media_owner_idx ON media (owner_id, created_at DESC);
