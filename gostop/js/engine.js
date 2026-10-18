// 고스톱 규칙 엔진 (2~4인). 상태는 JSON 직렬화 가능한 순수 객체.
import { CARDS, BASE_IDS, BONUS_IDS, DAN_SETS, GODORI } from './cards.js?v=20261018g';

const C = id => CARDS[id];
export const clone = o => JSON.parse(JSON.stringify(o));
const LAYOUT = { 2: { hand: 10, floor: 8 }, 3: { hand: 7, floor: 6 }, 4: { hand: 6, floor: 6 } };
export const thresholdFor = n => (n === 2 ? 7 : 3);

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** seats: [{id,name,char,isBot,level}] */
export function newGame({ seats, ppoint = 100, bonusCount = 2, firstSeat = 0, mult = 1 }) {
  const n = seats.length;
  if (n < 2 || n > 4) throw new Error('2~4인만 가능합니다');
  const L = LAYOUT[n];
  let s;
  for (let tries = 0; tries < 50; tries++) {
    const deck = shuffle([...BASE_IDS, ...BONUS_IDS.slice(0, Math.max(0, Math.min(2, bonusCount)))]);
    const hands = seats.map(() => deck.splice(0, L.hand));
    const floor = deck.splice(0, L.floor);
    const caps = seats.map(() => []);
    // 바닥에 깔린 보너스피는 선 플레이어가 가져가고 보충
    for (let i = 0; i < floor.length; i++) {
      while (C(floor[i]).bonus) {
        caps[firstSeat].push(floor[i]);
        floor[i] = deck.shift();
      }
    }
    const monthCount = arr => arr.reduce((m, id) => { const mo = C(id).month; if (mo) m[mo] = (m[mo] || 0) + 1; return m; }, {});
    const bad = Object.values(monthCount(floor)).some(v => v === 4) || hands.some(h => Object.values(monthCount(h)).some(v => v === 4));
    s = {
      n, seats, ppoint, bonusCount, threshold: thresholdFor(n), mult,
      hands, caps, floor, deck,
      turn: firstSeat, phase: 'play', pending: null,
      goCount: seats.map(() => 0), lastGoScore: seats.map(() => 0),
      shake: seats.map(() => 0), bomb: seats.map(() => 0), bombTokens: seats.map(() => 0),
      ppeokCount: seats.map(() => 0), ppeokOwner: {},
      events: [], evSeq: 0, log: [], result: null, ver: 0, ts: Date.now(),
    };
    if (!bad) break;
  }
  return s;
}

// ───────────── 점수 계산 ─────────────
function detailWith(caps, gukjinAsPi) {
  const cs = caps.map(C);
  const gw = cs.filter(c => c.type === 'gwang');
  const gc = gw.length, hasRain = gw.some(c => c.rain);
  const gwPts = gc >= 5 ? 15 : gc === 4 ? 4 : gc === 3 ? (hasRain ? 2 : 3) : 0;

  const tti = cs.filter(c => c.type === 'tti');
  const tc = tti.length;
  const dans = Object.entries(DAN_SETS).filter(([, ids]) => ids.every(id => caps.includes(id))).map(([k]) => k);
  const ttiPts = (tc >= 5 ? tc - 4 : 0) + dans.length * 3;

  const yeol = cs.filter(c => c.type === 'yeol' && !(c.gukjin && gukjinAsPi));
  const yc = yeol.length;
  const godori = GODORI.every(id => caps.includes(id));
  const yeolPts = (yc >= 5 ? yc - 4 : 0) + (godori ? 5 : 0);

  let piVal = cs.filter(c => c.type === 'pi').reduce((a, c) => a + c.val, 0);
  if (gukjinAsPi && caps.includes('09a')) piVal += 2;
  const piPts = piVal >= 10 ? piVal - 9 : 0;

  return { total: gwPts + ttiPts + yeolPts + piPts, gwPts, gc, hasRain, ttiPts, tc, dans, yeolPts, yc, godori, piPts, piVal, gukjinAsPi };
}
export function scoreDetail(caps) {
  const a = detailWith(caps, false);
  if (!caps.includes('09a')) return a;
  const b = detailWith(caps, true);
  return b.total > a.total || (b.total === a.total && b.piVal > a.piVal) ? b : a;
}
export const scoreOf = (s, seat) => scoreDetail(s.caps[seat]).total;
export function withGo(base, go) {
  if (go <= 0) return base;
  if (go === 1) return base + 1;
  if (go === 2) return base + 2;
  return (base + 2) * 2 ** (go - 2);
}

