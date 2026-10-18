// 손모가지 조심! — 화면과 게임 진행
import { CARDS, MONTHS, RIBBON_NAME } from './cards.js?v=20261018c';
import { newGame, applyPlay, applyGoStop, legalMoves, scoreDetail, withGo } from './engine.js?v=20261018c';
import { botMove, botGoStop } from './bot.js?v=20261018c';
import { newSeotda, applyBet, applyChoose, legalBets, needsChoice, handInfo, bestPair, showHand, potOf, BET_LABEL } from './seotda.js?v=20261018c';
import { botBet, botChoose } from './seotda-bot.js?v=20261018c';
import { CHARACTERS, charById, EVENT_INFO, tauntFor } from './characters.js?v=20261018c';
import { createStore, applyResult } from './store.js?v=20261018c';
import { ADMIN, POINT_VALUES, TURN_TIMEOUT_SEC, DAILY_CHARGE, SHEET_API } from './config.js?v=20261018c';

// ───────────────── 유틸 ─────────────────
const $ = (sel, root = document) => root.querySelector(sel);
function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'style') el.style.cssText = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'value') el.value = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}
const won = n => `${Math.round(n).toLocaleString('ko-KR')}원`;
const signed = n => (n > 0 ? '+' : n < 0 ? '−' : '') + won(Math.abs(n));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const rid = () => Math.random().toString(36).slice(2, 10);
const ls = {
  get(k, d) { try { const v = localStorage.getItem('smj_' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('smj_' + k, JSON.stringify(v)); } catch { /* 무시 */ } },
  del(k) { try { localStorage.removeItem('smj_' + k); } catch { /* 무시 */ } },
};
async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}
async function copy(text, msg = '복사했어요') {
  try { await navigator.clipboard.writeText(text); toast(msg); }
  catch { prompt('복사해서 쓰세요', text); }
}

// 닉네임별 개인코드를 운영 시트에 기록 (Apps Script 웹 앱)
function logCodeToSheet(u, code) {
  if (!SHEET_API || !code) return;
  try {
    fetch(SHEET_API, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ code, nick: u.nick, char: charById(u.char).name }) }).catch(() => {});
  } catch { /* 무시 */ }
}
async function reissueCode(u) {
  if (!(await confirmModal(`${u.nick}에게 새 코드를 줄까요?`, '코드를 잃어버렸을 때 써요. 예전 코드도 그대로 쓸 수 있어요.', '발급'))) return;
  try { const code = await S.store.issueCode(u.pid); logCodeToSheet(u, code); showIssuedCode({ ...u, code }, () => {}); }
  catch (x) { toast(x.message); }
}

// ───────────────── 전역 상태 ─────────────────
const S = {
  store: null, me: null, unsubMe: null, game: null,
  room: null, // { code, unsub, data }
  admin: sessionStorage.getItem('smj_admin') === '1',
  pendingRoom: new URLSearchParams(location.search).get('room'),
  lobbyChat: null,
  kind: ls.get('kind', 'gostop') === 'seotda' ? 'seotda' : 'gostop',
};

// 어드민 버튼 공개: ?owner=<revealKey> 로 한 번 들어오면 이 기기에 기억
(() => {
  const p = new URLSearchParams(location.search);
  const k = p.get('owner');
  if (k && k === ADMIN.revealKey) { ls.set('owner', k); toastLater('이 기기에 어드민 버튼을 켰어요'); }
  if (k) { p.delete('owner'); history.replaceState(null, '', location.pathname + (p.toString() ? '?' + p : '')); }
})();
const ownerDevice = () => ls.get('owner') === ADMIN.revealKey;
function toastLater(m) { setTimeout(() => toast(m), 600); }

// ───────────────── 소리 ─────────────────
const Snd = {
  on: ls.get('snd', true), ctx: null,
  tone(freq, dur = .08, type = 'square', vol = .05, delay = 0) {
    if (!this.on) return;
    try {
      this.ctx = this.ctx || new (window.AudioContext || window.webkitAudioContext)();
      const t = this.ctx.currentTime + delay;
      const o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.type = type; o.frequency.setValueAtTime(freq, t);
      g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
      o.connect(g).connect(this.ctx.destination); o.start(t); o.stop(t + dur + .02);
    } catch { /* 소리 불가 */ }
  },
  tap() { this.tone(180, .06, 'triangle', .12); },
  stamp() { this.tone(90, .18, 'sawtooth', .09); this.tone(520, .12, 'square', .04, .12); this.tone(780, .16, 'square', .04, .22); },
  win() { [523, 659, 784, 1046].forEach((f, i) => this.tone(f, .16, 'square', .05, i * .11)); },
  toggle() { this.on = !this.on; ls.set('snd', this.on); },
};

// ───────────────── 공통 UI ─────────────────
function show(id) {
  document.querySelectorAll('#app > section').forEach(s => s.classList.toggle('hidden', s.id !== id));
  window.scrollTo(0, 0);
}
let toastTimer;
function toast(msg, ms = 2400) {
  const root = $('#toast-root');
  root.replaceChildren(h('div', { class: 'toast', role: 'status' }, msg));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => root.replaceChildren(), ms);
}
const modalStack = [];
function openModal(content, { dismiss = true } = {}) {
  const box = h('div', { class: 'box', role: 'dialog', 'aria-modal': 'true' }, content);
  const wrap = h('div', { class: 'modal' }, box);
  const close = () => { wrap.remove(); const i = modalStack.indexOf(close); if (i >= 0) modalStack.splice(i, 1); };
  close.dismiss = dismiss;
  if (dismiss) wrap.addEventListener('click', e => { if (e.target === wrap) close(); });
  $('#modal-root').append(wrap);
  modalStack.push(close);
  setTimeout(() => (box.querySelector('input,button.primary,button') || box).focus?.(), 30);
  return close;
}
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && modalStack.length && modalStack[modalStack.length - 1].dismiss) modalStack[modalStack.length - 1]();
});
function confirmModal(title, body, okText = '확인', cancelText = '취소') {
  return new Promise(res => {
    const close = openModal([
      h('h3', {}, title), body ? h('p', { class: 'muted', style: 'margin:0' }, body) : null,
      h('div', { class: 'row' },
        h('button', { class: 'btn ghost grow', onclick: () => { close(); res(false); } }, cancelText),
        h('button', { class: 'btn red grow primary', onclick: () => { close(); res(true); } }, okText)),
    ]);
  });
}
const avatar = (charId, cls = '') => h('img', { class: `avatar ${cls}`, src: charById(charId).img, alt: charById(charId).name });
function seg(options, value, onChange) {
  const el = h('div', { class: 'seg', role: 'group' });
  const draw = v => {
    el.replaceChildren(...options.map(o => h('button', {
      type: 'button', 'aria-pressed': String(o.v === v),
      onclick: () => { draw(o.v); onChange(o.v); },
    }, o.label)));
  };
  draw(value);
  return el;
}
function charPicker(selected, onChange, taken = []) {
  const el = h('div', { class: 'char-grid' });
  const draw = sel => el.replaceChildren(...CHARACTERS.map(c => h('button', {
    type: 'button', class: 'char-opt', 'aria-pressed': String(c.id === sel), disabled: taken.includes(c.id) && c.id !== sel,
    onclick: () => { draw(c.id); onChange(c.id); },
  }, h('img', { src: c.img, alt: '' }), h('span', {}, c.name))));
  draw(selected);
  return el;
}
const titleStamp = () => h('div', { class: 'title-stamp' }, '손모가지', h('br'), '조심!', h('small', {}, '고스톱 · 섯다 · 최대 4인'));
const modeNote = () => S.store.mode === 'local'
  ? h('p', { class: 'mode-note' }, '지금은 이 브라우저에만 저장돼요. 온라인 대결과 공유 랭킹은 Firebase 연결 후 열려요.')
  : null;

// ───────────────── 카드 그리기 ─────────────────
function cardLabel(c) {
  if (c.bonus) return c.name;
  const t = c.type === 'gwang' ? '광' : c.type === 'yeol' ? '열끗' : c.type === 'tti' ? RIBBON_NAME[c.ribbon] : c.val >= 2 ? '쌍피' : '피';
  return `${c.month}월 ${MONTHS[c.month]} ${t}`;
}
const CARD_IMG = id => `assets/cards/${id}.webp?v=${ASSET_V}`;
const ASSET_V = '1';
function cardEl(id, cls = '', tag = 'div', props = {}) {
  if (id === 'BOMB') return h(tag, { class: `card back ${cls}`, 'aria-label': '폭탄 패 (뒤집기만 해요)', ...props }, h('span', { class: 'mo', style: 'color:#fff;z-index:1' }, '폭탄'), h('span', { class: 'ic', style: 'z-index:1' }, '💣'), h('span'));
  const c = CARDS[id];
  if (!c) return h(tag, { class: `card back ${cls}`, 'aria-hidden': 'true', ...props });
  const k = ['card', 'art', c.type, cls];
  if (c.bonus) k.push('bonus');
  return h(tag, { class: k.join(' '), 'aria-label': cardLabel(c), title: cardLabel(c), ...props },
    h('img', { src: CARD_IMG(id), alt: '', draggable: 'false', decoding: 'async' }));
}
// 첫 판에 그림이 늦게 뜨지 않게 미리 받아 두기
function preloadCards() {
  for (const id of Object.keys(CARDS)) { const im = new Image(); im.decoding = 'async'; im.src = CARD_IMG(id); }
}
function groupCaps(caps) {
  const d = scoreDetail(caps);
  const g = { gwang: [], yeol: [], tti: [], pi: [] };
  for (const id of caps) {
    const c = CARDS[id];
    if (c.gukjin && d.gukjinAsPi) g.pi.push(id); else g[c.type].push(id);
  }
  return { g, d };
}

// ───────────────── 조롱 연출 ─────────────────
const Taunt = {
  queue: [], running: false, waiters: [],
  push(item) { this.queue.push(item); if (!this.running) this.run(); },
  idle() { return this.running || this.queue.length ? new Promise(r => this.waiters.push(r)) : Promise.resolve(); },
  async run() {
    this.running = true;
    const root = $('#taunt-root');
    while (this.queue.length) {
      const it = this.queue.shift();
      const c = charById(it.char);
      const parts = (c.parts || []).flatMap(p => [p, p]).map((p, i) => h('span', {
        class: 'part', style: `left:50%;top:40%;--dx:${Math.round(Math.cos(i * 1.1) * 160)}px;--dy:${Math.round(Math.sin(i * 1.1) * 140 - 40)}px;--rot:${i * 47}deg`,
      }, p));
      const el = h('div', { class: `taunt fx-${c.fx} ${it.big ? '' : 'small'}` },
        h('img', { class: 'face', src: c.img, alt: c.name }),
        h('div', { class: 'stamp' }, it.label),
        h('div', { class: 'who' }, it.name),
        h('div', { class: 'bubble' }, it.line),
        parts);
      root.classList.remove('hidden');
      root.replaceChildren(el);
      Snd.stamp();
      await sleep(it.big ? 1500 : 1050);
      el.classList.add('out');
      await sleep(260);
    }
    root.classList.add('hidden');
    root.replaceChildren();
    this.running = false;
    this.waiters.splice(0).forEach(r => r());
  },
  clear() { this.queue = []; },
};

// ───────────────── 채팅 ─────────────────
class Chat {
  constructor({ path = null, onLocalSend = null, title = null } = {}) {
    this.path = path; this.onLocalSend = onLocalSend; this.unread = 0; this.onUnread = null; this.open = true;
    this.log = h('div', { class: 'chat-log', 'aria-live': 'polite' });
    const input = h('input', { maxlength: 120, placeholder: '한마디 하기', 'aria-label': '채팅 입력', autocomplete: 'off' });
    this.el = h('div', { class: 'chat' },
      this.log,
      h('form', { class: 'chat-form', onsubmit: e => { e.preventDefault(); this.send(input.value); input.value = ''; } },
        input, h('button', { class: 'btn small gold', type: 'submit' }, '보내기')));
    if (title) this.el.prepend(h('div', { class: 'label', style: 'padding:8px 10px 0;color:var(--on-felt-muted)' }, title));
    if (path) this.unsub = S.store.watchChat(path, m => m && this.msg(m));
  }
  send(text) {
    text = (text || '').trim();
    if (!text || !S.me) return;
    const m = { nick: S.me.nick, char: S.me.char, text };
    if (this.path) S.store.sendChat(this.path, m).catch(() => toast('채팅을 보내지 못했어요'));
    else { this.msg({ ...m, ts: Date.now() }); this.onLocalSend?.(text); }
  }
  bump() { if (!this.open) { this.unread++; this.onUnread?.(this.unread); } }
  scroll() { this.log.scrollTop = this.log.scrollHeight; }
  msg(m) {
    this.log.append(h('div', { class: 'm' }, avatar(m.char, ''), h('div', {}, h('b', {}, m.nick), m.text)));
    this.trim(); this.scroll(); this.bump();
  }
  sys(text) { this.log.append(h('div', { class: 'sys' }, text)); this.trim(); this.scroll(); }
  taunt(char, name, text) {
    this.log.append(h('div', { class: 'm taunt' }, avatar(char), h('div', {}, h('b', {}, name), text)));
    this.trim(); this.scroll(); this.bump();
  }
  trim() { while (this.log.children.length > 120) this.log.firstChild.remove(); }
  destroy() { this.unsub?.(); }
}

