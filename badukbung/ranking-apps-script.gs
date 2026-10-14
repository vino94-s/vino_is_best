/**
 * 대환장 바둑벙 — 공유 랭킹 서버 (Google Apps Script 웹 앱)
 *
 * 설치
 * 1. 새 구글 시트를 만들고 확장 프로그램 > Apps Script 를 엽니다.
 * 2. 이 파일 내용을 전부 붙여넣고 저장합니다.
 * 3. 배포 > 새 배포 > 유형: 웹 앱
 *    - 다음 사용자로 실행: 나
 *    - 액세스 권한이 있는 사용자: 모든 사용자
 * 4. 배포 후 나오는 웹 앱 URL(https://script.google.com/macros/s/.../exec)을
 *    badukbung/index.html 의 RANK_API 에 넣습니다.
 *
 * 'bot' 탭: 봇 대결 한 판마다 한 줄 (닉네임, 게임, 단계, 승패, 최고단계)
 * 'friend' 탭: 친구 대결 한 판마다 한 줄 (게임, 승자, 패자)
 * 장난 기록은 그 줄을 지우면 랭킹에서 빠집니다.
 */

const BOT_HEADER = ['nick', 'game', 'stage', 'won', 'best', 'at'];
const FRIEND_HEADER = ['game', 'winner', 'loser', 'at'];
const GAMES = ['alk', 'omok'];

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
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function clean_(s) {
  let n = String(s || '').replace(/^'/, '').replace(/\s+/g, ' ').trim().slice(0, 10);
  return n;
}

function safe_(n) {
  return /^[=+\-@]/.test(n) ? "'" + n : n; // 시트 수식으로 해석되지 않게
}

// 랭킹 조회
function doGet() {
  const bot = {};
  const b = sheet_('bot', BOT_HEADER).getDataRange().getValues();
  b.shift();
  b.forEach(r => {
    const nick = clean_(r[0]), game = String(r[1]);
    if (!nick || GAMES.indexOf(game) < 0) return;
    const p = bot[nick] = bot[nick] || { nick: nick, alk: { best: 0, wins: 0, plays: 0 }, omok: { best: 0, wins: 0, plays: 0 } };
    const g = p[game];
    g.plays++;
    if (r[3] === true || r[3] === 'TRUE') g.wins++;
    g.best = Math.max(g.best, Math.min(20, Number(r[4]) || 0));
  });

  const friend = {};
  const f = sheet_('friend', FRIEND_HEADER).getDataRange().getValues();
  f.shift();
  f.forEach(r => {
    const game = String(r[0]), w = clean_(r[1]), l = clean_(r[2]);
    if (GAMES.indexOf(game) < 0 || !w || !l) return;
    [[w, 'w'], [l, 'l']].forEach(([n, k]) => {
      const p = friend[n] = friend[n] || {};
      const g = p[game] = p[game] || { w: 0, l: 0 };
      g[k]++;
    });
  });

  return json_({ ok: true, bot: Object.keys(bot).map(k => bot[k]), friend: friend });
}

// 기록 등록
function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const d = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (GAMES.indexOf(d.game) < 0) return json_({ ok: false, error: 'game' });
    if (d.kind === 'bot') {
      const nick = clean_(d.nick);
      const stage = Math.floor(Number(d.stage)) || 0;
      const best = Math.floor(Number(d.best)) || 0;
      if (!nick || stage < 1 || stage > 20 || best < 0 || best > 20) return json_({ ok: false, error: 'bad' });
      sheet_('bot', BOT_HEADER).appendRow([safe_(nick), d.game, stage, !!d.won, best, Date.now()]);
    } else if (d.kind === 'friend') {
      const w = clean_(d.winner), l = clean_(d.loser);
      if (!w || !l || w === l) return json_({ ok: false, error: 'bad' });
      sheet_('friend', FRIEND_HEADER).appendRow([d.game, safe_(w), safe_(l), Date.now()]);
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
