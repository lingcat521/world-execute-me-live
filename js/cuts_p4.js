/* cuts_p4.js —— 147.4 - 211.9 s 的转场：C78-C84（s_exec.py 的红副歌）与 C86-C94（s_eval.py 的 EVAL/WHALE_FALL）。
   逐类移植 continuity_full_v2 的 Cut 子类（pre/post/T 与 Python 一致）。
   C95/C96 在 Python 里 pre=post=0（空窗口）= 硬切，不注册。

   本文件自包含：只依赖 cuts.js 的框架（PV.addCut / PV.reveal / PV.radial / PV.inward /
   PV.newCanvas / PV.drawBackground / PV.shotTime / PV.mt）与 scene_p2c.js 注册的镜头。
   镜头一律按名字经 shotTime 调用（等价 Python 的 self.old / self.new + C.body(shot, t, n, hooks)）。 */
(function () {
  'use strict';
  var PV = window.PV, T = PV.tui;
  var W = 1280, H = 720, FPS = 24;
  var FULLR = [24, 56, 1164, 604];
  var PANE = [404, 56, 1164, 604];
  var GLYPHS = '01<>/\\|=+*#%&$?!:;{}[]~^';   /* kit.GLYPHS */

  /* ---------------- 通用工具（cuts.py / kit.py 的同名物） ---------------- */
  function clamp01(u) { return u < 0 ? 0 : (u > 1 ? 1 : u); }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function eIo(u) { u = clamp01(u); return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2; }
  function eIn(u) { u = clamp01(u); return u * u * u; }
  function eOut(u) { u = clamp01(u); var d = 1 - u; return 1 - d * d * d; }
  function eBack(u, s) { u = clamp01(u); s = s === undefined ? 1.70158 : s; var d = u - 1; return 1 + (s + 1) * d * d * d + s * d * d; }
  function lerp(a, b, u) { return a + (b - a) * u; }
  function lerpP(a, b, u) { return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u]; }
  function lerpR(a, b, u) {
    u = clamp01(u);
    return [Math.round(a[0] + (b[0] - a[0]) * u), Math.round(a[1] + (b[1] - a[1]) * u), Math.round(a[2] + (b[2] - a[2]) * u)];
  }
  function red(lv) { return T.mix(T.ERR, lv); }
  function blue(lv) { return T.mix(T.ME_TEXT, lv); }
  function amb(lv) { return T.mix(T.UI, lv); }
  function anom(lv) { return T.mix(T.ANOM, lv); }
  function rgba(c, a) { return T.css(c, a === undefined ? 1 : a); }
  function mk() { return PV.newCanvas(W, H); }
  function pair(t) {
    var oc = mk(), nc = mk(), og = oc.getContext('2d'), ng = nc.getContext('2d');
    if (PV.drawBackground) { PV.drawBackground(og, t); PV.drawBackground(ng, t); }
    return [oc, og, nc, ng];
  }
  /* kit.bezier：控制点在中点 + (dy, -dx) * bend（bend > 0 朝行进方向左侧鼓） */
  function bez(p0, p1, bend, u) {
    var mx = (p0[0] + p1[0]) / 2, my = (p0[1] + p1[1]) / 2;
    var dx = p1[0] - p0[0], dy = p1[1] - p0[1];
    var cx = mx + dy * bend, cy = my - dx * bend;
    var a = (1 - u) * (1 - u), b = 2 * (1 - u) * u, c = u * u;
    return [a * p0[0] + b * cx + c * p1[0], a * p0[1] + b * cy + c * p1[1]];
  }
  /* kit.sweep(origin, direction, t0, speed) */
  function sweep(origin, dir, t0, speed) {
    var n = Math.hypot(dir[0], dir[1]) || 1, dx = dir[0] / n, dy = dir[1] / n;
    return function (x, y) { return t0 + Math.max(0, (x - origin[0]) * dx + (y - origin[1]) * dy) / speed; };
  }
  /* text_at：PIL 的 d.text((x, y))（亮起 halo / lift 抬起） */
  function textAt(ctx, s, x, y, col, size, scale, alpha, halo, lift, bold) {
    if (alpha !== undefined && alpha <= 0.01) return;
    scale = scale === undefined ? 1 : scale;
    if (scale <= 0.01) return;
    var fs = Math.max(6, Math.round(size * scale));
    ctx.save();
    if (alpha !== undefined && alpha < 0.999) ctx.globalAlpha = clamp01(alpha);
    if (lift && lift > 0.01) col = lerpR(col, [235, 240, 255], clamp01(lift));
    if (halo && halo > 0.01) { ctx.shadowColor = rgba(col, 1); ctx.shadowBlur = 9 * halo; }
    T.textMono(ctx, s, x, y, col, fs);
    ctx.restore();
  }

  /* ---------------- 镜头调用（C.body 的等价物） ---------------- */
  function shotOf(name) {
    for (var i = 0; i < PV.SHOTS.length; i++) if (PV.SHOTS[i].name === name) return PV.SHOTS[i];
    return null;
  }
  function shotDelay(name) { return (PV.SHOT_DELAY && PV.SHOT_DELAY[name]) || 0; }
  function drawShot(ctx, name, t, o) {
    var s = shotOf(name);
    if (!s || !s.fn) return false;
    var q = PV.shotTime(name, t);                  /* [lt, u]，已含镜头自带延迟 */
    var d = shotDelay(name), dur = s.b - s.a - d;
    s.fn(ctx, t, q[0], q[1], dur > 0 ? dur : 0, o || null);
    return true;
  }
  function hasShots() {
    for (var i = 0; i < arguments.length; i++) if (!shotOf(arguments[i])) return false;
    return true;
  }

  /* ---------------- reveal_c：逐格替换 + 解码字形（s_exec.reveal_c 的等价物） ----------------
     PV.reveal 只做逐格替换；这里额外做 Python reveal_c 的两件事：
     ① 两张画布都留在手上（旧画面还要被 carrier 的亮起改写）；② 过渡格上按 GLYPHS 撒解码噪声，
     且只在"旧或新画面在该格有墨"的地方撒（对背景取差分的逐格平均，阈值 6）。 */
  function cellInk(cv, bcv, x0, y0, rw, rh, cols, rows, cw, ch) {
    var g = cv.getContext('2d'), bg = bcv.getContext('2d');
    var a, b;
    try { a = g.getImageData(x0, y0, rw, rh).data; b = bg.getImageData(x0, y0, rw, rh).data; }
    catch (e) { return null; }
    var out = new Float32Array(cols * rows);
    for (var y = 0; y < rh; y++) {
      var rr = (y / ch) | 0; if (rr >= rows) rr = rows - 1;
      for (var x = 0; x < rw; x++) {
        var i = (y * rw + x) * 4;
        var d0 = Math.abs(a[i] - b[i]), d1 = Math.abs(a[i + 1] - b[i + 1]), d2 = Math.abs(a[i + 2] - b[i + 2]);
        var m = d0 > d1 ? d0 : d1; if (d2 > m) m = d2;
        out[rr * cols + ((x / cw) | 0)] += m;
      }
    }
    for (var k = 0; k < out.length; k++) out[k] /= (cw * ch);
    return out;
  }
  function revealC(ctx, t, oc, og, nc, ng, delayFn, opts, seed, density, colorFn) {
    opts = opts || {};
    var R = opts.region || PANE, cell = opts.cell || [8, 16], dur = opts.dur === undefined ? 0.08 : opts.dur;
    var cw = cell[0], ch = cell[1], x0 = R[0], y0 = R[1];
    var cols = Math.floor((R[2] - R[0]) / cw), rows = Math.floor((R[3] - R[1]) / ch);
    var rw = cols * cw, rh = rows * ch;
    var bcv = mk();
    if (PV.drawBackground) PV.drawBackground(bcv.getContext('2d'), t);
    var i0 = cellInk(oc, bcv, x0, y0, rw, rh, cols, rows, cw, ch);
    var i1 = cellInk(nc, bcv, x0, y0, rw, rh, cols, rows, cw, ch);
    ctx.drawImage(oc, 0, 0);
    var ps = [], r, q;
    for (r = 0; r < rows; r++) {
      for (q = 0; q < cols; q++) {
        var cx = x0 + q * cw + cw / 2, cy = y0 + r * ch + ch / 2;
        var p = clamp01((t - delayFn(cx, cy)) / dur);
        if (p <= 0.02) continue;
        ctx.save();
        ctx.globalAlpha = p;
        ctx.drawImage(nc, x0 + q * cw, y0 + r * ch, cw, ch, x0 + q * cw, y0 + r * ch, cw, ch);
        ctx.restore();
        if (p < 0.98) ps.push([q, r, p]);
      }
    }
    if (!ps.length) return;
    var rng = PV.mt(seed * 9973 + Math.floor(t * FPS));
    var col = colorFn || red;
    for (var j = 0; j < ps.length; j++) {
      q = ps[j][0]; r = ps[j][1];
      var pp = ps[j][2];
      var ch_ = rng.choice(GLYPHS);
      var ink0 = i0 ? i0[r * cols + q] : 255, ink1 = i1 ? i1[r * cols + q] : 255;
      if ((ink0 < 6 && ink1 < 6) || rng.random() > density) continue;
      var k = 1 - Math.abs(2 * pp - 1);
      textAt(ctx, ch_, x0 + q * cw, y0 + r * ch, col(0.25 + 0.65 * k), 13, 1, 1, 0, 0, true);
    }
  }

  /* ================================================================ C78（162.1587）
     exec_hit #13 -> red_if_i_can。MORPH：EXECUTION 横幅的格子逐个飞到最近的字幕格，
     左到右按"格子数"均匀起飞（最多 40% 在飞），落下的就是新字母，画面不会全黑。 */
  var GX0 = 36, GY0 = 68, CW = 8, CH = 16;
  var COLS = Math.floor((1150 - GX0) / CW), ROWS = Math.floor((596 - GY0) / CH);
  function cellXY(q, r) { return [GX0 + q * CW, GY0 + r * CH]; }
  var _ifican = null;
  function ificanInfo() {
    if (_ifican) return _ifican;
    var bits = PV.p2c.bannerBits('IF I CAN', 20, CH / CW);
    var bx0 = Math.floor((COLS - bits.width) / 2), by0 = Math.floor((ROWS - bits.height) / 2);
    var cells = [], r, q;
    for (r = 0; r < bits.height; r++)
      for (q = 0; q < bits.width; q++)
        if (bits.get(q, r)) cells.push([bx0 + q, by0 + r, 'IFICAN'.charAt((q + r * 3) % 6)]);
    cells.sort(function (a, b) { return (a[0] - b[0]) || (a[1] - b[1]); });   /* Python: key=(q, r) */
    _ifican = { bits: bits, bx0: bx0, by0: by0, cells: cells };
    return _ifican;
  }
  var C78 = { T: 162.1587, pre: 0.27, post: 0.45, FLY: 0.15, START: -0.21, SPAN: 0.44 };
  var _exb = null;
  function execBanner() {
    if (_exb) return _exb;
    var blk = PV.p2c.bannerBlockTop(null, 'EXECUTION', 44, 11, T.ERR, 1120);
    var bx = 24 + Math.floor((1140 - blk.w) / 2), by = 300 - Math.floor(blk.h / 2);
    var cv = PV.newCanvas(Math.max(1, blk.w), Math.max(1, blk.h)), g = cv.getContext('2d');
    PV.p2c.bannerBlockDraw(g, blk, 0, 0, T.ERR);
    _exb = { blk: blk, bx: bx, by: by, cv: cv };
    return _exb;
  }
  /* 横幅盖住了哪些字幕格（banner_block 的 alpha 掩码经 BOX 缩到格网，>70/255 算盖住） */
  var _bsrc = null;
  function bannerSrcCells() {
    if (_bsrc) return _bsrc;
    var b = execBanner(), blk = b.blk, bits = blk.bits, px = blk.px;
    var out = [], r, q, xx, yy;
    for (r = 0; r < ROWS; r++) {
      for (q = 0; q < COLS; q++) {
        var x0 = GX0 + q * CW, y0 = GY0 + r * CH, cnt = 0;
        for (yy = y0; yy < y0 + CH; yy++) {
          var Y = yy - b.by;
          if (Y < 0 || Y >= blk.h) continue;
          if ((Y % (2 * px)) === (2 * px - 1)) continue;            /* grid_mask 的横缝 -> 70 */
          for (xx = x0; xx < x0 + CW; xx++) {
            var X = xx - b.bx;
            if (X < 0 || X >= blk.w) continue;
            if ((X % px) === (px - 1)) continue;                     /* grid_mask 的竖缝 -> 0 */
            if (bits.get(Math.floor(X / px), Math.floor(Y / px))) cnt++;
          }
        }
        if (cnt / (CW * CH) > 70 / 255) out.push([q, r]);
      }
    }
    _bsrc = out;
    return out;
  }
  var _c78 = null;
  function c78plan() {
    if (_c78) return _c78;
    var Tt = C78.T, src = bannerSrcCells(), tg = ificanInfo().cells, n = tg.length;
    var use = {}, rng = PV.mt(78), cells = [], i, j;
    for (j = 0; j < n; j++) {
      var q = tg[j][0], r = tg[j][1], letter = tg[j][2], dst = cellXY(q, r);
      var best = null, bd = 1e18;
      for (i = 0; i < src.length; i++) {
        var sx = src[i][0], sy = src[i][1], p = cellXY(sx, sy), key0 = sx + ',' + sy;
        var dd = Math.hypot(p[0] - dst[0], (p[1] - dst[1]) * 0.8) + 26 * (use[key0] || 0);
        if (dd < bd) { bd = dd; best = [sx, sy]; }
      }
      var bk = best[0] + ',' + best[1];
      use[bk] = (use[bk] || 0) + 1;
      var td = Tt + C78.START + C78.SPAN * j / n + rng.random() * 0.02;
      cells.push({ q: q, r: r, letter: letter, src: cellXY(best[0], best[1]), dst: dst, td: td, tl: td + C78.FLY,
                   key: best });
    }
    var front = [];
    for (i = 0; i < cells.length; i++) front.push([cells[i].dst[0], cells[i].td]);
    front.sort(function (a, b) { return (a[0] - b[0]) || (a[1] - b[1]); });
    var sd = {};
    for (i = 0; i < cells.length; i++) {
      var k2 = cells[i].key[0] + ',' + cells[i].key[1];
      if (sd[k2] === undefined || cells[i].td < sd[k2]) sd[k2] = cells[i].td;
    }
    for (i = 0; i < src.length; i++) {
      var k3 = src[i][0] + ',' + src[i][1];
      if (sd[k3] === undefined) sd[k3] = frontT(front, cellXY(src[i][0], src[i][1])[0]) + 0.04;
    }
    _c78 = { cells: cells, front: front, sd: sd, src: src };
    return _c78;
  }
  function frontT(front, x) {   /* bisect_left(front, (x, -inf)) 的 td（Python C78.front_t） */
    var lo = 0, hi = front.length;
    while (lo < hi) { var mid = (lo + hi) >> 1; if (front[mid][0] < x) lo = mid + 1; else hi = mid; }
    if (lo > front.length - 1) lo = front.length - 1;
    return front[lo][1];
  }
  function litBanner(ctx, k) {
    if (k <= 0.01) return;
    var b = execBanner();
    ctx.save();
    ctx.globalAlpha = clamp01(k);
    ctx.drawImage(b.cv, b.bx, b.by);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.45 * clamp01(k);
    ctx.drawImage(b.cv, b.bx, b.by);                 /* brighten(sp, 0.45) */
    ctx.globalAlpha = 0.6 * clamp01(k);
    try { ctx.filter = 'blur(6px)'; ctx.drawImage(b.cv, b.bx, b.by); ctx.filter = 'none'; } catch (e) {}
    ctx.restore();
  }
  PV.addCut(C78.T, C78.pre, C78.post, function (ctx, t, cut) {
    var P = c78plan(), Tt = C78.T;
    var oc, og, nc, ng, pr;
    pr = pair(t); oc = pr[0]; og = pr[1]; nc = pr[2]; ng = pr[3];
    drawShot(og, 'shot_exec_hit', t);
    var landed = {};
    for (var i = 0; i < P.cells.length; i++) if (t >= P.cells[i].tl) landed[P.cells[i].q + ',' + P.cells[i].r] = 1;
    drawShot(ng, 'shot_red_if_i_can', t, { landed: function (q, r) { return landed[q + ',' + r] === 1; } });
    /* Python 的帧循环里 cut 一旦接管就再走不到 OWN 渲染器：执行 hit 的整幅红闪在窗口内不出现 */
    PV.p2cFlash = null;
    var lift = clamp01((t - (Tt - C78.pre)) / 0.08) * (1 - clamp01((t - (Tt + C78.START)) / 0.3));
    litBanner(og, lift);
    var sd = P.sd, front = P.front;
    revealC(ctx, t, oc, og, nc, ng, function (cx, cy) {
      var v = sd[Math.floor((cx - GX0) / CW) + ',' + Math.floor((cy - GY0) / CH)];
      if (v !== undefined) return v;
      return frontT(front, cx) + 0.06;
    }, { region: [20, 36, 1164, 612], cell: [8, 16], dur: 0.06 }, 78, 0.4, red);
    /* 在飞的格子：红块 + 字母，从旧格挪到新格 */
    for (i = 0; i < P.cells.length; i++) {
      var c = P.cells[i];
      if (!(t >= c.td && t < c.tl)) continue;
      var u = eIo((t - c.td) / C78.FLY), pos = lerpP(c.src, c.dst, u);
      T.fill(ctx, pos[0], pos[1] + 1, pos[0] + CW - 1, pos[1] + CH - 1, red(0.55), 1);
      textAt(ctx, c.letter, pos[0], pos[1], [255, 196, 186], 14, 1, 1, 0, 0, true);
    }
  });
  /* ================================================================ C79（164.0049）
     red_if_i_can -> execute_all。MORPH：她的红字形画像亮起、炸开，每个字形直飞到 13 个"她"身上的同一处：
     12 个样本格 + 她窗格里的舞者。字形进入目标时才变 DS 蓝；每个样本在字形落地处解码。 */
  var C79 = { T: 164.0049, pre: 0.33, post: 0.42, FLY: 0.34, LAND: 0.23 };
  var TILE_W = 186, TILE_H = 172;
  function tileOrigin(i) { return [414 + (i % 4) * TILE_W, 70 + Math.floor(i / 4) * TILE_H]; }
  function tileArt(i) { return PV.p2cTileArt ? PV.p2cTileArt(i) : null; }
  function tileArtXY(i) {
    var o = tileOrigin(i), a = tileArt(i), w = a ? a.w : 0, h = a ? a.h : 0;
    return [o[0] + Math.floor((TILE_W - 8 - w) / 2), o[1] + TILE_H - 10 - h];
  }
  /* 素材的有效像素框（PIL getbbox 的等价物：跳过 alpha<=100 的格子） */
  function artBBox(a, ax, ay) {
    if (!a) return [ax, ay, ax + 1, ay + 1];
    var q0 = a.cols, q1 = -1, r0 = a.rows, r1 = -1, q, r;
    for (r = 0; r < a.rows; r++) for (q = 0; q < a.cols; q++) {
      if (!a.alpha[r * a.cols + q]) continue;
      if (q < q0) q0 = q; if (q > q1) q1 = q;
      if (r < r0) r0 = r; if (r > r1) r1 = r;
    }
    if (q1 < 0) return [ax, ay, ax + a.w, ay + a.h];
    return [ax + q0 * a.px, ay + r0 * a.px, ax + (q1 + 1) * a.px, ay + (r1 + 1) * a.px];
  }
  var _port = null;
  function portraitCells() {
    if (_port) return _port;
    var G_COLS = Math.floor(ROWS * CH / CW), G_X = Math.floor((COLS - G_COLS) / 2);
    var g = PV.p2c.glyphGrid('starry', 'upper', G_COLS, ROWS), out = [], qq, r;
    for (r = 0; r < ROWS; r++) {
      var line = g ? g.lines[r] : '';
      for (qq = 0; qq < G_COLS; qq++) {
        var ch = line.charAt(qq);
        if (ch && ch !== ' ') out.push([G_X + qq, r, ch]);
      }
    }
    _port = out;
    return out;
  }
  /* 她在窗格里的位置：本移植没有她的立绘图层，用 Python her_bbox 的空框兜底值 */
  function herBBox(t) { return [60, 90, 350, 520]; }
  var _c79 = null;
  function c79plan() {
    if (_c79) return _c79;
    var Tt = C79.T, cells = portraitCells(), i, j;
    if (!cells.length) { _c79 = { parts: [], targets: [], land: {}, td: {} }; return _c79; }
    var q0 = 1e9, q1 = -1e9, r0 = 1e9, r1 = -1e9;
    for (i = 0; i < cells.length; i++) {
      if (cells[i][0] < q0) q0 = cells[i][0]; if (cells[i][0] > q1) q1 = cells[i][0];
      if (cells[i][1] < r0) r0 = cells[i][1]; if (cells[i][1] > r1) r1 = cells[i][1];
    }
    var targets = [herBBox(Tt + 0.45)];
    for (i = 0; i < 12; i++) {
      var xy = tileArtXY(i);
      targets.push(artBBox(tileArt(i), xy[0], xy[1]));
    }
    var rng = PV.mt(79);
    var split = q0 + 0.3 * (q1 - q0);
    function group(q, r) {
      if (q < split) return 0;
      var col = Math.min(3, Math.floor((q - split) / (q1 + 1 - split) * 4));
      var row = Math.min(2, Math.floor((r - r0) / (r1 + 1 - r0) * 3));
      return 1 + row * 4 + col;
    }
    var order = [], pieces = {};
    for (i = 0; i < cells.length; i++) {
      var k = group(cells[i][0], cells[i][1]);
      if (!pieces[k]) { pieces[k] = []; order.push(k); }
      pieces[k].push(cells[i]);
    }
    var groups = {};
    for (k = 0; k < 13; k++) {
      groups[k] = { bend: (k === 0 ? 0.0 : rng.random() * 0.3 - 0.15),
                    tl: Tt + C79.LAND + (k === 0 ? 0.0 : rng.random() * 0.07 - 0.035) };
    }
    var parts = [], land = {}, td = {};
    for (j = 0; j < order.length; j++) {
      k = order[j];
      var cs = pieces[k], pq0 = 1e9, pq1 = -1e9, pr0 = 1e9, pr1 = -1e9;
      for (i = 0; i < cs.length; i++) {
        if (cs[i][0] < pq0) pq0 = cs[i][0]; if (cs[i][0] > pq1) pq1 = cs[i][0];
        if (cs[i][1] < pr0) pr0 = cs[i][1]; if (cs[i][1] > pr1) pr1 = cs[i][1];
      }
      var tb = targets[k], x0 = tb[0], y0 = tb[1], x1 = tb[2], y1 = tb[3];
      for (i = 0; i < cs.length; i++) {
        var qq = cs[i][0], rr = cs[i][1], ch = cs[i][2];
        var uu = (qq - pq0) / Math.max(1, pq1 - pq0), vv = (rr - pr0) / Math.max(1, pr1 - pr0);
        var dst = [x0 + uu * (x1 - x0), y0 + vv * (y1 - y0)];
        var tl = groups[k].tl + rng.random() * 0.02 - 0.01;
        var p = { q: qq, r: rr, ch: ch, src: cellXY(qq, rr), dst: dst, k: k, td: tl - C79.FLY, tl: tl,
                  rect: tb, bend: groups[k].bend };
        parts.push(p);
        td[qq + ',' + rr] = p.td;
        land[k] = (land[k] === undefined ? tl : land[k] + tl);
      }
      if (cs.length) land[k] = land[k] / cs.length;
    }
    _c79 = { parts: parts, targets: targets, land: land, td: td };
    return _c79;
  }
  PV.addCut(C79.T, C79.pre, C79.post, function (ctx, t, cut) {
    var P = c79plan(), Tt = C79.T, pr = pair(t);
    var oc = pr[0], og = pr[1], nc = pr[2], ng = pr[3];
    var lift = clamp01((t - (Tt - C79.pre)) / 0.12);
    drawShot(og, 'shot_red_if_i_can', t, { burst: function (q, r) { return t >= (P.td[q + ',' + r] === undefined ? 1e9 : P.td[q + ',' + r]); },
                                           lift: lift });
    drawShot(ng, 'shot_execute_all', t);
    PV.p2cFlash = null;
    var targets = P.targets, land = P.land;
    var region = [20, 36, 1164, 612];
    revealC(ctx, t, oc, og, nc, ng, function (cx, cy) {
      for (var k = 1; k < 13; k++) {
        var tx = tileOrigin(k - 1)[0], ty = tileOrigin(k - 1)[1];
        if (tx <= cx && cx < tx + TILE_W && ty <= cy && cy < ty + TILE_H)
          return land[k] - 0.04 + 0.1 * clamp01((cy - ty) / TILE_H);
      }
      if (cx < 404) return land[0] - 0.05;
      return Tt - 0.12 + Math.hypot(cx - 588, cy - 330) / 1600.0;
    }, { region: region, cell: [8, 16], dur: 0.08 }, 79, 0.4, red);
    /* 在飞的字形：进入目标前偏红，进入后转 DS 蓝；落地后有 0.1s 淡出 */
    for (var i = 0; i < P.parts.length; i++) {
      var p = P.parts[i];
      if (t < p.td || t >= p.tl + 0.1) continue;
      var u = clamp01((t - p.td) / C79.FLY), e = eIo(u);
      var xy = bez(p.src, p.dst, p.bend, e);
      var inside = clamp01((e - 0.72) / 0.28);
      var col = lerpR(lerpR([255, 59, 48], [255, 205, 195], 0.3 * (1 - e)), T.ME_MID, inside);
      var a = t < p.tl ? 1.0 : 1 - (t - p.tl) / 0.1;
      textAt(ctx, p.ch, xy[0] - 3, xy[1] - 7, col, 14, 1, a, 0, 0, true);
    }
  });

  /* ================================================================ C80（166.0818）
     execute_all -> red_then_i_can。CARRY：被划掉的样本 #0000 亮起、离格，沿弧线飞进她、长大盖住她上半身；
     她在 'Then I can' 上重新渲染成红色输入，红色从她的窗格扩散到整个 UI。 */
  var C80 = { T: 166.0818, pre: 0.5, post: 0.62 };
  var _s0 = null;
  function sample0Sprite() {
    if (_s0) return _s0;
    var cv = PV.newCanvas(TILE_W - 7, TILE_H - 7), g = cv.getContext('2d');
    PV.p2cDrawTile(g, 0, true, 0, 0);
    _s0 = cv;
    return _s0;
  }
  function tintSprite(sp, col, k) {
    if (k <= 0.01) return sp;
    var cv = PV.newCanvas(sp.width, sp.height), g = cv.getContext('2d');
    g.drawImage(sp, 0, 0);
    g.globalCompositeOperation = 'source-atop';
    g.globalAlpha = clamp01(k);
    g.fillStyle = T.css(col, 1);
    g.fillRect(0, 0, sp.width, sp.height);
    return cv;
  }
  function placeSprite(ctx, sp, center, scale, alpha, halo) {
    if (alpha !== undefined && alpha <= 0.01) return;
    scale = scale === undefined ? 1 : scale;
    var w = sp.width * scale, h = sp.height * scale;
    ctx.save();
    if (alpha !== undefined && alpha < 0.999) ctx.globalAlpha = clamp01(alpha);
    if (halo && halo > 0.01) { ctx.shadowColor = T.css(T.ERR, 1); ctx.shadowBlur = 10 * halo; }
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(sp, Math.round(center[0] - w / 2), Math.round(center[1] - h / 2), Math.round(w), Math.round(h));
    ctx.restore();
  }
  PV.addCut(C80.T, C80.pre, C80.post, function (ctx, t, cut) {
    var Tt = C80.T, t_lift = Tt - 0.5, t_go = Tt - 0.4, t_land = Tt;
    var pr = pair(t), oc = pr[0], og = pr[1], nc = pr[2], ng = pr[3];
    drawShot(og, 'shot_execute_all', t, { gone0: t >= t_go });
    drawShot(ng, 'shot_red_then_i_can', t);
    PV.p2cFlash = null;
    revealC(ctx, t, oc, og, nc, ng, PV.radial(384, 330, Tt + 0.02, 1500.0),
            { region: PANE, cell: [8, 16], dur: 0.08 }, 80, 0.4, red);
    var sp = sample0Sprite(), o0 = tileOrigin(0);
    var home = [o0[0] + sp.width / 2, o0[1] + sp.height / 2];
    var bb = herBBox(Tt + 0.4), bw = bb[2] - bb[0];
    var scale_to = Math.min(bw * 0.95 / sp.width, (bb[3] - bb[1]) * 0.5 / sp.height);
    var dst = [(bb[0] + bb[2]) / 2, bb[1] + sp.height * scale_to / 2];
    if (t < t_go) {
      var k = clamp01((t - t_lift) / 0.1);
      placeSprite(ctx, tintSprite(sp, [235, 240, 255], 0.25 * k), home, 1, 1, 0.8 * k);
    } else if (t < t_land + 0.3) {
      var u = eIo((t - t_go) / (t_land - t_go));
      var pos = bez(home, dst, 0.3, u);
      var sc = lerp(1.0, scale_to, u);
      var s2 = tintSprite(sp, T.ERR, 0.55 * clamp01((u - 0.55) / 0.45));
      var a = t < t_land ? 1.0 : 1 - eIn((t - t_land) / 0.3);
      placeSprite(ctx, s2, pos, sc, a, t < t_land ? 0.6 : 0);
    }
  });

  /* ---------------- 她在窗格里的脸部（本移植没有她的立绘：用 her_bbox 的兜底框 + 头锚近似） ---------------- */
  function herAnchorHead(t) { var bb = herBBox(t); return [(bb[0] + bb[2]) / 2, bb[1] + 0.28 * (bb[3] - bb[1])]; }
  function eyeRect(t) {
    var bb = herBBox(t), h = herAnchorHead(t);
    var w = Math.max(112, Math.min(160, 0.45 * (bb[2] - bb[0])));
    return [h[0] - w / 2, h[1] - 8, h[0] + w / 2, h[1] + 10];
  }
  function drawEyeBar(ctx, r, level, alpha) {
    if (level <= 0.01 || (alpha !== undefined && alpha <= 0.01)) return;
    var cx = (r[0] + r[2]) / 2, hw = (r[2] - r[0]) / 2 * level;
    ctx.save();
    ctx.shadowColor = T.css(T.ERR, 1);
    ctx.shadowBlur = 8;
    T.fill(ctx, cx - hw, r[1], cx + hw, r[3], T.ERR, 0.5 * (alpha === undefined ? 1 : alpha));
    ctx.restore();
    T.fill(ctx, cx - hw, r[1], cx + hw, r[3], red(1.0), alpha);
    if (level > 0.75) {
      var a = (alpha === undefined ? 1 : alpha) * clamp01((level - 0.75) / 0.2);
      textAt(ctx, 'EXECUTE', cx - PV.p2c.monoW('EXECUTE', 14) / 2, r[1] + 1, T.BG, 14, 1, a, 0, 0, true);
    }
  }
  function quad(p0, c, p1, u) {
    var a = (1 - u) * (1 - u), b = 2 * (1 - u) * u, cc = u * u;
    return [a * p0[0] + b * c[0] + cc * p1[0], a * p0[1] + b * c[1] + cc * p1[1]];
  }
  function spriteCenter(s, x, y, size) { return [x + PV.p2c.monoW(s, size) / 2, y + size * 0.5]; }
  /* 以 center 为中心画一行等宽粗体（place(text_sprite) 的等价物） */
  function textCenter(ctx, s, center, size, col, scale, alpha, halo, lift) {
    scale = scale === undefined ? 1 : scale;
    var fs = size * scale, w = PV.p2c.monoW(s, size) * scale;
    textAt(ctx, s, center[0] - w / 2, center[1] - fs / 2, col, fs, 1, alpha, halo, lift, true);
  }

  /* ================================================================ C81（167.6972）
     red_then_i_can -> only_execution。UNFOLD：卷积读数亮起、飞到 'execution' 那个 logit 上并继续数到 1.000；
     logits 面板从那个值向外张开；她的感受野方块离开她的尾巴、横过她的眼睛长成 EXECUTE 条。 */
  var C81 = { T: 167.6972, pre: 0.3, post: 0.8, LAND: 0.23, GROW_EARLY: 0.05 };
  var C81_Y0 = null;
  function c81Readout() {
    if (C81_Y0 === null) {
      var q = PV.p2cConvState(C81.T - 0.1, C81.T - 0.1 - 166.0818, 167.6972 - 166.0818);
      C81_Y0 = q ? q.y : 0.03;
    }
    return C81_Y0;
  }
  function kernelBox(t) {
    var s = shotOf('shot_red_then_i_can');
    var a0 = s ? s.a : 166.0818, b0 = s ? s.b : 167.6972;
    var st = PV.p2cConvState(t, t - a0, b0 - a0);
    var bb = herBBox(t);
    var cw_ = (bb[2] - bb[0]) / st.mc, ch_ = (bb[3] - bb[1]) / st.mr;
    var x = bb[0] + (st.ki - 1) * cw_, y = bb[1] + (st.kj - 1) * ch_;
    return [[x, y, x + 3 * cw_, y + 3 * ch_], [bb[0], bb[2]]];
  }
  PV.addCut(C81.T, C81.pre, C81.post, function (ctx, t, cut) {
    var Tt = C81.T, t_lift = Tt - 0.3, t_go = Tt - 0.1, t_land = Tt + C81.LAND;
    var y0 = c81Readout(), pr = pair(t);
    var oc = pr[0], og = pr[1], nc = pr[2], ng = pr[3];
    drawShot(og, 'shot_red_then_i_can', t, { readout: t < t_go });
    drawShot(ng, 'shot_only_execution', t, { value: t >= t_land + 0.04, p0: y0, count_t0: C81.LAND });
    PV.p2cFlash = null;
    revealC(ctx, t, oc, og, nc, ng, PV.radial(1062, 124, t_land - 0.14, 1300.0),
            { region: PANE, cell: [8, 16], dur: 0.08 }, 81, 0.4, red);
    /* 读数 -> logit 的值 */
    var txt = PV.p2cReadoutText(y0), num = y0.toFixed(3);
    var RXY = PV.p2cReadoutXY, VXY = PV.p2cValueXY;
    var src_c = spriteCenter(txt, RXY[0], RXY[1], 22);
    var num_src = spriteCenter(num, RXY[0] + PV.p2c.monoW('  = ', 22), RXY[1], 22);
    var dst_c = spriteCenter(num, VXY[0], VXY[1], 20);
    if (t < t_go) {
      var k = clamp01((t - t_lift) / 0.1);
      textCenter(ctx, txt, src_c, 22, red(1.0), 1, 1, 0.8 * k, 0.3 * k);
    } else if (t < t_land + 0.05) {
      var u = eIo((t - t_go) / (t_land - t_go));
      var pos = bez(num_src, dst_c, -0.25, u);
      var sc = lerp(1.0, 20 / 22, u) * (1 + 0.25 * Math.sin(Math.PI * u));
      textCenter(ctx, num, pos, 22, red(1.0), sc, 1, 0.6 * (1 - u), 0);
    }
    /* 感受野 -> 眼睛条 */
    if (Tt - C81.GROW_EARLY <= t && t < t_land) {
      var uu = eIo((t - (Tt - C81.GROW_EARLY)) / (t_land - Tt + C81.GROW_EARLY));
      var kb = kernelBox(Tt - C81.GROW_EARLY)[0], er = eyeRect(t);
      var r = [lerp(kb[0], er[0], uu), lerp(kb[1], er[1], uu), lerp(kb[2], er[2], uu), lerp(kb[3], er[3], uu)];
      var fill = clamp01((uu - 0.3) / 0.5);
      if (fill > 0.01) T.fill(ctx, r[0], r[1], r[2], r[3], red(1.0), fill);
      T.rect(ctx, r[0], r[1], r[2], r[3], lerpR([255, 226, 214], red(1.0), uu), 1, 2);
    }
  });

  /* ================================================================ C82（169.5433）
     only_execution -> have_you_back。RETAIN：胜出的 'execution' 亮起、离开它的行，越过 bars 落到右下角的
     固定槽（带一点过冲）并锁在 'If I can have ...' 上；logits 从它离开的地方让位。 */
  var C82 = { T: 169.5433, pre: 0.32, post: 0.6, GO: -0.24, LAND: 0.07 };
  PV.addCut(C82.T, C82.pre, C82.post, function (ctx, t, cut) {
    var Tt = C82.T, t_lift = Tt - C82.pre, t_go = Tt + C82.GO, t_land = Tt + C82.LAND;
    var y0 = c81Readout(), pr = pair(t);
    var oc = pr[0], og = pr[1], nc = pr[2], ng = pr[3];
    drawShot(og, 'shot_only_execution', t, { exec_word: t < t_go, p0: y0, count_t0: 0.0 });
    drawShot(ng, 'shot_have_you_back', t, { chip: t >= t_land + 0.1 });
    PV.p2cFlash = null;
    revealC(ctx, t, oc, og, nc, ng, PV.radial(470, 124, Tt - 0.06, 1400.0),
            { region: PANE, cell: [8, 16], dur: 0.08 }, 82, 0.4, red);
    var word = 'execution';
    var src = spriteCenter(word, PV.p2cWordXY[0], PV.p2cWordXY[1], 22);
    var dst = spriteCenter(word, PV.p2cChipTextX(), PV.p2cChip[1] + 4, 16);
    if (t < t_go) {
      var k = clamp01((t - t_lift) / 0.08);
      textCenter(ctx, word, src, 22, red(1.0), 1, 1, 0.9 * k, 0.3 * k);
    } else if (t < t_land + 0.12) {
      var u = clamp01((t - t_go) / (t_land - t_go));
      var e = u < 1 ? eBack(u, 1.1) : 1.0;
      var pos = quad(src, [src[0] - 30, 560], dst, Math.min(1.0, eIo(u)));
      if (u >= 1) pos = dst;
      var sc = lerp(1.15, 16 / 22, clamp01(e));
      textCenter(ctx, word, pos, 22, red(1.0), sc, 1, 0.6 * (1 - clamp01(u)), 0);
      if (u >= 1) {
        var k2 = clamp01((t - t_land) / 0.1), CH = PV.p2cChip;
        T.rect(ctx, CH[0], CH[1], CH[2], CH[3], red(0.9), k2, 2);
      }
    }
  });

  /* ================================================================ C83（171.851）
     have_you_back -> run_again。CARRY：切前 0.4s 才解码完的 'you: not found' 亮起、升到窗格顶端留在那里
     当作 tool call 的第一行；它经过的地方 checkpoint 列表让位，tool call 在它下面打出来。 */
  var C83 = { T: 171.851, pre: 0.26, post: 0.5, GO: -0.08, LAND: 0.34 };
  PV.addCut(C83.T, C83.pre, C83.post, function (ctx, t, cut) {
    var Tt = C83.T, t_lift = Tt - C83.pre, t_go = Tt + C83.GO, t_land = Tt + C83.LAND;
    var pr = pair(t), oc = pr[0], og = pr[1], nc = pr[2], ng = pr[3];
    drawShot(og, 'shot_have_you_back', t, { not_found: false });
    drawShot(ng, 'shot_run_again', t, { not_found: t >= t_land });
    PV.p2cFlash = null;
    var y_from = PV.p2cNotFoundXY[1], y_to = 84;
    revealC(ctx, t, oc, og, nc, ng, function (cx, cy) { return t_go + Math.abs(cy - (y_from + 40)) / 800.0; },
            { region: PANE, cell: [8, 16], dur: 0.08 }, 83, 0.4, red);
    var u = t >= t_go ? eOut((t - t_go) / (t_land - t_go)) : 0.0;
    var y = lerp(y_from, y_to, u);
    var k = clamp01((t - t_lift) / 0.1) * (1 - clamp01((t - t_land) / 0.1));
    if (t < t_land) {
      ctx.save();
      if (k > 0.01) { ctx.shadowColor = T.css(T.ERR, 1); ctx.shadowBlur = 9 * 0.7 * k; }
      PV.p2c.head(ctx, PV.p2cNotFound, 430, y, red(1.0), 44, 'left', true);
      ctx.restore();
    }
  });

  /* ================================================================ C84（173.0049）
     run_again -> red_trapped。CARRY + SCAN：kv cache 从顶上按行分配（每帧一行）；
     'reason="have_you_back"' 变成字形飞出去、落在 'pinned: you' 标签的基线上并打出标签；
     EXECUTE 横幅碎成六块落进 cache 当六个 pinned 块（按填充到达各自行），由红转她的蓝。 */
  var C84 = { T: 173.0049, pre: 0.22, post: 1.2, GO: 0.1, LAND: 0.46, FILL: 456.0 };
  var _c84b = null;
  function c84Blocks() {
    if (_c84b) return _c84b;
    var Tt = C84.T;
    var blk = PV.p2c.bannerBlockTop(null, 'EXECUTE', 16, 9, T.ERR, 720);
    var xy = PV.p2cRunBannerXY(blk);
    var cv = PV.newCanvas(Math.max(1, blk.w), Math.max(1, blk.h)), g = cv.getContext('2d');
    PV.p2c.bannerBlockDraw(g, blk, 0, 0, T.ERR);
    var KV = PV.p2cKV, pinned = PV.p2cPinned;
    var order = pinned.slice().sort(function (a, b) { return PV.p2cKvCell(a[0], a[1])[0] - PV.p2cKvCell(b[0], b[1])[0]; });
    var out = [];
    for (var j = 0; j < order.length; j++) {
      var a = Math.round(j * blk.w / 6), b = Math.round((j + 1) * blk.w / 6);
      var cx = PV.p2cKvCell(order[j][0], order[j][1])[0], cy = PV.p2cKvCell(order[j][0], order[j][1])[1];
      var land = Math.max(Tt + 0.2, Tt + Math.max(0, cy - KV.oy) / C84.FILL + 0.02);
      out.push({ piece: [a, 0, b, blk.h], home: [xy[0] + (a + b) / 2, xy[1] + blk.h / 2],
                 dst: [cx + KV.cw / 2 - 1, cy + KV.ch / 2 - 1], cell: order[j], land: land, go: land - 0.34,
                 w: b - a, cv: cv });
    }
    _c84b = out;
    return out;
  }
  PV.addCut(C84.T, C84.pre, C84.post, function (ctx, t, cut) {
    var Tt = C84.T, t_lift = Tt - C84.pre, t_go = Tt + C84.GO, t_land = Tt + C84.LAND;
    var t_break = Tt - 0.12, KV = PV.p2cKV;
    var blocks = c84Blocks(), pinned = [], i;
    for (i = 0; i < blocks.length; i++) if (t >= blocks[i].land) pinned.push(blocks[i].cell);
    var pr = pair(t), oc = pr[0], og = pr[1], nc = pr[2], ng = pr[3];
    drawShot(og, 'shot_run_again', t, { reason: t < t_go, banner: t < t_break });
    drawShot(ng, 'shot_red_trapped', t, { pinned: pinned,
             label: t < t_land ? false : [(t - t_land), PV.p2cReason] });
    PV.p2cFlash = null;
    var lx = PV.p2cLabelXY[0], ly = PV.p2cLabelXY[1];
    revealC(ctx, t, oc, og, nc, ng, function (cx, cy) {
      if (ly - 4 <= cy && cy < ly + 22 && lx - 4 <= cx && cx < lx + 260) return t_land - 0.03;
      return Tt + Math.max(0, cy - KV.oy) / C84.FILL;
    }, { region: PANE, cell: [8, 16], dur: 0.05 }, 84, 0.4, red);
    /* reason 作为字形飞过去 */
    var rxy = PV.p2cReasonXY();
    var src = spriteCenter(PV.p2cReason, rxy[0], rxy[1], 20);
    var dst = spriteCenter(PV.p2cReason, PV.p2cLabelXY[0], PV.p2cLabelXY[1], 16);
    if (t < t_go) {
      var k = clamp01((t - t_lift) / 0.1);
      textCenter(ctx, PV.p2cReason, src, 20, red(0.95), 1, 1, 0.8 * k, 0.3 * k);
    } else if (t < t_land) {
      var u = eIo((t - t_go) / (t_land - t_go));
      var pos = bez(src, dst, -0.18, u);
      var sc = u > 0.5 ? lerp(1.2, 0.8, u) : lerp(1.0, 1.2, u * 2);
      textCenter(ctx, PV.p2cReason, pos, 20, red(1.0), sc, 1, 0.5 * (1 - u), 0);
    }
    /* EXECUTE 碎成六块 */
    if (t >= t_break) {
      for (i = 0; i < blocks.length; i++) {
        var b = blocks[i];
        if (t >= b.land + 0.12) continue;
        if (t < b.go) {
          var kk = clamp01((t - t_break) / 0.12);
          var jitter = 3 * kk * Math.sin(t * 60 + b.home[0]);
          ctx.save();
          ctx.globalAlpha = 1;
          ctx.drawImage(b.cv, b.piece[0], 0, b.w, b.cv.height,
                        Math.round(b.home[0] - b.w / 2 + jitter), Math.round(b.home[1] - b.cv.height / 2),
                        b.w, b.cv.height);   /* 必须 9 参：node-canvas 不支持 7 参形式 */
          ctx.restore();
        } else if (t < b.land) {
          var uu = eIn((t - b.go) / (b.land - b.go));
          var p = bez(b.home, b.dst, 0.2, uu);
          var s2 = lerp(1.0, 11 / b.w, uu);
          var w2 = Math.max(1, Math.round(b.w * s2)), h2 = Math.max(1, Math.round(b.cv.height * s2));
          ctx.save();
          ctx.imageSmoothingEnabled = true;
          ctx.drawImage(b.cv, b.piece[0], 0, b.w, b.cv.height,
                        Math.round(p[0] - w2 / 2), Math.round(p[1] - h2 / 2), w2, h2);
          if (uu > 0.5) {   /* brighten -> blue */
            ctx.globalCompositeOperation = 'source-atop';
            ctx.globalAlpha = clamp01((uu - 0.5) / 0.5);
            ctx.fillStyle = T.css(T.ME_MID, 1);
            ctx.fillRect(Math.round(p[0] - w2 / 2), Math.round(p[1] - h2 / 2), w2, h2);
          }
          ctx.restore();
        } else {
          var k3 = 1 - clamp01((t - b.land) / 0.12);
          var cxy = PV.p2cKvCell(b.cell[0], b.cell[1]);
          T.rect(ctx, cxy[0] - 2, cxy[1] - 2, cxy[0] + KV.cw, cxy[1] + KV.ch, [220, 230, 255], k3, 2);
        }
      }
    }
  });

})();