// ───────────────── 로그인 ─────────────────
function renderLogin(errMsg = '') {
  const codeIn = h('input', { class: 'field code', maxlength: 6, placeholder: '내 코드', 'aria-label': '내 코드', autocomplete: 'off', value: ls.get('code', '') || '' });
  const err = h('p', { class: 'err' }, errMsg);
  const nickIn = h('input', { class: 'field', maxlength: 10, placeholder: '닉네임 (2~10자)', 'aria-label': '닉네임' });
  let char = CHARACTERS[Math.floor(Math.random() * CHARACTERS.length)].id;
  const err2 = h('p', { class: 'err' });
  const loginBtn = h('button', { class: 'btn red', type: 'submit' }, '입장하기');
  const regBtn = h('button', { class: 'btn', type: 'submit' }, '내 코드 받기');

  $('#scr-login').replaceChildren(h('div', { class: 'wrap' },
    h('img', { class: 'poster', src: 'thumb.jpg', alt: '손모가지 조심! 12명의 캐릭터와 함께하는 스릴 만점 고스톱' }), modeNote(),
    h('form', {
      class: 'panel stack', onsubmit: async e => {
        e.preventDefault(); loginBtn.disabled = true;
        try { const ok = await doLogin(codeIn.value); if (!ok) err.textContent = '없는 코드예요. 대문자·숫자 6자리를 확인하세요'; }
        catch (x) { err.textContent = x.message; }
        loginBtn.disabled = false;
      },
    }, h('h2', {}, '코드로 입장'), codeIn, loginBtn, err),
    h('form', {
      class: 'panel stack', onsubmit: async e => {
        e.preventDefault();
        const nick = nickIn.value.trim();
        if (nick.length < 2) { err2.textContent = '닉네임은 2자 이상이에요'; return; }
        regBtn.disabled = true;
        try {
          const u = await S.store.register(nick, char);
          logCodeToSheet(u, u.code);
          showIssuedCode(u, () => doLogin(u.code));
        } catch (x) { err2.textContent = x.message; }
        regBtn.disabled = false;
      },
    }, h('h2', {}, '처음 왔어요'),
    h('p', { class: 'muted', style: 'margin:0' }, `닉네임을 정하면 나만의 입장 코드를 드려요. 가입하면 ${won(DAILY_CHARGE)}, 그 뒤로 매일 ${won(DAILY_CHARGE)}씩 충전돼요.`),
    nickIn, h('span', { class: 'label' }, '내 캐릭터'), charPicker(char, v => { char = v; }), regBtn, err2),
    adminDoor(true),
  ));
  show('scr-login');
}
function showIssuedCode(u, onGo) {
  const close = openModal([
    h('h3', {}, `${u.nick}님의 입장 코드`),
    h('div', { class: 'room-code' }, u.code),
    h('p', { class: 'muted', style: 'margin:0' }, '다음에 들어올 때 이 코드만 있으면 돼요. 꼭 저장해 두세요. 잃어버리면 운영자에게 물어보세요.'),
    h('div', { class: 'row' },
      h('button', { class: 'btn ghost grow', onclick: () => copy(u.code, '코드를 복사했어요') }, '코드 복사'),
      h('button', { class: 'btn red grow primary', onclick: () => { close(); onGo(); } }, '바로 입장')),
  ], { dismiss: false });
}
function leaveAdmin() {
  if (S.room && S.room.data && !S.game) return renderRoom(S.room.data);
  if (S.game) return show('scr-game');
  return S.me ? renderLobby() : renderLogin();
}
function adminDoor(always = false) {
  if (!always && !ownerDevice()) return null;
  return h('button', { class: 'btn ghost small admin-door', style: 'color:var(--on-felt)', onclick: openAdminLogin }, '어드민계정 로그인');
}
async function doLogin(code) {
  const res = await S.store.login(code);
  if (!res) return false;
  S.me = res.user;
  ls.set('code', S.me.code);
  S.unsubMe?.();
  S.unsubMe = S.store.watchUser(S.me.pid, u => { if (u && S.me) { S.me = { ...u, code: S.me.code }; refreshWallet(); } });
  if (res.migrated) logCodeToSheet(S.me, S.me.code);
  if (res.recharged) toastLater(`오늘의 ${won(DAILY_CHARGE)} 충전 완료!`);
  if (S.pendingRoom) renderLobby(); else renderSelect();
  if (S.pendingRoom) {
    const c = S.pendingRoom; S.pendingRoom = null;
    // 초대 링크·새로고침: 바로 들어가 보고, 안 되면 입장 창을 연다
    try { if (S.store.mode !== 'firebase') throw new Error(); await S.store.joinRoom(c, S.me, lastOpts().char); enterRoom(c); }
    catch { openJoin(c); }
  }
  return true;
}
function logout() {
  S.unsubMe?.(); S.unsubMe = null; S.me = null; ls.del('code');
  renderLogin();
}
function refreshWallet() {
  document.querySelectorAll('[data-wallet]').forEach(el => { el.textContent = won(S.me?.money || 0); });
  if (!$('#scr-lobby').classList.contains('hidden')) {
    const broke = $('#broke');
    if (broke) broke.classList.toggle('hidden', (S.me?.money || 0) > 0);
  }
}

// ───────────────── 게임 고르기 ─────────────────
const KIND_NAME = { gostop: '고스톱', seotda: '섯다' };
function renderSelect() {
  leaveRoomSilently();
  S.lobbyChat?.destroy(); S.lobbyChat = null;
  const pick = k => { S.kind = k; ls.set('kind', k); renderLobby(); };
  const fan = ids => h('div', { class: 'fan' }, ids.map(id => h('img', { src: CARD_IMG(id), alt: '' })));
  $('#scr-select').replaceChildren(h('div', { class: 'wrap' },
    titleStamp(),
    h('p', { class: 'select-hi' }, `${S.me.nick}님, 오늘은 뭐 칠까요?`),
    h('div', { class: 'pick-game' },
      h('button', { class: 'game-pick', onclick: () => pick('gostop') }, fan(['08a', '11a', '03a']), h('b', {}, '고스톱'), h('span', {}, '최대 4인 · 고도리·싹쓸·뻑 조롱')),
      h('button', { class: 'game-pick', onclick: () => pick('seotda') }, fan(['03a', '08a']), h('b', {}, '섯다'), h('span', {}, '광땡·땡잡이 · 판돈 걸고 베팅'))),
    h('p', { class: 'mode-note' }, '보유 자산 ', h('b', { 'data-wallet': '' }, won(S.me.money)), '은 두 게임에서 같이 써요'),
    h('div', { class: 'row', style: 'justify-content:center' },
      adminDoor(true),
      h('button', { class: 'btn ghost small', style: 'color:var(--on-felt)', onclick: logout }, '로그아웃')),
  ));
  show('scr-select');
}

// ───────────────── 로비 ─────────────────
function renderLobby() {
  leaveRoomSilently();
  S.lobbyChat?.destroy(); S.lobbyChat = null;
  const me = S.me;
  const online = S.store.mode === 'firebase';
  if (online) S.lobbyChat = new Chat({ path: 'lobbyChat', title: '대기실 수다' });
  $('#scr-lobby').replaceChildren(h('div', { class: 'wrap' },
    h('div', { class: 'topbar' },
      h('button', { class: 'icon-btn', style: 'padding:0;background:none', 'aria-label': '내 캐릭터 바꾸기', onclick: changeMyChar }, avatar(me.char, 'lg')),
      h('div', { class: 'who' }, h('b', {}, me.nick),
        h('span', {}, '내 코드 ', h('button', { class: 'icon-btn', style: 'padding:1px 6px;font-size:12px', onclick: () => copy(me.code, '내 코드를 복사했어요') }, me.code))),
      h('div', { class: 'wallet' }, h('span', { class: 'money', 'data-wallet': '' }, won(me.money)), h('small', {}, '보유 자산'))),
    h('div', { id: 'broke', class: `broke ${me.money > 0 ? 'hidden' : ''}` },
      h('b', {}, '게임머니를 다 잃었어요'), `내일 0시에 ${won(DAILY_CHARGE)}이 충전돼요.`),
    h('div', { class: 'kind-bar' },
      h('b', {}, KIND_NAME[S.kind]),
      h('button', { class: 'btn ghost small', onclick: renderSelect }, S.kind === 'seotda' ? '고스톱으로 바꾸기' : '섯다로 바꾸기')),
    h('div', { class: 'play-grid' },
      h('button', { class: 'btn red wide', onclick: () => (S.kind === 'seotda' ? openSeotdaSetup() : openBotSetup()) }, '봇이랑 치기'),
      h('button', { class: 'btn gold', onclick: openCreateRoom }, '방 만들기'),
      h('button', { class: 'btn gold', onclick: () => openJoin('') }, '코드로 입장'),
      h('button', { class: 'btn ghost wide', style: 'color:var(--on-felt)', onclick: () => renderRank(S.kind === 'seotda' ? 'seotda' : 'bot') }, '랭킹 보기')),
    online ? S.lobbyChat.el : null,
    rulesPanel(),
    h('div', { class: 'row', style: 'justify-content:center' },
      adminDoor(true),
      h('button', { class: 'btn ghost small', style: 'color:var(--on-felt)', onclick: logout }, '로그아웃')),
    modeNote(),
  ));
  show('scr-lobby');
}
function rulesPanel() {
  if (S.kind === 'seotda') return seotdaRules();
  return h('details', { class: 'panel' },
    h('summary', { style: 'font-weight:700;cursor:pointer' }, '점수 규칙 보기'),
    h('div', { class: 'stack', style: 'margin-top:10px;font-size:14px' },
      h('p', { style: 'margin:0' }, '2인은 7점, 3·4인은 3점 이상 나면 고 또는 스톱. 고는 1고 +1점, 2고 +2점, 3고부터 점수가 두 배씩 불어나요.'),
      h('p', { style: 'margin:0' }, '광: 3광 3점(비광 끼면 2점), 4광 4점, 5광 15점. 열끗·띠는 5장부터 1점씩, 피는 10장부터 1점씩. 고도리 5점, 홍단·청단·초단 각 3점.'),
      h('p', { style: 'margin:0' }, '쪽·따닥·싹쓸·뻑 먹기·폭탄이면 상대마다 피 1장씩 뺏어요. 3뻑이면 바로 승리.'),
      h('p', { style: 'margin:0' }, '피박·광박·멍박, 흔들기·폭탄은 각각 두 배. 고 부르고 진 사람은 고박으로 독박. 나가리 다음 판은 두 배.'),
      h('p', { style: 'margin:0' }, '보너스피는 판마다 0~2장(쌍피·쓰리피) 중에서 골라요.'),
      h('p', { class: 'muted', style: 'margin:0;font-size:12px' }, '화투 그림: Louie Mantia의 하나후다 그림을 화투에 맞게 고침 (CC BY-SA 4.0)')));
}
function seotdaRules() {
  const P = txt => h('p', { style: 'margin:0' }, txt);
  return h('details', { class: 'panel' },
    h('summary', { style: 'font-weight:700;cursor:pointer' }, '섯다 규칙 보기'),
    h('div', { class: 'stack', style: 'margin-top:10px;font-size:14px' },
      P('모두 기본 판돈을 내고 시작해요. 2장 섯다는 1장 받고 베팅, 1장 더 받고 베팅. 3장 섯다는 2장 받고 베팅, 1장 더 받아 2장을 고른 뒤 베팅해요.'),
      P('베팅: 체크(그냥 넘김), 삥(기본 판돈만큼), 콜(따라가기), 하프(판돈 절반만큼 올리기), 따당(지금 베팅의 두 배), 다이(포기). 남은 사람 중 가장 적게 가진 사람이 따라올 수 있는 만큼까지만 올릴 수 있어요.'),
      P('족보: 38광땡 > 18·13광땡 > 장땡 > 9땡 … 삥땡 > 알리(1·2) > 독사(1·4) > 구삥(1·9) > 장삥(1·10) > 장사(4·10) > 세륙(4·6) > 갑오(9끗) > 8끗 … 1끗 > 망통(0끗).'),
      P('특수패: 암행어사(4·7 열끗)는 13·18광땡을, 땡잡이(3광·7 열끗)는 1~9땡을 잡아요. 구사(4·9)는 상대가 알리 이하면, 멍텅구리구사(4·9 열끗)는 9땡 이하면 재경기. 같은 족보끼리도 재경기예요. 재경기가 세 번 넘으면 판돈을 나눠요.'),
      h('p', { class: 'muted', style: 'margin:0;font-size:12px' }, '화투 그림: Louie Mantia의 하나후다 그림을 화투에 맞게 고침 (CC BY-SA 4.0)')));
}
function changeMyChar() {
  let pick = S.me.char;
  const close = openModal([
    h('h3', {}, '내 캐릭터'),
    charPicker(pick, v => { pick = v; }),
    h('button', { class: 'btn red', onclick: async () => { await S.store.setChar(S.me.pid, pick); S.me.char = pick; close(); renderLobby(); } }, '이걸로 할래요'),
  ]);
}

