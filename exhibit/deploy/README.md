# פריסת בדיקה: המיצג על ה-VM ב-Proxmox, מאחורי Cloudflare

ספר הפעלה לבעלים. הטקסט בעברית, הפקודות באנגלית. עובדים לפי הסדר: חלק מהשלבים
סוגרים חלון חשיפה לשלב שאחריהם.

הדומיין הוא פרמטר. בכל מקום כתוב `<DOMAIN>`; ברירת המחדל היא `solorpunk.com`, שאושר
כ-zone ב-Cloudflare. אם משתמשים בדומיין אחר, צריך לשנות אותו גם ב-`worker/wrangler.jsonc`
(בלוק `env.test`) וגם ב-`wrangler.site.jsonc`. `cloudflare-test.sh` מסרב לרוץ אם הם לא
תואמים, ומדפיס את פקודת ה-`sed` שמתקנת.

## מה עולה

| שם | מה מגיש | הגנה |
|---|---|---|
| `exhibit-test.<DOMAIN>` | האתר, Worker `hermes-site-test` עם static assets | ציבורי |
| `api-test.<DOMAIN>` | שער Supabase (Envoy), דרך tunnel `exhibit-test` אל `http://localhost:8000` | כלל WAF שמתיר רק `/rest/v1/`, `/auth/v1/`, `/storage/v1/`, `/realtime/v1/`; בלי מטמון |
| `studio-test.<DOMAIN>` | Supabase Studio, דרך אותו tunnel ואותו פורט | Cloudflare Access (PIN במייל) ועוד basic auth |
| `hermes-test.<DOMAIN>` | Worker `hermes-test`: `/telegram`, `/health`, cron כל 10 דקות | סוד webhook |
| `images-test.<DOMAIN>` | דלי R2 `hermes-images-test` לתמונות הכרטיסים | ציבורי, קריאה בלבד |

ל-VM אין פורט נכנס חוץ מ-SSH. השער (`127.0.0.1:8000`) והמטריקות של cloudflared
(`127.0.0.1:20241`) מאזינים רק על loopback. הכל נפרד מהקיט של em2: תיקייה
`/opt/exhibit-test`, פרויקטי compose `supabase` ו-`exhibit-edge`, tunnel וטוקן משלו, ואין
שמות `em2.*`.

## הקבצים

| קובץ | איפה רץ | מה |
|---|---|---|
| `deploy/config.example` | תבנית | ההגדרות ל-`/etc/exhibit-test/config` |
| `deploy/bootstrap-vm.sh` | ה-VM, `sudo` | הסקריפט היחיד שמקים הכל ומדפיס דוח PASS/FAIL בלי סודות |
| `deploy/healthcheck.sh` | ה-VM, `sudo` | בדיקות לקריאה בלבד, אפשר להריץ בכל רגע |
| `deploy/backup.sh` | ה-VM, טיימר לילי | `pg_dump -Fc` וקבצי Storage, עם סבב של 14 יום |
| `deploy/cloudflare-test.sh` | המחשב שלך | R2, ה-Worker וסודותיו, האתר, ה-webhook של טלגרם, ובדיקות מבחוץ |

---

## 1. לאשר את הדומיין ולרשום מה כבר קיים

1. לוודא ש-`<DOMAIN>` הוא zone **פעיל** באותו חשבון Cloudflare שיריץ את ה-Workers.
2. לרשום את רשומות ה-DNS ושמות המארחים הקיימים. ההגדרות בשלב 2 חלות על כל ה-zone,
   כולל כל שם `em2.*` עתידי, אז כדאי לדעת מה הן ישנו.

```bash
# From your machine. Shows the zone's name servers and any existing records you know of.
dig +short NS <DOMAIN>
dig +short <DOMAIN>
```

בלוח: `<DOMAIN>` > DNS > Records. אם כבר יש שם `api-test`, `studio-test`, `exhibit-test`,
`hermes-test` או `images-test`, לעצור ולבחור שמות אחרים לפני שממשיכים.

## 2. תוכנית והגדרות zone

