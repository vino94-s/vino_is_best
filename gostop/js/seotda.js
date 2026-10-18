// 섯다 규칙 엔진 (2~4인, 2장/3장). 상태는 JSON 직렬화 가능한 순수 객체.
import { CARDS } from './cards.js?v=20261018i';

// 1~10월, 달마다 2장 (광·열끗·띠). 화투 그림 ID를 그대로 씀
export const SD_DECK = ['01a', '01b', '02a', '02b', '03a', '03b', '04a', '04b', '05a', '05b',
  '06a', '06b', '07a', '07b', '08a', '08b', '09a', '09b', '10a', '10b'];
const GWANG = new Set(['01a', '03a', '08a']);
const mo = id => CARDS[id].month;
export const clone = o => JSON.parse(JSON.stringify(o));
export const MAX_RAISES = 4;      // 한 라운드 최대 레이즈 횟수
export const MAX_REMATCH = 3;     // 연속 재경기 한도 (넘으면 나눠 가짐)

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// ───────────── 족보 ─────────────
// score: 38광땡 1000 > 18·13광땡 900 > 장땡 810 > 9땡~1땡 809~801 > 알리 700 > 독사 690 > 구삥 680 > 장삥 670 > 장사 660 > 세륙 650 > 갑오 509 … 1끗 501 > 망통 500
const KKEUT = k => (k === 9 ? '갑오' : k === 0 ? '망통' : `${k}끗`);
export function handInfo(ids) {
  if (!ids || ids.length < 2) {
    if (ids && ids.length === 1) return { score: null, name: `${mo(ids[0])}월${GWANG.has(ids[0]) ? ' 광' : ''}`, desc: '한 장 더 받아요' };
    return { score: null, name: '', desc: '' };
  }
  const [a, b] = ids;
  const m1 = Math.min(mo(a), mo(b)), m2 = Math.max(mo(a), mo(b));
  const has = id => a === id || b === id;
  if (GWANG.has(a) && GWANG.has(b)) {
    if (m1 === 3 && m2 === 8) return { score: 1000, name: '38광땡', desc: '최고 족보' };
    return { score: 900, name: `${m1}${m2}광땡`, desc: '광땡' };
  }
  if (has('04a') && has('07a')) return { score: 501, name: '암행어사', special: 'amhaeng', desc: '13·18광땡을 잡아요. 아니면 1끗' };
  if (has('03a') && has('07a')) return { score: 500, name: '땡잡이', special: 'ttaengjabi', desc: '1~9땡을 잡아요. 아니면 망통' };
  if (m1 === m2) {
    if (m1 === 10) return { score: 810, name: '장땡', desc: '10땡' };
    return { score: 800 + m1, name: m1 === 1 ? '삥땡' : `${m1}땡`, desc: m1 === 1 ? '1땡' : '땡' };
  }
  if (m1 === 4 && m2 === 9) {
    if (has('04a') && has('09a')) return { score: 503, name: '멍텅구리구사', special: 'mgusa', desc: '상대가 9땡 이하면 재경기. 아니면 3끗' };
    return { score: 503, name: '구사', special: 'gusa', desc: '상대가 알리 이하면 재경기. 아니면 3끗' };
  }
  const pairs = { '1-2': [700, '알리'], '1-4': [690, '독사'], '1-9': [680, '구삥'], '1-10': [670, '장삥'], '4-10': [660, '장사'], '4-6': [650, '세륙'] };
  const p = pairs[`${m1}-${m2}`];
  if (p) return { score: p[0], name: p[1], desc: `${m1}·${m2}` };
  const k = (m1 + m2) % 10;
  return { score: 500 + k, name: KKEUT(k), desc: `${m1}+${m2} = ${k}끗` };
}
const PAIRS3 = [[0, 1], [0, 2], [1, 2]];
/** 3장 중 가장 높은 2장 (특수패는 기본 점수로 비교) */
export function bestPair(ids) {
  if (ids.length <= 2) return ids.slice();
  let best = null, bs = -1;
  for (const [i, j] of PAIRS3) { const p = [ids[i], ids[j]]; const sc = handInfo(p).score; if (sc > bs) { bs = sc; best = p; } }
  return best;
}

