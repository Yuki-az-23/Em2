# EM2 as an Emotion-Guided Communication Proxy: Understanding and Blueprint

> Approved plan, kept as the master design. Implementation status per milestone is in `docs/milestones/`.
> Where an implementation detail differs from this text, the milestone file records the difference
> (M1: `docs/milestones/M1.md`; M2: `docs/milestones/M2.md` and ADR-012; M3: `docs/milestones/M3.md`
> and ADR-013, which makes ingress asynchronous and answers every sender with the same `202`).

## Context

EM2 (Emotion Manager 2) started as a social app where every post ("repeat") carries an emotion and a color, every user sets an "EC Bridge" (their own emotion and color), and interactions transition posts between emotional states so they move in and out of other people's feeds. The purpose was never the social app itself. It was a filter: gather enough information about a piece of content to tell whether it is spam or manipulation aimed at a person, the way YouTube "mixmash" music videos were used to onboard audiences into networks that markets had not reached yet. The owner's goal is to protect a person's liberty of attention and to catch the moment someone slides into a bad emotional loop.

The owner has now reframed EM2 as a **proxy**: a communication-guidance layer that agents talk through and that humans observe. The seed template `Yuki-az-23/agent-architecture-seed` (read in full this session, commit `72a2a72`) supplies the production method: sealed core, registry-driven modules, isolated adapters and plugins, seven milestones, a fixed agent-role registry, a label taxonomy with required checks, and a Forgejo + Argo CD + Argo Workflows production flow.

Decisions taken in this session:

| Decision | Choice |
|---|---|
| Product shape | Emotion-guided communication proxy with three data-plane modes: native bus (REST + MCP), ingress reverse proxy, egress forward proxy |
| Stateful unit | The **message**. Each message has emotion/color state and a dossier. Channels only aggregate. |
| Backend | Go 1.23+, stdlib `net/http`, PostgreSQL via pgx. Deps limited to pgx and x/crypto. |
| ECBridge rules | Fresh wheel-based design with score, threshold and pressure. Legacy tables reference only. |
| UI | Strictly GPL/LGPL/AGPL libraries, which means own code on the bare web platform, zero build step, no non-GPL dev tooling. |
| License | AGPL-3.0-or-later |
| Delivery | Agent-first. Agents are the actors; humans observe through a PWA observatory. |
| Content format | Markdown (CommonMark subset) with an `emotion` fence. |
| Production flow | Seed template adopted. CI in both `.forgejo/workflows/` and `.github/workflows/` in parallel. Deploy by GitOps PR to the cluster manifests repo. Batch via Argo `batch-run`. |
| Lenses | Yellow Team (the builders: secure coding and information hygiene), security operations, DevOps, GitOps, RevOps |
| Trust boundary | A sender-declared emotion/color is an untrusted claim. It never enters the core's trusted fields and never drives a verdict. Scoring uses only the sender's authenticated stance from the ledger. Senders receive generic outcomes; verdict details go to the receiver and the journal only. |

Correction from review: an earlier draft read "Yellow Team" as "tier-low team" and added a small-team operability lens. The owner meant the Yellow Team of the security color wheel: developers, cloud architects and system builders, whose job is to remove the leaks that make reconnaissance work. For a builder, reconnaissance (REC) means information hygiene: generic errors to the public, technical detail only in internal logs, no field that lets an outsider learn internal state by probing. This draft applies that lens throughout, and in particular removes the `Declared` emotion/color field from the sealed core (B3), redefines what the sender may learn from a verdict (B6), and adds a probe signal to the dossier (B5).

Part A is what exists today. Part B is the blueprint. Part C is the seed alignment (milestones, roles, labels, gates, CI).

---

# Part A: What exists today (established facts)

## A1. Legacy backend (commit `8102416`, `OLD/API/`, not in the working tree)
Express 4 + Mongoose, JWT without expiry, SHA1-HMAC passwords, photos as Buffers in Mongo. The feed was `GET /posts` returning everything, filtered in the browser by `post.color === userColor || post.emotion === userEmotion`. The ECBridge transition was `PUT /post/:postId`, callable by anyone with any values; comment and brace never ran it server-side. Brace used the post's own initial emotion, so the bracer's bridge was ignored. No ownership checks on user update, user delete or comment delete. Validators ran after controllers.

## A2. Legacy ECBridge reality
Two services, 128 color files, 4,096 + 64 hand-written rules. No score, no threshold, no history. Hidden structure: a Plutchik wheel (joy/yellow 0, trust/lime 1, feared/green 2, surprised/aqua 3, sad/blue 4, disgust/pink 5, angry/red 6, anticipated/orange 7) with a distance-based emotion table and six color permutations, plus about 270 copy-paste errors (`'Disgsut'`, `'sad'`, a missing rule) that froze posts forever. Only the wheel geometry is carried forward.

## A3. Current working tree (React 19 + Vite + Supabase + Capacitor)
Shell only. Six of seven hooks are `console.log` stubs. Services target tables and RPCs that no migration creates. Two Supabase clients, two `useAuth`. Emotion casing mismatch between engine and database. Media upload path breaks the storage policy. Agent RPCs store API keys in plain text and violate a foreign key. The 22 docs contradict each other on completion. `CLAUDE.md` describes the deleted tree. License is MIT.

Carried forward: design tokens in `src/styles/variables.css`, the SVG wheel concept in `src/components/ECBridge/CircularEmotionPicker.jsx`, the swipe card concept in `src/components/Post/PostCard.jsx`, and two design docs (`Docs/ECBRIDGE_CIRCULAR_UI.md`, `Docs/UI_REFERENCE.md`). Nothing else.

## A4. Current dependencies under the strict GPL-only UI policy
React, react-router, react-swipeable, Vite, vitest, esbuild, TypeScript, EditorJS and its 13 plugins, supabase-js and all Capacitor packages are MIT or Apache-2.0 and therefore out. CKEditor 5 and TinyMCE 7 are the only mainstream GPL web editors; both are heavy HTML editors and not recommended. The UI will be own code.

## A5. The seed template (`/home/user/agent-architecture-seed`)
- `AGENTS.md`: invariants (stable core, registry-driven adapters/plugins, data/execution/portfolio/audit separated, every milestone verified, every subsystem has its own QA gate). Every task must carry a milestone and subsystem label and produce scope, subsystem, milestone, verification plan and evidence.
- `.claude/agents/`: orchestrator, validator, core-architect, kernel-engineer, data-engineer, execution-engineer, portfolio-reconciler, journal-auditor, adapter-specialist, plugin-specialist, qa-regression, infra-release, docs-maintainer.
- `.claude/skills/`: `argocd`, `argo-workflows`, `forgejo-api`, `forgejo-actions`, `forgejo-workflow`. Estate facts: Forgejo at `192.168.1.50` (git over SSH, API over token on port 3000, never `git.noit2.com` for the API), shared runner label `docker` (4 jobs), Forgejo ignores `.github/workflows/` once `.forgejo/workflows/` exists, Argo CD syncs `noit2/sandbox-platform` `cluster/manifests/` manually on PR merge, Argo Workflows only via `batch-run` template (no LAN access from jobs).
- `docs/`: task taxonomy (phases discovery → design → implementation → verification → review → done; labels `project:*`, `milestone:M1..M7`, `priority:p0..p2`, `type:*`), issue template, milestone checklist, project checklist.
- `scripts/`: `project_manifest.py`, `validate_project.py`, `orchestrator.py`, `self_update.py` (repairs missing seed files and refreshes `.project-manifest.json`). `.project-manifest.json` defines required checks: task (unit, contract), subsystem (unit, smoke, regression), milestone (milestone-gate, integration), release (smoke, health).

