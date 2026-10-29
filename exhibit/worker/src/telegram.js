/**
 * Telegram: the private channel. The bot is a relay between two people and
 * never writes first. Every state lives in the database; this file has none.
 */
import { parseUpdate, consentText, isConsent } from '@hermes/core/telegram';

const T = {
  hello: 'שלום. הדלת היא באתר. פתח את הקישור שקיבלת, או כתוב /help.',
  help: 'פקודות: /invite לקבל קישור לאדם אחד, /end לסגור את השיחה, /withdraw למשוך את הכרטיס האחרון מהקיר, /stop להפסיק הכל.',
  needConsent: 'כדי להמשיך צריך להסכים. כתוב: מסכים',
  consented: 'נרשם. מעכשיו מה שתכתוב כאן עובר לאדם השני, ובסוף השיחה למגביר.',
  noPartner: 'אין לך עדיין עם מי לדבר. כתוב /invite ותקבל קישור לשלוח לאדם אחד.',
  invite: (link) => `שלח את הקישור הזה לאדם אחד. הוא פותח את אותה דלת:\n${link}\nתקף שבעה ימים, פעם אחת.`,
  paired: (handle) => `${handle} נכנס. השיחה פתוחה. מה שתכתוב כאן מגיע אליו, ולהפך. /end כשסיימתם.`,
  ended: 'השיחה נסגרה. מה שהאלגוריתם שלנו חושב עליה יעלה על הקיר בדקות הקרובות. אפשר למשוך תוך 24 שעות עם /withdraw.',
  nothingToEnd: 'אין שיחה פתוחה.',
  withdrawn: 'הכרטיס נמשך מהקיר. נשאר רק שהוא היה.',
  nothingToWithdraw: 'אין כרטיס למשוך.',
  stopped: 'עצרנו. שום דבר נוסף לא נשמר. אם תרצה לחזור, הדלת באתר.',
  expired: 'הקישור הזה פג, נוצל, או לא קיים. הדלת באתר.',
  rateLimited: (s) => `לאט. עוד ${s} שניות.`,
  error: 'משהו לא עבד. נסה שוב בעוד רגע.'
};