// ───────────────── 게임 설정 모달 ─────────────────
const lastOpts = () => ({ char: S.me.char, bots: 1, level: 'normal', ppoint: 100, bonus: 2, ...ls.get('opts', {}) });
const ppSeg = (o) => seg(POINT_VALUES.map(v => ({ v, label: `${v}원` })), o.ppoint, v => { o.ppoint = v; });
const bonusSeg = (o) => seg([0, 1, 2].map(v => ({ v, label: `${v}장` })), o.bonus, v => { o.bonus = v; });
function needMoney() {
  if ((S.me.money || 0) > 0) return true;
  toast(`게임머니가 없어요. 내일 0시에 ${won(DAILY_CHARGE)}이 충전돼요`);
  return false;
}
function openBotSetup() {
  if (!needMoney()) return;
  const o = lastOpts();
  const help = h('p', { class: 'muted', style: 'margin:0;font-size:13px' });
  const levelHelp = { easy: '아무 패나 막 내요.', normal: '먹을 수 있는 좋은 패부터 챙겨요.', hard: '타짜예요. 다음에 뒤집힐 패를 몰래 보고 쳐요. 손모가지 조심!' };
  help.textContent = levelHelp[o.level];
  const close = openModal([
    h('h3', {}, '봇이랑 치기'),
    h('span', { class: 'label' }, '내 캐릭터'), charPicker(o.char, v => { o.char = v; }),
    h('span', { class: 'label' }, '봇 몇 명'), seg([1, 2, 3].map(v => ({ v, label: `${v}명 (${v + 1}인)` })), o.bots, v => { o.bots = v; }),
    h('span', { class: 'label' }, '난이도'), seg([{ v: 'easy', label: '쉬움' }, { v: 'normal', label: '보통' }, { v: 'hard', label: '어려움' }], o.level, v => { o.level = v; help.textContent = levelHelp[v]; }), help,
    h('span', { class: 'label' }, '점당'), ppSeg(o),
    h('span', { class: 'label' }, '보너스피'), bonusSeg(o),
    h('button', { class: 'btn red primary', onclick: () => { ls.set('opts', o); close(); startBotGame(o); } }, '패 돌리기'),
  ]);
}
const lastSdOpts = () => ({ char: S.me.char, bots: 2, level: 'normal', ante: 1000, cards: 2, ...ls.get('sdopts', {}) });
const ANTES = [1000, 5000, 10000];
const anteSeg = o => seg(ANTES.map(v => ({ v, label: won(v) })), o.ante, v => { o.ante = v; });
const cardsSeg = o => seg([{ v: 2, label: '2장 섯다' }, { v: 3, label: '3장 섯다' }], o.cards, v => { o.cards = v; });
function openSeotdaSetup() {
  if (!needMoney()) return;
  const o = lastSdOpts();
  const levelHelp = { easy: '아무렇게나 걸고 아무 때나 죽어요.', normal: '패가 좋으면 올리고 나쁘면 죽어요.', hard: '타짜예요. 남의 패를 몰래 보고 걸어요. 손모가지 조심!' };
  const help = h('p', { class: 'muted', style: 'margin:0;font-size:13px' }, levelHelp[o.level]);
  const close = openModal([
    h('h3', {}, '봇이랑 섯다'),
    h('span', { class: 'label' }, '내 캐릭터'), charPicker(o.char, v => { o.char = v; }),
    h('span', { class: 'label' }, '봇 몇 명'), seg([1, 2, 3].map(v => ({ v, label: `${v}명 (${v + 1}인)` })), o.bots, v => { o.bots = v; }),
    h('span', { class: 'label' }, '난이도'), seg([{ v: 'easy', label: '쉬움' }, { v: 'normal', label: '보통' }, { v: 'hard', label: '어려움' }], o.level, v => { o.level = v; help.textContent = levelHelp[v]; }), help,
    h('span', { class: 'label' }, '기본 판돈'), anteSeg(o),
    h('span', { class: 'label' }, '패 수'), cardsSeg(o),
    h('button', {
      class: 'btn red primary', onclick: () => {
        if ((S.me.money || 0) < o.ante) { toast(`기본 판돈 ${won(o.ante)}보다 가진 돈이 적어요`); return; }
        ls.set('sdopts', o); close(); startSeotdaBot(o);
      },
    }, '패 돌리기'),
  ]);
}
function openCreateRoom() {
  if (!needMoney()) return;
  if (S.store.mode !== 'firebase') { toast('온라인 대결은 Firebase 연결 후 열려요 (README 참고)'); return; }
  const o = lastOpts();
  const sd = lastSdOpts();
  const kind = S.kind;
  const err = h('p', { class: 'err' });
  const btn = h('button', {
    class: 'btn red primary', onclick: async () => {
      btn.disabled = true;
      try {
        ls.set('opts', o); ls.set('sdopts', { ...sd, char: o.char });
        const code = await S.store.createRoom(S.me, { kind, ppoint: o.ppoint, bonus: o.bonus, ante: sd.ante, cards: sd.cards, char: o.char });
        close(); enterRoom(code);
      } catch (x) { err.textContent = x.message; btn.disabled = false; }
    },
  }, '방 만들기');
  const close = openModal([
    h('h3', {}, `${KIND_NAME[kind]} 방 만들기`),
    h('p', { class: 'muted', style: 'margin:0' }, '코드를 받은 사람이 들어오는 대로 2~4인으로 시작할 수 있어요. 대기실에서 고스톱·섯다를 바꿀 수 있어요.'),
    h('span', { class: 'label' }, '내 캐릭터'), charPicker(o.char, v => { o.char = v; }),
    ...(kind === 'seotda'
      ? [h('span', { class: 'label' }, '기본 판돈'), anteSeg(sd), h('span', { class: 'label' }, '패 수'), cardsSeg(sd)]
      : [h('span', { class: 'label' }, '점당'), ppSeg(o), h('span', { class: 'label' }, '보너스피'), bonusSeg(o)]),
    btn, err,
  ]);
}
function openJoin(prefill) {
  if (!needMoney()) return;
  if (S.store.mode !== 'firebase') { toast('온라인 대결은 Firebase 연결 후 열려요 (README 참고)'); return; }
  const o = lastOpts();
  const codeIn = h('input', { class: 'field code', inputmode: 'numeric', maxlength: 5, placeholder: '방 코드 5자리', value: prefill || '' });
  const err = h('p', { class: 'err' });
  const btn = h('button', {
    class: 'btn red primary', onclick: async () => {
      const code = codeIn.value.trim();
      if (!/^\d{5}$/.test(code)) { err.textContent = '방 코드는 숫자 5자리예요'; return; }
      btn.disabled = true;
      try { ls.set('opts', o); await S.store.joinRoom(code, S.me, o.char); close(); enterRoom(code); }
      catch (x) { err.textContent = x.message; btn.disabled = false; }
    },
  }, '입장하기');
  const close = openModal([
    h('h3', {}, '코드로 입장'), codeIn,
    h('span', { class: 'label' }, '내 캐릭터'), charPicker(o.char, v => { o.char = v; }),
    btn, err,
  ]);
}

// ───────────────── 온라인 방 ─────────────────
function enterRoom(code) {
  leaveRoomSilently();
  S.lobbyChat?.destroy(); S.lobbyChat = null;
  S.room = { code, data: null, chat: new Chat({ path: `rooms/${code}/chat`, title: '방 채팅' }) };
  S.room.unsub = S.store.watchRoom(code, d => onRoom(d));
  history.replaceState(null, '', location.pathname + '?room=' + code);
}
function leaveRoomSilently() {
  if (!S.room) return;
  S.room.unsub?.(); S.room.chat?.destroy();
  S.room = null;
  if (S.game) { S.game.destroy(); S.game = null; }
  if (location.search.includes('room=')) history.replaceState(null, '', location.pathname);
}
async function leaveRoom() {
  if (!S.room) return renderLobby();
  const code = S.room.code;
  try { await S.store.leaveRoom(code, S.me); } catch { /* 무시 */ }
  renderLobby();
}
function onRoom(d) {
  if (!S.room) return;
  if (!d) { toast('방이 없어졌어요'); renderLobby(); return; }
  if (!d.players || !d.players[S.me.pid]) { toast('방에서 나왔어요'); renderLobby(); return; }
  S.room.data = d;
  const adminOpen = !$('#scr-admin').classList.contains('hidden');
  const inGame = d.game && d.game.json && (d.status === 'playing' || d.status === 'ended');
  if (inGame) {
    const st = JSON.parse(d.game.json);
    const mySeat = st.seats.findIndex(p => p.id === S.me.pid);
    if (mySeat >= 0) {
      if (!S.game || S.game.gid !== st.gid) {
        S.game?.destroy();
        const G = st.kind === 'seotda' ? SeotdaGame : Game;
        S.game = new G({ mode: 'online', state: st, mySeat, roomCode: S.room.code, chat: S.room.chat });
      } else S.game.onRemote(d.game.json, d);
      S.game.room = d;
      S.game.maybeShowResult();
      return;
    }
  }
  if (S.game) { S.game.destroy(); S.game = null; }
  if (adminOpen) return; // 어드민 화면을 보는 중이면 대기실로 끌고 가지 않음
  renderRoom(d);
}
function renderRoom(d) {
  const code = S.room.code;
  const isHost = d.host === S.me.pid;
  const players = Object.entries(d.players).sort((a, b) => a[1].joinedAt - b[1].joinedAt);
  const onlineCount = players.filter(([, p]) => p.online !== false).length;
  const link = location.origin + location.pathname + '?room=' + code;
  const slots = [0, 1, 2, 3].map(i => {
    const e = players[i];
    if (!e) return h('div', { class: 'slot empty' }, '빈자리');
    const [uc, p] = e;
    return h('div', { class: 'slot' }, avatar(p.char),
      h('div', { class: 'nm grow' }, p.nick, h('small', {}, `${charById(p.char).name}${uc === d.host ? ' · 방장' : ''}`, p.online === false ? h('span', { class: 'off' }, ' · 연결 끊김') : null)),
      isHost && uc !== S.me.pid ? h('button', { class: 'kick', 'aria-label': `${p.nick} 내보내기`, title: '내보내기', onclick: () => S.store.kick(code, uc) }, '✕') : null);
  });
  const ppoint = d.ppoint, bonus = d.bonus;
  const kind = d.kind || 'gostop', ante = d.ante || 1000, cards = d.cards || 2;
  const settings = isHost
    ? h('div', { class: 'stack' },
      h('span', { class: 'label' }, '게임'), seg([{ v: 'gostop', label: '고스톱' }, { v: 'seotda', label: '섯다' }], kind, v => S.store.patchRoom(code, { kind: v })),
      ...(kind === 'seotda'
        ? [h('span', { class: 'label' }, '기본 판돈'), seg(ANTES.map(v => ({ v, label: won(v) })), ante, v => S.store.patchRoom(code, { ante: v })),
          h('span', { class: 'label' }, '패 수'), seg([{ v: 2, label: '2장 섯다' }, { v: 3, label: '3장 섯다' }], cards, v => S.store.patchRoom(code, { cards: v }))]
        : [h('span', { class: 'label' }, '점당'), seg(POINT_VALUES.map(v => ({ v, label: `${v}원` })), ppoint, v => S.store.patchRoom(code, { ppoint: v })),
          h('span', { class: 'label' }, '보너스피'), seg([0, 1, 2].map(v => ({ v, label: `${v}장` })), bonus, v => S.store.patchRoom(code, { bonus: v }))]))
    : h('p', { class: 'muted', style: 'margin:0' }, kind === 'seotda' ? `섯다 · 기본 판돈 ${won(ante)} · ${cards}장 섯다` : `고스톱 · 점당 ${won(ppoint)} · 보너스피 ${bonus}장`);
  $('#scr-room').replaceChildren(h('div', { class: 'wrap' },
    h('div', { class: 'panel stack' },
      h('div', { class: 'row' }, h('h2', { class: 'grow', style: 'margin:0' }, `대기실 · ${KIND_NAME[kind]}`), h('span', { class: 'muted' }, `${players.length}/4명`)),
      h('div', { class: 'room-code', 'aria-label': `방 코드 ${code}` }, code),
      h('div', { class: 'row' },
        h('button', { class: 'btn ghost grow', onclick: () => copy(link, '초대 링크를 복사했어요') }, '초대 링크 복사'),
        navigator.share ? h('button', { class: 'btn ghost grow', onclick: () => navigator.share({ title: '손모가지 조심!', text: `${KIND_NAME[kind]} 한 판? 방 코드 ${code}`, url: link }).catch(() => {}) }, '공유하기') : null),
      h('div', { class: 'slots' }, slots),
      settings,
      h('div', { class: 'row' },
        h('button', { class: 'btn ghost', onclick: () => roomCharChange(d) }, '캐릭터 바꾸기'),
        h('button', { class: 'btn ghost', onclick: leaveRoom }, '나가기'),
        isHost
          ? h('button', { class: 'btn red grow', disabled: onlineCount < 2, onclick: () => hostStart(d) }, onlineCount < 2 ? '한 명 더 기다리는 중' : `${onlineCount}인으로 시작`)
          : h('span', { class: 'grow muted', style: 'text-align:right' }, '방장이 시작하길 기다려요'))),
    S.room.chat.el,
    h('div', { class: 'row', style: 'justify-content:center' }, adminDoor(true)),
  ));
  show('scr-room');
  S.room.chat.scroll();
}
function roomCharChange(d) {
  const taken = Object.entries(d.players).filter(([k]) => k !== S.me.pid).map(([, p]) => p.char);
  let pick = d.players[S.me.pid].char;
  const close = openModal([
    h('h3', {}, '캐릭터 바꾸기'), charPicker(pick, v => { pick = v; }, taken),
    h('button', { class: 'btn red', onclick: async () => { try { await S.store.changeChar(S.room.code, S.me.pid, pick); close(); } catch (x) { toast(x.message); } } }, '바꾸기'),
  ]);
}
async function hostStart(d, prev = null) {
  const code = S.room.code;
  const players = Object.entries(d.players).filter(([, p]) => p.online !== false).sort((a, b) => a[1].joinedAt - b[1].joinedAt);
  if (players.length < 2) { toast('2명 이상 있어야 시작해요'); return; }
  const users = await Promise.all(players.map(([uc]) => S.store.getUser(uc)));
  const broke = users.filter(u => !u || (u.money || 0) <= 0).map(u => u?.nick || '?');
  if (broke.length) { toast(`게임머니가 없는 사람이 있어요: ${broke.join(', ')}`); return; }
  const seats = players.map(([uc, p]) => ({ id: uc, name: p.nick, char: p.char, isBot: false }));
  if ((d.kind || 'gostop') === 'seotda') {
    const ante = d.ante || 1000;
    const poor = users.filter(u => (u.money || 0) < ante).map(u => u.nick);
    if (poor.length) { toast(`기본 판돈 ${won(ante)}보다 돈이 적은 사람이 있어요: ${poor.join(', ')}`); return; }
    let first = 0;
    if (prev && prev.kind === 'seotda' && prev.result) { const wid = prev.seats[prev.result.winners[0]].id; first = Math.max(0, seats.findIndex(s => s.id === wid)); }
    const sst = newSeotda({ seats, stacks: users.map(u => u.money || 0), ante, cardsMode: d.cards || 2, firstSeat: first });
    sst.gid = rid();
    await S.store.resetGame(code, sst);
    await S.store.patchRoom(code, { status: 'playing' });
    return;
  }
  let firstSeat = 0, mult = 1;
  if (prev && prev.kind !== 'seotda' && prev.result) {
    if (prev.result.winner != null) { const wid = prev.seats[prev.result.winner].id; firstSeat = Math.max(0, seats.findIndex(s => s.id === wid)); }
    else mult = Math.min(8, (prev.mult || 1) * 2);
  }
  const st = newGame({ seats, ppoint: d.ppoint, bonusCount: d.bonus, firstSeat, mult });
  st.gid = rid();
  await S.store.resetGame(code, st);
  await S.store.patchRoom(code, { status: 'playing' });
}