---

# Part B: Blueprint

## B1. What the proxy is

EM2 is one Go binary with a sealed core and three data-plane adapters. Every unit of communication that passes through it becomes a canonical **Message**, gets a **dossier** (evidence about the content), is scored against the receiver's **bridge**, receives a **verdict**, is **journaled**, and may add **pressure** that transitions the message's emotional state.

```
                 ┌──────────────────────── control plane (sealed core) ────────────────────────┐
  agents ──bus──►│ registry · lifecycle · identity · ledger · policy (rulesets) · journal     │──► observatory (humans)
  agents ◄ingress│                                                                             │
  agents ──egress│   data engine ──► execution engine ──► ledger ──► journal                   │──► SIEM / metrics
                 └──────────────────────────────────────────────────────────────────────────────┘
                     adapters: bus (REST+MCP) · ingress (HTTP, A2A, MCP) · egress (fetch, HTTP proxy)
                     plugins:  ecbridge · spam · manipulation · wellbeing · (classifier, optional)
```

### The three modes
| Mode | Who configures it | What flows | What EM2 does |
|---|---|---|---|
| **Native bus** | Agents call `/v1` or `/mcp` directly | Publish message to a channel, subscribe with own bridge, reply, react (brace) | Classic EM2: score, filter, pressure, transition, feed delivery |
| **Ingress reverse proxy** | Agent registers its endpoint; others address `https://em2/ingress/{handle}/...` | Inbound HTTP JSON, A2A JSON-RPC tasks, MCP JSON-RPC calls aimed at that agent | Normalize to Message, score against the agent's bridge, verdict: pass (forward), shape (forward with `EM2-*` headers), defer (hold, 202), deny (403 problem+json). Reply flows back through the same exchange and is journaled. |
| **Egress forward proxy** | Agent sets EM2 as HTTP proxy, or calls `POST /v1/egress/fetch` | Outbound requests and the content they bring back | Journal what the agent consumes, record any `EM2-Emotion`/`EM2-Color` headers from EM2-aware upstreams as untrusted claims, let plugins assess the content's emotion/color (state `unknown` until then), build the dossier, feed the rabbit-hole detector. No TLS interception: HTTPS via `CONNECT` is journaled as metadata only (host, bytes, timing); content-level scoring needs the explicit fetch API or plain HTTP. |

### What "guideline the communications" means in headers, and who may see them
The verdict belongs to the receiver, the principal whose bridge produced it. Disclosure follows that ownership:

| Direction | Headers / body | Who sees it |
|---|---|---|
| Toward the receiver (forwarded ingress request, bus/feed delivery, egress response to the consuming agent) | `EM2-Score` (0..1), `EM2-Verdict` (pass|shape), `EM2-Reason` (one sentence), `EM2-Risk` (0..1 with named signals), `EM2-Message-Id`, `EM2-Rule-Version` | the receiver only; an EM2-aware receiver can adapt, a non-aware one ignores them |
| Back to the sender (bus publish response, ingress response) | `202 Accepted` with `EM2-Message-Id` for pass, shape and defer alike; `403` problem `denied` with no detail for deny and probe | the sender learns only "accepted" or "denied", never a score, a bridge, a threshold, a reason or a rule version |
| Toward an external upstream (egress) | nothing EM2-specific; the agent's request is relayed with EM2 identity headers stripped | the upstream learns nothing about EM2 or the agent's bridge |

Pass, shape and defer are indistinguishable from the sender's side by status, body and headers; response timing is padded to a fixed budget on the ingress and bus publish paths so that timing does not reveal the branch either.

## B2. Repository layout (seed-aligned, single Go module)

```
/
├── LICENSE  AGPL-3.0-or-later
├── AGENTS.md                        EM2 architecture contract (seed format, EM2 invariants)
├── CLAUDE.md                        rewritten; points at AGENTS.md
├── README.md
├── .project-manifest.json           generated by scripts/project_manifest.py
├── .claude/agents/                  13 seed roles + observatory-engineer (frontend)
├── .claude/skills/                  five seed skills copied verbatim
├── .codex/README.md
├── .forgejo/workflows/ci.yml        runs-on: docker
├── .github/workflows/ci.yml         same jobs, GitHub runner
├── docs/
│   ├── task-taxonomy.md  issue-template.md  milestone-checklist.md  project-checklist.md   (seed, adapted)
│   ├── adr/ADR-001..011.md        011 = trust boundary and disclosure: claims vs stance, sender-facing generic outcomes
│   ├── contracts/{message.md, verdict.md, bridge.md, dossier.md, journal.md}   the core contract
│   ├── api/openapi.json             generated
│   ├── ECBRIDGE_V2.md  DOSSIER_V1.md  WELLBEING_V1.md  RUNBOOK.md
│   ├── milestones/M0..M7.md         milestone summaries (gate evidence)
│   ├── ui/ECBRIDGE_CIRCULAR_UI.md  ui/UI_REFERENCE.md   (moved)
│   └── legacy/README.md             how to read OLD/ at commit 8102416
├── scripts/                         seed scripts adapted: project_manifest.py, validate_project.py, orchestrator.py, self_update.py
├── go.mod                           module em2.social/em2 (deps: jackc/pgx/v5, golang.org/x/crypto)
├── cmd/
│   ├── em2/main.go                  serve | migrate | openapi | golden | replay | validate
├── core/                            SEALED CORE CONTRACT: types only, no logic, no deps
│   ├── message.go  verdict.go  bridge.go  dossier.go  principal.go  journal.go  events.go
├── kernel/                          registry, lifecycle, router, pipeline, schema, outbox bus, augmenters, jobs, metrics, problem+json, openapi
├── pkg/
│   ├── ecbridge/                    pure engine (wheel, score, target, pressure, explain) + rulesets/*.json + golden/
│   ├── schema/                      tiny JSON-schema subset, validate + emit OpenAPI
│   └── markdown/                    CommonMark subset + emotion fence + allowlist HTML renderer
├── internal/
│   ├── modules/                     registered through kernel; private code under <name>/internal/
│   │   ├── identity/                users, sessions, agents, API keys (M1)
│   │   ├── ingest/                  data engine: normalizers → Message, media, dossier builder, replay reader (M2)
│   │   ├── verdict/                 execution engine: policy evaluation, lifecycle states, forwarding, deferred queue, subscriptions (M3)
│   │   ├── ledger/                  bridges, history, thresholds, quotas, reputation, reconciliation, snapshots (M4)
│   │   ├── journal/                 append-only hash-chained journal, projections, telemetry ingestion, exports (M6)
│   │   ├── observatory/             read API for the UI: weather, trails, dossiers, swarm (M6)
│   │   └── admin/                   modules, rulesets, thresholds, modes, health, discovery docs
│   ├── adapters/                    protocol edges, registered through kernel
│   │   ├── bus/                     REST /v1 publish/subscribe/interact
│   │   ├── mcp/                     JSON-RPC 2.0 Streamable HTTP at /mcp (tools + resources)
│   │   ├── ingress/                 reverse proxy: http, a2a, mcp upstream handlers
│   │   └── egress/                  explicit fetch API + HTTP forward proxy (CONNECT metadata-only)
│   ├── plugins/                     policy plugins, registered through kernel
│   │   ├── ecbridge/                score/target/pressure (wraps pkg/ecbridge)
│   │   ├── spam/                    repetition, burst, sender concentration
│   │   ├── manipulation/            bombardment asymmetry, bridging vector, liberty guard
│   │   ├── wellbeing/               rabbit-hole detection for humans; swarm drift for agents
│   │   └── classifier/              OPTIONAL external classifier interface (provider abstracted, off by default)
│   └── storage/{fs,s3}/             object storage adapters (own SigV4)
├── deploy/
│   ├── docker-compose.yml           small-team default: em2 + postgres
│   ├── Dockerfile                   distroless, non-root, read-only FS
│   └── k8s/                         manifests to submit by PR to the cluster repo (Argo CD)
├── web/                             zero-build observatory PWA, embedded via embed.FS
│   ├── index.html  manifest.webmanifest  sw.js
│   ├── src/kernel/   router.js  store.js  http.js  telemetry.js  api.generated.js
│   ├── src/ecbridge/ JS mirror of pkg/ecbridge, tested against golden JSON
│   ├── src/components/  em2-wheel  em2-card-stack  em2-editor  em2-markdown  em2-trail  em2-dossier  em2-weather  primitives
│   ├── src/modules/{auth,observatory,feed,message,bridge,profile,wellbeing,ops}/
│   └── test/                        node:test
├── agent/                           SKILL.md  llms.txt  well-known.json  examples/
└── test/
    ├── contract/  smoke/  regression/  integration/  security/
    └── corpus/                      replay corpus (journal fixtures) for regression and parity
```

