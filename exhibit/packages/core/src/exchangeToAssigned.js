/**
 * What the amplifier does to a conversation.
 *
 * Deliberately crude. Two people talked; the system puts the whole exchange
 * at one point on the torus: the midpoint between their expressed states,
 * along the shortest arc on each ring, clockwise on ties. Message count only
 * feeds intensity; the words themselves never enter this function.
 *
 * This is the subject of the exhibit, not a model of what was felt.
 */

import { point, names, stepToward, d8, torusDistance } from './ring.js';

/**
 * @param {{id:string, emotion:string, color:string}[]} participants  two, with public state
 * @param {{from:string, text?:string}[]} messages
 * @returns {{emotion:string, color:string, intensity:number, confidence:number, metadata:object}}
 */
export function exchangeToAssigned(participants, messages) {
  if (!Array.isArray(participants) || participants.length !== 2) {
    throw new Error('INVALID_EXCHANGE: exactly two participants');
  }
  const a = point(participants[0].emotion, participants[0].color);
  const b = point(participants[1].emotion, participants[1].color);
  if (!a || !b) throw new Error('INVALID_STATE');

  const de = d8(a.e, b.e), dc = d8(a.c, b.c);
  const mid = { e: stepToward(a.e, b.e, Math.floor(de / 2)), c: stepToward(a.c, b.c, Math.floor(dc / 2)) };

  const count = Array.isArray(messages) ? messages.length : 0;
  const balance = balanceOf(participants, messages);
  const intensity = round2(Math.min(2, 0.6 + 0.1 * count));
  const confidence = round2(1 - torusDistance(a, b) / 8);        // agreement between the two

  return {
    ...names(mid),
    intensity,
    confidence,
    metadata: { rule: 'midpoint-v1', distance: de + dc, messageCount: count, balance }
  };
}

/** Share of messages written by the first participant, in [0,1]. */
function balanceOf(participants, messages) {
  if (!Array.isArray(messages) || messages.length === 0) return 0.5;
  const first = participants[0].id;
  const n = messages.filter(m => m && m.from === first).length;
  return round2(n / messages.length);
}

const round2 = (x) => Math.round(x * 100) / 100;
