/**
 * A card on the wall: what the provider decided about two people's exchange.
 * Pseudonyms, the system's paraphrase, the assigned state, and two verbs.
 */
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge } from '../Badge/Badge';
import { Button } from '../Button/Button';
import { he } from './labels';
import './WallCard.css';


export const WallCard = ({ post, visitor, onReact, compact = false }) => {
  const [busy, setBusy] = useState(null);
  const [note, setNote] = useState('');
  const drifted = post.emotion !== post.initial_emotion || post.color !== post.initial_color;

  const act = async (kind) => {
    if (!onReact || busy) return;
    setBusy(kind);
    const r = await onReact(post.id, kind);
    setBusy(null);
    if (r && r.error) {
      setNote(r.error.code === 'ALREADY_BRACED' ? 'כבר חיבקת את זה.'
        : r.error.code === 'RATE_LIMITED' ? `לאט. עוד ${r.error.retryAfter ?? 60} שניות.`
        : r.error.code === 'NOT_FOUND' ? 'הכרטיס נמשך.' : 'לא עבר. נסה שוב.');
      setTimeout(() => setNote(''), 3000);
    }
  };

  return (
    <article className={`wall-card wall-card--${post.emotion}${compact ? ' wall-card--compact' : ''}`} data-testid="wall-card">
      <header className="wall-card__head">
        <span className="wall-card__who">{(post.pseudonyms || []).join(' · ')}</span>
        <span className="wall-card__state">
          <Badge variant="emotion" emotion={post.emotion}>{he.emotion(post.emotion)}</Badge>
          <span className={`wall-card__swatch wall-card__swatch--${post.color}`} title={he.color(post.color)} aria-label={he.color(post.color)} />
          {drifted && <span className="wall-card__drift" title={`התחיל ב-${he.emotion(post.initial_emotion)} ${he.color(post.initial_color)}`}>השתנה</span>}
        </span>
      </header>

      {post.image_url && <img className="wall-card__image" src={post.image_url} alt="" loading="lazy" />}

      <p className="wall-card__body">{post.body}</p>

      <footer className="wall-card__foot">
        <span className="wall-card__counts" aria-label="מספר תגובות וחיבוקים">
          {post.reactions ?? 0} הזזות · {post.braces ?? 0} חיבוקים
        </span>
        {!compact && (
          <span className="wall-card__actions">
            <Button size="sm" variant="outline" loading={busy === 'trigger'} disabled={!visitor || !!busy} onClick={() => act('trigger')}
              title={visitor ? `להזיז לכיוון ${he.emotion(visitor.emotion)} ${he.color(visitor.color)}` : 'הצהר על מצב כדי להזיז'}>
              להזיז
            </Button>
            <Button size="sm" variant="primary" loading={busy === 'brace'} disabled={!visitor || !!busy} onClick={() => act('brace')}
              title="לחזק את מה שהיה בהתחלה">
              לחבק
            </Button>
            <Link className="wall-card__more" to={`/post/${post.id}`}>מי הזיז</Link>
          </span>
        )}
      </footer>
      {note && <p className="wall-card__note" role="status">{note}</p>}
    </article>
  );
};

export default WallCard;