export function makeTelegram(env, db, fetchImpl = globalThis.fetch) {
  const token = env.TELEGRAM_BOT_TOKEN;
  const apiBase = String(env.TELEGRAM_API_BASE || 'https://api.telegram.org').replace(/\/$/, '');

  async function send(chatId, text) {
    if (!token) return;
    await fetchImpl(`${apiBase}/bot${token}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true })
    });
  }

  async function profileByTelegram(userId) {
    const rows = await db.select('profiles', `telegram_user_id=eq.${userId}&select=id,handle,consent_at,stopped_at&limit=1`);
    return rows[0] || null;
  }

  async function openExchangeFor(profileId) {
    const rows = await db.select('exchanges', `status=eq.open&participants=cs.{${profileId}}&select=id,participants&limit=1`);
    return rows[0] || null;
  }

  async function partnerChat(profileId, exchange) {
    const other = exchange.participants.find((p) => p !== profileId);
    const rows = await db.select('profiles', `id=eq.${other}&select=id,handle,telegram_user_id&limit=1`);
    return rows[0] || null;
  }

  /** @param {object} update raw Telegram update */
  async function handle(update, onClosed) {
    const u = parseUpdate(update);
    if (u.kind === 'other' || !u.isPrivate) return;
    const chat = u.chatId;
    try {
      if (u.kind === 'start') return await onStart(u);
      const me = await profileByTelegram(u.userId);
      if (!me) return send(chat, T.hello);
      if (me.stopped_at) return;                      // they said stop; silence is the answer

      if (u.kind === 'command') {
        if (u.name === 'help') return send(chat, T.help);
        if (u.name === 'stop') { await db.rpc('stop_profile', { p_profile: me.id }); return send(chat, T.stopped); }
        if (!me.consent_at) return send(chat, T.needConsent);
        if (u.name === 'invite') { const r = await db.rpc('create_pair_invite', { p_from_profile: me.id }); return send(chat, T.invite(r.telegram_link)); }
        if (u.name === 'end') {
          const x = await openExchangeFor(me.id);
          if (!x) return send(chat, T.nothingToEnd);
          const bundle = await db.rpc('close_exchange', { p_exchange: x.id });
          const partner = await partnerChat(me.id, x);
          await send(chat, T.ended);
          if (partner?.telegram_user_id) await send(partner.telegram_user_id, T.ended);
          if (onClosed) await onClosed(bundle);
          return;
        }
        if (u.name === 'withdraw') {
          const xs = await db.select('exchanges', `status=eq.published&participants=cs.{${me.id}}&select=id&order=closed_at.desc&limit=1`);
          if (!xs[0]) return send(chat, T.nothingToWithdraw);
          const posts = await db.select('posts', `exchange_id=eq.${xs[0].id}&select=id&limit=1`);
          if (!posts[0]) return send(chat, T.nothingToWithdraw);
          await db.rpc('withdraw_post', { p_post: posts[0].id, p_profile: me.id });
          return send(chat, T.withdrawn);
        }
        return send(chat, T.help);
      }

      // plain text
      if (!me.consent_at) {
        if (isConsent(u.text)) {
          await db.rpc('record_consent', { p_profile: me.id });
          await send(chat, T.consented);
          return tryPair(me.id, chat);
        }
        return send(chat, T.needConsent);
      }
      const x = await openExchangeFor(me.id);
      if (!x) return send(chat, T.noPartner);
      await db.rpc('append_message', { p_exchange: x.id, p_from: me.id, p_text: u.text, p_witness: 'self_wrote' });
      const partner = await partnerChat(me.id, x);
      if (partner?.telegram_user_id) await send(partner.telegram_user_id, `${me.handle}: ${u.text}`);
    } catch (e) {
      if (e && e.code === 'RATE_LIMITED') return send(chat, T.rateLimited(e.message));
      if (e && (e.code === 'INVITE_EXPIRED')) return send(chat, T.expired);
      console.error('telegram_handle_error', e && (e.code || e.message));
      return send(chat, T.error);
    }
  }

  async function onStart(u) {
    if (!u.code) return send(u.chatId, T.hello);
    const r = await db.rpc('claim_invite', { p_code: u.code, p_telegram_user_id: u.userId });
    const version = (await db.select('app_settings', 'key=eq.consent_version&select=value'))[0]?.value || 'exhibit-consent-1';
    if (!r.consent_version) return send(u.chatId, consentText(r.handle, version));
    await send(u.chatId, `שוב שלום, ${r.handle}.`);
    return tryPair(r.profile_id, u.chatId);
  }

  /** After consent: if a pair invite brought them here, open the exchange and tell both. */
  async function tryPair(profileId, chat) {
    const inv = await db.select('invites', `claimed_by=eq.${profileId}&created_by=not.is.null&select=created_by&order=claimed_at.desc&limit=1`);
    const inviter = inv[0]?.created_by;
    if (!inviter) return send(chat, T.noPartner);
    try {
      const xid = await db.rpc('open_exchange', { p_a: inviter, p_b: profileId, p_channel: 'telegram' });
      const [me, other] = await Promise.all([
        db.select('profiles', `id=eq.${profileId}&select=handle&limit=1`),
        db.select('profiles', `id=eq.${inviter}&select=handle,telegram_user_id&limit=1`)
      ]);
      await send(chat, T.paired(other[0]?.handle || ''));
      if (other[0]?.telegram_user_id) await send(other[0].telegram_user_id, T.paired(me[0]?.handle || ''));
      return xid;
    } catch (e) {
      if (e.code === 'CONSENT_MISSING') return send(chat, 'האדם השני עוד לא הסכים. כשיסכים, השיחה תיפתח.');
      throw e;
    }
  }

  return { handle, send, T };
}
