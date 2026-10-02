/* cuts.js —— 转场框架。每个 Cut 是一个围绕其时间 T 的窗口：窗口内由 cut 自己画，窗口外走普通镜头。
   对应 continuity_full_v2/cuts.py 的 Cut / reveal / radial / inward。 */
(function () {
  'use strict';
  var PV = window.PV, T = PV.tui;
  var W = 1280, H = 720;
  PV.CUTS = [];
  PV.addCut = function (t0, pre, post, fn) {
    PV.CUTS.push({ T: t0, pre: pre, post: post, fn: fn });
    PV.CUTS.sort(function (a, b) { return a.T - b.T; });
  };
  PV.activeCut = function (t) {
    for (var i = 0; i < PV.CUTS.length; i++) {
      var c = PV.CUTS[i];
      if (t >= c.T - c.pre && t < c.T + c.post) return c;
    }
    return null;
  };
  PV.easeIn = function (u) { u = T.clamp01(u); return u * u * u; };
  PV.radial = function (sx, sy, t0, speed) {
    return function (x, y) { return t0 + Math.hypot(x - sx, y - sy) / speed; };
  };
  PV.inward = function (sx, sy, t0, t1, reach) {
    reach = reach || 900;
    return function (x, y) { return t1 - (t1 - t0) * Math.min(1, Math.hypot(x - sx, y - sy) / reach); };
  };
  /* 逐格切换：region 切成 cell 大小的格，每格按 delay(cx,cy) 决定何时从 old 翻到 new。 */
  PV.reveal = function (ctx, t, oldDraw, newDraw, delayFn, opts) {
    opts = opts || {};
    var R = opts.region || [405, 44, 1164, 604];
    var cell = opts.cell || [8, 16];
    var dur = opts.dur === undefined ? 0.09 : opts.dur;
    var cw = cell[0], ch = cell[1];
    var x0 = R[0], y0 = R[1];
    var cols = Math.floor((R[2] - R[0]) / cw), rows = Math.floor((R[3] - R[1]) / ch);
    var oc = PV.newCanvas(W, H), nc = PV.newCanvas(W, H);
    var octx = oc.getContext('2d'), nctx = nc.getContext('2d');
    /* 两张画布都先铺满背景（不透明），否则新画面画布大片透明、
       逐格贴上去时旧画面会从透明处透出来——逐格替换等于失效。 */
    if (PV.drawBackground) { PV.drawBackground(octx, t); PV.drawBackground(nctx, t); }
    oldDraw(octx, t);
    newDraw(nctx, t);
    ctx.drawImage(oc, 0, 0);
    for (var r = 0; r < rows; r++) {
      var cy = y0 + r * ch + ch / 2;
      for (var q = 0; q < cols; q++) {
        var cx = x0 + q * cw + cw / 2;
        var p = T.clamp01((t - delayFn(cx, cy)) / dur);
        if (p <= 0.02) continue;
        var sx = x0 + q * cw, sy = y0 + r * ch;
        ctx.save();
        ctx.globalAlpha = p;                 /* 逐格交叉淡入，p=1 时完全盖住旧画面 */
        ctx.drawImage(nc, sx, sy, cw, ch, sx, sy, cw, ch);
        ctx.restore();
      }
    }
  };
})();

/* ---- C09：corpus -> losscurve。语料词加速吸进 loss 曲线的原点。 ---- */
(function () {
  'use strict';
  var PV = window.PV, T = PV.tui;
  var CJK = /[\u2E80-\uFFFF]/;
  PV.addCut(19.700, 0.42, 0.5, function (ctx, t, cut) {
    var T0 = cut.T, O = [440, 80], t0 = T0 - cut.pre;
    var label = t >= T0 + 0.42 ? PV.counterText(T0) : null;
    PV.reveal(ctx, t,
      function (c) { PV.shotCorpus(c, t, t - 16.082, { words: false, counter: false }); },
      function (c) { PV.shotLossCurve(c, t, t - 19.700, (t - 19.700) / (23.236 - 19.700), label); },
      PV.radial(O[0], O[1], T0, 1300));
    var toks = PV.corpusTokens(Math.min(t, T0 + 0.1));
    var arrived = 0, j;
    for (j = 0; j < toks.length; j++) {
      var x = toks[j][0], y = toks[j][1], tok = toks[j][2], lv = toks[j][3];
      var dist = Math.hypot(x - O[0], y - O[1]);
      var ts = t0 + 0.22 * (1 - Math.min(1, dist / 800));
      var ta = T0 + 0.05 + 0.2 * ((j * 7919) % 97) / 97;
      var u = T.clamp01((t - ts) / (ta - ts));
      if (u >= 1) { arrived++; continue; }
      var e = PV.easeIn(u);
      var px = x + (O[0] - x) * e, py = y + (O[1] - y) * e;
      var size = Math.max(7, Math.round(15 - 8 * e));
      var lvl = lv + (1 - lv) * e;
      var a = u < 0.75 ? 1 : (1 - u) / 0.25;
      ctx.save(); ctx.globalAlpha = Math.max(0, a);
      if (CJK.test(tok)) T.textPIL(ctx, tok, px, py, T.ui(lvl), size);
      else T.textMono(ctx, tok, px, py, T.ui(lvl), size);
      ctx.restore();
    }
    if (t0 < t && t < T0 + 0.45) {
      var k = Math.min(1, arrived / 120) * (1 - T.clamp01((t - T0 - 0.25) / 0.2));
      if (k > 0) T.dot(ctx, O[0], O[1], 6 * k, T.ui(1.0), k);
    }
  });
})();

