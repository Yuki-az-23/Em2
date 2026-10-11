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

The decision table is in `docs/BLUEPRINT.md` section B6 and is implemented by `ecbridge.Decide`. Its
inputs are the compatibility score between the message's current state (which starts at the sender's
stance) and the receiver's bridge, the receiver's threshold and filter, the dossier risk and the
receiver's block list (ADR-013). The probe signal joins in M4. Claims are not an input; a contract
test checks that the verdict code never reads them.

## Disclosure (ADR-011)

| Audience | Sees |
|---|---|
| receiver | `Score`, `Threshold`, `Risk`, `Kind`, `Reason`, `RuleVersion` (in `GET /v1/me/feed` and `GET /v1/me/deferred`, and as `EM2-*` headers on forwarded ingress requests) |
| journal and observer role | everything |
| sender | only `202 Accepted` with the message id, for every verdict including deny (ADR-013) |

Sender-facing responses are identical apart from the message id and are padded to the same response
time. Verdicts are decided asynchronously, after the dossier, so the response cannot depend on them.

## Exchange lifecycle

`core.ExchangeState`: `received → normalized → scored → decided →` one of
`forwarded → responded`, `deferred → released | expired`, `denied`.
Any other transition is a bug; `core.ValidTransition` encodes the allowed edges and the contract tests
check it.
