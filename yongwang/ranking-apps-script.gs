/**
 * 온세상 모든 바다는 용왕꺼야잇 — 공유 랭킹 서버 (Google Apps Script 웹 앱)
 *
 * 설치
 * 1. 새 구글 시트를 만들고 확장 프로그램 > Apps Script 를 엽니다.
 * 2. 이 파일 내용을 전부 붙여넣고 저장합니다.
 * 3. 배포 > 새 배포 > 유형: 웹 앱
 *    - 다음 사용자로 실행: 나
 *    - 액세스 권한이 있는 사용자: 모든 사용자
 * 4. 배포 후 나오는 웹 앱 URL(https://script.google.com/macros/s/.../exec)을
 *    yongwang/index.html 의 RANK_API 에 넣습니다.
 *
 * 기록은 시트의 'scores' 탭에 한 줄씩 쌓입니다. 장난 기록은 그 줄을 지우면 랭킹에서 빠집니다.
 * pct 는 0.1% 단위 정수입니다 (23.4% → 234).
 */

const SHEET_NAME = 'scores';
const HEADER = ['id', 'name', 'pct', 'kills', 'secs', 'at'];

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

// 랭킹 조회: 최고 점유율 높은 순 → 퇴치 많은 순 → 먼저 세운 기록
function doGet() {
  const values = sheet_().getDataRange().getValues();
  values.shift();
  const rows = values
    .filter(r => r[0] && r[1] !== '')
    .map(r => ({
      id: String(r[0]),
      name: String(r[1]).replace(/^'/, '').slice(0, 12),
      pct: Number(r[2]) || 0,
      kills: Number(r[3]) || 0,
      secs: Number(r[4]) || 0,
      at: Number(r[5]) || 0,
    }))
    .sort((a, b) => b.pct - a.pct || b.kills - a.kills || a.at - b.at)
    .slice(0, 50);
  return json_({ ok: true, rows: rows });
}

// 기록 등록
function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const d = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    let name = String(d.name || '').replace(/\s+/g, ' ').trim().slice(0, 12);
    const pct = Math.floor(Number(d.pct));
    const kills = Math.floor(Number(d.kills)) || 0;
    const secs = Math.floor(Number(d.secs)) || 0;
    if (!name) return json_({ ok: false, error: 'name' });
    if (!(pct >= 0 && pct <= 1000)) return json_({ ok: false, error: 'score' });
    if (kills < 0 || kills > 200 || secs < 0 || secs > 200) return json_({ ok: false, error: 'score' });
    if (/^[=+\-@]/.test(name)) name = "'" + name; // 시트 수식으로 해석되지 않게
    const id = Utilities.getUuid().slice(0, 8);
    sheet_().appendRow([id, name, pct, kills, secs, Date.now()]);
    return json_({ ok: true, id: id });
  } catch (err) {
    return json_({ ok: false, error: 'bad_request' });
  } finally {
    lock.releaseLock();
  }
}
