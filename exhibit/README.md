# Hermes and the wall: the art exhibit

A digital art piece about profiling. Two people talk privately through a
Telegram bot ("Hermes"). The provider holds the key. When they end the chat,
the provider's algorithm decides an emotion and a color for it and puts a card
on a public wall: two pseudonyms, the state it decided, and a machine-voice
summary. Never their names, never their words. Strangers on the wall can push
the card toward their own state or embrace what it was.

This folder is its own application, separate from the Go proxy at the
repository root (see `docs/adr/ADR-016-exhibit-as-separate-app.md`).

## Try it locally

Needs Node 22, PostgreSQL 15+ binaries (`initdb`, `pg_ctl`, `psql`) and internet once
for the PostgREST download. No Docker, no Cloudflare account, no Telegram.

```bash
cd exhibit
npm install
npm run demo
```

Then open:

| Page | What happens there |
|---|---|
| http://127.0.0.1:5173/ | The door: the question, a name, a role. A participant gets a code. |
| http://127.0.0.1:5173/lab | The simulator: two people in Telegram, without Telegram. "Open in the simulator" from the door starts person A; A's `/invite` link opens person B. |
| http://127.0.0.1:5173/wall | The wall: declare a state, see the cards near it, move or embrace them. |

`npm run demo` runs as a normal user. As root, or to use your own database, set
`DEMO_DATABASE_URL=postgres://user:pass@host:5432/db`. `npm run demo -- --fresh`
wipes the local cluster in `.demo/pg`.

With Docker instead: `docker compose -f exhibit/demo/docker-compose.yml up`.

### Prove it works

```bash
npm run demo:check   # starts the backend, runs the scenario, exits with its result
npm run test:e2e     # starts the whole demo and drives the door, simulator and wall in Chromium
```

The scenario checks, against the real database and worker:

1. The door gives a code and renames the visitor.
2. Nothing is relayed before consent and before each person tells the bot the emotion and color they bring; pairing goes through a one-person link.
3. Messages are relayed under pseudonyms.
4. On `/end` a card appears at the midpoint of the two declared states, with no typed name, message line, place, third person or email.
5. One trigger holds the card's state, three move it one step, and a brace counts.
6. `/withdraw` takes it off the wall.
7. A fourth invitation from one address within ten minutes has to wait.

## What the light demo leaves out

| Left out | Why | Where it lives for real |
|---|---|---|
| Real Telegram | The hub fakes the Bot API | `worker/src/telegram.js`, webhook set per `infra/README.md` |
| The real model | `AI_MODE=fake` redacts simple names and summarizes from templates; every card it makes says `model: demo-fake` | Workers AI, `worker/src/ai.js` |
| Pictures | The fake model draws nothing | Workers AI image model, R2 |
| Accounts, settings, agents | No sign-in service | Full Supabase (`supabase start` or self-hosted) |
| Realtime | No realtime server; the wall polls every 5 seconds | Supabase Realtime |

The door allows three invitations per address per ten minutes, in the demo too.

## Layout

| Path | What |
|---|---|
| `src/` | The site: React 19, Vite, PWA, RTL Hebrew, dark by default |
| `packages/core/` | `@hermes/core`: the wheel, the fail-closed wall card, pseudonyms, assignment, feed score, Telegram helpers. Pure, no I/O |
| `worker/` | Hermes on Cloudflare Workers: Telegram webhook, relay, consent, the pipeline |
| `supabase/` | `schema.sql` (one file, no migrations), `smoke.sql`, `seed.sql` for the demo |
| `demo/` | The local stack: launcher, hub, PostgREST launcher, scenario, compose file |
| `e2e/` | The browser test |
| `docs/` | The formal model, operations, build plan and status (Hebrew) |
| `infra/` | Deployment order for the private server and Cloudflare |

## Tests

```bash
npx eslint .
npx vitest run                 # site and core
npm --workspace worker test    # worker, with fake Supabase, Telegram and AI
supabase/test-local.sh         # schema twice + smoke.sql on a throwaway Postgres
```
