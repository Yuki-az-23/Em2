/**
 * The simulator: two people in Telegram, without Telegram. Each pane is a chat
 * with the real Hermes worker through the local demo hub. Nothing here is
 * faked except the messenger: consent, relay, pseudonyms and the card on the
 * wall all go through the same code and database as in production.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Button } from '../../components';
import { getChat, say, startCode } from '../../services/demo/simService';
import './Lab.css';

function baseId() {
  try {
    const kept = Number(sessionStorage.getItem('lab-base'));
    if (kept) return kept;
    const fresh = 100000 + Math.floor(Math.random() * 800000) * 2;
    sessionStorage.setItem('lab-base', String(fresh));
    return fresh;
  } catch {
    return 100000 + Math.floor(Math.random() * 800000) * 2;
  }
}

const Pane = ({ title, chatId, messages, onSend, onHandOver, testid }) => {
  const [text, setText] = useState('');
  const list = useRef(null);
  useEffect(() => { if (list.current) list.current.scrollTop = list.current.scrollHeight; }, [messages.length]);
  const submit = (e) => {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    setText('');
    onSend(t);
  };
  return (
    <section className="lab-pane" data-testid={testid} aria-label={title}>
      <header className="lab-pane__head">
        <h2 className="lab-pane__title">{title}</h2>
        <span className="lab-pane__id" dir="ltr">chat {chatId}</span>
      </header>
      <ol className="lab-pane__list" ref={list}>
        {messages.length === 0 && <li className="lab-pane__empty">עוד לא נכתב כלום.</li>}
        {messages.map((m, i) => {
          const code = m.from === 'bot' ? startCode(m.text) : null;
          return (
            <li key={i} className={`lab-msg lab-msg--${m.from}`}>
              <span className="lab-msg__text" dir="auto">{m.text}</span>
              {code && onHandOver && (
                <Button type="button" variant="secondary" size="sm" onClick={() => onHandOver(code)} data-testid="hand-over">
                  פתח את הקישור כאדם השני
                </Button>
              )}
            </li>
          );
        })}
      </ol>
      <form className="lab-pane__form" onSubmit={submit}>
        <label className="sr-only" htmlFor={`say-${chatId}`}>הודעה מ{title}</label>
        <input id={`say-${chatId}`} className="lab-pane__input" value={text} onChange={(e) => setText(e.target.value)}
          placeholder="כתוב לבוט, או /end, /withdraw, /invite" autoComplete="off" dir="auto" data-testid={`${testid}-input`} />
        <Button type="submit" variant="primary">שלח</Button>
      </form>
    </section>
  );
};

export const Lab = () => {
  const [params] = useSearchParams();
  const [base, setBase] = useState(baseId);
  const A = base;
  const B = base + 1;
  const [chats, setChats] = useState({ [A]: [], [B]: [] });
  const [error, setError] = useState('');
  const started = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const [a, b] = await Promise.all([getChat(A), getChat(B)]);
      setChats({ [A]: a, [B]: b });
      setError('');
    } catch {
      setError('אין חיבור למרכז הדמו. האם npm run demo רץ?');
    }
  }, [A, B]);

  const send = useCallback(async (chatId, text) => {
    try { await say(chatId, text); } catch { setError('ההודעה לא נשלחה.'); }
    refresh();
  }, [refresh]);

  useEffect(() => {
    const code = params.get('start');
    const key = `lab-started-${code}`;
    let done = false;
    try { done = sessionStorage.getItem(key) === '1'; } catch { /* storage blocked */ }
    if (code && !started.current && !done) {
      started.current = true;
      try { sessionStorage.setItem(key, '1'); } catch { /* storage blocked */ }
      send(A, `/start ${code}`);
    }
  }, [params, A, send]);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 1000);
    return () => clearInterval(t);
  }, [refresh]);

  const restart = () => {
    try { sessionStorage.removeItem('lab-base'); } catch { /* storage blocked */ }
    setBase(baseId());
  };

  return (
    <main className="lab">
      <header className="lab__head">
        <div>
          <h1 className="lab__title">הסימולטור</h1>
          <p className="lab__sub">
            שני אנשים בטלגרם, בלי טלגרם. מה שנכתב כאן עובר דרך הרמס האמיתי, נשמר במסד, ובסוף השיחה עולה לקיר כמו שהמגביר החליט.
            המודל כאן מדומה: הוא משחיר שמות פשוטים ומסכם בתבנית.
          </p>
        </div>
        <div className="lab__tools">
          <Link className="lab__wall" to="/wall">לקיר</Link>
          <Button type="button" variant="ghost" onClick={restart}>זוג חדש</Button>
        </div>
      </header>
      {!params.get('start') && chats[A].length === 0 && (
        <p className="lab__hint">כדי להתחיל, צור קישור בדלת וחזור לכאן דרך &quot;פתח בסימולטור&quot;, או כתוב לבוט <code dir="ltr">/start</code> עם קוד.</p>
      )}
      {error && <p className="lab__error" role="alert">{error}</p>}
      <div className="lab__panes">
        <Pane title="אדם א׳" chatId={A} messages={chats[A] || []} testid="pane-a"
          onSend={(t) => send(A, t)} onHandOver={(code) => send(B, `/start ${code}`)} />
        <Pane title="אדם ב׳" chatId={B} messages={chats[B] || []} testid="pane-b"
          onSend={(t) => send(B, t)} onHandOver={(code) => send(A, `/start ${code}`)} />
      </div>
    </main>
  );
};

export default Lab;
