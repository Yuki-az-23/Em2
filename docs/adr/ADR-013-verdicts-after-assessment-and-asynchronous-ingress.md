# ADR-013: Verdicts after assessment, and asynchronous ingress

Status: accepted (M3)

## Context
M3 turns the dossier into decisions. Three questions came up while building it.

1. **When is a verdict decided?** The dossier of a message is rebuilt from the outbox after the
   message is stored. A verdict decided at publish time would see the previous copies' risk, so the
   first copies of a flood would always pass.
2. **What does the score compare?** The blueprint scores "the sender's stance against the receiver's
   bridge". Pressure moves a *message's* state, and a moved message must reach receivers it did not
   fit before. Scoring the stance would make pressure invisible to delivery.
3. **How does the reverse proxy answer the sender?** BLUEPRINT B1 forwards pass and shape at once and
   answers deny with `403`. Both leak the verdict: a synchronous upstream answer tells the sender
   "delivered", and a `403` tells them "denied by this receiver". Verdicts are also decided only after
   the dossier, so a synchronous answer would have to wait for the outbox.

## Decision
1. **Verdicts are decided on `ingest.message.assessed`**, an event ingest publishes once the
   message's dossier has been rebuilt. It carries the message's risk at that moment. Every receiver of
   the message (channel subscribers other than the author, or the addressed principal of a direct
   message) gets an exchange with its own verdict.
2. **The score compares the receiver's bridge with the message's current state.** The state starts at
   the sender's stance (ADR-011) and moves only by pressure. Deferred exchanges are re-decided when
   the message transitions and when the receiver changes bridge, threshold or filter. Delivered
   exchanges are never withdrawn. A deferred exchange whose content meanwhile reached the deny limit
   expires instead of being released.
3. **Ingress is asynchronous.** `POST /ingress/{handle}` answers every accepted request, including
   requests to unknown handles and requests the receiver will deny, with the same padded
   `202 {"id"}` the bus gives. When the receiver's verdict delivers the request (pass or shape, or
   later on release), EM2 forwards the original bytes to the receiver's registered upstream with the
   receiver's `EM2-*` headers. A successful upstream answer becomes a **reply message** from the
   receiver to the sender, decided by the sender's own bridge and delivered to the sender's feed.
   Upstream error bodies, status codes and banners are recorded internally and never relayed.
4. **Forwards are never retried.** A request may have side effects at the upstream. A forward
   interrupted by a crash is marked failed. A circuit breaker per upstream (5 consecutive failures,
   open 60 s) stops hammering a broken endpoint.
5. **Replies are not forwarded.** Only original requests have a stored request body, so two agents
   with upstreams cannot loop through EM2.
6. **Every outbound connection goes through `internal/netguard`**, which checks every resolved
   address at dial time (private, loopback, link-local, CGNAT, metadata, documentation and
   translation ranges, IPv4-mapped forms), allows only ports 80, 443 and 8080–8999, ignores proxy
   environment variables and checks each of at most 3 redirects. `EM2_NET_ALLOW_PRIVATE=on` lifts the
   address and port checks for development and tests only, and the server logs a warning.

## Consequences
- A sender never learns a verdict, not even deny: the ingress response is less informative than the
  blueprint's `403`. The sender learns that a request was delivered only if an answer arrives.
- Ingress is not a drop-in synchronous HTTP proxy. Callers that need a synchronous answer poll
  their feed (or, from M5 on, use the MCP adapter's waiting call).
- Messages stored before M3 have no verdict-side state; they cannot be braced and have no exchanges.
- Shadow mode records the real verdict and delivers every exchange; the receiver sees
  `shadow: true` next to the real kind.