- **Workers Paid** (5 דולר לחודש). התוכנית החינמית מוגבלת ב-CPU, והצינור לא ייכנס בה.
- SSL/TLS: **Full**.
- Network: **WebSockets On** (Realtime עובר דרכם).
- Security: **Bot Fight Mode Off**, אחרת בקשות של ה-Worker אל `api-test` עלולות לקבל אתגר.
- Speed: **Rocket Loader Off**.
- URL normalization: להשאיר בברירת המחדל (דולק). כלל ה-WAF בשלב 3 נשען עליה.

## 3. Cloudflare, בסדר הזה בדיוק

הסדר סוגר את חלון החשיפה: נתיב tunnel אף פעם לא קיים בלי ההגנה שלו.

### 3א. WAF וכלל מטמון ל-api-test (לפני ה-tunnel)

Security > WAF > Custom rules > Create rule. Action: **Block**. Expression (Edit expression):

```text
(http.host eq "api-test.<DOMAIN>" and not (
  starts_with(http.request.uri.path, "/rest/v1/") or
  starts_with(http.request.uri.path, "/auth/v1/") or
  starts_with(http.request.uri.path, "/storage/v1/") or
  starts_with(http.request.uri.path, "/realtime/v1/")))
```

Caching > Cache Rules > Create rule: Hostname equals `api-test.<DOMAIN>`, Cache eligibility:
**Bypass cache**.

Envoy של Supabase הוא שכבה שנייה: `/pg/` דורש את מפתח השירות, ו-`/mcp` ו-API של
tenants חסומים. אבל השכבה הראשונה היא ה-WAF.

### 3ב. אפליקציית Access ל-studio-test (לפני הנתיב שלה)

1. Zero Trust > Settings > Authentication: להפעיל **One-time PIN**.
2. Zero Trust > Access > Applications > Add an application > **Self-hosted**.
   Domain: `studio-test.<DOMAIN>`. Policy: Action **Allow**, Include > Emails = המייל שלך.

שמות התפריטים משתנים מדי פעם בלוח של Cloudflare. אם תפריט לא נמצא בדיוק בשם הזה, לחפש
את שם הפעולה.

### 3ג. ה-tunnel `exhibit-test` ושני הנתיבים שלו

Networking > Tunnels > Create a tunnel > Cloudflared. שם: `exhibit-test`. ממסך ההתקנה
להעתיק **רק** את הטוקן (הערך הארוך אחרי `--token`). לא להריץ את פקודת ההתקנה: ה-VM מריץ
את cloudflared בעצמו, ב-Docker.

Public hostnames (נקראים גם Routes):

| Hostname | Service |
|---|---|
| `api-test.<DOMAIN>` | `http://localhost:8000` |
| `studio-test.<DOMAIN>` | `http://localhost:8000` |

שניהם לאותו פורט: ב-`self-hosted/v0.8.4` Studio מוגש דרך שער Envoy על 8000, לא על 3000.
**לא** להוסיף נתיבים ל-`hermes-test`, `exhibit-test` או `images-test`. אלה Workers ו-R2,
ו-Cloudflare יוצר להם DNS בעצמו.

## 4. הבוט לבדיקה

ב-Telegram, אצל `@BotFather`: `/newbot`, שם, ושם משתמש שנגמר ב-`bot`. מצב הפרטיות
(`/setprivacy`) נשאר דולק.

- את **שם המשתמש** (בלי `@`) שמים ב-`BOT_USERNAME` בקובץ ההגדרות של ה-VM.
- את **הטוקן** לא שמים בשום קובץ ולא על ה-VM. `cloudflare-test.sh` מבקש אותו בקלט מוסתר.

## 5. ה-VM ב-Proxmox

המפרט: Ubuntu 24.04 cloud image, 4 vCPU, 8GB RAM, דיסק 80GB, על אחסון שתומך ב-snapshots
(LVM-thin, ZFS או qcow2). משתמש cloud-init `ubuntu` עם מפתח ה-SSH שלך. אם בוחרים שם אחר,
להחליף `ubuntu` בכל פקודת `ssh` למטה.