/** 쇼다운: hands = {seat: [id,id]} → { rematch: [seats]|null, reason, winners, eff, info } */
export function resolve(hands) {
  const seats = Object.keys(hands).map(Number);
  const info = {}, base = {};
  for (const i of seats) { info[i] = handInfo(hands[i]); base[i] = info[i].score; }
  const maxOpp = i => Math.max(...seats.filter(j => j !== i).map(j => base[j]));
  // 구사 재경기
  for (const i of seats) {
    if (seats.length < 2) break;
    if (info[i].special === 'gusa' && maxOpp(i) <= 700) return { rematch: seats, reason: `${info[i].name}로 재경기`, info, eff: base, winners: [] };
    if (info[i].special === 'mgusa' && maxOpp(i) <= 809) return { rematch: seats, reason: `${info[i].name}로 재경기`, info, eff: base, winners: [] };
  }
  const eff = {}; const caught = {};
  for (const i of seats) {
    eff[i] = base[i];
    const mo2 = seats.length > 1 ? maxOpp(i) : 0;
    if (info[i].special === 'ttaengjabi' && mo2 >= 801 && mo2 <= 809) { eff[i] = 809.5; caught[i] = true; }
    if (info[i].special === 'amhaeng' && mo2 === 900) { eff[i] = 950; caught[i] = true; }
  }
  const top = Math.max(...seats.map(i => eff[i]));
  const winners = seats.filter(i => eff[i] === top);
  if (winners.length > 1) return { rematch: winners, reason: `${info[winners[0]].name} 동점으로 재경기`, info, eff, winners: [], tie: true };
  return { rematch: null, info, eff, winners, caught };
}

// ───────────── 진행 ─────────────
const active = (s, i) => !s.folded[i];
const activeSeats = s => s.seats.map((_, i) => i).filter(i => active(s, i));
const pot = s => s.contrib.reduce((a, b) => a + b, 0) + (s.carry || 0);
export const potOf = pot;
const ev = (s, type, seat, extra = {}) => s.events.push({ type, seat, ...extra });
const log = (s, msg) => { s.log.push(msg); if (s.log.length > 60) s.log.shift(); };
const round100 = v => Math.max(100, Math.round(v / 100) * 100);

/**
 * seats: [{id,name,char,isBot,level}], stacks: [가진 돈], ante: 기본 판돈, cardsMode: 2|3
 */
export function newSeotda({ seats, stacks, ante = 1000, cardsMode = 2, firstSeat = 0 }) {
  const n = seats.length;
  if (n < 2 || n > 4) throw new Error('2~4인만 가능합니다');
  const s = {
    kind: 'seotda', n, seats, ante, cardsMode, stacks: stacks.slice(),
    deck: [], hands: seats.map(() => []), folded: seats.map(() => false),
    contrib: seats.map(() => ante), roundBet: seats.map(() => 0), acted: seats.map(() => false),
    lastAct: seats.map(() => ''), chosen: seats.map(() => null),
    curBet: 0, raises: 0, round: 1, phase: 'bet', turn: firstSeat, first: firstSeat, rematch: 0, carry: 0,
    events: [], evSeq: 0, log: [], result: null, ver: 0, ts: Date.now(),
  };
  deal(s, cardsMode === 3 ? 2 : 1);
  log(s, `기본 판돈 ${ante.toLocaleString()}원씩`);
  startRound(s);
  return s;
}
function deal(s, count) {
  s.deck = shuffle(SD_DECK.filter(id => !s.hands.flat().includes(id)));
  for (let c = 0; c < count; c++) for (const i of activeSeats(s)) s.hands[i].push(s.deck.shift());
}
function dealMore(s) { for (const i of activeSeats(s)) s.hands[i].push(s.deck.shift()); }

