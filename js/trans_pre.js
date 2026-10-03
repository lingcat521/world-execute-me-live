/* trans_pre.js —— 01 PRETRAIN 段的转场：continuity_full_v2/cuts.py 的 C11 / C12 / C13 的 1:1 移植。
   参考成片（video1.mp4）的转场权威是 continuity_full_v2（v2.py 的 CUT_CLASSES + 各 s_*.py 的 CUTS），
   不是 full/engine.py 的 direction.CHOREO/glide 体系（那套只有 continuity_full_v1 用，参考里不存在）。
   实测：T=56.697 / 60.620 这类 v2 没登记 Cut 的切点，参考是硬切（切点前 motREF≈0.6–1.5 的 idle），
   而 full/ 的 pan/glide 会提前 0.3s 起运动——所以不能照 full/ 接。

   本文件自包含：
     * PV.trReveal / PV.trRevealCanvas —— kit.reveal 的忠实语义（逐格**硬切换** + 切换中的解码字形；
       不是 cuts.js 里那个"逐格交叉淡入"，参考里从来不会把两张画面按 alpha 叠在一起）。
     * C11(26.466) / C12(29.236) / C13(30.851) —— 移植后按 T 顶掉 cuts.js 里的旧实现（旧体系本身保留）。
   关掉本文件：在 index.html 里去掉 <script src="js/trans_pre.js"> 即可（或 PV.TR_PRE_OFF=1）。 */
