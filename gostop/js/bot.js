// 봇 AI: easy / normal / hard
import { CARDS, DAN_SETS, GODORI } from './cards.js?v=20261018f';
import { legalMoves, scoreDetail, scoreOf, cardRank, applyPlay } from './engine.js?v=20261018f';

const C = id => CARDS[id];
const rand = a => a[Math.floor(Math.random() * a.length)];

// 내 입장에서 카드 가치
function valueFor(s, seat, id) {
  const c = C(id);
  const mine = s.caps[seat];
  let v;
  if (c.type === 'gwang') {
    const g = mine.filter(x => C(x).type === 'gwang').length;
    v = 6 + (g >= 2 ? 4 : g);
  } else if (c.type === 'yeol') {
    v = 3;
    if (c.godori) v += GODORI.filter(x => mine.includes(x)).length * 2;
    if (c.gukjin) v += 1;
  } else if (c.type === 'tti') {
    v = 2;
    for (const ids of Object.values(DAN_SETS)) if (ids.includes(id)) v += ids.filter(x => mine.includes(x)).length * 1.5;
  } else {
    const pv = scoreDetail(mine).piVal;
    v = c.val * (pv >= 7 ? 1.6 : 1.1);
  }
  return v;
}
// 상대가 노리는 카드인지 (방어 가치)
function denyValue(s, seat, id) {
  let best = 0;
  for (let o = 0; o < s.n; o++) {
    if (o === seat) continue;
    const caps = s.caps[o];
    if (GODORI.includes(id) && GODORI.filter(x => caps.includes(x)).length >= 2) best = Math.max(best, 5);
    for (const ids of Object.values(DAN_SETS)) if (ids.includes(id) && ids.filter(x => caps.includes(x)).length >= 2) best = Math.max(best, 3);
    if (C(id).type === 'gwang' && caps.filter(x => C(x).type === 'gwang').length >= 2) best = Math.max(best, 4);
  }
  return best;
}
// 아직 안 보인 같은 월 카드 수 (내 시점)
function unseenOfMonth(s, seat, month) {
  let seen = 0;
  const count = arr => arr.forEach(id => { if (C(id).month === month) seen++; });
  count(s.floor); count(s.hands[seat]); s.caps.forEach(count);
  return 4 - seen;
}

function evalMove(s, seat, mv, level) {
  if (mv.card === 'BOMB') return 1.5;
  if (mv.bonus) return 100; // 보너스는 바로 낸다
  const c = C(mv.card);
  const floorM = s.floor.filter(f => C(f).month === c.month);
  const hard = level === 'hard';
  let score = 0;
  if (mv.canBomb) return 60 + floorM.reduce((a, f) => a + valueFor(s, seat, f), 0);
  if (floorM.length === 0) {
    // 버리는 패: 가치 낮은 것, 상대가 못 먹는 것 위주
    score = -valueFor(s, seat, mv.card) * 0.6;
    if (hard) {
      const unseen = unseenOfMonth(s, seat, c.month);
      if (unseen === 0) score += 2; // 아무도 못 먹음
      score -= denyValue(s, seat, mv.card) * 0.8;
      const same = s.hands[seat].filter(h => C(h).month === c.month).length;
      if (same >= 2) score -= 1.5; // 짝 맞춰 둔 패는 아껴둔다
    }
  } else if (floorM.length === 1) {
    score = valueFor(s, seat, mv.card) + valueFor(s, seat, floorM[0]) + 1;
    if (hard) score += denyValue(s, seat, floorM[0]) + denyValue(s, seat, mv.card) * 0.5;
  } else if (floorM.length === 2) {
    const t = pickTarget(s, seat, floorM);
    score = valueFor(s, seat, mv.card) + valueFor(s, seat, t) + 0.5;
    if (hard) score += denyValue(s, seat, t);
  } else {
    score = 8 + floorM.reduce((a, f) => a + valueFor(s, seat, f), 0) + valueFor(s, seat, mv.card);
    if (s.ppeokOwner[c.month] != null) score += 4;
  }
  if (level === 'normal') score += Math.random() * 1.5;
  return score;
}

function pickTarget(s, seat, targets) {
  return [...targets].sort((a, b) => (valueFor(s, seat, b) + denyValue(s, seat, b)) - (valueFor(s, seat, a) + denyValue(s, seat, a)))[0];
}

