/**
 * The machine. The exhibit's page about the algorithm itself: the 8x8 matrix
 * every conversation is placed in, the posts as points, and the old engine
 * running live, with its own limits shown rather than hidden.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { EMOTIONS, COLORS, relation, emotionIndex, colorIndex, stepInteraction, point, names } from '@hermes/core/ring';
import { ECBridgeEngine } from '../../services/ecbridge/ECBridgeEngine';
import { getPositions } from '../../services/wall/machineService';
import { he } from '../../components/Wall/labels';
import './Machine.css';

const oldEngine = new ECBridgeEngine();
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

const FACTS = [
  { title: 'שישים וארבעה תאים', body: 'כל רגש אנושי שעובר בערוץ מקבל כתובת של שישה ביטים: רגש אחד משמונה, צבע אחד משמונה. אין "קצת עצוב". יש תא.' },
  { title: 'הבטחה שלא מתקיימת', body: 'המנוע המקורי מבטיח "מיזוג רגשות" לזוגות משלימים. בפועל המסלול הזה לא רץ אף פעם: כל רגש משלים נמצא גם ברשימת השכנים, והבדיקה של השכנים קודמת.' },
  { title: 'כשהוא לא מבין, זה גועל', body: 'ברירת המחדל של המנוע לכל קלט שהוא לא מזהה היא Disgust/orange. במערכת המקורית מסד הנתונים שמר אותיות קטנות והמנוע ציפה לגדולות, ולכן כל שיחה אמיתית הייתה מסווגת כגועל. נסה למטה.' },
  { title: 'רק התנגדות נרשמת', body: 'במנוע הישן רק רגש הפוך מזיז את רגש הפוסט. הסכמה לא משנה כלום. וכל תגובה דורסת את כל מה שהיה לפניה: המצב של אדם על הקיר הוא דעתו של האחרון שנגע בו. הקיר החדש מוסיף זיכרון שדועך, וזה כל ההבדל.' },
];

export const Machine = () => {
  const [posts, setPosts] = useState([]);
  const [userE, setUserE] = useState('joy'); const [userC, setUserC] = useState('yellow');
  const [postE, setPostE] = useState('sad'); const [postC, setPostC] = useState('blue');
  const [lowercase, setLowercase] = useState(false);

  useEffect(() => { getPositions().then(({ posts: p }) => setPosts(p)); }, []);

  const grid = useMemo(() => {
    const now = Array.from({ length: 64 }, () => 0), init = Array.from({ length: 64 }, () => 0);
    for (const p of posts) {
      const i = emotionIndex(p.emotion) * 8 + colorIndex(p.color); if (i >= 0) now[i]++;
      const j = emotionIndex(p.initial_emotion) * 8 + colorIndex(p.initial_color); if (j >= 0) init[j]++;
    }
    return { now, init };
  }, [posts]);

  const oldResult = useMemo(() => {
    const f = lowercase ? (s) => s : cap;
    return oldEngine.calculateInteraction(f(userE), userC, f(postE), postC);
  }, [userE, userC, postE, postC, lowercase]);
  const newResult = useMemo(() => names(stepInteraction(point(userE, userC), point(postE, postC)).next), [userE, userC, postE, postC]);
  const rel = relation(emotionIndex(userE), emotionIndex(postE));

  const Select = ({ value, onChange, options, label, kind }) => (
    <label className="machine__select">{label}
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => <option key={o} value={o}>{kind === 'e' ? he.emotion(o) : he.color(o)}</option>)}
      </select>
    </label>
  );

  return (
    <main className="machine" dir="rtl">
      <h1 className="machine__title">המכונה</h1>
      <p className="machine__lede">זה האלגוריתם שמחליט מה אתם מרגישים. הוא קטן, גס, ומוצג כאן כמו שהוא.</p>

      <section className="machine__matrix" aria-label="המטריצה">
        <div className="machine__grid" role="table" aria-label="שמונה רגשות כפול שמונה צבעים">
          <div className="machine__corner" />
          {COLORS.map((c) => <div key={c} className={`machine__colhead machine__sw--${c}`} title={he.color(c)} />)}
          {EMOTIONS.map((e, ei) => (
            <React.Fragment key={e}>
              <div className="machine__rowhead">{he.emotion(e)}</div>
              {COLORS.map((c, ci) => {
                const i = ei * 8 + ci; const n = grid.now[i]; const m = grid.init[i];
                return (
                  <div key={c} className={`machine__cell${n ? ' machine__cell--live' : ''}`} title={`${he.emotion(e)} ${he.color(c)}: ${n} עכשיו, ${m} בפרסום`}>
                    {n > 0 && <span className="machine__n">{n}</span>}
                    {m > 0 && n !== m && <span className="machine__m">{m}</span>}
                  </div>
                );
              })}
            </React.Fragment>
          ))}
        </div>
        <p className="machine__caption">כל מספר הוא כרטיסים שיושבים בתא הזה עכשיו. מספר קטן הוא כמה פורסמו שם במקור ונדדו. {posts.length === 0 ? 'עדיין אין כרטיסים.' : `${posts.length} כרטיסים על הקיר.`}</p>
      </section>

      <section className="machine__facts">
        {FACTS.map((f) => <article key={f.title} className="machine__fact"><h2>{f.title}</h2><p>{f.body}</p></article>)}
      </section>

      <section className="machine__try" aria-label="להריץ את המנוע">
        <h2>תריץ אותו בעצמך</h2>
        <div className="machine__inputs">
          <Select label="המבקר מרגיש" value={userE} onChange={setUserE} options={EMOTIONS} kind="e" />
          <Select label="בצבע" value={userC} onChange={setUserC} options={COLORS} kind="c" />
          <Select label="הפוסט נמצא ב" value={postE} onChange={setPostE} options={EMOTIONS} kind="e" />
          <Select label="בצבע" value={postC} onChange={setPostC} options={COLORS} kind="c" />
          <label className="machine__check"><input type="checkbox" checked={lowercase} onChange={(e) => setLowercase(e.target.checked)} /> להזין כמו מסד הנתונים המקורי (אותיות קטנות)</label>
        </div>
        <div className="machine__results">
          <div className="machine__result">
            <h3>המנוע המקורי (2025)</h3>
            <p data-testid="old-result">הפוסט עובר ל-<b>{he.emotion(String(oldResult.emotion).toLowerCase())} {he.color(oldResult.color)}</b>
              {oldResult.metadata.original.emotion === 'Unknown' && <span className="machine__warn"> · לא זיהה את הקלט ונפל לברירת המחדל</span>}
            </p>
            <p className="machine__meta">יחס: {oldResult.metadata.emotionRelation} · עוצמה {oldResult.intensity} · ביטחון {oldResult.confidence}</p>
          </div>
          <div className="machine__result">
            <h3>הקיר (היום)</h3>
            <p data-testid="new-result">הצעה: צעד אחד ל-<b>{he.emotion(newResult.emotion)} {he.color(newResult.color)}</b>. יחס: {rel}.</p>
            <p className="machine__meta">ההצעה נכנסת לזיכרון של 64 תאים שדועכים. הפוסט זז רק כשהתא החדש כבד מהישן.</p>
          </div>
        </div>
      </section>
    </main>
  );
};

export default Machine;
