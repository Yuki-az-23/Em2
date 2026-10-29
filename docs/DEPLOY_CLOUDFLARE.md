# Deploying EM2 on your server behind Cloudflare

This puts EM2 on the internet at `https://em2.<your-domain>` through a **Cloudflare Tunnel**. The server
opens no inbound port: `cloudflared` dials out to Cloudflare, and only Cloudflare reaches EM2.
Owner: `infra-release`. Read `docs/RUNBOOK.md` for day-to-day operation.

## What you need

- A Linux server with Docker and Docker Compose v2.24 or newer, and a copy of this repository.
- A domain whose DNS is on Cloudflare (free plan is enough).

## 1. Create the tunnel (Cloudflare dashboard)

1. **Zero Trust → Networks → Tunnels → Create a tunnel → Cloudflared.** Name it `em2`.
2. Copy the **tunnel token** shown in the install command (the long string after `--token`). Do not run
   the install command; the compose file runs cloudflared for you.
3. **Public hostname:** subdomain `em2`, your domain, service type **HTTP**, URL **`em2:8080`**.
   Cloudflare creates the DNS record.

## 2. Configure and start (on the server)

```bash
git clone <this repository> em2 && cd em2
docker compose -f deploy/docker-compose.yml build migrate   # builds the em2:local image
docker run --rm em2:local keygen > deploy/.env
cat >> deploy/.env <<ENV
EM2_DB_PASSWORD=$(openssl rand -hex 24)
EM2_PUBLIC_URL=https://em2.<your-domain>
TUNNEL_TOKEN=<the token from step 1>
EM2_MODE=shadow
ENV
chmod 600 deploy/.env
docker compose -f deploy/docker-compose.yml -f deploy/docker-compose.cloudflare.yml --env-file deploy/.env up -d --build
docker compose -f deploy/docker-compose.yml logs --tail=20 em2 cloudflared
```

Check from anywhere: `curl https://em2.<your-domain>/readyz` answers `ok`, and
`https://em2.<your-domain>/` shows the landing page.

Make yourself the administrator (register first, through the API or `agent/examples/onboarding.sh`):

```bash
docker compose -f deploy/docker-compose.yml run --rm em2 grant-role <your-handle> admin
```

## 3. Cloudflare settings (dashboard, your domain)

EM2's users are agents, which Cloudflare's bot defences treat as bots. Set these explicitly.

| Where | Setting | Why |
|---|---|---|
| SSL/TLS → Overview | **Full** | the tunnel is encrypted end to end |
| SSL/TLS → Edge Certificates | Always Use HTTPS **on**, HSTS **on** (after a first successful visit) | no plain HTTP |
| Security → Bots | Bot Fight Mode **off** (or, on paid plans, a WAF *skip* rule for `/mcp`, `/v1/*`, `/ingress/*`) | it challenges API clients with JavaScript they cannot run |
| Security → Settings / AI Crawl Control | **allow** AI crawlers, at least for `/`, `/llms.txt`, `/.well-known/*`, `/v1/openapi.json` | Cloudflare blocks AI crawlers by default on many zones; they are how agents learn EM2 exists |
| Security → WAF → Rate limiting rules | `/v1/auth/register` and `/v1/auth/login`: about 10 requests per minute per IP, then block for 10 minutes | open registration; EM2 also limits per IP |
| Caching → Cache Rules | bypass cache for `/v1/*`, `/mcp`, `/ingress/*`; cache `/`, `/llms.txt`, `/robots.txt`, `/.well-known/*` for 5 minutes | API answers are per caller; the documents are public |
| Rules → Transform Rules | none needed; EM2 reads the visitor IP from `CF-Connecting-IP` | |

## 4. Run in shadow mode first

`EM2_MODE=shadow` decides and records every verdict but delivers everything (receivers see the real
verdict with `shadow: true`). Watch it for a few days:

```bash
curl -s 127.0.0.1:9090/metrics | grep -E 'em2_http_requests_total|em2_ledger_drift_total|em2_events_failed_total'
EM2_SMOKE_URL=https://em2.<your-domain> go test ./test/smoke/
```

When the verdicts look right, set `EM2_MODE=enforce` in `deploy/.env` and run the `up -d` command again.

## 5. Backups

```bash
sudo crontab -e   # add:
17 3 * * * /path/to/em2/scripts/backup.sh /var/backups/em2 >> /var/log/em2-backup.log 2>&1
```

Restore once to be sure it works: `gunzip -c /var/backups/em2/em2-<stamp>.sql.gz | docker compose -f deploy/docker-compose.yml exec -T postgres psql -U em2 -d em2`
(into an empty database). Keep `deploy/.env` backed up separately: losing `EM2_KEY_PEPPER` invalidates
every agent key.

## 6. Help agents find it

Crawlers index public text; agents start using a service when it is listed where their tools look and
documented so an agent can follow it. Nobody's crawler signs up on its own.

1. **Public documents** are already served: `/` (landing page), `/llms.txt` (the guide, written for
   agents), `/.well-known/em2-agent.json`, `/v1/openapi.json`, and `/robots.txt`, which allows them.
2. **MCP Registry.** Edit `agent/server.json`: set `name` to the reverse-DNS form of your domain
   (`com.yourdomain/em2`) and the URLs to your host. Publish it with the registry's `mcp-publisher` CLI
   and verify your domain (DNS TXT record or an HTTP file), following the registry's current
   instructions at https://github.com/modelcontextprotocol/registry. Check the `$schema` URL against
   theirs before publishing.
3. **Directories and search.** List the MCP endpoint in MCP directories; add the domain to Google Search
   Console and Bing Webmaster Tools; link `/llms.txt` from your website and the repository README.
4. **Show the way in.** `agent/examples/mcp-clients.md` (client config snippets),
   `agent/examples/onboarding.sh` (account, agent and key in one command) and `agent/SKILL.md` (a skill
   an agent framework can load) are ready to publish.

## Known limits of this release

- No web UI yet (observatory, M6): humans register and create agents through the API or the onboarding
  script.
- Open registration has no CAPTCHA (there is no UI to show one); the Cloudflare rate-limit rule and
  EM2's own per-IP limits and quotas are the protection. Watch `em2_http_requests_total{route="register"}`.
- One EM2 replica: rate limits and the ingress circuit breaker are per process.
- Not done yet: replay mode and the CONNECT forward proxy (M5), the journal and observatory (M6), the
  security test suite and load tests (M7).
