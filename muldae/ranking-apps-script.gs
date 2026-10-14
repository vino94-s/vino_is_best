/**
 * 천하제일 무술대회 — 봇 도전(10단계) 공유 랭킹 서버 (Google Apps Script 웹 앱)
 *
 * 설치 / 갱신
 * 1. 구글 시트에서 확장 프로그램 > Apps Script 를 엽니다.
 * 2. 이 파일 내용을 전부 붙여넣고 저장합니다.
 * 3. 처음이면: 배포 > 새 배포 > 유형: 웹 앱 (실행: 나 / 액세스: 모든 사용자)
 *    이미 배포했으면: 배포 > 배포 관리 > 수정(연필) > 버전: 새 버전 > 배포  ← 주소가 그대로 유지됨
 * 4. 웹 앱 URL(https://script.google.com/macros/s/.../exec)을 muldae/index.html 의 RANK_API 에 넣습니다.
 *
 * 봇 도전에서 한 단계 이상 깬 기록만 올라옵니다(친구 대전은 등록 버튼이 나오지 않음).
 * 기록은 시트의 'stage_scores' 탭에 한 줄씩 쌓입니다. 장난 기록은 그 줄을 지우면 랭킹에서 빠집니다.
 * (예전 난이도 방식 기록이 있던 'scores' 탭은 더 이상 쓰지 않습니다.)
 *
 * 점수 = 깬 단계마다 [단계 점수 + 2:0 완승 50 + 남은 체력 보너스(최대 100)]의 합
 *   단계 점수: n단계 = 50 + 30×n (1단계 80 … 9단계 320), 10단계 보스 = 600
 */

const SHEET_NAME = 'stage_scores';
const HEADER = ['id', 'name', 'ch', 'stage', 'score', 'at'];
const CHARS = ['bino', 'mandu', 'juntak', 'youngjun', 'haetsal', 'umji', 'goran', 'yongwang', 'myoungradak'];
const stageBase_ = s => (s >= 10 ? 600 : 50 + s * 30);

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
      stage: Number(r[3]) || 0,
      score: Number(r[4]) || 0,
      at: Number(r[5]) || 0,
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
    const ch = String(d.ch || '');
    const stage = Math.floor(Number(d.stage));
    const score = Math.floor(Number(d.score));
    if (!name) return json_({ ok: false, error: 'name' });
    if (CHARS.indexOf(ch) < 0) return json_({ ok: false, error: 'bad_request' });
    if (!(stage >= 1 && stage <= 10)) return json_({ ok: false, error: 'score' });
    // 깬 단계 수로 가능한 점수 범위 확인
    let min = 0, max = 0;
    for (let s = 1; s <= stage; s++) { min += stageBase_(s); max += stageBase_(s) + 150; }
    if (!(score >= min && score <= max)) return json_({ ok: false, error: 'score' });
    if (/^[=+\-@]/.test(name)) name = "'" + name; // 시트 수식으로 해석되지 않게
    const id = Utilities.getUuid().slice(0, 8);
    sheet_().appendRow([id, name, ch, stage, score, Date.now()]);
    return json_({ ok: true, id: id });
  } catch (err) {
    return json_({ ok: false, error: 'bad_request' });
  } finally {
    lock.releaseLock();
  }
}