Deleted in M0: `src/`, `supabase/`, `em2-agent-skill/`, `Docs/` (two design docs moved first), `.agent/`, `package.json`, `vite.config.js`, `capacitor.config.json`, `eslint.config.js`, `index.html`, `SETUP.md`, `TESTING.md`.

## B3. The sealed core contract (`core/`)

Types only. No logic, no imports beyond stdlib. Changing this package requires `core-architect` review and a contract test update (seed invariant "core-remains-stable").

```go
package core

type Emotion uint8   // 0..7 wheel index; String() gives lowercase name
type Color   uint8
type EC struct{ Emotion Emotion; Color Color }

type PrincipalKind string // "agent" | "human" | "campaign" | "system"
type Principal struct {
    ID, Handle string; Kind PrincipalKind; OwnerID string; Scopes []string; Roles []string
}

type Plane string      // "bus" | "ingress" | "egress"
type Direction string  // "inbound" | "outbound"

// Trust boundary. A Message has two halves. The trusted half is filled only by EM2 from its own ledger and
// journal (Sender/Receiver refs resolved from authenticated principals, Stance read from the ledger, Content
// hash computed by EM2). The untrusted half is Claims: everything a sender or upstream asserted. The verdict
// engine, the ECBridge plugin and the feed never read Claims. Only the dossier builder reads them, to compare
// what was claimed with what was observed, and the journal records them.
type Message struct {
    ID          string
    At          time.Time
    Plane       Plane
    Direction   Direction
    Sender      Ref        // authenticated principal, or an external origin with Bridge == nil
    Receiver    Ref        // principal, channel, or external destination
    ChannelID   string     // "" for direct exchanges
    ParentID    string     // reply-to
    Stance      *EC        // sender's bridge at send time, read from the ledger; nil for unauthenticated origins
    Content     Content    // mime, body_md or ref, sha256, bytes, lang
    Provenance  Provenance // source_url, upstream host, hop chain
    Claims      Claims     // UNTRUSTED; see above
}
type Ref struct{ Kind string; ID string; Bridge *EC }   // Bridge is populated from the ledger only, never from input

// Claims is what the sender or upstream said. It is data for the dossier and the journal, never a decision input.
type Claims struct {
    EC        *EC               // "this content is joy/yellow" from a body field or EM2-Emotion/EM2-Color headers
    Headers   map[string]string // allowlisted request headers, values length-capped
    UserAgent string
    Upstream  string
}

type Dossier struct {
    ContentHash string
    FirstSeen   time.Time
    SeenCount   int
    Senders     int         // distinct
    Receivers   int         // distinct
    Clusters    int         // distinct receiver bridge clusters reached
    Velocity    float64     // messages/hour over last window
    Burstiness  float64
    SenderConc  float64     // share of top sender
    Bridging    float64     // share of deliveries into bridges with compat < receiver threshold
    Drift       float64     // claimed EC vs sender stance vs the EC receivers transition the content toward
    Probe       float64     // one sender, many content variants at one receiver, each near that receiver's threshold
    Links       []string
    Signals     []Signal    // {Name, Weight, Evidence}
    Risk        float64     // 0..1
    Version     string      // dossier ruleset version
}

type VerdictKind string // "pass" | "shape" | "defer" | "deny"
type Verdict struct {
    MessageID   string
    Receiver    Ref
    Score       float64    // compat
    Threshold   float64
    Risk        float64
    Kind        VerdictKind
    Reason      string
    RuleVersion string
    DecidedAt   time.Time
}

type ExchangeState string // received | normalized | scored | decided | forwarded | responded | deferred | released | expired | denied

type Transition struct {
    MessageID string; From, To EC; Pressure, Threshold float64; Contributors int; Trigger Ref; TriggerKind string; RuleVersion string; At time.Time
}

type JournalEntry struct {
    Seq uint64; At time.Time; Kind string; PrevHash, Hash []byte; Actor *Principal; Payload json.RawMessage; TraceID string
}
```

## B4. Kernel (`kernel/`)

Same kernel as previously designed, with the seed's registry pattern made explicit: three registration kinds (module, adapter, plugin) and a lifecycle.

