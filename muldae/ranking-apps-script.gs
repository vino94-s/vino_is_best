/**
 * 천하제일 무술대회 — 봇 대전 공유 랭킹 서버 (Google Apps Script 웹 앱)
 *
 * 설치
 * 1. 새 구글 시트를 만들고 확장 프로그램 > Apps Script 를 엽니다.
 * 2. 이 파일 내용을 전부 붙여넣고 저장합니다.
 * 3. 배포 > 새 배포 > 유형: 웹 앱
 *    - 다음 사용자로 실행: 나
 *    - 액세스 권한이 있는 사용자: 모든 사용자
 * 4. 배포 후 나오는 웹 앱 URL(https://script.google.com/macros/s/.../exec)을
 *    muldae/index.html 의 RANK_API 에 넣습니다.
 *
 * 봇 대전에서 이긴 기록만 올라옵니다(친구 대전은 게임에서 등록 버튼이 나오지 않음).
 * 기록은 시트의 'scores' 탭에 한 줄씩 쌓입니다. 장난 기록은 그 줄을 지우면 랭킹에서 빠집니다.
 * 점수 = 난이도(쉬움 100 / 보통 250 / 고수 450) + 2:0 완승 100 + 남은 체력 보너스(최대 200)
 */

const SHEET_NAME = 'scores';
const HEADER = ['id', 'name', 'ch', 'diff', 'score', 'rw', 'at'];
const CHARS = ['bino', 'mandu', 'juntak', 'youngjun', 'haetsal', 'umji', 'goran'];
const BASE = { easy: 100, normal: 250, hard: 450 };

function sheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    sh.appendRow(HEADER);
    sh.setFrozenRows(1);
  }
  return sh;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// 랭킹 조회: 점수 높은 순 → 먼저 세운 기록
function doGet() {
  const values = sheet_().getDataRange().getValues();
  values.shift();
  const rows = values
    .filter(r => r[0] && r[1] !== '')
    .map(r => ({
      id: String(r[0]),
      name: String(r[1]).replace(/^'/, '').slice(0, 10),
      ch: String(r[2]),
      diff: String(r[3]),
      score: Number(r[4]) || 0,
      rw: String(r[5]),
      at: Number(r[6]) || 0,
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
    let name = String(d.name || '').replace(/\s+/g, ' ').trim().slice(0, 10);
    const ch = String(d.ch || ''), diff = String(d.diff || ''), rw = String(d.rw || '');
    const score = Math.floor(Number(d.score));
    if (!name) return json_({ ok: false, error: 'name' });
    if (CHARS.indexOf(ch) < 0 || !(diff in BASE)) return json_({ ok: false, error: 'bad_request' });
    if (!/^[12]:[01]$/.test(rw)) return json_({ ok: false, error: 'score' });
    // 점수는 난이도 기본점 ~ 기본점+300 사이여야 함
    const min = BASE[diff], max = BASE[diff] + 300;
    if (!(score >= min && score <= max)) return json_({ ok: false, error: 'score' });
    if (/:1$/.test(rw) && score > BASE[diff] + 200) return json_({ ok: false, error: 'score' });
    if (/^[=+\-@]/.test(name)) name = "'" + name; // 시트 수식으로 해석되지 않게
    const id = Utilities.getUuid().slice(0, 8);
    sheet_().appendRow([id, name, ch, diff, score, rw, Date.now()]);
    return json_({ ok: true, id: id });
  } catch (err) {
    return json_({ ok: false, error: 'bad_request' });
  } finally {
    lock.releaseLock();
  }
}