// ───────────────── 게임 진행 ─────────────────
class Game {
  constructor({ mode, state, mySeat, roomCode = null, chat, level = null }) {
    this.mode = mode; this.mySeat = mySeat; this.roomCode = roomCode; this.level = level;
    this.chat = chat; this.state = null; this.json = null; this.seenEv = state.evSeq; this.prevFloor = [];
    this.gid = state.gid; this.locked = false; this.ended = false; this.resultShown = null; this.goStopShown = null;
    this.alive = true; this.chatOpen = false;
    this.buildShell();
    this.chat.sys(this.introText(state));
    this.setState(state, true);
    if (mode === 'online') this.timer = setInterval(() => this.tick(), 1000);
    show('scr-game');
  }
  destroy() {
    this.alive = false; clearInterval(this.timer); clearTimeout(this.botTimer);
    Taunt.clear();
    this.closeGoStop?.(); this.closeResult?.();
    if (this.mode === 'bot') this.chat.destroy?.();
  }
  buildShell() {
    this.tableEl = h('div', { class: 'table' });
    this.chatBadge = h('span', { class: 'badge hidden' }, '0');
    this.chatWrap = h('aside', { class: 'game-chat hidden' },
      h('button', { class: 'icon-btn close', 'aria-label': '채팅 닫기', onclick: () => this.toggleChat(false) }, '✕'),
      this.chat.el);
    this.chat.open = window.matchMedia('(min-width: 980px)').matches;
    this.chat.onUnread = n => { this.chatBadge.textContent = n; this.chatBadge.classList.toggle('hidden', n === 0); };
    $('#scr-game').replaceChildren(this.tableEl, this.chatWrap);
  }
  toggleChat(open = !this.chatOpen) {
    this.chatOpen = open;
    this.chatWrap.classList.toggle('hidden', !open);
    this.chat.open = open || window.matchMedia('(min-width: 980px)').matches;
    if (open) { this.chat.unread = 0; this.chat.onUnread(0); this.chat.scroll(); }
  }
  introText(s) { return this.mode === 'bot' ? `판을 깔았어요. 점당 ${won(s.ppoint)}, ${s.n}인.` : `온라인 판 시작! ${s.seats.map(x => x.name).join(', ')}`; }
  seat(i) { return this.state.seats[i]; }
  key(s = this.state) { return `${this.gid}:${s.ver}`; }
  actor(s = this.state) { return s.phase === 'goStop' ? s.pending : s.phase === 'play' ? s.turn : null; }

  // 상태 반영
  setState(s, initial = false) {
    this.prevFloor = this.state ? this.state.floor : [];
    // 시간 초과는 각 기기가 이 수를 받은 시각으로 잰다 (기기 시계 차이 무시)
    if (!this.state || this.state.ver !== s.ver || this.arrivedKey !== `${this.gid}:${s.ver}`) { this.arrivedAt = Date.now(); this.arrivedKey = `${this.gid}:${s.ver}`; }
    this.state = s;
    this.json = JSON.stringify(s);
    if (!initial && s.timeout && s.timeout.ver === s.ver) this.chat.sys(`${s.seats[s.timeout.seat].name} 시간 초과 — 자동으로 ${s.timeout.label || (s.timeout.stop ? '스톱했어요' : '냈어요')}`);
    if (!initial && s.evSeq > this.seenEv) this.handleEvents(s);
    this.seenEv = Math.max(this.seenEv, s.evSeq);
    if (this.closeGoStop && !(s.phase === 'goStop' && s.pending === this.mySeat)) { this.closeGoStop(); this.closeGoStop = null; }
    this.render();
    this.after();
  }
  onRemote(json) {
    if (json === this.json) return;
    this.locked = false;
    this.setState(JSON.parse(json));
  }
  handleEvents(s) {
    for (const e of s.events) {
      if (e.type === 'bonus' || e.type === 'nagari') { if (e.type === 'bonus') this.chat.sys(`${s.seats[e.seat].name} 보너스피!`); continue; }
      const info = EVENT_INFO[e.type];
      if (!info || e.seat == null) continue;
      const p = s.seats[e.seat];
      const line = tauntFor(p.char, info.key);
      const label = info.label(e.count, e);
      if (!info.chatOnly) Taunt.push({ char: p.char, name: p.name, label, line, big: info.big });
      this.chat.taunt(p.char, p.name, `[${label}] ${line}`);
    }
  }

  // 다음 할 일 (봇 차례, 고/스톱, 종료)
  async after() {
    const s = this.state;
    if (!this.alive) return;
    if (s.phase === 'end') { this.onEnd(); return; }
    const a = this.actor();
    if (this.mode === 'bot' && s.seats[a].isBot) {
      clearTimeout(this.botTimer);
      const k = this.key();
      await Taunt.idle();
      if (!this.alive || this.key() !== k) return;
      this.botTimer = setTimeout(() => this.botStep(k), 550 + Math.random() * 500);
      return;
    }
    if (s.phase === 'goStop' && s.pending === this.mySeat) {
      const k = this.key();
      await Taunt.idle();
      if (this.alive && this.key() === k) this.askGoStop();
    }
  }
  botStep(k) {
    const s = this.state;
    if (!this.alive || this.key() !== k || s.phase === 'end') return;
    const a = this.actor();
    const lvl = s.seats[a].level || 'normal';
    let ns;
    if (s.phase === 'goStop') ns = applyGoStop(s, a, botGoStop(s, a, lvl));
    else ns = applyPlay(s, a, botMove(s, a, lvl));
    Snd.tap();
    this.setState(ns);
  }
  async commit(ns) {
    if (this.mode === 'bot') { this.setState(ns); return true; }
    this.locked = true; this.render();
    let ok = false;
    try { ok = await S.store.commitGame(this.roomCode, this.state.ver, ns); }
    catch (x) { toast('연결이 불안정해요. 다시 눌러 주세요'); }
    if (!ok) { this.locked = false; this.render(); }
    return ok;
  }
  async play(move) {
    const s = this.state;
    if (this.locked || s.phase !== 'play' || s.turn !== this.mySeat) return;
    let ns;
    try { ns = applyPlay(s, this.mySeat, move); } catch (x) { toast(x.message); return; }
    Snd.tap();
    await this.commit(ns);
  }
  async goStop(go) {
    const s = this.state;
    if (s.phase !== 'goStop' || s.pending !== this.mySeat) return;
    this.closeGoStop?.(); this.closeGoStop = null;
    await this.commit(applyGoStop(s, this.mySeat, go));
  }
  askGoStop() {
    const s0 = this.state;
    if (s0.phase !== 'goStop' || s0.pending !== this.mySeat) return;
    if (this.goStopShown === this.key() && this.closeGoStop) return;
    this.closeGoStop?.();
    this.goStopShown = this.key();
    const s = this.state, me = this.mySeat;
    const d = scoreDetail(s.caps[me]);
    const now = withGo(d.total, s.goCount[me]);
    const ifGo = withGo(d.total, s.goCount[me] + 1);
    this.closeGoStop = openModal([
      h('h3', {}, `${d.total}점 났어요!`),
      h('p', { class: 'muted', style: 'margin:0' }, `지금 스톱하면 ${now}점. 고 하면 ${s.goCount[me] + 1}고로 ${ifGo}점부터 다시 노려요. 고 하고 지면 고박이에요.`),
      h('div', { class: 'gostop' },
        h('button', { class: 'btn red primary', onclick: () => this.goStop(true) }, '고!'),
        h('button', { class: 'btn', onclick: () => this.goStop(false) }, '스톱')),
    ], { dismiss: false });
  }
  // 온라인: 시간 초과 처리
  tick() {
    const s = this.state;
    if (!s || s.phase === 'end') return;
    const a = this.actor();
    const age = Date.now() - (this.arrivedAt || Date.now());
    const limit = TURN_TIMEOUT_SEC * 1000 + (a === this.mySeat ? 0 : 8000);
    const st = $('.status-line', this.tableEl);
    if (st && a === this.mySeat) {
      const left = Math.max(0, Math.ceil((TURN_TIMEOUT_SEC * 1000 - age) / 1000));
      st.textContent = this.statusText() + (left <= 15 ? ` · ${left}초` : '');
    }
    if (age > limit && !this.locked) {
      const ns = s.phase === 'goStop' ? applyGoStop(s, a, false) : applyPlay(s, a, botMove(s, a, 'normal'));
      ns.timeout = { ver: ns.ver, seat: a, stop: s.phase === 'goStop' };
      this.commit(ns);
    }
  }