// ───────────── 도우미 ─────────────
const ev = (s, type, seat, extra = {}) => s.events.push({ type, seat, ...extra });
const log = (s, msg) => { s.log.push(msg); if (s.log.length > 60) s.log.shift(); };
const nm = (s, seat) => s.seats[seat].name;

function stealPi(s, me, times = 1) {
  let got = 0;
  for (let o = 0; o < s.n; o++) {
    if (o === me) continue;
    for (let t = 0; t < times; t++) {
      const pis = s.caps[o].filter(id => C(id).type === 'pi').sort((a, b) => C(a).val - C(b).val);
      if (!pis.length) break;
      const take = pis[0];
      s.caps[o].splice(s.caps[o].indexOf(take), 1);
      s.caps[me].push(take);
      got++;
    }
  }
  return got;
}
// 바닥 카드 중 가치 높은 것 우선
export function cardRank(id) {
  const c = C(id);
  if (c.type === 'gwang') return 50;
  if (c.type === 'yeol') return c.godori ? 42 : c.gukjin ? 38 : 35;
  if (c.type === 'tti') return c.ribbon === 'bi' ? 22 : 25;
  return 5 + c.val * 5;
}
const bestOf = ids => [...ids].sort((a, b) => cardRank(b) - cardRank(a))[0];
const removeFrom = (arr, id) => { const i = arr.indexOf(id); if (i >= 0) arr.splice(i, 1); };

export function legalMoves(s, seat) {
  if (s.phase !== 'play' || s.turn !== seat) return [];
  const moves = [];
  if (s.bombTokens[seat] > 0) moves.push({ card: 'BOMB' });
  const hand = s.hands[seat];
  for (const id of hand) {
    const c = C(id);
    if (c.bonus) { moves.push({ card: id, bonus: true }); continue; }
    const inHand = hand.filter(h => C(h).month === c.month).length;
    const onFloor = s.floor.filter(f => C(f).month === c.month);
    moves.push({
      card: id,
      targets: onFloor.length === 2 ? onFloor : null,
      canShake: inHand === 3 && onFloor.length === 0,
      canBomb: inHand === 3 && onFloor.length === 1,
    });
  }
  return moves;
}

function hasPlayable(s, seat) { return s.hands[seat].length > 0 || s.bombTokens[seat] > 0; }

function advance(s) {
  for (let k = 1; k <= s.n; k++) {
    const nx = (s.turn + k) % s.n;
    if (hasPlayable(s, nx)) { s.turn = nx; s.phase = 'play'; return; }
  }
  // 아무도 낼 카드가 없음 → 나가리
  endGame(s, null);
}

function setEvents(s, before, me) {
  // 새로 완성된 족보 이벤트
  const after = scoreDetail(s.caps[me]);
  if (after.godori && !before.godori) ev(s, 'godori', me);
  for (const d of after.dans) if (!before.dans.includes(d)) ev(s, d + 'dan', me);
  if (after.gc >= 3 && before.gc < 3) ev(s, 'gwang', me, { count: after.gc });
  else if (after.gc > before.gc && after.gc >= 4) ev(s, 'gwang', me, { count: after.gc });
}

/**
 * move: { card: id|'BOMB', target?: floorId, shake?: bool, bomb?: bool }
 * 반환: 새 상태
 */