// 이번 턴에 실제로 얻는 카드의 가치
function gainValue(before, after, seat) {
  if (after.phase === 'end' && after.result) {
    if (after.result.winner === seat) return 60 + after.result.points * 3;
  }
  let v = 0;
  const had = new Set(before.caps[seat]);
  for (const id of after.caps[seat]) if (!had.has(id)) v += valueFor(before, seat, id) + denyValue(before, seat, id) * 0.6;
  for (const e of after.events) {
    if (e.type === 'ppeok') v -= 3.5;
    if (e.type === 'sseul' || e.type === 'jjok' || e.type === 'ttadak') v += 1;
  }
  return v;
}
function discardAdj(s, seat, mv) {
  if (mv.card === 'BOMB' || mv.bomb) return 0;
  const c = C(mv.card);
  const floorM = s.floor.filter(f => C(f).month === c.month);
  if (floorM.length) return 0;
  let a = -denyValue(s, seat, mv.card) * 0.8;
  if (unseenOfMonth(s, seat, c.month) === 0) a += 2;
  if (s.hands[seat].filter(h => C(h).month === c.month).length >= 2) a -= 1.5;
  return a;
}
// 어려움(타짜) 봇: 다음에 뒤집힐 패를 엿보고(밑장 보기) 이번 턴의 실제 이득을 계산
function lookahead(s, seat, mv) {
  return gainValue(s, applyPlay(s, seat, mv), seat) + discardAdj(s, seat, mv);
}

export function botMove(s, seat, level = 'normal') {
  const moves = legalMoves(s, seat);
  if (!moves.length) return null;
  if (level === 'hard') {
    let best = null, bestScore = -Infinity;
    for (const mv of moves) {
      if (mv.bonus) return { card: mv.card };
      const opts = [];
      const targets = mv.targets || [undefined];
      for (const tg of targets) {
        opts.push({ card: mv.card, target: tg, shake: !!mv.canShake, bomb: false });
        if (mv.canBomb) opts.push({ card: mv.card, target: tg, bomb: true });
      }
      for (const o of opts) {
        const sc = lookahead(s, seat, o);
        if (sc > bestScore) { bestScore = sc; best = o; }
      }
    }
    return best;
  }
  if (level === 'easy') {
    const mv = rand(moves.filter(m => m.card !== 'BOMB').length ? moves : moves);
    return { card: mv.card, target: mv.targets ? rand(mv.targets) : undefined, shake: !!mv.canShake && Math.random() < 0.4, bomb: !!mv.canBomb && Math.random() < 0.6 };
  }
  let best = null, bestScore = -Infinity;
  for (const mv of moves) {
    const sc = evalMove(s, seat, mv, level);
    if (sc > bestScore) { bestScore = sc; best = mv; }
  }
  return {
    card: best.card,
    target: best.targets ? pickTarget(s, seat, best.targets) : undefined,
    shake: !!best.canShake,
    bomb: !!best.canBomb,
  };
}

// 상대 위협도: 점수 + 거의 완성된 족보
function threat(s, seat) {
  let t = 0;
  for (let o = 0; o < s.n; o++) {
    if (o === seat) continue;
    const caps = s.caps[o];
    let v = scoreOf(s, o);
    if (GODORI.filter(x => caps.includes(x)).length === 2) v += 2;
    for (const ids of Object.values(DAN_SETS)) if (ids.filter(x => caps.includes(x)).length === 2) v += 1.5;
    if (caps.filter(x => C(x).type === 'gwang').length === 2) v += 1.5;
    t = Math.max(t, v);
  }
  return t;
}

export function botGoStop(s, seat, level = 'normal') {
  const handLeft = s.hands[seat].length + s.bombTokens[seat];
  if (handLeft <= 0) return false;
  if (level === 'easy') return Math.random() < 0.55;
  const th = s.threshold;
  const t = threat(s, seat);
  const myScore = scoreOf(s, seat);
  if (level === 'normal') return handLeft >= 3 && t < th - 1 && s.goCount[seat] < 3;
  // hard
  if (handLeft <= 1) return false;
  if (s.goCount[seat] >= 2 && myScore >= th + 6) return false; // 충분히 땄으면 챙긴다
  const margin = handLeft >= 5 ? 1.5 : handLeft >= 3 ? 2.5 : 3.5;
  return t < th - margin;
}

// 봇 채팅 반응용
export { cardRank };