/* ---- C10：dualpipe -> whale。网格格子按随机延迟碎裂，同时 deepseek 字母聚拢成鲸鱼。 ---- */
(function () {
  'use strict';
  var PV = window.PV, T = PV.tui;
  var T0 = 26.466, PRE = 0.52;
  function h01(x, y) { var v = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453; return v - Math.floor(v); }
  PV.addCut(T0, PRE, 0.05, function (ctx, t, cut) {
    PV.reveal(ctx, t,
      function (c) { PV.shotDualPipe(c, t, Math.max(0, t - 23.236), T0 - 23.236); },
      function (c) { PV.shotWhale(c, t, Math.max(0, t - T0), T.clamp01((t - T0) / (29.236 - T0))); },
      function (cx, cy) { return T0 - PRE + (PRE - 0.04) * h01(cx * 0.37, cy * 0.29); },
      { region: [405, 44, 1164, 604], cell: [12, 16], dur: 0.12 });
  });
})();

/* ---- C14：dimension -> circle。收到的向量按列折成窄条，窄条变成第一个圆的指针，
        圆随之画出，其余五个圆按节拍逐个从它诞生。 ---- */
(function () {
  'use strict';
  var PV = window.PV, T = PV.tui;
  var T0 = 32.928, PRE = 0.3, BEAT = 60 / 130;
  var GRID = [790, 90, 1126, 506];                 /* dimension 镜头里 'you' 的 28x16 向量格子 */
  var G0 = [(GRID[0] + GRID[2]) / 2, (GRID[1] + GRID[3]) / 2];
  var STRIP = null, W0 = GRID[2] - GRID[0], H0 = GRID[3] - GRID[1];
  function eIn(u) { u = T.clamp01(u); return u * u * u; }
  function eOut(u) { u = T.clamp01(u); return 1 - Math.pow(1 - u, 3); }
  function eIo(u) { u = T.clamp01(u); return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2; }
  function buildStrip() {
    if (STRIP) return STRIP;
    var full = PV.newCanvas(1280, 720), fg = full.getContext('2d');
    if (PV.drawBackground) PV.drawBackground(fg, T0 - PRE);
    PV.shotDimension(fg, T0 - PRE, T0 - PRE - 30.851, (T0 - PRE - 30.851) / (32.928 - 30.851));
    var c = PV.newCanvas(W0, H0), g = c.getContext('2d');
    g.drawImage(full, -GRID[0], -GRID[1]);
    STRIP = c; return c;
  }
  PV.addCut(T0, PRE, 1.45, function (ctx, t, cut) {
    var c0 = PV.ropeCenter(0);
    function circles(i) {
      if (i === 0) {
        if (t < T0 + 0.3) return null;
        return { sweep: T.clamp01((t - T0 - 0.3) / 0.15), hand: t >= T0 + 0.4, labels: t >= T0 + 0.45 };
      }
      var ts = T0 + 0.45 + (i - 1) * BEAT / 2;
      if (t < ts) return null;
      var u = eOut((t - ts) / 0.2), c = PV.ropeCenter(i);
      return { cx: c0[0] + (c[0] - c0[0]) * u, cy: c0[1] + (c[1] - c0[1]) * u, R: 18 + 52 * u, a: 0.3 + 0.7 * u, labels: u >= 1 };
    }
    PV.circleSpec = circles;
    try {
      PV.reveal(ctx, t,
        function (c) { PV.shotDimension(c, t, t - 30.851, (t - 30.851) / (32.928 - 30.851)); },
        function (c) { PV.shotCircle(c, t, Math.max(0, t - T0), T.clamp01((t - T0) / (34.543 - T0))); },
        PV.radial(958, 298, T0 - 0.1, 1400),
        { region: [405, 44, 1164, 604], cell: [8, 16], dur: 0.09 });
    } finally { PV.circleSpec = null; }
    if (t < T0 + 0.4) {
      var sp = buildStrip();
      if (t < T0 + 0.05) {                       /* 把列折到一起 */
        var u1 = eIn((t - (T0 - PRE)) / 0.35), w1 = Math.max(6, Math.round(W0 * (1 - 0.92 * u1)));
        ctx.save(); ctx.globalAlpha = 1; ctx.drawImage(sp, G0[0] - w1 / 2, G0[1] - H0 / 2, w1, H0); ctx.restore();
      } else {                                   /* 窄条变成 freq_0 的指针 */
        var u2 = eIo((t - (T0 + 0.05)) / 0.35);
        var th = PV.ropeTheta(t, 0);
        var end = [c0[0] + 35 * Math.cos(th), c0[1] + 35 * Math.sin(th)];
        var xy = [G0[0] + (end[0] - G0[0]) * u2, G0[1] + (end[1] - G0[1]) * u2];
        var L = H0 + (70 - H0) * u2, wd = (Math.max(6, W0 * 0.08)) + (4 - Math.max(6, W0 * 0.08)) * u2;
        var tgt = ((Math.atan2(Math.sin(th), Math.cos(th)) * 180 / Math.PI) - 90 + 180) % 360 - 180 + 90;
        var ang = (90 + (tgt - 90) * u2) * Math.PI / 180;
        ctx.save(); ctx.translate(xy[0], xy[1]); ctx.rotate(ang);
        ctx.drawImage(sp, -wd / 2, -L / 2, wd, L);
        ctx.restore();
      }
    }
  });
})();

