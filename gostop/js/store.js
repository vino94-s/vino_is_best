// 데이터 계층: Firebase Realtime Database (설정 시) / 이 브라우저 localStorage (미설정 시)
import { FIREBASE_CONFIG, DAILY_CHARGE, START_MONEY } from './config.js';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const genCode = (len = 6, chars = CODE_CHARS) => Array.from(crypto.getRandomValues(new Uint32Array(len)), v => chars[v % chars.length]).join('');
const nickKey = nick => nick.trim().toLowerCase().replace(/[.#$\[\]\/\s]/g, '_');
const emptyStats = () => ({ botGames: 0, botWins: 0, botProfit: 0, onGames: 0, onWins: 0, onProfit: 0, best: 0 });

/** 한국 시간 기준 오늘 날짜 */
export function todayKST() {
  const d = new Date(Date.now() + 9 * 3600 * 1000);
  return d.toISOString().slice(0, 10);
}

function loadScript(src) {
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = src; s.onload = res; s.onerror = () => rej(new Error('스크립트 로드 실패: ' + src));
    document.head.appendChild(s);
  });
}

export const isFirebaseConfigured = () => !!(FIREBASE_CONFIG && FIREBASE_CONFIG.databaseURL && FIREBASE_CONFIG.apiKey);

// ───────────────── Firebase 구현 ─────────────────
class FirebaseStore {
  constructor() { this.mode = 'firebase'; }
  async init() {
    const V = '10.12.2';
    await loadScript(`https://www.gstatic.com/firebasejs/${V}/firebase-app-compat.js`);
    await loadScript(`https://www.gstatic.com/firebasejs/${V}/firebase-database-compat.js`);
    // eslint-disable-next-line no-undef
    this.app = firebase.initializeApp(FIREBASE_CONFIG);
    // eslint-disable-next-line no-undef
    this.db = firebase.database();
  }
  ref(p) { return this.db.ref(p); }
  async get(p) { return (await this.ref(p).get()).val(); }

  async register(nick, char) {
    nick = nick.trim();
    const k = nickKey(nick);
    if (await this.get('nicks/' + k)) throw new Error('이미 있는 닉네임이에요');
    let code;
    for (let i = 0; i < 10; i++) { code = genCode(); if (!(await this.get('users/' + code))) break; }
    const user = { code, nick, char, money: START_MONEY, lastDaily: todayKST(), createdAt: Date.now(), stats: emptyStats() };
    const ok = await this.ref('nicks/' + k).transaction(cur => (cur ? undefined : code));
    if (!ok.committed) throw new Error('이미 있는 닉네임이에요');
    await this.ref('users/' + code).set(user);
    return user;
  }
  async login(code) {
    code = code.trim().toUpperCase();
    const u = await this.get('users/' + code);
    if (!u) return null;
    const today = todayKST();
    let recharged = false;
    if (u.lastDaily !== today) {
      const r = await this.ref('users/' + code).transaction(cur => {
        if (!cur) return cur;
        if (cur.lastDaily === today) return undefined;
        cur.money = (cur.money || 0) + DAILY_CHARGE; cur.lastDaily = today; return cur;
      });
      recharged = r.committed;
    }
    return { user: await this.get('users/' + code), recharged };
  }
  getUser(code) { return this.get('users/' + code); }
  watchUser(code, cb) { const r = this.ref('users/' + code); const f = s => cb(s.val()); r.on('value', f); return () => r.off('value', f); }
  async updateUser(code, fn) {
    const r = await this.ref('users/' + code).transaction(cur => (cur ? fn(cur) : cur));
    return r.snapshot.val();
  }
  async setChar(code, char) { await this.ref(`users/${code}/char`).set(char); }
  async listUsers() { const v = (await this.get('users')) || {}; return Object.values(v); }
  async deleteUser(code) {
    const u = await this.get('users/' + code);
    if (!u) return;
    await this.ref('users/' + code).remove();
    await this.ref('nicks/' + nickKey(u.nick)).remove();
  }
  async logCharge(rec) { await this.ref('adminLog').push(rec); }
  async addMatch(rec) { await this.ref('matches').push(rec); }
  async listMatches(limit = 30) {
    const v = (await this.ref('matches').orderByChild('ts').limitToLast(limit).get()).val() || {};
    return Object.values(v).sort((a, b) => b.ts - a.ts);
  }

