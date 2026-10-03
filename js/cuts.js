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
        /* v2 C14: self.old(t, n, you=t < T-0.3) —— 窗内右侧 you 的接收格已经折成窄条，不再画 */
        function (c) { var q = PV.shotTime('shot_dimension', t); PV.shotDimension(c, t, q[0], q[1], { you: t < T0 - 0.3 }); },
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
      function (c) { var q = PV.shotTime('shot_dualpipe', t); PV.shotDualPipe(c, t, q[0], q[1]); },
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

/* ---- C15：circle -> circumference。其余五对缩回第一个圆，第一个移动并长大成待展开的圆。 ---- */
(function () {
  'use strict';
  var PV = window.PV, T = PV.tui;
  var T0 = 34.543, PRE = 0.3, LAND = 0.4, FPS = 24, CX = 600, CY = 240, R = 120;
  function eIn(u) { u = T.clamp01(u); return u * u * u; }
  function eIo(u) { u = T.clamp01(u); return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2; }
  PV.addCut(T0, PRE, 0.45, function (ctx, t, cut) {
    var c0 = PV.ropeCenter(0);
    function circles(i) {
      if (i === 0) return t >= T0 - 0.05 ? null : {};
      var u = eIn((t - (T0 - PRE + (i - 1) / FPS)) / 0.2);
      if (u >= 1) return null;
      var c = PV.ropeCenter(i);
      return { cx: c[0] + (c0[0] - c[0]) * u, cy: c[1] + (c0[1] - c[1]) * u,
               R: 70 + (4 - 70) * u, a: 1 - 0.7 * u, labels: u < 0.2, hand: true, sweep: 1 };
    }
    PV.circleSpec = circles;
    try {
      PV.reveal(ctx, t,
        function (c) { PV.shotCircle(c, t, t - 32.928, (t - 32.928) / (34.543 - 32.928)); },
        function (c) { PV.shotCircumference(c, t, Math.max(0, t - T0), T.clamp01((t - T0) / (36.851 - T0)),
                                            { dots: t >= T0 + LAND, labels: t >= T0 + LAND }); },
        PV.radial(CX, CY, T0 + 0.2, 1400),
        { region: [405, 44, 1164, 604], cell: [8, 16], dur: 0.09 });
    } finally { PV.circleSpec = null; }
    var land = T0 + LAND;
    if (t >= T0 - 0.05 && t < land + 0.06) {
      var u = eIo((t - (T0 - 0.05)) / (land - T0 + 0.05));
      var cx = c0[0] + (CX - c0[0]) * u, cy = c0[1] + (CY - c0[1]) * u, rr = 70 + (R - 70) * u;
      var al = T.clamp01(t < land ? 1 : 1 - (t - land) / 0.06);
      var col = [255 + (120 - 255) * u, 204 + (148 - 204) * u, 0 + 255 * u];
      ctx.save(); ctx.globalAlpha = al;
      ctx.strokeStyle = T.css(col); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(cx, cy, rr, 0, Math.PI * 2); ctx.stroke();
      var th = PV.ropeTheta(t, 0);
      ctx.strokeStyle = T.css(T.mix(T.ME_TEXT, 0.95));
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + rr * Math.cos(th), cy + rr * Math.sin(th)); ctx.stroke();
      ctx.restore();
    }
  });
})();

/* ---- C16：circumference -> sine。展开的蓝线抬到通道 2 并开始波动，其他通道逐条剥离。 ---- */
(function () {
  'use strict';
  var PV = window.PV, T = PV.tui;
  var T0 = 36.851, PRE = 0.25, FPS = 24;
  function eOut(u) { u = T.clamp01(u); return 1 - Math.pow(1 - u, 3); }
  function eIo(u) { u = T.clamp01(u); return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2; }
  function stroke(ctx, pts, col, w, alpha) {
    ctx.save(); ctx.globalAlpha = alpha; ctx.strokeStyle = T.css(col); ctx.lineWidth = w;
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
    for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.stroke(); ctx.restore();
  }
  PV.addCut(T0, PRE, 0.7, function (ctx, t, cut) {
    function waves(i) {
      if (i === 2) return t < T0 + 0.35 ? null : {};
      var ts = T0 + 0.25 + Math.abs(i - 2) * 2 / FPS;
      if (t < ts) return null;
      var u = eOut((t - ts) / 0.2);
      return { y0: 240 + (100 + i * 70 - 240) * u, amp: 22 * u, a: u };
    }
    PV.reveal(ctx, t,
      function (c) { PV.shotCircumference(c, t, t - 34.543, (t - 34.543) / (36.851 - 34.543), { line: t < T0 - PRE }); },
      function (c) { PV.shotSine(c, t, Math.max(0, t - T0), T.clamp01((t - T0) / (38.236 - T0)), waves); },
      PV.radial(600, 440, T0 - 0.05, 1500),
      { region: [405, 44, 1164, 604], cell: [8, 16], dur: 0.09 });
    if (t < T0 + 0.35) {
      var lift = T.clamp01((t - (T0 - PRE)) / 0.2);
      var u = t >= T0 ? eIo((t - T0) / 0.35) : 0, fr = 0.02 * 1.7 * 1.7, pts = [], xs, x0, x1, y1;
      for (xs = 0; xs < 720; xs += 3) {
        x0 = 440 + xs * 678 / 720; x1 = 430 + xs;
        y1 = 240 + 22 * Math.sin((xs + t * 180) * fr);
        pts.push([x0 + (x1 - x0) * u, 440 + (y1 - 440) * u]);
      }
      if (lift > 0) stroke(ctx, pts, T.mix(T.ME_TEXT, 1.0), 9, 0.47 * lift);
      stroke(ctx, pts, [120 + 100 * 0.4 * lift * (1 - u), 148 + 80 * 0.4 * lift * (1 - u), 255], 3, 1);
    }
  });
})();

/* ---- C18：tangent -> infinity。只有可视化窗格在平移（镜头追着骑手往 +x 走）。 ---- */
(function () {
  'use strict';
  var PV = window.PV, T = PV.tui;
  var T0 = 40.312, PRE = 0.25, POST = 0.3;
  var X0 = 406, Y0 = 58, X1 = 1163, Y1 = 603, W = X1 - X0, H = Y1 - Y0;
  function eIo(u) { u = T.clamp01(u); return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2; }
  PV.addCut(T0, PRE, POST, function (ctx, t, cut) {
    var e = eIo((t - (T0 - PRE)) / (PRE + POST));
    var oc = PV.newCanvas(1280, 720), nc = PV.newCanvas(1280, 720);
    var og = oc.getContext('2d'), ng = nc.getContext('2d');
    if (PV.drawBackground) { PV.drawBackground(og, t); PV.drawBackground(ng, t); }
    PV.shotTangent(og, t, Math.max(0, t - 38.236), T.clamp01((t - 38.236) / (40.312 - 38.236)), 40.312 - 38.236);
    PV.shotInfinity(ng, t, Math.max(0, t - T0), T.clamp01((t - T0) / (41.928 - T0)));
    ctx.drawImage(e < 0.5 ? oc : nc, 0, 0);
    ctx.save(); ctx.beginPath(); ctx.rect(X0, Y0, W, H); ctx.clip();
    T.fill(ctx, X0, Y0, X1, Y1, T.BG, 1);
    var off = Math.round(W * e);
    if (off < W) ctx.drawImage(oc, X0 + off, Y0, W - off, H, X0, Y0, W - off, H);
    if (off > 0) ctx.drawImage(nc, X0, Y0, off, H, X1 - off, Y0, off, H);
    ctx.restore();
  });
})();

/* ---- C19：infinity -> limit。墙在拍点上砸下来，越界部分碎裂，条变蓝加厚抵住墙。 ---- */
(function () {
  'use strict';
  var PV = window.PV, T = PV.tui;
  var T0 = 41.928, PRE = 0.18;
  var SH = null;
  function eIn(u) { u = T.clamp01(u); return u * u * u; }
  function eOut(u) { u = T.clamp01(u); return 1 - Math.pow(1 - u, 3); }
  function shards() {
    if (SH) return SH;
    var rng = PV.mt(19);   /* 与原始 cuts.py 的 random.Random(19) 同序同值 */
    SH = [];
    for (var q = 0; q < 36; q++) SH.push([1060 + (q % 9) * 8, 202 + Math.floor(q / 9) * 9, 80 + rng.random() * 340, -260 + rng.random() * 420]);
    return SH;
  }
  PV.addCut(T0, PRE, 0.45, function (ctx, t, cut) {
    PV.reveal(ctx, t,
      function (c) { PV.shotInfinity(c, t, t - 40.312, (t - 40.312) / (41.928 - 40.312)); },
      function (c) { PV.shotLimit(c, t, Math.max(0, t - T0), T.clamp01((t - T0) / (44.005 - T0)), { wall: t >= T0 + 0.02, drawBar: t >= T0 + 0.2 }); },
      PV.radial(1050, 230, T0, 1700),
      { region: [405, 44, 1164, 604], cell: [8, 16], dur: 0.09 });
    if (t < T0 + 0.02) {
      var u = eIn((t - (T0 - PRE)) / PRE), y = -140 + (170 + 140) * u;
      T.fill(ctx, 1040, y, 1060, y + 120, T.ANOM, 1);
    }
    if (t >= T0 && t < T0 + 0.2) {
      var u2 = eOut((t - T0) / 0.2);
      T.fill(ctx, 430, 200, 1030, 240 + 20 * u2, [255 + (120 - 255) * u2, 204 + (148 - 204) * u2, 0 + 255 * u2], 1);
    }
    if (t >= T0 && t < T0 + 0.12) {
      T.rect(ctx, 1036, 150, 1064, 310, [235, 240, 255], 3, 1 - (t - T0) / 0.12);
    }
    if (t >= T0 && t < T0 + 0.45) {
      var sh = shards(), f = t - T0, al = Math.max(0, 1 - f / 0.45);
      for (var q = 0; q < sh.length; q++) {
        var x = sh[q][0] + sh[q][2] * f, y2 = sh[q][1] + sh[q][3] * f + 700 * f * f;
        T.fill(ctx, x, y2, x + 5, y2 + 5, T.mix(T.ANOM, 0.85), al);
      }
    }
  });
})();