/* ---- C08：begin_sim -> corpus。RUN 亮起后碎成词块飞进 token 河，预算行飞下去变成计数器。 ---- */
(function () {
  'use strict';
  var PV = window.PV, T = PV.tui;
  var T0 = 16.082, PRE = 0.3, ORIGIN = [575, 262], SPEED = 1500;
  var CJK = /[\u2E80-\uFFFF]/;
  var CHIPS = null;
  function eOut(u) { u = T.clamp01(u); return 1 - Math.pow(1 - u, 3); }
  function eBack(u, s) { u = T.clamp01(u); var c = s * 1.70158; return 1 + (c + 1) * Math.pow(u - 1, 3) + c * Math.pow(u - 1, 2); }
  function bez(p0, p1, bend, u) {
    var mx = (p0[0] + p1[0]) / 2, my = (p0[1] + p1[1]) / 2;
    var dx = p1[0] - p0[0], dy = p1[1] - p0[1];
    var cx = mx - dy * bend, cy = my + dx * bend, a = 1 - u;
    return [a * a * p0[0] + 2 * a * u * cx + u * u * p1[0], a * a * p0[1] + 2 * a * u * cy + u * u * p1[1]];
  }
  function chips() {
    if (CHIPS) return CHIPS;
    var m = PV.newCanvas(400, 180), g = m.getContext('2d');
    T.textPIL(g, 'RUN', 0, 0, [255, 255, 255], 120);
    var d = g.getImageData(0, 0, 400, 180).data, inside = [];
    for (var x = 0; x < 400; x += 3) for (var y = 0; y < 180; y += 3) if (d[(y * 400 + x) * 4 + 3] > 128) inside.push([x, y]);
    CHIPS = [];
    if (!inside.length) return CHIPS;
    var rng = PV.mt(8), toks = PV.corpusTokens(16.9);
    for (var j = 0; j < 26; j++) {
      var sp = inside[Math.floor(rng.random() * inside.length)];
      var tk = toks[(j * 37 + 11) % toks.length];
      var dist = Math.hypot(tk[0] - ORIGIN[0], tk[1] - ORIGIN[1]);
      CHIPS.push([460 + sp[0], 200 + sp[1], tk[0], tk[1], tk[2], tk[3],
                  Math.max(T0 + 0.14, T0 + 0.06 + dist / SPEED), rng.random() * 0.5 - 0.25]);
    }
    return CHIPS;
  }
  PV.addCut(T0, PRE, 0.62, function (ctx, t, cut) {
    PV.reveal(ctx, t,
      function (c) { PV.shotBeginSim(c, t, t - 12.389, (t - 12.389) / (16.082 - 12.389), 16.082 - 12.389, true, true); },
      function (c) { PV.shotCorpus(c, t, Math.max(0, t - T0), { counter: t >= T0 + 0.46 }); },
      PV.radial(ORIGIN[0], ORIGIN[1], T0 + 0.06, SPEED),
      { region: [405, 44, 1164, 604], cell: [8, 16], dur: 0.09 });
    var lift = T.clamp01((t - (T0 - PRE)) / PRE);
    if (t < T0 + 0.12) {
      ctx.save(); ctx.globalAlpha = T.clamp01(t < T0 ? 1 : 1 - (t - T0) / 0.12);
      T.textPIL(ctx, 'RUN', 460, 200, T.ui(1.0), 120 * (1 + 0.06 * lift));
      ctx.restore();
    }
    if (t >= T0) {
      var cs = chips();
      for (var i = 0; i < cs.length; i++) {
        var ch = cs[i], lt = ch[6];
        if (t > lt + 0.1) continue;
        var u = T.clamp01((t - T0) / (lt - T0));
        var pos = bez([ch[0], ch[1]], [ch[2], ch[3]], ch[7], eOut(u));
        ctx.save(); ctx.globalAlpha = T.clamp01(t <= lt ? 1 : 1 - (t - lt) / 0.1);
        var sz = 15 * (2.1 - 1.1 * eOut(u));
        if (CJK.test(ch[4])) T.textPIL(ctx, ch[4], pos[0], pos[1], T.ui(1.0), sz);
        else T.textMono(ctx, ch[4], pos[0], pos[1], T.ui(1.0), sz);
        ctx.restore();
      }
    }
    if (t < T0 + 0.56) {
      var u2 = T.clamp01((t - T0) / 0.46);
      var xy = bez([460, 440], [430, 572], 0.18, eBack(u2, 0.9));
      ctx.save(); ctx.globalAlpha = T.clamp01(t < T0 + 0.46 ? 1 : 1 - (t - T0 - 0.46) / 0.1);
      T.textMono(ctx, 'tokens budget: 45T', xy[0], xy[1], T.ui(0.95), 20);
      ctx.restore();
    }
  });
})();

