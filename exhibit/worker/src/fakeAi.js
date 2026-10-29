/**
 * A stand-in for Workers AI, for the local demo and tests only (AI_MODE=fake).
 * Deterministic and offline. It is honest about being fake: every card it
 * helps make records model "demo-fake" in its provenance.
 *
 * Redaction removes what it can see: the participants' own names, emails,
 * phone numbers, a short list of Israeli place names, and capitalised Latin
 * words. It is far weaker than a real model, which is why it never runs
 * outside the demo. The paraphrase is a template that contains no word from
 * the conversation, so the core's leak check always has something clean to pass.
 */
const MASK = '[מושחר]';
const PLACES = ['תל אביב', 'ירושלים', 'באר שבע', 'רמת גן', 'חיפה', 'אילת', 'נתניה', 'חולון', 'הרצליה', 'עכו', 'צפת', 'טבריה', 'יפו'];
const TEMPLATES = [
  (n) => `זוג החליף ${n} הודעות. המכונה רשמה קרבה זהירה ומרחק שלא נסגר. היא לא יודעת מה נאמר, רק כמה.`,
  (n) => `${n} הודעות עברו בערוץ. המגביר שקל את הקצב ואת השתיקות, והחליט עליהם מצב אחד.`,
  (n) => `שיחה קצרה של ${n} הודעות. מה שנשאר ממנה כאן הוא מה שהאלגוריתם הסיק, לא מה שהיה.`,
  (n) => `בערוץ הפרטי נכתבו ${n} הודעות. על הקיר עולה רק ההחלטה של המערכת לגביהן.`
];

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function makeFakeAi() {
  /** @param {string} text @param {{names?:string[]}} [ctx] */
  async function redact(text, ctx = {}) {
    let out = String(text || '');
    const removed = [];
    const hit = (re) => { out = out.replace(re, (m) => { removed.push(m); return MASK; }); };
    const names = (ctx.names || []).flatMap((n) => [n, ...String(n).split(/\s+/)]).filter((n) => n && n.length >= 2);
    for (const n of [...new Set(names)].sort((a, b) => b.length - a.length)) hit(new RegExp(escape(n), 'g'));
    hit(/[\w.+-]+@[\w-]+\.[\w.]+/g);
    hit(/\+?\d[\d\s-]{6,}\d/g);
    for (const p of PLACES) hit(new RegExp(escape(p), 'g'));
    hit(/\b[A-Z][a-z]{2,}\b/g);
    return { text: out, removed, confirmed: true };
  }

  async function paraphrase(redactedText) {
    const n = String(redactedText || '').split('\n').filter((l) => l.trim()).length;
    return TEMPLATES[n % TEMPLATES.length](n);
  }

  async function render() { return null; }

  return { redact, paraphrase, render, textModel: 'demo-fake', imageModel: 'none' };
}
