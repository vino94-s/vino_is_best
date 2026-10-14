/**
 * 천하제일 무술대회 — 공유 랭킹 서버 (Google Apps Script 웹 앱)
 *   · 봇 도전(10단계) 점수 → 'stage_scores' 탭
 *   · 친구 대결 전적      → 'duels' 탭
 *
 * 설치 / 갱신
 * 1. 구글 시트에서 확장 프로그램 > Apps Script 를 엽니다.
 * 2. 이 파일 내용을 전부 붙여넣고 저장합니다.
 * 3. 처음이면: 배포 > 새 배포 > 유형: 웹 앱 (실행: 나 / 액세스: 모든 사용자)
 *    이미 배포했으면: 배포 > 배포 관리 > 수정(연필) > 버전: 새 버전 > 배포  ← 주소가 그대로 유지됨
 * 4. 웹 앱 URL(https://script.google.com/macros/s/.../exec)을 muldae/index.html 의 RANK_API 에 넣습니다.
 *
 * 봇 도전은 한 단계 이상 깬 기록만 올라옵니다.
 * 기록은 시트의 'stage_scores' 탭에 한 줄씩 쌓입니다. 장난 기록은 그 줄을 지우면 랭킹에서 빠집니다.
 * (예전 난이도 방식 기록이 있던 'scores' 탭은 더 이상 쓰지 않습니다.)
 *
 * 친구 대결은 끝까지 치른 판만 방장 브라우저가 한 번 기록합니다(누가·어떤 캐릭터로·누구와·몇 대 몇).
 * 같은 닉네임은 같은 사람으로 셉니다. 장난 기록은 'duels' 탭에서 그 줄을 지우면 전적에서 빠집니다.
 *
 * 점수 = 깬 단계마다 [단계 점수 + 2:0 완승 50 + 남은 체력 보너스(최대 100)]의 합
 *   단계 점수: n단계 = 50 + 30×n (1단계 80 … 9단계 320), 10단계 보스 = 600
 */

const SHEET_NAME = 'stage_scores';
const HEADER = ['id', 'name', 'ch', 'stage', 'score', 'at'];
const CHARS = ['bino', 'mandu', 'juntak', 'youngjun', 'haetsal', 'umji', 'goran', 'yongwang', 'myoungradak'];
const stageBase_ = s => (s >= 10 ? 600 : 50 + s * 30);
const DUEL_SHEET = 'duels';
const DUEL_HEADER = ['id', 'mid', 'p1', 'c1', 'p2', 'c2', 'w', 'sc', 'at'];

function sheet_(name, header) {
  name = name || SHEET_NAME; header = header || HEADER;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.appendRow(header);
    sh.setFrozenRows(1);
  }
  return sh;
}