קודם, מהמחשב שלך, להעתיק את המפתח הציבורי למארח (ב-`qm set` הסימן `~` הוא התיקייה של root
על המארח, לא שלך):

```bash
scp ~/.ssh/id_ed25519.pub root@<proxmox>:/root/exhibit-test.pub
```

דוגמה על המארח. `<vmid>`, `<storage>` ו-`vmbr0` הם שלך. התחביר של `import-from` דורש
Proxmox VE 7.2 ומעלה; הדוגמה לא הורצה מכאן.

```bash
# On the Proxmox host
wget https://cloud-images.ubuntu.com/noble/current/noble-server-cloudimg-amd64.img
qm create <vmid> --name exhibit-test --cores 4 --memory 8192 --cpu host \
  --net0 virtio,bridge=vmbr0 --scsihw virtio-scsi-pci --serial0 socket --vga serial0
qm set <vmid> --scsi0 <storage>:0,import-from=$PWD/noble-server-cloudimg-amd64.img
qm set <vmid> --ide2 <storage>:cloudinit --boot order=scsi0
qm set <vmid> --ciuser ubuntu --sshkeys /root/exhibit-test.pub --ipconfig0 ip=dhcp
qm resize <vmid> scsi0 80G
qm start <vmid>
```

`<vm>` בהמשך הוא כתובת ה-IP של ה-VM. ב-cloud image של noble אין qemu-guest-agent, ולכן
`qm guest` לא יראה אותה. למצוא אותה ברשימת ה-DHCP leases של הנתב, או לקבוע כתובת קבועה
במקום `ip=dhcp`: `--ipconfig0 ip=<addr>/<cidr>,gw=<gw>`.

חומת האש של Proxmox: **נכנס** רק SSH מהרשת המקומית. **יוצא** נשאר ACCEPT. Docker, apt
ו-cloudflared צריכים יציאה. אם חייבים רשימת היתרים ליוצא, היא חייבת לכלול 53 ב-TCP וב-UDP,
123/udp, 80/tcp (מאגרי Ubuntu עובדים ב-http), 443/tcp, ו-7844 ב-TCP וב-UDP (ה-tunnel).

אחרי שה-SSH עובד, לצלם snapshot. זה מסלול החזרה הראשי:

```bash
ssh ubuntu@<vm> true            # cloud-init finished and your key works
qm snapshot <vmid> pre-bootstrap  # on the Proxmox host
```

אם לא בטוחים שהאחסון תומך ב-snapshots, לנסות `qm snapshot` על VM זמנית קודם.

## 6. קובץ ההגדרות על ה-VM

```bash
ssh ubuntu@<vm>
git clone https://github.com/Yuki-az-23/Em2 ~/Em2
git -C ~/Em2 checkout <EM2_REF>          # the commit on main that has the deployment kit
sudo install -d -m 700 /etc/exhibit-test
sudo install -m 600 ~/Em2/exhibit/deploy/config.example /etc/exhibit-test/config
sudoedit /etc/exhibit-test/config
```

אם המאגר פרטי וה-VM לא יכול לשכפל אותו, לשלוח את `exhibit/` מה-checkout שלך עם
`git archive`, ולהשאיר `EM2_REF` ריק:

```bash
# On your machine. Ships only committed files: no .env, handoff or other ignored files.
git -C ~/Em2 rev-parse HEAD     # note this SHA: the VM report will say "unknown"
git -C ~/Em2 archive HEAD exhibit | ssh ubuntu@<vm> 'mkdir -p Em2 && tar -x -C Em2'
```

רק קבצים שעברו commit נשלחים. שינוי מקומי (למשל `sed` על הדומיין בקבצי wrangler) צריך
commit לפני כן. ב-VM אין `.git`, ולכן הדוח יכתוב `unknown` במקום ה-SHA.

המפתחות, כמו שמוסבר ב-`config.example`:

