-- ingest (M4): verdict outcomes per content, for the bridging_vector signal.
-- far means the receiver's score was below their threshold.
CREATE TABLE reach (
    exchange_id  uuid PRIMARY KEY,
    content_hash bytea NOT NULL,
    far          boolean NOT NULL
);
CREATE INDEX reach_hash_idx ON reach (content_hash);
