# Contract: Verdict

Go type: `core.Verdict` (`core/verdict.go`).

A Verdict is the decision EM2 makes about delivering one Message to one receiver. It belongs to the
receiver, because the receiver's bridge and threshold produced it.

## Kinds

| Kind | Meaning | Adds pressure |
|---|---|---|
| `pass` | delivered | yes |
| `shape` | delivered with risk headers, rate-limited per sender→receiver | no |
| `defer` | held in the receiver's deferred queue until the receiver's bridge or the message's state changes, or it expires | no |
| `deny` | not delivered | no |

The decision table is in `docs/BLUEPRINT.md` section B6. Its inputs are the compatibility score between
the sender's stance and the receiver's bridge, the receiver's threshold, the dossier risk, the probe
signal and the receiver's block list. Claims are not an input.

## Disclosure (ADR-011)

| Audience | Sees |
|---|---|
| receiver | `Score`, `Threshold`, `Risk`, `Kind`, `Reason`, `RuleVersion` (as `EM2-*` headers and via `GET /v1/me/verdicts`) |
| journal and observer role | everything |
| sender | only `202 Accepted` with the message id (for pass, shape and defer alike) or `403 denied` with no detail |

Sender-facing responses for pass, shape and defer are identical apart from the message id, and are
padded to the same response time.

## Exchange lifecycle

`core.ExchangeState`: `received → normalized → scored → decided →` one of
`forwarded → responded`, `deferred → released | expired`, `denied`.
Any other transition is a bug; `core.ValidTransition` encodes the allowed edges and the contract tests
check it.
