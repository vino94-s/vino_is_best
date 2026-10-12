/**
 * 고네이크 공유 랭킹 서버 (Google Apps Script 웹 앱)
 *
 * 설치
 * 1. 새 구글 시트를 만들고 확장 프로그램 > Apps Script 를 엽니다.
 * 2. 이 파일 내용을 전부 붙여넣고 저장합니다.
 * 3. 배포 > 새 배포 > 유형: 웹 앱
 *    - 다음 사용자로 실행: 나
 *    - 액세스 권한이 있는 사용자: 모든 사용자
 * 4. 배포 후 나오는 웹 앱 URL(https://script.google.com/macros/s/.../exec)을
 *    gonake/index.html 의 RANK_API 에 넣습니다.
 *
 * 기록은 시트의 'scores' 탭에 한 줄씩 쌓입니다. 장난 기록은 그 줄을 지우면 랭킹에서 빠집니다.
 */

const SHEET_NAME = 'scores';
const HEADER = ['id', 'name', 'score', 'waist', 'meat', 'at'];
const MAX_MEAT = 321; // 18x18 판에서 먹을 수 있는 최대 고기 수

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

// 랭킹 조회: 점수 높은 순, 같은 점수면 먼저 세운 기록이 위
function doGet() {
  const values = sheet_().getDataRange().getValues();
  values.shift();
  const rows = values
    .filter(r => r[0] && r[1] !== '')
    .map(r => ({
      id: String(r[0]),
      name: String(r[1]).slice(0, 12),
      score: Number(r[2]) || 0,
      waist: Number(r[3]) || 0,
      meat: Number(r[4]) || 0,
      at: Number(r[5]) || 0,
    }))
    .sort((a, b) => b.score - a.score || a.at - b.at)
    .slice(0, 50);
  return json_({ ok: true, rows: rows });
}

// 기록 등록: 점수와 허리 길이는 먹은 고기 수로 서버에서 다시 계산
function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const d = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    let name = String(d.name || '').replace(/\s+/g, ' ').trim().slice(0, 12);
    const meat = Math.floor(Number(d.meat));
    if (!name) return json_({ ok: false, error: 'name' });
    if (!(meat >= 0 && meat <= MAX_MEAT)) return json_({ ok: false, error: 'score' });
    if (/^[=+\-@]/.test(name)) name = "'" + name; // 시트 수식으로 해석되지 않게
    const id = Utilities.getUuid().slice(0, 8);
    sheet_().appendRow([id, name, meat * 10, (meat + 2) * 15, meat, Date.now()]);
    return json_({ ok: true, id: id });
  } catch (err) {
    return json_({ ok: false, error: 'bad_request' });
  } finally {
    lock.releaseLock();
  }
}
