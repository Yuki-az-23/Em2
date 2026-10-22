# ADR-014: Quotas, reputation and probe detection

Status: accepted (M4)

## Context
M4 makes senders accountable: how much they may send, how their messages fare, and what happens
when a sender tries to learn a receiver's threshold by sending near-threshold variants (the
reconnaissance the Yellow Team lens is about, ADR-011). Each of these touches what a sender may
learn about receivers.

## Decision
1. **Quotas meter the sender's own volume.** Messages (bus publish and ingress) per hour and egress
   fetches per day, counted in the ledger in fixed windows. Running out is a `429` naming the
   quota. Ingress counts the request before the handle is looked up, so an unknown handle costs the
   same as a real one. A `429` depends only on the caller's own use, never on a receiver.
2. **Reputation is visible to observers only.** The ledger counts each sender's verdict outcomes
   (from `verdict.exchange.decided`). A sender who could read their own deny count could send one
   message to one receiver and learn that receiver's verdict, so `GET /v1/me/ledger` shows the
   bridge, settings and quotas, and only `GET /v1/principals/{id}/ledger` (observers; everyone else
   gets the same 404 as for an unknown id) shows reputation and penalties.
3. **Reputation changes quotas, slowly.** Standing is `(passes + 0.5·shapes + 1) / (passes + shapes +
   denies + 2)`; defers are neutral, because a far receiver is not misbehaviour. After 10 outcomes,
   the quota factor is `clamp(2·standing, 0.25, 1)`.
4. **Probing is detected by the verdict engine, per sender and receiver.** When a sender's content
   scores within `probe_band` (0.15) of a receiver's threshold, the engine counts the distinct
   contents from that sender to that receiver that did the same within `probe_window_minutes`
   (60). At `probe_variants` (5) the content is denied for that receiver, and
   `verdict.probe.detected` makes the ledger apply a 24-hour penalty (quota factor 0.25). The
   sender keeps getting the same `202`. A probe is a property of a sender and a receiver, not of
   content, so it is not a dossier signal.
5. **Shadow mode observes without effects.** Reputation, probes and penalties are recorded, but
   only enforce mode lets them reduce quotas.
6. **Shaped messages are limited to one per `shape_interval_seconds` (60) per sender and
   receiver.** Later shaped messages are deferred with a hold time and decided again when it
   passes.
7. **Reconciliation.** Reputation counters are kept incrementally and recomputed every 5 minutes
   from the outcome rows and penalties they come from. Differences are repaired, recorded in
   `ledger.reconciliations` and counted in `em2_ledger_drift_total`.
8. **The ruleset moves to `em2-2.1`**, which adds the probe and shape settings. `em2-2.0` still
   loads and means "no probe detection, no shape limit".

## Consequences
- A sender whose quota drops after probing learns that EM2 noticed. That is a deliberate deterrent;
  it does not say which receiver or which threshold.
- The public card shows the current emotion by default, as the blueprint decided. A principal who
  wants nothing shown sets `card: hidden`.
- Rate limits, usage windows and the circuit breaker are per database or per process as before;
  quotas live in the database and are shared by replicas.
