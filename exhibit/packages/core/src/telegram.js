/**
 * Telegram helpers with no network: parse an update, build a deep link, the
 * consent text. The Worker owns the HTTP side.
 */

export const DEEP_LINK_CODE = /^[A-Za-z0-9_-]{1,64}$/;

export function deepLink(botName, code) {
  if (!DEEP_LINK_CODE.test(code)) throw new Error('INVALID_CODE');
  return `https://t.me/${botName}?start=${code}`;
}

/**
 * @returns {{kind:'start', code:string|null}|{kind:'command', name:string, arg:string}|{kind:'text', text:string}|{kind:'other'}}
 * plus `chatId`, `userId`, `messageId` when present.
 */
export function parseUpdate(update) {
  const msg = update && (update.message || update.edited_message);
  if (!msg || !msg.chat || !msg.from) return { kind: 'other' };
  const base = { chatId: msg.chat.id, userId: msg.from.id, messageId: msg.message_id, isPrivate: msg.chat.type === 'private' };
  const text = typeof msg.text === 'string' ? msg.text.trim() : '';
  if (!text) return { ...base, kind: 'other' };
  if (text.startsWith('/')) {
    const [cmd, ...rest] = text.split(/\s+/);
    const name = cmd.slice(1).split('@')[0].toLowerCase();
    const arg = rest.join(' ');
    if (name === 'start') return { ...base, kind: 'start', code: DEEP_LINK_CODE.test(arg) ? arg : null };
    return { ...base, kind: 'command', name, arg };
  }
  return { ...base, kind: 'text', text: text.slice(0, 4096) };
}

/** Constant-time-ish comparison for the webhook secret header. */
export function secretMatches(given, expected) {
  if (typeof given !== 'string' || typeof expected !== 'string' || given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < given.length; i++) diff |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

export function consentText(handle, version) {
  return [
    `מעכשיו קוראים לך ${handle}. השם שהקלדת לא יופיע בשום מקום.`,
    '',
    'לפני שממשיכים, זה מה שקורה כאן:',
    'כל מה שתכתוב מוצפן בדרך אלינו. אנחנו קוראים.',
    'נפרסם על הקיר מה שהאלגוריתם שלנו חושב על השיחה, בכינוי שלך, וזרים יוכלו להזיז את זה.',
    'לא נפרסם את המילים ולא את שמך. אפשר למשוך כרטיס מהקיר תוך 24 שעות עם /withdraw.',
    'הכניסה מגיל 18.',
    '',
    `כדי להסכים (גרסה ${version}), כתוב: מסכים`,
    'כדי לעצור בכל שלב: /stop'
  ].join('\n');
}

export const CONSENT_WORDS = Object.freeze(['מסכים', 'מסכימה', 'agree', 'yes', 'כן']);
export function isConsent(text) {
  return CONSENT_WORDS.includes(String(text || '').trim().toLowerCase());
}
