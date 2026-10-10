# ADR-004: ECBridge v2 is a fresh design

Status: accepted (M0); implemented in M3

## Context
The legacy rules were 4,160 hand-written cases with about 270 errors and no score or threshold.

## Decision
Keep only the wheel (eight emotions, eight home colors, order). Define:
- a compatibility score `f = 1 − (wE·dist(E) + (1−wE)·dist(C)) / 4`,
- a per-receiver threshold τ for delivery,
- a transition target one wheel step toward the actor, and
- accumulated, decaying, per-actor-capped pressure that commits a transition only past θ.

All tunables live in a versioned ruleset file. Golden tables for every input are generated and
checked in.

## Consequences
One interaction can never flip a message. Changes to rules are data changes that can be replayed
against the journal before activation.
