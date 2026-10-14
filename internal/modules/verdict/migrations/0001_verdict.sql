-- verdict: the execution engine (BLUEPRINT B6). Who receives what, with which
-- verdict, and the pressure that moves messages' emotional state.

-- A principal's channel subscriptions: whom a channel message is offered to.
CREATE TABLE subscriptions (
    principal_id uuid NOT NULL,
    channel_id   uuid NOT NULL,
    created_at   timestamptz NOT NULL,
    PRIMARY KEY (principal_id, channel_id)
);
CREATE INDEX subscriptions_channel_idx ON subscriptions (channel_id);

-- Each assessed message: who wrote it, where it goes, and its current state.
-- emotion/color NULL means the state is unknown (external content).
CREATE TABLE messages (
    message_id   uuid PRIMARY KEY,
    content_hash bytea NOT NULL,
    plane        text NOT NULL,
    author_id    uuid NOT NULL,
    author_kind  text NOT NULL,
    channel_id   uuid,
    receiver_id  uuid,
    parent_id    uuid,
    at           timestamptz NOT NULL,
    emotion      smallint CHECK (emotion BETWEEN 0 AND 7),
    color        smallint CHECK (color BETWEEN 0 AND 7),
    version      int NOT NULL DEFAULT 1,
    transitions  int NOT NULL DEFAULT 0,
    pools        jsonb NOT NULL DEFAULT '[]',
    updated_at   timestamptz NOT NULL
);
CREATE INDEX verdict_messages_hash_idx ON messages (content_hash);

-- Latest dossier risk per content hash.
CREATE TABLE risk (
    content_hash bytea PRIMARY KEY,
    risk         real NOT NULL,
    updated_at   timestamptz NOT NULL
);

-- One delivery attempt of one message to one receiver, with the receiver's
-- verdict. Never shown to the sender (ADR-011).
CREATE TABLE exchanges (
    id              uuid PRIMARY KEY,
    message_id      uuid NOT NULL REFERENCES messages (message_id),
    receiver_id     uuid NOT NULL,
    state           text NOT NULL CHECK (state IN ('decided', 'forwarded', 'responded', 'deferred', 'released', 'expired', 'denied')),
    kind            text NOT NULL CHECK (kind IN ('pass', 'shape', 'defer', 'deny')),
    score           real,
    threshold       real NOT NULL,
    risk            real NOT NULL,
    reason          text NOT NULL,
    rule_version    text NOT NULL,
    shadow          boolean NOT NULL DEFAULT false,
    decided_at      timestamptz NOT NULL,
    delivered_at    timestamptz,
    released_at     timestamptz,
    expires_at      timestamptz,
    responded_at    timestamptz,
    upstream_status int,
    latency_ms      int,
    UNIQUE (message_id, receiver_id)
);
CREATE INDEX exchanges_feed_idx ON exchanges (receiver_id, delivered_at DESC, id DESC) WHERE delivered_at IS NOT NULL;
CREATE INDEX exchanges_deferred_idx ON exchanges (state, expires_at) WHERE state = 'deferred';

-- Interactions that may add pressure, and what they did.
CREATE TABLE interactions (
    id         uuid PRIMARY KEY,
    message_id uuid NOT NULL REFERENCES messages (message_id),
    actor_id   uuid NOT NULL,
    kind       text NOT NULL CHECK (kind IN ('reply', 'brace', 'unbrace', 'forward')),
    effect     text NOT NULL,
    added      double precision NOT NULL DEFAULT 0,
    at         timestamptz NOT NULL
);
CREATE INDEX interactions_message_idx ON interactions (message_id, at);

-- Current braces, with what each added, so an unbrace reverts it exactly.
CREATE TABLE braces (
    message_id     uuid NOT NULL REFERENCES messages (message_id),
    actor_id       uuid NOT NULL,
    added          double precision NOT NULL,
    target_emotion smallint NOT NULL,
    target_color   smallint NOT NULL,
    at             timestamptz NOT NULL,
    PRIMARY KEY (message_id, actor_id)
);

-- Committed state changes.
CREATE TABLE transitions (
    id             bigserial PRIMARY KEY,
    message_id     uuid NOT NULL REFERENCES messages (message_id),
    version        int NOT NULL,
    from_emotion   smallint NOT NULL,
    from_color     smallint NOT NULL,
    to_emotion     smallint NOT NULL,
    to_color       smallint NOT NULL,
    pressure       double precision NOT NULL,
    contributors   int NOT NULL,
    trigger_id     uuid NOT NULL,
    trigger_kind   text NOT NULL,
    rule_version   text NOT NULL,
    at             timestamptz NOT NULL,
    UNIQUE (message_id, version)
);