  // ── 채팅 ──
  async sendChat(path, msg) { await this.ref(path).push({ ...msg, ts: Date.now() }); }
  watchChat(path, cb) {
    const q = this.ref(path).limitToLast(60);
    const f = s => cb(s.val());
    q.on('child_added', f);
    return () => q.off('child_added', f);
  }

  // ── 방 ──
  async createRoom(me, opts) {
    let code;
    for (let i = 0; i < 20; i++) {
      code = genCode(5, '0123456789');
      const r = await this.ref('rooms/' + code).transaction(cur => (cur && Date.now() - (cur.updatedAt || 0) < 6 * 3600e3 ? undefined : {
        host: me.code, ppoint: opts.ppoint, bonus: opts.bonus, status: 'waiting', createdAt: Date.now(), updatedAt: Date.now(),
        players: { [me.code]: { nick: me.nick, char: opts.char, joinedAt: Date.now(), online: true } },
      }));
      if (r.committed) break;
      code = null;
    }
    if (!code) throw new Error('방을 만들지 못했어요. 다시 시도해 주세요');
    this.markPresence(code, me.code);
    return code;
  }
  async joinRoom(code, me, char) {
    let err = null;
    const r = await this.ref('rooms/' + code).transaction(cur => {
      if (!cur) return null; // 캐시가 비어 있으면 서버 값으로 재시도됨
      cur.players = cur.players || {};
      if (cur.players[me.code]) { cur.players[me.code].online = true; return cur; } // 재접속
      if (cur.status === 'playing') { err = '게임 중인 방이에요. 이번 판이 끝나면 들어올 수 있어요'; return undefined; }
      if (Object.keys(cur.players).length >= 4) { err = '방이 꽉 찼어요 (최대 4명)'; return undefined; }
      if (Object.values(cur.players).some(p => p.char === char)) { err = '다른 사람이 고른 캐릭터예요'; return undefined; }
      cur.players[me.code] = { nick: me.nick, char, joinedAt: Date.now(), online: true };
      cur.updatedAt = Date.now();
      return cur;
    });
    if (!r.committed) throw new Error(err || '입장하지 못했어요');
    if (!r.snapshot.val()) throw new Error('없는 방 코드예요');
    this.markPresence(code, me.code);
    return r.snapshot.val();
  }
  markPresence(code, uc) {
    const p = this.ref(`rooms/${code}/players/${uc}/online`);
    p.set(true);
    p.onDisconnect().set(false);
  }
  async leaveRoom(code, me) {
    await this.ref('rooms/' + code).transaction(cur => {
      if (!cur) return cur;
      if (cur.status === 'playing') { if (cur.players?.[me.code]) cur.players[me.code].online = false; return cur; }
      if (cur.players) delete cur.players[me.code];
      const left = Object.keys(cur.players || {});
      if (!left.length) return null;
      if (cur.host === me.code) cur.host = left.sort((a, b) => cur.players[a].joinedAt - cur.players[b].joinedAt)[0];
      cur.updatedAt = Date.now();
      return cur;
    });
    this.ref(`rooms/${code}/players/${me.code}/online`).onDisconnect().cancel();
  }
  async kick(code, uc) { await this.ref(`rooms/${code}/players/${uc}`).remove(); }
  async changeChar(code, uc, char) {
    let err = null;
    await this.ref('rooms/' + code).transaction(cur => {
      if (!cur?.players?.[uc]) return cur;
      if (Object.entries(cur.players).some(([k, p]) => k !== uc && p.char === char)) { err = '다른 사람이 고른 캐릭터예요'; return undefined; }
      cur.players[uc].char = char; return cur;
    });
    if (err) throw new Error(err);
  }
  watchRoom(code, cb) { const r = this.ref('rooms/' + code); const f = s => cb(s.val()); r.on('value', f); return () => r.off('value', f); }
  async patchRoom(code, patch) { await this.ref('rooms/' + code).update({ ...patch, updatedAt: Date.now() }); }
  /** 낙관적 동시성: 버전이 맞을 때만 반영 */
  async commitGame(code, expectVer, state) {
    const next = { ver: state.ver, json: JSON.stringify(state) };
    const r = await this.ref(`rooms/${code}/game`).transaction(cur => {
      if (!cur) return expectVer === -1 ? next : null; // 캐시 미스면 서버 값으로 재시도
      if (cur.ver !== expectVer) return undefined;
      return next;
    });
    return r.committed && r.snapshot.val()?.ver === state.ver;
  }
  async resetGame(code, state) {
    await this.ref(`rooms/${code}/game`).set({ ver: state.ver, json: JSON.stringify(state) });
  }
  /** 정산 1회 보장용 락 */
  async claimSettle(code, gameId) {
    const r = await this.ref(`rooms/${code}/settled/${gameId}`).transaction(cur => (cur ? undefined : Date.now()));
    return r.committed;
  }
}