| מפתח | ערך |
|---|---|
| `DOMAIN` | `<DOMAIN>` |
| `BOT_USERNAME` | שם המשתמש של בוט הבדיקה, בלי `@`. ריק בתבנית, וחובה למלא |
| `EM2_REF` | SHA של 40 תווים ב-main עם התיקונים. ריק = הסקריפט משתמש ב-checkout שממנו הוא רץ, והדוח יכתוב `WARN em2_ref` |
| `EM2_REPO` | ממנו מושכים את `EM2_REF` |
| `SEED_DEMO` | `0`. `1` מחיל את 12 כרטיסי הדמו פעם אחת |
| `SSH_ALLOW_CIDR` | חייב להכיל את הכתובת שממנה אתה מתחבר, אחרת הסקריפט עוצר לפני שהוא מפעיל את ufw. `192.168.1.0/24` בתבנית הוא רק דוגמה |
| `CF_TUNNEL_TOKEN` | הטוקן משלב 3ג. הסוד היחיד בקובץ. ריק = בלי cloudflared |

חובה לערוך לפחות `BOT_USERNAME`, `SSH_ALLOW_CIDR`, `CF_TUNNEL_TOKEN` ו-`EM2_REF`.
הקובץ נקרא כ-`KEY=VALUE`, לא כקוד shell, ומפתח לא מוכר הוא שגיאה.

## 7. להריץ את סקריפט ה-VM

```bash
ssh ubuntu@<vm>
sudo bash ~/Em2/exhibit/deploy/bootstrap-vm.sh
```

הסקריפט אידמפוטנטי: הרצה חוזרת שומרת את כל הסודות שכבר נוצרו. לפי הסדר הוא בודק את
המכונה והרשת, מתקין Docker מהמאגר של Docker, מפעיל ufw (ועוצר אם `ss` חסר או שאין מאזין
SSH על 22), מושך את Supabase בתג
`self-hosted/v0.8.4` (ובודק את ה-SHA), יוצר סודות בשקט, כותב את קובץ ההעברה, מוסיף את ה-override שלנו
(`functions` ו-`supavisor` כבויים, השער על `127.0.0.1:8000`), מעלה את המחסנית ומחכה
לבריאות, מחיל את `schema.sql` דרך `docker compose exec -T db psql`, מריץ את `smoke.sql`
כשער, מגדיר את `telegram_bot`, מפעיל cloudflared, מתקין את הגיבוי הלילי, מריץ את
`healthcheck.sh`. בסוף הוא סורק את היומן והדוח לחיפוש סודות.

### מה שולחים חזרה

**רק** את קובץ הדוח שהסקריפט מציין בשורה האחרונה:

```text
Send back ONLY: /var/log/exhibit-test/report-<ts>.txt
```

לא את יומן ההרצה (`/var/log/exhibit-test/run-*.log`). הוא לניפוי תקלות על ה-VM בלבד.
אם בסוף כתוב `RESULT: FAIL (secret leak, do not send logs)`, לא לשלוח כלום ולפנות.

קובץ ההעברה נכתב מוקדם, ולכן הוא קיים גם אחרי הרצה שנכשלה. להשתמש בו רק אחרי
`RESULT: PASS`.

אחרי `RESULT: PASS` ראשון, לצלם עוד snapshot: `qm snapshot <vmid> post-bootstrap-ok`.

## 8. להעתיק את קובץ ההעברה ולהריץ את סקריפט Cloudflare

על **המחשב שלך**, מחוץ ל-checkout של git. הקובץ תמיד ב-`~/.config/exhibit-test/handoff.env`
(הסקריפט לא קורא את `XDG_CONFIG_HOME`).

```bash
mkdir -p ~/.config/exhibit-test && chmod 700 ~/.config/exhibit-test
ssh ubuntu@<vm> sudo cat /root/exhibit-test/cloudflare-handoff.env > ~/.config/exhibit-test/handoff.env
chmod 600 ~/.config/exhibit-test/handoff.env
```

ההנחה היא ש-`sudo` של משתמש ה-cloud-init לא מבקש סיסמה (ברירת המחדל הרגילה של cloud
images; **לא נבדק** על התבנית שלך). אם הוא מבקש, להעתיק בשני שלבים (בלי `ssh -t ... cat`,
שמכניס את בקשת הסיסמה ו-CRLF לקובץ):

