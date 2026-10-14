# Contract: Journal

Go type: `core.JournalEntry` (`core/journal.go`). Implemented in M6 by the `journal` module; M1 writes
its kernel outbox in the same shape so events can be journaled without conversion.

The journal is append-only and hash-chained:

```
hash = SHA-256( prev_hash || canonical_json(entry without hash) )
```

- `Seq` is strictly increasing; `PrevHash` of entry n equals `Hash` of entry n−1.
- Entries are never updated or deleted. Retention works by dropping whole day partitions after the
  checkpoint covering them is signed and exported.
- A daily checkpoint `{at, seq, hash}` is signed with the server Ed25519 key.
- `GET /v1/journal/verify?from&to` recomputes the chain and reports the first broken link.

Every decision EM2 makes is an entry: message received, dossier updated, verdict, forward, response,
transition, bridge change, ledger drift, admin action, telemetry session summary. Technical error
details that public responses hide are written here and to the internal log, keyed by request id.
