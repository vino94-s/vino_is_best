/**
 * 서커스(엠씨몽 노래아님) — 공유 랭킹 서버 (Google Apps Script 웹 앱)
 *
 * 설치
 * 1. 새 구글 시트를 만들고 확장 프로그램 > Apps Script 를 엽니다.
 * 2. 이 파일 내용을 전부 붙여넣고 저장합니다.
 * 3. 배포 > 새 배포 > 유형: 웹 앱
 *    - 다음 사용자로 실행: 나
 *    - 액세스 권한이 있는 사용자: 모든 사용자
 * 4. 배포 후 나오는 웹 앱 URL(https://script.google.com/macros/s/.../exec)을
 *    circus/index.html 의 RANK_API 에 넣습니다.
 *
 * 기록은 시트의 'scores' 탭에 한 줄씩 쌓입니다. 랭킹에는 닉네임마다 최고 기록 하나만 보입니다.
 * 장난 기록은 그 줄을 지우면 랭킹에서 빠집니다.
 */

const SHEET_NAME = 'scores';
const HEADER = ['id', 'name', 'score', 'meters', 'pots', 'rings', 'bags', 'ch', 'at'];
const MAX_METERS = 200000;
const CHARS = ['yongwang', 'myung', 'haessal', 'mandu', 'goran', 'bino', 'yeoni', 'juntak'];

function spreadsheet_() {
  const active = SpreadsheetApp.getActiveSpreadsheet();
  if (active) return active;
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('SHEET_ID');
  if (id) return SpreadsheetApp.openById(id);
  const created = SpreadsheetApp.create('서커스 랭킹');
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
        ch: String(r[7] || ''),
        at: Number(r[8]) || 0,
      };
      const cur = best[row.name];
      if (!cur || row.score > cur.score || (row.score === cur.score && row.at < cur.at)) best[row.name] = row;
    });
  const rows = Object.keys(best).map(k => best[k])
    .sort((a, b) => b.score - a.score || a.at - b.at)
    .slice(0, 50);
  return json_({ ok: true, rows: rows });
}

// 기록 등록: 점수 = 달린 거리(m) + 불항아리×100 + 불링×200 + 돈주머니×500 이어야 함
function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const d = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    let name = String(d.name || '').replace(/\s+/g, ' ').trim().slice(0, 12);
    const int = v => Math.floor(Number(v)) || 0;
    const score = int(d.score), meters = int(d.meters), pots = int(d.pots), rings = int(d.rings), bags = int(d.bags);
    const ch = CHARS.indexOf(d.ch) >= 0 ? d.ch : 'yongwang';
    if (!name) return json_({ ok: false, error: 'name' });
    const valid = score > 0 && meters >= 0 && meters <= MAX_METERS &&
      pots >= 0 && rings >= 0 && bags >= 0 && bags <= rings &&
      pots + rings <= meters / 3 + 6 &&
      score === meters + pots * 100 + rings * 200 + bags * 500;
    if (!valid) return json_({ ok: false, error: 'score' });
    if (/^[=+\-@]/.test(name)) name = "'" + name; // 시트 수식으로 해석되지 않게
    const id = Utilities.getUuid().slice(0, 8);
    sheet_().appendRow([id, name, score, meters, pots, rings, bags, ch, Date.now()]);
    return json_({ ok: true, id: id });
  } catch (err) {
    return json_({ ok: false, error: 'bad_request' });
  } finally {
    lock.releaseLock();
  }
}
