/* dancer.js — 她的字符串舞者：full/{motion,rig,choreo,dancer}.py 的浏览器/无头两用移植。

   原工程：她是「一格一格的字符」，每个动作都是字符串操作。九个姿势关键帧（poses/*.txt）由 rig.trace()
   从 whale-<表情>.webp 立绘描出来；每帧 choreo.at(t) 选一个姿势和一组 Motion，rig.frame() 靠搬行、搬行里的
   片段、镜像、下沉、挤压来摆她。dancer.draw() 把 ':' 的身体格填上她正在唱的那句歌词并按 flow 速度流动，
   换姿势时逐格乱码翻转（morph），故障段落再叠 scramble。

   poses：原工程的 poses/*.txt 不在仓库里，这里用同一套 tracer + 同一批立绘重跑（trwork/trace_poses.py），
   落在 data/poses/*.txt，再打包进 js/dance_data.js（PV.DANCE.poses）。

   用法：
     PV.dancer.at(t, base, pinned)               -> Step（姿势/翻转/prev/morph/motion/flow/scramble/move）
     PV.dancer.paint(ctx, x, y, w, h, t, opt)    -> 在任意 2D context 上按设计像素画她（离屏 canvas + putImageData）
     PV.dancer.canvas(t, w, h, opt)              -> 离屏 canvas（给 HTML 层贴）
     PV.dancer.on(t)                             -> 这个时刻她的窗格是不是该由她占满
*/
(function () {
  'use strict';
  var PV = window.PV;
  if (!PV) return;
  var D = PV.DANCE;
  if (!D) { try { console.warn('[dancer] js/dance_data.js 没加载'); } catch (e) {} return; }
  var T = PV.tui || {};

  /* ================================================================ 常量（engine.py / rig.py / dancer.py） */
  var FPS = 24, BEAT = 60 / 130, FIRST_BEAT = 0.1587, SONG_LEN = 211.91, HARD_CUT = 207.58;
  var CW = 6, CH = 10;                       /* dancer._cell()：Consolas Bold 9px -> 宽 6、高 10 */
  var CPS = 7.0;                             /* 每字符每秒（flow = 1） */
  var SCRAMBLE = '#%&@$*+=<>/|?!01';
  var KROWS = 42, KCOLS = 48, FIG_ROWS = 40, AXIS_COL = 24, HEAD_TOP = 3, SWING = 3;
  var DRUM0 = FIRST_BEAT + 0.035, DRUM_BEAT = BEAT + 0.00037, MORPH = BEAT / 4;
  var LY = D.lyrics, AU = D.audio;
  var RAMPS = D.ramps, BLUE_HI = D.blueHi;

  /* ---------------------------------------------------------------- 小工具 */
  function clamp01(u) { return u < 0 ? 0 : (u > 1 ? 1 : u); }
  function pyround(x) {                       /* CPython round()：banker's rounding */
    var f = Math.floor(x), d = x - f;
    if (d > 0.5) return f + 1;
    if (d < 0.5) return f;
    return (f % 2 === 0) ? f : f + 1;
  }
  function smooth(x) { x = x < 0 ? 0 : (x > 1 ? 1 : x); return x * x * (3 - 2 * x); }
  function arc(x) { return (x > 0 && x < 1) ? 4 * x * (1 - x) : 0; }
  function win(x, len, fin, fout) {
    if (x <= 0 || x >= len) return 0;
    return Math.min(smooth(x / fin), smooth((len - x) / fout));
  }
  function tick(u, a, len) {
    a = a === undefined ? 0.15 : a; len = len === undefined ? 1 : len;
    if (u <= 0 || u >= len) return 0;
    return u < a ? smooth(u / a) : 0.5 + 0.5 * Math.cos(Math.PI * (u - a) / (len - a));
  }
  function hitFn(x, attack) {
    attack = attack === undefined ? 0.07 : attack;
    if (x < -attack || x > 0.25) return 0;
    if (x < 0) { var s = Math.sin(Math.PI / 2 * (x + attack) / attack); return s * s; }
    return Math.exp(-x / 0.075) * (1 - smooth((x - 0.12) / 0.13));
  }
  function soft(x, lim) {
    var k = 0.75 * lim, a = Math.abs(x);
    if (a <= k) return x;
    return (x < 0 ? -1 : 1) * (k + (lim - k) * Math.tanh((a - k) / (lim - k)));
  }
  function steps(x, fn, trans) {
    var i = Math.floor(x), a = fn(i - 1);
    return a + (fn(i) - a) * smooth((x - i) / trans);
  }
  function bisectRight(arr, x) {              /* bisect.bisect_right */
    var lo = 0, hi = arr.length;
    while (lo < hi) { var mid = (lo + hi) >> 1; if (x < arr[mid]) hi = mid; else lo = mid + 1; }
    return lo;
  }
  function keyframes(t, pts) {                /* engine.keyframes */
    if (t <= pts[0][0]) return pts[0][1];
    for (var i = 0; i + 1 < pts.length; i++) {
      var t0 = pts[i][0], v0 = pts[i][1], t1 = pts[i + 1][0], v1 = pts[i + 1][1];
      if (t <= t1) return v0 + (v1 - v0) * (t - t0) / (t1 - t0);
    }
    return pts[pts.length - 1][1];
  }
  function snap8(t) { return FIRST_BEAT + pyround((t - FIRST_BEAT) / (BEAT / 2)) * BEAT / 2; }
  function rnd(i, salt) { return PV.mt(i * 1000003 + salt).random(); }   /* choreo._rnd */

  function choices(rng, pop, weights) {       /* random.choices 的 CPython 版（bisect + random()*total） */
    var total = 0, cum = [], i;
    for (i = 0; i < weights.length; i++) { total += weights[i]; cum.push(total); }
    var idx = bisectRight(cum, rng.random() * total);
    if (idx > pop.length - 1) idx = pop.length - 1;
    return pop[idx];
  }
  function sample(rng, pop, k) {              /* random.sample 的 CPython 版（两条分支都照抄） */
    var n = pop.length, result = [], i, j;
    if (k > n) throw new Error('sample larger than population');
    var setsize = 21;
    if (k > 5) setsize += Math.pow(4, Math.ceil(Math.log(k * 3) / Math.log(4)));
    if (n <= setsize) {
      var pool = pop.slice();
      for (i = 0; i < k; i++) { j = rng.randrange(n - i); result.push(pool[j]); pool[j] = pool[n - i - 1]; }
    } else {
      var selected = {};
      for (i = 0; i < k; i++) {
        j = rng.randrange(n);
        while (selected[j]) j = rng.randrange(n);
        selected[j] = 1; result.push(pop[j]);
      }
    }
    return result;
  }

  /* ================================================================ rig.py */
  var MIRROR_FROM = '/\u005c()<>[]{}\u0060\u0027bdpq', MIRROR_TO = '\u005c/)(><][}{\u0027\u0060dbqp';
  var MIRROR_MAP = {};
  for (var mi = 0; mi < MIRROR_FROM.length; mi++) MIRROR_MAP[MIRROR_FROM.charAt(mi)] = MIRROR_TO.charAt(mi);
  function mirrorRow(s) {
    var o = '';
    for (var i = s.length - 1; i >= 0; i--) { var c = s.charAt(i); o += (MIRROR_MAP[c] || c); }
    return o;
  }
  var STAND_IN = 'hwHabsmtf';
  var UNSTAND = {};
  for (var ui = 0; ui < STAND_IN.length; ui++) UNSTAND[String(ui)] = STAND_IN.charAt(ui);
  var PADROW = '                                                ';   /* 48 空格 */

  function keyframe(pose) {
    var k = D.poses[pose];
    if (!k) throw new Error('no pose ' + pose);
    function pad(rows) {
      var out = [], r;
      for (r = 0; r < KROWS; r++) out.push(((rows[r] === undefined ? '' : rows[r]) + PADROW).slice(0, KCOLS));
      return out;
    }
    return { art: pad(k.art), shade: pad(k.shade), part: pad(k.part) };
  }

  function buildKey(pose, mirror) {
    var k = keyframe(pose), art = k.art, shade = k.shade, part = k.part, i, r, c;
    if (mirror) {
      var a2 = [], s2 = [], p2 = [];
      for (i = 0; i < KROWS; i++) {
        a2.push(mirrorRow(art[i]));
        s2.push(shade[i].split('').reverse().join(''));
        p2.push(part[i].split('').reverse().join(''));
      }
      art = a2; shade = s2; part = p2;
    }
    function rowsWith(tags) {
      var out = [], rr, cc;
      for (rr = 0; rr < KROWS; rr++) {
        var p = part[rr];
        for (cc = 0; cc < KCOLS; cc++) if (tags.indexOf(p.charAt(cc)) >= 0) { out.push(rr); break; }
      }
      return out;
    }
    var headRows = rowsWith('hw');
    var neck = headRows.length ? Math.max.apply(null, headRows) : 0;
    var top = headRows.length ? Math.min.apply(null, headRows) : 0;
    var hAll = rowsWith('H'), hairRows = [];
    for (i = 0; i < hAll.length; i++) if (hAll[i] > neck) hairRows.push(hAll[i]);
    var hairTip = hairRows.length ? Math.max.apply(null, hairRows) : neck + 1;
    var hemRows = rowsWith('m');
    var hem = hemRows.length ? [Math.min.apply(null, hemRows), Math.max.apply(null, hemRows)] : [KROWS, KROWS];
    var tailRows = rowsWith('t');
    var tail = tailRows.length ? [Math.min.apply(null, tailRows), Math.max.apply(null, tailRows)] : [KROWS, KROWS];
    var flukeLow = Math.floor((tail[0] + tail[1]) / 2);
    var tcols = [], tsum = 0;
    for (i = 0; i < tailRows.length; i++) for (c = 0; c < KCOLS; c++) if (part[tailRows[i]].charAt(c) === 't') tcols.push(c);
    for (i = 0; i < tcols.length; i++) tsum += tcols[i];
    var flukeSide = (tcols.length && (tsum / tcols.length) >= AXIS_COL) ? 1 : -1;

    var moving = { head: {}, hair: {}, hem: {}, tail: {} }, blank = [];
    for (r = 0; r < KROWS; r++) {
      var tags = [], p = part[r];
      for (c = 0; c < KCOLS; c++) {
        var pc = p.charAt(c), g = null;
        if (r <= neck && 'hwH'.indexOf(pc) >= 0) g = 'head';
        else if (r > neck && pc === 'H') g = 'hair';
        else if (pc === 'm') g = 'hem';
        else if (pc === 't') g = 'tail';
        tags.push(g);
      }
      var A = [], S = [], P = [];
      for (c = 0; c < KCOLS; c++) {
        A.push(tags[c] ? ' ' : art[r].charAt(c));
        S.push(tags[c] ? ' ' : shade[r].charAt(c));
        P.push(tags[c] ? ' ' : p.charAt(c));
      }
      /* 长头发压在身上的地方：腾出来的格子露出她身体（见 rig.py 的 STAND_IN） */
      var body = [];
      for (c = 0; c < KCOLS; c++) if (!tags[c] && P[c] !== ' ') body.push(c);
      for (c = 0; c < KCOLS; c++) {
        if (tags[c] === 'hair' && body.length && body[0] < c && c < body[body.length - 1]) {
          var best = body[0], bd = Math.abs(body[0] - c);
          for (var bi = 1; bi < body.length; bi++) { var dd = Math.abs(body[bi] - c); if (dd < bd) { bd = dd; best = body[bi]; } }
          A[c] = ':'; S[c] = shade[r].charAt(best); P[c] = String(STAND_IN.indexOf(p.charAt(best)));
        }
      }
      blank.push([A.join(''), S.join(''), P.join('')]);
      for (var g2 in moving) {
        var cols = [];
        for (c = 0; c < KCOLS; c++) if (tags[c] === g2) cols.push(c);
        if (cols.length) {
          var cells = [];
          for (var li = 0; li < 3; li++) {
            var layer = li === 0 ? art[r] : (li === 1 ? shade[r] : p), str = '';
            for (c = 0; c < KCOLS; c++) str += (tags[c] === g2 ? layer.charAt(c) : ' ');
            cells.push(str);
          }
          moving[g2][r] = [cells, cols[0], cols[cols.length - 1] + 1];
        }
      }
    }
    return { rows: [art, shade, part], neck: neck, top: top, hairTip: hairTip, hem: hem, tail: tail,
             flukeLow: flukeLow, flukeSide: flukeSide, moving: moving, blank: blank };
  }
  var KEYC = {};
  function _key(pose, mirror) {
    var kk = pose + (mirror ? '|1' : '|0');
    if (!KEYC[kk]) KEYC[kk] = buildKey(pose, mirror);
    return KEYC[kk];
  }

  var COVER = { head: ' Hbs', hair: ' 012345678', hem: ' ft', tail: ' ' };
  function paste(row, cells, lo, hi, d, cover) {
    var lo2 = Math.max(0, lo + d), hi2 = Math.min(KCOLS, hi + d);
    if (lo2 >= hi2) return;
    var ma = cells[0], ms = cells[1], mp = cells[2];
    var a = row[0], s = row[1], p = row[2];
    var na = a.slice(lo2, hi2).split(''), ns = s.slice(lo2, hi2).split(''), np2 = p.slice(lo2, hi2).split('');
    for (var i = lo2; i < hi2; i++) {
      if (ma.charAt(i - d) !== ' ' && cover.indexOf(p.charAt(i)) >= 0) {
        var k = i - lo2;
        na[k] = ma.charAt(i - d); ns[k] = ms.charAt(i - d); np2[k] = mp.charAt(i - d);
      }
    }
    row[0] = a.slice(0, lo2) + na.join('') + a.slice(hi2);
    row[1] = s.slice(0, lo2) + ns.join('') + s.slice(hi2);
    row[2] = p.slice(0, lo2) + np2.join('') + p.slice(hi2);
  }

  function local(K, m) {
    var grid = [], i, r, e;
    for (i = 0; i < KROWS; i++) grid.push([K.blank[i][0], K.blank[i][1], K.blank[i][2]]);
    var t0 = K.tail[0], t1 = K.tail[1], rk;
    for (rk in K.moving.tail) {
      r = +rk; e = K.moving.tail[rk];
      var f = (t1 - r) / Math.max(1, t1 - t0);
      var d = pyround(m.tail * SWING * (0.3 + 0.7 * f)), dr = 0;
      if (Math.abs(m.tail) > 0.66 && r <= K.flukeLow) {
        dr = (m.tail > 0 ? 1 : -1) * K.flukeSide;
        if (dr < 0 && r === K.flukeLow) paste(grid[r], e[0], e[1], e[2], d, COVER.tail);
      }
      if (r + dr >= 0 && r + dr < KROWS) paste(grid[r + dr], e[0], e[1], e[2], d, COVER.tail);
    }
    var span = Math.max(1, K.hairTip - K.neck - 2);
    for (rk in K.moving.hair) {
      r = +rk; e = K.moving.hair[rk];
      var f2 = Math.min(1, Math.max(0, (r - K.neck - 2) / span));
      paste(grid[r], e[0], e[1], e[2], pyround(m.hair * SWING * Math.pow(f2, 1.5)), COVER.hair);
    }
    var h0 = K.hem[0], h1 = K.hem[1];
    for (rk in K.moving.hem) {
      r = +rk; e = K.moving.hem[rk];
      paste(grid[r], e[0], e[1], e[2], pyround(m.hem * SWING * (r - h0 + 0.5) / (h1 - h0 + 0.5)), COVER.hem);
    }
    var lean = HEAD_TOP * Math.tan(Math.PI / 180 * m.head) / Math.tan(Math.PI / 180 * 8) / Math.max(1, K.neck - K.top + 0.5);
    for (rk in K.moving.head) {
      r = +rk; e = K.moving.head[rk];
      var d2 = Math.max(-HEAD_TOP - 1, Math.min(HEAD_TOP + 1, pyround(lean * (K.neck - r + 0.5))));
      paste(grid[r], e[0], e[1], e[2], d2, COVER.head);
    }
    var A = [], S = [], P = [];
    for (i = 0; i < KROWS; i++) {
      A.push(grid[i][0]); S.push(grid[i][1]);
      var pp = '', src = grid[i][2];
      for (var c = 0; c < src.length; c++) { var ch = src.charAt(c); pp += (UNSTAND[ch] || ch); }
      P.push(pp);
    }
    return [A, S, P];
  }

  var MOTION0 = { sway: 0, bend: 0, squash: 0, hop: 0, shift: 0, head: 0, hair: 0, hem: 0, tail: 0, turn: 0 };
  function keepRows(rows, keep) {
    var o = [];
    for (var r = 0; r < rows.length; r++) { var s = '', i; for (i = 0; i < keep.length; i++) s += rows[r].charAt(keep[i]); o.push(s); }
    return o;
  }
  function dropRows(rows, gone) {
    var o = [];
    for (var r = 0; r < rows.length; r++) if (!gone[r]) o.push(rows[r]);
    return o;
  }
  function dupCols(rows, c, a0, ins) {
    var o = [];
    for (var r = 0; r < rows.length; r++) { var s = rows[r]; o.push(s.slice(0, c) + s.slice(c - a0, c - a0 + ins) + s.slice(c)); }
    return o;
  }
  function blankRowStr(n) { var s = ''; while (s.length < n) s += ' '; return s; }

  function rigFrame(pose, flip, m, cols, rows) {
    m = m || MOTION0;
    var turn = Math.min(1, Math.max(0, m.turn));
    var K = _key(pose, flip !== (turn > 0.5));
    var art, shade, part, i, r;
    if (m.head || m.hair || m.hem || m.tail) { var L = local(K, m); art = L[0]; shade = L[1]; part = L[2]; }
    else { art = K.rows[0]; shade = K.rows[1]; part = K.rows[2]; }
    var axis = AXIS_COL, ground = KROWS - 1;

    var kk = Math.abs(Math.cos(Math.PI * turn));       /* turn：绕中线均匀丢列，过 0.5 镜像 */
    if (kk < 0.999) {
      var n = Math.max(1, pyround(KCOLS * kk)), keep = [];
      for (var j = 0; j < n; j++) keep.push(Math.min(KCOLS - 1, Math.max(0, Math.trunc(AXIS_COL + (j + 0.5 - n / 2) / Math.max(kk, 1e-3)))));
      art = keepRows(art, keep); shade = keepRows(shade, keep); part = keepRows(part, keep);
      axis = n / 2;
    }
    if (m.squash > 0) {                                 /* squash：脖子到脚之间均匀丢行 + 中间插列变宽 */
      var drop = pyround(m.squash * 0.08 * FIG_ROWS);
      var lo = K.neck + 1, hi = ground - 1, gone = {}, nGone = 0, gk;
      if (hi > lo) for (i = 0; i < drop; i++) gone[pyround(lo + (i + 1) * (hi - lo) / (drop + 1))] = 1;
      for (gk in gone) nGone++;
      if (nGone) { art = dropRows(art, gone); shade = dropRows(shade, gone); part = dropRows(part, gone); ground -= nGone; }
      var width = art.length ? art[0].length : KCOLS;
      var ins = pyround(m.squash * 0.05 * width);
      if (ins) {
        var c0 = Math.trunc(axis), a0 = Math.floor(ins / 2);
        art = dupCols(art, c0, a0, ins); shade = dupCols(shade, c0, a0, ins); part = dupCols(part, c0, a0, ins);
        axis += ins / 2;
      }
    }
    var hop = pyround(m.hop * FIG_ROWS);
    var x0 = Math.floor(cols / 2) - pyround(axis) + pyround(m.shift * FIG_ROWS * 2);
    var ts = 2.0 * Math.tan(Math.PI / 180 * m.sway), tb = 2.0 * Math.tan(Math.PI / 180 * m.bend) / FIG_ROWS;
    var out = [[], [], []];
    for (i = 0; i < rows; i++) { out[0].push(blankRowStr(cols)); out[1].push(blankRowStr(cols)); out[2].push(blankRowStr(cols)); }
    for (r = 0; r < art.length; r++) {
      var y = rows - 1 - (ground - r) - hop;
      if (y < 0 || y >= rows) continue;
      var h = ground - r;
      var x = x0 + pyround(ts * h + tb * h * h);
      for (var li = 0; li < 3; li++) {
        var src = li === 0 ? art[r] : (li === 1 ? shade[r] : part[r]);
        var s = (x >= 0) ? (blankRowStr(x) + src) : src.slice(-x);
        s = s.slice(0, cols);
        while (s.length < cols) s += ' ';
        out[li][y] = s;
      }
    }
    return { art: out[0], shade: out[1], part: out[2] };
  }

  /* ================================================================ choreo.py —— 她的舞 */
  function bpos(t) { return (t - DRUM0) / DRUM_BEAT; }
  function btime(b) { return DRUM0 + b * DRUM_BEAT; }
  function lyricStart(prefix, after) {
    after = after || 0;
    var p = prefix.toLowerCase();
    for (var i = 0; i < LY.length; i++) {
      var a = LY[i][0], s = LY[i][2];
      if (a >= after - 1e-6 && s.toLowerCase().indexOf(p) === 0) return a;
    }
    throw new Error('lyric not found: ' + prefix);
  }
  function _lb(prefix, after) { return pyround(bpos(lyricStart(prefix, after || 0))); }

  var B_SIM = _lb("And let's begin the sim");
  var B_DROP = 32;
  var B_V1 = _lb("If I'm a set");
  var B_DIZZY = _lb('So dizzy');
  var B_TRAVEL = _lb('Oh, we can travel');
  var B_DEEPLY = _lb('So deeply');
  var B_C1 = _lb('If I can', 58);
  var B_HAPPY = _lb('If I can make');
  var B_RUN = _lb('I will run', 67);
  var B_V2 = _lb("If I'm an eggplant");
  var B_PURR = _lb('Then I will purr');
  var B_PROOF = _lb("Then you're the proof");
  var B_FM = _lb('To F, to M');
  var B_SM = _lb('To S, to M');
  var B_TRANCE = _lb('So we can enter');
  var B_C2 = _lb('If I can', 102);
  var B_LEFT = _lb('Though you have left');
  var STUTTERS = [];
  (function () {
    for (var i = 0; i < LY.length; i++) {
      var a = LY[i][0], s = LY[i][2];
      if (a >= 110 && a < 116 && s.toLowerCase().indexOf('have left') >= 0) STUTTERS.push(pyround(bpos(a)));
    }
  })();
  var B_HACK = _lb('If I can', 117);
  var B_ILLEGAL = _lb('Illegal arguments');
  var B_RED = _lb('If I can', 162);
  var B_BACK = _lb('If I can have');
  var B_RUN2 = B_RUN + (B_RED - B_C1);
  var B_LOVE = _lb("I've studied", 176);
  var B_PROPERLY = _lb('How to properly');
  var B_IAM = _lb('I am trapped');
  var B_FALL = pyround(bpos(snap8(193.46)));
  var B_LAST = _lb('Execution', 205);

  var EXEC_CUTS = [];
  (function () {
    for (var i = 0; i < LY.length; i++) {
      var a = LY[i][0], s = LY[i][2];
      if (a >= 147 && a < 158.5 && s.toLowerCase().indexOf('execution') === 0) EXEC_CUTS.push(snap8(a));
    }
  })();
  var T_COUNT = snap8(lyricStart('Ein', 158));
  EXEC_CUTS.push(snap8(lyricStart('Execution', 161)));
  var EXEC_WIN = [];
  for (var _ec = 0; _ec < EXEC_CUTS.length; _ec++) EXEC_WIN.push([EXEC_CUTS[_ec], 'hit', _ec]);
  EXEC_WIN.push([T_COUNT, 'count', 0]);
  EXEC_WIN.sort(function (x, y) {
    if (x[0] !== y[0]) return x[0] - y[0];
    if (x[1] !== y[1]) return x[1] < y[1] ? -1 : 1;
    return x[2] - y[2];
  });
  var _EXEC_STARTS = [];
  for (var _es = 0; _es < EXEC_WIN.length; _es++) _EXEC_STARTS.push(EXEC_WIN[_es][0]);
  var B_EXEC = Math.floor(bpos(EXEC_CUTS[0]));

  var HAPPY = ['starry', 'cheerful', 'skirt', 'frightened'];
  var RED = ['angry', 'frightened', 'starry', 'serious', 'exasperated'];
  var CALM = ['cheerful', 'starry', 'shy', 'confused', 'serious'];
  var GLITCH = ['angry', 'frightened', 'serious', 'starry', 'exasperated', 'confused'];
  var STUTTER = ['angry', 'serious', 'exasperated', 'frightened'];
  var COUNT = ['serious', 'cheerful', 'starry', 'frightened', 'exasperated', 'angry'];
  var PATTERNS = [[2, 2], [1, 1, 2], [2, 1, 1], [1, 2, 1], [1, 1, 1, 1]];
  var PATTERN_W = [3, 2, 2, 2, 1];

  /* Style(idle groove bob tilt bounce bpat hop hpat kick step tail stiff jerk float) */
  var S_DEF = [0, 0, 0, 0, 0, [1, 0, 0, 0], 0, [1, 1, 1, 1], 0, 0, 0, 0, 0, 0];
  function Style(o) {
    var s = S_DEF.slice();
    for (var k in o) s[STY.indexOf(k)] = o[k];
    return s;
  }
  var STY = ['idle', 'groove', 'bob', 'tilt', 'bounce', 'bpat', 'hop', 'hpat', 'kick', 'step', 'tail', 'stiff', 'jerk', 'float'];
  var SECTIONS = [
    { name: 'boot', start: 0.0, fade: [0, 0], poses: 'base', move: 'breathe',
      style: Style({ idle: 1.0, kick: 0.1, tail: 0.12, float: 0.25 }) },
    { name: 'pretrain', start: btime(B_DROP), fade: [0.5, 0.5], poses: 'phrase', move: 'groove',
      style: Style({ idle: 0.3, groove: 3.0, bob: 2.0, bounce: 0.006, bpat: [1, 0.5, 0.8, 0.5], kick: 0.3, tail: 0.35 }) },
    { name: 'verse1', start: btime(B_V1), fade: [1, 1], poses: 'base', move: 'act',
      style: Style({ idle: 0.8, groove: 1.0, tilt: 2.5, bounce: 0.01, kick: 0.25, tail: 0.25 }) },
    { name: 'rlhf', start: btime(B_C1), fade: [0.5, 1], poses: 'dance', move: 'dance',
      style: Style({ groove: 4.5, bob: 2.5, hop: 0.035, hpat: [1, 0.55, 0.85, 0.55], kick: 0.5, step: 0.03, tail: 0.5 }) },
    { name: 'deploy', start: btime(B_V2), fade: [0.5, 1.5], poses: 'base', move: 'act',
      style: Style({ idle: 0.6, groove: 1.8, tilt: 3.0, hop: 0.012, hpat: [1, 0.7, 1, 0.7], kick: 0.35, tail: 0.35 }) },
    { name: 'chorus2', start: btime(B_C2), fade: [0.5, 1], poses: 'dance', move: 'dance',
      style: Style({ groove: 4.0, bob: 2.2, hop: 0.03, hpat: [1, 0.5, 0.8, 0.5], kick: 0.45, step: 0.025, tail: 0.45 }) },
    { name: 'user_left', start: btime(B_LEFT), fade: [0.5, 1], poses: 'left', move: 'run_down',
      style: Style({ idle: 0.4, groove: 2.5, bob: 1.2, kick: 0.3, tail: 0.3 }) },
    { name: 'reward_hack', start: btime(B_HACK), fade: [0.5, 0.5], poses: 'hack', move: 'stiff',
      style: Style({ stiff: 1.0, kick: 0.3, tail: 0.15 }) },
    { name: 'execution', start: EXEC_CUTS[0], fade: [0.5, 0.25], poses: 'exec', move: 'glitch',
      style: Style({ jerk: 1.0, hop: 0.03, kick: 0.6, tail: 0.4 }) },
    { name: 'red_chorus', start: btime(B_RED), fade: [0.5, 0.5], poses: 'red', move: 'red_dance',
      style: Style({ groove: 3.5, bob: 2.0, jerk: 0.55, hop: 0.03, hpat: [1, 0.7, 1, 0.7], kick: 0.55, step: 0.025, tail: 0.5 }) },
    { name: 'eval_love', start: btime(B_LOVE), fade: [0.25, 1], poses: 'love', move: 'warm',
      style: Style({ idle: 0.6, groove: 2.2, tilt: 1.5, bounce: 0.004, bpat: [1, 0, 0.5, 0], kick: 0.15, tail: 0.3 }) },
    { name: 'whale_fall', start: btime(B_FALL), fade: [1, 2], poses: 'shy', move: 'sink', style: Style({ float: 1.0 }) }
  ];
  var _STARTS = [];
  for (var _si = 0; _si < SECTIONS.length; _si++) _STARTS.push(SECTIONS[_si].start);

  /* MOVES: (first drum beat, beats, move, pose override, flip override, params) */
  var MOVES = [
    [B_SIM, 3, 'bounce', null, null, {}],
    [B_DROP - 2, 2, 'crouch', null, null, {}],
    [B_DROP, 1, 'launch', null, null, { hop: 0.03 }],
    [B_DIZZY, 4, 'wobble', null, null, {}],
    [B_TRAVEL, 9, 'travel', null, null, {}],
    [B_DEEPLY, 4, 'deep_bend', null, null, {}],
    [B_C1, 1, 'crouch', null, null, {}],
    [B_HAPPY, 1, 'turn', 'starry', null, {}],
    [B_HAPPY + 2, 2, 'starry_hit', 'starry', false, {}],
    [B_RUN + 2, 2, 'exec_hit', 'base', false, { freeze: 1 }],
    [B_V2 - 1, 1, 'turn', 'base', null, {}],
    [B_PURR, 4, 'curtsy', 'skirt', null, {}],
    [B_PROOF, 4, 'point', 'serious', null, {}],
    [B_FM + 1, 2, 'switch', null, true, {}],
    [B_FM + 3, 1, 'switch', null, false, {}],
    [B_SM + 1, 2, 'switch', null, true, {}],
    [B_SM + 3, 1, 'switch', null, false, {}],
    [B_TRANCE, B_C2 - B_TRANCE, 'trance', null, null, {}],
    [B_C2, 1, 'crouch', null, null, {}],
    [B_LEFT - 1, 1, 'turn', 'base', null, {}],
    [B_LEFT, B_HACK - B_LEFT + 0.8, 'run_down', null, null, {}]
  ];
  for (var _st = 0; _st < STUTTERS.length; _st++) {
    MOVES.push([STUTTERS[_st], 1.5, 'flinch', null, null, { a: 1 - 0.14 * _st, dir: (_st % 2 === 0) ? 1 : -1 }]);
  }
  MOVES.push([B_ILLEGAL, 2, 'snap', null, null, {}]);
  MOVES.push([B_BACK - 1, 1, 'turn', 'shy', null, {}]);
  MOVES.push([B_BACK, 4, 'restore', 'shy', false, {}]);
  MOVES.push([B_RUN2 + 2, 2, 'exec_hit', 'base', false, { freeze: 1 }]);
  MOVES.push([B_RUN2 + 4, B_LOVE + 1 - B_RUN2 - 4, 'collapse', null, null, {}]);
  MOVES.push([B_RUN2 + 8, B_LOVE - B_RUN2 - 8, 'hold', 'base', false, {}]);
  MOVES.push([B_PROPERLY + 1, 4, 'curtsy', 'skirt', null, { down: 2.0 }]);
  MOVES.push([B_IAM, B_FALL - B_IAM, 'hold', 'shy', false, {}]);
  MOVES.push([B_FALL, 64, 'sink', null, null, {}]);
  MOVES.push([B_LAST, 2, 'flicker', null, null, {}]);

  var _POSE_MOVES = [];
  for (var _pm = 0; _pm < MOVES.length; _pm++) {
    var mv = MOVES[_pm];
    if (mv[2] === 'turn' || mv[3] || mv[4] !== null) _POSE_MOVES.push(mv);
  }
  var _FREEZES = [];
  for (var _fz = 0; _fz < MOVES.length; _fz++) if (MOVES[_fz][5].freeze) _FREEZES.push([MOVES[_fz][0], MOVES[_fz][5].freeze]);
  var TRAVEL = [0.02, 0.04, 0.04, 0.025, 0.045, 0.045, 0.0, -0.04, 0.0];
  var FLOW = D.flowPts;

  /* ---------------------------------------------------------------- 身体通道 */
  var SW = 0, BE = 1, SQ = 2, HO = 3, SH = 4, HE = 5, HA = 6, HM = 7, TA = 8, TU = 9;
  function mixStyle(a, b, w) {
    var o = [];
    for (var i = 0; i < a.length; i++) {
      var x = a[i], y = b[i];
      if (Array.isArray(x)) { var t = []; for (var j = 0; j < x.length; j++) t.push(x[j] + (y[j] - x[j]) * w); o.push(t); }
      else o.push(x + (y - x) * w);
    }
    return o;
  }
  function _sec(t) { return Math.max(0, bisectRight(_STARTS, t) - 1); }
  function _style(t) {
    var i = _sec(t), js = [i + 1, i];
    for (var q = 0; q < 2; q++) {
      var j = js[q];
      if (j > 0 && j < SECTIONS.length) {
        var s = SECTIONS[j];
        var a = s.start - s.fade[0] * DRUM_BEAT, c = s.start + s.fade[1] * DRUM_BEAT;
        if (a < t && t < c) return mixStyle(SECTIONS[j - 1].style, s.style, smooth((t - a) / (c - a)));
      }
    }
    return SECTIONS[i].style;
  }
  function _leanStiff(bar) { return [-3.5, -2.0, 0.0, 2.0, 3.5][Math.trunc(rnd(bar, 11) * 5)]; }
  function _bendStiff(bar) { return [-2.0, 0.0, 2.0][Math.trunc(rnd(bar, 12) * 3)]; }
  function _headStiff(n) {
    var hold = [-1.5, 0.0, 1.5][Math.trunc(rnd(Math.floor(n / 4), 13) * 3)];
    return rnd(n, 14) < 0.55 ? hold : hold + (rnd(n, 15) < 0.5 ? 3.5 : -3.5);
  }
  function _leanJerk(i) { return (i % 2 ? 1 : -1) * (1 + 3 * rnd(i, 21)); }
  function _headJerk(i) { return (i % 2 ? -1 : 1) * (1.5 + 3.5 * rnd(i, 22)); }
  function _bendJerk(i) { return 4 * rnd(i, 23) - 2; }
  function _shiftJerk(i) { return (i % 2 ? 1 : -1) * 0.009 * (0.5 + rnd(i, 24)); }
  var _BURSTC = {};
  function _burst(n) {
    if (n in _BURSTC) return _BURSTC[n];
    var v;
    if (!(B_HACK <= n && n < B_EXEC) || n === B_ILLEGAL || n === B_ILLEGAL + 1) v = false;
    else {
      var prog = (n - B_HACK) / (B_EXEC - B_HACK), j = n % 4, p;
      if (j === 3) p = 0.25 + 0.65 * prog;
      else if (j === 1) p = Math.max(0, prog - 0.45) * 1.6;
      else p = 0;
      if (n >= B_EXEC - 4) p = (j % 2) ? 1.0 : 0.4;
      v = rnd(n, 31) < p;
    }
    _BURSTC[n] = v; return v;
  }
  function _stiff(b, g, m) {
    var n = Math.floor(b);
    m[SW] += g * steps(b / 4, _leanStiff, 0.075);
    m[BE] += g * steps(b / 4, _bendStiff, 0.075);
    m[HE] += g * steps(b, _headStiff, 0.25);
    if (_burst(n)) {
      var s = Math.sin(4 * Math.PI * (b - n));
      var tw = (s < 0 ? -1 : 1) * Math.pow(Math.abs(s), 0.7);
      m[SW] += g * 2.0 * tw; m[BE] += g * 1.5 * tw;
    }
  }
  function _jerk(b, g, m) {
    var x = 2 * b;
    m[SW] += g * steps(x, _leanJerk, 0.6);
    m[HE] += g * steps(x, _headJerk, 0.55);
    m[BE] += g * steps(x, _bendJerk, 0.6);
    m[SH] += g * steps(x, _shiftJerk, 0.6);
  }

  /* ---------------------------------------------------------------- 音频（choreo._audio 的三个表） */
  var HITS = AU.hits, LB = AU.lb, LS = AU.ls, FLUXA = AU.flux, ARATE = AU.rate;
  function _kick(t, b) {
    var m0 = Math.floor(2 * b), s = 0, arr = [m0 - 1, m0, m0 + 1];
    for (var i = 0; i < 3; i++) {
      var m = arr[i];
      if (m >= 0 && m < HITS.length && HITS[m][0] > 0) s += HITS[m][0] * hitFn(t - HITS[m][1]);
    }
    return s;
  }
  function _kgate(n) { return (2 * n >= 0 && 2 * n < HITS.length) ? HITS[2 * n][0] : 0; }
  function _loudn(n) { return Math.min(1.2, LB[Math.max(0, Math.min(LB.length - 1, n))] / 0.55); }
  function _gate(b) {
    var x = b - 0.5, i = Math.floor(x);
    var a = LS[Math.max(0, Math.min(LS.length - 1, i))], c = LS[Math.max(0, Math.min(LS.length - 1, i + 1))];
    return smooth((a + (c - a) * (x - i) - 0.12) / 0.22);
  }
  function fluxAt(t) { return FLUXA[Math.max(0, Math.min(FLUXA.length - 1, Math.trunc(t * ARATE)))]; }

  function _rhythm(t, b, st, k, m) {
    var n = Math.floor(b), u = b - n;
    if (st[1]) {
      var g = st[1] * k;
      m[SW] += g * Math.cos(Math.PI * b / 2);
      m[BE] += 0.35 * g * Math.cos(Math.PI * (b - 0.3) / 2);
      m[HE] += 0.3 * g * Math.cos(Math.PI * (b - 0.2) / 2);
    }
    if (st[2]) m[HE] += st[2] * k * Math.cos(Math.PI * b);
    if (st[3]) m[HE] += st[3] * k * ((Math.floor(n / 2) % 2 === 0) ? 1 : -1) * tick(u);
    if (st[4] && st[5][n % 4]) m[HO] += st[4] * k * st[5][n % 4] * _loudn(n) * arc(u / 0.55);
    if (st[6] && st[7][n % 4]) m[HO] += st[6] * k * st[7][n % 4] * _loudn(n) * _kgate(n + 1) * arc((u - 0.12) / 0.85);
    if (st[8]) m[SQ] += st[8] * k * _kick(t, b);
    if (st[9]) {
      var bar = Math.floor(b / 4), sg = (bar % 2 === 0) ? 1 : -1;
      m[SH] += st[9] * k * sg * (2 * smooth((b - 4 * bar) / 0.6) - 1);
    }
    if (st[10]) m[TA] += st[10] * k * Math.sin(Math.PI * (b - 0.125));
    if (st[11]) _stiff(b, st[11] * k, m);
    if (st[12]) _jerk(b, st[12] * k, m);
  }
  function _calm(b, st, m) {
    if (st[0]) {
      var g = st[0];
      m[SW] += g * 1.0 * Math.sin(2 * Math.PI * b / 16);
      m[HE] += g * 1.2 * Math.sin(2 * Math.PI * b / 8 + 1.0);
      m[BE] += g * 0.4 * Math.sin(2 * Math.PI * b / 16 - 0.6);
      m[SQ] += g * 0.035 * (0.5 - 0.5 * Math.cos(2 * Math.PI * b / 8));
      m[HA] += g * 0.08 * Math.sin(2 * Math.PI * b / 8 + 0.3);
    }
    if (st[13]) {
      var f = st[13];
      m[SW] += f * 1.5 * Math.sin(2 * Math.PI * b / 16);
      m[HE] += f * 2.0 * Math.sin(2 * Math.PI * b / 16 + 1.2);
      m[BE] += f * 1.0 * Math.sin(2 * Math.PI * b / 16 - 0.8);
      m[HA] += f * 0.45 * Math.sin(2 * Math.PI * b / 8 + 0.4);
      m[HM] += f * 0.3 * Math.sin(2 * Math.PI * b / 8 + 1.6);
      m[TA] += f * 0.55 * Math.sin(2 * Math.PI * b / 8 - 0.9);
    }
  }

  /* ---------------------------------------------------------------- moves */
  var MOVE_FN = {
    bounce: function (x, L, p, m, b) {
      var k = Math.floor(x);
      if (k >= 0 && k < L) m[HO] += (0.008 + 0.003 * k) * arc((x - k - 0.05) / 0.8);
      var js = [k, k + 1];
      for (var i = 0; i < 2; i++) { var j = js[i]; if (j >= 0 && j < L) m[SQ] += 0.1 * hitFn((x - j) * DRUM_BEAT); }
      return 0;
    },
    crouch: function (x, L, p, m) {
      if (x < 0) return 0;
      var e = (x < L - 0.1) ? smooth(x / (L - 0.25)) : 1 - smooth((x - L + 0.1) / 0.22);
      m[SQ] += 0.36 * e; m[HE] -= 2.0 * e; return 0.6 * e;
    },
    launch: function (x, L, p, m) { m[HO] += p.hop * arc((x - 0.05) / 0.9); return 0; },
    wobble: function (x, L, p, m) {
      var e = win(x, L, 0.5, 0.5), ph = Math.PI * x;
      m[SW] += 4.5 * Math.sin(ph) * e;
      m[BE] += 3.5 * Math.cos(ph) * e;
      m[HE] -= 3.5 * Math.sin(ph + 0.8) * e;
      return 0.7 * e;
    },
    travel: function (x, L, p, m) {
      if (x < 0) return 0;
      var k = Math.floor(x);
      var a = (k > 0 && k <= TRAVEL.length) ? TRAVEL[k - 1] : 0;
      var c = (k < TRAVEL.length) ? TRAVEL[k] : 0;
      var f = x - k;
      m[SH] += a + (c - a) * smooth(f / 0.45);
      if (c !== a) { m[HO] += 0.008 * arc(f / 0.45); m[SW] += 30 * (c - a) * Math.sin(Math.PI * Math.min(1, f / 0.6)); }
      return 0.4 * win(x, L, 0.3, 0.5);
    },
    deep_bend: function (x, L, p, m) {
      if (x < 0) return 0;
      var e = (x < L - 0.8) ? smooth(x / 2.5) : 1 - smooth((x - L + 0.8) / 0.8);
      m[BE] += 7.0 * e; m[SW] -= 1.5 * e; m[SQ] += 0.28 * e; m[HE] += 3.0 * e;
      return 0.8 * e;
    },
    starry_hit: function (x, L, p, m) {
      m[SQ] += 0.4 * hitFn(x * DRUM_BEAT);
      m[HO] += 0.03 * arc((x - 0.1) / 0.85);
      var e = win(x, L, 0.15, 0.8);
      m[HE] += 5.0 * e; m[SW] += 2.0 * e;
      return 0.6 * e;
    },
    exec_hit: function (x, L, p, m) {
      m[SQ] += 0.4 * hitFn(x * DRUM_BEAT, 0.14);
      var e = win(x, L, 0.1, 0.5);
      m[HE] += 3.0 * e;
      return 0.3 * e;
    },
    curtsy: function (x, L, p, m) {
      if (x < 0) return 0;
      var down = p.down === undefined ? 1.5 : p.down;
      var e = (x < L - 1) ? smooth(x / down) : 1 - smooth(x - L + 1);
      m[SQ] += 0.42 * e; m[BE] -= 2.5 * e; m[HE] += 5.0 * e; m[SW] -= 1.0 * e;
      return 0.85 * e;
    },
    point: function (x, L, p, m) {
      var e = win(x, L, 0.3, 0.6);
      m[SW] += 2.5 * e;
      m[HE] += 3.0 * e + 1.2 * e * tick(x % 1);
      m[SQ] += 0.25 * hitFn(x * DRUM_BEAT);
      return 0.5 * e;
    },
    switch: function (x, L, p, m) { m[HO] += 0.01 * arc(x / 0.5); return 0; },
    trance: function (x, L, p, m) {
      var e = win(x, L, 1.5, 0.75), ph = 2 * Math.PI * x / 8;
      m[SW] += 5.5 * Math.sin(ph) * e;
      m[BE] -= 2.5 * Math.sin(ph - 0.5) * e;
      m[HE] -= 4.0 * Math.sin(ph - 0.8) * e;
      m[SH] += 0.012 * Math.sin(ph / 2) * e;
      m[HA] += 0.3 * Math.sin(2 * Math.PI * x / 4 - 1) * e;
      return 0.9 * e;
    },
    run_down: function (x, L, p, m) {
      if (x < 0) return 0;
      var r = 1 - smooth((x - L + 0.8) / 0.8);
      var mute = keyframes(x, [[0, 0.0], [6, 0.5], [11, 0.88], [14, 1.0]]) * r;
      var s = keyframes(x, [[0, 0.0], [8, 0.5], [14, 1.0]]) * r;
      m[SW] -= 1.2 * s; m[HE] -= 3.0 * s; m[BE] -= 1.2 * s; m[SQ] += 0.1 * s;
      return mute;
    },
    flinch: function (x, L, p, m) {
      var a = p.a * p.dir, e = tick(x, 0.15, L);
      m[HE] += 4.0 * a * e; m[SW] += 1.5 * a * e; m[SQ] += 0.22 * p.a * hitFn(x * DRUM_BEAT);
      return 0;
    },
    snap: function (x, L, p, m) {
      var e = (x >= 0 && x < L) ? Math.min(smooth(x / 0.22), 1 - smooth((x - L + 0.7) / 0.7)) : 0;
      m[HE] += 7.0 * e; m[SW] += 3.0 * e; m[SQ] += 0.3 * hitFn(x * DRUM_BEAT);
      return 0.5 * e;
    },
    restore: function (x, L, p, m) {
      var e = win(x, L, 0.5, 0.5);
      m[SW] += 2.0 * Math.sin(2 * Math.PI * x / 4) * e;
      m[HE] += 2.5 * Math.sin(2 * Math.PI * x / 4 + 1) * e;
      return 0.75 * e;
    },
    collapse: function (x, L, p, m, b) {
      if (x < 0) return 0;
      var s1 = smooth(x / 4) * (1 - smooth((x - 4) / 1.5));
      if (s1 > 0) _jerk(b, 0.45 * s1, m);
      var p2 = smooth((x - 4) / 3) * (1 - smooth((x - L + 1.2) / 1.2));
      m[SQ] += 0.35 * p2; m[HE] -= 5.0 * p2; m[SW] -= 2.0 * p2; m[BE] -= 1.5 * p2;
      return p2;
    },
    sink: function (x, L, p, m) { m[HO] -= 0.05 * smooth(x * DRUM_BEAT / (HARD_CUT - btime(B_FALL))); return 0; },
    flicker: function (x, L, p, m) { m[HE] += 1.5 * tick(x, 0.1, L); return 0; },
    turn: function (x, L, p, m) {
      if (x >= 0 && x < 1) {
        var tu = smooth(x);
        m[TU] += tu;
        m[HA] += 0.5 * Math.sin(Math.PI * tu);
        m[HM] += 0.7 * Math.sin(Math.PI * tu);
        m[HO] += 0.012 * arc(x);
      }
      return 0;
    },
    hold: function () { return 0; }
  };
  function _moves(b, m) {
    var mute = 0;
    for (var i = 0; i < MOVES.length; i++) {
      var mv = MOVES[i], x = b - mv[0], kind = mv[2];
      if (x >= -0.3 && x < mv[1] + 0.3 && MOVE_FN[kind]) {
        var v = MOVE_FN[kind](x, mv[1], mv[5], m, b);
        if (v > mute) mute = v;
      }
    }
    return mute;
  }
  function _live(t) {
    var b = bpos(t), m = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    var mute = _moves(b, m);
    var st = _style(t);
    var k = (1.0 - mute) * _gate(b);
    if (k > 1e-4) _rhythm(t, b, st, k, m);
    _calm(b, st, m);
    return m;
  }
  function _body(t, pinned) {
    var m = _live(t), b = bpos(t), i;
    for (i = 0; i < _FREEZES.length; i++) {
      var b0 = _FREEZES[i][0], hold = _FREEZES[i][1], x = b - b0;
      if (x >= 0 && x < hold + 0.25) {
        var w = (x <= hold) ? 1.0 : 1 - smooth((x - hold) / 0.25);
        var h = _live(btime(b0)), o = [];
        for (var j = 0; j < 10; j++) o.push(m[j] + (h[j] - m[j]) * w);
        m = o; break;
      }
    }
    if (pinned) {
      m[SW] = soft(0.35 * m[SW], 2.0); m[BE] = soft(0.3 * m[BE], 1.5);
      m[HE] = soft(0.4 * m[HE], 2.5); m[SQ] = soft(0.25 * m[SQ], 0.1);
      m[HO] = m[SH] = m[TU] = 0.0;
      m[HA] *= 0.5; m[HM] *= 0.5; m[TA] *= 0.5;
    }
    return m;
  }

  /* ---------------------------------------------------------------- follow-through：头发/裙摆/尾巴 */
  var RATE = 48, TAPS = 28;
  var SPRINGS = [[BEAT / 8, 0.4, 1.2], [BEAT / 10, 0.3, 1.3], [BEAT / 6, 0.35, 1.0]];
  function _taper(tau) { return 1 - smooth((tau - 0.4) / 0.18); }
  function _kernel(lag, zeta, gain) {
    var wd = Math.atan(Math.sqrt(1 - zeta * zeta) / zeta) / lag;
    var a = zeta * wd / Math.sqrt(1 - zeta * zeta), norm = 0;
    for (var j = 0; j < TAPS; j++) norm += Math.exp(-a * j / RATE) * Math.sin(wd * j / RATE) * _taper(j / RATE);
    return [a, wd, gain / norm];
  }
  var KERNELS = [_kernel(SPRINGS[0][0], SPRINGS[0][1], SPRINGS[0][2]),
                 _kernel(SPRINGS[1][0], SPRINGS[1][1], SPRINGS[1][2]),
                 _kernel(SPRINGS[2][0], SPRINGS[2][1], SPRINGS[2][2])];
  var _DRIVEC = {};
  function _drive(k, pinned) {
    var key = k + (pinned ? 'p' : 'n');
    var c = _DRIVEC[key];
    if (c) return c;
    var m = _body(Math.min(Math.max(k / RATE, 0.0), HARD_CUT), pinned);
    var sw = m[SW] / 8, be = m[BE] / 8, sh = m[SH] / 0.06, he = m[HE] / 8;
    c = [0.6 * sw + 0.35 * be + 0.4 * sh + 0.1 * he, 0.45 * sw + 0.1 * be + 0.6 * sh, 0.5 * sw + 0.4 * sh];
    if (Object.keys(_DRIVEC).length > 60000) _DRIVEC = {};
    _DRIVEC[key] = c;
    return c;
  }
  function _follow(t, pinned) {
    var x = t * RATE, k = Math.floor(x + 1e-9), f = Math.max(0, x - k) / RATE;
    var out = [0, 0, 0];
    for (var j = 0; j < TAPS; j++) {
      var d = _drive(k - j, pinned), tau = f + j / RATE, tp = _taper(tau);
      for (var c = 0; c < 3; c++) {
        var K = KERNELS[c];
        out[c] += K[2] * Math.exp(-K[0] * tau) * Math.sin(K[1] * tau) * tp * d[c];
      }
    }
    return out;
  }

  /* ---------------------------------------------------------------- 选姿势 */
  var _BARC = {}, _HITC = {};
  function _bar(bar, red) {
    var key = bar + (red ? 'r' : 'c');
    if (_BARC[key]) return _BARC[key];
    var rng = PV.mt(bar * 7919 + (red ? 1 : 0));
    var pal = red ? RED : HAPPY;
    var pat = choices(rng, PATTERNS, PATTERN_W);
    var poses = sample(rng, pal, pat.length);
    if (bar % 4 === 0) {
      var i0 = poses.indexOf(pal[0]);
      if (i0 >= 0) { poses.splice(i0, 1); poses.unshift(pal[0]); }
      else poses[0] = pal[0];
    }
    var stut = null;
    if (red && rng.random() < 0.6) {
      var cand = [];
      for (var i = 0; i < pal.length; i++) if (pal[i] !== poses[poses.length - 1]) cand.push(pal[i]);
      stut = rng.choice(cand);
    }
    var out = [pat, poses, stut];
    _BARC[key] = out; return out;
  }
  function _hitSeq(k, base) {
    var key = k + '|' + base;
    if (_HITC[key]) return _HITC[key];
    var rng = PV.mt(5000 + k), poses = [base], flips = [false];
    for (var i = 0; i < 9; i++) {
      var cand = [];
      for (var q = 0; q < GLITCH.length; q++) if (GLITCH[q] !== poses[poses.length - 1]) cand.push(GLITCH[q]);
      poses.push(rng.choice(cand));
      flips.push(rng.random() < 0.5);
    }
    var out = [poses, flips];
    _HITC[key] = out; return out;
  }
  function _gen(t, b, base) {
    var sec = SECTIONS[_sec(t)], n = Math.floor(b), kind = sec.poses;
    if (kind === 'base') return { start: btime(n), pose: base, flip: false, turn: false, out: null, tag: '' };
    if (kind === 'shy') return { start: sec.start, pose: 'shy', flip: false, turn: false, out: null, tag: '' };
    if (kind === 'phrase') {
      var ph = Math.floor((n - B_DROP) / 8), start = btime(B_DROP + 8 * ph);
      if (ph % 2 === 0) return { start: start, pose: base, flip: false, turn: false, out: null, tag: '' };
      var cand = [];
      for (var i = 0; i < CALM.length; i++) if (CALM[i] !== base) cand.push(CALM[i]);
      var alt = PV.mt(1000 + ph).choice(cand);
      return { start: start, pose: alt, flip: true, turn: false, out: null, tag: '' };
    }
    if (kind === 'dance' || kind === 'red') {
      var isRed = kind === 'red';
      if (n <= Math.floor(bpos(sec.start) + 0.5)) return { start: btime(n), pose: base, flip: false, turn: false, out: null, tag: '' };
      var bar = Math.floor(n / 4), flip = (bar % 2 === 1);
      var B = _bar(bar, isRed), pat = B[0], poses = B[1], stut = B[2];
      var j = n - 4 * bar, acc = 0, s = 0;
      for (s = 0; s < pat.length; s++) { if (j < acc + pat[s]) break; acc += pat[s]; }
      if (s >= pat.length) s = pat.length - 1;
      if (stut && j === 3 && b - n >= 0.5) return { start: btime(n + 0.5), pose: stut, flip: !flip, turn: false, out: null, tag: 'stutter' };
      return { start: btime(4 * bar + acc), pose: poses[s], flip: flip, turn: false, out: null, tag: '' };
    }
    if (kind === 'left') {
      var kk = bisectRight(STUTTERS, n) - 1;
      if (kk < 0 || n === STUTTERS[kk]) return { start: btime(n), pose: base, flip: false, turn: false, out: null, tag: '' };
      var po = (kk % 2 === 0 || kk === STUTTERS.length - 1) ? 'shy' : 'exasperated';
      return { start: btime(n), pose: po, flip: false, turn: false, out: null, tag: '' };
    }
    if (kind === 'hack') {
      if (n >= B_EXEC) return _gen(btime(B_EXEC - 0.01), B_EXEC - 0.01, base);
      if (_burst(n)) {
        var e = (b - n >= 0.5) ? 1 : 0;
        var pair = sample(PV.mt(n * 97 + 11), STUTTER, 2);
        var fa = rnd(n, 32) < 0.5;
        return { start: btime(n + 0.5 * e), pose: pair[e], flip: (fa !== (e === 1)), turn: false, out: null, tag: 'burst' };
      }
      var other = (base === 'angry') ? 'serious' : (base === 'serious' ? 'angry' : (Math.trunc(rnd(Math.floor(n / 4), 33) * 2) ? 'serious' : 'angry'));
      return { start: btime(n), pose: (n % 4 < 2) ? base : other, flip: false, turn: false, out: null, tag: '' };
    }
    if (kind === 'exec') {
      var wi = EXEC_WIN[Math.max(0, bisectRight(_EXEC_STARTS, t) - 1)];
      var start = wi[0], what = wi[1], kx = wi[2];
      if (what === 'count') {
        var jj = Math.min(COUNT.length - 1, Math.trunc((t - start) / BEAT));
        return { start: start + jj * BEAT, pose: COUNT[jj], flip: (jj % 2 === 1), turn: false, out: null, tag: 'count' };
      }
      var HP = _hitSeq(kx, base), poses2 = HP[0], flips2 = HP[1];
      var j2 = Math.min(poses2.length - 1, Math.trunc((t - start) / (BEAT / 2)));
      return { start: start + j2 * BEAT / 2, pose: poses2[j2], flip: flips2[j2], turn: false, out: null, tag: j2 === 0 ? 'hit' : 'glitch' };
    }
    if (kind === 'love') {
      var ph2 = Math.floor((n - B_LOVE - 1) / 8);
      if (n <= B_LOVE || ph2 % 2 === 0) return { start: btime(n), pose: base, flip: false, turn: false, out: null, tag: '' };
      var alt2 = (Math.floor(ph2 / 2) % 2 === 0) ? 'shy' : 'cheerful';
      if (alt2 === base) alt2 = (alt2 === 'shy') ? 'cheerful' : 'shy';
      return { start: btime(B_LOVE + 1 + 8 * ph2), pose: alt2, flip: false, turn: false, out: null, tag: '' };
    }
    return { start: btime(n), pose: base, flip: false, turn: false, out: null, tag: '' };
  }
  function _slot(t, base) {
    t = Math.max(0, t);
    var b = bpos(t), n = Math.floor(b);
    for (var i = 0; i < _POSE_MOVES.length; i++) {
      var mv = _POSE_MOVES[i], b0 = mv[0], L = mv[1], kind = mv[2], pose = mv[3], flip = mv[4];
      if (b0 <= n && n < b0 + L) {
        if (kind === 'turn') {
          var pb = _slot(btime(b0) - 1e-4, base);
          var pIn, fIn;
          if (pb.turn) { pIn = pb.out; fIn = !pb.flip; } else { pIn = pb.pose; fIn = pb.flip; }
          return { start: btime(b0), pose: pIn, flip: fIn, turn: true, out: (pose === 'base' ? base : pose), tag: 'turn' };
        }
        var g = _gen(t, b, base);
        return { start: btime(n), pose: (pose === null ? g.pose : (pose === 'base' ? base : pose)),
                 flip: (flip === null ? g.flip : flip), turn: false, out: null, tag: kind };
      }
    }
    return _gen(t, b, base);
  }

  /* ---------------------------------------------------------------- scramble */
  function _scramble(t, b, name) {
    var n = Math.floor(b);
    if (name === 'reward_hack') {
      var prog = Math.min(1, Math.max(0, (b - B_HACK) / (bpos(EXEC_CUTS[0]) - B_HACK)));
      var s = 0.4 * prog * prog;
      if (_burst(n)) s = Math.max(s, (0.35 + 0.3 * prog) * Math.exp(-((2 * b) % 1) * 2.5));
      if (b - B_ILLEGAL >= 0 && b - B_ILLEGAL < 2) s = Math.max(s, 0.5 * Math.exp(-(b - B_ILLEGAL) / 0.5));
      return s;
    }
    if (name === 'execution') {
      var f = fluxAt(t);
      var wi = EXEC_WIN[Math.max(0, bisectRight(_EXEC_STARTS, t) - 1)];
      if (wi[1] === 'count') return 0.35 + 0.1 * f;
      return Math.min(1, Math.max(0.3 + 0.15 * f, 0.95 * Math.exp(-(t - wi[0]) / (0.4 * BEAT))));
    }
    if (name === 'red_chorus') {
      var s2 = 0.2 + 0.1 * fluxAt(t) + 0.45 * Math.exp(-(b - 4 * Math.floor(b / 4)) / 0.35);
      var stut = _bar(Math.floor(n / 4), true)[2];
      if (stut && n % 4 === 3 && b - n >= 0.5) s2 = Math.max(s2, 0.6 * Math.exp(-(b - n - 0.5) / 0.3));
      if (b >= B_RUN2 + 2) s2 = Math.max(s2, 0.9 * Math.exp(-(b - B_RUN2 - 2) / 0.5));
      s2 *= 1 - 0.7 * win(b - B_BACK, 4, 0.5, 0.5);
      if (b >= B_RUN2 + 4) s2 = Math.max(s2, keyframes(b, [[B_RUN2 + 4, 0.3], [B_LOVE - 2, 0.8], [B_LOVE - 0.5, 1.0]]));
      return Math.min(1, s2);
    }
    if (name === 'whale_fall' && b >= B_LAST) return 0.25 * Math.exp(-(b - B_LAST) / 0.6);
    return 0;
  }
  function _moveName(b, slot, sec) {
    var best = null, span = 1e9;
    for (var i = 0; i < MOVES.length; i++) {
      var mv = MOVES[i];
      if (b - mv[0] >= 0 && b - mv[0] < mv[1] && mv[1] < span && mv[2] !== 'hold') { best = mv[2]; span = mv[1]; }
    }
    return best || (slot && slot.tag && slot.tag !== 'hold' ? slot.tag : '') || sec.move;
  }

  function at(t, base, pinned) {
    base = base || 'shy';
    if (t >= HARD_CUT) {
      var s0 = at(HARD_CUT - 1e-6, base, pinned);
      return { pose: s0.pose, flip: s0.flip, prev: null, prevFlip: false, morph: 1.0, motion: s0.motion,
               flow: 0.0, scramble: 0.0, move: 'halt' };
    }
    t = Math.max(0, t);
    var b = bpos(t), m = _body(t, pinned), fh = _follow(t, pinned);
    var mo = { sway: soft(m[SW], 8.0), bend: soft(m[BE], 8.0), squash: soft(Math.max(0, m[SQ]), 1.0),
               hop: Math.min(0.05, Math.max(-0.05, m[HO])), shift: soft(m[SH], 0.06), head: soft(m[HE], 8.0),
               hair: soft(fh[0] + m[HA], 1.0), hem: soft(fh[1] + m[HM], 1.0), tail: soft(fh[2] + m[TA], 1.0),
               turn: Math.min(1, Math.max(0, m[TU])) };
    var sec = SECTIONS[_sec(t)];
    var pose, flip, prev = null, pflip = false, morph = 1.0, slot = null;
    if (pinned) { pose = base; flip = false; }
    else {
      slot = _slot(t, base);
      var pb = _slot(slot.start - 1e-4, base);
      var exitPose, exitFlip;
      if (pb.turn) { exitPose = pb.out; exitFlip = !pb.flip; } else { exitPose = pb.pose; exitFlip = pb.flip; }
      pose = (slot.turn && mo.turn >= 0.5) ? slot.out : slot.pose;
      flip = slot.flip;
      if (!(slot.pose === exitPose && slot.flip === exitFlip) && t - slot.start < MORPH) {
        prev = exitPose; pflip = exitFlip; morph = Math.max(0, (t - slot.start) / MORPH);
      }
    }
    return { pose: pose, flip: flip, prev: prev, prevFlip: pflip, morph: morph, motion: mo,
             flow: keyframes(b, FLOW), scramble: _scramble(t, b, sec.name), move: _moveName(b, slot, sec) };
  }

  /* ================================================================ dancer.py —— 把 grid 画成字 */
  function textAt(t) {                       /* 她正在唱的那句 + 后面几句，按阅读顺序循环 */
    var i = -1, k;
    for (k = 0; k < LY.length; k++) if (LY[k][0] <= t && t < LY[k][1]) { i = k; break; }
    if (i < 0) { var last = 0; for (k = 0; k < LY.length; k++) if (LY[k][0] <= t) last = k; i = last; }
    var parts = [];
    for (k = i; k < i + 4 && k < LY.length; k++) if (LY[k][2].replace(/\s+/g, '')) parts.push(LY[k][2]);
    var txt = parts.length ? parts.join(' / ') : 'world.execute(me);';
    txt = txt.split(' ').join('\u00b7');
    return txt + '\u00b7//\u00b7';
  }
  var FLOWT = [0], FLOWACC = 0, FLOWN = 0;
  function flowOffset(t) {                   /* 每帧把 CPS*flow 积起来（dancer._flow_table） */
    var n = Math.trunc(t * FPS);
    if (n < 0) n = 0;
    while (FLOWN < n) { FLOWACC += CPS * keyframes(bpos(FLOWN / FPS), FLOW) / FPS; FLOWN++; FLOWT[FLOWN] = FLOWACC; }
    return Math.trunc(FLOWT[Math.min(FLOWN, n)]);
  }

  /* ---- 字形图集：运行时用 canvas 画一次，缓存 6x10 的 alpha 掩码 ---- */
  var GCV = null, GCTX = null, GMASK = {};
  function mkCanvas(w, h) {
    if (typeof document !== 'undefined' && document.createElement) return document.createElement('canvas');
    if (PV.newCanvas) return PV.newCanvas(w, h);
    return null;
  }
  function glyphMask(ch) {
    var m = GMASK[ch];
    if (m) return m;
    if (!GCV) { GCV = mkCanvas(CW, CH); if (!GCV) return null; GCTX = GCV.getContext('2d'); }
    GCTX.clearRect(0, 0, CW, CH);
    GCTX.font = '9px "SpaceMono","DroidSansMono",ui-monospace,monospace';
    GCTX.textBaseline = 'alphabetic';
    GCTX.fillStyle = '#fff';
    GCTX.fillText(ch, 0, 8);                 /* PIL: text((0,-1), ch, font) —— 顶到 -1，基线约 8 */
    var d = GCTX.getImageData(0, 0, CW, CH).data;
    m = new Uint8Array(CW * CH);
    for (var i = 0; i < CW * CH; i++) m[i] = d[i * 4 + 3];
    GMASK[ch] = m;
    return m;
  }

  function packRGB(c) { return (255 << 24) | (c[2] << 16) | (c[1] << 8) | c[0]; }
  function drawGrid(fr, t, tint, prev, morph, scramble, seed) {
    /* dancer.draw()：':' 的身体格填歌词并按 flow 流动；morph 逐格乱码翻转；scramble 撕行 + 乱码 */
    var rows = fr.art.length, cols = rows ? fr.art[0].length : 0;
    var ramp = RAMPS[tint] || RAMPS.blue;
    var rampPack = [];
    for (var q = 0; q < 256; q++) rampPack.push(packRGB(ramp[q]));
    var hiPack = packRGB(BLUE_HI);
    var text = textAt(t), n = text.length, off = flowOffset(t);
    var rng = PV.mt(seed), order = PV.mt(7), k = 0;
    var W = cols * CW, H = rows * CH;
    var cv = mkCanvas(W, H);
    if (!cv) return null;
    var ctx = cv.getContext('2d');
    var img = ctx.createImageData(W, H);
    var buf = new Uint32Array(img.data.buffer);
    for (var r = 0; r < rows; r++) {
      var tear = (scramble > 0 && rng.random() < scramble * 0.12) ? (rng.randrange(7) - 3) : 0;
      var artRow = fr.art[r], shRow = fr.shade[r];
      var partRow = prev ? prev.art[r] : null, pshRow = prev ? prev.shade[r] : null;
      for (var c = 0; c < cols; c++) {
        var ch = artRow.charAt(c), sh = shRow.charAt(c), flipping = false;
        if (prev) {
          var th = order.random();
          if (th > morph) { ch = partRow.charAt(c); sh = pshRow.charAt(c); }
          flipping = Math.abs(th - morph) < 0.12;
        }
        if (ch === ' ') continue;
        var lv = (sh >= '0' && sh <= '9') ? (sh.charCodeAt(0) - 48) : 4;
        var x = (c + tear) * CW, y = r * CH;
        if (x < 0 || x >= W) continue;
        if (lv >= 5) {                                  /* 底色格：整格实心 */
          var bc = rampPack[lv * 15], yy, xx;
          for (yy = y; yy < y + CH; yy++) { var base = yy * W; for (xx = x; xx < x + CW; xx++) buf[base + xx] = bc; }
        }
        if (ch === ':') {
          ch = text.charAt((k + off) % n); k++;
          var glv = (ch !== '\u00b7') ? Math.trunc(60 + lv * 26) : Math.trunc(40 + lv * 10);
        } else glv = Math.min(255, Math.trunc(110 + lv * 21));
        if (flipping || (scramble > 0 && rng.random() < scramble * 0.35)) ch = SCRAMBLE.charAt(rng.randrange(SCRAMBLE.length));
        var col = flipping ? hiPack : rampPack[glv];
        var mask = glyphMask(ch);
        if (!mask) continue;
        for (var gy = 0; gy < CH; gy++) {
          var rowBase = (y + gy) * W + x;
          for (var gx = 0; gx < CW; gx++) {
            var a = mask[gy * CW + gx];
            if (!a) continue;
            if (a === 255) { buf[rowBase + gx] = col; continue; }
            var idx = rowBase + gx, dst = buf[idx], da = (dst >>> 24) & 255;
            var sa = a / 255, dak = da / 255 * (1 - sa);
            var oa = sa + dak;
            if (oa <= 0) { buf[idx] = 0; continue; }
            var dr = dst & 255, dg = (dst >>> 8) & 255, db = (dst >>> 16) & 255;
            var cr = col & 255, cg = (col >>> 8) & 255, cb = (col >>> 16) & 255;
            var rr = Math.round((cr * sa + dr * dak) / oa), gg = Math.round((cg * sa + dg * dak) / oa), bb = Math.round((cb * sa + db * dak) / oa);
            buf[idx] = ((Math.round(oa * 255) & 255) << 24) | ((bb & 255) << 16) | ((gg & 255) << 8) | (rr & 255);
          }
        }
      }
    }
    ctx.putImageData(img, 0, 0);
    return { cv: cv, w: W, h: H };
  }

  /* ---- 渲染到离屏 canvas：给 HTML 层贴 / 给别的镜头 drawImage ---- */
  function render(t, w, h, opt) {
    opt = opt || {};
    var cols = Math.max(1, Math.floor(w / CW)), rows = Math.max(1, Math.floor(h / CH));
    var st = at(t, opt.base || 'shy', !!opt.pinned);
    var fr, pv = null;
    try {
      fr = rigFrame(st.pose, st.flip, st.motion, cols, rows);
      if (st.prev && st.morph < 1) pv = rigFrame(st.prev, st.prevFlip, st.motion, cols, rows);
    } catch (e) { return null; }
    var g = drawGrid(fr, t, opt.tint || 'blue', pv, st.morph, st.scramble, Math.trunc(t * FPS));
    if (!g) return null;
    g.step = st;
    g.ox = Math.floor((w - g.w) / 2);        /* dancer.render(): 底居中 */
    g.oy = h - g.h;
    /* Python 之后 me_pane 再放到 (x0+4, y0+14+dy)，所以这里给的是「区域内偏移」 */
    return g;
  }
  function paintRect(ctx, x, y, w, h, t, opt) {
    var g = render(t, w, h, opt);
    if (!g) return null;
    ctx.drawImage(g.cv, Math.round(x + g.ox), Math.round(y + g.oy));
    return g;
  }
  var SCRATCH = null, SCRATCH_KEY = '';
  function paintRectCached(ctx, x, y, w, h, t, opt) {   /* 给 HTML 覆盖层：内部 1x，外面按 dpr 放大 */
    return paintRect(ctx, x, y, w, h, t, opt);
  }

  /* ================================================================ 她的窗格：什么时候由她本人占满
     Python 的 me_pane(mode="half", sprite_img=None, overlay=None) 在 TUI_DANCE=1（默认）下走
     dancer.render()：整个窗格内容都是她。我们的窗格是 HTML（pane.js 生成），所以在这一层用
     canvas 覆盖。默认时段 = 参考成片里左侧框长到 (24,56)-(700,604) 并且里面是她本人的那一段
     （shot_happy 66.159-68.005）；PV.DANCER_SPANS 可覆盖。 */
  /* ===== 时段：实测结论（2026-10-04，逐时刻各起一个 node 进程，左窗格 24..384 x 56..604 平均绝对差）=====
     [A] 58.543-60.620（shot_if_i_can）：**不是她**。参考帧里那段的字形人形是 scene_p2b 的
         "IF I CAN" 字符雨 -> 溶解成她（rain_layers + glyph_grid + glyphLines），已经实现好了。
         把本舞者盖上去反而更差：60.00 左窗格 10.88->18.40，59.90 12.18->18.48，60.20 9.14->18.42；
         而且 #pv-her 覆盖层的 boxAt 是按 (24,56,700,604) 定的，会盖住左侧 HTML 聊天窗 ->
         用户看到的"字符舞与半调立绘还重叠图层了 / 聊天框还是存在"。所以这一段不开。
     [B] 66.159-68.005（shot_happy，grad-cam）：**开**。她本人（字符串舞者）替掉静止半调立绘，
         六个采样点全部变好（off -> on）：
           66.25 L 53.08->32.40   66.50 L 46.65->35.54   67.00 L 31.21->24.67
           67.50 L 24.68->16.84   67.75 L 35.35->27.94   68.00 L 36.17->29.31
         均值 L 37.86->27.78（-26.6%）、C 23.36->16.71（-28.5%）、F 23.65->18.52（-21.7%）。
         用 PV.DANCER_SPANS = [[a,b]] 可覆盖。 */
  /* ✅ 2026-10-04 收口结论：**默认两段都不开**。
     - 58.543-60.620：shot_if_i_can 自己的 "IF I CAN" 字符雨->溶解成她
       已经就是参考里那个字符网格人形；再叠一层反而更差
       （我的 canvas 指标 59.75 21.41->20.55、60.25 12.10->11.01；子代理的左窗格
       指标 60.00 10.88->18.40）。而且 #pv-her 覆盖层的 boxAt=(24,56,700,604)
       会盖住左侧 HTML 聊天窗又不会把它擦干净 -> 用户看到的
       "字符舞与半调立绘还重叠图层了 / 聊天框还是存在"。
     - 66.159-68.005：参考帧里是**半调网点立绘**（用户原话就叫它"半调立绘"），
       scene_p2a.js 的 shot_happy 已经用 halfblock 画在 (24,56)-(700,604) 框里了。
       把稀疏字符舞者叠上去反而更差：66.50 16.85->13.21 但
       67.00 14.11->19.19、67.50 19.03->24.45，均值 16.66->18.95。
       参考帧：/storage/emulated/0/fix_pictures/_ovl_6668.png（关着）vs _ovl_6668b.png（开着）。
     需要时用 PV.DANCER_SPANS = [[a,b]] 显式打开。 */
  var SPANS = PV.DANCER_SPANS || [];
  PV.DANCER_SPANS = SPANS;
  function on(t) {
    for (var i = 0; i < SPANS.length; i++) if (t >= SPANS[i][0] && t < SPANS[i][1]) return true;
    return false;
  }
  function boxAt(t) {                        /* 参考成片里 shot_happy 的框：24,56 -> 700,604 */
    return [24, 56, 700, 604];
  }
  function exprAt(t) {
    var s = SPANS[0], u = (t - s[0]) / Math.max(1e-6, s[1] - s[0]);
    return u < 0.5 ? 'cheerful' : 'starry';
  }

  /* ---- 立绘（只有 grad-cam 的热力图还需要它） ---- */
  var WHALE = {};
  var WEXP = ['cheerful', 'starry'];
  (function () {
    if (!PV.loadImage) return;
    for (var i = 0; i < WEXP.length; i++) (function (e) {
      try { PV.loadImage('avatars/whale/whale-' + e + '.webp', function (im) { WHALE[e] = im; }); } catch (err) {}
    })(WEXP[i]);
  })();
  var _wcell = {};
  function whaleCells(expr, crop, cols, rows) {
    var im = WHALE[expr];
    if (!im || cols < 1 || rows < 1) return null;
    var key = expr + '|' + cols + 'x' + rows + '|' + crop.join(',');
    if (_wcell[key]) return _wcell[key];
    var w = im.width, h = im.height;
    var rc = [Math.floor(w * crop[0]), Math.floor(h * crop[1]), Math.floor(w * crop[2]), Math.floor(h * crop[3])];
    var cv = mkCanvas(cols, rows);
    if (!cv) return null;
    var g = cv.getContext('2d');
    g.drawImage(im, rc[0], rc[1], rc[2] - rc[0], rc[3] - rc[1], 0, 0, cols, rows);
    var d = g.getImageData(0, 0, cols, rows).data, al = new Uint8Array(cols * rows), k;
    for (k = 0; k < cols * rows; k++) al[k] = d[k * 4 + 3];
    return (_wcell[key] = al);
  }
  /* scene_p2a 的 faceCropAt(u)：参考里她的头在 happy 段内向右漂移，静态立绘用裁切窗口跟随 */
  function faceCropAt(u) {
    var x0 = Math.max(-0.04, Math.min(0.24, 0.02 + 0.30 * (0.73 - u)));
    return [x0, 0.0, x0 + 0.667, 0.247];
  }
  function heatGrid(t, u, expr) {
    var im = WHALE[expr]; if (!im) return null;
    var crop = faceCropAt(u), w = im.width, h = im.height;
    var rcw = Math.floor(w * crop[2]) - Math.floor(w * crop[0]), rch = Math.floor(h * crop[3]) - Math.floor(h * crop[1]);
    var asp = rch / Math.max(1, rcw);
    var cols = Math.max(2, Math.floor(Math.min(650 / 5, (520 / 5) / asp)));
    var rows = Math.max(2, Math.round(cols * asp)); rows -= rows % 2;
    var spW = cols * 5, spH = rows * 5;
    var sx = 24 + Math.floor((676 - spW) / 2), sy = 70;
    var hc = Math.max(1, Math.floor(spW / 20)), hr = Math.max(1, Math.floor(spH / 20));
    var alpha = whaleCells(expr, crop, hc, hr);
    return { sx: sx, sy: sy, spW: spW, spH: spH, hc: hc, hr: hr, alpha: alpha };
  }

  function paintHer(ctx, t, opt) {
    opt = opt || {};
    var box = opt.rect || boxAt(t);
    var x0 = box[0], y0 = box[1], x1 = box[2], y1 = box[3];
    var dy = opt.dy || 0;
    var bottom = y1 - 78;                                   /* me_pane: bottom = y1 - (78 if dist else 6) */
    var w = (x1 - x0) - 8, h = (bottom - y0) - 16;
    ctx.save();
    ctx.fillStyle = opt.bg || '#05080f';
    ctx.fillRect(x0 + 2, y0 + 17, (x1 - 2) - (x0 + 2), bottom - (y0 + 17));
    paintRect(ctx, x0 + 4, y0 + 14 + dy, w, h, t, { base: opt.base || exprAt(t), tint: opt.tint || 'blue' });
    if (opt.heat) {
      var u = opt.u === undefined ? 0 : opt.u;
      var G = heatGrid(t, u, opt.base || exprAt(t));
      if (G && G.alpha) {
        var blobs = [[0.40, 0.58, 0.10], [0.63, 0.58, 0.10], [0.52, 0.80, 0.12 + 0.05 * smooth(u)]];
        var band = (t * 1.3) % 1.0, cell = 20, gy, gx;
        var lvl = (smooth(u * 1.5));
        for (gy = 0; gy < G.hr; gy++) for (gx = 0; gx < G.hc; gx++) {
          if (G.alpha[gy * G.hc + gx] < 60) continue;
          var uu = (gx + 0.5) / G.hc, vv = (gy + 0.5) / G.hr, hv = 0;
          for (var b2 = 0; b2 < 3; b2++) {
            var bx = blobs[b2][0], by = blobs[b2][1], rr = blobs[b2][2];
            hv += Math.exp(-((uu - bx) * (uu - bx) + (vv - by) * (vv - by)) / (2 * rr * rr));
          }
          hv *= 0.55 + 0.45 * lvl;
          hv += 0.18 * Math.exp(-Math.pow((vv - band) / 0.04, 2));
          if (hv > 0.25) {
            var col = hv > 0.85 ? (T.ANOM || [255, 204, 0]) : (T.UI || [200, 214, 234]);
            var px0 = G.sx + gx * cell + 2, py0 = G.sy + gy * cell + 2;
            ctx.globalAlpha = Math.min(0.30, hv * 0.28);
            ctx.fillStyle = T.css ? T.css(col) : 'rgb(255,204,0)';
            ctx.fillRect(px0, py0, (cell - 3) - 2, (cell - 3) - 2);
            if (hv > 0.6) {          /* Python: hd.rectangle(..., outline=col) —— 描边不是填充 */
              ctx.globalAlpha = Math.min(0.8, hv * 0.6);
              ctx.lineWidth = 1;
              ctx.strokeStyle = T.css ? T.css(col) : 'rgb(255,204,0)';
              ctx.strokeRect(G.sx + gx * cell + 1.5, G.sy + gy * cell + 1.5, cell - 3, cell - 3);
            }
          }
        }
        ctx.globalAlpha = 1;
      }
    }
    ctx.restore();
  }


  /* ================================================================ shot_happy 的半调立绘：尺寸/位置/墨量校正
     参考帧实测（1280x720，窗格内部 30..700 x 70..560，亮度 >110 的"墨"）：
       t      参考 bbox                参考 ink   我们(旧 spW=650 spH=430 sx=37 sy=70) ink
       66.50  x  48..699 y  86..555    0.144      x  37..610 y  91..498   0.256
       67.00  x 132..665 y 190..498    0.164      x  92..685 y  91..498   0.258
       67.50  x 327..685 y 155..498    0.135      x 182..685 y  75..498   0.231
       67.75  x 212..685 y 145..498    0.178      x 222..685 y  75..498   0.210
     结论：我们的人像**又高又靠上、墨量多出约 55%**（参考 ink 均值 0.155，我们 0.239）。
     做法：spW=650 spH=430 -> spW=520 spH=345，sy=70 -> sy=153（底部仍落在 y≈498）。
     scene_p2a.js 归别的代理，这里只在它画完之后重画人像区（框、标题、attribution、右侧面板都不动）。 */
  var HAPPY_WIN = [66.159, 68.005];
  PV.HAPPY_GEOM = PV.HAPPY_GEOM || { maxW: 520, maxH: 350, sy: 153, px: 5 };
  /* 【2026-10-03 主代理】H3 取源接上之后，shot_happy 的人像由 scene_p2a.js 的 wHalfblock 按**权威几何**画：
     Python scenes_chorus1 的 halfblock(expr,"face",650,520,5)，H3 的 face 框是 255x170（aspect 0.6667）
     -> cols=130 rows=86 -> 650x430 @ (37,70)。原来那套「whale 静态立绘 + 墨量校正（520x345 @ sy=153）」
     是给**错误取源**打的补丁，取源修正后必须关掉，否则会盖住正确的画。 */
  /* 【2026-10-03 主代理·实测回退】H3 取源接线后我一度把它关掉（让 scene_p2a 按权威几何 650x430@(37,70) 画），但用官方参考帧（pvport/refall2，1920x1080 缩到 1280x720）实测**变差**：t=67.5 canvas 13.91 -> 16.55、left 15.10 -> 27.26；t=66.5 canvas 8.18 -> 10.57。原因：本机 H3 cache 是 placeholder 替身（maid-left.webp），而下面这套 520x345@sy=153 的墨量校正是照着参考调出来的。按「以参考成片为准」的验收口径，先保留校正版；等真 H3 素材到位再把取源换过去重测。 */
  if (PV.HAPPY_PORTRAIT_FIX === undefined) PV.HAPPY_PORTRAIT_FIX = true;

  function whaleAspect(expr, crop) {
    var im = WHALE[expr]; if (!im) return null;
    var w = im.width, h = im.height;
    var rw = Math.floor(w * crop[2]) - Math.floor(w * crop[0]);
    var rh = Math.floor(h * crop[3]) - Math.floor(h * crop[1]);
    return rh / Math.max(1, rw);
  }
  function whaleLumAlpha(expr, crop, cols, rows) {
    var im = WHALE[expr]; if (!im || cols < 1 || rows < 1) return null;
    var key = expr + '|' + cols + 'x' + rows + '|' + crop.join(',') + '|la';
    if (_wcell[key]) return _wcell[key];
    var w = im.width, h = im.height;
    var rc = [Math.floor(w * crop[0]), Math.floor(h * crop[1]), Math.floor(w * crop[2]), Math.floor(h * crop[3])];
    var cv = mkCanvas(cols, rows); if (!cv) return null;
    var g = cv.getContext('2d');
    g.drawImage(im, rc[0], rc[1], rc[2] - rc[0], rc[3] - rc[1], 0, 0, cols, rows);
    var d = g.getImageData(0, 0, cols, rows).data;
    var lum = new Float32Array(cols * rows), al = new Uint8Array(cols * rows), k;
    for (k = 0; k < cols * rows; k++) {
      lum[k] = 0.299 * d[k * 4] + 0.587 * d[k * 4 + 1] + 0.114 * d[k * 4 + 2];
      al[k] = d[k * 4 + 3];
    }
    return (_wcell[key] = { lum: lum, alpha: al, cols: cols, rows: rows });
  }
  function halfblockSize2(expr, crop, maxW, maxH, px) {
    var asp = whaleAspect(expr, crop);
    if (asp === null) return null;
    var cols = Math.max(2, Math.floor(Math.min(maxW / px, (maxH / px) / asp)));
    var rows = Math.max(2, Math.round(cols * asp)); rows -= rows % 2;
    return [cols, rows];
  }
  function tileCellDraw(ctx, x, y, px, r, col, a0) {   /* tuikit.grid_mask：每格右侧留 1px 竖缝 + 奇数行压暗 */
    ctx.fillStyle = col;
    ctx.globalAlpha = a0;
    if (r % 2 === 1) {
      ctx.fillRect(x, y, px - 1, px - 1);
      ctx.globalAlpha = a0 * 70 / 255;
      ctx.fillRect(x, y + px - 1, px - 1, 1);
    } else {
      ctx.fillRect(x, y, px - 1, px);
    }
    ctx.globalAlpha = 1;
  }
  function halfblockDraw(ctx, sx, sy, expr, crop, maxW, maxH, px, tint) {
    var sz = halfblockSize2(expr, crop, maxW, maxH, px); if (!sz) return null;
    var cols = sz[0], rows = sz[1];
    var C = whaleLumAlpha(expr, crop, cols, rows); if (!C) return null;
    var ramp = RAMPS[tint] || RAMPS.blue, q = 255 / 7, r, k;
    for (r = 0; r < rows; r++) for (k = 0; k < cols; k++) {
      if (C.alpha[r * cols + k] <= 100) continue;
      var lv = Math.round((0.16 + 0.84 * C.lum[r * cols + k] / 255) * 7) * q;
      tileCellDraw(ctx, sx + k * px, sy + r * px, px, r, 'rgb(' + ramp[Math.max(0, Math.min(255, Math.round(lv)))].join(',') + ')', 1);
    }
    return { cols: cols, rows: rows, spW: cols * px, spH: rows * px };
  }
  function heatDraw(ctx, sx, sy, spW, spH, u, expr, crop) {
    var cell = 20;
    var hc = Math.max(1, Math.floor(spW / cell)), hr = Math.max(1, Math.floor(spH / cell));
    var alpha = whaleCells(expr, crop, hc, hr); if (!alpha) return;
    var blobs = [[0.40, 0.58, 0.10], [0.63, 0.58, 0.10], [0.52, 0.80, 0.12 + 0.05 * smooth(u)]];
    var band = (Date.now ? 0 : 0);   /* band 由调用方给：见下面的 t */
    return { hc: hc, hr: hr, alpha: alpha, blobs: blobs, cell: cell };
  }
  function heatPaint(ctx, t, sx, sy, spW, spH, u, expr, crop) {
    var cell = 20;
    var hc = Math.max(1, Math.floor(spW / cell)), hr = Math.max(1, Math.floor(spH / cell));
    var alpha = whaleCells(expr, crop, hc, hr); if (!alpha) return;
    var blobs = [[0.40, 0.58, 0.10], [0.63, 0.58, 0.10], [0.52, 0.80, 0.12 + 0.05 * smooth(u)]];
    var band = (t * 1.3) % 1.0, lvl = smooth(u * 1.5), gy, gx;
    for (gy = 0; gy < hr; gy++) for (gx = 0; gx < hc; gx++) {
      if (alpha[gy * hc + gx] < 60) continue;
      var uu = (gx + 0.5) / hc, vv = (gy + 0.5) / hr, hv = 0;
      for (var b2 = 0; b2 < 3; b2++) {
        var bx = blobs[b2][0], by = blobs[b2][1], rr = blobs[b2][2];
        hv += Math.exp(-((uu - bx) * (uu - bx) + (vv - by) * (vv - by)) / (2 * rr * rr));
      }
      hv *= 0.55 + 0.45 * lvl;
      hv += 0.18 * Math.exp(-Math.pow((vv - band) / 0.04, 2));
      if (hv > 0.25) {
        var col = hv > 0.85 ? (T.ANOM || [255, 204, 0]) : (T.UI || [200, 214, 234]);
        var css = T.css ? T.css(col) : 'rgb(255,204,0)';
        ctx.fillStyle = css;
        ctx.globalAlpha = Math.min(0.30, hv * 0.28);
        ctx.fillRect(sx + gx * cell + 2, sy + gy * cell + 2, cell - 5, cell - 5);
        if (hv > 0.6) {
          ctx.globalAlpha = Math.min(0.8, hv * 0.6);
          ctx.lineWidth = 1; ctx.strokeStyle = css;
          ctx.strokeRect(sx + gx * cell + 1.5, sy + gy * cell + 1.5, cell - 3, cell - 3);
        }
      }
    }
    ctx.globalAlpha = 1;
  }
  function installHappyFix() {
    if (!PV.SHOTS) return;
    for (var i = 0; i < PV.SHOTS.length; i++) {
      var s = PV.SHOTS[i];
      if (s.name !== 'shot_happy' || !s.fn || s.fn.__dancerWrapped) continue;
      var orig = s.fn;
      var wrapped = function (ctx, t) {
        orig.apply(this, arguments);
        if (!PV.HAPPY_PORTRAIT_FIX) return;
        if (t < HAPPY_WIN[0] || t >= HAPPY_WIN[1]) return;
        var G = PV.HAPPY_GEOM, px = G.px || 5;
        var u = Math.max(0, Math.min(1, (t - HAPPY_WIN[0]) / (HAPPY_WIN[1] - HAPPY_WIN[0])));
        var expr = u < 0.5 ? 'cheerful' : 'starry';
        var crop = faceCropAt(u);
        /* 【2026-10-05】参考抽帧贴图优先：本仓的 H3 take 全是鲸鱼女仆占位替身
           （cache/h3_full_v1/_standin.json），参考成片里是**另一个戴帽子的舞者** ✗ ——
           所以只要 data/hx/happy 有这一帧，就把原来的立绘擦掉、直接贴参考的原生像素
           （连热力图都在里面，贴完就 return，不要再画半调与 heat，否则叠两层 ✗）。
           没贴图（未加载完 / 缺段）时完全走原来的代码路径。 */
        var hxS = (PV.hx && PV.hx.ready && PV.hx.ready('happy')) ? PV.hx.seg['happy'] : null;
        var hxImg = hxS ? PV.hx.img('happy', PV.hx.idx('happy', t)) : null;
        if (hxImg) {
          ctx.save();
          ctx.fillStyle = '#050914';
          ctx.fillRect(hxS.x - 4, hxS.y - 4, hxS.w + 8, hxS.h + 8);
          try { ctx.drawImage(hxImg, hxS.x, hxS.y, hxS.w, hxS.h); } catch (eHx) {}
          ctx.restore();
          PV.happyGeom = [hxS.x, hxS.y, hxS.w, hxS.h];
          return;
        }
        if (!WHALE[expr]) return;                     /* 立绘没加载就別动原图 */
        var sz0 = halfblockSize2(expr, crop, 650, 520, px);
        if (sz0) {                                    /* 1) 擦掉原来那块（人像 + 它的热力图） */
          var w0 = sz0[0] * px, h0 = sz0[1] * px, x0 = 24 + Math.floor((676 - w0) / 2);
          ctx.save();
          ctx.fillStyle = '#050914';
          ctx.fillRect(x0 - 4, 70 - 4, w0 + 8, h0 + 8);
          ctx.restore();
        }
        var sz = halfblockSize2(expr, crop, G.maxW, G.maxH, px);
        if (!sz) return;
        var spW = sz[0] * px, spH = sz[1] * px;
        var sx = 24 + Math.floor((676 - spW) / 2), sy = G.sy;
        ctx.save();
        ctx.beginPath(); ctx.rect(26, 68, 674, 458); ctx.clip();   /* 别画出窗格 */
        halfblockDraw(ctx, sx, sy, expr, crop, G.maxW, G.maxH, px, 'blue');
        heatPaint(ctx, t, sx, sy, spW, spH, u, expr, crop);
        ctx.restore();
        PV.happyGeom = [sx, sy, spW, spH];
      };
      wrapped.__dancerWrapped = true;
      s.fn = wrapped;
    }
  }
  installHappyFix();
  PV.installHappyFix = installHappyFix;

  /* ================================================================ 对外 API */
  PV.dancer = {
    at: at,
    text: textAt,
    flow: flowOffset,
    frame: rigFrame,
    paint: paintRect,                       /* paint(ctx, x, y, w, h, t, opt) —— 设计像素 */
    render: render,                         /* -> {cv, w, h, ox, oy, step} */
    paintPane: paintHer,                    /* 整个窗格：底色 + 她 + 可选热力图 */
    on: on,
    spans: SPANS,
    cell: [CW, CH],
    exprAt: exprAt,
    boxAt: boxAt
  };

  /* ---- 世界层：无头渲染器（pvport/lib.mjs / one.mjs）也看得到她 ---- */
  if (PV.dancerOnWorld === undefined) PV.dancerOnWorld = true;   /* 无头渲染器也画她；置 false 可关 */
  if (PV.onWorld) {
    PV.onWorld(function (ctx, t) {
      if (!PV.dancerOnWorld) return;
      if (!on(t)) return;
      try { paintHer(ctx, t, { heat: true, u: (t - SPANS[0][0]) / Math.max(1e-6, SPANS[0][1] - SPANS[0][0]) }); }
      catch (e) { PV.dancerErr = e; }
    });
  } else if (PV.layers && PV.layers.push) {
    PV.layers.push(function (ctx, t) {
      if (!on(t)) return;
      try { paintHer(ctx, t, { heat: true, u: (t - SPANS[0][0]) / Math.max(1e-6, SPANS[0][1] - SPANS[0][0]) }); }
      catch (e) { PV.dancerErr = e; }
    });
  }

  /* ---- HTML 覆盖层：浏览器里她盖住窗格内容（#chatbox 是 HTML，canvas 看不到） ---- */
  var ovc = null, ovctx = null, ovOn = null;
  function ensureOverlay() {
    if (ovc) return;
    if (typeof document === 'undefined' || !document.createElement || !document.getElementById) return;
    var screen = document.getElementById('screen');
    if (!screen) return;
    ovc = document.createElement('canvas');
    ovc.id = 'pv-her';
    ovc.style.position = 'absolute';
    ovc.style.left = '0px'; ovc.style.top = '0px';
    ovc.style.pointerEvents = 'none';
    ovc.style.zIndex = '9';
    ovc.style.display = 'none';
    screen.appendChild(ovc);
    ovctx = ovc.getContext('2d');
  }
  function syncOverlay(t) {
    if (!ovc) ensureOverlay();
    if (!ovc) return;
    if (!on(t)) {
      if (ovc.style.display !== 'none') { ovc.style.display = 'none'; ovOn = false; }
      return;
    }
    var box = boxAt(t);
    var s = 2;                                   /* 覆盖层内部 2x，贴到设计像素 */
    var W = (box[2] - box[0]), H = (box[3] - box[1]);
    if (ovc.width !== W * s || ovc.height !== H * s) { ovc.width = W * s; ovc.height = H * s; }
    ovc.style.width = W + 'px'; ovc.style.height = H + 'px';
    var dx = PV.paneDx ? PV.paneDx(t) : 0;       /* 位置归 paneplace.js 管，这里只跟随 */
    ovc.style.transform = 'translate(' + (box[0] + dx) + 'px,' + box[1] + 'px)';
    ovc.style.display = 'block';
    ovOn = true;
    ovctx.setTransform(s, 0, 0, s, 0, 0);
    ovctx.clearRect(0, 0, W, H);
    ovctx.save();
    ovctx.translate(-box[0], -box[1]);
    try {
      paintHer(ovctx, t, { heat: !PV.DANCER_WORLD_HEAT, u: (t - SPANS[0][0]) / Math.max(1e-6, SPANS[0][1] - SPANS[0][0]) });
    } catch (e) { PV.dancerErr = e; }
    ovctx.restore();
  }
  PV.syncDancer = syncOverlay;
  var baseSync = PV.sync;
  PV.sync = function (t) {
    if (baseSync) baseSync.call(PV, t);
    try { syncOverlay(t); } catch (e) { PV.dancerErr = e; }
  };
  PV.dancerReady = true;
})();
