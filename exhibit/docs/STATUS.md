# מצב הפרויקט: מה קיים, מה בדוק, מה חסר

עדכון אחרון: נוסף קיט לפריסת בדיקה על VM ב-Proxmox מאחורי Cloudflare (`deploy/`, ספר
ההפעלה ב-`deploy/README.md`). לפני כן המיצג עבר לתיקייה `exhibit/` ליד שרת ה-Go (ADR-016),
וקיבל דמו מקומי שרץ מקצה לקצה. כל מה שלא דורש את השרת הפרטי, חשבון Cloudflare או טוקן של
בוט נבנה ונבדק, גם מול מסד ו-Worker אמיתיים. הפריסה עצמה ממתינה לבעלים.

## 1. צינור ההזנה, מקצה לקצה

| # | שלב | קוד | בדיקה | מצב |
|---|---|---|---|---|
| 1 | הדלת: שם, תפקיד, תשובה, קישור | `create_invite`, `pages/Invite` | smoke 1, Invite.test | **קיים** |
| 2 | כניסה לטלגרם, `/start <code>` | `claim_invite`, `worker/src/telegram.js` | smoke 2, telegram.test | **קיים**, לא הורץ מול טלגרם אמיתי |
| 3 | הסכמה לפני הכל | `record_consent`, `consentText` | smoke 3, telegram.test | **קיים** |
| 4 | זיווג וממסר A→B | `open_exchange`, `append_message` | smoke 3, telegram.test | **קיים** |
| 5 | סגירה, צרור לצינור | `close_exchange` | smoke 3, telegram.test | **קיים** |
| 6 | מצב מוקצה | `@hermes/core/exchangeToAssigned` | core tests | **קיים** |
| 7 | השחרה ופרפרזה | `worker/src/ai.js`, Workers AI | pipeline.test עם AI מדומה | **קיים**, עברית של המודלים לא אומתה |
| 8 | כרטיס, כשל סוגר | `@hermes/core/wallCard` | 42 בדיקות ליבה, pipeline.test | **קיים** |
| 9 | פרסום | `publish_post` | smoke 4, pipeline.test | **קיים** |
| 10 | ציור | `ai.render`, R2, `set_post_image` | pipeline.test (כשל לא מבטל) | **קיים**, לא כויל |
| 11 | הקיר, טריגר, חיבוק, אינרציה | `get_feed`, `react_to_post`, `pages/Wall` | smoke 5–6, WallCard.test | **קיים** |
| 12 | משיכה, עצירה, מחיקה | `withdraw_post`, `stop_profile`, `delete_my_profile` | smoke 8, telegram.test | **קיים** |
| 13 | סוכנים עם מפתח | `create_agent`, `authenticate_agent`, `pages/Agents` | smoke 7 | **קיים** |
| 14 | MCP | `worker` `/mcp` | מחזיר 501 | **חסר**, שלב 9 בתוכנית |

## 2. מה בדוק ואיך

- `supabase/schema.sql` מוחל פעמיים על Postgres 16 ריק, ו-`smoke.sql` עובר 13 בלוקים. CI עושה את זה בכל דחיפה.
- `npx vitest run`: 210 בדיקות (ליבה, שירותים, רכיבים, דפים, הסימולטור).
- `npm --workspace worker test`: 28 בדיקות עם Supabase, טלגרם ו-AI מדומים, כולל המודל המדומה של הדמו.
- `npx vite build` עובר. ה-PWA נרשם רק בייצור.
- **`npm run demo:check`**: שני אנשים מדומים עוברים את כל המיצג מול Postgres, PostgREST וה-Worker האמיתי, בשבעה שלבים ו-38 בדיקות: דלת, הסכמה, שתי השאלות, זיווג, ממסר, כרטיס בלי שמות ומילים, אינרציה (אחד מחזיק, שלושה מזיזים צעד), משיכה, הגבלת קצב. עובר.
- **`npm run test:e2e`**: Chromium עובר דרך הדלת, הסימולטור והקיר, ומחבק את הכרטיס שנוצר. עובר.
- CI מריץ את שניהם בכל שינוי ב-`exhibit/`.

## 2א. קיט הפריסה (`deploy/`)

| קובץ | מה |
|---|---|
| `deploy/bootstrap-vm.sh` | סקריפט אחד ואידמפוטנטי ל-VM: Docker, Supabase בתג `self-hosted/v0.8.4` על loopback, סכמה ו-`smoke.sql` כשער, cloudflared, גיבוי לילי, ודוח PASS/FAIL בלי סודות עם סריקת דליפות |
| `deploy/healthcheck.sh` | בדיקות לקריאה בלבד על ה-VM: קונטיינרים, מאזינים, REST, Realtime, WAF, הרשאות anon, גיבוי |
| `deploy/cloudflare-test.sh` | מהמחשב של הבעלים: R2, ה-Worker עם `--env test` וסודותיו, האתר, webhook, בדיקות מבחוץ |
| `deploy/backup.sh` + `deploy/systemd/` | `pg_dump -Fc` ו-Storage כל לילה, סבב 14 יום |
| `deploy/config.example`, `deploy/supabase/`, `deploy/edge/` | ההגדרות וה-overrides. קבצי upstream לא נערכים |
| `wrangler.site.jsonc`, `env.test` ב-`worker/wrangler.jsonc` | האתר וה-Worker של הבדיקה, בלי `workers.dev` |

