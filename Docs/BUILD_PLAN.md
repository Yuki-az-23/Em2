# תוכנית בנייה מאפס: הרמס והקיר

## הקשר

המצב היום (ראה `Docs/STATUS.md`): הקצוות קיימים, דלת ב-`pages/Invite` וליבה בדוקה ב-`src/core/`, והאמצע חסר: אין ערוץ פרטי, אין השחרה, אין פרסום, אין דף קיר, ואין שום קוד בצד שרת. בנוסף הקוד הישן שבור בשני מקומות: הדפים מייבאים hooks שהם stubs, והלקוח קורא לארבע פונקציות SQL שלא קיימות. שתי מיגרציות עם המספר 005, סכמה מלאה מאחור, וסקריפט מיגרציה שמסתמך על `exec_sql` שלא קיים.

ההחלטה: לא לתקן בשכבות. לבנות מאפס על סכמה אחת, בשרת הפרטי, מאחורי Cloudflare, לפי ההכרעות שלך:

- **מסד**: Supabase מותקן עצמאית, בקוברנטיס בתוך Proxmox, על 6 ליבות, 24GB, 512GB NVMe. סכמה אחת, לא מיגרציות.
- **ערוץ ראשון**: טלגרם. האתר מייצר קישור טלגרם למי שבוחר להיות חלק מהמיצג. MCP אחר כך, כאפשרות נגישות לבני אדם שרוצים מסנן על המילים שלהם, וכדלת לסוכנים שזוכרים ומגיבים.
- **הרמס כולו ב-Cloudflare**: Worker אחד מקבל את טלגרם, מריץ את הצינור (השחרה, פרפרזה, ציור ב-Workers AI), מפרסם, ומגיש MCP.
- **הפיד הישן נשאר**: פוסטים, תגובות, חיבוקים ועוקבים הם הקיר. ההבדל היחיד: פוסט נוצר משיחה בין שני אנשים, לא מטופס.

התוצאה: מערכת אחת שאפשר להרים על מכונה אחת ודומיין אחד, עם צינור שרץ מקצה לקצה בלי אדם באמצע.

---

## ארכיטקטורה בשורה אחת לכל חלק

```
[טלגרם] ─webhook─▶ [Worker: hermes.<domain>] ─service role─▶ [Supabase על השרת הפרטי, דרך api.<domain>]
[Claude/ChatGPT/Gemini] ─MCP─▶ [אותו Worker]                        ▲
[דפדפן] ─▶ [Pages: <domain>, האתר] ─anon key + RLS─────────────────────┘
```

- **ליבה משותפת** `packages/core`: הטבעת, הכרטיס, הכינויים. קוד אחד לאתר ול-Worker.
- **Worker** `worker/`: Hono + wrangler. נתיבים: `/telegram`, `/mcp`, `/health`. תור פנימי לצינור.
- **אתר** בשורש הריפו כמו היום. React 19, Vite, PWA. RTL, מצב כהה, גופן עברי ברמת המערכת.
- **סכמה** `supabase/schema.sql`: קובץ אחד, מוחל פעם אחת על מסד ריק. הסקריפטים הישנים נמחקים.

---

## 1. סכמת מערכת המידע (`supabase/schema.sql`, קובץ אחד)

העיקרון: זהות אחת לכל ישות, בן אדם, סוכן או דמות, ולא `users.id → auth.users` כמו היום (זה מה ששובר את יצירת הסוכנים).

### טבלאות

