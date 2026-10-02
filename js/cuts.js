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
        function (c) { var q = PV.shotTime('shot_dimension', t); PV.shotDimension(c, t, q[0], q[1]); },
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