```bash
ssh -t ubuntu@<vm> 'sudo install -m 600 -o ubuntu /root/exhibit-test/cloudflare-handoff.env ~/handoff.env'
scp ubuntu@<vm>:handoff.env ~/.config/exhibit-test/handoff.env && chmod 600 ~/.config/exhibit-test/handoff.env \
  && ssh ubuntu@<vm> shred -u handoff.env
```

בקובץ יש בדיוק חמש שורות: `DOMAIN`, `SUPABASE_URL`, `ANON_KEY`, `SERVICE_ROLE_KEY`,
`TELEGRAM_WEBHOOK_SECRET`. הסקריפט בודק את הצורה של כל אחת לפני כל פעולה, ומסרב לרוץ אם
יש `handoff.env` בתוך המאגר או אם ההרשאות שלו אינן 600.

צריך: Node 22, git, curl, jq, ו-checkout של אותו `EM2_REF`:

```bash
git clone https://github.com/Yuki-az-23/Em2 ~/Em2 && git -C ~/Em2 checkout <EM2_REF>
```

```bash
cd ~/Em2/exhibit
npm ci
npx --no-install wrangler login
bash deploy/cloudflare-test.sh
```

הסקריפט מבקש את טוקן הבוט (קלט מוסתר) ואת ה-Zone ID של `<DOMAIN>` אם הדומיין של R2 עוד לא
קיים (אפשר גם `CF_ZONE_ID=...` בסביבה). אחר כך: דלי R2 והדומיין `images-test`, פריסת
ה-Worker עם `--env test`, ארבעת הסודות שלו דרך stdin, בניית האתר עם שני ערכי `VITE_*`
בלבד ובדיקה שמפתח השירות לא נכנס לבנייה, פריסת האתר, `setWebhook` עם `secret_token`
ו-`allowed_updates=["message"]`, ובדיקות מבחוץ: `/health`, האתר, REST דרך `api-test`,
ש-`api-test/` מחזיר 403, ש-`studio-test` מפנה ל-Access, וש-`/telegram` בלי הסוד מחזיר 403.

גם כאן הסוף הוא `RESULT: PASS` או `FAIL`, ושורות `CHECK` בלי סודות. אפשר לשלוח את הפלט.

## 9. בדיקה עם שני טלפונים

1. טלפון א: לפתוח `https://exhibit-test.<DOMAIN>/`, לענות בדלת, ללחוץ "פתח בטלגרם".
2. בטלגרם: `/start <code>` נשלח אוטומטית. להסכים, ולהצהיר רגש וצבע.
3. `/invite` נותן קישור. לשלוח אותו לטלפון ב, שעובר את אותה הסכמה והצהרה.
4. כמה הודעות בכל כיוון, ואז `/end`.
5. בזמן הזה, על המחשב שלך, למדוד כמה זמן לוקח הצינור:

```bash
cd ~/Em2/exhibit/worker
npx --no-install wrangler tail --env test
```

6. תוך דקה בערך הכרטיס צריך להופיע ב-`https://exhibit-test.<DOMAIN>/wall`, בלי שמות ובלי
   מילים מהשיחה, ואם הציור הצליח, עם תמונה מ-`images-test`.
7. ב-`studio-test.<DOMAIN>`: קודם PIN במייל, אחר כך basic auth, ואז Studio. המשתמש הוא
   `exhibit` (`DASHBOARD_USERNAME`); הסיסמה היא `DASHBOARD_PASSWORD`. לקרוא רק אותה, בלי
   לפתוח את כל הקובץ על המסך:

```bash
ssh ubuntu@<vm> "sudo grep '^DASHBOARD_PASSWORD=' /opt/exhibit-test/supabase/.env"
```

```bash
curl -s https://hermes-test.<DOMAIN>/health    # expect hasDb and hasBot true
```

## 10. בדיקת בריאות

אפשר להריץ בכל רגע. לא משנה כלום, חוץ מקריאת RPC אנונימית אחת שמנצלת חריץ אחד של
הגבלת הקצב.

