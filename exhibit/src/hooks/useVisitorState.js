/**
 * The visitor's declared state at the wall: b_v. Kept in localStorage as a
 * per-viewer convenience. Nothing is sent anywhere until they react.
 */
import { useCallback, useState } from 'react';

const KEY = 'hermes.visitor';
const read = () => { try { const v = JSON.parse(localStorage.getItem(KEY) || 'null'); return v && v.emotion && v.color ? v : null; } catch { return null; } };

export const useVisitorState = () => {
  const [state, setState] = useState(read);
  const declare = useCallback((emotion, color) => {
    const v = { emotion, color, at: new Date().toISOString() };
    try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* private window */ }
    setState(v);
  }, []);
  const forget = useCallback(() => { try { localStorage.removeItem(KEY); } catch { /* ignore */ } setState(null); }, []);
  return { visitor: state, declare, forget };
};
