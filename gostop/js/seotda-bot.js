// 섯다 봇: easy / normal / hard(타짜: 남의 패를 몰래 봄)
import { SD_DECK, handInfo, bestPair, legalBets, resolve, potOf } from './seotda.js?v=20261031a';

// 모든 2장 조합 점수 분포 → 백분위
const ALL = [];
for (let i = 0; i < SD_DECK.length; i++) for (let j = i + 1; j < SD_DECK.length; j++) ALL.push(handInfo([SD_DECK[i], SD_DECK[j]]).score);
ALL.sort((a, b) => a - b);
const pct = sc => { let lo = 0, hi = ALL.length; while (lo < hi) { const m = (lo + hi) >> 1; if (ALL[m] < sc) lo = m + 1; else hi = m; } return lo / ALL.length; };
const SPECIAL_PCT = { amhaeng: 0.45, ttaengjabi: 0.42, gusa: 0.55, mgusa: 0.6 };
function pairStrength(p) {
  const h = handInfo(p);
  return h.special ? SPECIAL_PCT[h.special] : pct(h.score);
}
// 한 장만 있을 때: 나머지 카드와 짝지은 평균
const ONE = {};
for (const a of SD_DECK) {
  let t = 0, c = 0;
  for (const b of SD_DECK) if (b !== a) { t += pairStrength([a, b]); c++; }
  ONE[a] = t / c;
}
function strength(s, seat) {
  const h = s.hands[seat];
  if (h.length === 1) return ONE[h[0]];
  if (h.length === 2) return pairStrength(h) + (s.cardsMode === 3 && s.round === 1 ? 0.05 : 0);
  return pairStrength(s.chosen[seat] || bestPair(h));
}
// 타짜: 지금 패끼리 겨루면 이기는지 (남은 사람 전원 공개 비교)
function cheatEdge(s, seat) {
  const hands = {};
  for (let i = 0; i < s.n; i++) {
    if (s.folded[i]) continue;
    const h = s.hands[i];
    hands[i] = h.length >= 2 ? (s.cardsMode === 3 && h.length === 3 ? (s.chosen[i] || bestPair(h)) : h.slice(0, 2)) : null;
  }
  if (Object.values(hands).some(h => !h)) {
    // 한 장씩일 땐 기대 강도 비교
    const me = strength(s, seat);
    const opp = Math.max(...Object.keys(hands).map(Number).filter(i => i !== seat).map(i => strength(s, i)));
    return me - opp;
  }
  const r = resolve(hands);
  if (r.rematch) return r.rematch.includes(seat) ? 0.1 : -0.3;
  return r.winners.includes(seat) ? 0.6 : -0.6;
}

// 난이도 조절: 판단마다 이 확률로 한 단계 약하게 둠 (어려움→보통, 보통→쉬움, 쉬움→아무 패나 따라감)
// 0이면 원래 실력 그대로 (2026-10-19: 20% 낮춘 값을 원래대로 되돌림)
export const SLIP = { easy: 0, normal: 0, hard: 0 };
// 어려움(타짜)이 그 판에 남의 패를 엿볼 확률. 안 엿보는 판은 보통처럼 침
export const HARD_PEEK = { p: 1 };
const WEAKER = { hard: 'normal', normal: 'easy', easy: 'loose' };
function hash01(str) { let x = 2166136261; for (let i = 0; i < str.length; i++) { x ^= str.charCodeAt(i); x = Math.imul(x, 16777619); } return (x >>> 0) / 4294967296; }
const peeks = (s, seat) => hash01(`${s.gid || ''}|${s.seats[seat].id}|${s.rematch}`) < HARD_PEEK.p;
export function botBet(s, seat, level = 'normal') {
  if (level === 'hard' && !peeks(s, seat)) level = 'normal';
  if (SLIP[level] && Math.random() < SLIP[level]) level = WEAKER[level];
  const acts = legalBets(s, seat);
  if (!acts.length) return null;
  const by = t => acts.find(a => a.type === t);
  const call = by('call'), check = by('check'), bbing = by('bbing'), half = by('half'), dd = by('ttadang');
  const raise = (dd && Math.random() < 0.5 ? dd : half) || dd || half;
  const passive = check || call;
  const toCall = call ? call.amount : 0;
  const P = potOf(s);
  const r = Math.random();
  if (level === 'loose') {
    if (r < 0.25 && raise) return raise.type;
    return passive.type;
  }
  if (level === 'easy') {
    if (toCall > 0 && r < 0.22) return 'die';
    if (r > 0.82 && raise) return raise.type;
    if (check && bbing && r > 0.6) return 'bbing';
    return passive.type;
  }
  let st = strength(s, seat) + (Math.random() - 0.5) * 0.14;
  if (level === 'hard') {
    const edge = cheatEdge(s, seat);
    st = 0.5 + edge;
    if (Math.random() < 0.1) st += 0.35; // 가끔 블러핑
  }
  if (st > 0.86 && raise) return raise.type;
  if (st > 0.7 && raise && Math.random() < 0.45) return raise.type;
  if (check) return st > 0.55 && bbing && Math.random() < 0.5 ? 'bbing' : 'check';
  const odds = toCall / (P + toCall);
  if (st > 0.5) return 'call';
  if (st > 0.28 && odds < 0.3) return 'call';
  return 'die';
}

export function botChoose(s, seat, level = 'normal') {
  const h = s.hands[seat];
  if (level !== 'hard' || !peeks(s, seat)) return bestPair(h);
  // 타짜: 남의 패를 보고 이기는 조합을 고름
  const others = {};
  for (let i = 0; i < s.n; i++) if (i !== seat && !s.folded[i]) others[i] = s.chosen[i] || bestPair(s.hands[i]);
  let best = bestPair(h), bestVal = -1;
  for (const [i, j] of [[0, 1], [0, 2], [1, 2]]) {
    const p = [h[i], h[j]];
    const r = resolve({ ...others, [seat]: p });
    const v = r.winners.includes(seat) ? 2 : r.rematch && r.rematch.includes(seat) ? 1 : 0;
    const tie = handInfo(p).score / 10000;
    if (v + tie > bestVal) { bestVal = v + tie; best = p; }
  }
  return best;
}