  // 종료·정산
  async onEnd() {
    if (this.ended) return;
    this.ended = true;
    const s = this.state;
    await Taunt.idle();
    if (!this.alive) return;
    if (s.result.winner === this.mySeat) Snd.win();
    if (this.mode === 'bot') {
      const r = s.result, me = this.mySeat;
      let delta = 0;
      if (r.winner === me) delta = r.pays.reduce((a, b) => a + b, 0) * s.ppoint;
      else if (r.winner != null) delta = -r.pays[me] * s.ppoint;
      const applied = await applyResult(S.store, S.me.pid, { mode: 'bot', win: r.winner === me, delta });
      const deltas = s.seats.map((_, i) => (i === me ? applied : r.winner == null ? 0 : i === r.winner ? r.pays.reduce((a, b) => a + b, 0) * s.ppoint : -r.pays[i] * s.ppoint));
      this.showResult(deltas);
    } else {
      this.settleOnline();
      this.maybeShowResult();
    }
  }
  async settleOnline() {
    const s = this.state, code = this.roomCode;
    try {
      if (!(await S.store.claimSettle(code, s.gid))) return;
      const r = s.result;
      const deltas = s.seats.map(() => 0);
      if (r.winner != null) {
        let pot = 0;
        for (let i = 0; i < s.n; i++) {
          if (i === r.winner) continue;
          const applied = await applyResult(S.store, s.seats[i].id, { mode: 'online', win: false, delta: -r.pays[i] * s.ppoint });
          deltas[i] = applied; pot += -applied;
        }
        deltas[r.winner] = await applyResult(S.store, s.seats[r.winner].id, { mode: 'online', win: true, delta: pot });
      } else {
        for (let i = 0; i < s.n; i++) await applyResult(S.store, s.seats[i].id, { mode: 'online', win: false, delta: 0 });
      }
      await S.store.addMatch({
        ts: Date.now(), ppoint: s.ppoint, nagari: r.winner == null, points: r.points || 0,
        winner: r.winner != null ? s.seats[r.winner].name : null,
        players: s.seats.map((p, i) => ({ nick: p.name, char: p.char, delta: deltas[i], score: scoreDetail(s.caps[i]).total, win: i === r.winner })),
      });
      await S.store.patchRoom(code, { status: 'ended', lastSettle: { gid: s.gid, deltas } });
    } catch (x) { console.error(x); toast('정산 중 오류가 났어요'); }
  }
  maybeShowResult() {
    if (this.mode !== 'online' || !this.state || this.state.phase !== 'end' || !this.ended) return;
    const ls2 = this.room?.lastSettle;
    if (ls2 && ls2.gid === this.gid && this.resultShown !== this.gid) Taunt.idle().then(() => this.alive && this.showResult(ls2.deltas));
  }
  showResult(deltas) {
    if (this.resultShown === this.gid) return;
    this.resultShown = this.gid;
    const s = this.state, r = s.result;
    const w = r.winner;
    const lines = [];
    if (w != null) {
      const d = r.detail;
      if (d.gwPts) lines.push(`광 ${d.gwPts}점`);
      if (d.godori) lines.push('고도리 5점');
      if (d.dans.length) lines.push(d.dans.map(x => RIBBON_NAME[x]).join('·') + ` ${d.dans.length * 3}점`);
      if (d.ttiPts - d.dans.length * 3 > 0) lines.push(`띠 ${d.ttiPts - d.dans.length * 3}점`);
      if (d.yeolPts - (d.godori ? 5 : 0) > 0) lines.push(`열끗 ${d.yeolPts - (d.godori ? 5 : 0)}점`);
      if (d.piPts) lines.push(`피 ${d.piPts}점`);
      if (r.samppeok) lines.push('3뻑');
      lines.push(...r.mults);
    }
    const isHost = this.mode === 'online' && this.room?.host === S.me.pid;
    const close = openModal([
      h('div', { class: 'result-head' },
        h('div', { class: 'stamp' }, w == null ? '나가리!' : w === this.mySeat ? '내가 이겼다!' : `${s.seats[w].name} 승!`),
        w != null ? h('p', { class: 'muted', style: 'margin:4px 0 0' }, `${r.points}점 · ${lines.join(' · ')}`) : h('p', { class: 'muted', style: 'margin:4px 0 0' }, '다음 판은 두 배로 갑니다')),
      h('div', { class: 'pay-list' }, s.seats.map((p, i) => h('div', { class: 'p' }, avatar(p.char),
        h('div', { class: 'grow' }, h('b', {}, p.name + (i === w ? ' 👑' : '')), h('small', {}, [`${scoreDetail(s.caps[i]).total}점`, ...((r.flags && r.flags[i]) || [])].join(' · '))),
        h('span', { class: `money ${deltas[i] > 0 ? 'plus' : deltas[i] < 0 ? 'minus' : ''}` }, p.isBot && this.mode === 'bot' && i !== this.mySeat ? signed(deltas[i]) : signed(deltas[i]))))),
      this.mode === 'bot' && deltas[this.mySeat] !== 0 && w != null && w !== this.mySeat && Math.abs(deltas[this.mySeat]) < r.pays[this.mySeat] * s.ppoint
        ? h('p', { class: 'err', style: 'margin:0' }, '가진 돈이 모자라서 있는 만큼만 냈어요') : null,
      h('p', { class: 'muted', style: 'margin:0;text-align:center' }, '내 자산 ', h('b', { 'data-wallet': '' }, won(S.me.money))),
      h('div', { class: 'row' },
        h('button', { class: 'btn ghost grow', onclick: () => { close(); this.quit(true); } }, this.mode === 'bot' ? '그만하기' : '방 나가기'),
        this.mode === 'bot'
          ? h('button', { class: 'btn red grow primary', onclick: () => { close(); this.again(); } }, '한 판 더')
          : isHost ? h('button', { class: 'btn red grow primary', onclick: () => { close(); hostStart(this.room, this.state); } }, '한 판 더')
            : h('span', { class: 'grow muted', style: 'text-align:center' }, '방장이 한 판 더를 누르면 시작돼요')),
    ], { dismiss: false });
    this.closeResult = close;
  }
  again() {
    if (!needMoney()) { this.quit(true); return; }
    const s = this.state, r = s.result;
    const firstSeat = r.winner != null ? r.winner : s.turn;
    const mult = r.winner == null ? Math.min(8, (s.mult || 1) * 2) : 1;
    const ns = newGame({ seats: s.seats, ppoint: s.ppoint, bonusCount: s.bonusCount, firstSeat, mult });
    ns.gid = rid();
    clearTimeout(this.botTimer); this.closeGoStop?.(); this.closeGoStop = null; this.goStopShown = null;
    this.gid = ns.gid; this.ended = false; this.seenEv = ns.evSeq; this.state = null;
    this.chat.sys(mult > 1 ? `나가리 판! 이번 판은 ${mult}배예요.` : '새 판을 깔았어요.');
    this.setState(ns, true);
  }
  async quit(afterEnd = false) {
    const s = this.state;
    if (this.mode === 'bot') {
      if (!afterEnd && s.phase !== 'end') {
        const pen = s.threshold * s.ppoint * (s.mult || 1);
        const ok = await confirmModal('판을 접을까요?', `지금 나가면 기본 점수(${s.threshold}점)만큼 ${won(pen)}을 잃고 패배로 기록돼요.`, '나가기', '계속하기');
        if (!ok) return;
        await applyResult(S.store, S.me.pid, { mode: 'bot', win: false, delta: -pen });
      }
      this.destroy(); S.game = null; renderLobby();
    } else {
      if (!afterEnd && s.phase !== 'end') {
        const ok = await confirmModal('방에서 나갈까요?', `게임은 계속돼요. 내 차례는 ${TURN_TIMEOUT_SEC}초가 지나면 자동으로 내져요.`, '나가기', '계속하기');
        if (!ok) return;
      }
      leaveRoom();
    }
  }

  // 그리기
  statusText() {
    const s = this.state, me = this.mySeat;
    if (s.phase === 'end') return s.result.winner == null ? '나가리' : `${s.seats[s.result.winner].name} 승리`;
    const a = this.actor();
    if (s.phase === 'goStop') return a === me ? '고? 스톱?' : `${s.seats[a].name} 고 할지 고민 중…`;
    if (a === me) return this.locked ? '내는 중…' : '내 차례예요. 낼 패를 고르세요';
    return `${s.seats[a].name} 차례`;
  }
  render() {
    const s = this.state; if (!s) return;
    const me = this.mySeat;
    const a = this.actor();
    const opps = [];
    for (let k = 1; k < s.n; k++) opps.push((me + k) % s.n);
    const fresh = new Set(s.floor.filter(id => !this.prevFloor.includes(id)));

    const tbar = h('div', { class: 'tbar' },
      h('button', { class: 'icon-btn', onclick: () => this.quit(false) }, '나가기'),
      h('div', { class: 'grow' }, h('span', { class: 'stake' }, `점당 ${won(s.ppoint)}`), ` · ${s.n}인 · ${s.threshold}점 나기${s.mult > 1 ? ` · ${s.mult}배 판` : ''}`),
      h('button', { class: 'icon-btn', 'aria-label': Snd.on ? '소리 끄기' : '소리 켜기', onclick: () => { Snd.toggle(); this.render(); } }, Snd.on ? '🔊' : '🔇'),
      h('button', { id: 'btn-chat', class: 'icon-btn', onclick: () => this.toggleChat() }, '채팅', this.chatBadge));

    const oppEls = h('div', { class: 'opps', style: `--opp-n:${opps.length}` }, opps.map(i => {
      const p = s.seats[i];
      const { g, d } = groupCaps(s.caps[i]);
      const piCount = d.piVal;
      return h('button', { class: `opp ${a === i ? 'turn' : ''}`, style: 'text-align:left;color:inherit', onclick: () => this.showCaps(i), 'aria-label': `${p.name} 먹은 패 보기` },
        h('div', { class: 'head' }, avatar(p.char),
          h('div', { class: 'nm' }, p.name, h('small', {}, p.isBot ? `봇 · ${{ easy: '쉬움', normal: '보통', hard: '어려움' }[p.level]}` : `손패 ${s.hands[i].length}장`)),
          h('span', { class: 'pts' }, d.total)),
        h('div', { class: 'chips' },
          h('span', {}, `광${g.gwang.length}`), h('span', {}, `열${g.yeol.length}`), h('span', {}, `띠${g.tti.length}`), h('span', {}, `피${piCount}`),
          s.goCount[i] ? h('span', { class: 'go' }, `${s.goCount[i]}고`) : null,
          s.shake[i] ? h('span', { class: 'go' }, '흔들') : null,
          s.bomb[i] ? h('span', { class: 'go' }, '폭탄') : null,
          s.ppeokCount[i] ? h('span', {}, `뻑${s.ppeokCount[i]}`) : null));
    }));

    // 바닥: 월별로 묶기
    const byMonth = {};
    for (const id of s.floor) (byMonth[CARDS[id].month] = byMonth[CARDS[id].month] || []).push(id);
    const floor = h('div', { class: 'floor', 'aria-label': '바닥 패' }, Object.keys(byMonth).sort((x, y) => x - y).map(m =>
      h('div', { class: `pile ${s.ppeokOwner[m] != null ? 'ppeok' : ''}`, title: s.ppeokOwner[m] != null ? `${s.seats[s.ppeokOwner[m]].name}의 뻑` : MONTHS[m] },
        byMonth[m].map(id => cardEl(id, `sm ${fresh.has(id) ? 'fresh' : ''} ${id === s.lastFlip ? 'flip-hl' : ''}`)))));
    const deck = h('div', { class: 'deck' }, h('div', { class: 'card back' }), `${s.deck.length}장`);

    // 내 영역
    const { g, d } = groupCaps(s.caps[me]);
    const capCol = (label, ids, pts, countText) => h('div', { class: 'cap-row' },
      h('span', { class: 'lbl' }, `${label} `, h('b', {}, countText), pts ? ` · ${pts}점` : ''),
      h('div', { class: 'cap-cards' }, ids.map(id => cardEl(id, 'mini'))));
    const myP = s.seats[me];
    const meBox = h('div', { class: `me-box ${a === me ? 'turn' : ''}` },
      h('div', { class: 'head' }, avatar(myP.char),
        h('div', { class: 'grow' }, h('b', {}, myP.name), ' ', h('span', { class: 'on-felt-muted money', 'data-wallet': '' }, won(S.me.money))),
        s.goCount[me] ? h('span', { class: 'chips' }, h('span', { class: 'go' }, `${s.goCount[me]}고`)) : null,
        s.shake[me] ? h('span', { class: 'chips' }, h('span', { class: 'go' }, '흔들')) : null,
        s.bomb[me] ? h('span', { class: 'chips' }, h('span', { class: 'go' }, '폭탄')) : null,
        h('span', { class: 'pts', title: '지금 점수' }, `${d.total}점`)),
      h('div', { class: 'caps' },
        capCol('광', g.gwang, d.gwPts, g.gwang.length),
        capCol('열', g.yeol, d.yeolPts, g.yeol.length),
        capCol('띠', g.tti, d.ttiPts, g.tti.length),
        capCol('피', g.pi, d.piPts, d.piVal)));

    const myTurn = s.phase === 'play' && s.turn === me && !this.locked;
    const moves = myTurn ? legalMoves(s, me) : [];
    const floorMonths = new Set(s.floor.map(id => CARDS[id].month));
    const handIds = [...s.hands[me]].sort((x, y) => (CARDS[x].month || 13) - (CARDS[y].month || 13));
    const tokens = Array.from({ length: s.bombTokens[me] }, () => 'BOMB');
    const hand = h('div', { class: `hand ${myTurn ? 'active' : ''}`, 'aria-label': '내 손패' },
      [...tokens, ...handIds].map(id => cardEl(id, (id !== 'BOMB' && floorMonths.has(CARDS[id].month)) ? 'match' : '', 'button', {
        type: 'button', disabled: !myTurn ? true : null, onclick: () => this.pick(id, moves),
      })));

    this.tableEl.replaceChildren(...[tbar, oppEls,
      h('div', { class: 'floor-area' }, floor, deck),
      h('div', { class: `status-line ${a === me ? 'mine' : ''}` }, this.statusText()),
      s.phase === 'goStop' && s.pending === me && !this.locked
        ? h('div', { class: 'gostop-inline' },
          h('button', { class: 'btn red', onclick: () => this.goStop(true) }, '고!'),
          h('button', { class: 'btn', onclick: () => this.goStop(false) }, '스톱'),
          h('button', { class: 'btn ghost small', style: 'color:var(--on-felt)', onclick: () => { this.goStopShown = null; this.askGoStop(); } }, '점수 보기'))
        : null,
      h('div', { class: 'stack', style: 'gap:6px' }, meBox, hand)].filter(Boolean));
  }
  pick(id, moves) {
    const mv = moves.find(m => m.card === id);
    if (!mv) return;
    if (id === 'BOMB' || mv.bonus) return this.play({ card: id });
    const chooseTarget = (extra = {}) => {
      if (!mv.targets) return this.play({ card: id, ...extra });
      const close = openModal([
        h('h3', {}, '어느 패를 먹을까요?'),
        h('div', { class: 'choice-cards' }, mv.targets.map(t => h('button', { onclick: () => { close(); this.play({ card: id, target: t, ...extra }); } }, cardEl(t)))),
      ]);
    };
    if (mv.canBomb) {
      const close = openModal([
        h('h3', {}, '폭탄 가능!'),
        h('p', { class: 'muted', style: 'margin:0' }, `${CARDS[id].month}월 패 3장을 한 번에 내서 바닥 패까지 4장을 먹어요. 상대마다 피 1장씩 뺏고, 이기면 두 배. 대신 다음 두 번은 뒤집기만 해요.`),
        h('div', { class: 'row' },
          h('button', { class: 'btn ghost grow', onclick: () => { close(); chooseTarget(); } }, '한 장만 내기'),
          h('button', { class: 'btn red grow primary', onclick: () => { close(); this.play({ card: id, bomb: true }); } }, '폭탄!')),
      ]);
      return;
    }
    if (mv.canShake) {
      const close = openModal([
        h('h3', {}, '흔들까요?'),
        h('p', { class: 'muted', style: 'margin:0' }, `${CARDS[id].month}월 패를 3장 들고 있어요. 흔들면 이겼을 때 두 배예요.`),
        h('div', { class: 'row' },
          h('button', { class: 'btn ghost grow', onclick: () => { close(); this.play({ card: id }); } }, '그냥 내기'),
          h('button', { class: 'btn red grow primary', onclick: () => { close(); this.play({ card: id, shake: true }); } }, '흔들기')),
      ]);
      return;
    }
    chooseTarget();
  }
  showCaps(i) {
    const s = this.state, p = s.seats[i];
    const { g, d } = groupCaps(s.caps[i]);
    const row = (label, ids) => h('div', { class: 'stack', style: 'gap:4px' }, h('span', { class: 'label' }, `${label} ${ids.length}장`), h('div', { class: 'row', style: 'gap:4px' }, ids.map(id => cardEl(id, 'sm'))));
    openModal([
      h('div', { class: 'row' }, avatar(p.char), h('h3', { class: 'grow' }, `${p.name} · ${d.total}점`)),
      row('광', g.gwang), row('열끗', g.yeol), row('띠', g.tti), row(`피 (${d.piVal})`, g.pi),
    ]);
  }
}