/* ---- C10：losscurve -> dualpipe。端点长大并沿曲线往回把它吃掉，到原点后跳进 pipeline 第一格。 ---- */
(function () {
  'use strict';
  var PV = window.PV, T = PV.tui;
  var T0 = 23.236, PRE = 0.35, LAND = 0.42, O = [440, 80];
  function eIn(u) { u = T.clamp01(u); return u * u * u; }
  function eIo(u) { u = T.clamp01(u); return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2; }
  function eBack(u, s) { u = T.clamp01(u); var c = s * 1.70158; return 1 + (c + 1) * Math.pow(u - 1, 3) + c * Math.pow(u - 1, 2); }
  PV.addCut(T0, PRE, 0.6, function (ctx, t, cut) {
    var t1 = T0 - 0.1, t2 = T0 + 0.3;
    var prog = Math.max(0.02, T.clamp01(1 - eIo((t - t1) / (t2 - t1))));
    PV.reveal(ctx, t,
      function (c) { PV.shotLossCurve(c, t, t - 19.700, (t - 19.700) / (23.236 - 19.700), null, prog); },
      function (c) { PV.shotDualPipe(c, t, Math.max(0, t - T0), 26.466 - T0); },
      PV.inward(O[0], O[1], T0 - 0.15, T0 + 0.32, 760),
      { region: [405, 44, 1164, 604], cell: [8, 16], dur: 0.09 });
    var ep = PV.lossEndPoint(prog, 440, 80, 690, 240, 5, 5);
    var grow = T.clamp01((t - (T0 - PRE)) / 0.2);
    if (t < t2) {
      var rad = 1.5 + 4.5 * grow;
      T.fill(ctx, ep[0] - rad, ep[1] - rad, ep[0] + rad, ep[1] + rad, T.mix(T.ME_TEXT, 1.0), grow);
      var k = T.clamp01((t - t1) / (t2 - t1));
      if (k < 1) T.textMono(ctx, 'loss ' + PV.lossFn(Math.min(1, prog)).toFixed(3), ep[0] - 80 + 60 * k, ep[1] - 26, T.ui(1.0), 16);
    } else {
      var u = T.clamp01((t - t2) / (T0 + LAND - t2)), e = eBack(u, 1.0);
      var cx0 = PV.PIPE.ox + (PV.PIPE.cw - 3) / 2, cy0 = PV.PIPE.oy + (PV.PIPE.ch - 6) / 2;
      var cx = O[0] + (cx0 - O[0]) * e, cy = O[1] + (cy0 - O[1]) * e;
      var w = 12 + ((PV.PIPE.cw - 3) - 12) * eIo(u), hh = 12 + ((PV.PIPE.ch - 6) - 12) * eIo(u);
      if (t < T0 + LAND + 0.05) {
        T.fill(ctx, cx - w / 2, cy - hh / 2, cx + w / 2, cy + hh / 2,
               u < 0.5 ? T.mix(T.ME_TEXT, 1.0) : T.mix(T.ANOM, 0.75 + 0.25 * (1 - u)), 1);
        if (u > 0.6) T.textPIL(ctx, 'F', cx - w / 2 + 7, cy - hh / 2 + 13, T.css(T.BG), 11);
      }
    }
  });
})();
