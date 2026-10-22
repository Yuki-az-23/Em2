# Contract: Message

Go type: `core.Message` (`core/message.go`). Owner: `core-architect`. Changing it needs an ADR and a
change in `test/contract/`.

A Message is the one canonical unit of communication. Every adapter (bus, MCP, ingress, egress)
normalizes its protocol payload into a Message before anything else in EM2 sees it.

## Two halves

| Half | Fields | Filled by | May drive a verdict |
|---|---|---|---|
| Trusted | `ID`, `At`, `Plane`, `Direction`, `Sender`, `Receiver`, `ChannelID`, `ParentID`, `Stance`, `Content` (hash, size, mime), `Provenance` | EM2 only: identity from authentication, stance and bridges from the ledger, hashes computed by EM2 | yes |
| Untrusted | `Claims` | whatever the sender or upstream asserted | **no** |

Rules (ADR-011):

1. `Ref.Bridge` and `Message.Stance` are set from the ledger. A normalizer must never copy them from input.
2. `Claims.EC` holds any emotion/color the sender asserted, from a body field or `EM2-Emotion` /
   `EM2-Color` headers. Only the dossier builder reads it, to compute `claim_drift`.
3. `Claims.Headers` holds allowlisted request headers with values capped at 256 bytes.
4. An unauthenticated origin (egress content, an external caller on ingress) has `Stance == nil`.
   Its content starts in the `unknown` state and never adds pressure.

## Fields

| Field | Type | Meaning |
|---|---|---|
| `ID` | string (UUID) | assigned by EM2 at normalization |
| `At` | time | EM2 receive time (UTC) |
| `Plane` | `bus` \| `ingress` \| `egress` | which data plane carried it |
| `Direction` | `inbound` \| `outbound` | relative to the receiving principal |
| `Sender`, `Receiver` | `Ref{Kind, ID, Bridge}` | `Kind` is `principal`, `channel` or `external` |
| `ChannelID`, `ParentID` | string | empty when not applicable |
| `Stance` | `*EC` | sender's bridge at send time, from the ledger |
| `Content` | `{Mime, BodyMD, BodyRef, SHA256, Bytes, Lang}` | body is Markdown (CommonMark subset) or a storage reference |
| `Provenance` | `{SourceURL, UpstreamHost, Hops}` | where the content came from |
| `Claims` | `{EC, Headers, UserAgent, Upstream}` | untrusted assertions |

Emotion and color are wheel indices 0..7 inside EM2 and lowercase names on the wire:
`joy trust feared surprised sad disgust angry anticipated` and
`yellow lime green aqua blue pink red orange`.