export function applyPlay(state, seat, move) {
  if (state.phase !== 'play' || state.turn !== seat) throw new Error('지금은 낼 수 없습니다');
  const s = clone(state);
  s.events = [];
  const me = seat;
  const before = scoreDetail(s.caps[me]);
  const got = [];
  let M = null, handPair = null, placed = null, floorMLen = -1, steal = 0;

  if (move.card === 'BOMB') {
    if (s.bombTokens[me] <= 0) throw new Error('폭탄 패가 없습니다');
    s.bombTokens[me]--;
  } else {
    const id = move.card;
    if (!s.hands[me].includes(id)) throw new Error('손에 없는 패');
    const c = C(id);
    if (c.bonus) {
      removeFrom(s.hands[me], id);
      s.caps[me].push(id);
      ev(s, 'bonus', me);
      log(s, `${nm(s, me)} 보너스피 획득`);
      if (s.deck.length) s.hands[me].push(s.deck.shift());
      if (!hasPlayable(s, me)) advance(s);
      s.ver++; s.evSeq++; s.ts = Date.now();
      return s;
    }
    M = c.month;
    const sameHand = s.hands[me].filter(h => C(h).month === M);
    const floorM = s.floor.filter(f => C(f).month === M);
    floorMLen = floorM.length;
    if (move.bomb && sameHand.length === 3 && floorM.length === 1) {
      for (const h of sameHand) removeFrom(s.hands[me], h);
      removeFrom(s.floor, floorM[0]);
      got.push(...sameHand, floorM[0]);
      s.bomb[me]++; s.bombTokens[me] += 2;
      steal += 1;
      ev(s, 'bomb', me);
      log(s, `💣 ${nm(s, me)} 폭탄!`);
      floorMLen = 99; // 폭탄 처리 완료 표시
    } else {
      removeFrom(s.hands[me], id);
      if (move.shake && sameHand.length === 3 && floorM.length === 0) {
        s.shake[me]++; ev(s, 'shake', me); log(s, `${nm(s, me)} 흔들기!`);
      }
      if (floorM.length === 0) { s.floor.push(id); placed = id; }
      else if (floorM.length === 1) handPair = [id, floorM[0]];
      else if (floorM.length === 2) {
        const t = floorM.includes(move.target) ? move.target : bestOf(floorM);
        handPair = [id, t];
      } else {
        for (const f of floorM) removeFrom(s.floor, f);
        got.push(id, ...floorM);
        if (s.ppeokOwner[M] != null) {
          const owner = s.ppeokOwner[M];
          steal += owner === me ? 2 : 1;
          ev(s, owner === me ? 'japeok' : 'ppeokEat', me);
          log(s, `${nm(s, me)} 뻑 먹기!`);
          delete s.ppeokOwner[M];
        }
      }
    }
  }

  // 뒤집기
  let f = null;
  while (s.deck.length) {
    const d = s.deck.shift();
    if (C(d).bonus) { s.caps[me].push(d); ev(s, 'bonus', me); continue; }
    f = d; break;
  }
  s.lastFlip = f;
  s.lastPlay = move.card;

  if (f && M != null && C(f).month === M && floorMLen < 99) {
    if (floorMLen === 0) { // 쪽
      removeFrom(s.floor, placed);
      got.push(placed, f); steal += 1; ev(s, 'jjok', me); log(s, `${nm(s, me)} 쪽!`);
    } else if (floorMLen === 1) { // 뻑
      s.floor.push(move.card, f);
      s.ppeokOwner[M] = me; s.ppeokCount[me]++;
      ev(s, 'ppeok', me); log(s, `${nm(s, me)} 뻑!`);
      handPair = null;
    } else if (floorMLen === 2) { // 따닥
      const rest = s.floor.filter(x => C(x).month === M);
      for (const x of rest) removeFrom(s.floor, x);
      got.push(move.card, ...rest, f); steal += 1;
      ev(s, 'ttadak', me); log(s, `${nm(s, me)} 따닥!`);
      handPair = null;
    }
  } else {
    if (handPair) { removeFrom(s.floor, handPair[1]); got.push(...handPair); handPair = null; }
    if (f) {
      const FM = C(f).month;
      const floorF = s.floor.filter(x => C(x).month === FM);
      if (floorF.length === 0) s.floor.push(f);
      else if (floorF.length === 1) { removeFrom(s.floor, floorF[0]); got.push(f, floorF[0]); }
      else if (floorF.length === 2) { const b = bestOf(floorF); removeFrom(s.floor, b); got.push(f, b); }
      else {
        for (const x of floorF) removeFrom(s.floor, x);
        got.push(f, ...floorF);
        if (s.ppeokOwner[FM] != null) {
          const owner = s.ppeokOwner[FM];
          steal += owner === me ? 2 : 1;
          ev(s, owner === me ? 'japeok' : 'ppeokEat', me);
          delete s.ppeokOwner[FM];
        }
      }
    }
  }
  if (handPair) { removeFrom(s.floor, handPair[1]); got.push(...handPair); }

  s.caps[me].push(...got);
  // 싹쓸
  const anyLeft = s.deck.length > 0 || s.hands.some(h => h.length) || s.bombTokens.some(b => b > 0);
  if (got.length && s.floor.length === 0 && anyLeft) {
    steal += 1; ev(s, 'sseul', me); log(s, `🧹 ${nm(s, me)} 싹쓸!`);
  }
  if (steal) stealPi(s, me, steal);
  setEvents(s, before, me);
  s.lastGot = got;

  // 3뻑 = 즉시 승리
  if (s.ppeokCount[me] >= 3) {
    ev(s, 'samppeok', me);
    endGame(s, me, { samppeok: true });
    s.ver++; s.evSeq++; s.ts = Date.now();
    return s;
  }

  const sc = scoreOf(s, me);
  if (sc >= s.threshold && sc > s.lastGoScore[me]) {
    if (!hasPlayable(s, me)) endGame(s, me);
    else { s.phase = 'goStop'; s.pending = me; }
  } else {
    advance(s);
  }
  s.ver++; s.evSeq++; s.ts = Date.now();
  return s;
}