(function () {
  'use strict';
  var PV = window.PV, T = PV.tui;
  var W = 1280, H = 720, FPS = 24;
  var PANE = [405, 44, 1164, 604];                      /* kit.PANE */
  var GLYPHS = '01<>/\\|=+*#%$?!:;{}[]~^';              /* kit.GLYPHS */
  if (PV.TR_PRE_OFF) return;

  /* ---------------------------------------------------------------- kit 的小工具 */
  PV.trBezier = function (p0, p1, bend, u) {             /* kit.bezier：bend>0 向行进方向左侧鼓 */
    var mx = (p0[0] + p1[0]) / 2, my = (p0[1] + p1[1]) / 2;
    var dx = p1[0] - p0[0], dy = p1[1] - p0[1];
    var cx = mx + dy * bend, cy = my - dx * bend;
    var a = (1 - u) * (1 - u), b = 2 * (1 - u) * u, c = u * u;
    return [a * p0[0] + b * cx + c * p1[0], a * p0[1] + b * cy + c * p1[1]];
  };
  PV.trRadial = function (sx, sy, t0, speed) {
    return function (x, y) { return t0 + Math.hypot(x - sx, y - sy) / speed; };
  };
  PV.trInward = function (sx, sy, t0, t1, reach) {
    reach = reach || 900;
    return function (x, y) { return t1 - (t1 - t0) * Math.min(1, Math.hypot(x - sx, y - sy) / reach); };
  };
  PV.trSweep = function (origin, dir, t0, speed) {
    var n = Math.hypot(dir[0], dir[1]) || 1, dx = dir[0] / n, dy = dir[1] / n;
    return function (x, y) { return t0 + Math.max(0, (x - origin[0]) * dx + (y - origin[1]) * dy) / speed; };
  };

  /* ---------------------------------------------------------------- kit.reveal */
  /* 逐格从 old 硬切到 new；正在切换的那一格显示一个解码字形（只在格子里有墨时）。
     和 cuts.js 的 PV.reveal 的区别：**不做 alpha 混合**，格子要么是旧画面要么是新画面。 */
  var _buf = {};
  function buf1280(k) {
    if (!_buf[k]) _buf[k] = PV.newCanvas(W, H);
    return _buf[k];
  }
  function inkSmall(src, cols, rows) {
    var c = PV.newCanvas(cols, rows), g = c.getContext('2d');
    g.imageSmoothingEnabled = true;
    g.drawImage(src, 0, 0, W, H, 0, 0, cols, rows);
    return g.getImageData(0, 0, cols, rows).data;
  }
  PV.trRevealCanvas = function (ctx, t, oc, nc, delayFn, opts) {
    opts = opts || {};
    var R = opts.region || PANE;
    var cell = opts.cell || [8, 16];
    var dur = opts.dur === undefined ? 0.09 : opts.dur;
    var seed = opts.seed || 0;
    var density = opts.density === undefined ? 0.4 : opts.density;
    var front = opts.front === undefined ? true : opts.front;
    var cw = cell[0], ch = cell[1];
    var x0 = R[0], y0 = R[1];
    var cols = Math.max(1, Math.floor((R[2] - R[0]) / cw)), rows = Math.max(1, Math.floor((R[3] - R[1]) / ch));
    var rw = cols * cw, rh = rows * ch;
    var q, r, ps = [], p = new Float32Array(cols * rows), any = 0;
    for (r = 0; r < rows; r++) {
      for (q = 0; q < cols; q++) {
        var cx = x0 + q * cw + cw / 2, cy = y0 + r * ch + ch / 2;
        var v = T.clamp01((t - delayFn(cx, cy)) / dur);
        p[r * cols + q] = v;
        if (v > 0.02) any = 1;
        if (v > 0.02 && v < 0.98) ps.push(q, r, v);
      }
    }
    ctx.drawImage(oc, 0, 0);
    if (!any) return;
    if (opts.crossfade) {                               /* kit.py:364-378：mask=int(255*p) -> 逐格**线性混合** */
      for (r = 0; r < rows; r++) for (q = 0; q < cols; q++) {
        var pc = p[r * cols + q];
        if (pc <= 0.02) continue;
        ctx.save();
        ctx.globalAlpha = pc;
        ctx.drawImage(nc, x0 + q * cw, y0 + r * ch, cw, ch, x0 + q * cw, y0 + r * ch, cw, ch);
        ctx.restore();
      }
      if (!ps.length || !front) return;
      var bgc0 = buf1280('bgr'), bg0 = PV.newCanvas(cols, rows).getContext('2d');
      if (PV.drawBackground) PV.drawBackground(bgc0.getContext('2d'), t);
      var ib0 = inkSmall(bgc0, cols, rows), io0 = inkSmall(oc, cols, rows), in0 = inkSmall(nc, cols, rows);
      var rng0 = PV.mt(seed * 9973 + Math.floor(t * FPS));
      ctx.save();
      for (var i2 = 0; i2 < ps.length; i2 += 3) {
        var q2 = ps[i2], r2 = ps[i2 + 1], k2p = ps[i2 + 2];
        var chg = rng0.choice(GLYPHS);
        var kk4 = (r2 * cols + q2) * 4;
        var j0 = Math.max(Math.abs(io0[kk4] - ib0[kk4]), Math.abs(io0[kk4 + 1] - ib0[kk4 + 1]), Math.abs(io0[kk4 + 2] - ib0[kk4 + 2]));
        var j1 = Math.max(Math.abs(in0[kk4] - ib0[kk4]), Math.abs(in0[kk4 + 1] - ib0[kk4 + 1]), Math.abs(in0[kk4 + 2] - ib0[kk4 + 2]));
        if ((j0 < 6 && j1 < 6) || rng0.random() > density) continue;
        var kk5 = 1 - Math.abs(2 * k2p - 1);
        T.textMono(ctx, chg, x0 + q2 * cw, y0 + r2 * ch + 1, T.css(T.mix(T.ME_TEXT, 0.2 + 0.6 * kk5)), 13);
      }
      ctx.restore();
      return;
    }
    for (r = 0; r < rows; r++) {                        /* 每行按连续段贴新画面（整格硬切换） */
      var run = -1;
      for (q = 0; q <= cols; q++) {
        var on = q < cols && p[r * cols + q] > 0.02;
        if (on && run < 0) run = q;
        else if (!on && run >= 0) {
          ctx.drawImage(nc, x0 + run * cw, y0 + r * ch, (q - run) * cw, ch,
                        x0 + run * cw, y0 + r * ch, (q - run) * cw, ch);
          run = -1;
        }
      }
    }
    if (!ps.length || !front) return;
    var bgc = buf1280('bgr'), bg = PV.newCanvas(cols, rows).getContext('2d');
    if (PV.drawBackground) PV.drawBackground(bgc.getContext('2d'), t);
    var ib = inkSmall(bgc, cols, rows), io = inkSmall(oc, cols, rows), inw = inkSmall(nc, cols, rows);
    var rng = PV.mt(seed * 9973 + Math.floor(t * FPS));   /* kit.reveal: random.Random(seed*9973 + int(t*FPS)) */
    ctx.save();
    for (var i = 0; i < ps.length; i += 3) {
      q = ps[i]; r = ps[i + 1];
      var pv = ps[i + 2];
      var ch_ = rng.choice(GLYPHS);                       /* 注意：choice 一定先调，和 Python 的求值顺序一致 */
      var k = (r * cols + q) * 4;
      var i0 = Math.max(Math.abs(io[k] - ib[k]), Math.abs(io[k + 1] - ib[k + 1]), Math.abs(io[k + 2] - ib[k + 2]));
      var i1 = Math.max(Math.abs(inw[k] - ib[k]), Math.abs(inw[k + 1] - ib[k + 1]), Math.abs(inw[k + 2] - ib[k + 2]));
      if ((i0 < 6 && i1 < 6) || rng.random() > density) continue;
      var kk = 1 - Math.abs(2 * pv - 1);                  /* 0 -> 1 -> 0 */
      T.textMono(ctx, ch_, x0 + q * cw, y0 + r * ch + 1, T.css(T.mix(T.ME_TEXT, 0.2 + 0.6 * kk)), 13);
    }
    ctx.restore();
  };
  PV.trReveal = function (ctx, t, oldDraw, newDraw, delayFn, opts) {
    var oc = buf1280('oc'), nc = buf1280('nc');
    var g1 = oc.getContext('2d'), g2 = nc.getContext('2d');
    if (PV.drawBackground) { PV.drawBackground(g1, t); PV.drawBackground(g2, t); }
    oldDraw(g1, t); newDraw(g2, t);
    PV.trRevealCanvas(ctx, t, oc, nc, delayFn, opts);
  };

  /* ---------------------------------------------------------------- C11  dualpipe -> whale
     cuts.py: class C11, pre/post = 0.30/0.42, FLY = 0.42
     "Rank by rank, the pipeline's cells lift off as letters and swim to their places in the whale." */
  var C11_T = 26.466, C11_A = 23.236, C11_AEND = 26.466, C11_B = 29.236, C11_FLY = 0.42, LAND10 = 0.42;
  function c11Depart(r) { return C11_T - 0.3 + r * 0.03; }

  /* ---------------------------------------------------------------- C12  whale -> points
     cuts.py: class C12, pre/post = 0.22/0.50 */
  var C12_T = 29.236, C12_A = 26.466, C12_B = 30.851;
  /* cuts.py:313-319: ua(tt) = (tt - a.start)/(a.end - a.start), a = the OUTGOING shot_whale(26.466..29.236)
     -> denominator 2.77 (u=1.0 at T). We used the incoming end C12_B=30.851 -> u=0.632 at T,
     so whale_glyphs x = 588-u*148 started the point cloud ~54.5px too far right (C12 src = its start). */
  function c12U(tt) { return T.clamp01((tt - C12_A) / (C12_T - C12_A)); }

  /* ---------------------------------------------------------------- C13  points -> dimension
     cuts.py: class C13,  pre/post = 0.35/0.75
     "The points, gathered into her shape, lift and fly left along an arc into her pane, landing on her own
      glyph cells; she flares as she takes them in. Her vector then streams out to the right." */
  var C13_T = 30.851, C13_A = 29.236, C13_B = 30.851, C13_END = 32.928, C13_PRE = 0.35;

  /* 同 T 的旧实现让位（旧 cuts.js 体系本身保留） */
  var MINE = [C11_T, C12_T, C13_T];
  for (var _i = PV.CUTS.length - 1; _i >= 0; _i--) {
    for (var _k = 0; _k < MINE.length; _k++) {
      if (Math.abs(PV.CUTS[_i].T - MINE[_k]) < 1e-6) { PV.CUTS.splice(_i, 1); break; }
    }
  }

  PV.addCut(C11_T, 0.30, 0.42, function (ctx, t, cut) {
    var gone = function (r, s) { return T.clamp01((t - c11Depart(r)) / 0.06); };
    var lastLand = c11Depart(7) + C11_FLY + 0.03;      /* = T + 0.36 */
    var cells = PV.pipeCells(t - C11_A, C11_AEND - C11_A, LAND10)[0];   /* v2: pipe_cells(t-a.start, a.end-a.start, C10.LAND) */
    PV.trReveal(ctx, t,
      function (c) {
        /* v2 的 body(self.a, t, n)：dualpipe 自己的钟晚 LAND(0.42)，dur 相应缩短 */
        PV.shotDualPipe(c, t, Math.max(0, t - C11_A - LAND10), (C11_AEND - C11_A) - LAND10,
                        { gone: gone, notes: true });
      },
      function (c) {
        var lt = Math.max(0, t - C11_T), u = T.clamp01((t - C11_T) / (C11_B - C11_T));
        PV.shotWhale(c, t, lt, u, t >= lastLand ? 1 : 0);
      },
      PV.trRadial(820, 300, C11_T - 0.12, 1500), { seed: 11 });
    if (t < lastLand && cells.length) {
      var glyphs = PV.whaleGlyphs(Math.max(t, C11_T), t >= C11_T ? T.clamp01((t - C11_T) / (C11_B - C11_T)) : 0);
      if (!glyphs.length) return;
      var cs = cells.slice().sort(function (a, b) { return (a[3] - b[3]) || (a[2] - b[2]); });
      var order = [], k;
      for (k = 0; k < glyphs.length; k++) order.push(k);
      order.sort(function (a, b) { return (glyphs[a][1] - glyphs[b][1]) || (glyphs[a][0] - glyphs[b][0]); });
      for (var rk = 0; rk < order.length; rk++) {
        var gi = order[rk];
        var cell = cs[Math.floor(rk * cs.length / glyphs.length)];
        if (!cell) continue;
        var rank = cell[0], cx = cell[2], cy = cell[3], kind = cell[4];
        var td = c11Depart(rank) + (gi % 3) * 0.01;
        var uu = T.clamp01((t - td) / C11_FLY);
        if (uu <= 0) continue;
        var gx = glyphs[gi][0], gy = glyphs[gi][1], letter = glyphs[gi][2];
        var pp = PV.trBezier([cx + 6 + (gi % 3) * 5, cy + 10 + (gi % 2) * 12], [gx, gy],
                             (rank % 2) ? 0.18 : -0.18, T.ease_io(uu));
        if (uu < 0.55) {
          var col = kind === 'F' ? T.amb(0.9) : (kind !== 'W' ? T.mix(T.ME_TEXT, 0.8) : T.amb(0.7));
          T.textMono(ctx, kind.charAt(0), pp[0], pp[1], T.css(col), 11);
        } else {
          T.textMono(ctx, letter, pp[0], pp[1], T.css(T.mix(T.ME_TEXT, 0.95)), 15);
        }
      }
    }
  });

  PV.addCut(C12_T, 0.22, 0.50, function (ctx, t, cut) {
    var g0 = PV.whaleGlyphs(C12_T, c12U(C12_T)), src = [];
    for (var i = 0; i < g0.length; i++) src.push([g0[i][0] + 4, g0[i][1] + 8]);
    function blend(i) { return T.ease_io((t - C12_T - 0.03 * ((i * 13) % 7) / 7) / 0.42); }
    PV.trReveal(ctx, t,
      function (c) { PV.shotWhale(c, t, Math.max(0, t - C12_A), c12U(t), 0); },
      function (c) {
        var tt = Math.max(t, C12_T), lt = Math.max(0, tt - C12_B);
        var hook = { points: t >= C12_T };
        if (t >= C12_T) hook.from = [src, blend];
        PV.shotPoints(c, tt, lt, T.clamp01(lt / (C12_B - C12_A)), C12_B - C12_A, hook);
      },
      PV.trRadial(720, 290, C12_T - 0.02, 3000), { seed: 12 });
    if (t < C12_T + 0.05) {                       /* 载体：字形缩成点，字母淡出 */
      var k = T.clamp01((t - (C12_T - 0.22)) / 0.22);
      var gs = PV.whaleGlyphs(Math.min(t, C12_T), c12U(Math.min(t, C12_T)));
      for (var j = 0; j < gs.length; j++) {
        if (k < 0.9) T.textMono(ctx, gs[j][2], gs[j][0], gs[j][1], T.css(T.mix(T.ME_TEXT, 0.95 * (1 - k))), 15);
        var rr = 1 + 0.5 * k;
        T.fill(ctx, gs[j][0] + 4 - rr, gs[j][1] + 8 - rr, gs[j][0] + 5 + rr, gs[j][1] + 9 + rr,
               T.mix(T.ME_TEXT, 1.0), k);
      }
    }
  });

  /* 她窗格里的字形格（v2 C13.targets：她的 alpha>60 的 2px 网格，random.Random(13) 洗牌）。
     立绘不在仓库里，用 avatars/complete.png 近似，拿不到时退回一个人形轮廓。 */
  var TG = null, HER_IMG = null;
  PV.loadImage('avatars/complete.png', function (im) { HER_IMG = im; });
  function herTargets() {
    if (TG) return TG;
    var x0 = 24, y0 = 56, x1 = 384, y1 = 604, cells = [], x, y;
    var w = x1 - x0 - 8, h = y1 - y0 - 94;
    if (HER_IMG) {
      var m = PV.newCanvas(120, 120), g = m.getContext('2d');
      g.drawImage(HER_IMG, 0, 0, 120, 120);
      var d = g.getImageData(0, 0, 120, 120).data;
      for (x = 4; x < w; x += 2) {
        for (y = 14; y < h; y += 2) {
          var sx = Math.floor((x - 4) / w * 120), sy = Math.floor((y - 14) / h * 120), i4 = (sy * 120 + sx) * 4;
          if (d[i4 + 3] > 60 && (0.299 * d[i4] + 0.587 * d[i4 + 1] + 0.114 * d[i4 + 2]) > 26) cells.push([x0 + x, y0 + y]);
        }
      }
    }
    if (cells.length < 40) {
      cells = [];
      var cx = (x0 + x1) / 2, cy = (y0 + y1) / 2 + 30;
      for (var q = -46; q <= 46; q += 2) {
        for (var p = -130; p <= 150; p += 2) {
          var pp2 = (p + 130) / 280;
          if (Math.abs(q) / 46 < (pp2 < 0.3 ? 0.6 : 1 - 0.28 * pp2)) cells.push([cx + q, cy + p]);
        }
      }
    }
    var rng = PV.mt(13);                          /* CPython random.shuffle 的顺序 */
    for (var kk = cells.length - 1; kk > 0; kk--) {
      var jj = rng.randrange(kk + 1), tmp = cells[kk]; cells[kk] = cells[jj]; cells[jj] = tmp;
    }
    TG = cells; return cells;
  }

  /* 离屏画布池：浏览器里每帧 new 4 张 1280x720 会造成明显的 GC 抖动，这里复用 */
  var _tp = {};
  function tmpCanvas(k) { if (!_tp[k]) _tp[k] = PV.newCanvas(W, H); return _tp[k]; }
  PV.addCut(C13_T, C13_PRE, 0.75, function (ctx, t, cut) {
    var durA = C13_B - C13_A;
    function oldBody(c, hook) { PV.shotPoints(c, t, Math.max(0, t - C13_A), T.clamp01((t - C13_A) / durA), durA, hook); }
    var oc = tmpCanvas('a'), og = oc.getContext('2d');
    var bare = tmpCanvas('b'), bg2 = bare.getContext('2d');
    if (PV.drawBackground) { PV.drawBackground(og, t); PV.drawBackground(bg2, t); }
    oldBody(og, { points: false });
    oldBody(bg2, { points: false, labels: false });
    var mid = tmpCanvas('c'), mg = mid.getContext('2d');
    if (PV.drawBackground) PV.drawBackground(mg, t);
    PV.trRevealCanvas(mg, t, oc, bare, PV.trRadial(840, 170, C13_T - 0.12, 900), { seed: 113 });  /* 旧标签先走 */
    var nc = tmpCanvas('d'), ng = nc.getContext('2d');
    if (PV.drawBackground) PV.drawBackground(ng, t);
    var tt = Math.max(t, C13_B);
    /* 新镜头走本移植版分派器的时钟语义（含 shot_dimension 自带的 0.4s 延迟），它的 u 是标定过参考帧的 */
    var dly = (PV.SHOT_DELAY && PV.SHOT_DELAY['shot_dimension']) || 0;
    var a2 = Math.min(tt, C13_B + dly), lt2 = Math.max(0, tt - a2), d2 = C13_END - a2;
    PV.shotDimension(ng, tt, lt2, d2 > 0 ? T.clamp01(lt2 / d2) : 0);
    PV.trRevealCanvas(ctx, t, mid, nc, PV.trSweep([404, 0], [1, 0], C13_T + 0.2, 1400), { seed: 13 });
    /* 载体：每个点沿弧飞进她的窗格，落在她的字形格上 */
    var tg = herTargets();
    if (!tg.length) return;
    var lift = T.clamp01((t - (C13_T - C13_PRE)) / C13_PRE);
    var tp = Math.min(t, C13_T);
    var pts = PV.pointsPos(tp, T.clamp01((tp - C13_A) / durA));
    for (var i = 0; i < pts.length; i++) {
      var x = pts[i][0], y = pts[i][1], col = pts[i][2];
      var td = C13_T - 0.12 + 0.3 * T.clamp01((x - 440) / 260);
      var uu = T.clamp01((t - td) / 0.42);
      if (uu >= 1 && t > td + 0.5) continue;
      var p3 = PV.trBezier([x, y], tg[i % tg.length], -0.28, T.ease_io(uu));
      var k2 = 0.5 * lift * (1 - uu);
      var c3 = [col[0] + (200 - col[0]) * k2, col[1] + (214 - col[1]) * k2, col[2] + (255 - col[2]) * k2];
      var al = uu < 1 ? 1 : 1 - (t - td - 0.42) / 0.08;
      T.fill(ctx, p3[0], p3[1], p3[0] + 3, p3[1] + 3, c3, T.clamp01(al));   /* PIL 的 rectangle 含两端点 = 3x3，和 shotPoints 一致 */
    }
    /* 她被"喂"进去时的一下亮（v2 的 Frame(..., glow)；她没有独立图层，近似成窗格上的一层微光） */
    var glow = Math.max(0, 1 - Math.abs(t - (C13_T + 0.42)) / 0.3) * 0.7;
    if (glow > 0.01) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.16 * glow;
      var gr = ctx.createRadialGradient(204, 330, 10, 204, 330, 250);
      gr.addColorStop(0, 'rgb(120,148,255)');
      gr.addColorStop(1, 'rgba(120,148,255,0)');
      ctx.fillStyle = gr;
      ctx.fillRect(24, 56, 360, 548);
      ctx.restore();
    }
  });
})();