function cleanName_(v) {
  return String(v || '').replace(/^'/, '').replace(/\s+/g, ' ').trim().slice(0, 10);
}
function safeCell_(name) { return /^[=+\-@]/.test(name) ? "'" + name : name; } // 시트 수식으로 해석되지 않게

// 친구 대결 조회: 최근 50판 + 닉네임별 전적(전체 기록 기준)
function getDuels_() {
  const values = sheet_(DUEL_SHEET, DUEL_HEADER).getDataRange().getValues();
  values.shift();
  const all = values
    .filter(r => r[0] && r[2] !== '' && r[4] !== '')
    .map(r => ({
      mid: String(r[1]), p1: cleanName_(r[2]), c1: String(r[3]), p2: cleanName_(r[4]), c2: String(r[5]),
      w: Number(r[6]), sc: String(r[7]).replace(/^'/, ''), at: Number(r[8]) || 0,
    }));
  const P = {};
  all.forEach(r => {
    [[0, r.p1, r.c1], [1, r.p2, r.c2]].forEach(x => {
      const side = x[0], name = x[1], ch = x[2];
      const p = P[name] || (P[name] = { name: name, w: 0, l: 0, d: 0, chars: {} });
      if (r.w < 0) p.d++; else if (r.w === side) p.w++; else p.l++;
      p.chars[ch] = (p.chars[ch] || 0) + 1;
    });
  });
  const rate = p => (p.w + p.l + p.d ? p.w / (p.w + p.l + p.d) : 0);
  const players = Object.keys(P).map(k => {
    const p = P[k];
    return { name: p.name, w: p.w, l: p.l, d: p.d, ch: Object.keys(p.chars).sort((a, b) => p.chars[b] - p.chars[a])[0] };
  }).sort((a, b) => b.w - a.w || rate(b) - rate(a) || (b.w + b.l + b.d) - (a.w + a.l + a.d)).slice(0, 50);
  const rows = all.sort((a, b) => b.at - a.at).slice(0, 50);
  return json_({ ok: true, kind: 'duels', rows: rows, players: players });
}

// 친구 대결 기록 등록
function postDuel_(d) {
  const p1 = cleanName_(d.p1), p2 = cleanName_(d.p2);
  const c1 = String(d.c1 || ''), c2 = String(d.c2 || ''), sc = String(d.sc || '');
  const w = Number(d.w), mid = String(d.mid || '');
  if (!p1 || !p2) return json_({ ok: false, error: 'name' });
  if (CHARS.indexOf(c1) < 0 || CHARS.indexOf(c2) < 0) return json_({ ok: false, error: 'bad_request' });
  if (!/^[a-z0-9]{6,20}$/.test(mid)) return json_({ ok: false, error: 'bad_request' });
  const m = /^([0-5]):([0-5])$/.exec(sc);
  if (!m || [-1, 0, 1].indexOf(w) < 0) return json_({ ok: false, error: 'score' });
  const a = Number(m[1]), b = Number(m[2]);
  // 이긴 쪽이 2판(무승부가 끼면 1판 이상) 먼저 가져가야 함
  if (w === 0 && !(a > b)) return json_({ ok: false, error: 'score' });
  if (w === 1 && !(b > a)) return json_({ ok: false, error: 'score' });
  if (w === -1 && a !== b) return json_({ ok: false, error: 'score' });
  if (Math.max(a, b) > 2) return json_({ ok: false, error: 'score' });
  const sh = sheet_(DUEL_SHEET, DUEL_HEADER);
  const last = sh.getLastRow();
  if (last > 1) {
    const from = Math.max(2, last - 300);
    const mids = sh.getRange(from, 2, last - from + 1, 1).getValues();
    if (mids.some(r => String(r[0]) === mid)) return json_({ ok: true, id: 'dup' }); // 같은 판 중복 등록 방지
  }
  const id = Utilities.getUuid().slice(0, 8);
  sh.appendRow([id, mid, safeCell_(p1), c1, safeCell_(p2), c2, w, "'" + sc, Date.now()]);
  return json_({ ok: true, id: id });
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// 랭킹 조회: ?type=duels 면 친구 대결, 아니면 봇 도전 (점수 높은 순 → 먼저 세운 기록)
function doGet(e) {
  if (e && e.parameter && e.parameter.type === 'duels') return getDuels_();
  const values = sheet_().getDataRange().getValues();
  values.shift();
  const rows = values
    .filter(r => r[0] && r[1] !== '')
    .map(r => ({
      id: String(r[0]),
      name: String(r[1]).replace(/^'/, '').slice(0, 10),
      ch: String(r[2]),
      stage: Number(r[3]) || 0,
      score: Number(r[4]) || 0,
      at: Number(r[5]) || 0,
    }))
    .sort((a, b) => b.score - a.score || a.at - b.at)
    .slice(0, 50);
  return json_({ ok: true, rows: rows });
}

// 기록 등록
function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const d = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (d.type === 'duel') return postDuel_(d);
    let name = String(d.name || '').replace(/\s+/g, ' ').trim().slice(0, 10);
    const ch = String(d.ch || '');
    const stage = Math.floor(Number(d.stage));
    const score = Math.floor(Number(d.score));
    if (!name) return json_({ ok: false, error: 'name' });
    if (CHARS.indexOf(ch) < 0) return json_({ ok: false, error: 'bad_request' });
    if (!(stage >= 1 && stage <= 10)) return json_({ ok: false, error: 'score' });
    // 깬 단계 수로 가능한 점수 범위 확인
    let min = 0, max = 0;
    for (let s = 1; s <= stage; s++) { min += stageBase_(s); max += stageBase_(s) + 150; }
    if (!(score >= min && score <= max)) return json_({ ok: false, error: 'score' });
    if (/^[=+\-@]/.test(name)) name = "'" + name; // 시트 수식으로 해석되지 않게
    const id = Utilities.getUuid().slice(0, 8);
    sheet_().appendRow([id, name, ch, stage, score, Date.now()]);
    return json_({ ok: true, id: id });
  } catch (err) {
    return json_({ ok: false, error: 'bad_request' });
  } finally {
    lock.releaseLock();
  }
}