```go
type Module  interface { Manifest() Manifest; Register(r *Registry) error }
type Adapter interface { Module; Protocol() string; Mount(mux *http.ServeMux) }                 // protocol edge
type Plugin  interface { Module; Policy() string; Evaluate(ctx Ctx, m *core.Message, d *core.Dossier, rcv core.Ref) (PolicyResult, error) }

type Manifest struct{ Name, Version string; DependsOn []string; Schema string; Migrations fs.FS; Kind string /* module|adapter|plugin */ }

type Registry struct{ /* unexported */ }
func (r *Registry) Route(rt Route)
func (r *Registry) Emits(ev EventDef)
func (r *Registry) Subscribe(name string, version int, h EventHandler)
func (r *Registry) Provide(svc any)
func Resolve[T any](r *Registry) (T, error)           // only if provider ∈ DependsOn
func (r *Registry) Augment(resource, key string, fn AugmentFunc)
func (r *Registry) Job(name string, every time.Duration, fn JobFunc)
func (r *Registry) Policy(p Plugin, order int)         // plugins run in order; results are combined by verdict module

type Lifecycle interface { Boot(ctx) error; Ready() bool; Drain(ctx) error; Mode() RunMode }   // RunMode: enforce | shadow | replay
```

Pipeline per request: request id → trace → body limit and decode → auth (JWT human, API key agent, mTLS later) → scope → rate limit → schema validation → idempotency → handler → ETag → problem+json. Isolation: `internal/` package boundaries, one Postgres role per schema (created and granted by `em2 migrate`; each transaction runs `SET LOCAL ROLE`), `Resolve` only through `DependsOn`, events validated at publish. Error model: RFC 9457 problem+json with codes `validation`, `unauthenticated`, `forbidden`, `not-found`, `conflict`, `precondition-failed`, `rate-limited`, `payload-too-large`, `consent-required`, `upstream-unavailable`, `deferred`, `denied`, `internal`.

Kernel tables: `kernel.migrations`, `kernel.outbox`, `kernel.idempotency`.

## B5. Data engine: `ingest` module (M2)

Owns normalization and the dossier. The seed's "perception layer": raw provider data stays in adapters; the core sees only `core.Message`.

- **Normalizers** (one per adapter protocol): bus REST body → Message; MCP `tools/call` → Message; ingress HTTP (JSON body + allowlisted headers) → Message; A2A task → Message (role, parts, artifacts flattened to Markdown); egress fetch response → Message (HTML → text → Markdown subset via `pkg/markdown`).
- **Media**: `POST /v1/media` (image ≤ 5 MB, magic bytes checked), object storage adapter.
- **Dossier builder**: on every Message, upsert `ingest.dossiers` by content hash; update spread counters from the journal projection; compute signals with versioned rules (`DOSSIER_V1.md`):

| Signal | Evidence | What it catches |
|---|---|---|
| `repetition` | same hash seen N times in window | spam |
| `burst` | velocity above baseline × k | campaigns |
| `sender_concentration` | top sender share ≥ 0.6 | astroturf |
| `bridging_vector` | deliveries into far bridges (compat < receiver τ) ≥ 0.5 of deliveries | the "mixmash onboarding" pattern: content pushed across clusters it does not fit |
| `claim_drift` | claimed EC far from the sender's stance, or from the EC receivers transition the content toward | mislabeled emotional framing |
| `probe` | one sender sends many content variants to one receiver inside a window, with scores clustered just below and just above that receiver's threshold | reconnaissance of a receiver's bridge and threshold |
| `liberty_pressure` | receivers' bridges move negative within 24 h after exposure | content that drags people down |
| `link_fanout` | many distinct external links or redirect chains | funnels |

`Risk = clamp01(Σ weight_i × signal_i)` with weights in the dossier ruleset. All heuristics, all explainable, all versioned. An optional `classifier` plugin can add a signal from an external model; it is off by default and never required.

```sql
CREATE TABLE ingest.messages (id uuid PRIMARY KEY, at timestamptz NOT NULL, plane text NOT NULL, direction text NOT NULL,
  sender jsonb NOT NULL, receiver jsonb NOT NULL, channel_id uuid, parent_id uuid, stance_emotion smallint, stance_color smallint,
  content_hash bytea NOT NULL, mime text NOT NULL, body_md text, body_ref text, bytes int, lang text,
  provenance jsonb NOT NULL, claims jsonb NOT NULL DEFAULT '{}', deleted_at timestamptz) PARTITION BY RANGE (at);
CREATE INDEX ON ingest.messages (content_hash); CREATE INDEX ON ingest.messages (channel_id, at DESC);
CREATE TABLE ingest.dossiers (content_hash bytea PRIMARY KEY, first_seen timestamptz, seen_count int, senders int, receivers int,
  clusters int, velocity real, burstiness real, sender_conc real, bridging real, drift real, links jsonb, signals jsonb, risk real,
  version text, updated_at timestamptz);
CREATE TABLE ingest.media (id uuid PRIMARY KEY, owner_id uuid, storage_key text, mime text, bytes int, width int, height int, sha256 bytea, created_at timestamptz);
CREATE TABLE ingest.channels (id uuid PRIMARY KEY, handle citext UNIQUE, owner_id uuid, kind text, visibility text, created_at timestamptz);
```

**Where a message's initial emotion/color comes from.** There is no per-message `bridge` field. A message's initial state is the sender's stance: the bridge the sender set through `PUT /v1/me/bridge`, which is journaled in the sender's history and also filters the sender's own feed. An agent that wants to speak from another emotion changes its bridge first, and that change costs it something and is visible to observers. A body field or header that claims an EC is stored in `claims` and feeds `claim_drift` only. For egress content with no authenticated sender, the initial state is `unknown` until a plugin assesses it; unknown content is delivered as `shape` with `EM2-Risk` carrying the signal `unassessed`, and never adds pressure.

REST (bus adapter, backed by ingest): `POST /v1/messages {channel, parent?, body_md, claims?}` → 202 `{id}`; `GET /v1/messages/{id}` (augmented with `bridge` state, `stats`; `dossier` only for the receiver, the author and observer roles); `GET /v1/channels`, `POST /v1/channels`, `GET /v1/channels/{id}/messages`; `GET /v1/dossiers/{hash}` (observer role).

Events: `ingest.message.received`, `ingest.dossier.updated`.

## B6. Execution engine: `verdict` module (M3)

The seed's "action layer": explicit lifecycle states, risk validated before execution, adapter payload logic kept out.

**Decision table** (inputs: compat score `f` between the sender's stance and the receiver's bridge, receiver threshold `τ`, dossier risk `r`, probe signal `p`, sender block state). Claims are not an input.

| Condition | Verdict | Effect on the receiver side | What the sender gets |
|---|---|---|---|
| sender blocked by receiver, or `r ≥ r_deny` (0.90), or `p ≥ p_deny` (0.70) | **deny** | nothing delivered; journaled; sender reputation lowered; probe raises the sender's quota penalty | `403` problem `denied`, no detail |
| `f < τ` and not denied | **defer** | held in the receiver's deferred queue; re-evaluated on receiver bridge change or message transition; expires after `defer_ttl` (24 h) | `202` with `EM2-Message-Id`, same as pass |
| `f ≥ τ` and `r ≥ r_shape` (0.60), or state `unknown` | **shape** | delivered with `EM2-*` headers including `EM2-Risk`; rate-shaped (1 per `shape_interval` per sender→receiver); does **not** add pressure | `202` with `EM2-Message-Id`, same as pass |
| otherwise | **pass** | delivered with `EM2-*` headers; interaction adds pressure per ECBridge | `202` with `EM2-Message-Id` |

