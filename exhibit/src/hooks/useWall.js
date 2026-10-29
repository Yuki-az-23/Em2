/**
 * Feed for a declared visitor state, with realtime updates folded in.
 * When realtime does not connect within a few seconds (the light local demo
 * has none), the feed is polled instead.
 */
export const POLL_MS = 5000;
const REALTIME_GRACE_MS = 4000;

import { useCallback, useEffect, useRef, useState } from 'react';
import { getFeed, react as sendReaction, subscribePosts } from '../services/wall/wallService';

export const useWall = (visitor) => {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [resting, setResting] = useState(false);
  const visitorRef = useRef(visitor);
  visitorRef.current = visitor;

  const load = useCallback(async () => {
    if (!visitorRef.current) return;
    setLoading(true);
    const { posts: rows, error: err } = await getFeed(visitorRef.current);
    setLoading(false);
    if (err) { setError(err); setResting(err.code === 'STORAGE_UNAVAILABLE'); return; }
    setError(null); setResting(false); setPosts(rows);
  }, []);

  useEffect(() => { load(); }, [load, visitor?.emotion, visitor?.color]);

  useEffect(() => {
    if (!visitor) return undefined;
    let live = false;
    let poll = null;
    const startPolling = () => { if (!poll && !live) poll = setInterval(load, POLL_MS); };
    const grace = setTimeout(startPolling, REALTIME_GRACE_MS);
    const unsubscribe = subscribePosts(({ type, post }) => {
      if (!post) return;
      setPosts((cur) => {
        if (post.withdrawn_at) return cur.filter((p) => p.id !== post.id);
        const i = cur.findIndex((p) => p.id === post.id);
        if (i === -1) return type === 'INSERT' ? [post, ...cur] : cur;
        const next = cur.slice(); next[i] = { ...cur[i], ...post }; return next;
      });
    }, (status) => {
      if (status === 'live') { live = true; clearTimeout(grace); if (poll) { clearInterval(poll); poll = null; } }
      else { live = false; startPolling(); }
    });
    return () => { clearTimeout(grace); if (poll) clearInterval(poll); unsubscribe(); };
  }, [visitor, load]);

  const reactTo = useCallback(async (postId, kind, text) => {
    const v = visitorRef.current;
    if (!v) return { error: { code: 'NO_STATE', message: 'declare a state first' } };
    const r = await sendReaction({ postId, kind, emotion: v.emotion, color: v.color, text });
    if (!r.error && r.result) {
      setPosts((cur) => cur.map((p) => p.id === postId
        ? { ...p, emotion: r.result.after.emotion, color: r.result.after.color,
            reactions: p.reactions + (kind === 'trigger' ? 1 : 0), braces: p.braces + (kind === 'brace' ? 1 : 0) }
        : p));
    }
    return r;
  }, []);

  return { posts, loading, error, resting, reload: load, reactTo };
};
