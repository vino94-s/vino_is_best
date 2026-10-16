/**
 * 내가바로 윷잡이! — 공유 랭킹 서버 (Google Apps Script 웹 앱)
 *
 * 설치
 * 1. 새 구글 시트를 만들고 확장 프로그램 > Apps Script 를 엽니다.
 * 2. 이 파일 내용을 전부 붙여넣고 저장합니다.
 * 3. 배포 > 새 배포 > 유형: 웹 앱
 *    - 다음 사용자로 실행: 나
 *    - 액세스 권한이 있는 사용자: 모든 사용자
 * 4. 배포 후 나오는 웹 앱 URL(https://script.google.com/macros/s/.../exec)을
 *    yutjabi/index.html 의 RANK_API 에 넣습니다.
 *
 * 'bot' 탭: 봇 대결 한 판마다 한 줄 (닉네임, 캐릭터, 승리 여부, 걸린 차례 수)
 * 'friend' 탭: 친구 대결 한 판마다 한 줄 (경기 id, 방식 1v1/2v2, 적팀·청팀 닉네임과 캐릭터, 이긴 팀, 봇 자리)
 * 장난 기록은 그 줄을 지우면 랭킹에서 빠집니다.
 */

const BOT_HEADER = ['nick', 'c', 'w', 'tn', 'at'];
const FRIEND_HEADER = ['gid', 'm', 'a', 'b', 'a2', 'b2', 'ca', 'cb', 'ca2', 'cb2', 'w', 'bots', 'at'];
const CHARS = ['gaeguri', 'imgeum', 'ddabong', 'manse', 'haetnim', 'kkokko', 'chureup', 'simuruk', 'mupyo', 'eomji', 'gentle'];
const KEEP = 800; // 최근 몇 판까지 돌려줄지

function sheet_(name, header) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.appendRow(header);
    sh.setFrozenRows(1);
  }
  return sh;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function clean_(s) {
  return String(s || '').replace(/^'/, '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 10);
}

function safe_(n) {
  return /^[=+\-@]/.test(n) ? "'" + n : n; // 시트 수식으로 해석되지 않게
}

function char_(c) {
  return CHARS.indexOf(String(c)) >= 0 ? String(c) : '';
}

function rows_(name, header) {
  const v = sheet_(name, header).getDataRange().getValues();
  v.shift();
  return v.slice(-KEEP).reverse();
}

// 랭킹 조회
function doGet() {
  const bot = rows_('bot', BOT_HEADER).map(r => ({
    nick: clean_(r[0]), c: char_(r[1]), w: r[2] === true || r[2] === 'TRUE', tn: Number(r[3]) || 0, at: Number(r[4]) || 0
  })).filter(r => r.nick);
  const friend = rows_('friend', FRIEND_HEADER).map(r => ({
    gid: String(r[0]), m: r[1] === '2v2' ? '2v2' : '1v1', a: clean_(r[2]), b: clean_(r[3]), a2: clean_(r[4]), b2: clean_(r[5]),
    ca: char_(r[6]), cb: char_(r[7]), ca2: char_(r[8]), cb2: char_(r[9]), w: Number(r[10]) ? 1 : 0, bots: String(r[11] || ''), at: Number(r[12]) || 0
  })).filter(r => r.a && r.b);
  return json_({ ok: true, bot: bot, friend: friend });
}

// 기록 등록
function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const d = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (d.kind === 'bot') {
      const nick = clean_(d.nick), tn = Math.floor(Number(d.tn)) || 0;
      if (!nick || tn < 0 || tn > 500) return json_({ ok: false, error: 'bad' });
      sheet_('bot', BOT_HEADER).appendRow([safe_(nick), char_(d.c), !!d.w, tn, Date.now()]);
    } else if (d.kind === 'friend') {
      const a = clean_(d.a), b = clean_(d.b), gid = String(d.gid || '').slice(0, 60), team = d.m === '2v2';
      const a2 = team ? clean_(d.a2) : '', b2 = team ? clean_(d.b2) : '';
      const bots = String(d.bots || '').split(',').filter(x => /^[0-3]$/.test(x)).join(',');
      if (!a || !b || !gid || (team && (!a2 || !b2))) return json_({ ok: false, error: 'bad' });
      const sh = sheet_('friend', FRIEND_HEADER);
      const ids = sh.getRange(1, 1, sh.getLastRow(), 1).getValues().map(r => String(r[0]));
      if (ids.indexOf(gid) < 0) sh.appendRow([gid, team ? '2v2' : '1v1', safe_(a), safe_(b), safe_(a2), safe_(b2), char_(d.ca), char_(d.cb), char_(d.ca2), char_(d.cb2), d.w ? 1 : 0, bots ? "'" + bots : '', Date.now()]); // 봇 자리 '1,3'이 숫자로 바뀌지 않게
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
