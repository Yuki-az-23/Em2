# תשתית: שרת פרטי, Supabase, Cloudflare

**פריסת הבדיקה מתועדת צעד אחר צעד ב-[`deploy/README.md`](../deploy/README.md)**, עם
סקריפטים שעושים את רוב העבודה (`deploy/bootstrap-vm.sh` על ה-VM, `deploy/cloudflare-test.sh`
מהמחשב שלך). הדף הזה הוא הסיכום הקצר של המסלול. הרקע, החלופה של k3s והסיכונים:
`docs/BUILD_PLAN.md` סעיף 6.

`<domain>` למטה הוא הדומיין שלך. בפריסת הבדיקה כל שם מקבל סיומת `-test`
(`api-test.<domain>` וכן הלאה).

## סדר קצר

1. **Proxmox**: VM אחת, Ubuntu 24.04 cloud image, משתמש cloud-init `ubuntu` עם מפתח SSH.
   לבדיקה: 4 vCPU, 8GB, 80GB, על אחסון שתומך ב-snapshots. חומת אש: נכנס רק SSH, יוצא פתוח.
   snapshot לפני ההתקנה. מתחברים `ssh ubuntu@<vm>` ומריצים עם `sudo`; SSH של root כבוי
   ב-cloud images.
2. **Supabase** בתג נעול `self-hosted/v0.8.4` (`docker/` מתוך `supabase/supabase`).
   Postgres 17, PostgREST v14, שער Envoy (`api-gw`) על 8000. סודות מ-`utils/generate-keys.sh --update-env`,
   בלי להדפיס אותם. בלי SMTP: `ENABLE_EMAIL_AUTOCONFIRM=true` ב-`.env`. השער נקשר ל-loopback
   בלבד (`API_GW_HTTP_PORT=127.0.0.1:8000`). `functions` ו-`supavisor` כבויים; analytics כבוי
   כבר בברירת המחדל. `bootstrap-vm.sh` עושה את כל זה.
3. **הסכמה**, מתוך תיקיית ה-compose:
   `docker compose exec -T db psql -U postgres -d postgres -v ON_ERROR_STOP=1 < schema.sql`,
   ואז `smoke.sql` באותה דרך (מתגלגל אחורה), ולעדכן `app_settings.telegram_bot` לשם הבוט.
   Postgres לא חשוף על פורט של המארח, ולכן לא `psql` מבחוץ.
4. **Cloudflare, בסדר הזה**: הגדרות zone (Workers Paid, SSL Full, WebSockets דולק, Bot Fight
   Mode ו-Rocket Loader כבויים). אחר כך כלל WAF שמתיר ב-`api.<domain>` רק `/rest/v1/`, `/auth/v1/`,
   `/storage/v1/`, `/realtime/v1/`, וכלל מטמון שעוקף אותו. אחר כך אפליקציית Access (PIN במייל)
   על `studio.<domain>`. **רק אז** tunnel מנוהל (Networking > Tunnels) עם שני נתיבים:
   `api.<domain>` → `http://localhost:8000` ו-`studio.<domain>` → `http://localhost:8000`.
   Studio מוגש דרך השער על 8000, לא על 3000. cloudflared רץ על ה-VM ב-Docker עם הטוקן של ה-tunnel.
5. **האתר**: `npm run build` עם `VITE_SUPABASE_URL=https://api.<domain>` ו-`VITE_SUPABASE_ANON_KEY` בלבד,
   פריסה כ-Workers static assets (`wrangler.site.jsonc`).
6. **Worker**: `cd worker && npx --no-install wrangler deploy --env <env>`, ואז `wrangler secret put --env <env>`
   לכל אחד מ-`TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
   כשהערך נכנס ב-stdin. ה-routes וה-bindings מוגדרים לכל env ב-`wrangler.jsonc`; env לא יורש אותם.
7. **טלגרם**: `setWebhook` עם `url=https://hermes.<domain>/telegram`, `secret_token`, `allowed_updates=["message"]`.
8. **גיבוי**: `pg_dump -Fc` לילי עם סבב של 14 יום (`deploy/backup.sh` וטיימר systemd), ו-snapshot
   של Proxmox לפני כל שינוי. עותק מחוץ למכונה (R2) עוד לא קיים. בדיקת שחזור לפני ההשקה.