/* ---- C20：limit -> current。抵墙的条裂成八条线（每 GPU 一条），散开到各自轨迹行并开始 AC/DC 交替。 ---- */
(function () {
  'use strict';
  var PV = window.PV, T = PV.tui;
  var T0 = 44.005, PRE = 0.15, DONE = 0.4;
  function eIo(u) { u = T.clamp01(u); return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2; }
  PV.addCut(T0, PRE, 0.55, function (ctx, t, cut) {
    PV.reveal(ctx, t,
      function (c) { PV.shotLimit(c, t, t - 41.928, (t - 41.928) / (44.005 - 41.928), { drawBar: t < T0 - PRE }); },
      function (c) { PV.shotCurrent(c, t, Math.max(0, t - T0), { traces: t >= T0 + DONE }); },
      PV.radial(740, 230, T0 - 0.05, 1500),
      { region: [405, 44, 1164, 604], cell: [8, 16], dur: 0.09 });
    if (t < T0 + DONE + 0.02) {
      for (var g = 0; g < 8; g++) {
        var u = eIo((t - (T0 - PRE) - Math.abs(g - 3.5) * 0.015) / (DONE + PRE));
        var live = PV.currentTrace(g, t, Math.max(0, t - T0))[0];
        var thick = 7.5 + (1.0 - 7.5) * u;
        ctx.save();
        ctx.strokeStyle = T.css([120 + 135 * u, 148 + 56 * u, 255 - 255 * u]);   /* 蓝 -> 琥珀 */
        ctx.lineWidth = Math.max(1, Math.round(thick));
        ctx.beginPath();
        for (var j = 0; j < live.length; j++) {
          var bx = 430 + j * 3 * 600 / 640, by = 200 + g * 7.5 + 3.75;
          var px = bx + (live[j][0] - bx) * u, py = by + (live[j][1] - by) * u;
          if (j === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.stroke(); ctx.restore();
      }
    }
  });
})();

/* ---- C17：sine -> tangent。通道 2 长大成大正弦（其余滑走），骑手从她的窗格带残影飞向切点。 ---- */
(function () {
  'use strict';
  var PV = window.PV, T = PV.tui;
  var T0 = 38.236, PRE = 0.3, LAND = 0.45, DUR = 40.312 - 38.236;
  function eIn(u) { u = T.clamp01(u); return u * u * u; }
  function eIo(u) { u = T.clamp01(u); return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2; }
  function bez(p0, p1, bend, u) {
    var mx = (p0[0] + p1[0]) / 2, my = (p0[1] + p1[1]) / 2;
    var dx = p1[0] - p0[0], dy = p1[1] - p0[1];
    var cx = mx - dy * bend, cy = my + dx * bend, a = 1 - u;
    return [a * a * p0[0] + 2 * a * u * cx + u * u * p1[0], a * a * p0[1] + 2 * a * u * cy + u * u * p1[1]];
  }
  function stroke(ctx, pts, col, w, alpha) {
    ctx.save(); ctx.globalAlpha = alpha === undefined ? 1 : alpha;
    ctx.strokeStyle = T.css(col); ctx.lineWidth = w;
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
    for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.stroke(); ctx.restore();
  }
  PV.addCut(T0, PRE, 0.62, function (ctx, t, cut) {
    function waves(i) {
      if (i === 2) return null;
      var u = eIn((t - (T0 - 0.2)) / 0.35);
      if (u >= 1) return null;
      return { y0: 100 + i * 70 + (i < 2 ? -90 : 90) * u, a: 1 - u };
    }
    var land = T0 + LAND;
    PV.reveal(ctx, t,
      function (c) { PV.shotSine(c, t, t - 36.851, (t - 36.851) / (38.236 - 36.851), waves); },
      function (c) { PV.shotTangent(c, t, Math.max(0, t - T0), T.clamp01((t - T0) / DUR), DUR,
                                   { curve: t >= T0 + 0.35, rider: t >= land, tangent: t >= land }); },
      function (x, y) { return T0 + (x - 404) / 2000; },   /* 从左到右扫过 */
      { region: [405, 44, 1164, 604], cell: [8, 16], dur: 0.09 });
    if (t < T0 + 0.35) {
      var e = eIo((t - (T0 - PRE)) / 0.65);
      var cam = PV.tangentState(Math.max(0, t - T0), DUR)[1];
      var fr = 0.02 * 1.7 * 1.7;
      var y0 = 240 + (PV.TAN.Y0 - 240) * e, A2 = 22 + (PV.TAN.A - 22) * e, pts = [], xs, pa, pb;
      for (xs = 0; xs < 720; xs += 3) {
        pa = (xs + t * 180) * fr + Math.PI;
        pb = (xs + cam) / PV.TAN.K;
        pts.push([430 + xs, y0 - A2 * Math.sin(pa + (pb - pa) * e)]);
      }
      stroke(ctx, pts, T.mix(T.ME_TEXT, 0.9), e < 0.5 ? 2 : 3);
    }
    if (t >= T0 && t < land + 0.02) {
      var u = T.clamp01((t - (T0 + 0.02)) / (LAND - 0.02));
      var st = PV.tangentState(Math.max(0, t - T0), DUR);
      var rx = PV.TAN.X0 + st[0] - st[1], ry = PV.TAN.Y0 - PV.TAN.A * Math.sin(st[0] / PV.TAN.K);
      var sp = PV.riderSprite ? PV.riderSprite() : null;
      if (sp) {
        var dw = sp.width || 24, dh = sp.height || 24;
        var dst = [rx, ry - dh / 2 + 6], src = [204, 300];
        var trail = [[0.12, 0.25], [0.06, 0.45], [0.0, 1.0]];
        for (var k = 0; k < 3; k++) {
          var ug = T.clamp01(u - trail[k][0]);
          if (ug <= 0) continue;
          var pos = bez(src, dst, -0.35, eIo(ug)), sc = 0.7 + 0.3 * ug;
          ctx.save(); ctx.globalAlpha = trail[k][1];
          ctx.drawImage(sp, pos[0] - dw * sc / 2, pos[1] - dh * sc / 2, dw * sc, dh * sc);
          ctx.restore();
        }
      }
    }
  });
})();

/* ---- C01：power -> protection。CRT 画面抬起后张开成整个 shell（UNFOLD），锁在拍点上。 ---- */
(function () {
  'use strict';
  var PV = window.PV, T = PV.tui;
  var T0 = 1.312, PRE = 0.25, OPEN = 0.23;
  var CRT = [180, 150, 1100, 520];   /* 与 shot_power 收尾时的开孔一致，保证接得上 */
  function eIo(u) { u = T.clamp01(u); return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2; }
  PV.addCut(T0, PRE, 0.44, function (ctx, t, cut) {
    var e = eIo((t - (T0 - 0.06)) / (OPEN + 0.06));
    var ap = [CRT[0] + (-8 - CRT[0]) * e, CRT[1] + (-8 - CRT[1]) * e,
              CRT[2] + (1288 - CRT[2]) * e, CRT[3] + (728 - CRT[3]) * e];
    var lift = T.clamp01((t - (T0 - PRE)) / (PRE - 0.06));
    var fa = 1 - T.clamp01((e - 0.55) / 0.45);
    var oc = PV.newCanvas(1280, 720), og = oc.getContext('2d');
    if (PV.drawBackground) PV.drawBackground(og, t);
    PV.protectionScene(og, t, [48, 70], Math.max(0, t - T0));
    ctx.drawImage(oc, 0, 0);
    PV.crtFinish(ctx, t, { ap: ap, fa: fa, fl: lift * (1 - e), line: null, veil: 0 });
  });
})();

/* ---- C02：protection -> pieces。盾牌亮起，点按顶行优先逐个飞进权重网格的下一格（落地即加载）；
        '#' 轮廓拉伸成 load_weights 边框并锁在拍点上。 ---- */
(function () {
  'use strict';
  var PV = window.PV, T = PV.tui;
  var T0 = 3.620, PRE = 0.32, FLY = 0.24, LAND = 0.23;
  var FULLR = [24, 44, 1168, 608], FRAME_PATH = [[24, 56], [1164, 56], [1164, 604], [24, 604]];
  var DOTS = null, OUT = null;
  function eIn(u) { u = T.clamp01(u); return u * u * u; }
  function eIo(u) { u = T.clamp01(u); return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2; }
  function bez(p0, p1, bend, u) {
    var mx = (p0[0] + p1[0]) / 2, my = (p0[1] + p1[1]) / 2;
    var dx = p1[0] - p0[0], dy = p1[1] - p0[1];
    var cx = mx - dy * bend, cy = my + dx * bend, a = 1 - u;
    return [a * a * p0[0] + 2 * a * u * cx + u * u * p1[0], a * a * p0[1] + 2 * a * u * cy + u * u * p1[1]];
  }
  function cellCenter(k) {
    var G = PV.GRID;
    return [G.x + (k % G.cols) * G.dx + G.w / 2, G.y + Math.floor(k / G.cols) * G.dy + G.h / 2];
  }
  /* 参考实测的落地时刻表（24fps 逐帧数格子，帧 N <-> t=(N-1)/24）：
     前 62 格 10ms/格（与原实现一致），4.30s 起一波加速爆发，4.667s 满 161 格。
     验收（tilecount）：帧106/107/108/109 = 89/118/138/150。 */
  var LAND_KF = [[0, 3.640], [62, 4.260], [67, 4.300], [89, 4.375], [118, 4.417],
                 [138, 4.458], [150, 4.500], [157, 4.542], [160, 4.583], [161, 4.667]];
  function landAt(k) {
    var i;
    if (k <= LAND_KF[0][0]) return LAND_KF[0][1];
    for (i = 0; i + 1 < LAND_KF.length; i++) {
      var a = LAND_KF[i], b = LAND_KF[i + 1];
      if (k <= b[0]) return a[1] + (b[1] - a[1]) * (k - a[0]) / (b[0] - a[0]);
    }
    return LAND_KF[LAND_KF.length - 1][1];
  }
  function dots() {
    if (DOTS) return DOTS;
    var S = PV.shieldCells(), raw = S.dots || [];
    var order = raw.slice().sort(function (a, b) { return (a[3] - b[3]) || (a[2] - b[2]); });
    var n = order.length, N = (PV.GRID && PV.GRID.n) || 161, k;
    DOTS = [];
    /* 盾牌上的点只有 ~70 个、网格有 161 格 —— 原来一个点对一格，所以亮到 67 格就没点可飞了
       （帧106-108 卡在 67 就是这个）。改为在盾牌点列上按比例插值出 161 个落点，一格一个。 */
    for (k = 0; k < N; k++) {
      var i0 = n > 1 ? Math.round(k * (n - 1) / (N - 1)) : 0;   /* 用盾牌上原有的点，不插值出新坐标 */
      var src = n ? [order[i0][0], order[i0][1]] : [0, 0];
      var tl = landAt(k);
      /* 飞行时长跟着本地落地节拍：慢速段 0.24s（与原实现一致），爆发段收到 ~10ms，
         否则几十个点在飞、把还没点亮的格子也照亮（帧107 实测多算了 26 格）。 */
      var iv = landAt(k + 1) - tl;
      var fl = (iv > 0 && iv < 0.005) ? Math.max(0.010, iv * 4) : FLY;
      DOTS.push({ src: src, cell: k, td: tl - fl, tl: tl, fl: fl, bend: (k % 2) ? 0.16 : 0.1 });
    }
    return DOTS;
  }
  /* 把盾牌边缘重采样成 260 个点，再与边框矩形同参数对齐 —— 轮廓就能连续拉伸过去 */
  function resample(pts, m) {
    var P = pts.concat([pts[0]]), seg = [], i;
    for (i = 0; i < P.length - 1; i++) seg.push(Math.hypot(P[i + 1][0] - P[i][0], P[i + 1][1] - P[i][1]));
    var total = 0; for (i = 0; i < seg.length; i++) total += seg[i];
    if (!total) total = 1;
    var out = [], frac = [], acc = 0, j = 0;
    for (i = 0; i < seg.length; i++) { frac.push(acc / total); acc += seg[i]; }
    acc = 0;
    for (var k = 0; k < m; k++) {
      var target = total * k / m;
      while (j < seg.length - 1 && acc + seg[j] < target) { acc += seg[j]; j++; }
      var u = seg[j] ? (target - acc) / seg[j] : 0;
      out.push([P[j][0] + (P[j + 1][0] - P[j][0]) * u, P[j][1] + (P[j + 1][1] - P[j][1]) * u]);
    }
    return [out, frac];
  }
  function atFrac(pts, f) {
    var P = pts.concat([pts[0]]), seg = [], i, total = 0;
    for (i = 0; i < P.length - 1; i++) { var d = Math.hypot(P[i + 1][0] - P[i][0], P[i + 1][1] - P[i][1]); seg.push(d); total += d; }
    if (!total) total = 1;
    var target = total * (f % 1), acc = 0;
    for (i = 0; i < seg.length; i++) {
      if (acc + seg[i] >= target) { var u = seg[i] ? (target - acc) / seg[i] : 0; return [P[i][0] + (P[i + 1][0] - P[i][0]) * u, P[i][1] + (P[i + 1][1] - P[i][1]) * u]; }
      acc += seg[i];
    }
    return P[P.length - 1];
  }
  function outline() {
    if (OUT) return OUT;
    var S = PV.shieldCells(), edge = S.edge || [], src = [], i;
    for (i = 0; i < edge.length; i++) src.push([edge[i][0], edge[i][1]]);
    var rs = resample(src, 260), pathA = rs[0], frac = rs[1];
    var fw = FULLR[2] - FULLR[0] - 24, fh = FULLR[3] - FULLR[1] - 44, per = 2 * (fw + fh);
    var ts = [], k;
    for (k = 0; k < 260; k++) ts.push(k / 260);
    ts.push(0, fw / per, (fw + fh) / per, (2 * fw + fh) / per);
    ts.sort(function (a, b) { return a - b; });
    var uniq = []; for (k = 0; k < ts.length; k++) if (!k || ts[k] !== ts[k - 1]) uniq.push(ts[k]);
    var pathB = [];
    for (k = 0; k < uniq.length; k++) pathB.push(atFrac(FRAME_PATH, uniq[k]));
    var glyphs = [];
    for (k = 0; k < src.length; k++) glyphs.push([src[k], atFrac(FRAME_PATH, frac[k % frac.length])]);
    OUT = { A: pathA, B: pathB, T: uniq, glyphs: glyphs };
    return OUT;
  }
  function landedMap() {
    var D = dots(), m = {};
    for (var i = 0; i < D.length; i++) m[D[i].cell] = D[i].tl;
    return m;
  }
  PV.addCut(T0, PRE, 0.86, function (ctx, t, cut) {
    var land = T0 + LAND;
    PV.reveal(ctx, t,
      function (c) { PV.protectionScene(c, t, [48, 70], t - 1.312, true); },
      function (c) { PV.shotPieces(c, t, Math.max(0, t - T0), 5.236 - T0, { landed: landedMap() }); },
      function (x, y) { return T0 - 0.32 + (x - 24) / 2400; },
      { region: FULLR, cell: [8, 16], dur: 0.09 });
    var lift = T.clamp01((t - (T0 - PRE)) / 0.12);
    var u = eIo((t - (T0 - 0.15)) / (LAND + 0.15)), O = outline(), k;
    if (t < land + 0.1 && u > 0) {
      var kOut = t < land ? 1 : 1 - (t - land) / 0.1, pts = [];
      for (k = 0; k < O.A.length; k++) pts.push([O.A[k][0] + (O.B[k][0] - O.A[k][0]) * u, O.A[k][1] + (O.B[k][1] - O.A[k][1]) * u]);
      ctx.save(); ctx.globalAlpha = T.clamp01(kOut * Math.min(1, u * 4));
      ctx.strokeStyle = T.css(T.mix(T.ANOM, 0.55 + 0.4 * (1 - u))); ctx.lineWidth = u < 0.8 ? 2 : 1;
      ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
      for (k = 1; k < pts.length; k++) ctx.lineTo(pts[k][0], pts[k][1]);
      ctx.closePath(); ctx.stroke(); ctx.restore();
      var al = kOut * (1 - T.clamp01((u - 0.7) / 0.3));
      if (al > 0.02) {
        ctx.save(); ctx.globalAlpha = al * 0.55 * lift; ctx.fillStyle = T.css(T.mix(T.ANOM, 0.9));
        for (k = 0; k < O.glyphs.length; k++) {
          var gx = O.glyphs[k][0][0] + (O.glyphs[k][1][0] - O.glyphs[k][0][0]) * u;
          var gy = O.glyphs[k][0][1] + (O.glyphs[k][1][1] - O.glyphs[k][0][1]) * u;
          ctx.fillRect(gx - 1, gy - 6, 8, 12);
        }
        ctx.restore();
      }
    }
    var D = dots();
    for (k = 0; k < D.length; k++) {
      var p = D[k];
      if (t >= p.tl) continue;
      var cc = cellCenter(p.cell), v = T.clamp01((t - p.td) / (p.fl || FLY));
      if (v <= 0) { T.fill(ctx, p.src[0] - 1.5, p.src[1] - 1.5, p.src[0] + 1.5, p.src[1] + 1.5, T.mix(T.ANOM, 0.9), 0.6 * lift); continue; }
      var pos = bez(p.src, cc, p.bend, eIo(v)), g = T.clamp01((v - 0.55) / 0.45);
      var s0 = 3.5 + 3.0 * Math.sin(Math.PI * Math.min(1, v / 0.55));
      var G = PV.GRID, hw = s0 + (G.w / 2 - s0) * eIn(g), hh = s0 + (G.h / 2 - s0) * eIn(g);
      T.fill(ctx, pos[0] - hw, pos[1] - hh, pos[0] + hw, pos[1] + hh, T.HOT || T.ui(1.0), 1);
    }
  });
})();

/* ---- C03：pieces -> creation。161 个已加载的格子向网格中心排空（远处的先走），
        缩成一点、由系统的琥珀色变她的蓝，聚成 8x8 的一个格子；格子再沿弧线飞进她的窗格、成为她的种子。 ---- */
(function () {
  'use strict';
  var PV = window.PV, T = PV.tui;
  var T0 = 5.236, PRE = 0.6, GATHER = 0.10, LAND = 0.46, FRAME = 0.34;
  var G = [597, 240], S = [204, 300], FULLR = [24, 44, 1168, 608];
  function eIn(u) { u = T.clamp01(u); return u * u * u; }
  function eIo(u) { u = T.clamp01(u); return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2; }
  function eOut(u) { u = T.clamp01(u); return 1 - Math.pow(1 - u, 3); }
  function eBack(u, s) { u = T.clamp01(u); var c = s * 1.70158; return 1 + (c + 1) * Math.pow(u - 1, 3) + c * Math.pow(u - 1, 2); }
  function bez(p0, p1, bend, u) {
    var mx = (p0[0] + p1[0]) / 2, my = (p0[1] + p1[1]) / 2, dx = p1[0] - p0[0], dy = p1[1] - p0[1];
    var cx = mx - dy * bend, cy = my + dx * bend, a = 1 - u;
    return [a * a * p0[0] + 2 * a * u * cx + u * u * p1[0], a * a * p0[1] + 2 * a * u * cy + u * u * p1[1]];
  }
  function cellCenter(i) { var g = PV.GRID; return [g.x + (i % g.cols) * g.dx + g.w / 2, g.y + Math.floor(i / g.cols) * g.dy + g.h / 2]; }
  var ORDER = null, MAXD = 1;
  function order() {
    if (ORDER) return ORDER;
    var g = PV.GRID, arr = [], i, c;
    MAXD = 0;
    for (i = 0; i < g.n; i++) { c = cellCenter(i); var dd = Math.hypot(c[0] - G[0], c[1] - G[1]); if (dd > MAXD) MAXD = dd; arr.push([i, dd]); }
    arr.sort(function (a, b) { return b[1] - a[1]; });   /* 远处的先走 */
    ORDER = arr; return ORDER;
  }
  PV.addCut(T0, PRE, 1.42, function (ctx, t, cut) {
    var land = T0 + LAND, g = PV.GRID;
    var oc = PV.newCanvas(1280, 720), og = oc.getContext('2d');
    if (PV.drawBackground) PV.drawBackground(og, t);
    PV.shotPieces(og, t, Math.max(0, t - 3.620), 5.236 - 3.620, { cells: false });
    var stage1 = PV.newCanvas(1280, 720), sg = stage1.getContext('2d');
    PV.reveal(sg, t,
      function (c) { c.drawImage(oc, 0, 0); },
      function (c) { if (PV.drawBackground) PV.drawBackground(c, t); },
      PV.inward(G[0], G[1], T0 - 0.52, T0 + 0.08, 760), { region: FULLR, cell: [8, 16], dur: 0.09 });
    PV.reveal(ctx, t,
      function (c) { c.drawImage(stage1, 0, 0); },
      function (c) { PV.shotCreation(c, t, Math.max(0, t - T0), 7.082 - T0); },
      PV.radial(G[0], G[1], T0 + GATHER, 1400), { region: FULLR, cell: [8, 16], dur: 0.09 });
    var lift = T.clamp01((t - (T0 - PRE)) / 0.05), arrived = 0, i;
    if (t < T0 + GATHER) {
      var O = order();
      for (var k = 0; k < O.length; k++) {
        i = O[k][0]; var dist = O[k][1], c2 = cellCenter(i);
        var t0 = T0 - 0.55 + 0.3 * (1 - dist / MAXD);
        var s = T.clamp01((t - t0) / 0.25);
        var v = T.clamp01((t - t0 - 0.1) / (T0 + GATHER - t0 - 0.1));
        if (v >= 1) { arrived++; continue; }
        var xy = [c2[0] + (G[0] - c2[0]) * eIn(v), c2[1] + (G[1] - c2[1]) * eIn(v)];
        var hw = 21 + (3 - 21) * s, hh = 18 + (3 - 18) * s;
        /* 参考实测（t=4.75 逐格取色）：排空的格子仍是加载态的蓝灰底、只是整体提亮约 +43 灰阶
           （(138,149,167)->(181,193,211)），不是黄色；3 位数字一直保留到格子缩没。 */
        T.fill(ctx, xy[0] - hw, xy[1] - hh, xy[0] + hw, xy[1] + hh, T.ui(0.78 - 0.23 * s), 1);
        if (hw > 8) T.textMono(ctx, ('00' + (i + 1)).slice(-3), xy[0] - hw + 6, xy[1] - hh + 10, T.BG, 13);
      }
      var kk = arrived / g.n;
      if (kk > 0) { var rr = 1 + kk * 4; T.fill(ctx, G[0] - rr, G[1] - rr, G[0] + rr, G[1] + rr, T.mix(T.ME_HI, 1.0), Math.min(1, 0.4 + kk)); }
    } else if (t < land) {
      var u = T.clamp01((t - (T0 + GATHER)) / (LAND - GATHER));
      var trail = [[0.05, 0.25], [0.025, 0.5], [0.0, 1.0]];
      for (var q = 0; q < 3; q++) {
        var ug = T.clamp01(u - trail[q][0]);
        var pos = bez(G, S, 0.28, q === 2 ? eBack(ug, 1.0) : eIo(ug));
        var ss = 4.5 + 4.5 * Math.sin(Math.PI * ug);
        T.fill(ctx, pos[0] - ss, pos[1] - ss, pos[0] + ss, pos[1] + ss, T.mix(T.ME_HI, 1.0), trail[q][1]);
      }
    }
    if (t >= land) {
      var e = eOut((t - land) / FRAME);
      var rect = [S[0] - 4 + (24 - (S[0] - 4)) * e, S[1] - 4 + (56 - (S[1] - 4)) * e,
                  S[0] + 4 + (384 - (S[0] + 4)) * e, S[1] + 4 + (604 - (S[1] + 4)) * e];
      var lvl = 0.45 + 0.35 * PV.pulse(t);
      T.box(ctx, rect[0], rect[1], rect[2], rect[3], e > 0.97 ? '/dev/me  pid 4471' : '', e > 0.97 ? lvl : lvl + 0.35 * (1 - e));
      var k2 = Math.max(0, 1 - (t - land) / 0.92);
      if (k2 > 0) { var s2 = 4 + 3 * PV.pulse(t); T.fill(ctx, S[0] - s2, S[1] - s2, S[0] + s2, S[1] + s2, T.mix(T.ME_HI, 1.0), k2); }
    }
  });
})();

/* ---- C04：creation -> parameters。RETAIN：me.* 块先亮起但留在原地；
        chrome 收回 shell staging，Object() 框随之淡出。她不变。 ---- */
(function () {
  'use strict';
  var PV = window.PV, T = PV.tui;
  var T0 = 7.082, PRE = 0.22;
  PV.addCut(T0, PRE, 0.34, function (ctx, t, cut) {
    var k = T.clamp01((t - (T0 - PRE)) / 0.12) * (1 - T.clamp01((t - T0) / 0.16));
    if (t < T0) {
      PV.shotCreation(ctx, t, Math.max(0, t - 5.236), 7.082 - 5.236);
    } else {
      var lt = t - T0;
      PV.shotParameters(ctx, t, lt, T.clamp01(lt / (9.851 - T0)));
      var e = 1 - Math.pow(1 - Math.min(1, lt / 0.3), 3);
      ctx.save(); ctx.globalAlpha = Math.max(0, 1 - e);
      T.box(ctx, 404, 56, 1164, 604, 'me = Object()', 0.5, T.UI, t);
      ctx.restore();
    }
    /* 原始实现的 lift 是提亮「被点亮的元素」（B.lit(col,k)），不是整块蒙版；我们的镜头暂无该参数，宁可不做也不要白蒙一层（实测会引入 13+ 的假运动量）。 */
  });
})();

/* ---- C05：parameters -> init。CARRY：算完的 '552,000,000,000 params' 亮起、
        沿弧线升起、落在直方图标题位上（带一点过冲），落地后才成为标题。 ---- */
(function () {
  'use strict';
  var PV = window.PV, T = PV.tui;
  var T0 = 9.851, PRE = 0.3, LAND = 0.46, TEXT = '552,000,000,000 params';
  function eIo(u) { u = T.clamp01(u); return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2; }
  function eBack(u, s) { u = T.clamp01(u); var c = s * 1.70158; return 1 + (c + 1) * Math.pow(u - 1, 3) + c * Math.pow(u - 1, 2); }
  function bez(p0, p1, bend, u) {
    var mx = (p0[0] + p1[0]) / 2, my = (p0[1] + p1[1]) / 2, dx = p1[0] - p0[0], dy = p1[1] - p0[1];
    var cx = mx - dy * bend, cy = my + dx * bend, a = 1 - u;
    return [a * a * p0[0] + 2 * a * u * cx + u * u * p1[0], a * a * p0[1] + 2 * a * u * cy + u * u * p1[1]];
  }
  PV.addCut(T0, PRE, 0.62, function (ctx, t, cut) {
    var land = T0 + LAND;
    PV.reveal(ctx, t,
      function (c) { PV.shotParameters(c, t, Math.max(0, t - 7.082), (t - 7.082) / (9.851 - 7.082), { counter: false }); },
      function (c) { PV.shotInit(c, t, Math.max(0, t - T0), T.clamp01((t - T0) / (11.005 - T0)), { title: t >= land, grow: T.ease(T.clamp01((t - (T0 + 0.20)) / 0.45)) }); },
      PV.radial(430, 90, T0 - 0.34, 2000),
      { region: [405, 44, 1164, 604], cell: [8, 16], dur: 0.09 });
    if (t < land) {
      var u = T.clamp01((t - (T0 - 0.06)) / (LAND + 0.06));
      var pos = bez([430, 520], [430, 70], -0.1, eBack(u, 0.35));
      var sc = (1 + (30 / 34 - 1) * eIo(u)) * (1 + 0.1 * Math.sin(Math.PI * u));
      ctx.save(); ctx.translate(pos[0], pos[1]); ctx.scale(sc, sc);
      T.textPIL(ctx, TEXT, 0, 0, T.css(T.mix(T.ME_TEXT, 0.95)), 34);
      ctx.restore();
    }
  });
})();

/* ---- C06：init -> world。MORPH：定型的柱条碎成点列，每个点飞向球面的一点
        （柱顶到上缘、柱身到下纬），到达时变成球面的字符；球在拍点上完整并继续自转。 ---- */
(function () {
  'use strict';
  var PV = window.PV, T = PV.tui;
  var T0 = 11.005, PRE = 0.26, TA = -0.23, TB = 0.23, BASE = 560, GX = 784, GY = 320, GR = 230;
  function eIo(u) { u = T.clamp01(u); return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2; }
  function glyph(z) { return z < 0.35 ? '\u00b7' : (z < 0.75 ? 'o' : 'O'); }
  var BARS = null;
  function bars() {
    if (BARS) return BARS;
    var ms = T0 + TA;
    BARS = PV.initBars(ms, (ms - 9.851) / (11.005 - 9.851));
    return BARS;
  }
  PV.addCut(T0, PRE, 0.32, function (ctx, t, cut) {
    var ms = T0 + TA, span = TB - TA;
    PV.reveal(ctx, t,
      function (c) { PV.shotInit(c, t, Math.max(0, t - 9.851), T.clamp01((t - 9.851) / (11.005 - 9.851)), { bars: false }); },
      function (c) { PV.shotWorld(c, t, Math.max(0, t - T0), T.clamp01((t - T0) / (12.389 - T0)), { globe: t >= T0 + TB }); },
      PV.radial(GX, GY, T0 - 0.12, 1400),
      { region: [405, 44, 1164, 604], cell: [8, 16], dur: 0.09 });
    var lift = T.clamp01((t - (T0 - PRE)) / 0.1), B = bars(), i;
    if (t < ms + 0.14) {
      var k = T.clamp01((t - (ms - 0.06)) / 0.2), hw = 4.5 * (1 - eIo(k));
      if (hw > 0.3) for (i = 0; i < B.length; i++) {
        /* 实测参考在这一段是浅灰白的柱条（与 init 镜头同色），不是琥珀 */
        if (B[i][1] > 0) T.fill(ctx, B[i][0] + 4.5 - hw, BASE - B[i][1], B[i][0] + 4.5 + hw, BASE,
                                T.ui(0.35 + 0.6 * B[i][2]), 1 - 0.5 * k);
      }
    }
    if (t >= ms - 0.06 && t < T0 + TB + 0.02) {
      var pts = PV.globePoints(t, GR);
      for (i = 0; i < pts.length; i++) {
        var gx = pts[i][0], gy = pts[i][1], z = pts[i][2];
        var fx = T.clamp01((gx - (GX - GR)) / (2 * GR)), fy = T.clamp01((gy - (GY - GR)) / (2 * GR));
        var b = B[Math.min(59, Math.max(0, Math.round(fx * 59)))];
        var sx = b[0] + 4.5, sy = BASE - b[1] * (1 - fy);
        var u = eIo(T.clamp01((t - (ms + 0.1 * Math.abs(fx - 0.5) * 2)) / (span - 0.1)));
        var x = sx + (gx - sx) * u, y = sy + (gy - sy) * u;
        if (u < 0.6) T.fill(ctx, x - 4, y - 1, x + 4, y + 1, T.mix(T.ANOM, 0.35 + 0.6 * b[2]), 1 - u * 0.5);
        else T.textPIL(ctx, glyph(z), x - 4, y - 8, T.ui(0.35 + 0.65 * z), 15);
      }
    }
  });
})();

/* ---- C07：world -> begin_sim。CARRY+MORPH：me/you 离开轨道飞进 population 行里各自的词
        （成为反白 chip）；球面的点塌缩成倒计时 '3' 的点阵，拍点上完整 —— 倒计时是用 world 拼出来的。 ---- */
(function () {
  'use strict';
  var PV = window.PV, T = PV.tui;
  var T0 = 12.389, PRE = 0.26, LAND = 0.23, GX = 784, GY = 320, GR = 230;
  var POP_TEXT = 'world.population = 2  (me, you)', POP_XY = [430, 572];
  function eIn(u) { u = T.clamp01(u); return u * u * u; }
  function eIo(u) { u = T.clamp01(u); return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2; }
  function eBack(u, s) { u = T.clamp01(u); var c = s * 1.70158; return 1 + (c + 1) * Math.pow(u - 1, 3) + c * Math.pow(u - 1, 2); }
  function bez(p0, p1, bend, u) {
    var mx = (p0[0] + p1[0]) / 2, my = (p0[1] + p1[1]) / 2, dx = p1[0] - p0[0], dy = p1[1] - p0[1];
    var cx = mx - dy * bend, cy = my + dx * bend, a = 1 - u;
    return [a * a * p0[0] + 2 * a * u * cx + u * u * p1[0], a * a * p0[1] + 2 * a * u * cy + u * u * p1[1]];
  }
  function glyph(z) { return z < 0.35 ? '\u00b7' : (z < 0.75 ? 'o' : 'O'); }
  var CELLS = null;
  function cells() {
    if (CELLS) return CELLS;
    var bits = PV.bannerBits('3', 14, 2.0), cw = 16 * T.MONO_ADV, out = [], q, r;
    for (r = 0; r < bits.height; r++) for (q = 0; q < bits.width; q++)
      if (bits.get(q, r)) out.push([GX - bits.width * cw / 2 + q * cw, 200 + r * 17]);
    out.sort(function (a, b) { return (a[1] - b[1]) || (a[0] - b[0]); });   /* 与原始实现同序 */
    CELLS = out; return CELLS;
  }
  PV.addCut(T0, PRE, 0.45, function (ctx, t, cut) {
    var land = T0 + LAND;
    PV.reveal(ctx, t,
      function (c) { PV.shotWorld(c, t, Math.max(0, t - 11.005), T.clamp01((t - 11.005) / (12.389 - 11.005)), { globe: false, markers: false }); },
      function (c) { PV.shotBeginSim(c, t, Math.max(0, t - T0), T.clamp01((t - T0) / (16.082 - T0)), 16.082 - T0, false, false, t < land); },
      PV.radial(GX, GY, T0 - 0.1, 1500),
      { region: [405, 44, 1164, 604], cell: [8, 16], dur: 0.09 });
    var lift = T.clamp01((t - (T0 - PRE)) / 0.12), i;
    if (t < land) {
      var pts = PV.globePoints(t, GR), C = cells();
      pts = pts.slice().sort(function (a, b) { return (a[1] - b[1]) || (a[0] - b[0]); });
      for (i = 0; i < pts.length; i++) {
        var gx = pts[i][0], gy = pts[i][1], z = pts[i][2];
        var cc = C[Math.floor(i * C.length / pts.length)];
        var u = eIo(T.clamp01((t - (T0 - 0.16 + 0.06 * (i / pts.length))) / (land - (T0 - 0.16 + 0.06 * (i / pts.length)))));
        var x = (gx - 4) + (cc[0] - (gx - 4)) * u, y = (gy - 8) + (cc[1] - (gy - 8)) * u;
        if (u < 0.7) T.textPIL(ctx, glyph(z), x, y, T.mix(T.ANOM, 0.35 + 0.65 * z), 15);
        else T.textPIL(ctx, '3', x, y, T.mix(T.ANOM, 0.95), 16);
      }
      var adv = 18 * T.MONO_ADV, words = [['me', 18, T.ME_TEXT], ['you', 23, T.UI]];
      for (var k = 0; k < 2; k++) {
        var w = words[k][0], idx = words[k][1];
        var x0 = POP_XY[0] + idx * adv - 3, y0 = POP_XY[1] - 1, x1 = x0 + w.length * adv + 6, y1 = POP_XY[1] + 21;
        var mp = PV.markerPos(Math.min(t, T0 - 0.1), k, GR);
        var uu = T.clamp01((t - (T0 - 0.1)) / (LAND + 0.1));
        var pos = bez(mp, [(x0 + x1) / 2, (y0 + y1) / 2], k ? 0.22 : -0.22, eBack(uu, 0.9));
        var hw = 5 + ((x1 - x0) / 2 - 5) * eIn(uu), hh = 5 + ((y1 - y0) / 2 - 5) * eIn(uu);
        T.fill(ctx, pos[0] - hw, pos[1] - hh, pos[0] + hw, pos[1] + hh, T.mix(words[k][2], 1.0), 1);
        if (uu < 0.6) T.textMono(ctx, w, pos[0] + 10 + 6 * uu, pos[1] - 10, T.mix(words[k][2], 1.0), 16);
        else if (uu > 0.72) T.textMono(ctx, w, x0 + 3, POP_XY[1], T.BG, 18);
      }
    }
  });
})();

/* ---- C23：dizzy -> travel。只在窗格内后拉：旋转的碗向右离开，年份条（已在 2026 AD）从左边进来，
        落在第 110.5 拍（'Oh, we can travel'）；窗格标题条从左逐格解码。 ---- */
(function () {
  'use strict';
  var PV = window.PV, T = PV.tui;
  var T0 = 50.928, PRE = 0.25, BEAT = 60 / 130;
  var X0 = 406, Y0 = 68, X1 = 1163, Y1 = 603, W = X1 - X0, H = Y1 - Y0;
  var TITLE = [404, 44, 1164, 68];
  function eIo(u) { u = T.clamp01(u); return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2; }
  function mk() { var c = PV.newCanvas(1280, 720); return c; }
  PV.addCut(T0, PRE, 0.3, function (ctx, t, cut) {
    var oc = mk(), nc = mk();
    if (PV.drawBackground) { PV.drawBackground(oc.getContext('2d'), t); PV.drawBackground(nc.getContext('2d'), t); }
    PV.shotDizzy(oc.getContext('2d'), t, Math.max(0, t - 49.082));
    PV.shotTravel(nc.getContext('2d'), t, Math.max(0, t - T0));
    var e = eIo((t - (T0 - BEAT / 2)) / BEAT);
    /* 底：整幅按 pick 取旧或新 */
    ctx.drawImage(t < T0 ? oc : nc, 0, 0);
    /* 标题条：逐格从左扫过 */
    ctx.save(); ctx.beginPath(); ctx.rect(TITLE[0], TITLE[1], TITLE[2] - TITLE[0], TITLE[3] - TITLE[1]); ctx.clip();
    PV.reveal(ctx, t,
      function (c) { c.drawImage(oc, 0, 0); },
      function (c) { c.drawImage(nc, 0, 0); },
      function (x) { return T0 - 0.2 + (x - 404) / 1900; },
      { region: TITLE, cell: [8, 12], dur: 0.09 });
    ctx.restore();
    /* 窗格主体：后拉平移——旧内容向右退出，新内容从左进入 */
    ctx.save(); ctx.beginPath(); ctx.rect(X0, Y0, W, H); ctx.clip();
    if (PV.drawBackground) PV.drawBackground(ctx, t);
    var off = Math.round(W * e), h = H;
    if (off < W) ctx.drawImage(oc, X0, Y0, W - off, h, X0 + off, Y0, W - off, h);
    if (off > 0) ctx.drawImage(nc, X1 - off, Y0, off, h, X0, Y0, off, h);
    ctx.restore();
  });
})();

/* ---- C21：current -> blind。八条功率轨迹亮起、各自量化成十二段（在矩阵列上采样保持），
        再胀成格子逐排填进注意力矩阵；最后一排锁在 102.5 拍，每排落地后把下一排展开出来。
        GPU 标签从矩阵原点解码移开。随后在 'blind'（103 拍）上遮罩从左上一扫而下。 ---- */
(function () {
  'use strict';
  var PV = window.PV, T = PV.tui;
  var T0 = 47.236, PRE = 0.34, BEAT = 60 / 130, SEG = 640 / 12;
  var ROWS21 = [0, 2, 3, 5, 6, 8, 9, 11], UNFOLD21 = { 1: 0, 4: 3, 7: 6, 10: 9 };
  var MX = 470, MY = 80, N = 12, CS = 40, CUR0 = 44.005, WHITE = [232, 238, 255];
  function eIo(u) { u = T.clamp01(u); return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2; }
  function eOut(u) { u = T.clamp01(u); return 1 - Math.pow(1 - u, 3); }
  function qStart(g) { return T0 - 0.30 + g * 0.01; }
  function depart(g) { return qStart(g) + 0.12; }
  function land(g) { return T0 + BEAT / 2 - (7 - g) * 0.02; }
  function unfold(i) { var g = ROWS21.indexOf(UNFOLD21[i]); return [land(g) + 0.02, land(g) + 0.18]; }
  function rect(i, j) { return [MX + j * CS, MY + i * CS, MX + j * CS + CS - 2, MY + i * CS + CS - 2]; }
  function cellColor(i, j) { return T.mix(T.ANOM, 0.06 + 0.94 * PV.blindCellValue(i, j)); }
  function cellA(t) {
    var m = {}, g, i;
    for (g = 0; g < 8; g++) m[ROWS21[g]] = land(g);
    for (i in UNFOLD21) m[i] = unfold(i)[1];
    return function (a, b) { return t >= m[a] ? 1 : 0; };
  }
  PV.addCut(T0, PRE, 0.45, function (ctx, t, cut) {
    var nc = PV.newCanvas(1280, 720), ng = nc.getContext('2d');
    if (PV.drawBackground) PV.drawBackground(ng, t);
    PV.shotBlind(ng, t, Math.max(0, t - T0), cellA(t));
    PV.reveal(ctx, t,
      function (c) { PV.shotCurrent(c, t, Math.max(0, t - CUR0), { traces: false }); },
      function (c) { c.drawImage(nc, 0, 0); },
      PV.radial(MX, MY, T0 - 0.12, 1600),
      { region: [405, 44, 1164, 604], cell: [8, 16], dur: 0.09 });
    /* 矩阵区原本只有轨迹：落位的格子直接贴回去 */
    ctx.drawImage(nc, MX, MY, N * CS, N * CS, MX, MY, N * CS, N * CS);
    var lift = T.clamp01((t - (T0 - PRE)) / 0.15), g, j, i, p;
    for (g = 0; g < 8; g++) {
      var r = ROWS21[g];
      if (t >= land(g)) continue;
      var live = PV.currentTrace(g, t, t - CUR0)[0];
      var q = eIo((t - qStart(g)) / 0.12), u = T.clamp01((t - depart(g)) / (land(g) - depart(g)));
      for (j = 0; j < 12; j++) {
        var seg = [], xa = 460 + j * SEG, xb = 460 + (j + 1) * SEG;
        for (p = 0; p < live.length; p++) if (live[p][0] >= xa && live[p][0] < xb) seg.push(live[p]);
        if (seg.length < 2) continue;
        var mean = 0;
        for (p = 0; p < seg.length; p++) mean += seg[p][1];
        mean /= seg.length;
        var base = [255 + (WHITE[0] - 255) * 0.7 * lift, 204 + (WHITE[1] - 204) * 0.7 * lift, 0 + (WHITE[2] - 0) * 0.7 * lift];
        var cc = cellColor(r, j), e2 = eOut(u);
        var col = [base[0] + (cc[0] - base[0]) * e2, base[1] + (cc[1] - base[1]) * e2, base[2] + (cc[2] - base[2]) * e2];
        if (u <= 0) {
          var trim = 7 * q, sxa = seg[0][0] + trim, sxb = seg[seg.length - 1][0] - trim;
          if (sxb > sxa) {
            ctx.save(); ctx.strokeStyle = T.css(col); ctx.lineWidth = lift > 0.5 ? 2 : 1; ctx.beginPath();
            var st = false;
            for (p = 0; p < seg.length; p++) {
              if (seg[p][0] < sxa || seg[p][0] > sxb) continue;
              var yy = seg[p][1] + (mean - seg[p][1]) * q;
              if (!st) { ctx.moveTo(seg[p][0], yy); st = true; } else ctx.lineTo(seg[p][0], yy);
            }
            ctx.stroke(); ctx.restore();
          }
          continue;
        }
        var s0 = seg[0][0] + 7, s1 = seg[seg.length - 1][0] - 7, rc = rect(r, j);
        var tcx = (rc[0] + rc[2]) / 2, tcy = (rc[1] + rc[3]) / 2;
        var cx = (s0 + s1) / 2 + (tcx - (s0 + s1) / 2) * e2, cy = mean + (tcy - mean) * e2;
        var w = ((s1 - s0) + ((rc[2] - rc[0]) - (s1 - s0)) * e2) / 2;
        var hh = 1 + ((rc[3] - rc[1]) / 2 - 1) * e2;
        T.fill(ctx, cx - w, cy - hh, cx + w, cy + hh, col, 1);
      }
    }
    for (i in UNFOLD21) {
      var uf = unfold(i);
      if (t < uf[0] || t >= uf[1]) continue;
      var eu = eOut((t - uf[0]) / (uf[1] - uf[0]));
      for (j = 0; j < 12; j++) {
        var rs = rect(UNFOLD21[i], j), rd = rect(i, j);
        var cc2 = cellColor(UNFOLD21[i], j), cd = cellColor(i, j);
        var cm = [cc2[0] + (cd[0] - cc2[0]) * eu, cc2[1] + (cd[1] - cc2[1]) * eu, cc2[2] + (cd[2] - cc2[2]) * eu];
        var y0 = rs[1] + (rd[1] - rs[1]) * eu;
        T.fill(ctx, rs[0], y0, rs[2], y0 + (rd[3] - rd[1]), cm, 1);
      }
    }
    for (g = 0; g < 8; g++) {
      var k = 1 - (t - land(g)) / 0.12;
      if (k <= 0 || k > 1) continue;
      for (j = 0; j < 12; j++) { var rf = rect(ROWS21[g], j); T.fill(ctx, rf[0], rf[1], rf[2], rf[3], WHITE, 0.35 * k * k); }
    }
  });
})();

/* ---- C22：blind -> dizzy。只有窗格内容在转：遮罩矩阵躺下（镜头俯过去）、在 'So dizzy' 上开始自旋、
        并弯成 loss 曲面；每个格子翻滚着缩成它那片碗面上的点，对角格 (9,9) 变成球 theta。 ---- */
(function () {
  'use strict';
  var PV = window.PV, T = PV.tui;
  var T0 = 49.082, PRE = 0.3;
  var N = 12, CS = 40, MX = 470, MY = 80;
  var M0 = [MX + N * CS / 2 - 1.5, MY + N * CS / 2 - 0.5];
  /* 不要在模块顶层读 PV.dizzy：万一加载顺序变了会整页抛错。运行时再取。 */
  function dzU() { return CS / PV.dizzy.DZ.kx; }
  function dzH0() { return (CS - 3) / 2 / PV.dizzy.DZ.kx; }
  function eIo(u) { u = T.clamp01(u); return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2; }
  function eIn(u) { u = T.clamp01(u); return u * u * u; }
  function shrinkT(i, j) {
    var rr = PV.mt(i * 31 + j).random();
    return T0 + 0.16 * (Math.hypot(i - 5.5, j - 5.5) / 7.8) + 0.06 * rr;
  }
  function parentOf(x, y, U) {
    function f(v) { return Math.min(N - 1, Math.max(0, Math.floor(v / U + N / 2))); }
    return [f(y), f(x)];
  }
  function projOf(t) {
    var a = eIo((t - (T0 - 0.12)) / 0.45), b = eIo((t - T0) / 0.42), DZ = PV.dizzy.DZ;
    var cx = M0[0] + (DZ.cx - M0[0]) * a, cy = M0[1] + (DZ.cy - M0[1]) * a;
    var ky = DZ.kx + (DZ.ky - DZ.kx) * a, kz = DZ.kz * b, rot = PV.dizzyRot(t);
    return function (x, y, z) { return PV.dizzyProject(x, y, rot, cx, cy, ky, kz, z); };
  }
  function cellColor(i, j) { return T.mix(T.ANOM, 0.06 + 0.94 * PV.blindCellValue(i, j)); }
  PV.addCut(T0, PRE, 0.5, function (ctx, t, cut) {
    var DZ = PV.dizzy.DZ, proj = projOf(t), i, j, k;
    var oc = PV.newCanvas(1280, 720), og = oc.getContext('2d');
    var bare = PV.newCanvas(1280, 720), bg2 = bare.getContext('2d');
    if (PV.drawBackground) { PV.drawBackground(og, t); PV.drawBackground(bg2, t); }
    PV.shotBlind(og, t, Math.max(0, t - 47.236), null);
    PV.shotBlind(bg2, t, Math.max(0, t - 47.236), null);
    var stage1 = PV.newCanvas(1280, 720), sg = stage1.getContext('2d');
    PV.reveal(sg, t, function (c) { c.drawImage(og, 0, 0); }, function (c) { c.drawImage(bare, 0, 0); },
      PV.radial(990, 140, T0 - 0.14, 1400), { region: [405, 44, 1164, 604], cell: [8, 16], dur: 0.09 });
    var nc = PV.newCanvas(1280, 720), ng = nc.getContext('2d');
    if (PV.drawBackground) PV.drawBackground(ng, t);
    PV.shotDizzy(ng, t, Math.max(0, t - T0));
    PV.reveal(ctx, t, function (c) { c.drawImage(stage1, 0, 0); }, function (c) { c.drawImage(nc, 0, 0); },
      PV.radial(DZ.cx, DZ.cy, T0 + 0.12, 1500), { region: [405, 44, 1164, 604], cell: [8, 16], dur: 0.09 });
    /* 碗面上的点：由它对应的矩阵格缩小到消失时冒出来 */
    for (var il = 0; il < DZ.n; il++) for (var jl = 0; jl < DZ.n; jl++) {
      var xy = PV.dizzy.gridXY(il, jl), par = parentOf(xy[0], xy[1], dzU());
      var al = T.clamp01((t - shrinkT(par[0], par[1]) - 0.06) / 0.14);
      if (al <= 0.01) continue;
      var zz = PV.dizzy.surfaceZ(xy[0], xy[1]), pp = proj(xy[0], xy[1], zz);
      if (!PV.dizzy.inside(pp[0], pp[1], 2)) continue;
      T.fill(ctx, pp[0], pp[1], pp[0] + 2, pp[1] + 2, PV.dizzy.dotColor(zz), al);
    }
    /* 矩阵格子：翻滚着缩下去 */
    for (i = 0; i < N; i++) for (j = 0; j < N; j++) {
      var s0 = eIn((t - shrinkT(i, j)) / 0.18);
      if (s0 >= 1) continue;
      var U = dzU(), H0 = dzH0();
      var x = (j - 5.5) * U, y = (i - 5.5) * U, hs = H0 * (1 - s0) + 0.01 * s0;
      var ph = s0 * 2.4 * ((i + j) % 2 ? 1 : -1), cs = Math.cos(ph), sn = Math.sin(ph);
      var quad = [[-hs, -hs], [hs, -hs], [hs, hs], [-hs, hs]], pts = [];
      for (k = 0; k < 4; k++) {
        var uu = quad[k][0], vv = quad[k][1];
        pts.push(proj(x + cs * uu - sn * vv, y + sn * uu + cs * vv));
      }
      var any = false;
      for (k = 0; k < 4; k++) if (PV.dizzy.inside(pts[k][0], pts[k][1])) any = true;
      if (!any) continue;
      var lift22 = T.clamp01((t - (T0 - PRE)) / 0.15);
      var tm = PV.maskTime(i, j), masked = (tm !== null && t >= tm);
      var col = masked ? [0, 0, 0] : cellColor(i, j);
      if (!masked) { var w22 = 0.2 * lift22; col = [col[0] + (232 - col[0]) * w22, col[1] + (238 - col[1]) * w22, col[2] + (255 - col[2]) * w22]; }
      if (i === 9 && j === 9) col = [col[0] + (120 - col[0]) * s0, col[1] + (148 - col[1]) * s0, col[2] + (255 - col[2]) * s0];
      ctx.save(); ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
      for (k = 1; k < 4; k++) ctx.lineTo(pts[k][0], pts[k][1]);
      ctx.closePath(); ctx.fillStyle = T.css(col); ctx.fill(); ctx.restore();
    }
  });
})();

/* ---- C24：travel -> unite（进入正歌段）。30 根 position-id bar 亮起、两两合并（BPE.MERGE），
        成对沿弧线飞进两行 tokenizer 的 chip 槽位，在拍点上锁成 token chip；
        unite 面板从 bars 起飞处向外解码；她的窗格自上而下逐格重绘（一条发亮的重绘前锋线）。 ---- */
(function () {
  'use strict';
  var PV = window.PV, T = PV.tui;
  var T0 = 54.159, PRE = 0.3, BEAT = 60 / 130;
  var LAND = T0 + BEAT, MERGE = T0 - 0.1, SIDE0 = T0 - 0.08;
  var STRIP = [428, 300, 1146, 382], SEED = [784, 345];
  var SIDE = [20, 42, 388, 614], BODY = [400, 36, 1168, 612];
  var SIDE_SPEED = (SIDE[3] - SIDE[1]) / (LAND - SIDE0);
  function eIo(u) { u = T.clamp01(u); return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2; }
  function bez(p0, p1, bend, u) {
    var mx = (p0[0] + p1[0]) / 2, my = (p0[1] + p1[1]) / 2, dx = p1[0] - p0[0], dy = p1[1] - p0[1];
    var cx = mx - dy * bend, cy = my + dx * bend, a = 1 - u;
    return [a * a * p0[0] + 2 * a * u * cx + u * u * p1[0], a * a * p0[1] + 2 * a * u * cy + u * u * p1[1]];
  }
  var BARS = null, PLAN = null;
  function bars(t) {
    if (BARS) return BARS;
    var tt = Math.min(t, MERGE - 1e-6), pos0 = PV.travelPos(tt), out = [], i;
    for (i = 0; i < 30; i++) {
      var pos = Math.floor(pos0) - i * 173, x = 430 + i * 24, hh = 40 + 30 * Math.sin(pos * 0.01);
      out.push([x, 380 - hh, x + 19, 381, T.ui(0.3 + 0.02 * i)]);
    }
    if (t >= MERGE) BARS = out;
    return out;
  }
  function plan() {
    if (PLAN) return PLAN;
    var slots = [], row, k, x, F, i, j, p;
    for (row = 0; row < 2; row++) {
      var v = 70 + 30 * row;
      F = Math.floor((LAND * v) / 90);
      for (k = 0; k < 12; k++) {
        x = 420 + k * 90 - (LAND * v) % 90;
        if (x > 410 && x < 1090) slots.push([x, row, k + F]);
      }
    }
    slots.sort(function (a, b) { return a[0] - b[0]; });
    var pairs = [];
    for (p = 0; p < 15; p++) pairs.push(430 + 48 * p + 21);
    var n = pairs.length, m = slots.length, pick = [];
    if (m >= n) {
      var INF = 1e18, best = [];
      for (i = 0; i <= n; i++) { best.push([]); for (j = 0; j <= m; j++) best[i].push(INF); }
      for (j = 0; j <= m; j++) best[0][j] = 0;
      for (i = 1; i <= n; i++) for (j = i; j <= m; j++)
        best[i][j] = Math.min(best[i][j - 1], best[i - 1][j - 1] + Math.abs(pairs[i - 1] - slots[j - 1][0] - 35));
      var jj = m;
      for (i = n; i >= 1; i--) {
        while (jj > i && best[i][jj] === best[i][jj - 1]) jj--;
        pick.push(jj - 1); jj--;
      }
      pick.reverse();
    } else if (n > 1) {
      for (p = 0; p < n; p++) pick.push(Math.round(p * (m - 1) / (n - 1)));
    } else pick.push(0);
    PLAN = [];
    for (p = 0; p < n; p++) {
      var s = slots[pick[p]], sx = s[0], rw = s[1], g = s[2];
      var kk = g - Math.floor((LAND * (70 + 30 * rw)) / 90);
      var word = PV.VOCAB[((kk * 7 + rw * 3 + Math.floor(LAND * 2)) % PV.VOCAB.length + PV.VOCAB.length) % PV.VOCAB.length];
      var bend;
      if (rw === 0) {
        var x160 = pairs[p] + 0.72 * (sx + 35 - pairs[p]);
        bend = ((x160 < 560 || x160 > 1010) ? 0.55 : 0.2) * (pairs[p] < 784 ? -1 : 1);
      } else bend = 0.25 * ((p % 4 === 0) ? 1 : -1);
      PLAN.push({ p: p, row: rw, g: g, word: word, depart: MERGE + 0.012 * p, bend: bend, sx: sx });
    }
    return PLAN;
  }
  function shown(t) { plan(); return function () { return t >= LAND ? 1 : 0; }; }
  PV.addCut(T0, PRE, 0.62, function (ctx, t, cut) {
    var oc = PV.newCanvas(1280, 720), og = oc.getContext('2d');
    if (PV.drawBackground) PV.drawBackground(og, t);
    PV.shotTravel(og, t, Math.max(0, t - 50.928), { bars: false });
    /* travel 的 bar 条被抽走了：把那一条擦成背景 */
    var bgc = PV.newCanvas(1280, 720), bg2 = bgc.getContext('2d');
    if (PV.drawBackground) PV.drawBackground(bg2, t);
    og.drawImage(bgc, STRIP[0], STRIP[1], STRIP[2] - STRIP[0], STRIP[3] - STRIP[1], STRIP[0], STRIP[1], STRIP[2] - STRIP[0], STRIP[3] - STRIP[1]);
    var nc = PV.newCanvas(1280, 720), ng = nc.getContext('2d');
    if (PV.drawBackground) PV.drawBackground(ng, t);
    PV.shotUnite(ng, t, Math.max(0, t - T0), 56.697 - T0, { chip: shown(t) });
    var stage = PV.newCanvas(1280, 720), sg = stage.getContext('2d');
    PV.reveal(sg, t, function (c) { c.drawImage(oc, 0, 0); }, function (c) { c.drawImage(nc, 0, 0); },
      PV.radial(SEED[0], SEED[1], T0 - 0.08, 2400), { region: BODY, cell: [8, 16], dur: 0.09 });
    PV.reveal(ctx, t, function (c) { c.drawImage(stage, 0, 0); }, function (c) { c.drawImage(nc, 0, 0); },
      function (x, y) { return SIDE0 + (y - SIDE[1]) / SIDE_SPEED; }, { region: SIDE, cell: [8, 13], dur: 0.09 });
    /* 她的重绘前锋线 */
    var fy = SIDE[1] + (t - SIDE0) * SIDE_SPEED;
    if (fy > 58 && fy < 602) T.fill(ctx, 30, fy, 378, fy + 1, T.mix(T.ME_TEXT, 0.9), 0.9);
    /* carriers：两两合并 -> 成对飞向 chip 槽位 */
    if (t < LAND + 0.1) {
      var lift = T.clamp01((t - (T0 - PRE)) / 0.18), merge = eIo((t - (MERGE - 0.1)) / 0.1);
      var B = bars(t), P = plan(), q;
      for (q = 0; q < P.length; q++) {
        var c = P[q], b0 = B[2 * c.p], b1 = B[2 * c.p + 1];
        var wht = 0.55 * lift;
        var c0 = [b0[4][0] + (236 - b0[4][0]) * wht, b0[4][1] + (240 - b0[4][1]) * wht, b0[4][2] + (252 - b0[4][2]) * wht];
        var c1 = [b1[4][0] + (236 - b1[4][0]) * wht, b1[4][1] + (240 - b1[4][1]) * wht, b1[4][2] + (252 - b1[4][2]) * wht];
        var cm = [(c0[0] + c1[0]) / 2, (c0[1] + c1[1]) / 2, (c0[2] + c1[2]) / 2];
        if (t < c.depart) {
          var hm = ((b0[3] - b0[1]) + (b1[3] - b1[1])) / 2, s0, s1, hh;
          hh = (b0[3] - b0[1]) + (hm - (b0[3] - b0[1])) * merge; s1 = b0[2] + 3 * merge;
          T.fill(ctx, b0[0], b0[3] - hh, s1, b0[3], c0, 1);
          hh = (b1[3] - b1[1]) + (hm - (b1[3] - b1[1])) * merge; s0 = b1[0] - 3 * merge;
          T.fill(ctx, s0, b1[3] - hh, b1[2], b1[3], c1, 1);
        } else {
          var u = eIo(T.clamp01((t - c.depart) / (LAND - c.depart)));
          var mx = (b0[0] + b1[2]) / 2, my = 381 - ((b0[3] - b0[1]) + (b1[3] - b1[1])) / 4;
          var tx = c.sx + 35, ty = 80 + c.row * 170 + 11;
          var pos = bez([mx, my], [tx, ty], c.bend, u);
          var hw = 9 + (35 - 9) * u, hh2 = 20 + (11 - 20) * u;
          T.fill(ctx, pos[0] - hw, pos[1] - hh2, pos[0] + hw, pos[1] + hh2, cm, 1);
          if (u > 0.55) T.textMono(ctx, c.word, pos[0] - 30, pos[1] - 8, T.BG, 15);
        }
      }
    }
  });
})();
