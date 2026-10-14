/**
 * 수염은 스타벅스만 잡아 — 공유 랭킹 서버 (Google Apps Script 웹 앱)
 *
 * 설치
 * 1. 새 구글 시트를 만들고 확장 프로그램 > Apps Script 를 엽니다.
 * 2. 이 파일 내용을 전부 붙여넣고 저장합니다.
 * 3. 배포 > 새 배포 > 유형: 웹 앱
 *    - 다음 사용자로 실행: 나
 *    - 액세스 권한이 있는 사용자: 모든 사용자
 * 4. 배포 후 나오는 웹 앱 URL(https://script.google.com/macros/s/.../exec)을
 *    siren/index.html 의 RANK_API 에 넣습니다.
 *
 * 기록은 시트의 'scores' 탭에 한 줄씩 쌓입니다. 랭킹에는 닉네임마다 최고 기록 하나만 보입니다.
 * 장난 기록은 그 줄을 지우면 랭킹에서 빠집니다.
 */

const SHEET_NAME = 'scores';
const HEADER = ['id', 'name', 'score', 'hits', 'at'];
const MAX_HITS = 20000;   // 한 판에 잡을 수 있는 컵 수 상한 (장난 방지)
const POINTS_PER_CUP = 10;

// 시트에서 만든 스크립트면 그 시트를, 따로 만든 스크립트면 랭킹용 시트를 하나 만들어 계속 씁니다.
function spreadsheet_() {
  const active = SpreadsheetApp.getActiveSpreadsheet();
  if (active) return active;
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('SHEET_ID');
  if (id) return SpreadsheetApp.openById(id);
  const created = SpreadsheetApp.create('수염은 스타벅스만 잡아 랭킹');
  props.setProperty('SHEET_ID', created.getId());
  return created;
}

function sheet_() {
  const ss = spreadsheet_();
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

// 랭킹 조회: 닉네임별 최고 점수 → 점수 높은 순, 같은 점수면 먼저 세운 기록이 위
function doGet() {
  const values = sheet_().getDataRange().getValues();
  values.shift();
  const best = {};
  values
    .filter(r => r[0] && r[1] !== '')
    .forEach(r => {
      const row = {
        name: String(r[1]).replace(/^'/, '').slice(0, 12),
        score: Number(r[2]) || 0,
        at: Number(r[4]) || 0,
      };
      const cur = best[row.name];
      if (!cur || row.score > cur.score || (row.score === cur.score && row.at < cur.at)) best[row.name] = row;
    });
  const rows = Object.keys(best).map(k => best[k])
    .sort((a, b) => b.score - a.score || a.at - b.at)
    .slice(0, 50);
  return json_({ ok: true, rows: rows });
}

// 기록 등록: 점수는 반드시 (잡은 컵 수 × 10) 이어야 함
function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const d = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    let name = String(d.name || '').replace(/\s+/g, ' ').trim().slice(0, 12);
    const score = Math.floor(Number(d.score)) || 0;
    const hits = Math.floor(Number(d.hits)) || 0;
    if (!name) return json_({ ok: false, error: 'name' });
    if (hits <= 0 || hits > MAX_HITS || score !== hits * POINTS_PER_CUP) return json_({ ok: false, error: 'score' });
    if (/^[=+\-@]/.test(name)) name = "'" + name; // 시트 수식으로 해석되지 않게
    const id = Utilities.getUuid().slice(0, 8);
    sheet_().appendRow([id, name, score, hits, Date.now()]);
    return json_({ ok: true, id: id });
  } catch (err) {
    return json_({ ok: false, error: 'bad_request' });
  } finally {
    lock.releaseLock();
  }
}