תיקונים שהתכנון חשף ונכנסו יחד עם הקיט: `search_path` נעול בכל פונקציה ב-`schema.sql`
(ב-Supabase `pgcrypto` יושב בסכמת `extensions`); `REVOKE` מפורש של כתיבה מ-anon ו-authenticated,
כי הרשאות ברירת המחדל של Supabase היו משאירות את `public_profiles` פתוח לכתיבה; בלוק ב-`smoke.sql`
שבודק את זה; `demo/supabase-defaults.sql` שמדמה את Supabase ב-CI; `max_tokens` ו-`steps` ב-`ai.js`;
וה-cron מעביר ל-`failed` שיחה שתקועה ב-`closed` יותר מ-15 דקות.

**לא הורץ מכאן**: הדומיין, ה-tunnel, Supabase האמיתי על Postgres 17, ו-Workers AI. ספר ההפעלה
מסמן כל הנחה שלא אומתה.

## 3. מה ממתין לבעלים

| מה | למה אי אפשר מכאן | איפה כתוב |
|---|---|---|
| לאשר את הדומיין (`solorpunk.com` כברירת מחדל, האיות לא אומת) והגדרות zone | דורש את חשבון Cloudflare | `deploy/README.md` שלבים 1–2 |
| WAF, Access, tunnel, בסדר הזה | דורש את חשבון Cloudflare | `deploy/README.md` שלב 3 |
| בוט בדיקה ב-BotFather | דורש טלגרם | `deploy/README.md` שלב 4 |
| VM, `bootstrap-vm.sh`, ולשלוח חזרה רק את הדוח | דורש את המכונה | `deploy/README.md` שלבים 5–7 |
| `cloudflare-test.sh`: R2, Worker, סודות, אתר, webhook | דורש wrangler עם חשבון וטוקן בוט | `deploy/README.md` שלב 8 |
| שיחה אמיתית בין שני טלפונים, ומדידה שהצינור מסיים בתוך 30 השניות של `waitUntil` | אחרי כל מה שלמעלה | `deploy/README.md` שלב 9 |
| בדיקת שחזור מגיבוי | דורש את ה-VM | `deploy/README.md` שלב 11 |
| הערכת עברית של `gpt-oss-120b` על 30 הודעות | דורש Workers AI אמיתי | `BUILD_PLAN.md` 6.3 |
| כיול ציור וסגנונות | דורש Workers AI אמיתי | שלב 10 |

עוד חסר אחרי הבדיקה: עותק גיבוי מחוץ למכונה (R2), מצב "הקיר נח", SMTP, סגירת ההרשמה
(`DISABLE_SIGNUP`), ומחיקת תמונות R2 כשמושכים פוסט.

## 3א. מה הדמו חשף

- **כל שיחה מטלגרם נחתה על שמחה צהוב.** נפתר: אחרי ההסכמה הבוט שואל כל אחד איזה רגש וצבע הוא מביא, והכרטיס הוא נקודת האמצע. הסדר של המשתתפים בצרור קבוע עכשיו (המזמין ראשון), אחרת אותן שתי תשובות היו יכולות לתת כרטיסים שונים.
- **המודל המדומה לא מזהה שמות עבריים של אנשים שלישיים** ("דנה" עבר). הכרטיס עדיין נקי כי הפרפרזה המדומה היא תבנית, אבל זה מזכיר למה ההערכה של המודל האמיתי בעברית לא אופציונלית.
- **כפתורים ראשיים היו בלתי נראים** בכל האתר, בגלל תשעה משתנים שלא הוגדרו. תוקן.
- **התחזות.** שבע פונקציות קיבלו מזהה פרופיל או טלגרם מהקורא וסמכו עליו, ומשתמש מחובר יכול היה להסכים, למשוך, להגדיר בית או ליצור סוכנים בשם אחר. תוקן: רק ה-Worker או חיבור ישיר למסד נוקבים בפרופיל. בלוק 12 ב-`smoke.sql` בודק כל אחת.

## 4. סיכונים פתוחים

1. **פרטיות נשענת על ההשחרה.** המודל חייב להחזיר JSON מאושר, אחרת הכרטיס לא יוצא. אבל השחרה שאישרה ופספסה שם לא נתפסת, אלא אם השם מופיע בפרפרזה (אז `findLeak` תופס). לכן ההערכה בעברית לפני השקה אינה אופציונלית.
2. **"בלי פנים" נאכף בפרומפט בלבד.** אין מסנן פנים בצד השרת.
3. **דיסק אחד.** הגיבוי הלילי קיים, אבל על אותו דיסק. עותק ל-R2 חובה לפני שיחה ראשונה אמיתית, ועוד לא קיים.
