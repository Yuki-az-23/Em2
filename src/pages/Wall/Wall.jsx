/**
 * The wall. The visitor declares a state first, because the filter needs one,
 * and because the visitor is profiled too. Then the feed, sorted by resonance.
 */
import React, { useState } from 'react';
import { CircularEmotionPicker, ColorPicker, Button } from '../../components';
import { WallCard } from '../../components/Wall/WallCard';
import { he } from '../../components/Wall/labels';
import { useVisitorState, useWall } from '../../hooks';
import './Wall.css';

const Entry = ({ onDeclare }) => {
  const [emotion, setEmotion] = useState('joy');
  const [color, setColor] = useState('yellow');
  return (
    <section className="wall-entry" aria-label="כניסה לקיר">
      <h1 className="wall-entry__title">לפני שתראה את הקיר, הקיר רואה אותך.</h1>
      <p className="wall-entry__lede">תצהיר על רגש וצבע. המסנן יבחר מה להראות לך לפי זה, וכשתזיז כרטיס של זר, זה הכיוון שאליו הוא יזוז.</p>
      <div className="wall-entry__pickers">
        <CircularEmotionPicker selected={emotion} onChange={setEmotion} selectedColor={color} title="המצב שלך" />
        <ColorPicker value={color} onChange={setColor} label="צבע" />
      </div>
      <Button size="lg" variant="primary" onClick={() => onDeclare(emotion, color)}>
        להיכנס כ{he.emotion(emotion)} {he.color(color)}
      </Button>
      <p className="wall-entry__note">נשמר רק בדפדפן שלך. אפשר לשנות בכל רגע.</p>
    </section>
  );
};

export const Wall = () => {
  const { visitor, declare, forget } = useVisitorState();
  const { posts, loading, error, resting, reload, reactTo } = useWall(visitor);

  if (!visitor) return <main className="wall" dir="rtl"><Entry onDeclare={declare} /></main>;

  return (
    <main className="wall" dir="rtl">
      <header className="wall__head">
        <div>
          <h1 className="wall__title">הקיר</h1>
          <p className="wall__sub">אתה נכנס כ<b>{he.emotion(visitor.emotion)} {he.color(visitor.color)}</b>. המסנן מראה לך מה שקרוב לזה, עם סדק קטן לצד השני.</p>
        </div>
        <div className="wall__tools">
          <Button size="sm" variant="ghost" onClick={forget}>לשנות מצב</Button>
          <Button size="sm" variant="ghost" onClick={reload} loading={loading}>לרענן</Button>
        </div>
      </header>

      {resting && <p className="wall__resting" role="status">הקיר נח. השרת לא עונה כרגע, ומה שמוצג כאן עשוי להיות ישן.</p>}
      {error && !resting && <p className="wall__resting" role="alert">לא הצלחנו לטעון: {error.code}</p>}

      {!loading && posts.length === 0 && !error && (
        <p className="wall__empty">עדיין אין כרטיסים שקרובים אליך. כשמישהו יסיים שיחה בטלגרם, המגביר יניח כאן את מה שהוא חושב עליה.</p>
      )}

      <section className="wall__list" aria-live="polite">
        {posts.map((p) => <WallCard key={p.id} post={p} visitor={visitor} onReact={reactTo} />)}
      </section>
    </main>
  );
};

export default Wall;
