/**
 * 꼴푸왕은 홀인원 — 공유 명예의 전당 (Google Apps Script 웹 앱)
 *
 * 기존 스크립트를 이 파일로 교체하는 방법 (웹 앱 주소는 그대로 유지됩니다)
 * 1. 랭킹 시트에서 확장 프로그램 > Apps Script 를 엽니다.
 * 2. 기존 코드를 전부 지우고 이 파일 내용을 붙여넣은 뒤 저장합니다.
 * 3. 배포 > 배포 관리 > (기존 웹 앱) 연필 아이콘 > 버전: '새 버전' > 배포
 *    ※ '새 배포'를 누르면 주소가 바뀌니 꼭 '배포 관리'에서 버전만 올리세요.
 *
 * 처음 설치할 때는 배포 > 새 배포 > 웹 앱 (실행: 나, 액세스: 모든 사용자) 후
 * 나온 주소를 golf/index.html 의 RANK_API 에 넣습니다.
 *
 * 시트 구조
 * - 기록은 'scores' 탭에 한 줄씩 쌓입니다. 장난 기록은 그 줄을 지우면 빠집니다.
 * - 열은 제목(1행) 이름으로 찾기 때문에 기존 시트를 그대로 써도 됩니다.
 *   없는 열(예: difficulty)은 맨 오른쪽에 자동으로 추가됩니다.
 * - difficulty 가 비어 있는 예전 기록은 코스 이름의 [이지]/[노멀]/[하드]/[헬] 표시로,
 *   그것도 없으면 '노멀'로 처리합니다.
 */

const SHEET_NAME = 'scores';
const COLS = ['id', 'name', 'holes', 'strokes', 'toPar', 'difficulty', 'course', 'courseId', 'weather', 'at'];
const DIFFS = ['easy', 'normal', 'hard', 'hell'];
const DIFF_KO = { '이지': 'easy', '노멀': 'normal', '하드': 'hard', '헬': 'hell' };
const PER_DIFF = 50; // 홀 수·난이도별로 돌려주는 최대 기록 수

function sheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    sh.appendRow(COLS);
    sh.setFrozenRows(1);
  }
  return sh;
}

// 1행 제목을 읽어 열 위치를 찾고, 빠진 열은 오른쪽에 추가
function header_(sh) {
  const lastCol = Math.max(1, sh.getLastColumn());
  const head = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(v => String(v).trim());
  COLS.forEach(c => {
    if (head.indexOf(c) < 0) {
      head.push(c);
      sh.getRange(1, head.length).setValue(c);
    }
  });
  const idx = {};
  head.forEach((h, i) => { if (h) idx[h] = i; });
  return { head, idx };
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function diffOf_(difficulty, course, courseId) {
  if (DIFFS.indexOf(difficulty) >= 0) return difficulty;
  const m = /^\[(이지|노멀|하드|헬)\]/.exec(course || '');
  if (m) return DIFF_KO[m[1]];
  const k = String(courseId || '').split(':')[0];
  if (String(courseId || '').indexOf(':') > 0 && DIFFS.indexOf(k) >= 0) return k;
  return 'normal';
}

// 랭킹 조회: ?holes=9|18 [&difficulty=easy|normal|hard|hell]
// 타수 적은 순 → 먼저 세운 기록. 난이도마다 따로 상위 PER_DIFF개씩 돌려줍니다.
function doGet(e) {
  const p = (e && e.parameter) || {};
  const holes = Number(p.holes) === 9 ? 9 : 18;
  const only = DIFFS.indexOf(p.difficulty) >= 0 ? p.difficulty : '';
  const sh = sheet_();
  const { idx } = header_(sh);
  const values = sh.getDataRange().getValues();
  values.shift();
  const get = (r, c) => (idx[c] === undefined ? '' : r[idx[c]]);
  const all = values
    .filter(r => get(r, 'id') && get(r, 'name') !== '' && Number(get(r, 'holes')) === holes)
    .map(r => {
      const course = String(get(r, 'course') || '');
      const courseId = String(get(r, 'courseId') || '');
      return {
        id: String(get(r, 'id')),
        name: String(get(r, 'name')).replace(/^'/, '').slice(0, 12),
        holes: holes,
        strokes: Number(get(r, 'strokes')) || 0,
        toPar: Number(get(r, 'toPar')) || 0,
        difficulty: diffOf_(String(get(r, 'difficulty') || ''), course, courseId),
        course: course.replace(/^'/, ''),
        courseId: courseId,
        weather: String(get(r, 'weather') || ''),
        at: Number(get(r, 'at')) || 0,
      };
    })
    .filter(r => r.strokes > 0)
    .sort((a, b) => a.strokes - b.strokes || a.at - b.at);
  let rows = [];
  (only ? [only] : DIFFS).forEach(d => {
    rows = rows.concat(all.filter(r => r.difficulty === d).slice(0, PER_DIFF));
  });
  rows.sort((a, b) => a.strokes - b.strokes || a.at - b.at);
  return json_({ ok: true, rows: rows });
}

// 기록 등록
function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const d = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    let name = String(d.name || '').replace(/\s+/g, ' ').trim().slice(0, 12);
    const holes = Number(d.holes) === 9 ? 9 : Number(d.holes) === 18 ? 18 : 0;
    const strokes = Math.floor(Number(d.strokes));
    const toPar = Math.floor(Number(d.toPar)) || 0;
    let course = String(d.course || '').slice(0, 40);
    const courseId = String(d.courseId || '').replace(/[^a-z0-9:_-]/gi, '').slice(0, 30);
    const weather = String(d.weather || '').slice(0, 10);
    if (!name) return json_({ ok: false, error: 'name' });
    if (!holes) return json_({ ok: false, error: 'holes' });
    // 최소: 전부 홀인원, 최대: 전부 양파(더블파). 파는 9홀 36, 18홀 72
    if (!(strokes >= holes && strokes <= holes * 8)) return json_({ ok: false, error: 'score' });
    const difficulty = diffOf_(String(d.difficulty || ''), course, courseId);
    if (/^[=+\-@]/.test(name)) name = "'" + name; // 시트 수식으로 해석되지 않게
    if (/^[=+\-@]/.test(course)) course = "'" + course;
    const id = Utilities.getUuid().slice(0, 8);
    const rec = { id, name, holes, strokes, toPar, difficulty, course, courseId, weather, at: Date.now() };
    const sh = sheet_();
    const { head } = header_(sh);
    sh.appendRow(head.map(h => (h in rec ? rec[h] : '')));
    return json_({ ok: true, id: id });
  } catch (err) {
    return json_({ ok: false, error: 'bad_request' });
  } finally {
    lock.releaseLock();
  }
}
