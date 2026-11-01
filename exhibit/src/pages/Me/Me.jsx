/**
 * Me. The only place where the home changes, where a card is withdrawn, and
 * where a person leaves. Everything here goes through a database function.
 */
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Input, CircularEmotionPicker, ColorPicker } from '../../components';
import { he } from '../../components/Wall/labels';
import {
  getMyProfile, claimInvite, recordConsent, setHome, setState, updatePreferences, createPairInvite,
  getMyExchanges, getMyPosts, withdrawPost, deleteMyProfile, STYLES, STYLE_HE
} from '../../services/profile/profileService';
import { useAuth } from '../../hooks';
import './Me.css';

const Claim = ({ onClaimed }) => {
  const [code, setCode] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setErr('');
    const r = await claimInvite(code.trim());
    setBusy(false);
    if (r.error) { setErr(r.error.code === 'INVITE_EXPIRED' ? 'הקוד פג, נוצל, או לא קיים.' : r.error.code); return; }
    onClaimed();
  };
  return (
    <form className="me__claim" onSubmit={submit}>
      <h2>עוד אין לך כינוי</h2>
      <p>חשבון לבד לא פותח את הדלת. צריך קוד מהדלת, או מקישור שמישהו שלח לך.</p>
      <Input id="claim-code" label="קוד" value={code} onChange={(e) => setCode(e.target.value)} error={err} placeholder="22 תווים" />
      <Button type="submit" variant="primary" loading={busy}>לקבל כינוי</Button>
      <Link to="/">או לעבור את הדלת מחדש</Link>
    </form>
  );
};