// ───────────────── localStorage 구현 (Firebase 미설정 시) ─────────────────
class LocalStore {
  constructor() { this.mode = 'local'; this.subs = {}; }
  async init() {}
  _read(k, d) { try { return JSON.parse(localStorage.getItem('smj_' + k)) ?? d; } catch { return d; } }
  _write(k, v) { try { localStorage.setItem('smj_' + k, JSON.stringify(v)); } catch { /* 저장 불가 */ } this._emit(k); }
  _emit(k) { (this.subs[k] || []).forEach(f => f()); }
  _on(k, f) { (this.subs[k] = this.subs[k] || []).push(f); return () => { this.subs[k] = this.subs[k].filter(x => x !== f); }; }
  async register(nick, char) {
    nick = nick.trim();
    const users = this._read('users', {});
    if (Object.values(users).some(u => nickKey(u.nick) === nickKey(nick))) throw new Error('이미 있는 닉네임이에요');
    let code; do { code = genCode(); } while (users[code]);
    users[code] = { code, nick, char, money: START_MONEY, lastDaily: todayKST(), createdAt: Date.now(), stats: emptyStats() };
    this._write('users', users);
    return users[code];
  }
  async login(code) {
    code = code.trim().toUpperCase();
    const users = this._read('users', {});
    const u = users[code];
    if (!u) return null;
    let recharged = false;
    if (u.lastDaily !== todayKST()) { u.money += DAILY_CHARGE; u.lastDaily = todayKST(); recharged = true; this._write('users', users); }
    return { user: u, recharged };
  }
  async getUser(code) { return this._read('users', {})[code] || null; }
  watchUser(code, cb) { const f = () => cb(this._read('users', {})[code] || null); f(); return this._on('users', f); }
  async updateUser(code, fn) {
    const users = this._read('users', {});
    if (!users[code]) return null;
    const r = fn(users[code]);
    if (r) users[code] = r;
    this._write('users', users);
    return users[code];
  }
  async setChar(code, char) { await this.updateUser(code, u => { u.char = char; return u; }); }
  async listUsers() { return Object.values(this._read('users', {})); }
  async deleteUser(code) { const u = this._read('users', {}); delete u[code]; this._write('users', u); }
  async logCharge() {}
  async addMatch(rec) { const m = this._read('matches', []); m.push(rec); this._write('matches', m.slice(-100)); }
  async listMatches(limit = 30) { return this._read('matches', []).slice(-limit).reverse(); }
  async sendChat(path, msg) { const m = { ...msg, ts: Date.now() }; (this.subs['chat:' + path] || []).forEach(f => f(m)); }
  watchChat(path, cb) { return this._on('chat:' + path, cb); }
  _noOnline() { throw new Error('온라인 대결은 Firebase 설정 후 사용할 수 있어요 (README 참고)'); }
  createRoom() { this._noOnline(); }
  joinRoom() { this._noOnline(); }
}

export async function createStore() {
  if (isFirebaseConfigured()) {
    const s = new FirebaseStore();
    try { await s.init(); return s; } catch (e) { console.error(e); }
  }
  const l = new LocalStore(); await l.init(); return l;
}

/** 게임 결과 반영 (돈은 0 아래로 내려가지 않음). 실제 변동액 반환 */
export async function applyResult(store, code, { mode, win, delta }) {
  let applied = 0;
  await store.updateUser(code, u => {
    u.stats = { ...emptyStats(), ...(u.stats || {}) };
    const before = u.money || 0;
    u.money = Math.max(0, before + delta);
    applied = u.money - before;
    if (mode === 'bot') { u.stats.botGames++; if (win) u.stats.botWins++; u.stats.botProfit += applied; }
    else { u.stats.onGames++; if (win) u.stats.onWins++; u.stats.onProfit += applied; }
    if (win) u.stats.best = Math.max(u.stats.best || 0, applied);
    return u;
  });
  return applied;
}
