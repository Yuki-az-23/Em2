/** HS256 JWTs for the local demo, signed with Node's crypto. No dependencies. */
import { createHmac, randomBytes } from 'node:crypto';

const b64url = (buf) => Buffer.from(buf).toString('base64url');

export function signJwt(payload, secret) {
  const head = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify(payload));
  const sig = createHmac('sha256', secret).update(`${head}.${body}`).digest('base64url');
  return `${head}.${body}.${sig}`;
}

export function makeKeys(secret = randomBytes(32).toString('hex')) {
  const exp = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365;
  return {
    jwtSecret: secret,
    anonKey: signJwt({ role: 'anon', iss: 'hermes-demo', exp }, secret),
    serviceKey: signJwt({ role: 'service_role', iss: 'hermes-demo', exp }, secret)
  };
}