/* ---------------------------------------------------------------- C10  losscurve -> dualpipe
   cuts.py: class C10, pre/post = 0.35/0.60, LAND = 0.42
   "The endpoint grows and runs back along the curve, eating it, to the origin; there it hops into the first cell of
    pipeline rank 0, and the schedule unrolls from that cell."
   旧实现（cuts.js）把 PV.shotTime() 的第二个返回值（u）当成 dur 传给了 shotDualPipe，
   于是 head=(lt-delay)/0.3*31 —— 23.767 时画了 ~11 列（参考只有 1 列）。这里按分派器的时钟重算。 */
(function () {
  'use strict';
  var PV = window.PV, T = PV.tui;
  var C10_T = 23.236, C10_A = 19.700, C10_AEND = 23.236, C10_BEND = 26.466, LAND = 0.42;
  for (var i = PV.CUTS.length - 1; i >= 0; i--) if (Math.abs(PV.CUTS[i].T - C10_T) < 1e-6) PV.CUTS.splice(i, 1);
  PV.addCut(C10_T, 0.35, 0.60, function (ctx, t, cut) {
    var t1 = C10_T - 0.1, t2 = C10_T + 0.3;
    var prog = Math.max(0.02, T.clamp01(1 - T.ease_io((t - t1) / (t2 - t1))));
    var dly = (PV.SHOT_DELAY && PV.SHOT_DELAY['shot_dualpipe']) || 0;
    PV.trReveal(ctx, t,
      function (c) {
        var lt = t - C10_A, u = (t - C10_A) / (C10_AEND - C10_A);
        if (t < t1) PV.shotLossCurve(c, t, lt, u);                       /* 还没开始回卷：正常画（带 label） */
        else PV.shotLossCurve(c, t, lt, u, null, prog);                  /* 回卷中：progress 由 cut 给，label 关掉 */
      },
      function (c) {
        var tt = Math.max(t, C10_T);
        var a2 = Math.min(tt, C10_T + dly), lt2 = Math.max(0, tt - a2);
        PV.shotDualPipe(c, tt, lt2, C10_BEND - a2);                      /* 分派器的时钟：lt 已含 0.42 延迟 */
      },
      PV.trInward(440, 80, C10_T - 0.15, C10_T + 0.32, 760), { seed: 10 });
    var ep = PV.lossEndPoint(prog, 440, 80, 690, 240, 5, 5);
    var grow = T.clamp01((t - (C10_T - 0.35)) / 0.2);
    if (t < t2) {
      var rad = 1.5 + 4.5 * grow;
      T.fill(ctx, ep[0] - rad, ep[1] - rad, ep[0] + rad + 1, ep[1] + rad + 1, T.mix(T.ME_TEXT, 1.0), grow);
      var k = T.clamp01((t - t1) / (t2 - t1));
      var la = 1 - T.ease_in(k);
      if (la > 0.01) {
        T.textMono(ctx, 'loss ' + PV.lossFn(Math.min(1, prog)).toFixed(3), ep[0] - 80 + 60 * k, ep[1] - 26,
                   T.ui(la), 16);
      }
    } else {
      var u2 = T.clamp01((t - t2) / (C10_T + LAND - t2));
      var e = T.ease_back(u2);
      var cx0 = PV.PIPE.ox + (PV.PIPE.cw - 3) / 2, cy0 = PV.PIPE.oy + (PV.PIPE.ch - 6) / 2;
      var cx = 440 + (cx0 - 440) * e, cy = 80 + (cy0 - 80) * e;
      var w = 12 + ((PV.PIPE.cw - 3) - 12) * T.ease_io(u2), hh = 12 + ((PV.PIPE.ch - 6) - 12) * T.ease_io(u2);
      if (t < C10_T + LAND + 0.05) {
        T.fill(ctx, cx - w / 2, cy - hh / 2, cx + w / 2 + 1, cy + hh / 2 + 1,
               u2 < 0.5 ? T.mix(T.ME_TEXT, 1.0) : T.mix(T.ANOM, 0.75 + 0.25 * (1 - u2)), 1);
        if (u2 > 0.6) T.textMono(ctx, 'F', cx - w / 2 + 7, cy - hh / 2 + 13, T.css(T.BG), 11);
      }
    }
  });
})();