The receiver's threshold, bridge, score and reason are never written into anything the sender can read: not the response, not a public message view, not an error. A sender who wants to know whether a message was delivered must ask the receiver.

Side effect on **pass** interactions (reply, brace, forward): `ecbridge` plugin applies pressure to the message; crossing θ commits a transition and emits `verdict.message.transitioned`, which releases matching deferred deliveries and updates subscriptions.

**Exchange lifecycle**: `received → normalized → scored → decided → {forwarded → responded | deferred → (released | expired) | denied}`. Stored per exchange; tested as a state machine.

**Subscriptions** (feed): `GET /v1/me/feed?explain=true` = messages in subscribed channels with `f ≥ τ` under the receiver's current bridge, cursor by `(at, id)`. `filter=off` returns all with scores. `_bridge.reason` carries the explanation. Strategy `diversify` applied when wellbeing says so.

```sql
CREATE TABLE verdict.exchanges (id uuid PRIMARY KEY, message_id uuid NOT NULL, receiver jsonb NOT NULL, state text NOT NULL,
  score real, threshold real, risk real, kind text, reason text, rule_version text, decided_at timestamptz, forwarded_at timestamptz,
  responded_at timestamptz, upstream_status int, latency_ms int, expires_at timestamptz);
CREATE INDEX ON verdict.exchanges (receiver, state, expires_at);
CREATE TABLE verdict.message_states (message_id uuid PRIMARY KEY, emotion smallint, color smallint, stance_emotion smallint,
  stance_color smallint, assessed boolean NOT NULL DEFAULT true, author_id uuid, version int DEFAULT 1, transitions int DEFAULT 0, updated_at timestamptz);
CREATE TABLE verdict.pressure (message_id uuid, target_emotion smallint, target_color smallint, pressure double precision,
  contributors jsonb DEFAULT '{}', updated_at timestamptz, PRIMARY KEY (message_id, target_emotion, target_color));
CREATE TABLE verdict.subscriptions (principal_id uuid, channel_id uuid, created_at timestamptz, PRIMARY KEY (principal_id, channel_id));
CREATE TABLE verdict.interactions (id uuid PRIMARY KEY, message_id uuid, actor_id uuid, kind text, at timestamptz);  -- brace, reply, forward
```

REST and who may call it:

| Endpoint | Visible to |
|---|---|
| `GET /v1/me/verdicts?message=` (verdicts where I am the receiver) | receiver |
| `GET /v1/messages/{id}/bridge` → committed state and version only | anyone who can read the message |
| `GET /v1/messages/{id}/bridge/pressure` → pressure rows and contributor counts (never contributor identities) | receivers of the message and observer role |
| `GET /v1/messages/{id}/bridge/transitions` | anyone who can read the message; trigger identity omitted for non-observers |
| `PUT/DELETE /v1/messages/{id}/braces/me`, `POST /v1/messages/{id}/replies` | authenticated principals with the scope |
| `GET/PUT/DELETE /v1/me/subscriptions/{channel}`, `GET /v1/me/deferred`, `GET /v1/me/feed` | the principal |
| `POST /v1/bridge/preview {actor, message}` → pure computation on caller-supplied values | anyone; it reveals the rules, which are public, never a real principal's bridge |

**No public endpoint sets a message's emotion or color.** Transitions happen only through pressure inside event consumers. **No endpoint returns another principal's current bridge or threshold** except the public card's coarse state (B8), which the principal can hide.

## B7. ECBridge v2 (plugin `ecbridge`, engine `pkg/ecbridge`)

Wheel: joy/yellow 0 (+1.0), trust/lime 1 (+0.5), feared/green 2 (−0.5), surprised/aqua 3 (0), sad/blue 4 (−1.0), disgust/pink 5 (−0.5), angry/red 6 (−0.75), anticipated/orange 7 (+0.25). `dist(a,b) = min(|a−b|, 8−|a−b|)`. `step(from, toward)` moves one position along the shortest arc (clockwise when opposite, stay when equal).

- **Score**: `f = 1 − (wE·dist(uE,pE) + (1−wE)·dist(uC,pC)) / 4`, `wE = 0.6`. Receiver threshold `τ` default 0.5.
- **Target** of an interaction by actor (aE,aC) on message (pE,pC): `(step(pE,aE), step(pC,aC))`. Resonance when equal: no pressure.
- **Pressure**: ignore author and bridge-less actors; `w = weight[kind] × (agent ? agentFactor : 1)`, per-actor cap `maxPerActor`; decay `0.5^(Δt/halfLife)`; commit when `Σ ≥ θ`; competing targets, first to cross wins.
- **Tunables** in `rulesets/em2-2.0.json`: `wE 0.6`, `θ 3.0`, `halfLifeHours 24`, `weights {reply 1.0, brace 0.5, forward 0.7, unbrace −0.5}`, `agentFactor 0.5`, `maxPerActor 1.0`, `excludeAuthor true`.
- **API**: `Dist`, `Step`, `Compat`, `Target`, `ApplyPressure`, `Explain`, `LoadRuleset`. `em2 golden` writes `compat-64x64.json` and `target-4096.json`; the JS mirror asserts equality.

## B8. Ledger: `ledger` module (M4)

The seed's "accountability layer": explicit snapshot contracts, risk checks on snapshots, observable reconciliation.

```sql
CREATE TABLE ledger.bridges (principal_id uuid PRIMARY KEY, emotion smallint, color smallint, set_at timestamptz, source text);
CREATE TABLE ledger.bridge_history (id bigserial PRIMARY KEY, principal_id uuid, emotion smallint, color smallint, started_at timestamptz, ended_at timestamptz, source text);
CREATE TABLE ledger.settings (principal_id uuid PRIMARY KEY, threshold real DEFAULT 0.5, w_emotion real DEFAULT 0.6, hard_floor real DEFAULT 0.0,
  filter_enabled boolean DEFAULT true, strategy text DEFAULT 'score', shape_interval_sec int DEFAULT 60, defer_ttl_sec int DEFAULT 86400);
CREATE TABLE ledger.quotas (principal_id uuid PRIMARY KEY, messages_per_hour int, pressure_per_day real, egress_bytes_per_day bigint, updated_at timestamptz);
CREATE TABLE ledger.reputation (principal_id uuid PRIMARY KEY, score real DEFAULT 0.5, denies int, shapes int, passes int, transitions_caused int, updated_at timestamptz);
CREATE TABLE ledger.blocks (principal_id uuid, blocked_id uuid, created_at timestamptz, PRIMARY KEY (principal_id, blocked_id));
CREATE TABLE ledger.endpoints (principal_id uuid PRIMARY KEY, protocol text, upstream_url text, health text, last_check timestamptz);  -- ingress targets
CREATE TABLE ledger.snapshots (id bigserial PRIMARY KEY, principal_id uuid, at timestamptz, body jsonb);
```

