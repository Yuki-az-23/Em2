# Contract: Dossier

Go type: `core.Dossier` (`core/dossier.go`). Implemented in M2 by the `ingest` module.

A dossier is the evidence EM2 gathers about one piece of content, keyed by content hash, across every
place it was seen. It answers: is this ordinary communication, spam, or manipulation aimed at the receiver?

| Field | Meaning |
|---|---|
| `ContentHash`, `FirstSeen`, `SeenCount` | identity and age |
| `Senders`, `Receivers`, `Clusters` | distinct counts; clusters are receiver bridge groups |
| `Velocity`, `Burstiness`, `SenderConc` | spread shape |
| `Bridging` | share of deliveries into bridges below the receiver's threshold |
| `Drift` | gap between claimed emotion/color, sender stance and the direction receivers push the content |
| `Bridging` | share of the content's deliveries that went to receivers whose bridge it did not fit (score below threshold); the `bridging_vector` signal from `dossier-2` |
| `Probe` | reserved; probing is detected per sender and receiver by the verdict engine instead (ADR-014) |
| `Signals` | named, weighted, with evidence |
| `Risk` | 0..1, `clamp01(Σ weight × signal)` |
| `Version` | dossier ruleset version |

Visibility: receivers of the content, its author, and the observer role. Never another sender.
Signals are heuristics, versioned and explainable. Rules versions: `dossier-1` (repetition, burst,
sender concentration, link fanout, claim drift) and `dossier-2` (the same plus `bridging_vector`, the
default from M4). An optional external classifier can add one signal;
it is off by default and never required.