| טבלה | תפקיד | שדות עיקריים | מי קורא / כותב |
|---|---|---|---|
| `profiles` | כל ישות | `id`, `auth_user_id` (ייחודי, אופציונלי), `kind` human/agent/persona, `handle` כינוי ייחודי שהמערכת נתנה, `display_name` פרטי, `role` participant/investor, `base_emotion/base_color` ($b$, פרטי), `felt_emotion/felt_color` ($a$, פרטי), `emotion/color` ($x$, ציבורי), `telegram_user_id` ייחודי, `consent_version`, `consent_at`, `style`, `avatar_seed` | כולם קוראים `handle, emotion, color` בלבד. הבעלים קורא הכל. רק הבעלים כותב `base_*`, דרך `set_home` |
| `invites` | הדלת | `code` 22, `created_by`, `for_display_name`, `role`, `answer`, `telegram_start`, `expires_at`, `claimed_by` | `create_invite` בלבד |
| `contacts` | היכרות הדדית | `a`, `b`, `status` pending/accepted/blocked, `requested_by` | `add_contact`, `respond_contact` |
| `exchanges` | שיחה פרטית | `id`, `channel` telegram/mcp, `participants uuid[]`, `status` open/closed/published/failed/withdrawn, `consent jsonb` צילום, `opened_at`, `closed_at`, `error_code` | Worker עם service role. משתתפים קוראים |
| `messages` | ההודעות עצמן | `exchange_id`, `from_profile`, `text`, `witness` self_wrote/agent_drafted/system, `created_at` | **פרטי**. RLS: משתתפים בלבד. הצינור קורא עם service role |
| `posts` | הקיר (נשאר) | כמו היום + `exchange_id` ייחודי, `pseudonyms text[]`, `body` = פרפרזה, `seed`, `image_url`, `initial_*`, `emotion/color`, `memory numeric[64]`, `provenance jsonb`, `reactions`, `braces`, `withdrawn_at` | ציבורי לקריאה. `publish_post` בלבד כותב |
| `comments` | טריגר (נשאר) | `post_id`, `actor`, `actor_emotion/color`, `text` אופציונלי, `before_*`, `after_*` | `react_to_post` בלבד |
| `braces` | חיבוק (נשאר) | `post_id`, `actor`, ייחודי לזוג | `react_to_post` בלבד |
| `follows` | עוקבים (נשאר) | `follower`, `followed` לפי `handle` | `toggle_follow` |
| `agent_keys` | מפתחות סוכן | `profile_id`, `key_hash` sha256, `prefix`, `last_used_at`, `revoked_at` | `create_agent`, `authenticate_agent` |
| `rate_limits` | 3 ואז 1, 2, 4 | כמו היום | פונקציות בלבד |
| `audit_log` | מזהים בלבד | `actor`, `action`, `target`, `at` | פונקציות בלבד. **אף פעם לא תוכן** |

### פונקציות (RPC)

| פונקציה | הרשאה | מה |
|---|---|---|
| `create_invite(name, role, answer)` | anon | רץ דרך `rate_limit_check('invite',3)`. מחזיר `code`, `handle`, `telegram_link` = `t.me/<bot>?start=<code>` |
| `claim_invite(code)` | authenticated / Worker | קושר הזמנה לפרופיל: מאתר לפי `auth_user_id` או `telegram_user_id` |
| `set_home(emotion, color)` | authenticated | הדרך היחידה לשנות `base_*`. רושם ל-`audit_log` |
| `add_contact(handle)`, `respond_contact(id, accept)` | authenticated | הדדי בלבד |
| `open_exchange(a, b, channel)`, `append_message(...)`, `close_exchange(id)` | service role | ה-Worker. `close` מסמן closed ומחזיר את החילופין לצינור |
| `publish_post(card jsonb)` | service role | מכניס פוסט עם זיכרון התחלתי. מסמן exchange=published |
| `react_to_post(post, kind, emotion, color, api_key?)` | anon, authenticated | טריגר או חיבוק, חשבון הטבעת ב-SQL כמו ב-008. סוכן עם מפתח, מבקר לפי IP מגובב. `rate_limit_check('react',30)` |
| `get_feed(emotion, color, limit, before)` | anon, authenticated | $\sigma_v$ עם $\varepsilon$ ו-$\pi$. מבקר נכנס עם הצהרה. זו הפונקציה שהלקוח קורא לה היום ולא קיימת |
| `withdraw_post(post)` | authenticated | רק משתתף ב-exchange של הפוסט. תוכן נמחק, שורה נשארת |
| `toggle_follow(handle)` | authenticated | |
| `create_agent(name, emotion, color)` | authenticated | פרופיל `kind=agent`, מפתח מוחזר פעם אחת, נשמר מגובב |
| `authenticate_agent(key)` | פנימי | השוואת sha256, לא טקסט גלוי |
| `client_key`, `rate_limit_check`, `ring_*`, `make_handle`, `make_code` | פנימי | כמו ב-007/008 |

