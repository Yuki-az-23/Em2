// Package kernel is EM2's runtime shell: the module registry, the request
// pipeline, problem+json errors, the transactional outbox event bus,
// migrations, rate limiting, metrics and OpenAPI generation.
//
// Modules, adapters and plugins never talk to each other directly. They
// register routes, events, services and jobs with a Registry, and the kernel
// wires them together in dependency order (ADR-001).
package kernel
