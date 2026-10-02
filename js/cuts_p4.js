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
})();
