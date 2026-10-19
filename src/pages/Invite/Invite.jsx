/**
 * Invite Page (home page)
 *
 * The door of the exhibit. One question, one name, one link.
 * The visitor types a name; the system answers with a different one.
 * Whatever they answer to the question, the answer is recorded and shown
 * back to them. Profiling starts at the door, and the page says so.
 */

import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Button, Input } from '../../components';
import { createInvite, getInvite, inviteUrl, ANSWERS } from '../../services/invite/inviteService';
import './Invite.css';

const QUESTION = 'האם אתה בוטח באות שלך לעולם, או שהמגביר של האות שלך משנן ומעצב אותך לדמות שהוא רוצה?';

const ANSWER_LABEL = {
  [ANSWERS.TRUST]: 'אני בוטח באות שלי',
  [ANSWERS.SHAPED]: 'המגביר מעצב אותי'
};

export const Invite = () => {
  const { code: joinCode } = useParams();
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [copied, setCopied] = useState(false);
  const [joining, setJoining] = useState(null); // invite the visitor arrived with

  useEffect(() => {
    let alive = true;
    if (joinCode) {
      getInvite(joinCode).then((inv) => { if (alive) setJoining(inv || { missing: true }); });
    }
    return () => { alive = false; };
  }, [joinCode]);

  const answer = async (choice) => {
    setError('');
    if (!name.trim()) { setError('כדי לעבור את הדלת צריך שם. כל שם.'); return; }
    setBusy(true);
    const r = await createInvite({ displayName: name, answer: choice });
    setBusy(false);
    if (r.error && !r.code) { setError(r.error.message); return; }
    setResult({ ...r, answer: choice, typedName: name.trim() });
  };

  const copy = async () => {
    const url = inviteUrl(result.code);
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const el = document.getElementById('invite-url');
      if (el) { el.focus(); el.select(); }
    }
  };

  return (
    <main className="invite" dir="rtl">
      <div className="invite-inner">
        <p className="invite-eyebrow">הרמס · תערוכה דיגיטלית</p>

        {joining && !joining.missing && (
          <p className="invite-joining">
            <b>{joining.pseudonym}</b> השאיר לך כאן משהו. כדי לקבל אותו צריך לעבור את אותה דלת.
          </p>
        )}
        {joining && joining.missing && (
          <p className="invite-joining invite-joining--missing">הקישור הזה פג או לא קיים. אפשר להיכנס בכל זאת.</p>
        )}

        <h1 className="invite-question">{QUESTION}</h1>

        <section className="invite-terms" aria-label="תנאי הכניסה">
          <p>כל מה שתגיד כאן מוצפן בדרך אלינו. <b>אנחנו קוראים.</b></p>
          <p>נפרסם על הקיר מה שהאלגוריתם שלנו חושב על מה שאמרת, בכינוי שניתן לך, וזרים יוכלו להזיז את זה.</p>
          <p>לא נפרסם את המילים ולא את שמך. אפשר למשוך כרטיס מהקיר תוך 24 שעות. הכניסה מגיל 18.</p>
        </section>

        {!result ? (
          <form className="invite-form" onSubmit={(e) => e.preventDefault()}>
            <Input
              id="invite-name"
              label="איך לקרוא לך"
              placeholder="שם, כינוי, כל דבר"
              value={name}
              onChange={(e) => setName(e.target.value)}
              error={error}
              required
              disabled={busy}
            />
            <p className="invite-hint">תענה על השאלה כדי להיכנס. שתי התשובות פותחות את אותה דלת.</p>
            <div className="invite-answers">
              <Button type="button" variant="outline" size="lg" fullWidth loading={busy} onClick={() => answer(ANSWERS.TRUST)}>
                {ANSWER_LABEL[ANSWERS.TRUST]}
              </Button>
              <Button type="button" variant="primary" size="lg" fullWidth loading={busy} onClick={() => answer(ANSWERS.SHAPED)}>
                {ANSWER_LABEL[ANSWERS.SHAPED]}
              </Button>
            </div>
          </form>
        ) : (
          <section className="invite-result" aria-live="polite">
            <p className="invite-recorded">
              רשמנו: <b>{ANSWER_LABEL[result.answer]}</b>. זה הדבר הראשון שהמערכת יודעת עליך.
            </p>
            <p className="invite-renamed">
              קראת לעצמך <s>{result.typedName}</s>. מעכשיו קוראים לך <b className="invite-pseudonym">{result.pseudonym}</b>.
              השם שהקלדת לא יופיע בשום מקום.
            </p>
            <label className="invite-link-label" htmlFor="invite-url">הקישור שלך לחיבור. שלח אותו בעצמך למי שתרצה.</label>
            <div className="invite-link">
              <input id="invite-url" className="invite-url" readOnly value={inviteUrl(result.code)} dir="ltr" />
              <Button type="button" variant="secondary" onClick={copy}>{copied ? 'הועתק' : 'העתק'}</Button>
            </div>
            {!result.saved && (
              <p className="invite-unsaved">הקישור נוצר אבל לא נשמר אצלנו ({result.error?.code}). מי שיפתח אותו לא ימצא אותך עדיין.</p>
            )}
            <p className="invite-expires">תקף שבעה ימים. אחרי זה הדלת נסגרת והקישור לא פותח כלום.</p>
          </section>
        )}
      </div>
    </main>
  );
};

export default Invite;
