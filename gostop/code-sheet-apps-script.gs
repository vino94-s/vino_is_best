/**
 * 손모가지 조심! 개인코드 기록용 Apps Script
 *
 * 게임에서 가입·코드 발급이 일어나면 닉네임과 개인코드를 이 시트 첫 탭에 한 줄씩 기록해요.
 * 받은 코드가 진짜 계정인지 Firebase에서 확인한 뒤에만 기록하고,
 * 이 웹 앱 주소로는 시트 내용을 읽을 수 없어요 (쓰기 전용).
 *
 * 설치: 시트 메뉴 확장 프로그램 → Apps Script → 이 코드 붙여넣기 → 저장
 *       → 배포 → 새 배포 → 유형: 웹 앱, 실행: 나, 액세스: 모든 사용자 → 배포
 *       → 나온 웹 앱 주소(…/exec)를 게임의 js/config.js SHEET_API 에 넣기
 */
const FIREBASE_URL = 'https://gostop-7c4a2-default-rtdb.asia-southeast1.firebasedatabase.app';
const HEADER = ['닉네임', '개인코드', '캐릭터', '발급일시', '비고'];

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const d = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const code = String(d.code || '').trim().toUpperCase();
    if (!/^[A-Z2-9]{6}$/.test(code)) return out_({ ok: false });

    // 진짜 계정인지 확인 (가짜 기록 방지)
    const acc = fetchJson_('/accounts/' + code + '.json');
    if (!acc || !acc.pid) return out_({ ok: false });
    const p = fetchJson_('/players/' + encodeURIComponent(acc.pid) + '.json');
    if (!p || !p.nick) return out_({ ok: false });

    const sh = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
    if (sh.getLastRow() === 0) sh.appendRow(HEADER);
    const n = sh.getLastRow() - 1;
    if (n > 0) {
      const codes = sh.getRange(2, 2, n, 1).getValues().map(r => String(r[0]));
      if (codes.indexOf(code) >= 0) return out_({ ok: true, dup: true });
    }
    const nickRows = n > 0 ? sh.getRange(2, 1, n, 1).getValues().map(r => String(r[0])) : [];
    const note = nickRows.indexOf(p.nick) >= 0 ? '추가 발급' : '';
    const when = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm');
    sh.appendRow([p.nick, code, String(d.char || ''), when, note]);
    sh.getRange(sh.getLastRow(), 2).setNumberFormat('@');
    return out_({ ok: true });
  } catch (err) {
    return out_({ ok: false });
  } finally {
    lock.releaseLock();
  }
}

// 주소로 열어도 아무 정보도 보여주지 않아요
function doGet() { return out_({ ok: true }); }

function fetchJson_(path) {
  const r = UrlFetchApp.fetch(FIREBASE_URL + path, { muteHttpExceptions: true });
  if (r.getResponseCode() !== 200) return null;
  return JSON.parse(r.getContentText());
}
function out_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