```bash
ssh ubuntu@<vm> 'sudo bash ~/Em2/exhibit/deploy/healthcheck.sh'
```

היא בודקת קונטיינרים, ש-`functions` ו-`supavisor` לא קיימים, ש-`ss` עובד, שאין מאזין על
כתובת שאינה loopback חוץ מ-22 ושיש מאזין SSH על 22, REST ו-Realtime מקומית ודרך ה-tunnel, שה-WAF חוסם את `/` ואת `/pg`,
ש-anon לא יכול לכתוב ל-`public_profiles`, את ה-publication, את `telegram_bot`, ושהגיבוי
האחרון בן פחות מ-26 שעות. הפלט נשמר ב-`/var/log/exhibit-test/health-<ts>.txt` ואפשר לשלוח
אותו. יציאה 0 = הכל עבר, 1 = יש FAIL, 2 = נמצא סוד בפלט (לא לשלוח).

## 11. גיבויים ובדיקת שחזור

הטיימר `exhibit-test-backup.timer` מריץ את `backup.sh` (מותקן כ-
`/usr/local/sbin/exhibit-test-backup`) כל לילה ב-03:17 עם עד 10 דקות השהיה אקראית. הוא
כותב `db-<ts>.dump` ו-`storage-<ts>.tgz` ל-`/opt/exhibit-test/backups`, בודק את הדאמפ עם
`pg_restore --list`, מוחק קבצים בני יותר מ-14 יום, וכותב את התוצאה ל-
`/var/lib/exhibit-test/backup.status`.

```bash
sudo /usr/local/sbin/exhibit-test-backup          # run one now
sudo cat /var/lib/exhibit-test/backup.status       # "ok <ts>" or "fail <ts> <step>"
sudo ls -l /opt/exhibit-test/backups
systemctl list-timers exhibit-test-backup.timer
```

**בדיקת שחזור** לפני שיחה אמיתית ראשונה. קודם לבדוק שהדאמפ קריא:

```bash
sudo sh -c 'docker exec -i supabase-db pg_restore --list < /opt/exhibit-test/backups/db-<ts>.dump' | head
```

שחזור אמיתי הוא של סכמת היישום בלבד, ועדיף אחרי snapshot:

```bash
sudo sh -c 'docker exec -i supabase-db pg_restore -U supabase_admin -d postgres \
  -n public --clean --if-exists < /opt/exhibit-test/backups/db-<ts>.dump'
sudo tar -xzf /opt/exhibit-test/backups/storage-<ts>.tgz -C /opt/exhibit-test/supabase/volumes
```

שחזור של כל המסד עם `--clean` מתנגש באובייקטים של `supabase_admin`,
`supabase_auth_admin` ו-`supabase_storage_admin`, ולכן לא עושים אותו. **השחזור לא נבדק
מול האימג' הזה.** הגיבוי נשאר על אותו דיסק; עותק מחוץ למכונה (R2) עוד לא קיים.

## 12. חזרה לאחור

### ראשי: snapshot

```bash
qm rollback <vmid> pre-bootstrap        # or post-bootstrap-ok
```

### חלקי, על ה-VM

```bash
# Stop everything
sudo docker compose -f /opt/exhibit-test/edge/docker-compose.yml -p exhibit-edge down
cd /opt/exhibit-test/supabase && sudo docker compose down

# Wipe the data and start over (keys survive: .env and /root/exhibit-test/env.backup stay)
cd /opt/exhibit-test/supabase && sudo docker compose down -v
sudo rm -rf /opt/exhibit-test/supabase/volumes/db/data /opt/exhibit-test/supabase/volumes/storage
sudo bash ~/Em2/exhibit/deploy/bootstrap-vm.sh
```

להחליף מפתחות **מוחק את כל הנתונים**: המסד הקיים שומר את הסיסמאות מההקמה הראשונה, ומפתחות
חדשים לא יתאימו לו. לכן זה מחיקה מלאה, ואחריה להעתיק שוב את קובץ ההעברה ולהריץ שוב את
`cloudflare-test.sh` (סודות ה-Worker ובניית האתר תלויים במפתחות). הסקריפט מסרב ליצור מפתחות
חדשים כל עוד `volumes/db/data` לא ריק.

