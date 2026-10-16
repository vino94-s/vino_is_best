/**
 * 할린데예 갈린데예 — 공유 랭킹 서버 (Google Apps Script 웹 앱)
 *
 * 설치
 * 1. 새 구글 시트를 만들고 확장 프로그램 > Apps Script 를 엽니다.
 * 2. 이 파일 내용을 전부 붙여넣고 저장합니다.
 * 3. 위쪽 함수 목록에서 setup 을 골라 ▶ 실행 → 권한 승인 (bot / friend 탭이 생겨요)
 * 4. 배포 > 새 배포 > 유형: 웹 앱
 *    - 다음 사용자로 실행: 나
 *    - 액세스 권한이 있는 사용자: 모든 사용자
 * 5. 배포 후 나오는 웹 앱 URL(https://script.google.com/macros/s/.../exec)을
 *    hallin/index.html 의 RANK_API 에 넣습니다.
 *
 * 'bot' 탭: 봇전 한 판마다 한 줄 (닉네임, 승리 여부, 봇 수, 난이도, 승점, 종 성공·헛방, 최고 반응ms, 남은 카드, 걸린 초)
 *           승점 = 이겼을 때만 난이도(쉬움1·보통2·어려움3) × 봇 수. 서버가 직접 계산해요.
 * 'friend' 탭: 친구대전 한 판마다 한 줄 (경기 id, 방 코드, 참가자 'A|B|C', 끝났을 때 카드 수, 우승자, 걸린 초, 봇 자리 '0|0|1')
 *           봇 자리(1)는 랭킹 개인 순위에서 빠지고 판별 기록에만 보여요.
 *           참가자 모두가 같은 경기 id로 보내고, 서버가 한 줄만 남겨요.
 * 장난 기록은 그 줄을 지우면 랭킹에서 빠집니다.
 */

const BOT_HEADER = ['nick', 'win', 'bots', 'lv', 'pts', 'rings', 'wrongs', 'best', 'cards', 'dur', 'at'];
const FRIEND_HEADER = ['gid', 'code', 'players', 'cards', 'winner', 'dur', 'at', 'bots', 'wi'];
const LV = { easy: 1, normal: 2, hard: 3 };
const DECK = 56;            // 카드 전체 장수
const KEEP_BOT = 1000;      // 최근 몇 판까지 돌려줄지
const KEEP_FRIEND = 300;

// 시트에서 만든 스크립트면 그 시트를, 따로 만든 프로젝트면 '할린데예 갈린데예 랭킹' 시트를 새로 만들어 써요
function book_() {
  const active = SpreadsheetApp.getActiveSpreadsheet();
  if (active) return active;
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('SHEET_ID');
  if (id) { try { return SpreadsheetApp.openById(id); } catch (e) {} }
  const ss = SpreadsheetApp.create('할린데예 갈린데예 랭킹');
  props.setProperty('SHEET_ID', ss.getId());
  return ss;
}

// 편집기에서 이 함수를 골라 ▶ 실행하면 권한 승인 창이 뜨고, 랭킹 시트 주소가 실행 로그에 나와요
function setup() {
  sheet_('bot', BOT_HEADER);
  sheet_('friend', FRIEND_HEADER);
  Logger.log('랭킹 시트: ' + book_().getUrl());
}

