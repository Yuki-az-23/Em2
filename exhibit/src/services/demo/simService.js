/**
 * The local demo's Telegram simulator. Talks to the demo hub (exhibit/demo/hub.mjs),
 * which turns what a pane types into a Telegram update for the real Hermes worker
 * and collects the bot's replies. Present only when VITE_DEMO_HUB is set.
 */
const hub = () => String(import.meta.env.VITE_DEMO_HUB || '').replace(/\/$/, '');

export const isDemo = () => hub() !== '';

export async function getChat(chatId) {
  const r = await fetch(`${hub()}/demo/chats/${chatId}`);
  if (!r.ok) throw new Error(`hub ${r.status}`);
  return (await r.json()).messages;
}

export async function say(chatId, text) {
  const r = await fetch(`${hub()}/demo/chats/${chatId}/say`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text })
  });
  if (!r.ok) throw new Error(`hub ${r.status}`);
}

/** The deep-link code in a bot message, if it carries one. */
export function startCode(text) {
  const m = /t\.me\/[A-Za-z0-9_]+\?start=([A-Za-z0-9_-]{8,64})/.exec(String(text || ''));
  return m ? m[1] : null;
}
