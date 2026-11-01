# תשתית: שרת פרטי, Supabase, Cloudflare

המסלול המומלץ: VM אחת, Docker Compose של Supabase, cloudflared. הפירוט,
החלופה של k3s, הסודות, הגיבויים והסיכונים: `docs/BUILD_PLAN.md` סעיף 6.

## סדר קצר

1. **Proxmox**: VM `hermes`, Ubuntu 24.04, 4 vCPU, 14GB, דיסק 160GB + דיסק נתונים 100GB.
2. **Supabase**: `git clone --depth 1 https://github.com/supabase/supabase && cd supabase/docker && cp .env.example .env`.
   למלא `POSTGRES_PASSWORD`, `JWT_SECRET` (`openssl rand -base64 64`), ו-`ANON_KEY`/`SERVICE_ROLE_KEY` שנוצרים מהסוד.
   `GOTRUE_MAILER_AUTOCONFIRM=true`. `docker compose up -d`.
3. **הסכמה**: `psql "postgresql://postgres:<pw>@localhost:5432/postgres" -v ON_ERROR_STOP=1 -f ../../supabase/schema.sql`,
   ואז `smoke.sql` (מתגלגל אחורה). לעדכן `app_settings.telegram_bot` לשם הבוט.
4. **Cloudflare Tunnel**: tunnel מנוהל, `cloudflared service install <token>`, שמות: `api.<domain>` → `http://localhost:8000`, `studio.<domain>` → `http://localhost:3000`. Access על studio.
5. **האתר**: `npm run build` עם `VITE_SUPABASE_URL=https://api.<domain>` ו-`VITE_SUPABASE_ANON_KEY`, פריסה כ-Workers static assets.
6. **Worker**: `cd worker && npx wrangler secret put` לכל אחד מ-`TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`. `npx wrangler deploy`. לעדכן את `routes` ב-`wrangler.jsonc` לדומיין האמיתי.
7. **טלגרם**: `setWebhook` עם `url=https://hermes.<domain>/telegram`, `secret_token`, `allowed_updates=["message"]`.
8. **גיבוי**: vzdump לילי, `pg_dump -Fc` לילי, rclone ל-R2 שבועי. בדיקת שחזור לפני ההשקה.
