#!/usr/bin/env node
/**
 * npm run demo          the whole exhibit, until Ctrl+C
 * npm run demo:check    backend only, run the scenario, exit with its result
 * flags: --no-site, --scenario, --fresh (wipe the local cluster first)
 *
 * Brings the exhibit up locally with no Docker and no Cloudflare account:
 * Postgres (yours via DEMO_DATABASE_URL, or a throwaway cluster in .demo/pg),
 * the schema and a seeded wall, PostgREST, the hub (Supabase gateway + the
 * Hermes worker in-process + a fake Telegram), and the site on Vite.
 * Writes .demo/env.json for the scenario and the browser test.
 *
 * For containers (demo/docker-compose.yml): DEMO_POSTGREST_URL uses a running
 * PostgREST instead of starting one, DEMO_JWT_SECRET fixes the signing secret
 * it shares, DEMO_BIND sets the listen address, DEMO_PUBLIC_HUB the address a
 * browser uses to reach the hub.
 */
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { makeKeys } from './keys.mjs';
import { findPostgrest, startPostgrest } from './postgrest.mjs';
import { startHub } from './hub.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const STATE = join(ROOT, '.demo');
const args = new Set(process.argv.slice(2));
const PORTS = {
  hub: Number(process.env.DEMO_HUB_PORT || 54321),
  pg: Number(process.env.DEMO_PG_PORT || 54322),
  rest: Number(process.env.DEMO_REST_PORT || 54330),
  site: Number(process.env.DEMO_SITE_PORT || 5173)
};
const children = [];
let stopCluster = null;

const say = (s) => console.log(`\n\x1b[1m== ${s}\x1b[0m`);
const ok = (s) => console.log(`   \x1b[32mok\x1b[0m   ${s}`);

function pgBin() {
  if (process.env.PGBIN) return process.env.PGBIN;
  const base = '/usr/lib/postgresql';
  if (existsSync(base)) {
    const v = readdirSync(base).filter((d) => existsSync(join(base, d, 'bin', 'initdb'))).sort((a, b) => Number(a) - Number(b)).pop();
    if (v) return join(base, v, 'bin');
  }
  try { return dirname(execFileSync('sh', ['-c', 'command -v pg_ctl'], { encoding: 'utf8' }).trim()); } catch { return null; }
}

function startCluster() {
  if (process.getuid && process.getuid() === 0) {
    throw new Error('initdb refuses to run as root. Run as a normal user, or set DEMO_DATABASE_URL to an existing Postgres 15+.');
  }
  const bin = pgBin();
  if (!bin) throw new Error('PostgreSQL server binaries not found. Install Postgres 16, set PGBIN, or set DEMO_DATABASE_URL.');
  const data = join(STATE, 'pg');
  if (args.has('--fresh')) rmSync(data, { recursive: true, force: true });
  if (!existsSync(join(data, 'PG_VERSION'))) {
    execFileSync(join(bin, 'initdb'), ['-D', data, '-A', 'trust', '-U', 'postgres', '--locale=C.UTF-8', '-E', 'UTF8'], { stdio: 'ignore' });
  }
  execFileSync(join(bin, 'pg_ctl'), ['-D', data, '-o', `-p ${PORTS.pg} -c listen_addresses=127.0.0.1 -k ${data}`, '-l', join(STATE, 'pg.log'), '-w', 'start'], { stdio: 'ignore' });
  stopCluster = () => { try { execFileSync(join(bin, 'pg_ctl'), ['-D', data, '-m', 'fast', 'stop'], { stdio: 'ignore' }); } catch { /* already down */ } };
  const admin = `postgres://postgres@127.0.0.1:${PORTS.pg}/postgres`;
  const exists = execFileSync('psql', [admin, '-tAc', "SELECT 1 FROM pg_database WHERE datname = 'hermes'"], { encoding: 'utf8' }).trim();
  if (!exists) execFileSync('psql', [admin, '-qc', 'CREATE DATABASE hermes']);
  return `postgres://postgres@127.0.0.1:${PORTS.pg}/hermes`;
}

function psqlFile(url, file) {
  execFileSync('psql', [url, '-v', 'ON_ERROR_STOP=1', '-q', '-f', file], {
    stdio: ['ignore', 'ignore', 'inherit'],
    env: { ...process.env, PGOPTIONS: '-c client_min_messages=warning' }
  });
}

function asAuthenticator(url) {
  const u = new URL(url);
  u.username = 'authenticator'; u.password = 'authenticator-demo';
  return u.toString();
}