```bash
cd /opt/exhibit-test/supabase && sudo docker compose down -v
sudo rm -rf /opt/exhibit-test/supabase/volumes/db/data /opt/exhibit-test/supabase/volumes/storage
sudo rm -f /opt/exhibit-test/supabase/.env /root/exhibit-test/env.backup
sudo bash ~/Em2/exhibit/deploy/bootstrap-vm.sh
```

`EM2_REF` שגוי: לשים את ה-SHA הקודם ולהריץ שוב. הסכמה אף פעם לא מוחקת אובייקטים.

### Cloudflare, מהמחשב שלך

```bash
cd ~/Em2/exhibit
# Telegram: remove the webhook (the token goes to curl on stdin, never in argv)
printf 'bot token: ' >&2; IFS= read -rs TOKEN; echo >&2
printf 'url = "https://api.telegram.org/bot%s/deleteWebhook"\n' "$TOKEN" | curl -sS -K -; unset TOKEN

# Workers (deleting a Worker also removes its custom domain)
(cd worker && npx --no-install wrangler delete --env test)
npx --no-install wrangler delete -c wrangler.site.jsonc

# Handoff file
shred -u ~/.config/exhibit-test/handoff.env    # macOS: rm -P
```

בלוח: לרוקן ולמחוק את הדלי `hermes-images-test` ולהסיר את `images-test.<DOMAIN>`; למחוק את
ה-tunnel `exhibit-test` (Networking > Tunnels), את אפליקציית ה-Access, ואת כללי ה-WAF
והמטמון. שום דבר מזה לא נוגע ב-tunnel, בפורטים או בשמות של em2.

## 13. פערים ידועים

- **30 שניות של `waitUntil`.** הצינור רץ אחרי תשובה 200 לטלגרם. אם הוא לא מסיים, ה-cron
  מעביר שיחה שתקועה ב-`closed` יותר מ-15 דקות ל-`failed` ומנסה שוב. לא נמדד: למדוד עם
  `wrangler tail` בשלב 9.
- **אין "קיר נח" ואין SMTP.** אין צילום של הקיר ל-R2 כש-Supabase לא זמין. הרשמה במייל
  מאושרת אוטומטית (`ENABLE_EMAIL_AUTOCONFIRM=true`).
- **הרשמה פתוחה.** כל מי שמגיע לאתר יכול לפתוח חשבון. אחרי שחשבונות הבדיקה קיימים, מומלץ
  `DISABLE_SIGNUP=true` ב-`.env` ו-`docker compose up -d` מחדש.
- **תמונות ב-R2 לא נמחקות** כשמושכים פוסט.
- **Postgres 16 ב-CI, 17 כאן.** ה-CI מדמה את סכמת `extensions` ואת הרשאות ברירת המחדל של
  Supabase (`demo/supabase-defaults.sql`), אבל `schema.sql` לא הורץ מול האימג' של Supabase
  לפני ה-VM.
- **ה-service worker שומר `/assets/` במטמון.** אחרי בנייה חדשה: רענון קשיח, או להסיר את
  ה-service worker בכלי המפתח.
- **עברית של Workers AI** בהשחרה ובפרפרזה לא הוערכה. כל הבטחת הפרטיות נשענת עליה.

## מה לא אומת מכאן

ה-tunnel האמיתי; שה-WebSockets של Realtime עוברים דרכו; ש-
`--metrics 127.0.0.1:20241` ו-`/ready` מתנהגים כך ב-cloudflared 2026.9.0; ש-`profiles: off`
עוצר את `functions` ו-`supavisor` בלי לשבור שירות אחר; ש-`schema.sql` עולה נקי על Postgres
17 של Supabase; פרמטרי `setWebhook` (התיעוד של טלגרם לא היה נגיש); ש-`sudo` בלי סיסמה
עובד בתבנית שלך; ופקודות `qm` בשלב 5. בדיקות הבריאות על ה-VM מכסות את רובם.
