/**
 * The door. One question, one name, one link.
 * A participant leaves with a Telegram link: their conversations are the material.
 * An investor leaves for the wall: they keep it alive by moving what is there.
 */
import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Button, Input } from '../../components';
import { createInvite, peekInvite, joinUrl, ANSWERS, ROLES } from '../../services/invite/inviteService';
import { isDemo } from '../../services/demo/simService';
import './Invite.css';

const QUESTION = 'האם אתה בוטח באות שלך לעולם, או שהמגביר של האות שלך משנן ומעצב אותך לדמות שהוא רוצה?';

const ROLE_LABEL = { [ROLES.PARTICIPANT]: 'אני חלק מהמיצג', [ROLES.INVESTOR]: 'אני משקיע במיצג' };
const ROLE_HINT = {
  [ROLES.PARTICIPANT]: 'השיחות שלי הן החומר. מה שאגיד בטלגרם יעבור את המגביר ויעלה על הקיר.',
  [ROLES.INVESTOR]: 'אני מגיע לקיר כדי להזיז. בלי מי שדוחף ומחבק, הקיר מת.'
};
const ANSWER_LABEL = { [ANSWERS.TRUST]: 'אני בוטח באות שלי', [ANSWERS.SHAPED]: 'המגביר מעצב אותי' };

export const Invite = () => {
  const { code: joinCode } = useParams();
  const [name, setName] = useState('');
  const [role, setRole] = useState(ROLES.PARTICIPANT);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [copied, setCopied] = useState(false);
  const [joining, setJoining] = useState(null);

  useEffect(() => {
    let alive = true;
    if (joinCode) peekInvite(joinCode).then((inv) => { if (alive) setJoining(inv || { missing: true }); });
    return () => { alive = false; };
  }, [joinCode]);

  const answer = async (choice) => {
    setError('');
    if (!name.trim()) { setError('כדי לעבור את הדלת צריך שם. כל שם.'); return; }
    setBusy(true);
    const r = await createInvite({ displayName: name, role, answer: choice });
    setBusy(false);
    if (r.error) {
      setError(r.error.code === 'RATE_LIMITED'
        ? `הדלת סגורה לרגע. נסה שוב בעוד ${r.error.retryAfter ?? 60} שניות.`
        : r.error.code === 'STORAGE_UNAVAILABLE' ? 'הקיר נח. השרת לא עונה כרגע, נסה שוב מאוחר יותר.' : r.error.message);
      return;
    }
    setResult({ ...r, answer: choice, role, typedName: name.trim() });
  };

  const copy = async (text) => {
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch { const el = document.getElementById('invite-url'); if (el) { el.focus(); el.select(); } }
  };

  return (
    <main className="invite" dir="rtl">
      <div className="invite-inner">
        <p className="invite-eyebrow">הרמס · תערוכה דיגיטלית</p>

        {joining && !joining.missing && (
          <p className="invite-joining"><b>{joining.fromHandle}</b> השאיר לך כאן משהו. כדי לקבל אותו צריך לעבור את אותה דלת, ואז לפתוח את הקישור בטלגרם.</p>
        )}
        {joining && joining.missing && (
          <p className="invite-joining invite-joining--missing">הקישור הזה פג, נוצל, או לא קיים. אפשר להיכנס בכל זאת.</p>
        )}

        <h1 className="invite-question">{QUESTION}</h1>

        <section className="invite-terms" aria-label="תנאי הכניסה">
          <p>כל מה שתגיד כאן מוצפן בדרך אלינו. <b>אנחנו קוראים.</b></p>
          <p>נפרסם על הקיר מה שהאלגוריתם שלנו חושב על מה שאמרת, בכינוי שניתן לך, וזרים יוכלו להזיז את זה.</p>
          <p>לא נפרסם את המילים ולא את שמך. אפשר למשוך כרטיס מהקיר תוך 24 שעות. הכניסה מגיל 18.</p>
        </section>

        {!result ? (
          <form className="invite-form" onSubmit={(e) => e.preventDefault()}>
            <fieldset className="invite-roles">
              <legend>מי אתה כאן</legend>
              {Object.values(ROLES).map((r) => (
                <label key={r} className={`invite-role${role === r ? ' invite-role--on' : ''}`}>
                  <input type="radio" name="role" id={`role-${r}`} value={r} checked={role === r} onChange={() => setRole(r)} />
                  <span className="invite-role-title">{ROLE_LABEL[r]}</span>
                  <span className="invite-role-hint">{ROLE_HINT[r]}</span>
                </label>
              ))}
            </fieldset>
            <Input id="invite-name" label="איך לקרוא לך" placeholder="שם, כינוי, כל דבר" value={name}
              onChange={(e) => setName(e.target.value)} error={error} required disabled={busy} />
            <p className="invite-hint">תענה על השאלה כדי להיכנס. שתי התשובות פותחות את אותה דלת.</p>
            <div className="invite-answers">
              <Button type="button" variant="outline" size="lg" fullWidth loading={busy} onClick={() => answer(ANSWERS.TRUST)}>{ANSWER_LABEL[ANSWERS.TRUST]}</Button>
              <Button type="button" variant="primary" size="lg" fullWidth loading={busy} onClick={() => answer(ANSWERS.SHAPED)}>{ANSWER_LABEL[ANSWERS.SHAPED]}</Button>
            </div>
          </form>
        ) : (
          <section className="invite-result" aria-live="polite">
            <p className="invite-recorded">
              רשמנו: <b>{ROLE_LABEL[result.role]}</b>, <b>{ANSWER_LABEL[result.answer]}</b>. אלה שני הדברים הראשונים שהמערכת יודעת עליך.
            </p>
            <p className="invite-renamed">
              קראת לעצמך <s>{result.typedName}</s>. מעכשיו קוראים לך <b className="invite-pseudonym">{result.handle}</b>. השם שהקלדת לא יופיע בשום מקום.
            </p>

            {result.role === ROLES.PARTICIPANT ? (
              <>
                <p className="invite-link-label">הכניסה שלך היא בטלגרם. שם תקבל את הכינוי, תאשר את התנאים, ותוכל להזמין אדם אחד לשיחה.</p>
                {isDemo() && (
                  <Link className="invite-telegram" to={`/lab?start=${result.code}`} data-testid="simulator-link">פתח בסימולטור</Link>
                )}
                <a className="invite-telegram" href={result.telegramLink} target="_blank" rel="noreferrer noopener" data-testid="telegram-link">פתח בטלגרם</a>
                <div className="invite-link">
                  <input id="invite-url" className="invite-url" readOnly value={result.telegramLink} dir="ltr" />
                  <Button type="button" variant="secondary" onClick={() => copy(result.telegramLink)}>{copied ? 'הועתק' : 'העתק'}</Button>
                </div>
                <p className="invite-expires">הקישור תקף שבעה ימים ולפעם אחת. אחרי זה הדלת נסגרת.</p>
              </>
            ) : (
              <>
                <p className="invite-link-label">הקיר פתוח. תצהיר שם על הרגש והצבע שלך, ותראה מה שהמסנן בחר עבורך.</p>
                <Link className="invite-telegram" to="/wall" data-testid="wall-link">היכנס לקיר</Link>
                <p className="invite-expires">אם תרצה להזמין מישהו לשיחה, הקישור הזה מוביל לאותה דלת: <code dir="ltr">{joinUrl(result.code)}</code></p>
              </>
            )}
          </section>
        )}
      </div>
    </main>
  );
};

export default Invite;