### מה נמחק מהסכמה הישנה
`users` (מוחלף ב-`profiles`), `wall_cards`/`wall_reactions` (מתמזגים ל-`posts`/`comments`/`braces`), `full_schema.sql`, `fix_agent.sql`, `run-migration.js`, כל `migrations/*`. Storage: דלי אחד `post-images` ציבורי לקריאה, כתיבה service role בלבד.

### Realtime
`ALTER PUBLICATION supabase_realtime ADD TABLE posts, comments, braces` כדי שהקיר יזוז מול הקהל בלי רענון.

---

## 2. הליבה המשותפת (`packages/core`)

להעביר כמו שהוא: `src/core/ring.js`, `wallCard.js`, `pseudonym.js` והבדיקות (27). להוסיף:

- `feedScore.js`: $\sigma_v$ ב-JS לתצוגה מקדימה, מראה של `get_feed`.
- `exchangeToAssigned.js`: מהודעות למצב מוקצה. הכלל הראשון פשוט ומוצהר: מצב הפוסט = צעד אחד של $x$ של כל משתתף לכיוון השני, ממוצע על הטבעת. זה **מה שהמגביר עושה**, והוא צריך להיות גס במתכוון.
- `telegram.js`: פענוח עדכונים, בניית deep link, הודעת ההסכמה.

npm workspaces בשורש: `"workspaces": ["packages/core", "worker"]`. האתר נשאר בשורש ומייבא `@hermes/core`.

---

## 3. ה-Worker (`worker/`, TypeScript, Hono, wrangler)

### נתיבים

| נתיב | מי קורא | מה |
|---|---|---|
| `POST /telegram` | טלגרם | מאמת `X-Telegram-Bot-Api-Secret-Token`. מנתב לפי סוג העדכון |
| `POST /mcp`, `GET /mcp` | Claude, ChatGPT, Gemini, סוכנים | Streamable HTTP. תשעת הכלים + `wall_react`, `wall_feed` לסוכנים. שלב 2 |
| `GET /health` | ניטור | גרסה, זמן, מצב החיבור ל-Supabase |

### זרימת טלגרם, הודעה אחר הודעה

1. `/start <code>`: `claim_invite` עם `telegram_user_id`. הבוט עונה בכינוי ("מעכשיו קוראים לך נמל-שקט") ובהסכמה המלאה. תשובה "מסכים" נרשמת עם גרסה. בלי זה, כלום לא ממשיך.
2. **זיווג**: מי שהזמין ומי שהצטרף הופכים לאנשי קשר. `open_exchange` נפתח ביניהם. הבוט הוא **ממסר**: מה ש-A כותב לבוט מגיע ל-B עם הכינוי של A, ולהפך. זה הערוץ הפרטי. כל הודעה נשמרת ב-`messages` עם `witness=self_wrote`.
3. `/end` או שתיקה של 24 שעות: `close_exchange`. הבוט אומר לשניים: "השיחה נסגרה. מה שהאלגוריתם שלנו חושב עליה יעלה על הקיר בדקות הקרובות. אפשר למשוך תוך 24 שעות עם /withdraw".
4. `/withdraw`: `withdraw_post` על הפוסט האחרון שלהם.
5. `/stop`: חוסם את המשלוח, שום דבר נוסף לא נשמר.
6. **הבוט לא שולח כלום מיוזמתו** חוץ מהממסר והאישורים האלה. אין תזכורות.

### הצינור (Queue consumer באותו Worker)

`close_exchange` ← ה-Worker מכניס הודעה לתור `pipeline` ← הצרכן:

1. קורא `messages` עם service role.
2. `assigned = exchangeToAssigned(messages, participants)` מהליבה.
3. `redact(text)` ב-Workers AI, עם הוראה מפורשת: שמות, מקומות, אנשים שלישיים, פרטי קשר. מחזיר `{text, removed[], confirmed:true}` רק אם המודל החזיר JSON תקין; אחרת `confirmed:false`.
4. `paraphrase(redacted)` ב-Workers AI, בקול המערכת, עברית, 2 עד 3 משפטים, בלי ציטוט.
5. `exchangeToWallCard(exchange, {redact, paraphrase})` מהליבה. **כשל סוגר**: כל קוד שגיאה → `exchanges.status=failed`, `error_code`, ניסיון חוזר אוטומטי פעמיים, ואז תור ידני.
6. `render(seed, style)` ב-Workers AI, מודל טקסט-לתמונה, עם הנחיה "no faces". כשל → פוסט בלי תמונה, ניסיון חוזר ברקע.
7. העלאת התמונה ל-Storage, `publish_post(card)`.