function shutdown(code = 0) {
  for (const c of children) { try { c.kill('SIGTERM'); } catch { /* gone */ } }
  if (stopCluster) stopCluster();
  process.exit(code);
}
process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

async function main() {
  mkdirSync(STATE, { recursive: true });

  say('database');
  const dbUrl = process.env.DEMO_DATABASE_URL || startCluster();
  psqlFile(dbUrl, join(ROOT, 'supabase', 'schema.sql'));
  psqlFile(dbUrl, join(ROOT, 'demo', 'roles.sql'));
  psqlFile(dbUrl, join(ROOT, 'supabase', 'seed.sql'));
  ok(`schema, demo roles and seeded wall on ${new URL(dbUrl).host}`);

  say('PostgREST');
  const keysFile = join(STATE, 'keys.json');
  const keys = process.env.DEMO_JWT_SECRET ? makeKeys(process.env.DEMO_JWT_SECRET)
    : existsSync(keysFile) ? JSON.parse(readFileSync(keysFile, 'utf8')) : makeKeys();
  writeFileSync(keysFile, JSON.stringify(keys, null, 2));
  let rest;
  if (process.env.DEMO_POSTGREST_URL) {
    rest = { url: process.env.DEMO_POSTGREST_URL.replace(/\/$/, '') };
    for (let i = 0; i < 150; i++) {
      try { if ((await fetch(`${rest.url}/`)).ok) break; } catch { /* not up yet */ }
      await new Promise((r) => setTimeout(r, 200));
    }
  } else {
    const bin = await findPostgrest(STATE);
    rest = await startPostgrest({ bin, dbUri: asAuthenticator(dbUrl), jwtSecret: keys.jwtSecret, port: PORTS.rest, log: (l) => l && console.log(`   [postgrest] ${l}`) });
    children.push(rest.child);
  }
  ok(rest.url);

  say('hub: Supabase gateway, Hermes worker, fake Telegram');
  const webhookSecret = randomBytes(16).toString('hex');
  const bind = process.env.DEMO_BIND || '127.0.0.1';
  const hubUrl = `http://127.0.0.1:${PORTS.hub}`;
  const publicHub = (process.env.DEMO_PUBLIC_HUB || hubUrl).replace(/\/$/, '');
  const workerEnv = {
    SUPABASE_URL: hubUrl,
    SUPABASE_SERVICE_ROLE_KEY: keys.serviceKey,
    TELEGRAM_BOT_TOKEN: 'demo-token',
    TELEGRAM_WEBHOOK_SECRET: webhookSecret,
    TELEGRAM_API_BASE: `${hubUrl}/fake-telegram`,
    AI_MODE: 'fake',
    PIPELINE_MAX_ATTEMPTS: '3'
  };
  await startHub({ port: PORTS.hub, host: bind, postgrestUrl: rest.url, workerEnv, log: (...a) => console.log('  ', ...a) });
  ok(publicHub);

  const siteUrl = process.env.DEMO_PUBLIC_SITE || `http://127.0.0.1:${PORTS.site}`;
  writeFileSync(join(STATE, 'env.json'), JSON.stringify({ hub: hubUrl, site: siteUrl, anonKey: keys.anonKey, bot: 'HermesDemoBot' }, null, 2));

  if (!args.has('--no-site')) {
    say('site');
    const vite = spawn('npx', ['vite', '--host', bind, '--port', String(PORTS.site), '--strictPort'], {
      cwd: ROOT, stdio: 'inherit',
      env: { ...process.env, VITE_SUPABASE_URL: publicHub, VITE_SUPABASE_ANON_KEY: keys.anonKey, VITE_DEMO_HUB: publicHub }
    });
    children.push(vite);
    vite.on('exit', (c) => { if (c) shutdown(c); });
  }

  if (args.has('--scenario')) {
    const run = spawn(process.execPath, [join(ROOT, 'demo', 'scenario.mjs')], { cwd: ROOT, stdio: 'inherit', env: { ...process.env, DEMO_HUB: hubUrl } });
    run.on('exit', (code) => shutdown(code ?? 1));
    return;
  }

  say('ready');
  console.log(`   the door:       ${siteUrl}/`);
  console.log(`   the simulator:  ${siteUrl}/lab`);
  console.log(`   the wall:       ${siteUrl}/wall`);
  console.log('   the scenario:   npm run demo:scenario   (in another terminal)');
  console.log('   stop:           Ctrl+C');
}

main().catch((e) => { console.error(`\n   \x1b[31mFAIL\x1b[0m ${e.message}`); shutdown(1); });
