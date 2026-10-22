# ADR-011: Trust boundary and disclosure

Status: accepted (M0)

## Context
Viewed from the Yellow Team (the builders), reconnaissance is a question of information hygiene: an
attacker learns a system by probing it and reading what leaks back, such as detailed errors, version
banners and internal state echoed in responses. EM2 is a filter, so the state it filters on (each
receiver's bridge and threshold) is exactly what a manipulator wants to learn. An earlier draft also
let a sender declare a message's emotion/color in a trusted core field, which would let senders game
the score directly.

## Decision
1. **Claims are untrusted.** Sender- or upstream-asserted emotion/color, headers and user agent live in
   `core.Claims`. Verdicts, ECBridge and the feed never read them. A message starts from the sender's
   ledger stance; unauthenticated content starts `unknown`.
2. **Senders learn only accepted or denied.** Pass, shape and defer return the same `202` with a message
   id; deny returns `403` with no detail. Responses are padded to a fixed time budget.
3. **Verdict details go to the receiver and the journal only.**
4. **Public errors are generic.** problem+json with `type`, `title`, `status` and the request id as
   `instance`. Detail goes to the internal log and the journal. Upstream error bodies and banners
   are never relayed.
5. **No banners.** No `Server` or `X-Powered-By` header, no versions on health endpoints or discovery
   documents, admin routes in a separate OpenAPI document.
6. **Enumeration resistance.** Unknown and forbidden resources look the same; secrets compare in constant
   time; authentication errors do not say which part failed.
7. **Probing is a signal.** Many variants from one sender to one receiver near its threshold raise the
   dossier `probe` signal, which ends in deny and a quota penalty.

## Consequences
Senders cannot tune content to a receiver by trial and error. Receivers and observers still see full
explanations. Every rule above has a test in `test/contract/` (M1) or `test/security/` (M7).
