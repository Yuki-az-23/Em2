#!/usr/bin/env node
/**
 * npm run demo:scenario   (needs `npm run demo` running)
 *
 * Two simulated people go through the whole exhibit against the real local
 * stack, and every claim the exhibit makes is checked on the way:
 *   1. the door gives a code and a pseudonym
 *   2. both people consent and are paired through the bot
 *   3. their messages are relayed with pseudonyms
 *   4. ending the chat puts a card on the wall with no names and no words
 *   5. one trigger holds the card's state, three move it one step; a brace counts
 *   6. /withdraw takes the card off the wall
 *   7. the door slows down a visitor who asks too often
 * Exits non-zero on the first failure.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { point, names, stepInteraction, EMOTIONS, COLORS } from '@hermes/core';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const env = JSON.parse(readFileSync(join(ROOT, '.demo', 'env.json'), 'utf8'));
const HUB = process.env.DEMO_HUB || env.hub;
const KEY = env.anonKey;

let failed = 0;
const say = (s) => console.log(`\n\x1b[1m== ${s}\x1b[0m`);
const ok = (s) => console.log(`   \x1b[32mok\x1b[0m   ${s}`);
const bad = (s) => { console.log(`   \x1b[31mFAIL\x1b[0m ${s}`); failed++; };
const check = (cond, s) => { if (cond) ok(s); else bad(s); return cond; };
const must = (cond, s) => { if (!check(cond, s)) { console.log('\n   stopping: the next steps depend on this one'); process.exit(1); } };

const rnd = (n) => Math.floor(Math.random() * n);
const visitorIp = () => `10.${100 + rnd(100)}.${rnd(250)}.${1 + rnd(250)}`;

async function rpc(name, params, ip) {
  const r = await fetch(`${HUB}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', 'x-forwarded-for': ip },
    body: JSON.stringify(params)
  });
  const body = await r.json().catch(() => null);
  return r.ok ? { data: body, error: null } : { data: null, error: body };
}
async function table(path) {
  const r = await fetch(`${HUB}/rest/v1/${path}`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } });
  return r.json();
}
async function tell(chatId, text) {
  const r = await fetch(`${HUB}/demo/chats/${chatId}/say`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) });
  if (!r.ok) throw new Error(`hub refused ${chatId}: ${r.status}`);
  await fetch(`${HUB}/demo/idle`);
}
async function botLines(chatId) {
  const r = await (await fetch(`${HUB}/demo/chats/${chatId}`)).json();
  return r.messages.filter((m) => m.from === 'bot').map((m) => m.text);
}
const lastBot = async (chatId) => (await botLines(chatId)).at(-1) || '';

async function main() {
  try { await fetch(`${HUB}/demo/health`); } catch { console.error(`no hub at ${HUB}; start it with: npm run demo`); process.exit(2); }

  const A = 200000 + rnd(700000);
  const B = A + 1;
  const nameA = 'אלה כהן';
  const ip = visitorIp();

  say('1. the door');
  const inv = await rpc('create_invite', { p_display_name: nameA, p_role: 'participant', p_answer: 'trust_signal' }, ip);
  must(inv.data && /^[A-Za-z0-9]{22}$/.test(inv.data.code), `create_invite gives a 22-character code (${inv.data?.code})`);
  check(inv.data.telegram_link.endsWith(`?start=${inv.data.code}`), 'the Telegram link carries the code');
  const handleA = inv.data.handle;
  check(/^\S+-\S+$/.test(handleA) && !handleA.includes(nameA), `the system renamed "${nameA}" to "${handleA}"`);

  say('2. consent and pairing through the bot');
  await tell(A, `/start ${inv.data.code}`);
  check((await lastBot(A)).includes(handleA) && (await lastBot(A)).includes('מסכים'), 'A is greeted by pseudonym and asked to consent');
  await tell(A, 'שלום?');
  check((await lastBot(A)).includes('מסכים'), 'before consent, text is not relayed and consent is asked again');
  await tell(A, 'מסכים');
  check((await botLines(A)).some((t) => t.startsWith('נרשם')), 'A consents');
  await tell(A, '/invite');
  const pair = /start=([A-Za-z0-9_-]+)/.exec(await lastBot(A));
  must(pair, 'A gets a one-person link to send');
  await tell(B, `/start ${pair[1]}`);
  const greetB = await lastBot(B);
  const handleB = /קוראים לך (\S+)\./.exec(greetB)?.[1];
  must(handleB && handleB !== handleA, `B is renamed "${handleB}"`);
  await tell(B, 'מסכים');
  check((await botLines(B)).some((t) => t.includes(handleA) && t.includes('השיחה פתוחה')), `B is told ${handleA} is there`);
  check((await botLines(A)).some((t) => t.includes(handleB) && t.includes('השיחה פתוחה')), `A is told ${handleB} is there`);

  say('3. the private channel');
  const lines = [
    [A, 'זוכר את החוף בחיפה עם דנה? הים היה שטוח.'],
    [B, 'זוכר. אמרת שים שטוח אומר שמותר להתחיל מחדש.'],
    [A, 'אז אולי עכשיו מתחילים מחדש, אנחנו.'],
    [B, 'אולי. תכתבי לי מחר בבוקר, אלה.'],
    [A, 'אכתוב. ella@example.com אם הטלגרם ייפול.'],
    [B, 'סגור. לילה טוב מכרם הזיתים.'],
    [A, 'לילה טוב.'],
    [B, 'לילה.']
  ];
  for (const [from, text] of lines) await tell(from, text);
  const toB = await botLines(B); const toA = await botLines(A);
  check(lines.filter(([f]) => f === A).every(([, t]) => toB.includes(`${handleA}: ${t}`)), `B received all four of A's messages under "${handleA}"`);
  check(lines.filter(([f]) => f === B).every(([, t]) => toA.includes(`${handleB}: ${t}`)), `A received all four of B's messages under "${handleB}"`);

  say('4. the provider decides, and the wall shows it');
  await tell(A, '/end');
  check((await lastBot(B)).includes('השיחה נסגרה'), 'both are told the chat closed');
  let card = null;
  for (let i = 0; i < 20 && !card; i++) {
    const rows = await table(`posts?select=id,pseudonyms,emotion,color,body,provenance,reactions,braces&pseudonyms=cs.{${encodeURIComponent(handleA)},${encodeURIComponent(handleB)}}`);
    card = Array.isArray(rows) ? rows[0] : null;
    if (!card) await new Promise((r) => setTimeout(r, 500));
  }
  must(card, `a card with "${handleA}" and "${handleB}" is on the wall`);
  console.log(`        ${card.emotion}/${card.color}: ${card.body}`);
  const hay = JSON.stringify(card);
  check(!hay.includes('אלה') && !hay.includes('כהן'), 'the typed name is not on the card');
  check(lines.every(([, t]) => t.length < 12 || !hay.includes(t)), 'no message line is on the card');
  check(!/חיפה|דנה|ella@example\.com|כרם הזיתים/.test(hay), 'no place, third person or email from the chat is on the card');
  check(card.provenance?.model === 'demo-fake', 'the card records that a demo model wrote it');
  const feed = await rpc('get_feed', { p_emotion: card.emotion, p_color: card.color, p_limit: 50 }, ip);
  check(feed.data?.some((p) => p.id === card.id), 'a visitor at the same state sees it in their feed');

  say('5. strangers move it');
  const start = point(card.emotion, card.color);
  const vis = { e: (start.e + 2) % 8, c: (start.c + 3) % 8 };
  const visNames = { emotion: EMOTIONS[vis.e], color: COLORS[vis.c] };
  const expected = names(stepInteraction(vis, start).next);
  const stranger = visitorIp();
  const r1 = await rpc('react_to_post', { p_post: card.id, p_kind: 'trigger', p_emotion: visNames.emotion, p_color: visNames.color }, stranger);
  must(!r1.error, `a stranger at ${visNames.emotion}/${visNames.color} triggers it`);
  check(r1.data.after.emotion === card.emotion && r1.data.after.color === card.color, `one trigger: it holds at ${card.emotion}/${card.color}`);
  await rpc('react_to_post', { p_post: card.id, p_kind: 'trigger', p_emotion: visNames.emotion, p_color: visNames.color }, stranger);
  const r3 = await rpc('react_to_post', { p_post: card.id, p_kind: 'trigger', p_emotion: visNames.emotion, p_color: visNames.color }, stranger);
  check(r3.data?.after.emotion === expected.emotion && r3.data?.after.color === expected.color,
    `three triggers: it moves one step, to ${r3.data?.after.emotion}/${r3.data?.after.color} (expected ${expected.emotion}/${expected.color})`);
  const br = await rpc('react_to_post', { p_post: card.id, p_kind: 'brace', p_emotion: card.emotion, p_color: card.color }, visitorIp());
  const after = (await table(`posts?select=reactions,braces&id=eq.${card.id}`))[0];
  check(!br.error && after.braces === card.braces + 1 && after.reactions === card.reactions + 3, `a brace counts (${after.reactions} triggers, ${after.braces} brace)`);
  const trail = await table(`comments?select=before_emotion,after_emotion&post_id=eq.${card.id}`);
  check(Array.isArray(trail) && trail.length === 3, 'the trail records each trigger with before and after');

  say('6. withdrawal');
  await tell(B, '/withdraw');
  check((await lastBot(B)).includes('נמשך'), 'B withdraws the card');
  const gone = await rpc('get_feed', { p_emotion: card.emotion, p_color: card.color, p_limit: 50 }, ip);
  check(!gone.data?.some((p) => p.id === card.id), 'it is no longer on the wall');

  say('7. the door slows down');
  const greedy = visitorIp();
  const tries = [];
  for (let i = 0; i < 4; i++) tries.push(await rpc('create_invite', { p_display_name: `מבקר ${i}`, p_role: 'investor', p_answer: 'amplifier_shapes' }, greedy));
  check(tries.slice(0, 3).every((t) => !t.error), 'three invitations in a row are fine');
  check(/^RATE_LIMITED/.test(tries[3].error?.message || ''), `the fourth waits (${tries[3].error?.message})`);

  console.log(failed ? `\n\x1b[31m${failed} check(s) failed\x1b[0m` : '\n\x1b[32mthe exhibit works end to end\x1b[0m');
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