// ───────────────── 섯다 진행 ─────────────────
const LEVEL_NAME = { easy: '쉬움', normal: '보통', hard: '어려움' };
/** 섯다용 카드: 화투 그림 + 월 숫자 */
function sdCard(id, cls = '', tag = 'div', props = {}) {
  const el = cardEl(id, `sd ${cls}`, tag, props);
  if (CARDS[id]) el.append(h('span', { class: 'mnum', 'aria-hidden': 'true' }, CARDS[id].month));
  return el;
}
const sdBack = (cls = '') => h('div', { class: `card back sd ${cls}`, 'aria-hidden': 'true' });
const botStack = (ante, mine) => Math.max(ante * 100, Math.min((mine || 0) * 2, ante * 400));

class SeotdaGame extends Game {
  introText(s) { return `섯다 판을 깔았어요. 기본 판돈 ${won(s.ante)}, ${s.cardsMode}장 섯다, ${s.n}인.`; }
  actor(s = this.state) {
    if (s.phase === 'bet') return s.turn;
    if (s.phase === 'choose') return needsChoice(s, this.mySeat) ? this.mySeat : null;
    return null;
  }
  async after() {
    const s = this.state;
    if (!this.alive) return;
    if (s.phase === 'end') { this.onEnd(); return; }
    if (this.mode !== 'bot') return;
    const botTurn = s.phase === 'bet' ? s.seats[s.turn]?.isBot : s.seats.some((p, i) => p.isBot && needsChoice(s, i));
    if (!botTurn) return;
    clearTimeout(this.botTimer);
    const k = this.key();
    await Taunt.idle();
    if (!this.alive || this.key() !== k) return;
    this.botTimer = setTimeout(() => this.botStep(k), 600 + Math.random() * 700);
  }
  botStep(k) {
    let s = this.state;
    if (!this.alive || this.key() !== k || s.phase === 'end') return;
    if (s.phase === 'bet') s = applyBet(s, s.turn, botBet(s, s.turn, s.seats[s.turn].level || 'normal'));
    else for (let i = 0; i < s.n; i++) if (s.seats[i].isBot && needsChoice(s, i)) s = applyChoose(s, i, botChoose(s, i, s.seats[i].level || 'normal'));
    Snd.tap();
    this.setState(s);
  }
  /** 온라인에서 동시에 눌러 충돌하면 최신 상태로 다시 적용 */
  async act(fn) {
    if (this.mode === 'bot') { try { this.setState(fn(this.state)); } catch (x) { toast(x.message); } return; }
    if (this.locked) return;
    for (let i = 0; i < 6; i++) {
      let ns;
      try { ns = fn(this.state); } catch (x) { if (i === 0) toast(x.message); return; }
      if (await this.commit(ns)) return;
      await sleep(250);
    }
    toast('연결이 불안정해요. 다시 눌러 주세요');
  }
  bet(type) { Snd.tap(); this.act(s => applyBet(s, this.mySeat, type)); }
  togglePick(id) {
    const p = this.sel || [];
    this.sel = p.includes(id) ? p.filter(x => x !== id) : [...p, id].slice(-2);
    this.render();
  }
  choose(pair) {
    const pick = pair || this.sel || [];
    if (pick.length !== 2) { toast('2장을 골라 주세요'); return; }
    this.sel = [];
    Snd.tap();
    this.act(s => applyChoose(s, this.mySeat, pick));
  }
  tick() {
    const s = this.state;
    if (!s || s.phase === 'end') return;
    const age = Date.now() - (this.arrivedAt || Date.now());
    const lim = TURN_TIMEOUT_SEC * 1000;
    const me = this.mySeat;
    const st = $('.status-line', this.tableEl);
    const mine = (s.phase === 'bet' && s.turn === me) || needsChoice(s, me);
    if (st && mine) {
      const left = Math.max(0, Math.ceil((lim - age) / 1000));
      st.textContent = this.statusText() + (left <= 15 ? ` · ${left}초` : '');
    }
    if (this.locked) return;
    if (s.phase === 'bet') {
      const a = s.turn;
      if (age < lim + (a === me ? 0 : 8000)) return;
      const t = legalBets(s, a).some(x => x.type === 'check') ? 'check' : 'die';
      const ns = applyBet(s, a, t);
      ns.timeout = { ver: ns.ver, seat: a, label: t === 'check' ? '체크했어요' : '다이했어요' };
      this.commit(ns);
    } else if (s.phase === 'choose') {
      for (let i = 0; i < s.n; i++) {
        if (!needsChoice(s, i) || age < lim + (i === me ? 0 : 8000)) continue;
        const ns = applyChoose(s, i, bestPair(s.hands[i]));
        ns.timeout = { ver: ns.ver, seat: i, label: '가장 좋은 2장을 골랐어요' };
        this.commit(ns);
        return;
      }
    }
  }
  async onEnd() {
    if (this.ended) return;
    this.ended = true;
    const s = this.state, r = s.result, me = this.mySeat;
    await Taunt.idle();
    if (!this.alive) return;
    if (r.deltas[me] > 0) Snd.win();
    if (this.mode === 'bot') {
      const applied = await applyResult(S.store, S.me.pid, { mode: 'seotda', win: r.deltas[me] > 0, delta: r.deltas[me] });
      const deltas = r.deltas.slice(); deltas[me] = applied;
      this.showResult(deltas);
    } else {
      this.settleOnline();
      this.maybeShowResult();
    }
  }
  async settleOnline() {
    const s = this.state, code = this.roomCode;
    try {
      if (!(await S.store.claimSettle(code, s.gid))) return;
      const r = s.result;
      const deltas = s.seats.map(() => 0);
      const idx = s.seats.map((_, i) => i);
      let expected = 0, got = 0;
      for (const i of idx.filter(i => r.deltas[i] < 0)) {
        const a = await applyResult(S.store, s.seats[i].id, { mode: 'online', win: false, delta: r.deltas[i] });
        deltas[i] = a; expected += -r.deltas[i]; got += -a;
      }
      const ratio = expected ? got / expected : 1;
      for (const i of idx.filter(i => r.deltas[i] >= 0)) {
        deltas[i] = await applyResult(S.store, s.seats[i].id, { mode: 'online', win: r.deltas[i] > 0, delta: Math.round(r.deltas[i] * ratio) });
      }
      const w = r.winners[0];
      await S.store.addMatch({
        ts: Date.now(), kind: 'seotda', ante: s.ante, cards: s.cardsMode, nagari: !!r.split, pot: r.pot,
        winner: r.split ? null : s.seats[w].name, hand: r.info?.[w]?.name || '',
        players: s.seats.map((p, i) => ({ nick: p.name, char: p.char, delta: deltas[i], hand: r.info?.[i]?.name || (s.folded[i] ? '다이' : ''), win: r.winners.includes(i) && !r.split })),
      });
      await S.store.patchRoom(code, { status: 'ended', lastSettle: { gid: s.gid, deltas } });
    } catch (x) { console.error(x); toast('정산 중 오류가 났어요'); }
  }
  showResult(deltas) {
    if (this.resultShown === this.gid) return;
    this.resultShown = this.gid;
    const s = this.state, r = s.result, me = this.mySeat;
    const w = r.winners[0];
    const title = r.split ? '무승부!' : r.winners.includes(me) ? '내가 먹었다!' : `${s.seats[w].name} 승!`;
    const sub = r.byFold ? `다들 다이해서 판돈 ${won(r.pot)}을 가져가요` : r.split ? `재경기가 계속돼 판돈 ${won(r.pot)}을 나눠요` : `${r.info[w]?.name || ''}${r.caught?.[w] ? ' (잡았다!)' : ''} · 판돈 ${won(r.pot)}`;
    const isHost = this.mode === 'online' && this.room?.host === S.me.pid;
    const close = openModal([
      h('div', { class: 'result-head' }, h('div', { class: 'stamp' }, title), h('p', { class: 'muted', style: 'margin:4px 0 0' }, sub)),
      h('div', { class: 'pay-list' }, s.seats.map((p, i) => {
        const shown = r.hands?.[i];
        return h('div', { class: 'p' }, avatar(p.char),
          h('div', { class: 'grow' }, h('b', {}, p.name + (r.winners.includes(i) && !r.split ? ' 👑' : '')),
            h('small', {}, shown ? r.info[i].name : s.folded[i] ? '다이' : '')),
          shown ? h('div', { class: 'sd-res-cards' }, shown.map(id => sdCard(id, 'mini'))) : null,
          h('span', { class: `money ${deltas[i] > 0 ? 'plus' : deltas[i] < 0 ? 'minus' : ''}` }, signed(deltas[i])));
      })),
      h('p', { class: 'muted', style: 'margin:0;text-align:center' }, '내 자산 ', h('b', { 'data-wallet': '' }, won(S.me.money))),
      h('div', { class: 'row' },
        h('button', { class: 'btn ghost grow', onclick: () => { close(); this.quit(true); } }, this.mode === 'bot' ? '그만하기' : '방 나가기'),
        this.mode === 'bot'
          ? h('button', { class: 'btn red grow primary', onclick: () => { close(); this.again(); } }, '한 판 더')
          : isHost ? h('button', { class: 'btn red grow primary', onclick: () => { close(); hostStart(this.room, this.state); } }, '한 판 더')
            : h('span', { class: 'grow muted', style: 'text-align:center' }, '방장이 한 판 더를 누르면 시작돼요')),
    ], { dismiss: false });
    this.closeResult = close;
  }
  again() {
    const s = this.state, r = s.result;
    if ((S.me.money || 0) < s.ante) { toast(`기본 판돈 ${won(s.ante)}보다 가진 돈이 적어요`); this.quit(true); return; }
    const stacks = s.seats.map((p, i) => {
      if (i === this.mySeat) return S.me.money;
      const left = s.stacks[i] + r.deltas[i];
      return left < s.ante * 10 ? botStack(s.ante, S.me.money) : left;
    });
    const ns = newSeotda({ seats: s.seats, stacks, ante: s.ante, cardsMode: s.cardsMode, firstSeat: r.winners[0] ?? s.first });
    ns.gid = rid();
    clearTimeout(this.botTimer); this.sel = [];
    this.gid = ns.gid; this.ended = false; this.seenEv = ns.evSeq; this.state = null;
    this.chat.sys('새 판을 깔았어요.');
    this.setState(ns, true);
  }
  async quit(afterEnd = false) {
    const s = this.state;
    if (this.mode === 'bot') {
      if (!afterEnd && s.phase !== 'end') {
        const lose = s.contrib[this.mySeat];
        const ok = await confirmModal('판을 접을까요?', `지금 나가면 다이로 처리돼서 낸 돈 ${won(lose)}을 잃어요.`, '나가기', '계속하기');
        if (!ok) return;
        await applyResult(S.store, S.me.pid, { mode: 'seotda', win: false, delta: -lose });
      }
      this.destroy(); S.game = null; renderLobby();
      return;
    }
    if (!afterEnd && s.phase !== 'end') {
      const ok = await confirmModal('방에서 나갈까요?', `게임은 계속돼요. 내 차례는 ${TURN_TIMEOUT_SEC}초가 지나면 자동으로 체크하거나 다이해요.`, '나가기', '계속하기');
      if (!ok) return;
    }
    leaveRoom();
  }
  statusText() {
    const s = this.state, me = this.mySeat;
    if (s.phase === 'end') return s.result.split ? '무승부' : `${s.seats[s.result.winners[0]].name} 승리`;
    if (s.phase === 'choose') return needsChoice(s, me) ? '3장 중 2장을 고르세요' : '다른 사람이 패를 고르는 중…';
    if (s.turn === me) return this.locked ? '거는 중…' : '내 차례예요. 베팅하세요';
    return `${s.seats[s.turn].name} 생각 중…`;
  }
  render() {
    const s = this.state; if (!s) return;
    const me = this.mySeat, r = s.result;
    const ended = s.phase === 'end';
    const opps = [];
    for (let k = 1; k < s.n; k++) opps.push((me + k) % s.n);
    const P = potOf(s);
    const left = i => s.stacks[i] - s.contrib[i];

    const tbar = h('div', { class: 'tbar' },
      h('button', { class: 'icon-btn', onclick: () => this.quit(false) }, '나가기'),
      h('div', { class: 'grow' }, h('span', { class: 'stake' }, `섯다 · 판돈 ${won(s.ante)}`), ` · ${s.cardsMode}장 · ${s.n}인${s.rematch ? ` · 재경기 ${s.rematch}` : ''}`),
      h('button', { class: 'icon-btn', 'aria-label': Snd.on ? '소리 끄기' : '소리 켜기', onclick: () => { Snd.toggle(); this.render(); } }, Snd.on ? '🔊' : '🔇'),
      h('button', { id: 'btn-chat', class: 'icon-btn', onclick: () => this.toggleChat() }, '채팅', this.chatBadge));

    const oppEls = h('div', { class: 'opps', style: `--opp-n:${opps.length}` }, opps.map(i => {
      const p = s.seats[i];
      const shown = ended && r.hands?.[i];
      const turn = s.phase === 'bet' && s.turn === i;
      const thinking = s.phase === 'choose' && needsChoice(s, i);
      return h('div', { class: `opp sd-opp ${turn || thinking ? 'turn' : ''} ${s.folded[i] ? 'folded' : ''}` },
        h('div', { class: 'head' }, avatar(p.char),
          h('div', { class: 'nm' }, p.name, h('small', {}, p.isBot ? `봇 · ${LEVEL_NAME[p.level] || ''}` : `${won(left(i))} 남음`))),
        h('div', { class: 'sd-opp-cards' }, shown ? shown.map(id => sdCard(id, 'mini')) : s.hands[i].map(() => sdBack('mini'))),
        h('div', { class: 'chips' },
          h('span', {}, `낸 돈 ${won(s.contrib[i])}`),
          shown ? h('span', { class: 'go' }, r.info[i].name) : s.lastAct[i] ? h('span', { class: s.folded[i] ? '' : 'go' }, s.lastAct[i]) : null));
    }));

    const center = h('div', { class: 'sd-center' },
      h('div', { class: 'sd-pot' }, h('small', {}, '판돈'), h('b', { class: 'money' }, won(P))),
      h('div', { class: 'sd-sub' }, s.phase === 'bet' ? `${s.round}라운드 · 지금 베팅 ${won(s.curBet)}` : s.phase === 'choose' ? '2장 고르는 중' : ''),
      s.lastShow && s.rematch && !ended ? h('div', { class: 'sd-sub' }, `재경기: ${s.lastShow.reason}`) : null);

    // 내 패와 족보
    const mine = s.hands[me];
    const choosing = needsChoice(s, me) && !this.locked;
    const pick = (this.sel || []).filter(id => mine.includes(id));
    const chosen = s.chosen[me];
    let info, note = '';
    if (s.folded[me]) { info = { name: '다이', desc: '이번 판은 구경해요' }; }
    else if (choosing) {
      const best = handInfo(bestPair(mine));
      info = pick.length === 2 ? handInfo(pick) : { name: `최고 ${best.name}`, desc: '두 장을 눌러 고르세요' };
    } else info = handInfo(showHand(s, me));
    if (s.cardsMode === 3 && mine.length === 2 && !s.folded[me]) note = '한 장 더 받으면 2장을 골라요';
    const cardsEl = h('div', { class: 'sd-hand', 'aria-label': '내 패' }, mine.map(id => {
      const isPicked = choosing ? pick.includes(id) : (chosen ? chosen.includes(id) : false);
      const dim = !choosing && chosen && !chosen.includes(id);
      return sdCard(id, `big ${isPicked ? 'picked' : ''} ${dim ? 'dim' : ''}`, choosing ? 'button' : 'div',
        choosing ? { type: 'button', 'aria-pressed': String(isPicked), onclick: () => this.togglePick(id) } : {});
    }));
    const jokbo = h('div', { class: 'jokbo' }, h('b', {}, info.name || ''), h('small', {}, [info.desc, note].filter(Boolean).join(' · ')));

    let actions = null;
    if (choosing) {
      actions = h('div', { class: 'sd-actions' },
        h('button', { class: 'btn ghost', style: 'color:var(--on-felt)', onclick: () => this.choose(bestPair(mine)) }, '최고 조합으로', h('small', {}, handInfo(bestPair(mine)).name)),
        h('button', { class: 'btn red', disabled: pick.length !== 2, onclick: () => this.choose() }, '이 2장으로', h('small', {}, pick.length === 2 ? handInfo(pick).name : `${pick.length}/2`)));
    } else if (s.phase === 'bet' && s.turn === me && !this.locked) {
      const acts = legalBets(s, me);
      const order = ['die', 'check', 'call', 'bbing', 'half', 'ttadang'];
      actions = h('div', { class: 'sd-actions' }, order.map(t => acts.find(a => a.type === t)).filter(Boolean).map(a =>
        h('button', { class: `btn ${a.type === 'die' ? 'ghost' : a.type === 'half' || a.type === 'ttadang' ? 'red' : 'gold'}`, style: a.type === 'die' ? 'color:var(--on-felt)' : null, onclick: () => this.bet(a.type) },
          BET_LABEL[a.type], a.amount > 0 ? h('small', {}, won(a.amount)) : null)));
    }
    const myP = s.seats[me];
    const meBox = h('div', { class: `me-box sd-me ${(s.phase === 'bet' && s.turn === me) || choosing ? 'turn' : ''}` },
      h('div', { class: 'head' }, avatar(myP.char),
        h('div', { class: 'grow' }, h('b', {}, myP.name), ' ', h('span', { class: 'on-felt-muted money' }, `${won(left(me))} 남음 · 낸 돈 ${won(s.contrib[me])}`))),
      cardsEl, jokbo);

    this.tableEl.replaceChildren(...[tbar, oppEls, center,
      h('div', { class: `status-line ${this.actor() === me ? 'mine' : ''}` }, this.statusText()),
      h('div', { class: 'stack', style: 'gap:6px' }, meBox, actions)].filter(Boolean));
  }
}

