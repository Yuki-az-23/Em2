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
| `Probe` | one sender trying many variants on one receiver near that receiver's threshold |
| `Signals` | named, weighted, with evidence |
| `Risk` | 0..1, `clamp01(Σ weight × signal)` |
| `Version` | dossier ruleset version |

Visibility: receivers of the content, its author, and the observer role. Never another sender.
Signals are heuristics, versioned and explainable. An optional external classifier can add one signal;
it is off by default and never required.