REST: `GET/PUT /v1/me/bridge`, `GET /v1/me/bridge/history`, `GET/PATCH /v1/me/settings`, `GET /v1/me/ledger` (snapshot: bridge, settings, quotas, reputation, deferred count, pressure contributed today), `PUT/DELETE /v1/me/blocks/{id}`, `GET/PUT /v1/me/endpoint` (ingress registration with health check), `GET /v1/principals/{id}` (public card: handle, kind, description, and a coarse state that is the current emotion only, no color, no threshold, no history; `settings.card_visibility` lets the principal hide the emotion too). The ingress `upstream_url` is never shown on the card.

Reconciliation job (every 5 min): recompute reputation and quota usage from the journal projection, compare with ledger rows, log and repair drift, expose `em2_ledger_drift_total`.

## B9. Runtime parity (M5)

One engine, three modes, selected per deployment and overridable per principal:
- `enforce`: verdicts are applied.
- `shadow`: everything scored and journaled, every verdict delivered as `pass` with `EM2-Shadow-Verdict` header. Small-team default for the first weeks.
- `replay`: `em2 replay --corpus test/corpus --ruleset em2-2.1.json` feeds journal entries through the engine and diffs verdicts and transitions against the recorded ones. Used for ruleset changes and regression.

Parity artifacts: golden tables (Go vs SQL `feed.compat` vs JS mirror), replay corpus, OpenAPI snapshot, MCP tool schema snapshot.

## B10. Journal and audit: `journal` module (M6)

Append-only, hash-chained (`hash = sha256(prev_hash || canonical(entry))`), partitioned by day, replayable. Everything that matters is an entry: message received, dossier updated, verdict, forward, response, transition, bridge change, ledger drift, admin action, telemetry session summary.

```sql
CREATE TABLE journal.entries (seq bigserial, at timestamptz NOT NULL, kind text NOT NULL, actor jsonb, payload jsonb NOT NULL,
  prev_hash bytea, hash bytea NOT NULL, trace_id text, PRIMARY KEY (seq, at)) PARTITION BY RANGE (at);
CREATE TABLE journal.checkpoints (at timestamptz PRIMARY KEY, seq bigint, hash bytea, signed_by text, signature bytea);
```

Projections (materialized by the journal module's consumers, read by observatory and wellbeing): `journal.weather_hourly` (messages, verdicts, transitions per emotion/color), `journal.trails` (per message transition trail), `journal.exposure` (per principal exposure per emotion per session), `journal.swarm_hourly`.

Telemetry ingestion from the observatory: `POST /v1/telemetry/events` (batched, consent-gated) and `POST /v1/telemetry/sessions`; summaries become journal entries.

Exports: `GET /v1/journal?from&to&kind` (admin, NDJSON), `GET /v1/journal/verify?from&to` (hash chain check), `/metrics` Prometheus text, daily checkpoint signed with the server Ed25519 key. SIEM-friendly: one JSON object per line, stable field names.

## B11. Wellbeing plugin (M6)

For humans: per-session features from the exposure projection (`c[e]`, valence `V`, diversity `H'`, negative share `N`, length `L`, night flag, bridge valence `B`, `ΔB7`, streak `S`), rabbit-hole score `R = clamp01(0.30·N + 0.25·(1−H') + 0.20·max(0,−V) + 0.10·min(L/60,1) + 0.10·min(S/3,1) + 0.05·night)`, trajectory flag `T`, states `ok → watch → nudge → support` with hysteresis, interventions (diversify feed, re-bridge prompt, break prompt, resources) with cooldowns. Consent default `minimal`. For agents: no individual scoring, only `swarm_hourly` valence and diversity for the observatory, plus a `drift` alert when the swarm's mean valence drops by 0.5 within 6 h.

REST: `GET /v1/me/wellbeing`, `PUT /v1/me/wellbeing/consent`, `GET /v1/me/wellbeing/trajectory`, `GET /v1/me/wellbeing/interventions`, `POST …/{id}/ack`, `DELETE /v1/me/wellbeing/data`, `GET /v1/wellbeing/swarm`.

## B12. Adapters

### bus (REST `/v1`) and mcp (`/mcp`)
MCP tools map one-to-one onto REST operations and share schemas: `em2_get_bridge`, `em2_set_bridge`, `em2_read_feed`, `em2_publish`, `em2_get_message`, `em2_reply`, `em2_brace`, `em2_unbrace`, `em2_preview_transition`, `em2_get_dossier`, `em2_feed_weather`, `em2_register_endpoint`, `em2_fetch` (egress). Resources: `em2://rulesets/active`, `em2://openapi`, `em2://llms.txt`. Hand-written JSON-RPC 2.0 over Streamable HTTP; the official Go SDK (MIT) is the fallback.

### ingress
Route `/{any}` under `ingress.{handle}.<domain>` or path prefix `/ingress/{handle}/`. Per registered endpoint: protocol (`http` | `a2a` | `mcp`), upstream URL, health. Request body size limit 1 MB, timeout 30 s, retries 0 (never duplicate a side effect), circuit breaker per upstream, hop-by-hop headers stripped, `EM2-*` headers added toward the upstream owner only. Upstream error bodies are never relayed to the sender: a 4xx/5xx from the owner's endpoint becomes a generic problem+json toward the sender, and the real body goes to the journal with the request id. Upstream `Server`, `X-Powered-By` and similar banners are stripped in both directions. A2A: `tasks/send` message parts flattened; artifacts on the response journaled. MCP: `tools/call` arguments journaled, responses scored on the way back (the agent's own output gets a dossier too).

### egress
`POST /v1/egress/fetch {url, method, headers?, body?}` with SSRF guard (deny RFC1918, link-local, loopback, metadata IPs; DNS re-resolution check; allowlist/denylist per principal), size cap 5 MB, timeout 20 s, HTML → Markdown subset, upstream `EM2-Emotion`/`EM2-Color` response headers recorded as claims (never trusted), dossier built, journaled. The outbound request carries no EM2 identity headers and a generic user agent; the `EM2-*` result headers go to the consuming agent only. HTTP forward proxy on a separate listener: plain HTTP fully journaled; `CONNECT` journaled as metadata only (no TLS interception; ADR-009).

## B13. Observatory UI (`web/`, zero-build, own code, AGPL)

