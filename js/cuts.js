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