function startRound(s) {
  s.roundBet = s.seats.map(() => 0); s.curBet = 0; s.raises = 0;
  s.acted = s.seats.map(() => false);
  s.phase = 'bet';
  s.lastAct = s.seats.map((_, i) => (s.folded[i] ? '다이' : ''));
  s.turn = nextActive(s, s.first - 1);
}
function nextActive(s, from) {
  for (let k = 1; k <= s.n; k++) { const j = (((from + k) % s.n) + s.n) % s.n; if (active(s, j)) return j; }
  return from;
}
/** 남은 사람 중 가장 적게 가진 사람이 따라갈 수 있는 최대 이번 라운드 베팅액 */
function capFor(s) {
  return Math.min(...activeSeats(s).map(j => s.stacks[j] - s.contrib[j] + s.roundBet[j]));
}

export const BET_LABEL = { die: '다이', check: '체크', bbing: '삥', call: '콜', half: '하프', ttadang: '따당' };
export function legalBets(s, seat) {
  if (s.phase !== 'bet' || s.turn !== seat || !active(s, seat)) return [];
  const toCall = s.curBet - s.roundBet[seat];
  const cap = capFor(s);
  const P = pot(s);
  const acts = [{ type: 'die', amount: 0, target: s.roundBet[seat] }];
  if (toCall <= 0) {
    acts.push({ type: 'check', amount: 0, target: s.curBet });
  } else {
    acts.push({ type: 'call', amount: toCall, target: s.curBet });
  }
  if (s.curBet === 0 && cap >= s.ante) acts.push({ type: 'bbing', amount: s.ante - s.roundBet[seat], target: s.ante });
  if (s.raises < MAX_RAISES && cap > s.curBet) {
    const half = Math.min(cap, s.curBet + round100((P + Math.max(0, toCall)) / 2));
    if (half > s.curBet) acts.push({ type: 'half', amount: half - s.roundBet[seat], target: half });
    if (s.curBet > 0) {
      const dd = Math.min(cap, s.curBet * 2);
      if (dd > s.curBet) acts.push({ type: 'ttadang', amount: dd - s.roundBet[seat], target: dd });
    }
  }
  return acts;
}

export function applyBet(state, seat, type) {
  const s = clone(state);
  s.events = [];
  const act = legalBets(s, seat).find(a => a.type === type);
  if (!act) throw new Error('지금은 할 수 없어요');
  const nm = s.seats[seat].name;
  if (type === 'die') {
    s.folded[seat] = true; s.lastAct[seat] = '다이';
    ev(s, 'sd_die', seat); log(s, `${nm} 다이`);
  } else {
    const put = act.target - s.roundBet[seat];
    s.contrib[seat] += put; s.roundBet[seat] = act.target;
    if (act.target > s.curBet) {
      s.curBet = act.target;
      if (type === 'half' || type === 'ttadang') { s.raises++; ev(s, 'sd_raise', seat, { label: BET_LABEL[type] }); }
      s.acted = s.seats.map(() => false);
    }
    s.acted[seat] = true;
    s.lastAct[seat] = put > 0 ? `${BET_LABEL[type]} ${put.toLocaleString()}` : BET_LABEL[type];
    log(s, `${nm} ${s.lastAct[seat]}`);
  }
  afterAction(s, seat);
  s.ver++; s.evSeq++; s.ts = Date.now();
  return s;
}

function afterAction(s, seat) {
  const alive = activeSeats(s);
  if (alive.length === 1) { finish(s, alive, { byFold: true }); return; }
  const done = alive.every(i => s.acted[i] && s.roundBet[i] === s.curBet);
  if (!done) {
    let nx = seat;
    for (let k = 0; k < s.n; k++) {
      nx = nextActive(s, nx);
      if (!(s.acted[nx] && s.roundBet[nx] === s.curBet)) break;
    }
    s.turn = nx;
    return;
  }
  // 라운드 끝
  if (s.round === 1) {
    dealMore(s);
    s.round = 2;
    if (s.cardsMode === 3) {
      s.phase = 'choose';
      s.chosen = s.seats.map(() => null);
      s.turn = -1;
      log(s, '세 번째 패를 받았어요. 2장을 고르세요');
      return;
    }
    startRound(s);
    return;
  }
  showdown(s);
}