function sheet_(name, header) {
  const ss = book_();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.appendRow(header);
    sh.setFrozenRows(1);
  } else if (sh.getLastColumn() < header.length) {
    sh.getRange(1, 1, 1, header.length).setValues([header]); // 예전 시트에 새 칸 이름 채우기
  }
  return sh;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function clean_(s) {
  return String(s == null ? '' : s).replace(/^'/, '').replace(/[<>|]/g, '').replace(/\s+/g, ' ').trim().slice(0, 10);
}

function safe_(n) {
  return /^[=+\-@]/.test(n) ? "'" + n : n; // 시트 수식으로 해석되지 않게
}

function int_(v, lo, hi) {
  const n = Math.floor(Number(v));
  return isFinite(n) && n >= lo && n <= hi ? n : null;
}

function rows_(name, header, keep) {
  const v = sheet_(name, header).getDataRange().getValues();
  v.shift();
  return v.slice(-keep).reverse();
}

// 랭킹 조회 — 게임 화면이 그대로 쓰는 모양으로 돌려줘요
function doGet() {
  const bot = rows_('bot', BOT_HEADER, KEEP_BOT).map(r => ({
    n: clean_(r[0]), win: r[1] === true || r[1] === 'TRUE', bots: Number(r[2]) || 0, lv: LV[r[3]] ? String(r[3]) : 'normal',
    pts: Number(r[4]) || 0, rings: Number(r[5]) || 0, wrongs: Number(r[6]) || 0, best: Number(r[7]) || null,
    cards: Number(r[8]) || 0, dur: Number(r[9]) || 0, ts: Number(r[10]) || 0
  })).filter(r => r.n);

  const friend = rows_('friend', FRIEND_HEADER, KEEP_FRIEND).map(r => {
    const names = String(r[2] || '').split('|').map(clean_);
    const cards = String(r[3] || '').replace(/^'/, '').split('|').map(x => Number(x) || 0);
    const bots = String(r[7] == null ? '' : r[7]).replace(/^'/, '').split('|').map(x => x === '1' ? 1 : 0);
    const wi = r[8] === '' || r[8] == null ? -1 : Number(r[8]);
    const m = {
      mid: String(r[0]), code: String(r[1] || '').replace(/^'/, ''), ts: Number(r[6]) || 0, dur: Number(r[5]) || 0,
      ps: names.map((n, i) => ({ n: n, c: cards[i] || 0, b: bots[i] || 0 })), w: { n: clean_(r[4]) }
    };
    if (wi >= 0 && wi < names.length) m.wi = wi;
    return m;
  }).filter(m => m.ps.length >= 2 && m.ps.every(p => p.n) && m.w.n);

  return json_({ ok: true, bot: bot, friend: friend });
}

// 기록 등록
function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const d = JSON.parse((e && e.postData && e.postData.contents) || '{}');

    if (d.kind === 'bot') {
      const nick = clean_(d.n);
      const bots = int_(d.bots, 1, 3), rings = int_(d.rings, 0, 300), wrongs = int_(d.wrongs, 0, 300);
      const cards = int_(d.cards, 0, DECK), dur = int_(d.dur, 0, 400);
      const best = d.best == null || d.best === '' ? '' : int_(d.best, 60, 9999);
      const lv = LV[d.lv] ? String(d.lv) : null;
      const win = d.win === true;
      if (!nick || !lv || bots === null || rings === null || wrongs === null || cards === null || dur === null || best === null)
        return json_({ ok: false, error: 'bad' });
      if (win && cards === 0) return json_({ ok: false, error: 'bad' });
      const pts = win ? LV[lv] * bots : 0;
      sheet_('bot', BOT_HEADER).appendRow([safe_(nick), win, bots, lv, pts, rings, wrongs, best, cards, dur, Date.now()]);

    } else if (d.kind === 'friend') {
      const gid = String(d.gid || '').slice(0, 60);
      const code = String(d.code || '').toUpperCase();
      const names = Array.isArray(d.ps) ? d.ps.map(clean_) : [];
      const cards = Array.isArray(d.cs) ? d.cs.map(c => int_(c, 0, DECK)) : [];
      const wi = int_(d.wi, 0, 3), dur = int_(d.dur, 0, 400);
      const bt = Array.isArray(d.bt) ? d.bt.map(b => b === 1 || b === true ? 1 : 0) : names.map(() => 0);
      if (!/^[A-Z0-9]{5}-[a-z0-9]{4,12}$/.test(gid) || !/^[A-Z0-9]{5}$/.test(code)) return json_({ ok: false, error: 'bad' });
      if (names.length < 2 || names.length > 4 || names.some(n => !n)) return json_({ ok: false, error: 'bad' });
      if (cards.length !== names.length || cards.some(c => c === null) || cards.reduce((a, b) => a + b, 0) > DECK) return json_({ ok: false, error: 'bad' });
      if (wi === null || wi >= names.length || dur === null) return json_({ ok: false, error: 'bad' });
      if (bt.length !== names.length || bt.indexOf(0) < 0 || bt.reduce((a, b) => a + b, 0) > 3) return json_({ ok: false, error: 'bad' });

      const sh = sheet_('friend', FRIEND_HEADER);
      const last = sh.getLastRow();
      const from = Math.max(2, last - 499);
      const ids = last >= 2 ? sh.getRange(from, 1, last - from + 1, 1).getValues().map(r => String(r[0])) : [];
      if (ids.indexOf(gid) < 0) {
        sh.appendRow([gid, "'" + code, safe_(names.join('|')), "'" + cards.join('|'), safe_(names[wi]), dur, Date.now(), "'" + bt.join('|'), wi]);
      }

    } else {
      return json_({ ok: false, error: 'kind' });
    }
    return json_({ ok: true });
  } catch (err) {
    return json_({ ok: false, error: 'bad_request' });
  } finally {
    lock.releaseLock();
  }
}
