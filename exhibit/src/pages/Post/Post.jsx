/**
 * One card and its trail: who moved it where, step by step, and how far it
 * drifted from what the provider first decided.
 */
import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { WallCard } from '../../components/Wall/WallCard';
import { he } from '../../components/Wall/labels';
import { getPost, getTrail } from '../../services/wall/wallService';
import { useVisitorState, useWall } from '../../hooks';
import { point, torusDistance } from '@hermes/core/ring';
import './Post.css';

export const Post = () => {
  const { postId } = useParams();
  const { visitor } = useVisitorState();
  const { reactTo } = useWall(null);
  const [post, setPost] = useState(null);
  const [trail, setTrail] = useState([]);
  const [state, setState] = useState('loading');

  useEffect(() => {
    let alive = true;
    (async () => {
      const [{ post: p, error }, { trail: t }] = await Promise.all([getPost(postId), getTrail(postId)]);
      if (!alive) return;
      if (error || !p) { setState('missing'); return; }
      setPost(p); setTrail(t); setState('ready');
    })();
    return () => { alive = false; };
  }, [postId]);

  const onReact = async (id, kind) => {
    if (!visitor) return { error: { code: 'NO_STATE' } };
    const r = await reactTo(id, kind);
    if (!r.error && r.result) {
      setPost((p) => ({ ...p, emotion: r.result.after.emotion, color: r.result.after.color,
        reactions: p.reactions + (kind === 'trigger' ? 1 : 0), braces: p.braces + (kind === 'brace' ? 1 : 0) }));
      const { trail: t } = await getTrail(postId); setTrail(t);
    }
    return r;
  };

  if (state === 'loading') return <main className="post" dir="rtl"><p>טוען…</p></main>;
  if (state === 'missing') return <main className="post" dir="rtl"><p>הכרטיס הזה נמשך או לא קיים.</p><Link to="/wall">חזרה לקיר</Link></main>;

  const drift = torusDistance(point(post.emotion, post.color), point(post.initial_emotion, post.initial_color));

  return (
    <main className="post" dir="rtl">
      <Link className="post__back" to="/wall">→ הקיר</Link>
      <WallCard post={post} visitor={visitor} onReact={onReact} />
      {!visitor && <p className="post__hint">כדי להזיז או לחבק, <Link to="/wall">הצהר על מצב בקיר</Link>.</p>}

      <section className="post__trail" aria-label="מי הזיז לאן">
        <h2 className="post__h2">מי הזיז לאן</h2>
        <p className="post__meta">
          הספק הניח את זה ב-<b>{he.emotion(post.initial_emotion)} {he.color(post.initial_color)}</b>.
          עכשיו זה ב-<b>{he.emotion(post.emotion)} {he.color(post.color)}</b>. מרחק מהמקור: <b>{drift}</b> מתוך 8.
        </p>
        {trail.length === 0 ? <p className="post__meta">אף אחד עוד לא נגע.</p> : (
          <ol className="post__steps">
            {trail.map((s) => (
              <li key={s.id} className="post__step">
                <span className="post__actor">מישהו ב-{he.emotion(s.actor_emotion)} {he.color(s.actor_color)}</span>
                <span className="post__arrow">{he.emotion(s.before_emotion)} {he.color(s.before_color)} ← {he.emotion(s.after_emotion)} {he.color(s.after_color)}</span>
                {s.text && <span className="post__text">„{s.text}”</span>}
              </li>
            ))}
          </ol>
        )}
      </section>
    </main>
  );
};

export default Post;