export function applyGoStop(state, seat, go) {
  if (state.phase !== 'goStop' || state.pending !== seat) throw new Error('고/스톱 차례가 아닙니다');
  const s = clone(state);
  s.events = [];
  if (go) {
    s.goCount[seat]++;
    s.lastGoScore[seat] = scoreOf(s, seat);
    ev(s, 'go', seat, { count: s.goCount[seat] });
    log(s, `${nm(s, seat)} ${s.goCount[seat]}고!`);
    s.pending = null;
    s.turn = seat;
    advance(s);
  } else {
    ev(s, 'stop', seat);
    log(s, `${nm(s, seat)} 스톱!`);
    endGame(s, seat);
  }
  s.ver++; s.evSeq++; s.ts = Date.now();
  return s;
}

/** 강제 종료(나가리) */
export function abortGame(state) {
  const s = clone(state); s.events = [];
  endGame(s, null, { aborted: true });
  s.ver++; s.evSeq++; s.ts = Date.now();
  return s;
}

function endGame(s, winner, opt = {}) {
  s.phase = 'end'; s.pending = null;
  if (winner == null) {
    s.result = { winner: null, nagari: true, aborted: !!opt.aborted, pays: s.seats.map(() => 0) };
    ev(s, 'nagari', null);
    log(s, '나가리!');
    return;
  }
  const wd = scoreDetail(s.caps[winner]);
  let points = withGo(wd.total, s.goCount[winner]);
  if (opt.samppeok) points = Math.max(points, 7);
  const baseMult = 2 ** (s.shake[winner] + s.bomb[winner]);
  const lines = [];
  const pays = s.seats.map(() => 0);
  const flags = s.seats.map(() => []);
  for (let l = 0; l < s.n; l++) {
    if (l === winner) continue;
    const ld = scoreDetail(s.caps[l]);
    let m = baseMult;
    const piLimit = s.n === 2 ? 7 : 5;
    if (wd.piPts > 0 && ld.piVal <= piLimit) { m *= 2; flags[l].push('피박'); }
    if (wd.gwPts > 0 && ld.gc === 0) { m *= 2; flags[l].push('광박'); }
    if (wd.yc >= 7) { m *= 2; flags[l].push('멍박'); }
    pays[l] = points * m;
  }
  // 고박: 고를 외쳤다가 진 사람이 모두 독박
  const gobak = s.seats.map((_, i) => i).filter(i => i !== winner && s.goCount[i] > 0);
  if (gobak.length && s.n > 2) {
    const total = pays.reduce((a, b) => a + b, 0);
    const g = gobak[0];
    for (let i = 0; i < s.n; i++) if (i !== winner) { pays[i] = 0; if (i !== g) flags[i] = ['고박 면제']; }
    pays[g] = total; flags[g].push('고박(독박)');
  } else if (gobak.length) {
    pays[gobak[0]] *= 2; flags[gobak[0]].push('고박');
  }
  if (s.mult > 1) { for (let i = 0; i < s.n; i++) pays[i] *= s.mult; lines.push(`나가리 판 x${s.mult}`); }
  if (s.shake[winner]) lines.push(`흔들기 x${2 ** s.shake[winner]}`);
  if (s.bomb[winner]) lines.push(`폭탄 x${2 ** s.bomb[winner]}`);
  if (s.goCount[winner]) lines.push(`${s.goCount[winner]}고`);
  s.result = { winner, base: wd.total, points, detail: wd, pays, flags, mults: lines, samppeok: !!opt.samppeok };
  ev(s, 'win', winner, { points });
  for (let l = 0; l < s.n; l++) if (flags[l].includes('피박')) ev(s, 'pibak', winner, { victim: l });
  for (let l = 0; l < s.n; l++) if (flags[l].includes('광박')) ev(s, 'gwangbak', winner, { victim: l });
  log(s, `🏆 ${nm(s, winner)} 승리! ${points}점`);
}