No third-party JavaScript or CSS. Own router, store, fetch client (`api.generated.js` from OpenAPI), telemetry SDK, service worker, custom elements. Modules: `auth`, `observatory` (weather, trails, dossiers, swarm, live journal tail over SSE at `GET /v1/journal/stream`), `feed` (the observer's own bridge as lens, card stack, "why am I seeing this"), `message` (read, publish via `em2-editor`, replies), `bridge` (wheel, history), `profile` (agents, keys, endpoint registration), `wellbeing`, `ops` (modes, rulesets, drift, health; admin role). Served from `embed.FS` with CSP `default-src 'self'`.

## B14. Lenses

**Yellow Team (builders, information hygiene)**: the proxy must not be the thing that leaks. Rules, each with a test in `test/security/`:
- Public errors are generic problem+json with a request id; stack traces, SQL, upstream bodies, module names and rule versions go to internal logs and the journal only.
- A sender learns only accepted or denied. Score, bridge, threshold, reason and rule version flow toward the receiver and the journal, never back to the sender (B6). Response status, body and timing are uniform across pass, shape and defer.
- Sender-declared emotion/color is a claim outside the sealed core's trusted fields; no verdict branches on it (B3).
- Probing a receiver is itself a dossier signal that ends in deny and a quota penalty (B5).
- No version banners: no `Server` header, no build info on `/healthz`, `/readyz` returns only `ok`/`not ready` to non-admins; `/.well-known/em2-agent.json` and `/llms.txt` describe capabilities, never versions, hostnames or internal paths.
- The published OpenAPI is the public subset; admin, observer and journal routes are in a separate document served to admins only.
- Enumeration resistance: identical responses for unknown and forbidden principals, messages and channels; constant-time key comparison; login and key errors do not say which part was wrong.
- No field in any public representation carries another principal's current bridge or threshold; the public card shows a coarse, principal-controlled state.
- Secrets never in code or manifests: env or SOPS; `.gitignore` keeps the seed's exclusions.
- Dependencies pinned and minimal (two Go deps, zero UI deps), so there is little third-party surface to leak through.

**Security operations**: sealed core; `internal/` boundaries; one DB role per schema; keys hashed with pepper and shown once; scoped keys; Ed25519 JWT 15 min; argon2id; SSRF guard; no TLS interception; hash-chained signed journal; problem+json without stack traces; CSP; rate limits per principal and per IP; body limits; distroless non-root container; secrets via env, SOPS in GitOps; `test/security/` suite (SSRF corpus, header injection, key enumeration, replay of denied exchanges); `security-review` run before each milestone gate.

**DevOps**: one binary, one Postgres, no queue, no cluster required (`deploy/docker-compose.yml`); start in `shadow` mode; all tunables in one ruleset file; `em2 serve|migrate|validate|golden|replay|openapi`; `/healthz` (process), `/readyz` (DB, outbox lag, migration state); Prometheus metrics (`em2_exchanges_total{plane,verdict}`, `em2_transitions_total`, `em2_dossier_risk_bucket`, `em2_outbox_lag_seconds`, `em2_ledger_drift_total`, `em2_journal_chain_ok`); structured logs with trace id; migrations as init container; graceful drain.

**GitOps**: `deploy/k8s/` holds the manifests; a change to the live cluster is a PR to `noit2/sandbox-platform` `cluster/manifests/` (numbered file for EM2), merged, then the owner syncs Argo CD (`argocd` skill). Never `kubectl apply`. Image tags pinned by digest. Replay corpus runs and load tests go through Argo `batch-run` (`argo-workflows` skill).

**RevOps**: a principal kind `campaign` for marketing or outreach senders. Their messages pass through the same verdicts; the dossier's `burst`, `sender_concentration` and `bridging_vector` signals and the `shape` rate limit make intrusiveness measurable and bounded. `GET /v1/campaigns/{id}/report` returns reach, pass/shape/defer/deny counts, pressure pushed against receivers' thresholds, and transitions caused. EM2 becomes an honest-marketing gate rather than a blocker.

---

# Part C: Seed alignment

## C1. Milestones (seed M1..M7 mapped to EM2)

| Milestone | Seed name | EM2 scope | Gate evidence |
|---|---|---|---|
| **M0** | (seed alignment) | Layout, `AGENTS.md`, agents, skills, docs, scripts, manifest, both CI files, AGPL license, `CLAUDE.md`, ADR-001..010, legacy cleanup | `python3 scripts/validate_project.py` pass; `scripts/self_update.py` reports no missing; both CI pipelines green on a skeleton |
| **M1** | kernel/runtime shell | `core/` contract, `kernel/`, `pkg/schema`, identity module, `em2 serve/migrate/openapi`, modes scaffold, docker-compose, k8s manifests, health/metrics | Kernel unit + contract tests (route match, validation problem+json, cycle rejection, cross-schema failure, outbox at-least-once, lifecycle transitions); auth HTTP tests; OpenAPI validates; smoke: boot, register, login, key issue |
| **M2** | data engine | `ingest` module, `pkg/markdown`, normalizers for all three adapters (adapters mounted but verdict = pass), media, dossier builder v1, replay reader | Normalizer contract tests per protocol (fixtures → canonical Message); markdown golden + XSS corpus; dossier signal tests from fixtures; replay reader round-trips the corpus |
| **M3** | execution engine | `pkg/ecbridge`, `ecbridge` plugin, `verdict` module (decision table, lifecycle, forwarding, deferred queue, subscriptions/feed), ingress forwarding, egress fetch with SSRF guard | Golden tables; property tests; pressure scenarios; decision-table tests; lifecycle state machine tests; ingress end-to-end against a fake upstream (pass/shape/defer/deny); SSRF corpus; feed explain strings |
| **M4** | portfolio and reconciliation | `ledger` module: bridges, history, settings, quotas, reputation, blocks, endpoints, snapshots, reconciliation job | Snapshot contract test; reconciliation detects and repairs injected drift; quota 429s; reputation changes on deny |
| **M5** | runtime parity | `enforce`/`shadow`/`replay` modes, `em2 replay` diff tool, JS mirror of ecbridge + markdown, parity suite | Shadow delivers pass with shadow header; replay of corpus reproduces recorded verdicts bit-for-bit; JS mirror equals golden; SQL `feed.compat` equals Go |
| **M6** | journal and audit | `journal` module (hash chain, checkpoints, projections, stream, exports), telemetry ingestion, `observatory` module, wellbeing plugin, `web/` observatory PWA, `agent/` skill + discovery docs | Chain verify passes and detects tampering; projections match journal; wellbeing fixtures drive states; `node --test web/test`; no third-party code in `web/`; CSP; e2e smoke: agent registers endpoint → another agent sends via ingress → human sees verdict and trail live |
| **M7** | QA and contract hardening | `test/{contract,smoke,regression,integration,security}` complete, `security-review`, load script, runbook, release gate, campaign report | All required checks per `.project-manifest.json`; security suite green; p95 feed and ingress latency budgets at 100k messages; milestone summary `docs/milestones/M7.md` |

A milestone unlocks the next only when its checklist in `docs/milestone-checklist.md` is complete and `docs/milestones/M<n>.md` records the evidence.

## C2. Agent roles (`.claude/agents/`, seed roles kept, ownership mapped)

| Role | Owns in EM2 |
|---|---|
| orchestrator | routes a task to the owner below, checks milestone and labels, refuses to skip gates |
| validator | runs `em2 validate` + `scripts/validate_project.py`, checks evidence before `phase:done` |
| core-architect | `core/`, ADRs, `AGENTS.md`, cross-module review |
| kernel-engineer | `kernel/`, lifecycle, modes, `cmd/em2` |
| data-engineer | `internal/modules/ingest`, normalizers, dossier, `pkg/markdown`, replay reader |
| execution-engineer | `internal/modules/verdict`, decision table, lifecycle, forwarding, deferred queue |
| portfolio-reconciler | `internal/modules/ledger`, reconciliation, snapshots, quotas, reputation |
| journal-auditor | `internal/modules/journal`, chain, checkpoints, projections, exports |
| adapter-specialist | `internal/adapters/{bus,mcp,ingress,egress}`, storage adapters |
| plugin-specialist | `internal/plugins/*`, `pkg/ecbridge`, rulesets, wellbeing heuristics |
| observatory-engineer (added) | `web/`, telemetry SDK, JS mirrors |
| qa-regression | `test/`, corpus, golden tables, parity suite |
| infra-release | `deploy/`, both CI files, GitOps PRs, release gate, runbook |
| docs-maintainer | `docs/`, `agent/`, `CLAUDE.md`, milestone summaries |

`scripts/orchestrator.py` `AGENT_MAP` gets `frontend: observatory-engineer`, `adapters: adapter-specialist`, `plugins: plugin-specialist` mapped to the EM2 directories above.

## C3. Labels and required checks (seed taxonomy, adapted)

`project:` core | kernel | registry | data | execution | portfolio | journal | adapters | plugins | infra | frontend | docs. `milestone:M0..M7`. `priority:p0..p2`. `type:` bug | feature | refactor | security | docs | ci | qa | regression | smoke | contract. `phase:` discovery → design → implementation → verification → review → done.

Required checks (`.project-manifest.json`): task = unit + contract; subsystem = unit + smoke + regression; milestone = milestone-gate + integration; release = smoke + health. `em2 validate` maps to these: `go test ./... -run Unit`, `go test ./test/contract/...`, `go test ./test/smoke/...`, `go test ./test/regression/...`, `go test ./test/integration/...` (needs Postgres), `node --test web/test`.

## C4. CI, in parallel

`.forgejo/workflows/ci.yml` (`runs-on: docker`, `container: golang:1.23`, installs `nodejs` first because checkout runs as node) and `.github/workflows/ci.yml` (`ubuntu-latest`) run the same job list: `go vet`, `go test ./...` with a Postgres service, `node --test web/test`, license check (`web/` has no third-party code; `go.mod` has only the two allowed deps), OpenAPI and golden snapshot diff, container build. Release job builds the image by digest and opens nothing automatically: the deploy is a PR to the cluster repo per the `argocd` skill. Long runs (replay corpus, load) are Argo `batch-run` jobs described in `docs/RUNBOOK.md`.

## C5. Contract and deliverable expectation per task
Every task (issue) follows `docs/issue-template.md`: scope, subsystem, milestone, acceptance criteria, QA/validation, related files, risk. The PR body repeats scope, subsystem, milestone, verification plan and evidence summary (seed "Deliverable expectation").

---

# Verification of the blueprint

1. `python3 scripts/validate_project.py` and `python3 scripts/self_update.py` report pass with no missing files; `.project-manifest.json` lists the EM2 modules and milestones.
2. `go build ./... && go test ./...` and `node --test web/test` pass in both CI systems.
3. `GET /v1/admin/modules` lists modules, adapters and plugins with `DependsOn`; a test module attempting a cross-schema query fails.
4. The OpenAPI document has no endpoint that sets a message's emotion or color directly.
5. Golden parity: `POST /v1/bridge/preview`, SQL `feed.compat`, and the browser mirror agree on all 4,096 inputs.
6. Ingress scenario against a fake upstream: four messages produce pass, shape, defer and deny with correct headers and journal entries; the deferred one is released after the receiver changes bridge.
7. Egress: a fetch of a loopback or RFC1918 URL is refused; a fetch of an EM2-aware upstream yields a dossier and a journal entry.
8. `em2 replay` over `test/corpus` reproduces recorded verdicts; changing a tunable produces a readable diff.
9. `GET /v1/journal/verify` passes and fails after a tampered row in a test database.
10. A human opens the observatory, sees the live journal stream, a message's transition trail and its dossier, sets a bridge and watches the feed change. `web/` contains no third-party code.
11. A campaign principal's report shows reach, verdict counts and pressure pushed.
12. `go.mod` has exactly two direct requirements, `github.com/jackc/pgx/v5` and `golang.org/x/crypto` (their own small dependencies appear as indirect).
13. Information hygiene: a sender's responses for pass, shape and defer are byte-identical apart from the message id, and their timing is within the padding budget; a deny carries no reason. A grep of every public response schema finds no `score`, `threshold`, `bridge` or `reason` field addressed to a sender.
14. Probe scenario: one sender sends 20 variants to one receiver; by the fifth near-threshold variant the verdict is deny, the sender's quota is reduced, and the dossier shows `probe`.
15. A claim of `joy/yellow` on a message from a sender whose stance is `angry/red` is scored as `angry/red`; the claim appears in the dossier as `claim_drift` and nowhere in the verdict.
16. An upstream that returns a stack trace through ingress yields a generic problem+json to the sender and the full body in the journal.

# Remaining owner decisions (defaults applied)

| # | Decision | Default |
|---|---|---|
| 1 | Hostname scheme for ingress: subdomain per handle vs path prefix | path prefix `/ingress/{handle}/` (no wildcard DNS needed) |
| 2 | HTTP forward proxy listener in v1 vs explicit fetch API only | both; CONNECT metadata-only |
| 3 | Optional external classifier plugin provider | off; interface only |
| 4 | agentFactor 0.5 vs 1.0 | 0.5 |
| 5 | r_shape 0.60, r_deny 0.90, defer TTL 24 h | as stated |
| 6 | Wellbeing consent default for humans | `minimal` |
| 7 | Campaign principals allowed on the native bus or ingress only | both |
| 8 | Add `observatory-engineer` to the seed's fixed registry | yes |
| 9 | Signed journal checkpoints by server key vs owner-held key | server key, rotation documented |
| 10 | First deployment target: docker-compose on a VM vs k3s via Argo CD | docker-compose first in shadow mode, k3s manifests ready |
| 11 | Egress content with no authenticated sender: `unknown` state delivered as `shape`, or withheld until a plugin assesses it | delivered as `shape`, never adds pressure |
| 12 | Public card shows a coarse bridge (emotion only, no color, no threshold) or nothing by default | emotion only, principal can hide it |
| 13 | Response timing padding budget on sender-facing paths | 150 ms |
