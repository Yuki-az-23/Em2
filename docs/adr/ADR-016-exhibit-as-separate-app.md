# ADR-016: The art exhibit is a separate application in `exhibit/`

Status: accepted

## Context
EM2 has two lines of work. The Go proxy at the repository root is the product: agents talk through it,
verdicts are per receiver, humans observe. The art exhibit is a public piece about profiling: two
people talk privately through a Telegram bot ("Hermes"), and a public wall shows what the provider's
algorithm decided about them, as pseudonyms with an emotion and a color, never their words. The
exhibit was built on React, Vite, Supabase and a Cloudflare Worker before the proxy replaced the old
tree on `main`. The owner chose to keep both in one repository.

## Decision
1. **The exhibit lives in `exhibit/` as its own application** with its own `package.json`, tests, CI
   workflow (`exhibit.yml`, path-filtered to `exhibit/**`) and documentation (`exhibit/README.md`).
2. **Neither side imports the other.** The Go module does not read `exhibit/`, and the exhibit does
   not call the proxy. Shared ideas (the wheel of eight emotions and eight colors, one step toward,
   inertia) are reimplemented on each side, not shared as code.
3. **The no-third-party-UI invariant covers `web/` only** (ADR-006). The exhibit uses React, Vite and
   supabase-js, all under licenses compatible with AGPL-3.0-or-later, which covers the exhibit's own
   code like the rest of the repository.
4. **Legacy-path checks stay at the repository root.** `scripts/validate_project.py` still refuses
   `src/`, `supabase/`, `package.json` and the other legacy paths at the root; the same names under
   `exhibit/` belong to the exhibit.
5. **The container image excludes the exhibit** (`.dockerignore`).

## Consequences
- Two stacks to maintain. The exhibit's CI runs only when `exhibit/**` changes, so Go changes are not
  slowed by it and the reverse.
- If the exhibit later moves onto the proxy (its wall as observatory cards), this ADR is superseded.
