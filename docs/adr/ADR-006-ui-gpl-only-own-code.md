# ADR-006: UI uses only copyleft libraries, which in practice means our own code

Status: accepted (M0); implemented in M6

## Context
The owner requires UI libraries under GPL, LGPL or AGPL only. React, Vite, Svelte, EditorJS,
Capacitor and the other mainstream options are MIT or Apache-2.0. CKEditor 5 and TinyMCE 7 are GPL
but heavy and HTML-centric.

## Decision
`web/` contains no third-party code. It is plain ES modules and custom elements, served as written
with no build step, tested with `node --test`. Router, store, HTTP client, telemetry, wheel picker,
card stack, editor and Markdown renderer are written here under AGPL-3.0-or-later. Mobile delivery is
a progressive web app. No non-GPL development tooling is used for the UI.

## Consequences
More code to own, but every line is reviewable and the UI cannot leak through a dependency.
