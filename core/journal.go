package core

import (
	"encoding/json"
	"time"
)

// JournalEntry is one append-only, hash-chained record.
// Hash = SHA-256(PrevHash || canonical JSON of the entry without Hash).
type JournalEntry struct {
	Seq      uint64          `json:"seq"`
	At       time.Time       `json:"at"`
	Kind     string          `json:"kind"`
	Actor    *Principal      `json:"actor,omitempty"`
	Payload  json.RawMessage `json:"payload"`
	TraceID  string          `json:"trace_id,omitempty"`
	PrevHash []byte          `json:"prev_hash"`
	Hash     []byte          `json:"hash"`
}
