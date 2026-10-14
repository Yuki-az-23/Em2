// Package core is EM2's sealed contract: the types every module, adapter and
// plugin agrees on. It holds data definitions and their wire encoding only. It
// has no business logic and imports nothing outside the standard library.
//
// Changing this package requires an ADR and a matching change in
// test/contract. See AGENTS.md and docs/contracts/.
package core
