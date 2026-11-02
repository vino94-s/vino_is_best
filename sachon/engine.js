/* 사천성 가봤니? — 판 규칙 (화면과 상관없는 순수 계산)
   판은 가로 COLS × 세로 ROWS. 바깥 테두리 한 줄은 늘 비어 있어서 선이 지나갈 수 있어요.
   bd는 길이 ROWS*COLS 문자열: '.' = 빈칸, 'a'~'p' = 패 종류(KINDS 순서). */
(function (root) {
  'use strict';
  var ROWS = 12, COLS = 10, N = ROWS * COLS, PR = ROWS + 2, PC = COLS + 2;
  // 인형뽑기 기계의 기본 인형 16종 (공용 캐릭터 13명 + 현꿀오소리·헤존구·별나라)
  var KINDS = ['eomji', 'yeoni', 'yeongjun', 'yongwang', 'juntak', 'haetsal', 'goran', 'kkaegul',
    'mandu', 'myongradak', 'bongchum', 'bino', 'gana', 'honey', 'jongu', 'byeolnara'];

  // 판 모양 15종 (# = 패). 판이 다 지워지면 다른 모양으로 이어서 계속해요.
  var LAYOUTS = [
    { name: '꽉 찬 판', m: ['##########', '##########', '##########', '##########', '##########', '##########', '##########', '##########', '##########', '##########', '##########', '##########'] },
    { name: '피라미드', m: ['....##....', '...####...', '..######..', '.########.', '##########', '##########', '##########', '##########', '##########', '##########', '.########.', '..######..'] },
    { name: '하트', m: ['.###..###.', '##########', '##########', '##########', '##########', '.########.', '.########.', '..######..', '..######..', '...####...', '...####...', '....##....'] },
    { name: '다이아몬드', m: ['....##....', '...####...', '..######..', '.########.', '##########', '##########', '##########', '##########', '.########.', '..######..', '...####...', '....##....'] },
    { name: '두 기둥', m: ['####..####', '####..####', '####..####', '####..####', '####..####', '####..####', '####..####', '####..####', '####..####', '####..####', '####..####', '####..####'] },
    { name: '십자가', m: ['...####...', '...####...', '...####...', '##########', '##########', '##########', '##########', '##########', '##########', '...####...', '...####...', '...####...'] },
    { name: '줄무늬', m: ['##########', '.########.', '##########', '.########.', '##########', '.########.', '##########', '.########.', '##########', '.########.', '##########', '.########.'] },
    { name: '액자', m: ['##########', '##########', '##......##', '##.####.##', '##.####.##', '##.####.##', '##.####.##', '##.####.##', '##.####.##', '##......##', '##########', '##########'] },
    { name: '모래시계', m: ['##########', '##########', '.########.', '..######..', '...####...', '....##....', '....##....', '...####...', '..######..', '.########.', '##########', '##########'] },
    { name: '계단', m: ['##........', '####......', '######....', '########..', '##########', '##########', '##########', '##########', '..########', '....######', '......####', '........##'] },
    { name: '네 개의 섬', m: ['####..####', '####..####', '####..####', '####..####', '####..####', '..........', '..........', '####..####', '####..####', '####..####', '####..####', '####..####'] },
    { name: 'X 표시', m: ['##########', '##......##', '###....###', '.###..###.', '..######..', '...####...', '...####...', '..######..', '.###..###.', '###....###', '##......##', '##########'] },
    { name: '만두 얼굴', m: ['.##....##.', '.###..###.', '.########.', '##########', '##.####.##', '##.####.##', '##########', '####..####', '##########', '.########.', '..######..', '...####...'] },
    { name: '지그재그', m: ['######....', '.######...', '..######..', '...######.', '....######', '....######', '...######.', '..######..', '.######...', '######....', '######....', '.######...'] },
    { name: '도넛 두 개', m: ['.########.', '##########', '###....###', '###....###', '##########', '.########.', '.########.', '##########', '###....###', '###....###', '##########', '.########.'] },
  ];
  LAYOUTS.forEach(function (L) {
    var cells = [];
    L.m.forEach(function (row, r) { for (var c = 0; c < COLS; c++) if (row[c] === '#') cells.push(r * COLS + c); });
    if (cells.length % 2) cells.pop();
    L.cells = cells;
  });

  function rng(seed) { var a = seed >>> 0; return function () { a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function shuffle(a, rnd) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(rnd() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  var KC = 'abcdefghijklmnop';
  function kindOf(ch) { return KINDS[KC.indexOf(ch)]; }

  // 테두리를 포함한 칸 배열 (1 = 패 있음)
  function grid(bd) {
    var g = new Uint8Array(PR * PC);
    for (var i = 0; i < N; i++) if (bd[i] !== '.') g[((i / COLS | 0) + 1) * PC + (i % COLS) + 1] = 1;
    return g;
  }
  function rowClear(g, r, c1, c2) { var a = Math.min(c1, c2), b = Math.max(c1, c2); for (var c = a; c <= b; c++) if (g[r * PC + c]) return false; return true; }
  function colClear(g, c, r1, r2) { var a = Math.min(r1, r2), b = Math.max(r1, r2); for (var r = a; r <= b; r++) if (g[r * PC + c]) return false; return true; }
  // 꺾임 2번 이하로 이어지는 가장 짧은 길. 없으면 null. 반환: 테두리 포함 좌표 [[r,c],...]
  function pathG(g, i, j) {
    var ar = (i / COLS | 0) + 1, ac = i % COLS + 1, br = (j / COLS | 0) + 1, bc = j % COLS + 1;
    var ka = ar * PC + ac, kb = br * PC + bc;
    g[ka] = 0; g[kb] = 0;
    var best = null, bl = 1e9, x, y, L;
    for (x = 0; x < PC; x++) { // 가로 → 세로(x열) → 가로
      L = Math.abs(ac - x) + Math.abs(ar - br) + Math.abs(x - bc);
      if (L >= bl) continue;
      if (rowClear(g, ar, ac, x) && colClear(g, x, ar, br) && rowClear(g, br, x, bc)) { bl = L; best = [[ar, ac], [ar, x], [br, x], [br, bc]]; }
    }
    for (y = 0; y < PR; y++) { // 세로 → 가로(y행) → 세로
      L = Math.abs(ar - y) + Math.abs(ac - bc) + Math.abs(y - br);
      if (L >= bl) continue;
      if (colClear(g, ac, ar, y) && rowClear(g, y, ac, bc) && colClear(g, bc, y, br)) { bl = L; best = [[ar, ac], [y, ac], [y, bc], [br, bc]]; }
    }
    g[ka] = 1; g[kb] = 1;
    if (!best) return null;
    var out = [];
    best.forEach(function (p) { var q = out[out.length - 1]; if (!q || q[0] !== p[0] || q[1] !== p[1]) out.push(p); });
    return out;
  }
  function findPath(bd, i, j) {
    if (i === j || i < 0 || j < 0 || i >= N || j >= N) return null;
    if (bd[i] === '.' || bd[i] !== bd[j]) return null;
    return pathG(grid(bd), i, j);
  }
  function byKind(bd) { var m = {}; for (var i = 0; i < N; i++) { var k = bd[i]; if (k !== '.') (m[k] = m[k] || []).push(i); } return m; }
  // 지금 이어지는 쌍 전부 (limit 개까지만)
  function allMoves(bd, limit) {
    var g = grid(bd), m = byKind(bd), out = [];
    for (var k in m) {
      var a = m[k];
      for (var x = 0; x < a.length; x++) for (var y = x + 1; y < a.length; y++) {
        if (pathG(g, a[x], a[y])) { out.push([a[x], a[y]]); if (limit && out.length >= limit) return out; }
      }
    }
    return out;
  }
  function hasMove(bd) { return allMoves(bd, 1).length > 0; }
  function count(bd) { var n = 0; for (var i = 0; i < N; i++) if (bd[i] !== '.') n++; return n; }

  // 새 판 깔기: 종류마다 쌍 수가 고르게, 처음부터 이어지는 쌍이 넉넉하게
  function deal(lay, rnd) {
    var L = LAYOUTS[lay], P = L.cells.length / 2, bd;
    for (var tries = 0; tries < 40; tries++) {
      var order = shuffle(KINDS.map(function (_, i) { return KC[i]; }), rnd), tiles = [];
      for (var p = 0; p < P; p++) { tiles.push(order[p % order.length], order[p % order.length]); }
      shuffle(tiles, rnd);
      var arr = new Array(N).fill('.');
      L.cells.forEach(function (c, i) { arr[c] = tiles[i]; });
      bd = arr.join('');
      if (allMoves(bd, 4).length >= 4) break;
    }
    return bd;
  }
  // 남은 패 섞기 (이어지는 쌍이 하나도 없을 때)
  function reshuffle(bd, rnd) {
    var pos = [], ks = [];
    for (var i = 0; i < N; i++) if (bd[i] !== '.') { pos.push(i); ks.push(bd[i]); }
    var out = bd;
    for (var t = 0; t < 60; t++) {
      shuffle(ks, rnd);
      var arr = new Array(N).fill('.');
      pos.forEach(function (p, x) { arr[p] = ks[x]; });
      out = arr.join('');
      if (hasMove(out)) return out;
    }
    return out;
  }
  function setCh(s, i, ch) { return s.slice(0, i) + ch + s.slice(i + 1); }
  function nextLayout(cur, rnd) { var n; do { n = Math.floor(rnd() * LAYOUTS.length); } while (n === cur && LAYOUTS.length > 1); return n; }
  // one=true: 단판 (판 하나를 다 지우면 끝)
  function newGame(rnd, one) { var lay = Math.floor(rnd() * LAYOUTS.length), g = { bd: deal(lay, rnd), lay: lay, st: 1, sh: 0, sc: {}, lm: { n: 0 } }; if (one) g.one = 1; return g; }
  // 판이 비면 다음 모양, 이어지는 쌍이 없으면 섞기
  function fix(g, rnd) {
    if (!count(g.bd) && g.one) { g.end = 1; return g; }
    if (!count(g.bd)) { g.st = (g.st || 1) + 1; g.lay = nextLayout(g.lay, rnd); g.bd = deal(g.lay, rnd); }
    else if (!hasMove(g.bd)) { g.bd = reshuffle(g.bd, rnd); g.sh = (g.sh || 0) + 1; }
    return g;
  }
  function copy(g) { var n = { bd: g.bd, lay: g.lay || 0, st: g.st || 1, sh: g.sh || 0, sc: Object.assign({}, g.sc || {}), lm: Object.assign({ n: 0 }, g.lm || {}) }; if (g.one) n.one = 1; if (g.end) n.end = 1; return n; }
  // 한 쌍 지우기. 길이 없으면 null
  function applyMove(g, i, j, by, rnd) {
    if (!g || g.end || !findPath(g.bd, i, j)) return null;
    var n = copy(g);
    n.bd = setCh(setCh(n.bd, i, '.'), j, '.');
    n.sc[by] = (n.sc[by] || 0) + 1;
    n.lm = { by: by, i: i, j: j, n: (n.lm.n || 0) + 1, k: g.bd[i] };
    return fix(n, rnd || Math.random);
  }
  // 아이템 '1쌍 없애기': 이어지는 쌍을 먼저, 없으면 같은 그림 아무 쌍
  function removeAnyPair(g, by, rnd) {
    rnd = rnd || Math.random;
    if (!g || g.end || !count(g.bd)) return null;
    var mv = allMoves(g.bd), pair = null;
    if (mv.length) pair = mv[Math.floor(rnd() * mv.length)];
    else { var m = byKind(g.bd); for (var k in m) if (m[k].length >= 2) { pair = [m[k][0], m[k][1]]; break; } }
    if (!pair) return null;
    var n = copy(g);
    n.bd = setCh(setCh(n.bd, pair[0], '.'), pair[1], '.');
    n.sc[by] = (n.sc[by] || 0) + 1;
    n.lm = { by: by, i: pair[0], j: pair[1], n: (n.lm.n || 0) + 1, k: g.bd[pair[0]], item: 1 };
    return fix(n, rnd);
  }

  var E = { ROWS: ROWS, COLS: COLS, N: N, PR: PR, PC: PC, KINDS: KINDS, KC: KC, LAYOUTS: LAYOUTS, rng: rng, shuffle: shuffle, kindOf: kindOf,
    findPath: findPath, allMoves: allMoves, hasMove: hasMove, count: count, deal: deal, reshuffle: reshuffle, newGame: newGame,
    applyMove: applyMove, removeAnyPair: removeAnyPair, fix: fix, copy: copy };
  if (typeof module !== 'undefined' && module.exports) module.exports = E; else root.SC = E;
})(this);