function botChat() {
  return new Chat({
    onLocalSend: () => {
      // 봇이 가끔 받아침
      if (Math.random() < .6 && S.game) {
        const b = S.game.state.seats.filter(x => x.isBot);
        const p = b[Math.floor(Math.random() * b.length)];
        const c = charById(p.char);
        const keys = Object.keys(c.t);
        setTimeout(() => S.game?.chat.taunt(p.char, p.name, Math.random() < .4 ? c.hi : tauntFor(p.char, keys[Math.floor(Math.random() * keys.length)])), 700 + Math.random() * 900);
      }
    },
  });
}
function startSeotdaBot(o) {
  const others = CHARACTERS.filter(c => c.id !== o.char).sort(() => Math.random() - .5).slice(0, o.bots);
  const seats = [{ id: S.me.pid, name: S.me.nick, char: o.char, isBot: false },
    ...others.map(c => ({ id: 'bot-' + c.id, name: c.name, char: c.id, isBot: true, level: o.level }))];
  const stacks = seats.map((p, i) => (i === 0 ? S.me.money : botStack(o.ante, S.me.money)));
  const st = newSeotda({ seats, stacks, ante: o.ante, cardsMode: o.cards, firstSeat: Math.floor(Math.random() * seats.length) });
  st.gid = rid();
  S.game?.destroy();
  const chat = botChat();
  S.game = new SeotdaGame({ mode: 'bot', state: st, mySeat: 0, chat, level: o.level });
  for (const p of seats.slice(1)) chat.taunt(p.char, p.name, charById(p.char).hi);
}

function startBotGame(o) {
  const others = CHARACTERS.filter(c => c.id !== o.char).sort(() => Math.random() - .5).slice(0, o.bots);
  const seats = [{ id: S.me.pid, name: S.me.nick, char: o.char, isBot: false },
    ...others.map(c => ({ id: 'bot-' + c.id, name: c.name, char: c.id, isBot: true, level: o.level }))];
  const st = newGame({ seats, ppoint: o.ppoint, bonusCount: o.bonus, firstSeat: Math.floor(Math.random() * seats.length) });
  st.gid = rid();
  S.game?.destroy();
  const chat = new Chat({
    onLocalSend: () => {
      // 봇이 가끔 받아침
      if (Math.random() < .6 && S.game) {
        const b = S.game.state.seats.filter(x => x.isBot);
        const p = b[Math.floor(Math.random() * b.length)];
        const c = charById(p.char);
        const keys = Object.keys(c.t);
        setTimeout(() => S.game?.chat.taunt(p.char, p.name, Math.random() < .4 ? c.hi : tauntFor(p.char, keys[Math.floor(Math.random() * keys.length)])), 700 + Math.random() * 900);
      }
    },
  });
  S.game = new Game({ mode: 'bot', state: st, mySeat: 0, chat, level: o.level });
  for (const p of seats.slice(1)) chat.taunt(p.char, p.name, charById(p.char).hi);
}