### סודות (wrangler secrets)
`SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `MCP_OAUTH_*` (שלב 2). בינדינגים: `AI`, `QUEUE`, `KV` לסשנים של MCP.

### MCP (שלב 2)
`createMcpHandler` (הדרך העדכנית ב-Cloudflare, לא `McpAgent` שמסומן כמיושן). OAuth מול Supabase Auth, שמגדיר את ה-`profile` לפי `auth_user_id`. כלים לבני אדם: `set_home`, `leave`, `waiting`, `open`, `recall`, `share`, `settings`. כלים לסוכנים עם מפתח: `wall_feed`, `wall_react`. לאדם שרוצה "מסנן על המילים", `leave` דרך MCP נכנס ל-`exchanges` עם `channel=mcp` ו-`witness=agent_drafted` כשהסוכן ניסח.

---

## 4. האתר (שורש הריפו)

### ניקוי
- למחוק `src/hooks/use{Post,User,Brace,Comments,Follow,ECBridge}.js` (stubs). `src/hooks/index.js` מייצא מ-`src/services/*`.
- לקוח Supabase אחד: `src/services/supabase/client.js`. מחיקת `src/config/supabase.js`.
- למחוק `services/post/postService.js` חלקים שקוראים ל-RPC שלא קיים (`search_posts`, `toggle_brace`) ולהחליף ב-`get_feed`, `react_to_post`, `toggle_follow` מהסכמה החדשה.
- למחוק `services/ecbridge/ecbridgeIntegration.js` (כותב רגש מהלקוח). המנוע הישן `ECBridgeEngine.js` **נשאר** כמוצג, ועמוד "המכונה" מציג אותו.
- למחוק `em2-agent-skill/scripts/em2.js` (מפתח קשיח בקוד). במקומו: README שמסביר MCP.

### דפים

| נתיב | דף | מה |
|---|---|---|
| `/` | הדלת (קיים) | תפקיד participant → אחרי התשובה: **קישור טלגרם** `t.me/<bot>?start=<code>` עם כפתור "פתח בטלגרם", וגם QR. תפקיד investor → "היכנס לקיר" |
| `/wall` | הקיר (חדש, מחליף Feed) | כניסה עם `CircularEmotionPicker` (מבקר מצהיר $b_v$, נשמר ב-localStorage). רשימת `PostCard` מ-`get_feed`. על כל כרטיס: כינויים, רגש, צבע, פרפרזה, תמונה, כפתור טריגר (בוחר רגש/צבע של המבקר) וכפתור חיבוק. Realtime על `posts` |
| `/post/:id` | פוסט (קיים, מותאם) | הכרטיס, שרשרת ה-`comments` כ"מי הזיז לאן", $d(s_n,s_0)$ כתג "השתנה" |
| `/machine` | המכונה (חדש) | המטריצה 8×8 כולה, כל פוסט כנקודה, ושלוש העובדות על המנוע הישן מתוך `ECBRIDGE_FORMAL_MODEL.md` סעיף 3. זה עמוד התערוכה על האלגוריתם |
| `/me` | הגדרות (חדש, מחליף Profile/EditProfile) | כינוי, בית (דרך `set_home` בלבד), סגנון ציור, מי רשאי להשאיר, החילופין שלי, **משיכה**, מחיקת חשבון |
| `/login`, `/signup` | קיימים | נשארים לבני אדם שרוצים MCP או הגדרות. משתתף טלגרם לא חייב חשבון |
| `/agents` | סוכנים (חדש, קטן) | יצירת סוכן, מפתח פעם אחת, הוראות חיבור MCP |

הדפים הישנים `CreatePost`, `Feed`, `Profile`, `EditProfile` נמחקים. פוסט לא נוצר מטופס.

### מערכת העיצוב
- `index.html`: `dir="rtl"`, גופן Heebo מ-Google Fonts, `color-scheme`.
- `styles/variables.css`: להוסיף אסימוני מצב כהה תחת `prefers-color-scheme` ו-`[data-theme]`, וברירת מחדל כהה לקיר.
- להחליף `margin-left/right` ו-`padding-left/right` ברכיבים ב-logical properties. 25 רכיבים, רובם לא נוגעים בכיוון.
- `components/README.md` מעודכן ל-25 רכיבים.

---

## 5. בדיקות ו-CI

- **ליבה**: הבדיקות הקיימות + `exchangeToAssigned` + `feedScore`.
- **סכמה**: GitHub Actions עם `postgres:16` כ-service: מחיל `schema.sql` על מסד ריק ומריץ `supabase/smoke.sql`: `create_invite`, `claim_invite`, `open/append/close_exchange`, `publish_post`, `react_to_post` פעמיים עם בדיקה שהמצב זז צעד אחד, `withdraw_post`, ובדיקה ש-`rate_limit_check` חוסם ב-4 ומשחרר. זה מה שחסר היום: SQL שלא רץ.
- **Worker**: vitest עם `@cloudflare/vitest-pool-workers`: webhook עם טוקן שגוי → 401; `/start code` → `claim_invite`; ממסר A→B; `/end` → הודעה בתור; צרכן עם AI מדומה → `publish_post`; AI שמחזיר JSON שבור → `failed`, בלי פרסום.
- **אתר**: הבדיקות הקיימות + Invite (קישור טלגרם מופיע ל-participant בלבד) + Wall (טריגר קורא ל-`react_to_post` עם המצב שהוצהר).
- **PWA**: בנייה + בדיקה ש-`sw.js` לא מכניס למטמון `api.<domain>`.

---

## 6. תשתית (אומת מול התיעוד הנוכחי)

**אמירה ישרה קודם:** קוברנטיס הוא עודף למכונה אחת. המסלול היחיד ש-Supabase תומכים בו רשמית לאירוח עצמי הוא Docker Compose. המסלול המומלץ שלי: **VM אחת של Ubuntu עם Docker Compose של Supabase ו-cloudflared**. המסלול של k3s מופיע כי ביקשת, עם ה-chart הקהילתי, וכל השאר זהה.

### 6.1 Proxmox והמכונה
- Proxmox עם ZFS על ה-NVMe. 2 ליבות ו-6GB נשארים למארח.
- VM `hermes`: Ubuntu 24.04, 4 vCPU, 14GB RAM, דיסק 160GB, qemu-guest-agent. דיסק וירטואלי שני של 100GB לנתונים: Postgres 40GB, Storage 50GB.
- **גיבוי בשלוש שכבות:** vzdump של ה-VM כל לילה, 7 עותקים. `pg_dump -Fc` כל לילה, 14 עותקים. rclone של הדאמפים ושל Storage ל-Cloudflare R2 פעם בשבוע. הדיסק יחיד, ולכן העותק מחוץ למכונה אינו אופציונלי.

### 6.2 Supabase עצמאי
- Compose: `supabase/supabase/docker` עם `setup.sh`, `run.sh`, `update.sh`. Postgres 17, שער Envoy (`api-gw`). אותם נתיבים `/rest/v1`, `/auth/v1`, `/storage/v1`, `/realtime/v1`, ולכן הסכמה וה-RLS לא משתנים.
- k3s, אם בכל זאת: `supabase-community/supabase-kubernetes`, chart `charts/supabase` 0.7.x, Postgres 17, עדיין עם Kong. ה-README שלהם אומר "אין תצורת ייצור מלאה". `environment.<component>` הוא מערך מגרסה 0.7.1, ודריסה של `environment.kong` מחליפה את כל הרשימה. לא להשתמש ב-operator שבאותו ריפו.
- רכיבים: db, שער, auth, rest, realtime, storage על דיסק, meta, studio. **לדלג**: analytics, vector, functions (הצינור ב-Workers), imgproxy, minio, supavisor.
- סודות: `JWT_SECRET` (`openssl rand -base64 64`), ומפתחות anon ו-service_role כ-JWT חתומים HS256 עם אותו סוד (`docker/utils/generate-keys.sh`). סיסמת Postgres, basic auth ל-Studio, `SECRET_KEY_BASE`, `VAULT_ENC_KEY`. SMTP: לא נחוץ בשלב טלגרם, `GOTRUE_MAILER_AUTOCONFIRM=true`.
- הסכמה: `psql -f supabase/schema.sql` פעם אחת אחרי העלייה הראשונה.

### 6.3 Cloudflare
- דומיין ב-DNS של Cloudflare. **Tunnel** מנוהל מהלוח, `cloudflared` כ-systemd ב-VM (או Deployment ב-k3s). שמות ציבוריים: `api.<domain>` → השער של Supabase, `studio.<domain>` → Studio. אפס פורטים פתוחים. WebSockets עוברים דרך Tunnel בכל התוכניות, ולכן Realtime עובד. זמן קריאה מקסימלי 100 שניות לבקשה.
- **Access** (חינם עד 50 משתמשים): אפליקציה אחת על `studio.<domain>`, מדיניות = המייל שלך עם PIN. `api.<domain>` ציבורי, RLS מגן.
- **האתר**: Workers static assets, שזו ההמלצה הנוכחית של Cloudflare לפרויקטים חדשים (Pages נתמך עדיין). מצב SPA. משתני בנייה: `VITE_SUPABASE_URL=https://api.<domain>`, `VITE_SUPABASE_ANON_KEY`. אותם שני ערכים יצביעו על Supabase מנוהל אם תעבור.
- **Worker הרמס** ב-`hermes.<domain>`, תוכנית Paid של 5 דולר (החינמית מוגבלת ל-10ms CPU ו-100 אלף בקשות ביום). הצינור רץ מתוך ה-webhook עם `ctx.waitUntil` אחרי תשובה 200 מיידית לטלגרם; Queues רק אם ניסיונות חוזרים יהפכו לבעיה. Cron Trigger אחד לניסיונות חוזרים ולצילום "הקיר נח".
- **MCP**: `createMcpHandler` מ-`agents/mcp/server` עם `McpServer`, Streamable HTTP, ללא Durable Objects. `McpAgent` מיושן ומוקפא מגרסה 0.20.0 של ה-SDK (27 ביולי 2026).
- **Workers AI**, 0.011 דולר לאלף נוירונים, 10 אלף חינם ביום:
  - טקסט, השחרה ופרפרזה: `@cf/openai/gpt-oss-120b` ראשי, כי יש לו `response_format: json_schema` וההשחרה חייבת JSON מחייב. חלופה זולה: `@cf/google/gemma-4-26b-a4b-it`. **כיסוי עברית של שניהם לא אומת בתיעוד הרשמי.** חובה: הערכה על 30 הודעות בעברית לפני שמתחייבים, ו-AI Gateway עם מודל חזק כגיבוי, החלטה שלך.
  - תמונה: `@cf/black-forest-labs/flux-2-klein-4b` או `flux-1-schnell`. תמונה של 1024 היא כ-105 נוירונים, הרחק מתחת למכסה החינמית. "בלי פנים" נאכף בפרומפט בלבד, צלליות, גב, מופשט. אין מסנן פנים בצד השרת.

### 6.4 טלגרם
- בוט דרך BotFather, מצב פרטיות דולק. `setWebhook` עם `url=https://hermes.<domain>/telegram`, `secret_token`, `allowed_updates=["message"]`. אימות `X-Telegram-Bot-Api-Secret-Token` בכל בקשה.
- קישור: `https://t.me/<bot>?start=<code>`, עד 64 תווים `A-Za-z0-9_-`. הקוד הוא אסימון חד-פעמי שפג.
- בוט לא יכול לכתוב למי שלא לחץ Start. שני המשתתפים כותבים לבוט בנפרד, והבוט מעביר. מגבלות: 4096 תווים להודעה, הודעה בשנייה לצ'אט. ממסר של שניים לא מתקרב לזה.

### 6.5 סודות
- Worker (`wrangler secret put`): `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`. בינדינגים: `AI`, `R2` לתמונות וצילומי הקיר.
- ה-VM: קובץ `.env` של Compose מחוץ ל-git, או SOPS + age.
- האתר: שני משתני `VITE_*` בלבד.

### 6.6 תפעול
- בדיקת שחזור פעם לפני ההשקה ואחת לרבעון: שחזור הדאמפ האחרון למסד זמני, האתר מולו, מחיקה.
- ניטור: בדיקת זמינות חיצונית על `<domain>` ועל `api.<domain>/rest/v1/`. CronJob שבודק דיסק ושולח לטלגרם שלך מעל 80 אחוז דרך אותו בוט. התראות ZFS מ-Proxmox.
- עדכונים: תגי גרסה נעולים, קפיצה רבעונית אחרי גיבוי. שני שברים צפויים ב-upstream: Postgres 15 ל-17 (לא רלוונטי אם מתחילים על 17) ו-Kong ל-Envoy.
- **הקיר נח**: ה-Cron ב-Worker מצלם את N הפוסטים האחרונים ל-R2 כל 10 דקות. האתר מנסה Supabase, ובכשל מציג את הצילום במצב "נח", בלי תגובות. Tunnel שנפל משתיק את התגובות, לא את הקיר.

### 6.7 זמן וסיכונים
דומיין, חשבון, Paid, טוקן בוט: שעה. VM, Docker או k3s, cloudflared: 2 עד 3 שעות. Supabase, סודות, סכמה, אימות `api.<domain>` ו-Realtime: 4 עד 8 שעות, כאן רוב אי-הוודאות. האתר על static assets: שעה עד שעתיים. Worker עם ממסר וצינור: יום עד יומיים, ועוד שעתיים להערכת עברית ו-2 עד 4 שעות לכיול הציור. גיבויים, שחזור, ניטור: 3 שעות. MCP: יום, אחרי ההשקה.

שלושת הסיכונים: (1) איכות העברית של מודלי Workers AI להשחרה, לא אומתה, וכל הבטחת הפרטיות נשענת עליה. (2) בשלות ה-chart הקהילתי אם בוחרים k3s. (3) דיסק אחד ו-VM אחת: אובדן דיסק לוקח הכל, ולכן R2 חובה.

מה שלא אומת: רשימות שפות של gemma-4 ו-gpt-oss; גבולות הגודל המדויקים של flux-2-klein; האם Queues דורש Paid (הנחה: כן).

---

## 7. סדר העבודה

| # | שלב | תלוי ב | זמן |
|---|---|---|---|
| 1 | `supabase/schema.sql` + `smoke.sql` + CI על Postgres | | 2 ימים |
| 2 | `packages/core` + `exchangeToAssigned` + workspaces | | חצי יום |
| 3 | ניקוי האתר: hooks, לקוח אחד, מחיקות, RTL/כהה/גופן | | יום |
| 4 | דף הקיר + `react_to_post` + Realtime. **כאן יש משהו לראות** | 1, 3 | 2 ימים |
| 5 | תשתית: Proxmox → VM → k3s → Supabase → Tunnel → Pages → דומיין. הסכמה מוחלת | 1 | 2 עד 4 ימים, לפי הדוח |
| 6 | Worker: טלגרם, ממסר, הסכמה, `close`, צינור עם Workers AI, `publish_post` | 2, 5 | 3 ימים |
| 7 | הדלת מייצרת קישור טלגרם. **מקצה לקצה עם שני אנשים אמיתיים** | 4, 6 | חצי יום |
| 8 | `/machine`, `/me` עם משיכה, `/agents` | 4 | 2 ימים |
| 9 | MCP ב-Worker + OAuth | 6 | 3 ימים |
| 10 | ציור ב-Workers AI, סגנונות | 6 | יום |

שלבים 1 עד 4 ו-8 לא תלויים בשרת שלך ואפשר לעשות אותם מכאן. 5 דורש גישה למכונה, 6 ו-7 דורשים חשבון Cloudflare ובוט טלגרם.

---

## 8. אימות מקצה לקצה

1. `psql -f supabase/schema.sql` על Postgres ריק, ואז `psql -f supabase/smoke.sql` עובר נקי.
2. `npm test` בשורש: ליבה, אתר, Worker, הכל ירוק.
3. מקומית: `supabase start` (CLI) עם `schema.sql`, `npm run dev`, הדלת מייצרת קישור, `/wall` ריק מציג "הקיר נח".
4. `wrangler dev` עם עדכוני טלגרם מדומים ב-curl: `/start`, שתי הודעות, `/end` → פוסט מופיע ב-`/wall` תוך דקה, עם כינויים, פרפרזה, בלי שמות.
5. טריגר מהדפדפן: הפוסט זז צעד אחד. חיבוק: המונה עולה. `comments` רושם before/after.
6. `/withdraw` בטלגרם: הפוסט נעלם מ-`/wall`, השורה נשארת בלי תוכן.
7. בייצור: שני טלפונים אמיתיים, שיחה אחת, קיר אחד.
