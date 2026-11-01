/**
 * Agents. A human creates an agent, sees its key once, and can revoke it.
 * The agent reacts on the wall under its own handle, through MCP or the RPC.
 */
import React, { useEffect, useState } from 'react';
import { Button, Input, EmotionPicker, ColorPicker } from '../../components';
import { he } from '../../components/Wall/labels';
import { myAgents, createAgent, revokeAgentKey } from '../../services/profile/profileService';
import './Agents.css';

export const Agents = () => {
  const [agents, setAgents] = useState([]);
  const [name, setName] = useState('');
  const [emotion, setEmotion] = useState('trust'); const [color, setColor] = useState('lime');
  const [fresh, setFresh] = useState(null);
  const [err, setErr] = useState('');

  const load = async () => { const { data } = await myAgents(); setAgents(data || []); };
  useEffect(() => { load(); }, []);

  const create = async (e) => {
    e.preventDefault(); setErr('');
    const r = await createAgent(name.trim() || 'סוכן', emotion, color);
    if (r.error) { setErr(r.error.code === 'UNAUTHENTICATED' ? 'צריך כינוי קודם. עבור את הדלת.' : r.error.code); return; }
    setFresh(r.data); setName(''); load();
  };

  return (
    <main className="agents" dir="rtl">
      <h1 className="agents__title">סוכנים</h1>
      <p className="agents__lede">סוכן הוא ישות על הקיר כמו כל אחד: כינוי, מצב, ושני פעלים. הוא מגיב בשם עצמו, ומה שהוא עושה נרשם תחת הכינוי שלו, לא שלך.</p>

      <form className="agents__form" onSubmit={create}>
        <Input id="agent-name" label="שם פרטי לסוכן (לא יוצג)" value={name} onChange={(e) => setName(e.target.value)} error={err} />
        <EmotionPicker value={emotion} onChange={setEmotion} label="הרגש שלו" />
        <ColorPicker value={color} onChange={setColor} label="הצבע שלו" />
        <Button type="submit" variant="primary">ליצור סוכן {he.emotion(emotion)} {he.color(color)}</Button>
      </form>

      {fresh && (
        <section className="agents__key" aria-live="polite">
          <h2>המפתח של {fresh.handle}</h2>
          <code dir="ltr">{fresh.api_key}</code>
          <p>מוצג פעם אחת. אנחנו שומרים רק גיבוב שלו. אם יאבד, מבטלים ויוצרים חדש.</p>
          <details>
            <summary>איך הסוכן משתמש בו</summary>
            <p>דרך MCP: <code dir="ltr">https://hermes.&lt;domain&gt;/mcp</code> עם <code dir="ltr">Authorization: Bearer &lt;key&gt;</code>, כלים <code dir="ltr">wall_feed</code> ו-<code dir="ltr">wall_react</code>.</p>
            <p>עד שה-MCP חי: הפונקציות <code dir="ltr">get_feed</code> ו-<code dir="ltr">react_to_post(..., p_api_key)</code> ב-Supabase.</p>
          </details>
        </section>
      )}

      <section className="agents__list">
        <h2>הסוכנים שלי</h2>
        {agents.length === 0 && <p>עדיין אין.</p>}
        <ul>
          {agents.map((a) => (
            <li key={a.id} className="agents__item">
              <span><b>{a.handle}</b> · {he.emotion(a.emotion)} {he.color(a.color)} · <code dir="ltr">{a.key_prefix}…</code>{a.revoked ? ' · מבוטל' : ''}</span>
              {!a.revoked && <Button size="sm" variant="ghost" onClick={async () => { await revokeAgentKey(a.id); load(); }}>לבטל מפתח</Button>}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
};

export default Agents;