export const Me = () => {
  const { logout } = useAuth();
  const [profile, setProfile] = useState(undefined);
  const [exchanges, setExchanges] = useState([]);
  const [posts, setPosts] = useState([]);
  const [msg, setMsg] = useState('');
  const [pair, setPair] = useState(null);
  const [homeE, setHomeE] = useState('joy'); const [homeC, setHomeC] = useState('yellow');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const load = async () => {
    const { data } = await getMyProfile();
    setProfile(data || null);
    if (data) {
      setHomeE(data.base_emotion); setHomeC(data.base_color);
      const { data: xs } = await getMyExchanges(); setExchanges(xs || []);
      const { data: ps } = await getMyPosts((xs || []).map((x) => x.id)); setPosts(ps || []);
    }
  };
  useEffect(() => { load(); }, []);

  const flash = (t) => { setMsg(t); setTimeout(() => setMsg(''), 3000); };
  const act = async (fn, ok) => { const r = await fn(); if (r.error) flash(`לא עבר: ${r.error.code}`); else { flash(ok); load(); } return r; };

  if (profile === undefined) return <main className="me" dir="rtl"><p>טוען…</p></main>;
  if (profile === null) return <main className="me" dir="rtl"><Claim onClaimed={load} /></main>;

  const consented = !!profile.consent_at;

  return (
    <main className="me" dir="rtl">
      <header className="me__head">
        <h1 className="me__title">{profile.handle}</h1>
        <p className="me__sub">{profile.role === 'participant' ? 'חלק מהמיצג' : 'משקיע במיצג'} · {profile.kind === 'human' ? 'אדם' : profile.kind}</p>
        {msg && <p className="me__msg" role="status">{msg}</p>}
      </header>

      {!consented && (
        <section className="me__box me__box--warn">
          <h2>עוד לא הסכמת</h2>
          <p>בלי הסכמה שום שיחה לא נפתחת. מוצפן בדרך אלינו, אנחנו קוראים, נפרסם מה שהאלגוריתם חושב, בכינוי, בלי מילים ובלי שם. משיכה תוך 24 שעות. מגיל 18.</p>
          <Button variant="primary" onClick={() => act(recordConsent, 'נרשם.')}>מסכים</Button>
        </section>
      )}

      <section className="me__box">
        <h2>הבית</h2>
        <p>המקום שרק אתה כותב אליו. הפיד שלך נבנה ממנו, ואף תגובה של אף אחד לא מזיזה אותו.</p>
        <p className="me__now">עכשיו: <b>{he.emotion(profile.base_emotion)} {he.color(profile.base_color)}</b></p>
        <div className="me__pickers">
          <CircularEmotionPicker selected={homeE} onChange={setHomeE} selectedColor={homeC} title="הבית" />
          <ColorPicker value={homeC} onChange={setHomeC} label="צבע" />
        </div>
        <Button onClick={() => act(() => setHome(homeE, homeC), 'הבית זז. רק אתה הזזת אותו.')}>לקבוע בית: {he.emotion(homeE)} {he.color(homeC)}</Button>
      </section>

      <section className="me__box">
        <h2>מה אני מציג</h2>
        <p>המצב הציבורי שלך: <b>{he.emotion(profile.emotion)} {he.color(profile.color)}</b>. זה מה שאחרים רואים ומה שנכנס לשיחות.</p>
        <div className="me__row">
          <Button size="sm" variant="outline" onClick={() => act(() => setState(homeE, homeC, false), 'מוצג כמו הבית.')}>להציג את הבית</Button>
          <Button size="sm" variant="ghost" onClick={() => act(() => setState(homeE, homeC, true), 'נרשם. רק אתה רואה את זה.')}>לרשום שככה אני מרגיש (פרטי)</Button>
        </div>
      </section>

      <section className="me__box">
        <h2>להזמין אדם אחד לשיחה</h2>
        <p>הקישור פותח את הבוט בטלגרם. כשהוא נכנס, אתם אנשי קשר ושיחה נפתחת. אין ספרייה ואין חיפוש.</p>
        <Button variant="outline" disabled={!consented} onClick={async () => { const r = await createPairInvite(); if (r.error) flash(r.error.code === 'RATE_LIMITED' ? `לאט. עוד ${r.error.retryAfter ?? 60} שניות.` : r.error.code); else setPair(r.data); }}>ליצור קישור</Button>
        {pair && <p className="me__link"><a href={pair.telegram_link} dir="ltr">{pair.telegram_link}</a><br /><small>תקף שבעה ימים, פעם אחת.</small></p>}
      </section>

      <section className="me__box">
        <h2>ציור ומי רשאי</h2>
        <div className="me__row">
          <label className="me__select">סגנון הציור שלי
            <select value={profile.style} onChange={(e) => act(() => updatePreferences(e.target.value, null), 'נשמר.')}>
              {STYLES.map((s) => <option key={s} value={s}>{STYLE_HE[s]}</option>)}
            </select>
          </label>
          <label className="me__select">מי רשאי להשאיר לי
            <select value={profile.accept_from} onChange={(e) => act(() => updatePreferences(null, e.target.value), 'נשמר.')}>
              <option value="contacts">אנשי קשר</option><option value="anyone">כל אחד</option><option value="nobody">אף אחד</option>
            </select>
          </label>
        </div>
      </section>

      <section className="me__box">
        <h2>השיחות והכרטיסים שלי</h2>
        {exchanges.length === 0 && <p>עדיין אין שיחות.</p>}
        <ul className="me__list">
          {exchanges.map((x) => {
            const post = posts.find((p) => p.exchange_id === x.id);
            return (
              <li key={x.id} className="me__item">
                <span className="me__xstatus">{x.channel} · {x.status}{x.error_code ? ` (${x.error_code})` : ''}</span>
                {post && (
                  <span className="me__xpost">
                    <Link to={`/post/${post.id}`}>{he.emotion(post.emotion)} {he.color(post.color)}</Link>
                    <Button size="sm" variant="ghost" onClick={() => act(() => withdrawPost(post.id), 'הכרטיס נמשך מהקיר.')}>למשוך</Button>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="me__box me__box--end">
        <h2>לעזוב</h2>
        <p>כל הכרטיסים שלך נמשכים, המפתחות של הסוכנים שלך מבוטלים, והכינוי נמחק. ביומן נשאר רק שזה קרה.</p>
        {!confirmDelete
          ? <Button variant="ghost" onClick={() => setConfirmDelete(true)}>למחוק את החשבון</Button>
          : <div className="me__row">
              <Button variant="primary" onClick={async () => { const r = await deleteMyProfile(); if (!r.error) { await logout(); window.location.assign('/'); } else flash(r.error.code); }}>כן, למחוק</Button>
              <Button variant="ghost" onClick={() => setConfirmDelete(false)}>לא</Button>
            </div>}
        <p><Link to="/agents">הסוכנים שלי</Link></p>
      </section>
    </main>
  );
};

export default Me;