export function needsChoice(s, seat) {
  return s.phase === 'choose' && active(s, seat) && !s.chosen[seat];
}
export function applyChoose(state, seat, pair) {
  const s = clone(state);
  s.events = [];
  if (!needsChoice(s, seat)) throw new Error('지금은 고를 수 없어요');
  if (!pair || pair.length !== 2 || pair[0] === pair[1] || !pair.every(id => s.hands[seat].includes(id))) throw new Error('2장을 골라 주세요');
  s.chosen[seat] = pair.slice();
  if (activeSeats(s).every(i => s.chosen[i])) startRound(s);
  s.ver++; s.evSeq++; s.ts = Date.now();
  return s;
}
/** 지금 보여줄 내 족보용 패 (2장 모드는 손패, 3장은 고른 2장 또는 최고 조합) */
export function showHand(s, seat) {
  const h = s.hands[seat];
  if (s.cardsMode === 3 && h.length === 3) return s.chosen[seat] || bestPair(h);
  return h;
}

function showdown(s) {
  const alive = activeSeats(s);
  const hands = {};
  for (const i of alive) hands[i] = s.cardsMode === 3 ? (s.chosen[i] || bestPair(s.hands[i])) : s.hands[i];
  const r = resolve(hands);
  if (r.rematch) {
    s.rematch++;
    if (s.rematch > MAX_REMATCH) { finish(s, r.rematch, { split: true, hands, r }); return; }
    ev(s, 'sd_rematch', r.rematch[0], { label: '재경기' });
    log(s, `${r.reason}!`);
    s.lastShow = { hands, info: r.info, reason: r.reason };
    for (let i = 0; i < s.n; i++) if (!r.rematch.includes(i)) s.folded[i] = true;
    s.hands = s.seats.map(() => []);
    s.chosen = s.seats.map(() => null);
    s.round = 1;
    deal(s, s.cardsMode === 3 ? 2 : 1);
    startRound(s);
    return;
  }
  finish(s, r.winners, { hands, r });
}

function finish(s, winners, { byFold = false, split = false, hands = null, r = null } = {}) {
  s.phase = 'end'; s.turn = -1;
  const P = pot(s);
  const share = Math.floor(P / winners.length);
  const deltas = s.contrib.map(c => -c);
  winners.forEach((w, k) => { deltas[w] += share + (k === 0 ? P - share * winners.length : 0); });
  const info = {};
  if (hands) for (const i of Object.keys(hands)) info[i] = handInfo(hands[i]);
  s.result = { winners, pot: P, deltas, byFold, split, hands, info, caught: r?.caught || {} };
  const w = winners[0];
  const wi = info[w];
  if (!byFold && wi) {
    const big = wi.score >= 801 || (r?.caught && r.caught[w]);
    ev(s, r?.caught?.[w] ? 'sd_catch' : big ? 'sd_ttaeng' : 'sd_win', w, { label: wi.name });
  } else ev(s, 'sd_win', w, { label: byFold ? '다 죽었다!' : '승리' });
  log(s, split ? `무승부, ${P.toLocaleString()}원 나눠 가짐` : `${s.seats[w].name} 승리! ${wi ? wi.name + ' · ' : ''}${P.toLocaleString()}원`);
}

/** 판 접기 (나간 사람 처리용) */
export function forceFold(state, seat) {
  if (state.phase === 'end' || state.folded[seat]) return state;
  const s = clone(state); s.events = [];
  s.folded[seat] = true; s.lastAct[seat] = '다이';
  const alive = activeSeats(s);
  if (alive.length === 1) finish(s, alive, { byFold: true });
  else if (s.phase === 'bet' && (s.turn === seat || alive.every(i => s.acted[i] && s.roundBet[i] === s.curBet))) afterAction(s, s.turn === seat ? seat : s.turn);
  else if (s.phase === 'choose' && activeSeats(s).every(i => s.chosen[i])) startRound(s);
  s.ver++; s.evSeq++; s.ts = Date.now();
  return s;
}
