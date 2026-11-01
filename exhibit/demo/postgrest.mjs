/**
 * Finds or downloads the PostgREST binary and starts it.
 * Order: POSTGREST_BIN, `postgrest` on PATH, a cached download in .demo/bin.
 */
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const POSTGREST_VERSION = 'v12.2.3';

function asset() {
  const { platform, arch } = process;
  if (platform === 'linux' && arch === 'x64') return 'linux-static-x64';
  if (platform === 'linux' && arch === 'arm64') return 'ubuntu-aarch64';
  if (platform === 'darwin') return 'macos-x64'; // Apple Silicon runs it under Rosetta; or `brew install postgrest`
  throw new Error(`no PostgREST build for ${platform}/${arch}; install it and set POSTGREST_BIN`);
}

function onPath() {
  try { return execFileSync('sh', ['-c', 'command -v postgrest'], { encoding: 'utf8' }).trim() || null; } catch { return null; }
}

export async function findPostgrest(stateDir) {
  if (process.env.POSTGREST_BIN) return process.env.POSTGREST_BIN;
  const found = onPath();
  if (found) return found;
  const bin = join(stateDir, 'bin', 'postgrest');
  if (existsSync(bin)) return bin;
  mkdirSync(join(stateDir, 'bin'), { recursive: true });
  const url = `https://github.com/PostgREST/postgrest/releases/download/${POSTGREST_VERSION}/postgrest-${POSTGREST_VERSION}-${asset()}.tar.xz`;
  console.log(`   downloading PostgREST ${POSTGREST_VERSION} ...`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`PostgREST download failed: HTTP ${res.status} ${url}`);
  const archive = join(stateDir, 'bin', 'postgrest.tar.xz');
  writeFileSync(archive, Buffer.from(await res.arrayBuffer()));
  execFileSync('tar', ['-xJf', archive, '-C', join(stateDir, 'bin')]);
  return bin;
}

/** Starts PostgREST and resolves once it answers. */
export async function startPostgrest({ bin, dbUri, jwtSecret, port, log }) {
  const child = spawn(bin, [], {
    env: {
      ...process.env,
      PGRST_DB_URI: dbUri,
      PGRST_DB_SCHEMAS: 'public',
      PGRST_DB_ANON_ROLE: 'anon',
      PGRST_JWT_SECRET: jwtSecret,
      PGRST_SERVER_HOST: '127.0.0.1',
      PGRST_SERVER_PORT: String(port),
      PGRST_DB_POOL: '10',
      PGRST_LOG_LEVEL: 'warn'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  child.stdout.on('data', (d) => log(String(d).trim()));
  child.stderr.on('data', (d) => log(String(d).trim()));
  const url = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null) throw new Error(`PostgREST exited with ${child.exitCode}`);
    try { const r = await fetch(`${url}/`); if (r.ok) return { child, url }; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  child.kill();
  throw new Error('PostgREST did not start within 20 s');
}
