CREATE TABLE seen (
    principal_id uuid NOT NULL,
    event_id     uuid NOT NULL,
    PRIMARY KEY (principal_id, event_id)
);