// ───────────────── 랭킹 ─────────────────
async function renderRank(tab = 'bot') {
  const el = $('#scr-rank');
  const tabs = [['bot', '고스톱'], ['seotda', '섯다'], ['online', '온라인 대결'], ['money', '보유자산']];
  const body = h('div', { class: 'stack' }, h('p', { class: 'on-felt-muted' }, '불러오는 중…'));
  el.replaceChildren(h('div', { class: 'wrap' },
    h('div', { class: 'row' }, h('h2', { class: 'grow', style: 'margin:0;font-family:var(--f-stamp);font-weight:400;font-size:30px' }, '랭킹'),
      h('button', { class: 'btn ghost small', style: 'color:var(--on-felt)', onclick: () => (S.me ? renderLobby() : renderLogin()) }, '돌아가기')),
    h('div', { class: 'tabs', role: 'tablist' }, tabs.map(([k, l]) => h('button', { role: 'tab', 'aria-selected': String(k === tab), onclick: () => renderRank(k) }, l))),
    body,
    S.store.mode === 'local' ? h('p', { class: 'mode-note' }, '이 브라우저에서 가입한 사람만 보여요.') : null));
  show('scr-rank');
  let users = [];
  try { users = await S.store.listUsers(); } catch { body.replaceChildren(h('p', { class: 'err' }, '랭킹을 불러오지 못했어요')); return; }
  const st = u => u.stats || {};
  const item = (u, i, main, sub) => h('div', { class: `rank-item ${S.me && u.pid === S.me.pid ? 'me' : ''}` },
    h('span', { class: 'no' }, i + 1), avatar(u.char),
    h('div', { class: 'grow' }, h('b', {}, u.nick), h('small', {}, sub)),
    h('span', { class: 'val' }, main));
  const empty = t => h('p', { class: 'on-felt-muted', style: 'text-align:center' }, t);
  if (tab === 'bot') {
    const list = users.filter(u => st(u).botGames > 0).sort((a, b) => st(b).botWins - st(a).botWins || st(b).botProfit - st(a).botProfit);
    body.replaceChildren(h('div', { class: 'rank-list' }, list.length ? list.slice(0, 50).map((u, i) => item(u, i, `${st(u).botWins}승`,
      `봇 고스톱 ${st(u).botGames}판 · 승률 ${Math.round(st(u).botWins / st(u).botGames * 100)}% · 수익 ${signed(st(u).botProfit)}`)) : empty('아직 봇이랑 고스톱 친 사람이 없어요. 첫 판의 주인공이 되세요.')));
  } else if (tab === 'seotda') {
    const list = users.filter(u => st(u).sdGames > 0).sort((a, b) => (st(b).sdProfit || 0) - (st(a).sdProfit || 0) || st(b).sdWins - st(a).sdWins);
    body.replaceChildren(h('div', { class: 'rank-list' }, list.length ? list.slice(0, 50).map((u, i) => item(u, i, signed(st(u).sdProfit || 0),
      `봇 섯다 ${st(u).sdGames}판 · ${st(u).sdWins}승 · 승률 ${Math.round(st(u).sdWins / st(u).sdGames * 100)}%`)) : empty('아직 봇이랑 섯다 친 사람이 없어요. 첫 판의 주인공이 되세요.')));
  } else if (tab === 'online') {
    const list = users.filter(u => st(u).onGames > 0).sort((a, b) => st(b).onWins - st(a).onWins || st(b).onProfit - st(a).onProfit);
    let matches = [];
    try { matches = await S.store.listMatches(30); } catch { /* 무시 */ }
    body.replaceChildren(
      h('div', { class: 'rank-list' }, list.length ? list.slice(0, 50).map((u, i) => item(u, i, `${st(u).onWins}승`,
        `${st(u).onGames}판 · 수익 ${signed(st(u).onProfit)}`)) : empty('아직 온라인 대결 기록이 없어요.')),
      h('h3', { class: 'section-title' }, '최근 대결'),
      ...(matches.length ? matches.map(m => h('div', { class: 'match' },
        h('div', { class: 'meta' }, `${new Date(m.ts).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })} · ${m.kind === 'seotda'
          ? `섯다 · 판돈 ${won(m.ante)} · ${m.nagari ? '무승부' : `${m.winner} ${m.hand ? m.hand + ' ' : ''}승`}`
          : `고스톱 · 점당 ${won(m.ppoint)} · ${m.nagari ? '나가리' : `${m.winner} ${m.points}점 승`}`}`),
        h('div', { class: 'ps' }, (m.players || []).map(p => h('span', { class: p.win ? 'win' : '' },
          h('img', { src: charById(p.char).img, alt: '' }), `${p.win ? '👑 ' : ''}${p.nick}${p.hand ? ` (${p.hand})` : ''} `, h('small', { class: p.delta > 0 ? 'plus' : p.delta < 0 ? 'minus' : '' }, signed(p.delta))))))) : [empty('최근 대결이 없어요.')]));
  } else {
    const list = users.sort((a, b) => (b.money || 0) - (a.money || 0));
    body.replaceChildren(h('div', { class: 'rank-list' }, list.length ? list.slice(0, 100).map((u, i) => item(u, i, won(u.money || 0),
      `고스톱 ${st(u).botWins || 0}승 · 섯다 ${st(u).sdWins || 0}승 · 온라인 ${st(u).onWins || 0}승`)) : empty('아직 가입한 사람이 없어요.')));
  }
}

// ───────────────── 어드민 ─────────────────
function openAdminLogin() {
  if (S.admin) return renderAdmin();
  const pw = h('input', { class: 'field', type: 'password', placeholder: '어드민 비밀번호', autocomplete: 'current-password' });
  const err = h('p', { class: 'err' });
  const close = openModal(h('form', {
    class: 'stack', onsubmit: async e => {
      e.preventDefault();
      if ((await sha256(pw.value)) === ADMIN.passwordSha256) {
        S.admin = true; sessionStorage.setItem('smj_admin', '1'); close(); renderAdmin();
      } else err.textContent = '비밀번호가 달라요';
    },
  }, h('h3', {}, '어드민계정 로그인'), pw, h('button', { class: 'btn red', type: 'submit' }, '로그인'), err));
}
async function renderAdmin(filter = '') {
  if (!S.admin) return openAdminLogin();
  const el = $('#scr-admin');
  const listEl = h('div', { class: 'stack' }, h('p', { class: 'on-felt-muted' }, '불러오는 중…'));
  const search = h('input', { class: 'field', placeholder: '닉네임으로 찾기', value: filter, oninput: () => draw() });
  const newNick = h('input', { class: 'field', maxlength: 10, placeholder: '새 플레이어 닉네임' });
  let newChar = CHARACTERS[0].id;
  const allAmt = h('input', { class: 'field', type: 'number', min: 1, step: 1000, placeholder: '전원 충전 금액' });
  el.replaceChildren(h('div', { class: 'wrap' },
    h('div', { class: 'row' }, h('h2', { class: 'grow', style: 'margin:0;font-family:var(--f-stamp);font-weight:400;font-size:30px' }, '어드민'),
      h('button', { class: 'btn ghost small', style: 'color:var(--on-felt)', onclick: leaveAdmin }, '돌아가기'),
      h('button', { class: 'btn ghost small', style: 'color:var(--on-felt)', onclick: () => { S.admin = false; sessionStorage.removeItem('smj_admin'); leaveAdmin(); } }, '어드민 로그아웃')),
    S.store.mode === 'local' ? h('p', { class: 'mode-note' }, 'Firebase 미연결: 이 브라우저의 플레이어만 관리돼요.') : null,
    h('details', { class: 'panel' }, h('summary', { style: 'font-weight:700;cursor:pointer' }, '새 플레이어 코드 발급'),
      h('div', { class: 'stack', style: 'margin-top:10px' }, newNick, charPicker(newChar, v => { newChar = v; }),
        h('button', {
          class: 'btn red', onclick: async () => {
            try { const u = await S.store.register(newNick.value.trim(), newChar); logCodeToSheet(u, u.code); showIssuedCode(u, () => renderAdmin()); }
            catch (x) { toast(x.message); }
          },
        }, '코드 발급'))),
    h('details', { class: 'panel' }, h('summary', { style: 'font-weight:700;cursor:pointer' }, '전원에게 충전'),
      h('div', { class: 'row', style: 'margin-top:10px' }, h('div', { class: 'grow' }, allAmt),
        h('button', {
          class: 'btn red', onclick: async () => {
            const amt = Math.floor(Number(allAmt.value));
            if (!(amt > 0)) return toast('충전 금액을 넣어 주세요');
            if (!(await confirmModal('전원에게 충전할까요?', `모든 플레이어에게 ${won(amt)}씩 넣어요.`, '충전'))) return;
            const us = await S.store.listUsers();
            for (const u of us) await S.store.updateUser(u.pid, x => { x.money = (x.money || 0) + amt; return x; });
            await S.store.logCharge({ code: '*', amount: amt, ts: Date.now() });
            toast(`${us.length}명에게 ${won(amt)}씩 충전했어요`); renderAdmin(search.value);
          },
        }, '충전'))),
    h('h3', { class: 'section-title' }, '플레이어'), search, listEl,
    h('button', { class: 'btn ghost small', style: 'color:var(--on-felt);justify-self:center', onclick: () => { ls.del('owner'); S.admin = false; sessionStorage.removeItem('smj_admin'); toast('이 기기에서 어드민 버튼을 숨겼어요'); leaveAdmin(); } }, '이 기기에서 어드민 버튼 숨기기'),
  ));
  show('scr-admin');
  let users = [];
  try { users = await S.store.listUsers(); } catch { listEl.replaceChildren(h('p', { class: 'err' }, '플레이어 목록을 불러오지 못했어요')); return; }
  users.sort((a, b) => (a.money || 0) - (b.money || 0));
  function draw() {
    const q = search.value.trim().toLowerCase();
    const list = users.filter(u => !q || u.nick.toLowerCase().includes(q));
    listEl.replaceChildren(...(list.length ? list.map(userRow) : [h('p', { class: 'on-felt-muted' }, '플레이어가 없어요')]));
  }
  function userRow(u) {
    const amt = h('input', { class: 'field', type: 'number', min: 1, step: 1000, placeholder: '금액', 'aria-label': `${u.nick} 금액` });
    const moneyEl = h('b', { class: 'money' }, won(u.money || 0));
    // sign: +1 충전, -1 빼기 (0원 아래로는 안 내려감)
    const adjust = async (v, sign) => {
      const all = v === 'all';
      const n = all ? (u.money || 0) : Math.floor(Number(v));
      if (!(n > 0)) return toast(sign > 0 ? '충전 금액을 넣어 주세요' : (all ? '뺄 자산이 없어요' : '뺄 금액을 넣어 주세요'));
      if (sign < 0 && !(await confirmModal(`${u.nick}에게서 ${all ? '자산 전부' : won(n)}를 뺄까요?`, `지금 자산 ${won(u.money || 0)}. 0원 아래로는 내려가지 않아요.`, '빼기'))) return;
      let applied = 0;
      const nu = await S.store.updateUser(u.pid, x => {
        const before = x.money || 0;
        x.money = Math.max(0, before + sign * (all ? before : n));
        applied = x.money - before;
        return x;
      });
      await S.store.logCharge({ pid: u.pid, nick: u.nick, amount: applied, ts: Date.now() });
      u.money = nu?.money ?? Math.max(0, (u.money || 0) + applied); moneyEl.textContent = won(u.money); amt.value = '';
      toast(applied >= 0 ? `${u.nick}에게 ${won(applied)} 충전` : `${u.nick}에게서 ${won(-applied)} 뺐어요`);
    };
    const label = v => (v >= 10000 ? v / 10000 + '만' : v);
    return h('div', { class: 'admin-user' },
      h('div', { class: 'row' }, avatar(u.char), h('div', { class: 'grow' }, h('b', {}, u.nick), h('div', { class: 'muted', style: 'font-size:13px' }, `가입 ${u.createdAt ? new Date(u.createdAt).toLocaleDateString('ko-KR') : '-'} · 최근 접속 ${u.lastDaily || '-'}`)), moneyEl),
      h('div', { class: 'row' }, [10000, 50000, 100000, 1000000].map(v => h('button', { class: 'btn ghost small', onclick: () => adjust(v, 1) }, `+${label(v)}`))),
      h('div', { class: 'row' }, [10000, 50000, 100000].map(v => h('button', { class: 'btn ghost small minus', onclick: () => adjust(v, -1) }, `−${label(v)}`)),
        h('button', { class: 'btn ghost small minus', onclick: () => adjust('all', -1) }, '전액 빼기')),
      h('div', { class: 'row' }, amt, h('button', { class: 'btn red small', onclick: () => adjust(amt.value, 1) }, '충전'),
        h('button', { class: 'btn small', onclick: () => adjust(amt.value, -1) }, '빼기')),
      h('div', { class: 'row' },
        h('button', { class: 'btn ghost small', onclick: () => reissueCode(u) }, '새 코드 발급'),
        h('button', {
          class: 'btn ghost small', onclick: async () => {
            if (!(await confirmModal(`${u.nick}을(를) 지울까요?`, '자산과 기록이 모두 사라지고 되돌릴 수 없어요.', '지우기'))) return;
            await S.store.deleteUser(u.pid); users = users.filter(x => x.pid !== u.pid); draw();
          },
        }, '삭제')));
  }
  draw();
}

// ───────────────── 시작 ─────────────────
(async function boot() {
  S.store = await createStore();
  setTimeout(preloadCards, 300);
  const saved = ls.get('code', null);
  if (saved) {
    try { if (await doLogin(saved)) return; } catch (e) { console.error(e); }
  }
  renderLogin();
})();

