# ADR-001: Sealed core and registry-driven kernel

Status: accepted (M0)

## Context
The legacy API mixed routing, persistence and ECBridge rules in controllers. The seed template
requires a stable core and registry-driven modules.

## Decision
- `core/` holds the contract types only: no logic, no imports outside the standard library.
- `kernel/` provides a registry where modules, adapters and plugins register routes, migrations, event
  subscriptions, services and jobs. Modules boot in dependency order; cycles fail at boot.
- A module may resolve another module's service only if it lists that module in `DependsOn`.
- Module code lives under `internal/modules/<name>/`; code no other module may import goes under
  `internal/modules/<name>/internal/`, which the Go compiler enforces.

## Consequences
Adding a protocol or a policy is a registration, not a core change. The registry can describe the
whole running system (`GET /v1/admin/modules`).
