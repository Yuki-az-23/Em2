# מצב הפרויקט: מה קיים, מה בדוק, מה חסר

עדכון אחרון: אחרי הבנייה מאפס לפי `Docs/BUILD_PLAN.md`. כל מה שלא דורש את השרת
הפרטי, חשבון Cloudflare או טוקן של בוט נבנה ונבדק. השאר ממתין לבעלים.

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

- `supabase/schema.sql` מוחל פעמיים על Postgres 16 ריק, ו-`smoke.sql` עובר 11 בלוקים. CI עושה את זה בכל דחיפה.
- `npx vitest run` בשורש: 188 בדיקות (ליבה, שירותים, רכיבים, דפים).
- `npm --workspace worker test`: 18 בדיקות עם Supabase, טלגרם ו-AI מדומים דרך `fetch` מוזרק.
- `npx vite build` עובר. ה-PWA נרשם רק בייצור.

## 3. מה ממתין לבעלים

| מה | למה אי אפשר מכאן | איפה כתוב |
|---|---|---|
| VM, Supabase, Tunnel, דומיין | דורש את המכונה והחשבון | `infra/README.md`, `BUILD_PLAN.md` סעיף 6 |
| טוקן בוט, סוד webhook, סודות Worker | דורש BotFather ו-wrangler עם חשבון | `infra/README.md` שלבים 6–7 |
| הערכת עברית של `gpt-oss-120b` על 30 הודעות | דורש Workers AI אמיתי | `BUILD_PLAN.md` 6.3 |
| כיול ציור וסגנונות | דורש Workers AI אמיתי | שלב 10 |
| שיחה אמיתית בין שני טלפונים | אחרי כל מה שלמעלה | שלב 7 |

## 4. סיכונים פתוחים

1. **פרטיות נשענת על ההשחרה.** המודל חייב להחזיר JSON מאושר, אחרת הכרטיס לא יוצא. אבל השחרה שאישרה ופספסה שם לא נתפסת, אלא אם השם מופיע בפרפרזה (אז `findLeak` תופס). לכן ההערכה בעברית לפני השקה אינה אופציונלית.
2. **"בלי פנים" נאכף בפרומפט בלבד.** אין מסנן פנים בצד השרת.
3. **דיסק אחד.** הגיבוי ל-R2 חובה לפני שיחה ראשונה.
