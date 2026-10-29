# Legacy EM2

EM2 has been built twice before. Neither version is a base for the current code. Both are kept in git
history only, as reference.

## 1. The original Express/MongoDB app (2020–2021)

Location: commit `8102416`, directories `OLD/API/` and `OLD/CLIENT/`. Read files without checking out:

```bash
git show 8102416:OLD/API/app.js
git show 8102416:OLD/API/conttrollers/post.js
git ls-tree -r --name-only 8102416 OLD/API/services/ECBrigeComment | head
```

What it did:

- `GET /posts` returned every post and was the whole feed. The browser filtered it with
  `post.color === userColor || post.emotion === userEmotion`.
- `PUT /post/:postId` applied the ECBridge transition. Anyone could call it with any values, any number
  of times. Comment and brace did not run ECBridge on the server; the client sent this second request.
  On brace the client sent the post's own initial emotion, so the bracer's bridge played no part.
- The ECBridge rules were 4,096 + 64 hand-written `if` statements in 128 files. Underneath was a
  Plutchik-wheel pattern (joy/yellow, trust/lime, feared/green, surprised/aqua, sad/blue,
  disgust/pink, angry/red, anticipated/orange) plus about 270 copy-paste errors such as `'Disgsut'`
  and `'sad'`, which froze any post that received them.
- There was no score, no threshold and no history. Passwords used SHA1-HMAC; JWTs never expired; there
  were no ownership checks on user update, user delete or comment delete.

What carried forward: only the eight emotions, the eight colors and the wheel order. ECBridge v2
(`docs/BLUEPRINT.md`, section B7) is a fresh design with a score, a threshold and accumulated pressure.

## 2. The React/Supabase rebuild (2025)

Location: commit `805d510`, the last commit that contains it (`src/`, `supabase/`, `Docs/`,
`em2-agent-skill/`, `.agent/`, `public/` and the root `package.json`, Vite, ESLint and Capacitor files).
The owner approved its removal, which closed M0. Read it without checking out:

```bash
git show 805d510:src/services/ecbridge/ECBridgeEngine.js
git ls-tree -r --name-only 805d510 Docs
```

`scripts/validate_project.py` fails if any of these paths comes back.

State: the UI shell existed, but six of seven data hooks only logged to the console, the services
targeted tables and RPCs that no migration created, agent API keys were stored in plain text, and the
22 documents in `Docs/` contradicted each other about completion.

What carried forward:

- `src/styles/variables.css` → `web/src/tokens.css` (emotion colors and spacing tokens)
- `Docs/ECBRIDGE_CIRCULAR_UI.md` and `Docs/UI_REFERENCE.md` → `docs/ui/` (wheel and card-stack design)
- the ideas of the SVG wheel picker (`src/components/ECBridge/CircularEmotionPicker.jsx`) and the swipe
  card (`src/components/Post/PostCard.jsx`), to be rewritten as custom elements in M6
