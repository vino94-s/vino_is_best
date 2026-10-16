/**
 * 벙참 게임 플레이 횟수 집계 (Google Apps Script 웹 앱)
 *
 * 설치
 * 1. 새 구글 시트를 만들고 확장 프로그램 > Apps Script 를 엽니다.
 * 2. 이 파일 내용을 전부 붙여넣고 저장합니다.
 * 3. 배포 > 새 배포 > 유형: 웹 앱 (다음 사용자로 실행: 나 / 액세스 권한: 모든 사용자)
 * 4. 웹 앱 주소(https://script.google.com/macros/s/.../exec)를 go/index.html 의 PLAY_API 에 넣습니다.
 *
 * ?hit=게임ID  → 그 게임 횟수 +1 하고 전체 횟수를 돌려줘요.
 * (주소만)      → 전체 횟수만 돌려줘요.
 * 'plays' 탭: 게임별 누적 횟수 / 'play_log' 탭: 실행 기록(시각, 게임)
 */
const SHEET = 'plays';
const LOG = 'play_log';

function sheet_(name, header) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(name);
  if (!sh) { sh = ss.insertSheet(name); sh.appendRow(header); sh.setFrozenRows(1); }
  return sh;
}

function counts_() {
  const out = {};
  sheet_(SHEET, ['game', 'count', 'updated']).getDataRange().getValues().slice(1)
    .forEach(r => { if (r[0]) out[String(r[0])] = Number(r[1]) || 0; });
  return out;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  const g = String((e && e.parameter && e.parameter.hit) || '');
  if (g) {
    if (!/^[a-z0-9-]{2,30}$/.test(g)) return json_({ ok: false, error: 'bad_game' });
    const lock = LockService.getScriptLock();
    if (lock.tryLock(5000)) {
      try {
        const sh = sheet_(SHEET, ['game', 'count', 'updated']);
        const v = sh.getDataRange().getValues();
        let row = -1;
        for (let i = 1; i < v.length; i++) if (String(v[i][0]) === g) { row = i + 1; break; }
        if (row < 0) sh.appendRow([g, 1, new Date()]);
        else sh.getRange(row, 2, 1, 2).setValues([[(Number(v[row - 1][1]) || 0) + 1, new Date()]]);
        sheet_(LOG, ['time', 'game']).appendRow([new Date(), g]);
      } finally { lock.releaseLock(); }
    }
  }
  return json_({ ok: true, updated: new Date().toISOString(), counts: counts_() });
}
