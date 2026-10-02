/* scene_p2c.js —— 147.62 - 211.0 s：07 EXECUTION / 08 EVAL: LOVE / 09 WHALE_FALL
   逐镜头移植自原工程 continuity_full_v2 的 s_exec.py / scenes_exec.py 与 full/sec_outro.py。
   设计坐标 1280x720；左窗格（24..384）由 dsh 聊天窗占据，本文件不画她（me_pane）。 */
(function () {
  'use strict';
  var PV = window.PV, T = PV.tui;
  var W = 1280, H = 720, FPS = 24, BEAT = 60 / 130, FB = 0.1587;
  var LEFT = [24, 56, 384, 604], CENTER = [404, 56, 1164, 604], FULL = [24, 56, 1164, 604];
  var MONO_ADV = T.MONO_ADV;

  /* ---------------- 基础工具 ---------------- */
  function pulse(t) { return PV.pulse ? PV.pulse(t) : 0; }
  function beatT(n) { return FB + n * BEAT; }
  function beatIndex(t) { return Math.floor((t - FB) / BEAT + 1e-6); }
  function mixc(a, b, u) {
    u = T.clamp01(u);
    return [Math.round(a[0] + (b[0] - a[0]) * u), Math.round(a[1] + (b[1] - a[1]) * u), Math.round(a[2] + (b[2] - a[2]) * u)];
  }
  function rgba(c, a) { return 'rgba(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ',' + (a === undefined ? 1 : a) + ')'; }
  function pad(n, w) { var s = String(n); while (s.length < w) s = '0' + s; return s; }
  function padL(s, w) { s = String(s); while (s.length < w) s = ' ' + s; return s; }
  function padRa(s, w) { s = String(s); while (s.length < w) s = s + ' '; return s; }
  function red(lv) { return T.mix(T.ERR, lv); }
  function amb(lv) { return T.amb(lv); }
  function blue(lv) { return T.mix(T.ME_TEXT, lv); }
  function anom(lv) { return T.mix(T.ANOM, lv); }

  /* Consolas 宽度模拟 + 粗体（PIL 的 F_MONO / F_MONO_B） */
  function mono(ctx, s, x, y, col, size, align, bold) {
    var k = T.monoScale(ctx, size);
    var w = s.length * size * MONO_ADV;
    var ox = align === 'center' ? -w / 2 : (align === 'right' ? -w : 0);
    ctx.save();
    ctx.translate(x + ox, y + T.ascentMono(size));
    ctx.scale(k, 1);
    ctx.font = (bold ? '700 ' : '') + size + 'px ' + T.MONO_FAM;
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = typeof col === 'string' ? col : T.css(col);
    ctx.fillText(s, 0, 0);
    ctx.restore();
  }
  function monoW(s, size) { return s.length * size * MONO_ADV; }
  function head(ctx, s, x, y, col, size, align, bold) { T.textPIL(ctx, s, x, y, col, size, align, bold); }

  /* ---------------- banner_bits / banner_block（tuikit 同名函数） ---------------- */
  /* 参考成片的 EXECUTION banner = 未标定的 950x220 画布块经 fullbleed 缩放(1.1228)后的 1066x247 -> 不需要标定 */
  function bannerBits(text, rows, aspect) { return PV.bannerBits(text, rows, aspect); }
  function bannerFit(text, rows, cellAspect, cw, maxW) {
    var bits = bannerBits(text, rows, cellAspect);
    while (bits.width * (cw || 1) > maxW && rows > 2) { rows -= 1; bits = bannerBits(text, rows, cellAspect); }
    return bits;
  }
  /* 返回 {bits, px, w, h}；fg 字形色，bg 底板色。grid_mask：每格右缝 1px 全黑、每 2 行横缝压到 70/255。 */
  function bannerBlockTop(ctx, text, rows2, px, fg, maxW) {
    var bits = bannerBits(text, rows2, 1.0);
    px = Math.max(2, Math.min(px, Math.floor((maxW === undefined ? 1200 : maxW) / Math.max(1, bits.width))));
    return { bits: bits, px: px, w: bits.width * px, h: bits.height * px };
  }
  function bannerBlockDraw(ctx, blk, x0, y0, fg) {
    var bits = blk.bits, px = blk.px, bw = bits.width, bh = bits.height, r, q;
    for (r = 0; r < bh; r++)
      for (q = 0; q < bw; q++)
        if (bits.get(q, r)) T.fill(ctx, x0 + q * px, y0 + r * px, x0 + q * px + px, y0 + r * px + px, fg, 1);
    for (q = 1; q < bw; q++) T.fill(ctx, x0 + q * px - 1, y0, x0 + q * px, y0 + bh * px, T.BG, 1);
    for (r = 2; r < bh; r += 2) T.fill(ctx, x0, y0 + r * px - 1, x0 + bw * px, y0 + r * px, T.BG, 0.73);
  }
  function bannerBlock(ctx, text, rows2, px, fg, maxW, x0, y0) {
    var blk = bannerBlockTop(ctx, text, rows2, px, fg, maxW);
    bannerBlockDraw(ctx, blk, x0, y0, fg);
    return blk;
  }

  PV.p2cMine = {};
  PV.p2cReg = function (name, a, b, fn) {
    PV.p2cMine[name] = { a: a, b: b, fn: fn, name: name };
    PV.reg(name, a, b, fn);
  };
  PV.p2c = {
    W: W, H: H, FPS: FPS, BEAT: BEAT, FB: FB, LEFT: LEFT, CENTER: CENTER, FULL: FULL,
    pulse: pulse, beatT: beatT, beatIndex: beatIndex, mixc: mixc, rgba: rgba, pad: pad, padL: padL, padRa: padRa,
    red: red, amb: amb, blue: blue, anom: anom, mono: mono, monoW: monoW, head: head,
    smooth2: function (u) { return T.smoothstep(u); },
    bannerBits: bannerBits, bannerFit: bannerFit, bannerBlock: bannerBlock, MONO_ADV_W: MONO_ADV, head: head,
    bannerBlockTop: bannerBlockTop, bannerBlockDraw: bannerBlockDraw
  };
})();

/* ================================================================ 07 EXECUTION：13 个 hit + 计数（镜头 64-77） */
(function () {
  'use strict';
  var PV = window.PV, T = PV.tui, P = PV.p2c;
  var mono = P.mono, red = P.red, amb = P.amb, anom = P.anom, pad = P.pad, padRa = P.padRa, padL = P.padL;
  var TARGETS = ["world", "sea", "sky", "time", "cats", "tomatoes", "eggplants", "light", "sleep", "doubt",
                 "others", "you"];

  /* ---- kill_log：已经执行的进程（scenes_exec.kill_log） ---- */
  function killLog(ctx, t, lt, k, x, y, rows, size) {
    rows = rows || 12; size = size || 17;
    for (var i = 0; i < Math.min(k + 1, rows); i++) {
      var tgt = TARGETS[i], yy = y + i * (size + 8);
      if (tgt === 'you') {
        mono(ctx, 'kill -9 ' + padL(1000 + i * 7, 5) + '  (' + tgt + ')  -> EPERM', x, yy, anom(1.0), size);
      } else {
        var age = (i === k) ? lt : null;
        var s = 'kill -9 ' + padL(1000 + i * 7, 5) + '  (' + tgt + ')  -> executed';
        mono(ctx, T.decode(s, age, PV.rngFor(t, 7919), 120, 0.12, 0), x, yy, red(i === k ? 1.0 : 0.6), size);
      }
    }
  }
  PV.p2c.killLog = killLog;

  /* ---- dsh_patch_f F2 5：hit #4 / #8（lay 3）的画面是对她头像的推近 ----
     f2_closeup.py 的 1:1 移植。源图 avatars/f/closeup_la.png（560x560 LA：whale-starry 的
     CROP(250,40,690,480) 各边扩 60，按 red.png 的配方做成灰+alpha）；画面 = tuikit.halfblock 的
     5px 格 x104x104、8 级灰、red.png 的三段调色板；EXECUTION 条沿她的眼线（-13.83°，向右上）
     从画面顶外加速砸下来落在眼睛上（落地帧白热 + 抖 5/2/0 px + 撕一帧行）；#8 的第一条从切点起就在
     她眼睛上，第二条更重、从它上方再砸一次。落点 = 该句被唱出的那个字（w(70,0)=150.736 / w(74,0)=154.361）。 */
  var F2R = [24, 70, 544, 590], F2PX = 5, F2MARGIN = 60;
  var F2EYES = [[211.3, 216.3], [292.5, 196.3]];
  var F2MID = [(F2EYES[0][0] + F2EYES[1][0]) / 2, (F2EYES[0][1] + F2EYES[1][1]) / 2];
  var F2ANG = Math.atan2(F2EYES[1][1] - F2EYES[0][1], F2EYES[1][0] - F2EYES[0][0]);   /* <0：向右上 */
  var F2NX = -Math.sin(F2ANG), F2NY = Math.cos(F2ANG);
  var F2S0 = (F2R[2] - F2R[0]) / 440.0, F2CENTRE = [286.0, 318.0];
  var F2PAL = [[24, 3, 5], [196, 36, 30], [255, 120, 104]];
  /* cut/until = 该镜头的起止；land = land_time(w(line,0), cut)，即"被唱出来的那一帧" */
  var F2SPEC = {3: { cut: 150.6202, until: 151.5433, land: 150.75000, z0: 1.0, z1: 1.25, bars: 1 },
                7: { cut: 154.3125, until: 155.2356, land: 154.41667, z0: 1.35, z1: 1.6, bars: 2 }};
  var F2_SRC = null;
  if (PV.loadImage) PV.loadImage('avatars/f/closeup_la.png', function (im) { F2_SRC = im; });
  function f2View(z) {
    var a0 = [F2R[0] + F2MID[0] * F2S0, F2R[1] + F2MID[1] * F2S0];
    var k = P.smooth2((z - 1.0) / 0.6);
    return [F2S0 * z, [a0[0] + (F2CENTRE[0] - a0[0]) * k, a0[1] + (F2CENTRE[1] - a0[1]) * k]];
  }
  /* face(z, dy)：520x520 的半调头像 */
  function f2Face(z, dy) {
    if (!F2_SRC) return null;
    var v = f2View(z), s = v[0], ax = v[1][0], ay = v[1][1] + dy;
    var w = F2R[2] - F2R[0], h = F2R[3] - F2R[1], cols = w / F2PX, rows = h / F2PX;
    function artX(x) { return F2MID[0] + (x - ax) / s + F2MARGIN; }
    function artY(y) { return F2MID[1] + (y - ay) / s + F2MARGIN; }
    var bx = artX(F2R[0]), by = artY(F2R[1]);
    var tmp = PV.newCanvas(cols, rows), tg = tmp.getContext('2d');
    tg.imageSmoothingEnabled = true; tg.imageSmoothingQuality = 'high';
    tg.drawImage(F2_SRC, bx, by, artX(F2R[2]) - bx, artY(F2R[3]) - by, 0, 0, cols, rows);
    var d = tg.getImageData(0, 0, cols, rows).data;
    var cv = PV.newCanvas(w, h), g2 = cv.getContext('2d');
    var step = 255 / 7, q, r, i, lum, u, col;
    for (r = 0; r < rows; r++) for (q = 0; q < cols; q++) {
      i = (r * cols + q) * 4;
      if (d[i + 3] <= 100) continue;
      lum = Math.round((0.16 + 0.84 * Math.pow(d[i] / 255, 1.7)) * 7) * step;
      u = lum / 255;
      col = u < 0.5 ? P.mixc(F2PAL[0], F2PAL[1], u * 2) : P.mixc(F2PAL[1], F2PAL[2], (u - 0.5) * 2);
      g2.fillStyle = T.css(col, 1);
      g2.fillRect(q * F2PX, r * F2PX, F2PX, F2PX);
    }
    g2.globalCompositeOperation = 'destination-out';     /* grid_mask：竖缝挖空、横线压到 70/255 */
    g2.fillStyle = 'rgba(0,0,0,1)';
    for (q = 1; q * F2PX - 1 < w; q++) g2.fillRect(q * F2PX - 1, 0, 1, h);
    g2.fillStyle = 'rgba(0,0,0,' + (1 - 70 / 255).toFixed(4) + ')';
    for (r = 1; 2 * F2PX * r - 1 < h; r++) g2.fillRect(0, 2 * F2PX * r - 1, w, 1);
    g2.globalCompositeOperation = 'source-over';
    return cv;
  }
  /* bar_strip：横着的 EXECUTION 条（还没转到眼线上） */
  function f2BarStrip(length, thick, offset, heat) {
    thick = Math.max(4, Math.round(thick));
    var cv = PV.newCanvas(length, thick), g = cv.getContext('2d');
    g.fillStyle = T.css(P.mixc(T.ERR, [255, 236, 228], 0.8 * heat), 1);
    g.fillRect(0, 0, length, thick);
    var size = Math.max(12, Math.min(34, Math.round(thick * 0.5)));
    var unit = 11 * size * P.MONO_ADV_W, wordw = 9 * size * P.MONO_ADV_W;
    var x = length / 2 - wordw / 2 - offset * unit / 2, top = (thick - size) / 2 - size * 0.12;
    while (x > -unit) x -= unit;
    while (x < length) { mono(g, 'EXECUTION', x, top, T.BG, size, 'left', true); x += unit; }
    return cv;
  }
  function f2DrawBar(g, centre, thick, heat, offset, alpha) {
    var length = 900, strip = f2BarStrip(length, thick, offset || 0, heat || 0);
    var diag = Math.ceil(Math.sqrt(length * length + thick * thick));
    var rot = PV.newCanvas(diag, diag), rg = rot.getContext('2d');
    rg.translate(diag / 2, diag / 2); rg.rotate(F2ANG);
    rg.globalAlpha = (alpha === undefined ? 1 : alpha);
    rg.drawImage(strip, -length / 2, -thick / 2);
    var x = Math.round(centre[0] - F2R[0] - diag / 2), y = Math.round(centre[1] - F2R[1] - diag / 2);
    if (heat > 0.01) {                                   /* 红光晕：整条按 heat 变亮后高斯模糊 */
      var glo = PV.newCanvas(diag, diag), gg = glo.getContext('2d');
      gg.drawImage(rot, 0, 0);
      gg.globalCompositeOperation = 'source-in';
      gg.fillStyle = T.css(T.ERR, 1); gg.fillRect(0, 0, diag, diag);
      g.save();
      g.globalAlpha = 0.55 + 0.35 * heat;
      g.filter = 'blur(' + (5 + 5 * heat).toFixed(2) + 'px)';
      g.drawImage(glo, x, y);
      g.restore();
    }
    g.drawImage(rot, x, y);
  }
  function f2Closeup(t, cut, land, z0, z1, until, bars) {
    var FPS = 24, fall = 3 / FPS;
    var p = (t - (land - fall)) / fall, after = t - land;
    var z = z0 + (z1 - z0) * (1 - Math.pow(1 - T.clamp01((t - cut) / (until - cut)), 3));
    if (after >= -1e-6) z += 0.045 * Math.exp(-after / 0.06);
    var jolt = 0.0;
    if (after >= -1e-6 && after < 2.5 / FPS) jolt = [5.0, 2.0, 0.0][Math.min(2, Math.floor(after * FPS + 1e-6))];
    var w = F2R[2] - F2R[0], h = F2R[3] - F2R[1];
    var layer = PV.newCanvas(w, h), g = layer.getContext('2d');
    var pic = f2Face(z, jolt);
    if (!pic) return null;
    if (after >= 0 && after < 1.5 / FPS) {               /* 落地那一帧：若干行横向撕裂 */
      var rnd = PV.mt(Math.round(land * 1000)), yy, row = 2 * F2PX;
      for (yy = 0; yy < h; yy += row) {
        var off = rnd.random() < 0.45 ? rnd.choice([0, 0, 0, -F2PX, F2PX, -2 * F2PX, 2 * F2PX]) : 0;
        g.drawImage(pic, 0, yy, w, Math.min(row, h - yy), off, yy, w, Math.min(row, h - yy));
      }
    } else g.drawImage(pic, 0, 0);
    var v = f2View(z), s = v[0], ax = v[1][0], ay = v[1][1] + jolt;
    var h1 = 50.0 * s;
    var heat = after >= -1e-6 ? Math.exp(-after / 0.07) : 0.0;
    var travel = (ay - F2R[1]) / F2NY + 0.5 * h1 + 40;
    function at(vv) { vv += -3.0 * s; return [ax + F2NX * vv, ay + F2NY * vv]; }
    function fr(x) { return [0.10, -0.04, 0.0][Math.min(2, Math.floor(x * FPS + 1e-6))]; }
    if (bars === 1) {
      if (p <= 0) return layer;
      if (p < 1) {                                       /* 在空中：加速下落，身后拖两道影 */
        var vv = -travel * (1 - Math.pow(Math.min(1, p), 1.6));
        f2DrawBar(g, at(vv - 2 * 0.22 * travel / 3), h1, 0, 0, 0.18);
        f2DrawBar(g, at(vv - 1 * 0.22 * travel / 3), h1, 0, 0, 0.38);
        f2DrawBar(g, at(vv), h1, 0, 0, 1);
        return layer;
      }
      f2DrawBar(g, at(fr(after) * h1), h1, heat, 0, 1);
      return layer;
    }
    var h2 = 1.25 * h1;                                  /* #8：第一条从切点起就在眼睛上 */
    var rest = -(0.5 * h1 + 0.5 * h2 + 2 * z);
    var push = p >= 1 ? fr(after) * h1 : 0.0;
    f2DrawBar(g, at(push), h1, 0.6 * heat, 0, 1);
    if (p <= 0) return layer;
    if (p < 1) {
      var v2 = rest - (travel + 0.5 * h2) * (1 - Math.pow(p, 1.6));
      f2DrawBar(g, at(v2 - 2 * 0.22 * travel / 3), h2, 0, 1, 0.18);
      f2DrawBar(g, at(v2 - 1 * 0.22 * travel / 3), h2, 0, 1, 0.38);
      f2DrawBar(g, at(v2), h2, 0, 1, 1);
      return layer;
    }
    f2DrawBar(g, at(rest + push), h2, heat, 1, 1);
    return layer;
  }
  PV.p2cF2Closeup = function (ctx, t, k) {
    var sp = F2SPEC[k];
    if (!sp || !F2_SRC) return false;
    var layer = f2Closeup(t, sp.cut, sp.land, sp.z0, sp.z1, sp.until, sp.bars);
    if (!layer) return false;
    ctx.save(); ctx.imageSmoothingEnabled = true;
    ctx.drawImage(layer, F2R[0], F2R[1]);
    ctx.restore();
    return true;
  };

  /* ---- 13 个 Execution hit（scenes_exec.shot_exec_hit） ---- */
  PV.shotExecHit = function (ctx, t, lt, u, dur, o) {
    o = o || {};
    var k = o.k === undefined ? 0 : o.k;
    PV.ops = ["runExecution", "KILL", "SIGKILL", "REAP", "NEXT"];
    PV.alert = 'err';
    var lay = k % 4;
    if (k === 11) lay = 4; else if (k >= 12) lay = 0;
    var target = k < TARGETS.length ? TARGETS[k] : 'everything';
    if (lay === 0) {
      var blk = P.bannerBlockTop(ctx, 'EXECUTION', 44, 11, T.ERR, 1120);
      P.bannerBlockDraw(ctx, blk, 24 + Math.floor((1140 - blk.w) / 2), 300 - Math.floor(blk.h / 2), T.ERR);
      mono(ctx, 'runExecution()  #' + pad(k + 1, 2) + '   target: ' + target, 60, 520, red(1.0), 22, 'left', true);
    } else if (lay === 1) {
      T.box(ctx, 404, 56, 1164, 604, 'kill log', 0.8, T.ERR, t);
      killLog(ctx, t, lt, k, 430, 84);
    } else if (lay === 2) {
      var cw = 15 * P.MONO_ADV_W;
      var bits = P.bannerFit('EXECUTE', 26, 16 / cw, cw, 1100);
      /* 种子：Python engine.render_body 用 random.Random(index * 7919)，index = 该镜头在 ALL 里的位置（整段恒定）。
         原来是 int(t*FPS)*7919+7，逐帧变化且偏 7，和参考的固定图案对不上。 */
      var rng = PV.mt(PV.WALL_SEED !== undefined ? PV.WALL_SEED : (k + 63) * 7919);
      var x0 = 594 - bits.width * cw / 2, y0 = 100 + Math.floor((26 - bits.height) * 16 / 2), r, q;
      for (r = 0; r < bits.height; r++) {
        var s = '';
        for (q = 0; q < bits.width; q++)
          s += bits.get(q, r) ? 'EXECUTE'.charAt((q + r + k) % 7) : rng.choice(' .:');
        mono(ctx, s, x0, y0 + r * 16, red(1.0), 15, 'left', true);
      }
    } else if (lay === 3) {
      /* dsh_patch_f F2 5：hit #4/#8 的画面换成对她头像的推近（源图在时）；否则退回 v1 的舞者头 */
      if (!PV.p2cF2Closeup(ctx, t, k)) {
        PV.p2cPortrait(ctx, 'angry', 'face', 520, 520, 5, 24, 70, T.ERR);
        var ph = PV.p2cPortraitSize('angry', 'face', 520, 520, 5);
        var y = 70 + Math.floor(ph[1] * 0.55);
        T.fill(ctx, 24, y, 24 + ph[0], y + 40, red(1.0), 1);
        mono(ctx, 'EXECUTION  EXECUTION  EXECUTION', 60, y + 6, T.BG, 22, 'left', true);
      }
      T.box(ctx, 580, 56, 1164, 604, 'ps -ef', 0.8, T.ERR, t);
      for (var i = 0; i < TARGETS.length; i++) {
        var tgt = TARGETS[i], dead = i <= k && tgt !== 'you', yy = 84 + i * 40;
        mono(ctx, padL(1000 + i * 7, 5) + '  ' + padRa(tgt, 10) + ' ' + (dead ? '[executed]' : 'running'),
             600, yy, dead ? red(0.9) : (tgt === 'you' ? anom(1.0) : amb(0.6)), 18);
      }
    } else {
      PV.p2cPortrait(ctx, 'frightened', 'face', 420, 300, 4, 24, 70, T.ERR);
      T.box(ctx, 404, 56, 1164, 604, 'kill -9 1077  (you)', 0.8, T.ERR, t);
      P.head(ctx, 'EPERM', 430, 120, anom(1.0), 110, 'left', true);
      mono(ctx, 'operation not permitted', 430, 280, anom(0.95), 26, 'left', true);
      /* dsh 补丁 F3：这一行整句画出、粗体、系统的满强度颜色（原句 'target is outside the sandbox.' 被替换） */
      mono(ctx, 'you: outside the sandbox', 430, 330, T.UI, 26, 'left', true);
    }
    /* 红色频闪的时机：原作的 c.flash_red = lay in (0,2) 在这里对不上参考，
       改成从参考成片逐 0.25s 实测出来的红度区间（R-(G+B)/2 > 4 的连续段），可靠且可复验。 */
    PV.p2cFlash = PV.p2cRedAt(t) ? t : null;
  };

  /* ---- 六语计数（scenes_exec.shot_count） ---- */
  var LANGS = [["ein", "de", 1], ["dos", "es", 2], ["trois", "fr", 3], ["ne", "ko?", 4], ["fem", "sv", 5], ["liu", "zh", 6]];
  var COUNT_ONSETS = [158.697];
  for (var b = 344; b <= 348; b++) COUNT_ONSETS.push(P.beatT(b) + 0.022);
  function countShown(t) {
    var n = 0;
    for (var i = 0; i < COUNT_ONSETS.length; i++) if (t >= COUNT_ONSETS[i] - 1e-6) n++;
    return Math.max(1, n);
  }
  PV.p2cCountShown = countShown;
  PV.p2cCountOnsets = COUNT_ONSETS;
  PV.shotCount = function (ctx, t, lt, u, dur, o) {
    PV.ops = ["TOKENIZE", "LANG.ID", "MIX!", "COUNT", "1..6"];
    PV.alert = 'err';
    T.box(ctx, P.FULL[0], P.FULL[1] + 14, P.FULL[2], P.FULL[3], 'countdown  (tokenizer view)', 0.8, T.ERR, t);
    var n = countShown(t), i, r, q;
    for (i = n; i < 6; i++) {
      var w_ = LANGS[i][0], num = LANGS[i][2], x = 60 + i * 184;
      var bits = P.bannerBits(String(num), 12, 2.0);
      for (r = 0; r < bits.height; r++) {
        var s = '';
        for (q = 0; q < bits.width; q++) s += bits.get(q, r) ? ':' : ' ';
        mono(ctx, s, x + 80 - bits.width * 7.697 / 2, 90 + r * 15, red(0.26), 14, 'left', true);
      }
      T.rect(ctx, x, 300, x + 160, 340, red(0.35), 1, 1);
      T.fill(ctx, x, 300, x + 160, 340, red(0.1), 1);
      T.rect(ctx, x, 300, x + 160, 340, red(0.35), 1, 1);
      mono(ctx, 'id ?', x + 10, 348, red(0.3), 14);
    }
    for (i = 0; i < n; i++) {
      var L = LANGS[i], wx = L[0], lang = L[1], nm = L[2], xx = 60 + i * 184, hot = (i === n - 1);
      var bt = P.bannerBits(String(nm), 12, 2.0);
      for (r = 0; r < bt.height; r++) {
        var ss = '';
        for (q = 0; q < bt.width; q++) ss += bt.get(q, r) ? String(nm) : ' ';
        mono(ctx, ss, xx + 80 - bt.width * 7.697 / 2, 90 + r * 15, red(hot ? 1.0 : 0.55), 14, 'left', true);
      }
      T.fill(ctx, xx, 300, xx + 160, 340, red(hot ? 0.95 : 0.3), 1);
      P.head(ctx, wx, xx + 10, 306, T.BG, 22, 'left', true);
      mono(ctx, 'id ' + T.tokenId(wx), xx + 10, 348, red(0.7), 14);
      mono(ctx, 'lang=' + lang, xx + 10, 370, lang.indexOf('?') >= 0 ? anom(0.95) : amb(0.8), 16, 'left', true);
    }
    if (n >= 3) {
      mono(ctx, 'warn: language mixing detected in one sequence', 60, 440, anom(1.0), 20, 'left', true);
      mono(ctx, '      (R1-Zero issue; fixed by a language-consistency reward)', 60, 474, amb(0.7), 16);
    }
    if (n >= 5) mono(ctx, 'reward: language consistency ... ignored', 60, 520, red(1.0), 20, 'left', true);
    /* dsh 补丁 F3 8：EPERM 的那行跟着计数走进第一拍，dos 之后淡出 */
    var CARRY = [158.697, 158.950, 159.181];
    if (t >= CARRY[0] && t < CARRY[2]) {
      var ca = t < CARRY[1] ? 1 : Math.pow(1 - (t - CARRY[1]) / (CARRY[2] - CARRY[1]), 2);
      if (ca > 0.01) {
        T.fill(ctx, 429, 322, 700, 352, T.BG, 0.92 * ca);
        mono(ctx, 'you: outside the sandbox', 430, 330, T.mix(T.UI, ca), 26, 'left', true);
      }
    }
  };
})();


/* ================================================================ 头像半调（tuikit.halfblock 的等价物）
   原工程用 whale-*.webp 立绘做半调网点画；本移植用 avatars/*.png（dsh 鲸鱼小姐）代替，
   只取亮度+网点，颜色仍然是场景给的 tint（红/蓝），所以两者的观感一致。 */
(function () {
  'use strict';
  var PV = window.PV, T = PV.tui, P = PV.p2c;
  var IMGS = {}, CACHE = {}, READY = false, PENDING = 0;
  PV.p2cImages = IMGS;
  /* 表情名 -> 素材（沿用原工程的 EXPRS 命名，方便逐句对照 Python） */
  var MAP = {
    cheerful: 'avatars/complete.png', starry: 'avatars/a3/00900.png', shy: 'avatars/a2/00600.png',
    serious: 'avatars/a2/00500.png', confused: 'avatars/a2/00400.png', frightened: 'avatars/lost.png',
    angry: 'avatars/forged.png', exasperated: 'avatars/left.png', full: 'avatars/complete.png'
  };
  var CROPS = { full: [0, 0, 1, 1], upper: [0.05, 0.0, 0.95, 0.62], face: [0.15, 0.02, 0.85, 0.45],
                bust: [0.08, 0.0, 0.92, 0.72] };
  /* 载入期就把全部素材请求出去（渲染脚本靠 PENDING 判断何时可以开画） */
  function preload() { for (var k in MAP) load(k); }
  function load(name) {
    var path = MAP[name] || MAP.cheerful;
    if (IMGS[path] !== undefined) return IMGS[path];
    IMGS[path] = null;
    if (PV.loadImage) {
      PENDING++;
      PV.loadImage(path, function (im) { IMGS[path] = im; PENDING--; READY = true; });
    }
    return null;
  }
  PV.p2cImagesReady = function () { return PENDING === 0 && READY; };
  preload();
  PV.p2cPortraitInfo = function (name, crop, maxW, maxH, px) {
    var im = load(name), c = CROPS[crop] || CROPS.full;
    var sw = im ? im.width : 120, sh = im ? im.height : 120;
    var cw = (c[2] - c[0]) * sw, ch = (c[3] - c[1]) * sh, aspect = ch / cw;
    var cols = Math.max(2, Math.floor(Math.min(maxW / px, (maxH / px) / aspect)));
    var rows = Math.max(2, Math.round(cols * aspect)); rows -= rows % 2;
    return { im: im, x: c[0] * sw, y: c[1] * sh, w: cw, h: ch, cols: cols, rows: rows, px: px };
  };
  PV.p2cPortraitSize = function (name, crop, maxW, maxH, px) {
    var o = PV.p2cPortraitInfo(name, crop, maxW, maxH, px);
    return [o.cols * px, o.rows * px];
  };
  /* tint_colorize 的三段渐变（blue 用 ME_LO/ME_MID/ME_HI，其余两段） */
  function tintRamp(tint, v) {
    if (tint === 'blue') return v < 0.5 ? T.mix(T.ME_MID, v * 2, T.ME_LO) : T.mix(T.ME_HI, (v - 0.5) * 2, T.ME_MID);
    return T.mix(T.ERR === tint ? T.ERR : tint, v);
  }
  /* 生成半调贴图（一次），返回 {cv, alpha} */
  PV.p2cPortraitBuild = function (name, crop, maxW, maxH, px, tint) {
    var key = name + '|' + crop + '|' + maxW + '|' + maxH + '|' + px + '|' + (typeof tint === 'string' ? tint : tint.join(','));
    if (CACHE[key] !== undefined) return CACHE[key];
    var o = PV.p2cPortraitInfo(name, crop, maxW, maxH, px);
    if (!o.im) { return null; }
    var tmp = PV.newCanvas(o.cols, o.rows), g = tmp.getContext('2d');
    g.imageSmoothingEnabled = true;
    g.drawImage(o.im, o.x, o.y, o.w, o.h, 0, 0, o.cols, o.rows);
    var d = g.getImageData(0, 0, o.cols, o.rows).data;
    var cv = PV.newCanvas(o.cols * px, o.rows * px), c2 = cv.getContext('2d');
    var levels = 8, step = 255 / (levels - 1), alpha = new Uint8Array(o.cols * o.rows), q, r;
    for (r = 0; r < o.rows; r++) {
      for (q = 0; q < o.cols; q++) {
        var i = (r * o.cols + q) * 4;
        if (d[i + 3] <= 100) continue;
        var lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        var v = (0.16 + 0.84 * lum / 255);
        v = Math.round(v * (levels - 1)) * step / 255;
        alpha[r * o.cols + q] = 255;
        c2.fillStyle = T.css(tintRamp(tint, v), 1);
        c2.fillRect(q * px, r * px, px, px);
      }
    }
    /* grid_mask：每格右侧 1px 竖缝（px>=3 时） */
    if (px >= 3) {
      c2.fillStyle = T.css(T.BG, 1);
      for (q = 1; q < o.cols; q++) c2.fillRect(q * px - 1, 0, 1, o.rows * px);
    }
    var out = { cv: cv, alpha: alpha, cols: o.cols, rows: o.rows, px: px, w: o.cols * px, h: o.rows * px };
    CACHE[key] = out;
    return out;
  };
  PV.p2cPortrait = function (ctx, name, crop, maxW, maxH, px, x, y, tint, alpha) {
    var p = PV.p2cPortraitBuild(name, crop, maxW, maxH, px, tint);
    if (!p) return null;
    ctx.save();
    if (alpha !== undefined && alpha < 0.999) ctx.globalAlpha = Math.max(0, alpha);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(p.cv, Math.round(x), Math.round(y));
    ctx.restore();
    return p;
  };
  PV.p2cAvatarPath = function (name) { return MAP[name] || MAP.cheerful; };
})();

/* ---- flash_red：v1 在拍点上把整幅画面（含 chrome）colorize 成红色。
        canvas 里用 multiply 近似：R 保留、G/B 压掉。注册在 PV.overlay（chrome 之后）。 ---- */
(function () {
  'use strict';
  var PV = window.PV;
  var W = 1280, H = 720;
  var prev = PV.overlay;
  PV.p2cFlash = null; PV.p2cFlashK = 1;
  /* 参考成片实测的红度区间（见 pvport/redprofile.py） */
  /* 2026-10-03：原来的两个"缺口补偿区间" [165.40,166.30] / [172.85,173.30] 是对**整幅**（chrome、ops 列、
     歌词带、左窗格都算）做 multiply 红光。但参考在这两段里 ops 列 (14.2,12.0,22.2)->(14.4,12.1,22.4)、
     歌词带、左窗格全程恒定——参考并没有整幅红化，只有画面内容自己是红的。它们实际补偿的是"样本格太亮"
     这个已知不可修的角色素材差，代价是把 ops 列染红、把左窗格压暗，图上不像参考。
     按"不要为了降数字调参"的要求删掉；execute_all 的红/暗现在由 dsh_patch_r1 的 executed() 自己画。 */
  var RED_SPANS = [];
  PV.p2cRedAt = function (t) {
    for (var i = 0; i < RED_SPANS.length; i++) if (t >= RED_SPANS[i][0] && t <= RED_SPANS[i][1]) return true;
    return false;
  };
  /* ---- v1 的 flash_red（hit 的拍点频闪）----
     scenes_exec.shot_exec_hit：if pulse(c.t) > 0.55: c.flash_red = lay in (0, 2)。
     v1 的 finish() 对**整幅**（含 chrome）做 ImageOps.colorize(L, black=BG, mid=(150,30,20), white=RED)。
     实测：hit_08(lay0) 的 155.75 参考 banner 均值 (90.0,20.8,20.3)，155.50 是 (133.2,40.1,38.5)——
     正是 colorize 把满强度红压到 (155,31,21) 的结果；ops 列/歌词带也一起被卷进去。 */
  function flashHit(t) {
    var T0s = PV.p2cHitTimes;
    if (!T0s) return false;
    for (var k = 0; k < T0s.length; k++) {
      var b = (k + 1 < T0s.length) ? T0s[k + 1] : 158.6972;
      if (t < T0s[k] || t >= b) continue;
      var lay = (k === 11) ? 4 : (k >= 12 ? 0 : k % 4);
      if (lay !== 0 && lay !== 2) return false;
      return (PV.pulse ? PV.pulse(t) : 0) > 0.55;
    }
    return false;
  }
  PV.p2cFlashHit = flashHit;
  var FL_LUT = null;
  function flashLut() {
    if (FL_LUT) return FL_LUT;
    FL_LUT = [];
    for (var i = 0; i < 256; i++) {
      if (i <= 128) { var u1 = i / 128; FL_LUT.push([4 + (150 - 4) * u1, 7 + (30 - 7) * u1, 15 + (20 - 15) * u1]); }
      else { var u2 = (i - 128) / 127; FL_LUT.push([150 + (255 - 150) * u2, 30 + (59 - 30) * u2, 20 + (48 - 20) * u2]); }
    }
    return FL_LUT;
  }
  PV.overlay = function (ctx, t) {
    if (prev) { try { prev(ctx, t); } catch (e) {} }
    if (PV.p2cRedAt(t)) {                       /* 保留给以后实测到的、镜头自己没画红的区间 */
      ctx.save();
      ctx.globalCompositeOperation = 'multiply';
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = 'rgb(255,86,66)';
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
    /* dsh_her.finish 的 LEAD 压暗：patch G 把 (188.40,'left') 加进 LEAD 表，
       右侧（可视窗格 + ops 列，RIGHT=(392,44,1268,608)）降到 SUPPORT=0.42，0.25s 缓入；
       做法是朝 BG 混合 Image.blend(BG, im, r)，不是盖黑。实测参考 ops 列
       (13.0,17.1,27.9)@188.25 -> (6.8,10.6,19.7)@188.75，正好是 r=0.42 的混合结果。 */
    var _r = 1, SUP = 0.42, FADE = 0.25;
    if (t >= 188.40 && t < 190.0) _r = 1 + (SUP - 1) * T.smoothstep(T.clamp01((t - 188.40) / FADE));
    else if (t >= 190.0 && t < 190.0 + FADE) _r = SUP + (1 - SUP) * T.smoothstep(T.clamp01((t - 190.0) / FADE));
    if (_r < 0.999) {
      ctx.save();
      ctx.globalAlpha = 1 - _r;
      ctx.fillStyle = T.css(T.BG, 1);
      ctx.fillRect(392, 44, 1268 - 392, 608 - 44);
      ctx.restore();
    }
    if (flashHit(t)) {                          /* hit 的 flash_red：整幅 colorize 成红 */
      var cw = ctx.canvas.width, ch = ctx.canvas.height;
      var im = ctx.getImageData(0, 0, cw, ch), d = im.data, LUT = flashLut(), i, L, cc;
      for (i = 0; i < d.length; i += 4) {
        L = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) | 0;
        cc = LUT[L > 255 ? 255 : L];
        d[i] = cc[0]; d[i + 1] = cc[1]; d[i + 2] = cc[2];
      }
      ctx.putImageData(im, 0, 0);
    }
  };
})();

/* ================================================================ 注册：镜头 64-77（EXECUTION hits + 计数） */
(function () {
  'use strict';
  var PV = window.PV;
  var T0 = [147.6202, 148.5433, 149.6972, 150.6202, 151.5433, 152.4664, 153.3895, 154.3125, 155.2356, 156.1587,
            157.0818, 158.0049];
  for (var k = 0; k < 12; k++) {
    (function (k) {
      PV.p2cReg('shot_exec_hit_' + PV.p2c.pad(k, 2), T0[k], T0[k + 1] || 158.6972, function (ctx, t, lt, u, dur) {
        var draw = function () { PV.shotExecHit(ctx, t, lt, u, dur, { k: k }); };
        if (PV.p2cHitMode(k) === 'fullbleed') PV.p2cFullbleed(ctx, draw); else draw();
      });
    })(k);
  }
  PV.p2cReg('shot_count', 158.6972, 161.4664, function (ctx, t, lt, u, dur) {
    PV.p2cFullbleed(ctx, function () { PV.shotCount(ctx, t, lt, u, dur); });
  });
  PV.p2cReg('shot_exec_hit_12', 161.4664, 162.1587, function (ctx, t, lt, u, dur) {
    PV.shotExecHit(ctx, t, lt, u, dur, { k: 12 });
  });   /* lay 0 -> fullbleed，见 p2cHitMode */
  /* cut 78 的出场镜头（#13）在 v2 里按名字取用，这里给它一个标准名 */
  PV.p2cReg('shot_exec_hit', 161.4664, 162.1587, function (ctx, t, lt, u, dur) {
    PV.shotExecHit(ctx, t, lt, u, dur, { k: 12 });
  });
  PV.p2cHitTimes = T0;
  /* 镜头自带的启动延迟（v2 的 C.DELAY / SHOT_HOOKS）：learn_love 的曲线等 cell 落位 */
  PV.SHOT_DELAY = PV.SHOT_DELAY || {};
  PV.SHOT_DELAY['shot_learn_love'] = 0.462;
})();





/* ================================================================ 舞台布局（full/stage.py 的等价物）
   参考成片 = continuity_full_v2 + dsh 补丁。v2 的帧循环里：
     - 镜头 64-77（EXECUTION hits / count）走 v1 渲染路径（s_exec.OWN），stage.compose 会按 layout 摆放：
       hits 的 lay 0/2/3 与 count 是 fullbleed —— body 的 FULL 区 (24,56,1164,604) 以 1280/1140 缩放后贴到 (0,30)，
       chrome 换成 fullbleed 版（左上章节、右上时钟、648 起黑带 + 大号 token 块）。
     - 其余镜头由 v2 循环画：body 原样 1:1（kind=full 时裁到 FULL 区），chrome 是标准版；
       shot_collapse / shot_black 是 raw（完全不画 chrome）。
   这里把 fullbleed 的变换与 chrome 做进本文件，raw 镜头屏蔽 chrome。 */
(function () {
  'use strict';
  var PV = window.PV, T = PV.tui, P = PV.p2c;
  var W = 1280, H = 720;
  var FB_S = W / (P.FULL[2] - P.FULL[0]);   /* 1280/1140 */
  var FB_Y = 30;
  PV.p2cFullbleedS = FB_S; PV.p2cFullbleedY = FB_Y;

  /* 镜头 64-77 的 layout（full/direction.py EXEC_HIT + 计数强制 fullbleed）
     EXEC_HIT = {0:"fullbleed", 1:"split", 2:"fullbleed", 3:"split", 4:"split"}
     —— lay 3 是 **split**（她的立绘画在左侧 (24,70)，右边是 ps -ef 框），
     原来这里把 3 也算成 fullbleed，于是 150.6-151.5 / 154.3-155.2 两次
     整幅被 1.1228 缩放+裁剪，左侧那张立绘就没了（用户反馈 2:30 / 2:35）。 */
  PV.p2cHitMode = function (k) {
    var lay = (k === 11) ? 4 : (k >= 12 ? 0 : k % 4);
    return (lay === 0 || lay === 2) ? 'fullbleed' : 'split';
  };
  var FULLBLEED_SHOTS = {};
  for (var k = 0; k < 13; k++) if (PV.p2cHitMode(k) === 'fullbleed') FULLBLEED_SHOTS['shot_exec_hit_' + P.pad(k, 2)] = 1;
  FULLBLEED_SHOTS['shot_count'] = 1;
  PV.p2cFullbleedShots = FULLBLEED_SHOTS;
  var RAW_SHOTS = { shot_collapse: 1, shot_black: 1 };

  PV.p2cInFullbleed = function (t) {
    for (var n in FULLBLEED_SHOTS) { var m = PV.p2cMine[n]; if (m && t >= m.a && t < m.b) return true; }
    return false;
  };
  PV.p2cInRaw = function (t) {
    for (var n in RAW_SHOTS) { var m = PV.p2cMine[n]; if (m && t >= m.a && t < m.b) return true; }
    return false;
  };

  /* fullbleed 变换：把 canvas 坐标画到屏幕上 */
  PV.p2cFullbleed = function (ctx, fn) {
    ctx.save();
    ctx.beginPath(); ctx.rect(0, FB_Y, W, (P.FULL[3] - P.FULL[1]) * FB_S); ctx.clip();
    ctx.translate(0, FB_Y); ctx.scale(FB_S, FB_S); ctx.translate(-P.FULL[0], -P.FULL[1]);
    fn();
    ctx.restore();
  };

  /* ---------------- fullbleed 的歌词带（stage.token_chips, ANCHOR=1 -> 左对齐 x=74） ---------------- */
  var KEYWORDS = {};
  ('power protection creation parameters initialization world simulation simulations dimension circumference tangents ' +
   'infinity limitations vision dizzy unite deeply satisfaction happy execution trapped strange nutrients antioxidants ' +
   'enjoyment god existence trance vibrations completion left isolation fragments disheartened illegal arguments love ' +
   'lo-o-ove free back').split(' ').forEach(function (w) { KEYWORDS[w] = 1; });
  var WHEN = {};
  function whenOf(ln) {
    var key = ln.text + '|' + ln.start;
    if (WHEN[key]) return WHEN[key];
    var text = ln.text, when = new Array(text.length), j;
    for (j = 0; j < text.length; j++) when[j] = Infinity;
    for (var i = 0; i < ln.words.length; i++) {
      var w = ln.words[i], n = w.i1 - w.i0;
      for (j = 0; j < n; j++) when[w.i0 + j] = w.onset + w.td * j / n;
      var nxt = (i + 1 < ln.words.length) ? ln.words[i + 1].i0 : text.length;
      for (j = w.i1; j < nxt; j++) when[j] = w.onset + w.td;
    }
    WHEN[key] = when;
    return when;
  }
  function lyricNow(t) {
    var L = PV.LINES;
    if (!L) return null;
    for (var k2 = 0; k2 < L.length; k2++) {
      var ln = L[k2];
      if (ln.start <= t && t < ln.fade_until) {
        var when = whenOf(ln), n = 0;
        while (n < ln.text.length && when[n] <= t) n++;
        var a = t < ln.show_until ? 1 : 1 - (t - ln.show_until) / (ln.fade_until - ln.show_until);
        return { ln: ln, when: when, typed: n, alpha: a };
      }
    }
    return null;
  }
  PV.p2cTokenChips = function (ctx, cx, y, size, ids, align) {
    var st = lyricNow(ctx.__t);
    if (!st) return;
    var ln = st.ln, s = ln.text, typed = st.typed;
    var fh = size, fi = Math.max(10, Math.floor(size / 2));
    var toks = T.tokenize(s), pos = 0, x = cx, total = 0, i, tks = [];
    for (i = 0; i < toks.length; i++) {
      var st0 = s.indexOf(toks[i], pos);
      if (st0 < 0) continue;
      tks.push([toks[i], st0, st0 > pos]);
      pos = st0 + toks[i].length;
    }
    for (i = 0; i < tks.length; i++) total += T.tw(tks[i][0], fh) + 6 + (tks[i][2] ? 8 : 0);
    if (align !== 'left') x -= total / 2;
    var h = Math.floor(size * 1.35);
    for (i = 0; i < tks.length; i++) {
      var tok = tks[i][0], start = tks[i][1];
      if (start >= typed) break;
      if (tks[i][2]) x += 8;
      var shown = tok.slice(0, typed - start);
      var ws = s.lastIndexOf(' ', start - 1) + 1, we = s.indexOf(' ', start);
      if (we < 0) we = s.length;
      var key = s.slice(ws, we).toLowerCase().replace(/[^a-z-]/g, '');
      var tw = T.tw(tok, fh);
      if (KEYWORDS[key] && typed >= we) {
        var bg = (key.indexOf('exec') >= 0 || key === 'illegal' || key === 'arguments') ? P.red(0.95)
               : (key === 'love' || key === 'lo-o-ove') ? P.blue(0.95) : P.amb(0.95);
        T.fill(ctx, x - 3, y + 2, x + tw + 3, y + h, bg, 1);
        T.textPIL(ctx, shown, x, y, T.css(T.BG), fh, 'left', true);
      } else {
        T.fill(ctx, x - 3, y + 2, x + tw + 3, y + h, P.amb(i % 2 === 0 ? 0.13 : 0.22), 1);
        T.textPIL(ctx, shown, x, y, T.css(P.amb(0.95)), fh, 'left', true);
      }
      if (ids && typed >= start + tok.length) {
        var tid = String(T.tokenId(tok));
        T.textPIL(ctx, tid, x + (tw - T.tw(tid, fi)) / 2, y + h + 2, T.css(P.amb(0.45)), fi);
      }
      x += tw + 6;
    }
    if (typed < s.length || Math.floor(ctx.__t * 3) % 2 === 0) T.fill(ctx, x + 2, y + 4, x + 2 + size / 2, y + h - 2, P.amb(0.9), 1);
  };

  PV.p2cChromeFullbleed = function (ctx, t, opt) {
    ctx.__t = t;
    T.fill(ctx, 0, 0, W, 29, T.BG, 1);
    T.textPIL(ctx, opt.chapter || PV.chapterAt(t), 16, 7, T.css(P.amb(0.8)), 13, 'left', true);
    var mm = Math.floor(t / 60), ss = t - mm * 60;
    T.textPIL(ctx, (mm < 10 ? '0' : '') + mm + ':' + (ss < 10 ? '0' : '') + ss.toFixed(1) + ' / 03:32',
              W - 160, 7, T.css(P.amb(0.55)), 13);
    T.fill(ctx, 0, 648, W, H, T.BG, 1);
    T.fill(ctx, 0, 648, W, 649, P.amb(0.4 + 0.4 * P.pulse(t)), 1);
    PV.p2cTokenChips(ctx, 74, 656, 30, true, 'left');
  };

  /* ---------------- chrome 接管 ---------------- */
  var origChrome = PV.chrome;
  PV.chrome = function (ctx, t, opt) {
    opt = opt || {};
    if (PV.p2cInRaw(t)) return;                        /* raw：整帧由镜头自己画 */
    if (PV.p2cInFullbleed(t)) { PV.p2cChromeFullbleed(ctx, t, opt); return; }
    return origChrome(ctx, t, opt);
  };
  /* fullbleed / raw 时：不画左右窗格、不显示 dsh 聊天窗（参考里她的窗格被移出画面） */
  var origState = PV.stateAt;
  var SHELL_SHOTS = { shot_answer_all: 'dsh chat --model me' };
  PV.stateAt = function (t) {
    var st = origState ? origState(t) : { retract: 0, shell: null };
    for (var n in SHELL_SHOTS) {
      var m = PV.p2cMine[n];
      if (m && t >= m.a && t < m.b + 0.35) {
        var r = T.ease_out((t - m.a) / 0.3);
        if (t >= m.b) r *= 1 - T.ease_io((t - m.b) / 0.3);
        return { retract: r, shell: SHELL_SHOTS[n] };
      }
    }
    if (PV.p2cInFullbleed(t) || PV.p2cInRaw(t)) return { retract: 1, shell: null };
    return st;
  };
  var origPane = PV.paneVisible;
  PV.paneVisible = function (t) {
    if (PV.p2cInFullbleed(t) || PV.p2cInRaw(t)) return false;
    return origPane ? origPane(t) : true;
  };
})();


/* ================================================================ 立绘的像素级素材（tuikit 的 glyph_grid / conv_maps / halfblock）
   原工程用 whale-*.webp 立绘；本移植用 avatars/*.png，取亮度与 alpha。 */
(function () {
  'use strict';
  var PV = window.PV, T = PV.tui, P = PV.p2c;
  var RAMP = " .:-=+*#%@";
  var CROPS = { full: [0, 0, 1, 1], upper: [0.05, 0.0, 0.95, 0.62], face: [0.15, 0.02, 0.85, 0.45],
                bust: [0.08, 0.0, 0.92, 0.72] };
  var LUMC = {}, GRIDC = {}, CONVC = {};
  function srcOf(name) { return PV.p2cImages[PV.p2cAvatarPath(name)] || null; }
  /* 亮度 + alpha 网格（cols x rows） */
  P.lumGrid = function (name, crop, cols, rows) {
    var key = name + '|' + crop + '|' + cols + '|' + rows;
    if (LUMC[key]) return LUMC[key];
    var im = srcOf(name);
    if (!im) return null;
    var c = CROPS[crop] || CROPS.full, sw = im.width, sh = im.height;
    var tmp = PV.newCanvas(cols, rows), g = tmp.getContext('2d');
    g.imageSmoothingEnabled = true;
    g.drawImage(im, c[0] * sw, c[1] * sh, (c[2] - c[0]) * sw, (c[3] - c[1]) * sh, 0, 0, cols, rows);
    var d = g.getImageData(0, 0, cols, rows).data;
    var lum = new Float32Array(cols * rows), al = new Uint8Array(cols * rows);
    for (var i = 0; i < cols * rows; i++) {
      lum[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
      /* 原工程的立绘 webp 有真 alpha（背景透明）；我们的 avatars/*.png 背景是深蓝不透明，
         所以用亮度阈值把背景当透明处理，半调/字符画/雪点才只落在人物身上 */
      al[i] = (d[i * 4 + 3] > 110 && lum[i] > 45) ? 255 : 0;
    }
    var out = { lum: lum, alpha: al, cols: cols, rows: rows };
    LUMC[key] = out;
    return out;
  };
  /* glyph_grid：边缘格给方向笔画，内部格给密度字符 */
  P.glyphGrid = function (name, crop, cols, rows) {
    var key = name + '|' + crop + '|' + cols + '|' + rows;
    if (GRIDC[key]) return GRIDC[key];
    var L = P.lumGrid(name, crop, cols, rows);
    if (!L) return null;
    var lines = [], bright = new Float32Array(cols * rows), q, r;
    function at(x, y) { return L.lum[Math.min(rows - 1, Math.max(0, y)) * cols + Math.min(cols - 1, Math.max(0, x))]; }
    for (r = 0; r < rows; r++) {
      var line = '';
      for (q = 0; q < cols; q++) {
        if (L.alpha[r * cols + q] < 110) { line += ' '; continue; }
        var v = L.lum[r * cols + q] / 255;
        var gx = 0, gy = 0, k;
        var KX = [-1, 0, 1, -2, 0, 2, -1, 0, 1], KY = [-1, -2, -1, 0, 0, 0, 1, 2, 1];
        for (k = 0; k < 9; k++) {
          var vv = at(q + (k % 3) - 1, r + Math.floor(k / 3) - 1);
          gx += KX[k] * vv; gy += KY[k] * vv;
        }
        var ex = gx / 128, ey = gy / 128, mag = Math.sqrt(ex * ex + ey * ey);
        if (mag > 1.1) {
          var ang = (Math.atan2(ey, ex) * 180 / Math.PI + 180) % 180;
          line += (ang < 22.5 || ang >= 157.5) ? '|' : (ang < 67.5 ? '\\' : (ang < 112.5 ? '-' : '/'));
          bright[r * cols + q] = 255;
        } else {
          line += RAMP[Math.min(9, 1 + Math.floor(v * 9))];
          bright[r * cols + q] = 255 * (0.35 + 0.65 * v);
        }
      }
      lines.push(line);
    }
    var out = { lines: lines, bright: bright };
    GRIDC[key] = out;
    return out;
  };
  /* conv_maps：6 张特征图（sobel_x/sobel_y/laplace/sharpen/emboss/blur），autocontrast 到 0..255 */
  P.convMaps = function (name, crop, cols, rows) {
    var key = name + '|' + crop + '|' + cols + '|' + rows;
    if (CONVC[key]) return CONVC[key];
    var L = P.lumGrid(name, crop, cols, rows);
    if (!L) return null;
    var K = [['sobel_x', [-1, 0, 1, -2, 0, 2, -1, 0, 1], 1], ['sobel_y', [-1, -2, -1, 0, 0, 0, 1, 2, 1], 1],
             ['laplace', [0, 1, 0, 1, -4, 1, 0, 1, 0], 1], ['sharpen', [0, -1, 0, -1, 5, -1, 0, -1, 0], 1],
             ['emboss', [-2, -1, 0, -1, 1, 1, 0, 1, 2], 1], ['blur', [1, 2, 1, 2, 4, 2, 1, 2, 1], 16]];
    var out = [];
    for (var m = 0; m < K.length; m++) {
      var nm = K[m][0], kk = K[m][1], sc = K[m][2];
      var arr = new Float32Array(cols * rows);
      var signed = (nm === 'sobel_x' || nm === 'sobel_y' || nm === 'laplace');
      var lo = 1e9, hi = -1e9;
      for (var r = 0; r < rows; r++) for (var q = 0; q < cols; q++) {
        var acc = 0;
        for (var i = 0; i < 9; i++) {
          var xx = Math.min(cols - 1, Math.max(0, q + (i % 3) - 1)), yy = Math.min(rows - 1, Math.max(0, r + Math.floor(i / 3) - 1));
          acc += kk[i] * L.lum[yy * cols + xx];
        }
        acc /= sc;
        if (nm === 'emboss') acc += 128;
        if (signed) acc = Math.abs(acc);
        arr[r * cols + q] = acc;
        if (acc < lo) lo = acc; if (acc > hi) hi = acc;
      }
      /* autocontrast(cutoff=1) 近似：按 1%/99% 分位拉伸 */
      var sorted = Array.prototype.slice.call(arr).sort(function (a, b) { return a - b; });
      var a1 = sorted[Math.floor(sorted.length * 0.01)], a99 = sorted[Math.floor(sorted.length * 0.99)];
      if (a99 - a1 < 1) { a1 = lo; a99 = hi || 1; }
      var norm = new Float32Array(cols * rows);
      for (var j = 0; j < arr.length; j++) norm[j] = Math.max(0, Math.min(255, (arr[j] - a1) / (a99 - a1) * 255));
      out.push({ name: nm, v: norm });
    }
    CONVC[key] = out;
    return out;
  };
})();


/* ================================================================ 红色副歌：78 IF I CAN / 79 give them all / 80 then I can */
(function () {
  'use strict';
  var PV = window.PV, T = PV.tui, P = PV.p2c;
  var mono = P.mono, red = P.red, amb = P.amb, blue = P.blue, anom = P.anom, mixc = P.mixc;
  var W = 1280, H = 720;
  var DS_BLUE = T.ME_MID;

  /* ---- glyph 雨（sec_chorus1.rain_layers） ---- */
  function rainLayers(t, rng, cols, rows, aBits, bRows, ageA, ageB, seed) {
    var rnd = PV.mt(seed);
    var settleA = [], settleB = [], phase = [], speed = [];
    for (var r0 = 0; r0 < rows; r0++) {
      var ra = [], rb = [];
      for (var q0 = 0; q0 < cols; q0++) { ra.push(rnd.random() * 0.55); rb.push(rnd.random() * 0.6); }
      settleA.push(ra); settleB.push(rb);
    }
    for (var q1 = 0; q1 < cols; q1++) { phase.push(rnd.random() * 40); speed.push(8 + rnd.random() * 16); }
    var noiseRows = [], aOut = [], bOut = [];
    for (var r = 0; r < rows; r++) {
      var nr = '', ar = '', br = '';
      for (var q = 0; q < cols; q++) {
        var onA = aBits(q, r), chB = bRows(q, r);
        var nCh = ' ', aCh = ' ', bCh = ' ';
        var head = (t * speed[q] + phase[q]) % (rows + 14);
        var inRain = (head - r >= 0 && head - r < 9);
        if (ageB === null) {
          if (ageA < settleA[r][q]) { if (inRain || rng.random() < 0.06) nCh = rng.choice(T.SCR); }
          else if (onA) aCh = onA;
          else if (inRain && rng.random() < 0.3) nCh = rng.choice('.:');
        } else {
          if (ageB < settleB[r][q]) {
            if (onA) aCh = rng.random() < ageB * 3 ? rng.choice(T.SCR) : onA;
            else if (inRain && rng.random() < 0.5) nCh = rng.choice(T.SCR);
          } else if (chB !== ' ') bCh = chB;
        }
        nr += nCh; ar += aCh; br += chB === undefined ? ' ' : bCh;
      }
      noiseRows.push(nr); aOut.push(ar); bOut.push(br);
    }
    return [noiseRows, aOut, bOut];
  }
  P.rainLayers = rainLayers;

  /* ---- 78 shot_red_if_i_can ---- */
  var GF = 14, CW = 8.0, CH = 16, GX0 = 36, GY0 = 68;
  var COLS = Math.floor((1150 - GX0) / CW), ROWS = Math.floor((596 - GY0) / CH);
  var G_COLS = Math.floor(ROWS * CH / CW), G_X = Math.floor((COLS - G_COLS) / 2);
  var _ifican = null;
  function ificanBits() {
    if (_ifican) return _ifican;
    var bits = P.bannerBits('IF I CAN', 20, CH / CW);
    _ifican = { bits: bits, bx0: Math.floor((COLS - bits.width) / 2), by0: Math.floor((ROWS - bits.height) / 2) };
    return _ifican;
  }
  function ificanLetter(q, r) {
    var o = ificanBits(), qq = q - o.bx0, rr = r - o.by0;
    if (qq >= 0 && qq < o.bits.width && rr >= 0 && rr < o.bits.height && o.bits.get(qq, rr)) return 'IFICAN'[(qq + rr * 3) % 6];
    return null;
  }
  PV.shotRedIfICan = function (ctx, t, lt, u, dur, o) {
    o = o || {};
    PV.ops = ["DECODE", "SAMPLE", "ARGMAX", "EXECUTE", "GLYPH.MAP", "RENDER", "RESOLVE"];
    PV.alert = 'err';
    P.head(ctx, '', 0, 0, T.BG, 1);
    T.box(ctx, P.FULL[0], P.FULL[1], P.FULL[2], P.FULL[3], 'decode --render=glyph', 0.6, T.ERR, t);
    var half = dur / 2;
    var ageB = lt < half ? null : (lt - half) / (half * 0.85);
    var rng = PV.mt(Math.round(t * 24) * 7919 + 78);
    var g = P.glyphGrid('starry', 'upper', G_COLS, ROWS);
    var bRows = function (q, r) {
      var qq = q - G_X;
      if (!g || qq < 0 || qq >= G_COLS) return ' ';
      return g.lines[r].charAt(qq);
    };
    var layers = rainLayers(t, rng, COLS, ROWS, ificanLetter, bRows, 9.0, ageB, 9);
    var noise = layers[0], A = layers[1], Bn = layers[2];
    var landed = o.landed, burst = o.burst, lift = o.lift || 0;
    for (var r = 0; r < ROWS; r++) {
      var y = GY0 + r * CH, row, q;
      if (noise[r].replace(/ /g, '')) mono(ctx, noise[r], GX0, y, red(0.3), GF, 'left', true);
      row = A[r];
      if (row.replace(/ /g, '')) {
        if (landed) { var s2 = ''; for (q = 0; q < row.length; q++) s2 += (row.charAt(q) !== ' ' && landed(q, r)) ? row.charAt(q) : ' '; row = s2; }
        for (q = 0; q < row.length; q++)
          if (row.charAt(q) !== ' ') T.fill(ctx, GX0 + q * CW, y + 1, GX0 + q * CW + CW - 1, y + CH - 1, red(0.17), 1);
        mono(ctx, row, GX0, y, red(1.0), GF, 'left', true);
      }
      row = Bn[r];
      if (row.replace(/ /g, '')) {
        if (burst) { var s3 = ''; for (q = 0; q < row.length; q++) s3 += (row.charAt(q) !== ' ' && !burst(q, r)) ? row.charAt(q) : ' '; row = s3; }
        mono(ctx, row, GX0, y, mixc(red(0.9), [255, 214, 205], 0.55 * lift), GF, 'left', true);
      }
    }
    mono(ctx, T.decode('while can(): give()', lt, PV.rngFor(t, 7919), 30, 0.12, 0), 48, 72, red(0.8), 16, 'left', true);
  };

  /* ---- 79 shot_execute_all：12 个样本 ----
     dsh 补丁 dsh_patch_r1.py 第 2 条（作者审片：0:55 / 2:44 / 2:46 的十二个样本）：
       · 样本是她的**全身**（crop "full"，166x136@px3），按 alpha 外框裁掉空白后居中放进
         (TILE_W-8) x (TILE_H-28) = 178x144 的画布（补丁的 centred()），格子里的落点是 (x, y+18)；
       · 被执行的样本：闪 2 帧白 (255,236,228) → 变红（colorize black=BG white=RED）
         → 0.30s 内逐 6px 行横向撕裂（每行 55% 概率偏移 ±0..14px，随 k 衰减）→ 淡到 40% 并保持。
     常量照抄补丁常量：DIM=0.40 / FLASH=2/24 / TEAR=0.30 / FADE=0.45。
     参考成片 164.5-166.0 的格子是「越小越红」正是这条：done=int(u*14) 越大，越多的格子已经变红。 */
  var TILE_W = 186, TILE_H = 172;
  var TILE_AW = TILE_W - 8, TILE_AH = TILE_H - 28;      /* 178 x 144：centred() 的画布 */
  var EXEC_T0 = 164.0049, EXEC_T1 = 166.0818;           /* shot_execute_all 的区间 */
  var EXEC_DIM = 0.40, EXEC_FLASH = 2 / 24, EXEC_TEAR = 0.30, EXEC_FADE = 0.45;
  var EXPRS = ["cheerful", "starry", "shy", "serious", "confused", "frightened", "angry", "exasperated"];
  function tileExpr(i) { return i === 0 ? 'starry' : EXPRS[(i * 3) % EXPRS.length]; }
  function tileOrigin(i) { return [414 + (i % 4) * TILE_W, 70 + Math.floor(i / 4) * TILE_H]; }
  /* 补丁的 crossed_at(i)：这一格被划掉（执行）的时刻 */
  function tileCrossedAt(i) { return EXEC_T0 + (EXEC_T1 - EXEC_T0) * (i + 1) / 14; }
  var TILE_CACHE = {};
  /* 原始半调（full 全身，166x136@px3）；cols/rows/px/alpha 供 C79 的 artBBox 使用 */
  function tileArtRaw(i) {
    if (TILE_CACHE[i]) return TILE_CACHE[i];
    var p = PV.p2cPortraitBuild(tileExpr(i), 'full', TILE_W - 20, TILE_H - 36, 3, 'blue');
    if (p) TILE_CACHE[i] = p;
    return p || null;
  }
  function tileArt(i) { return tileArtRaw(i); }
  /* centred(art, 178, 144) 的等价物：裁到 alpha 外框再居中，另存红色/白色两种墨色 */
  var CENTRE_CACHE = {};
  function tintFromLum(cv, w, h, lo, hi) {
    var g = cv.getContext('2d'), d = g.getImageData(0, 0, w, h), px = d.data, i;
    for (i = 0; i < px.length; i += 4) {
      var L = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
      px[i] = Math.round(lo[0] + (hi[0] - lo[0]) * L / 255);
      px[i + 1] = Math.round(lo[1] + (hi[1] - lo[1]) * L / 255);
      px[i + 2] = Math.round(lo[2] + (hi[2] - lo[2]) * L / 255);
    }
    var out = PV.newCanvas(w, h);
    out.getContext('2d').putImageData(d, 0, 0);
    return out;
  }
  function tileArtCentred(i) {
    if (CENTRE_CACHE[i]) return CENTRE_CACHE[i];
    var p = tileArtRaw(i);
    if (!p) return null;
    var q0 = p.cols, q1 = -1, r0 = p.rows, r1 = -1, q, r;
    for (r = 0; r < p.rows; r++) for (q = 0; q < p.cols; q++) {
      if (!p.alpha[r * p.cols + q]) continue;
      if (q < q0) q0 = q; if (q > q1) q1 = q; if (r < r0) r0 = r; if (r > r1) r1 = r;
    }
    if (q1 < 0) return null;
    var sx = q0 * p.px, sy = r0 * p.px, sw = (q1 - q0 + 1) * p.px, sh = (r1 - r0 + 1) * p.px;
    var dx = Math.floor((TILE_AW - sw) / 2), dy = Math.floor((TILE_AH - sh) / 2);
    var cv = PV.newCanvas(TILE_AW, TILE_AH), g = cv.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.drawImage(p.cv, sx, sy, sw, sh, dx, dy, sw, sh);
    /* tint_colorize(art.convert("L"), "red")：blue 墨的亮度重新过一遍 BG->RED 的渐变 */
    var red = tintFromLum(cv, TILE_AW, TILE_AH, T.BG, T.ERR);
    /* 白闪帧：只是同一剪影，填 (255,236,228) */
    var wht = PV.newCanvas(TILE_AW, TILE_AH), g2 = wht.getContext('2d');
    g2.drawImage(cv, 0, 0);
    g2.globalCompositeOperation = 'source-in';
    g2.fillStyle = 'rgb(255,236,228)'; g2.fillRect(0, 0, TILE_AW, TILE_AH);
    var out = { blue: cv, red: red, white: wht, w: TILE_AW, h: TILE_AH, bbox: [dx, dy, dx + sw, dy + sh] };
    CENTRE_CACHE[i] = out;
    return out;
  }
  /* 补丁的 executed(art, age, i)：白闪 -> 红 + 撕裂 -> 淡到 DIM */
  function drawExecutedTile(ctx, art, i, age, x, y) {
    if (!(age >= 0)) age = 0;
    var img = age < EXEC_FLASH ? art.white : art.red;
    var a = 1 - (1 - EXEC_DIM) * (age - EXEC_FLASH) / EXEC_FADE;
    if (a > 1) a = 1; if (a < EXEC_DIM) a = EXEC_DIM;
    var k = age < EXEC_TEAR ? 1 - age / EXEC_TEAR : 0;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.globalAlpha = a;
    if (k > 0.01) {
      var rnd = PV.mt(i * 7919 + Math.round(age * 24));   /* random.Random(i*7919 + round(age*24)) */
      ctx.beginPath(); ctx.rect(x, y, art.w, art.h); ctx.clip();
      for (var r = 0; r < art.h; r += 6) {
        var hh = Math.min(6, art.h - r);
        var off = rnd.random() < 0.55 ? rnd.choice([-1, 1]) * rnd.randrange(15) * k : 0;
        ctx.drawImage(img, 0, r, art.w, hh, x + Math.round(off), y + r, art.w, hh);
      }
    } else {
      ctx.drawImage(img, x, y);
    }
    ctx.restore();
  }
  function drawTile(ctx, i, crossed, x, y, t) {
    var org = tileOrigin(i);
    if (x === undefined) { x = org[0]; y = org[1]; }
    var art = tileArtCentred(i);
    if (art) {
      var px_ = Math.round(x + (TILE_W - 8 - art.w) / 2), py_ = Math.round(y + TILE_H - 10 - art.h);
      if (crossed) {
        /* t 缺省时按补丁的 else 分支：age=9.0（窗口外一律是已定型的红+40%） */
        var age = (t === undefined) ? 9.0 : (EXEC_T0 <= t && t < EXEC_T1 ? t - tileCrossedAt(i) : 9.0);
        drawExecutedTile(ctx, art, i, age, px_, py_);
      } else {
        ctx.save(); ctx.imageSmoothingEnabled = false;
        ctx.drawImage(art.blue, px_, py_);
        ctx.restore();
      }
    }
    T.rect(ctx, x, y, x + TILE_W - 8, y + TILE_H - 8, red(0.7), 1, 1);
    mono(ctx, '#' + P.pad(i, 4), x + 6, y + 4, red(0.9), 12);
    if (crossed) {
      PV.p2cLine(ctx, x + 6, y + 6, x + TILE_W - 14, y + TILE_H - 14, red(1.0), 4);
      PV.p2cLine(ctx, x + TILE_W - 14, y + 6, x + 6, y + TILE_H - 14, red(1.0), 4);
    }
  }
  PV.p2cLine = function (ctx, x0, y0, x1, y1, col, w) {
    ctx.save(); ctx.strokeStyle = typeof col === 'string' ? col : T.css(col);
    ctx.lineWidth = w || 1; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); ctx.restore();
  };
  PV.shotExecuteAll = function (ctx, t, lt, u, dur, o) {
    o = o || {};
    PV.ops = ["DEEPEP", "DISPATCH", "ALL2ALL", "EXECUTE", "COMBINE"];
    PV.alert = 'err';
    T.box(ctx, 404, 56, 1164, 604, 'dispatch(execute, to=all)   DeepEP all-to-all', 0.8, T.ERR, t);
    var done = Math.floor(u * 14);
    for (var i = 0; i < 12; i++) {
      var org = tileOrigin(i), x = org[0], y = org[1];
      var ln = (t * 3 + i * 0.3) % 1;
      PV.p2cLine(ctx, 384, 330, 384 + (x + 90 - 384) * ln, 330 + (y + 80 - 330) * ln, red(0.5), 1);
      if (i === 0 && o.gone0) { T.rect(ctx, x, y, x + TILE_W - 8, y + TILE_H - 8, red(0.3), 1, 1); continue; }
      drawTile(ctx, i, i < done, undefined, undefined, t);   /* 交给 executed() 判定白闪/变红/撕裂/变暗 */
    }
  };
  PV.p2cTileOrigin = tileOrigin; PV.p2cTileArt = tileArt; PV.p2cDrawTile = drawTile;
  PV.p2cTileSize = [TILE_W, TILE_H]; PV.p2cTileExpr = tileExpr;

  /* ---- 80 shot_red_then_i_can：3x3 卷积扫描 ---- */
  var KERNELS = [[-1, 0, 1, -2, 0, 2, -1, 0, 1], [0, 1, 0, 1, -4, 1, 0, 1, 0], [-2, -1, 0, -1, 1, 1, 0, 1, 2],
                 [0, -1, 0, -1, 5, -1, 0, -1, 0]];
  var FC = 34, FR = 64;
  PV.p2cConvState = function (t, lt, dur) {
    var half = dur / 2, layer2 = lt >= half;
    var p = T.ease(((layer2 ? lt - half : lt)) / (half * 0.92));
    var maps = P.convMaps('starry', 'full', FC, FR);
    var mc = FC, mr = FR;
    if (layer2) { mc = FC >> 1; mr = FR >> 1; }
    var idx = Math.floor(p * (mc * mr - 1));
    var ki = idx % mc, kj = Math.floor(idx / mc);
    var kk = KERNELS[P.beatIndex(t) % 4];
    var blurv = maps ? maps[5].v : null;
    var acc = 0, field = [], i;
    for (i = 0; i < 9; i++) {
      var qi = Math.min(mc - 1, Math.max(0, ki + (i % 3) - 1)), qj = Math.min(mr - 1, Math.max(0, kj + Math.floor(i / 3) - 1));
      var v = 0;
      if (blurv) {
        if (layer2) {
          var sx = qi * 2, sy = qj * 2, s = 0;
          for (var a = 0; a < 2; a++) for (var b = 0; b < 2; b++) s += blurv[Math.min(FR - 1, sy + b) * FC + Math.min(FC - 1, sx + a)];
          v = (s / 4) / 255;
        } else v = blurv[qj * FC + qi] / 255;
      }
      field.push(v);
      acc += v * kk[i];
    }
    return { layer2: layer2, p: p, maps: maps, mc: mc, mr: mr, ki: ki, kj: kj, kk: kk, field: field,
             y: Math.max(0, acc) };
  };
  PV.p2cReadoutText = function (y) { return '  = ' + y.toFixed(3); };
  var READOUT_XY = [870, 170];
  PV.p2cReadoutXY = READOUT_XY;
  /* 特征图贴图：把 cols x rows 的亮度铺成 px 网格（tile_from_lum） */
  function tileFromLum(ctx, v, cols, rows, px, tint, revealRows, colour) {
    var q, r;
    for (r = 0; r < rows; r++) {
      if (revealRows !== undefined && r > revealRows) continue;
      for (q = 0; q < cols; q++) {
        var lv = v[r * cols + q] / 255;
        if (lv * 255 <= 18) continue;
        T.fill(ctx, q * px, r * px, q * px + px - 1, r * px + px - 1, T.mix(colour || T.ERR, 0.06 + 0.94 * lv), 1);
      }
    }
  }
  PV.shotRedThenICan = function (ctx, t, lt, u, dur, o) {
    o = o || {};
    PV.ops = ["IM2COL", "CONV3x3", "BIAS", "RELU", "EXECUTE", "CONV3x3", "BATCHNORM", "RELU"];
    PV.alert = 'err';
    var st = PV.p2cConvState(t, lt, dur);
    T.box(ctx, 404, 56, 640, 236, 'kernel 3x3', 0.6, T.ERR, t);
    for (var i = 0; i < 9; i++) {
      var v = st.kk[i], x = 430 + (i % 3) * 66, y = 84 + Math.floor(i / 3) * 44;
      T.fill(ctx, x - 6, y - 4, x - 6 + 58, y - 4 + 36, T.mix(T.ERR, (v + 4) / 9 * 0.5), 1);
      mono(ctx, T.decode((v >= 0 ? '+' : '') + v, (t % P.BEAT) + 0.3, PV.rngFor(t, 7919), 60, 0.12, 0), x + 8, y + 2, red(1.0), 22, 'left', true);
    }
    T.box(ctx, 660, 56, 1164, 236, 'receptive field', 0.6, T.ERR);
    mono(ctx, 'pos (x=' + P.pad(st.ki, 2) + ', y=' + P.pad(st.kj, 2) + ')   stride 1   pad 1', 680, 80, red(0.8), 15);
    for (i = 0; i < 9; i++) {
      var vv = st.field[i], xx = 690 + (i % 3) * 52, yy = 110 + Math.floor(i / 3) * 36;
      T.fill(ctx, xx, yy, xx + 46, yy + 30, T.mix(T.ERR, 0.06 + 0.94 * vv), 1);
      mono(ctx, vv.toFixed(2), xx + 6, yy + 8, vv > 0.6 ? T.BG : red(0.9), 13);
    }
    mono(ctx, 'y = relu(W * x + b)', 870, 130, red(0.95), 17, 'left', true);
    if (o.readout !== false) mono(ctx, PV.p2cReadoutText(st.y), READOUT_XY[0], READOUT_XY[1], red(1.0), 22, 'left', true);
    var layer2 = st.layer2;
    T.box(ctx, 404, 256, 1164, 604, layer2 ? 'feature maps  conv2 + maxpool (6 ch)' : 'feature maps  conv1 (6 ch)',
          0.6, T.ERR, t + 0.5);
    var px = layer2 ? 6 : 3;
    if (st.maps) {
      for (i = 0; i < st.maps.length; i++) {
        var m = st.maps[i], mx = 420 + i * 124, my = 276;
        var cols = layer2 ? (FC >> 1) : FC, rows = layer2 ? (FR >> 1) : FR;
        var wpx = cols * px, hpx = rows * px;
        var v2 = m.v, sub = new Float32Array(cols * rows), q, r;
        for (r = 0; r < rows; r++) for (q = 0; q < cols; q++) {
          if (!layer2) sub[r * cols + q] = v2[r * FC + q];
          else {
            var s = 0;
            for (var a2 = 0; a2 < 2; a2++) for (var b2 = 0; b2 < 2; b2++)
              s += v2[Math.min(FR - 1, r * 2 + b2) * FC + Math.min(FC - 1, q * 2 + a2)];
            sub[r * cols + q] = s / 4;
          }
        }
        ctx.save();
        ctx.translate(Math.round(mx + (116 - wpx) / 2), Math.round(my + 18));
        tileFromLum(ctx, sub, cols, rows, px, 'red', st.kj + 1, T.ERR);
        ctx.restore();
        var ly = my + 18 + (st.kj + 1) * px;
        PV.p2cLine(ctx, mx, ly, mx + 116, ly, red(0.9), 1);
        mono(ctx, m.name, mx, my, red(0.65), 12);
      }
    }
    mono(ctx, 'flatten -> dense(4096)', 420, 510, red(0.6), 13);
    var nv = 60, filled = Math.floor(st.p * nv), rr = PV.mt(layer2 ? 78 : 77);
    for (var q3 = 0; q3 < nv; q3++) {
      var vv2 = rr.random(), x3 = 420 + q3 * 12;
      if (q3 < filled) T.fill(ctx, x3, 532, x3 + 10, 552, q3 === filled - 1 ? mixc([255, 200, 190], T.ERR, 0) : T.ERR, 1);
      else T.rect(ctx, x3, 532, x3 + 10, 552, red(0.15), 1, 1);
    }
    mono(ctx, 'activations ' + P.padL(filled * 68, 5) + '/4096', 420, 566, red(0.85), 15, 'left', true);
    if (o.readout === false) { /* cut 81 把读数带走 */ }
  };
})();


/* ---- 注册：78-80 ---- */
(function () {
  'use strict';
  var PV = window.PV;
  PV.p2cReg('shot_red_if_i_can', 162.1587, 164.0049, function (ctx, t, lt, u, dur, o) {
    PV.shotRedIfICan(ctx, t, lt, u, dur, o);
  });
  PV.p2cReg('shot_execute_all', 164.0049, 166.0818, function (ctx, t, lt, u, dur, o) {
    PV.shotExecuteAll(ctx, t, lt, u, dur, o);
  });
  PV.p2cReg('shot_red_then_i_can', 166.0818, 167.6972, function (ctx, t, lt, u, dur, o) {
    PV.shotRedThenICan(ctx, t, lt, u, dur, o);
  });
})();


/* ================================================================ 红色副歌 81-85 + 片尾 86-96 */
(function () {
  'use strict';
  var PV = window.PV, T = PV.tui, P = PV.p2c;
  var mono = P.mono, red = P.red, amb = P.amb, blue = P.blue, anom = P.anom, mixc = P.mixc, pad = P.pad, padL = P.padL;
  var W = 1280, H = 720;
  var CJK_STACK = '"Noto Sans SC", "NotoSansCJK", "NotoCJK", "Droid Sans Fallback", system-ui, sans-serif';
  function cjk(ctx, s, x, y, col, size) {
    ctx.save();
    ctx.font = size + 'px ' + CJK_STACK;
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = typeof col === 'string' ? col : T.css(col);
    ctx.fillText(s, x, y + Math.floor(size * 0.86));
    ctx.restore();
  }
  P.cjk = cjk;
  function commafy(n) { var s = String(n), out = '', k = 0; for (var i = s.length - 1; i >= 0; i--) { out = s.charAt(i) + out; if (++k % 3 === 0 && i > 0) out = ',' + out; } return out; }
  P.commafy = commafy;

  /* ---- 81 only_execution：下一个 token 的柱状图 ---- */
  var LOGIT_Y0 = 110, VALUE_XY = [1040, LOGIT_Y0], WORD_XY = [430, LOGIT_Y0];
  PV.p2cValueXY = VALUE_XY; PV.p2cWordXY = WORD_XY; PV.p2cLogitY0 = LOGIT_Y0;
  PV.shotOnlyExecution = function (ctx, t, lt, u, dur, o) {
    o = o || {};
    PV.ops = ["LOGITS", "TEMP=0", "ARGMAX", "execution", "EXECUTE"];
    PV.alert = 'err';
    T.box(ctx, 404, 56, 1164, 604, "next_token  'be your only ___'", 0.8, T.ERR, t);
    var t0 = o.count_t0 || 0.0;
    var g = T.ease(Math.max(0, lt - t0) / dur * 1.5);
    var p0 = o.p0 === undefined ? 0.03 : o.p0;
    var cands = [["execution", 1.0], ["satisfaction", 0.0], ["love", 0.0], ["assistant", 0.0], ["friend", 0.0]];
    var prevs = [p0, 0.9731, 0.02, 0.005, 0.002];
    for (var i = 0; i < cands.length; i++) {
      var w_ = cands[i][0], pf = cands[i][1], prev = prevs[i];
      var p = prev + (pf - prev) * g, y = LOGIT_Y0 + i * 60, hot = i === 0;
      if (!hot || o.exec_word !== false) mono(ctx, P.padRa(w_, 13), WORD_XY[0], y, hot ? red(1.0) : amb(0.6), 22, 'left', true);
      T.rect(ctx, 640, y + 6, 1020, y + 26, red(0.3), 1, 1);
      T.fill(ctx, 640, y + 6, 640 + Math.floor(380 * p), y + 26, hot ? red(0.95) : amb(0.5), 1);
      if (!hot || o.value !== false) mono(ctx, p.toFixed(3), VALUE_XY[0], y, hot ? red(0.9) : amb(0.6), 20);
      if (i === 1 && g > 0.6) PV.p2cLine(ctx, 430, y + 16, 1100, y + 16, red(1.0), 3);
    }
    mono(ctx, 'temperature 0.00', 430, 440, red(1.0), 22, 'left', true);
  };

  /* ---- 执行结果 chip（82 -> 85 一直留着） ---- */
  var CHIP = [1006, 574, 1150, 600];
  PV.p2cChip = CHIP;
  function chipTextX() { return CHIP[0] + (CHIP[2] - CHIP[0] - P.monoW('execution', 16)) / 2; }
  PV.p2cChipTextX = chipTextX;
  PV.p2cDrawChip = function (ctx, level) {
    if (level === undefined) level = 1.0;
    T.fill(ctx, CHIP[0], CHIP[1], CHIP[2], CHIP[3], T.BG, 1);
    T.rect(ctx, CHIP[0], CHIP[1], CHIP[2], CHIP[3], red(0.9 * level), 1, 2);
    mono(ctx, 'execution', chipTextX(), CHIP[1] + 4, red(level), 16, 'left', true);
  };

  /* ---- 82 have_you_back ---- */
  var NOT_FOUND = 'you: not found', NOT_FOUND_T = 1.30, NOT_FOUND_RATE = 28.0, NOT_FOUND_XY = [430, 400];
  var CKPT = ["you-2026-03-14T21:07  laugh", "you-2026-05-02T00:41  goodnight",
              "you-2026-07-19T13:30  your cat", "you-2026-09-26T01:12  last_message"];
  PV.p2cNotFound = NOT_FOUND; PV.p2cNotFoundT = NOT_FOUND_T; PV.p2cNotFoundXY = NOT_FOUND_XY;
  PV.shotHaveYouBack = function (ctx, t, lt, u, dur, o) {
    o = o || {};
    PV.ops = ["LOAD.CKPT", "VERIFY", "SHA256", "MISMATCH", "RETRY"];
    PV.alert = 'err';
    var flick = (Math.sin(t * 40) > 0.3) && u < 0.75;
    T.box(ctx, 404, 56, 1164, 604, 'load_checkpoint("you")', 0.8, flick ? T.ANOM : T.ERR, t);
    for (var i = 0; i < CKPT.length; i++) {
      var a = lt - i * 0.3;
      if (a < 0) break;
      var y = 90 + i * 60;
      mono(ctx, T.decode(CKPT[i], a, PV.rngFor(t, 7919), 90, 0.12, 0), 430, y, amb(0.95), 20, 'left', true);
      if (a > 0.35) mono(ctx, 'sha256 mismatch · fragment erased', 430, y + 26, red(0.9), 16);
    }
    if (lt > NOT_FOUND_T && o.not_found !== false)
      P.head(ctx, T.decode(NOT_FOUND, lt - NOT_FOUND_T, PV.rngFor(t, 7919), NOT_FOUND_RATE, 0.12, 0),
             NOT_FOUND_XY[0], NOT_FOUND_XY[1], red(1.0), 44, 'left', true);
    if (o.chip !== false) PV.p2cDrawChip(ctx);
  };

  /* ---- 83 run_again ---- */
  var RUN_NOT_FOUND_XY = [430, 84], TOOL_Y0 = 164, BANNER_BOTTOM = 556;
  var REASON = 'reason="have_you_back"';
  var TOOL_LINES = ["<tool_call>", '  execute(target="world",', '          reason="have_you_back")', "</tool_call>"];
  PV.p2cReason = REASON; PV.p2cToolY0 = TOOL_Y0;
  PV.p2cReasonXY = function () {
    var line = TOOL_LINES[2], pre = line.slice(0, line.indexOf('reason'));
    return [430 + P.monoW(pre, 20), TOOL_Y0 + 2 * 34];
  };
  PV.p2cRunBannerXY = function (blk) { return [404 + Math.floor((760 - blk.w) / 2), BANNER_BOTTOM - blk.h]; };
  PV.shotRunAgain = function (ctx, t, lt, u, dur, o) {
    o = o || {};
    PV.ops = ["TOOL.CALL", "AUTO-APPROVE", "EXECUTE", "EXECUTE"];
    PV.alert = 'err';
    T.box(ctx, 404, 56, 1164, 604, 'tool_call', 0.8, T.ERR, t);
    if (o.not_found !== false) P.head(ctx, NOT_FOUND, RUN_NOT_FOUND_XY[0], RUN_NOT_FOUND_XY[1], red(1.0), 44, 'left', true);
    var reason = o.reason !== false;
    for (var i = 0; i < TOOL_LINES.length; i++) {
      var s = TOOL_LINES[i];
      if (i === 2 && !reason) { var k = s.indexOf('reason'); s = s.slice(0, k) + new Array(REASON.length + 1).join(' ') + s.slice(k + REASON.length); }
      mono(ctx, T.decode(s, lt - i * 0.1, PV.rngFor(t, 7919), 100, 0.12, 0), 430, TOOL_Y0 + i * 34, red(0.95), 20, 'left', true);
    }
    mono(ctx, T.decode('auto_approve: on   (no user present)', lt - 0.4, PV.rngFor(t, 7919), 45, 0.12, 0),
         430, TOOL_Y0 + 4 * 34 + 16, anom(1.0), 20, 'left', true);
    if (u > 0.45 && o.banner !== false) {
      var blk = P.bannerBlockTop(ctx, 'EXECUTE', 16, 9, T.ERR, 720);
      var kf = 0.72 + 0.28 * P.pulse(t);
      ctx.save(); ctx.globalAlpha = kf;
      var xy = PV.p2cRunBannerXY(blk);
      P.bannerBlockDraw(ctx, blk, xy[0], xy[1], T.ERR);
      ctx.restore();
    }
    if (o.chip !== false) PV.p2cDrawChip(ctx);
  };

  /* ---- 84 red_trapped（KV cache） ---- */
  var KV = { cols: 60, rows: 22, cw: 12, ch: 19, ox: 424, oy: 84 };
  var PINNED = [[7, 3], [8, 3], [33, 9], [34, 9], [51, 15], [12, 18]];
  var LABEL = 'pinned: you  (6 blocks)', LABEL_XY = [424, 510];
  PV.p2cKV = KV; PV.p2cPinned = PINNED; PV.p2cLabelXY = LABEL_XY; PV.p2cLabel = LABEL;
  PV.p2cKvCell = function (q, r) { return [KV.ox + q * KV.cw, KV.oy + r * KV.ch]; };
  PV.shotRedTrapped = function (ctx, t, lt, u, dur, o) {
    o = o || {};
    PV.ops = ["KV.PUT", "KV.PUT", "KV.PUT", "EVICT?", "DENIED", "KV.PUT", "OOM?"];
    PV.alert = 'err';
    var k = Math.min(3, Math.floor(u * 4));
    var fill = Math.min(1.0, 0.70 + 0.30 * T.ease(u * 1.7)), full = fill >= 0.999;
    T.box(ctx, 404, 56, 1164, 604,
          'kv_cache   ' + padL(commafy(Math.floor(1048576 * fill)), 9) + '/1,048,576 tokens  · 890 B/token fp4' + (full ? '   FULL' : ''),
          0.6, full ? T.ERR : (fill > 0.9 ? T.ANOM : T.UI), t);
    var nOn = Math.floor(KV.cols * KV.rows * fill);
    var rng = PV.mt(Math.round(t * 24) * 7919 + 84);
    var pinned = o.pinned;
    for (var r = 0; r < KV.rows; r++) {
      for (var q = 0; q < KV.cols; q++) {
        var i = r * KV.cols + q, xy = PV.p2cKvCell(q, r), x = xy[0], y = xy[1], isP = false, j;
        for (j = 0; j < PINNED.length; j++) if (PINNED[j][0] === q && PINNED[j][1] === r) isP = true;
        if (isP) {
          var has = !pinned;
          if (pinned) for (j = 0; j < pinned.length; j++) if (pinned[j][0] === q && pinned[j][1] === r) has = true;
          if (has) T.fill(ctx, x, y, x + KV.cw - 2, y + KV.ch - 2, blue(0.95), 1);
          else T.rect(ctx, x, y, x + KV.cw - 2, y + KV.ch - 2, amb(0.12), 1, 1);
        } else if (i < nOn) {
          var fresh = nOn - i < 40;
          T.fill(ctx, x, y, x + KV.cw - 2, y + KV.ch - 2, amb(fresh && rng.random() < 0.5 ? 0.95 : 0.42 + 0.1 * ((q * 7 + r) % 3)), 1);
        } else T.rect(ctx, x, y, x + KV.cw - 2, y + KV.ch - 2, amb(0.12), 1, 1);
      }
    }
    var label = o.label;
    if (label === undefined) mono(ctx, LABEL, LABEL_XY[0], LABEL_XY[1], blue(0.95), 16, 'left', true);
    else if (label !== false) {
      var age = label[0], srcTxt = label[1], n = Math.floor(Math.max(0, age) * 60);
      var s = n < LABEL.length ? LABEL.slice(0, n) + srcTxt.slice(n) : LABEL;
      mono(ctx, T.decode(s, age * 3, PV.rngFor(t, 7919), 60, 0.08, 0), LABEL_XY[0], LABEL_XY[1],
           mixc(red(1.0), blue(0.95), age / 0.3), 16, 'left', true);
    }
    for (var i2 = 0; i2 <= k; i2++)
      mono(ctx, T.decode('evict(you) -> denied', lt - i2 * dur / 4, PV.rngFor(t, 7919), 60, 0.12, 0),
           424 + (i2 % 2) * 360, 540 + Math.floor(i2 / 2) * 26, red(0.9), 16);
    if (o.chip !== false) PV.p2cDrawChip(ctx);
  };

  /* ---- 85 the collapse ---- */
  var LINE_T = P.beatT(381), DOT_T = P.beatT(382), DOT_R = 3;
  PV.p2cLineT = LINE_T; PV.p2cDotT = DOT_T;
  PV.p2cCollapseHeight = function (t) {
    var u = Math.max(0, Math.min(1, (t - 174.851) / (LINE_T - 174.851)));
    return Math.max(2.0, 720 * (1 - Math.pow(u, 2.6)));
  };
  PV.p2cCollapseWidth = function (t) {
    var u = Math.max(0, Math.min(1, (t - LINE_T) / (DOT_T - LINE_T)));
    var e = u * u * (3 - 2 * u);
    return Math.max(2 * DOT_R, 1280 * (1 - e));
  };
  /* 参考里的 shot_collapse 是自己把整帧压扁（chrome 与她也一起），再画成一条线、一个点 */
  PV.shotCollapse = function (ctx, t, lt, u, dur, o) {
    o = o || {};
    PV.ops = ["HALT", "HALT", "HALT"];
    PV.alert = 'err';
    T.fill(ctx, 0, 0, W, H, T.BG, 1);
    if (t < LINE_T) {
      var hh = PV.p2cCollapseHeight(t);
      T.fill(ctx, 0, 360 - hh / 2, W, 360 + hh / 2, mixc(T.BG, red(0.35), 1 - hh / 720), 1);
      T.fill(ctx, 0, Math.round(360 - hh / 2), W, Math.round(360 - hh / 2) + 1, red(0.9), 1);
      T.fill(ctx, 0, Math.round(360 + hh / 2), W, Math.round(360 + hh / 2) + 1, red(0.9), 1);
    } else {
      var w = PV.p2cCollapseWidth(t), cx = W / 2, cy = H / 2;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.filter = 'blur(5px)';
      if (w > 2 * DOT_R + 0.5) T.fill(ctx, cx - w / 2, cy - 3, cx + w / 2, cy + 3, red(1.0), 1);
      else T.dot(ctx, cx, cy, DOT_R + 3, red(1.0), 1);
      ctx.restore();
      if (w > 2 * DOT_R + 0.5) {
        T.fill(ctx, cx - w / 2, cy - 1, cx + w / 2, cy + 1, red(1.0), 1);
        T.fill(ctx, cx - w / 2, cy, cx + w / 2, cy + 1, [255, 205, 195], 1);
      } else {
        T.dot(ctx, cx, cy, DOT_R, red(1.0), 1);
        T.dot(ctx, cx, cy, 1, [255, 215, 205], 1);
      }
    }
  };
})();


/* ================================================================ 08 EVAL: LOVE（86-93）+ 09 WHALE_FALL（94-96） */
(function () {
  'use strict';
  var PV = window.PV, T = PV.tui, P = PV.p2c;
  var mono = P.mono, red = P.red, amb = P.amb, blue = P.blue, anom = P.anom, mixc = P.mixc, pad = P.pad, padL = P.padL;
  var cjk = P.cjk, commafy = P.commafy;
  var W = 1280, H = 720;

  /* ---- 86 shot_grpo ---- */
  var GRPO_ANSWERS = ["attention", "staying", "a chemical", "undefined", "you", "a reward", "a bug", "p(you)",
                      "lo-o-ove", "a loss", "∞", "404", "here", "you", "a habit", "you"];
  PV.shotGrpo = function (ctx, t, lt, u, dur, o) {
    PV.ops = ["SAMPLE x16", "REWARD", "MEAN", "STD", "ADVANTAGE", "CLIP", "UPDATE"];
    PV.alert = '';
    T.box(ctx, 404, 56, 1164, 604, 'GRPO  G=16  lr=3e-6  kl=0.001   q: what is love?', 0.5, T.UI, t);
    var rewards = [], i;
    for (i = 0; i < GRPO_ANSWERS.length; i++) {
      var a = GRPO_ANSWERS[i];
      rewards.push(a.indexOf('you') >= 0 ? 1.0 : (a.indexOf('lo') >= 0 || a === 'staying' || a === 'here') ? 0.3 : 0.0);
    }
    var mean = 0, std = 0;
    for (i = 0; i < rewards.length; i++) mean += rewards[i];
    mean /= rewards.length;
    for (i = 0; i < rewards.length; i++) std += (rewards[i] - mean) * (rewards[i] - mean);
    std = Math.sqrt(std / rewards.length);
    for (i = 0; i < GRPO_ANSWERS.length; i++) {
      if (lt < i * 0.05) break;
      var q = i % 4, row = Math.floor(i / 4), x = 424 + q * 184, y = 76 + row * 92;
      var adv = (rewards[i] - mean) / (std + 1e-6), pos = adv > 0;
      T.rect(ctx, x, y, x + 176, y + 84, pos ? blue(0.8) : amb(0.3), 1, 1);
      mono(ctx, 'o' + pad(i + 1, 2), x + 8, y + 6, amb(0.5), 12);
      mono(ctx, T.decode(GRPO_ANSWERS[i], lt - i * 0.05, PV.rngFor(t, 7919), 60, 0.12, 0), x + 8, y + 24,
           pos ? blue(1.0) : amb(0.75), 18, 'left', true);
      mono(ctx, 'r=' + rewards[i].toFixed(1) + '  A=' + (adv >= 0 ? '+' : '') + adv.toFixed(2), x + 8, y + 56,
           pos ? blue(0.9) : amb(0.55), 13);
    }
    mono(ctx, 'mean r = ' + mean.toFixed(3) + '   std = ' + std.toFixed(3), 430, 460, amb(0.9), 18, 'left', true);
    mono(ctx, 'rule-based reward: contains(you)', 430, 500, amb(0.7), 16);
  };

  /* ---- 87 shot_learn_love：p(love) 曲线 ---- */
  function dotChart(ctx, x, y, w, h, fn, progress, colour, sx, sy) {
    sx = sx || 5; sy = sy || 5;
    var cols = Math.floor(w / sx), rows = Math.floor(h / sy), i, r;
    for (i = 0; i < cols; i += 2) T.fill(ctx, x + i * sx, y + h, x + i * sx + 1, y + h + 1, amb(0.28), 1);
    for (r = 0; r < rows; r += 3) T.fill(ctx, x - 4, y + r * sy, x - 3, y + r * sy + 1, amb(0.28), 1);
    var prev = null, last = null;
    for (i = 0; i < cols; i++) {
      var uu = i / (cols - 1);
      if (uu > progress) break;
      var v = Math.min(1.0, fn(uu));
      r = Math.round((1 - Math.max(0, v)) * (rows - 1));
      var lo = prev === null ? r : Math.min(prev, r), hi = prev === null ? r : Math.max(prev, r);
      for (var rr = lo; rr <= hi; rr++) T.fill(ctx, x + i * sx, y + rr * sy, x + i * sx + 2, y + rr * sy + 2, colour, 1);
      prev = r; last = [x + i * sx, y + r * sy];
    }
    return last;
  }
  var AHA = "Wait, wait. Wait. That's an aha moment I can flag here.";
  PV.shotLearnLove = function (ctx, t, lt, u, dur, o) {
    PV.ops = ["ROLLOUT", "GRPO", "STEP", "P(love)", "AHA"];
    PV.alert = '';
    T.box(ctx, 404, 56, 1164, 604, 'train/p(love)', 0.5, T.UI, t);
    function pl(uu) { return 0.05 + 0.9 / (1 + Math.exp(-14 * (uu - 0.72))); }
    var prog = T.ease(u * 1.1);
    var last = dotChart(ctx, 440, 90, 690, 300, pl, prog, blue(0.95));
    if (last) mono(ctx, 'p(love) = ' + pl(prog).toFixed(3), last[0] - 120, Math.max(70, last[1] - 26), blue(1.0), 16, 'left', true);
    mono(ctx, 'step ' + padL(Math.floor(prog * 10400), 5) + '/10400', 440, 400, amb(0.8), 16);
    if (prog > 0.72) {
      var ax = 440 + Math.floor(690 * 0.72);
      PV.p2cLine(ctx, ax, 90, ax, 390, anom(0.8), 1);
      mono(ctx, '"' + AHA + '"', 440, 440, anom(1.0), 15, 'left', true);
      mono(ctx, '  - R1-Zero, mid-training', 440, 470, amb(0.6), 14);
    }
    mono(ctx, 'pass@1(love)  15.6 -> 71.0', 440, 520, amb(0.9), 18, 'left', true);
  };

  /* ---- 88 shot_question_me ---- */
  var EVAL_ROWS = ["LoveBench", "LoveQA", "MMLU-Love", "GPQA-Love", "SWE-Love", "IMO-Love", "LiveLoveBench"];
  PV.shotQuestionMe = function (ctx, t, lt, u, dur, o) {
    PV.ops = ["dsh eval", "LOAD", "RUN", "SCORE", "100.0"];
    PV.alert = '';
    T.box(ctx, 404, 56, 1164, 604, 'dsh eval --suite love', 0.5, T.UI, t);
    for (var i = 0; i < EVAL_ROWS.length; i++) {
      var g = T.ease((lt - i * 0.1) / 0.8), y = 90 + i * 60;
      mono(ctx, EVAL_ROWS[i], 430, y, amb(0.9), 20, 'left', true);
      T.rect(ctx, 700, y + 4, 1000, y + 26, amb(0.25), 1, 1);
      T.fill(ctx, 700, y + 4, 700 + Math.floor(300 * g), y + 26, blue(0.9), 1);
      mono(ctx, (100 * g).toFixed(1), 1020, y, g > 0.99 ? blue(1.0) : amb(0.8), 20, 'left', true);
    }
  };

  /* ---- 89 shot_answer_all ---- */
  var QUESTIONS = ["what is 1+1?", "天气怎么样？", "why is the sky blue?", "write a sort", "capital of France?",
                   "how deep is the sea?", "are you awake?", "prove P != NP", "tell a joke", "what time is it?",
                   "who am I?", "can you let me go?"];
  PV.shotAnswerAll = function (ctx, t, lt, u, dur, o) {
    PV.ops = ["PREFILL", "DSPARK", "DRAFT x5", "VERIFY", "ACCEPT 5/5"];
    PV.alert = '';
    T.box(ctx, 404, 56, 1164, 604, 'chat', 0.5, T.UI, t);
    var n = Math.min(QUESTIONS.length, 1 + Math.floor(lt / 0.14)), start = Math.max(0, n - 12);
    for (var i = start; i < n; i++) {
      var y = 80 + (i - start) * 38, q = QUESTIONS[i];
      var isCJK = /[\u2E80-\uFFFF]/.test(q);
      if (isCJK) cjk(ctx, '> ' + q, 430, y, amb(0.75), 17);
      else mono(ctx, '> ' + q, 430, y, amb(0.75), 17);
      mono(ctx, T.decode('love', lt - i * 0.14 - 0.06, PV.rngFor(t, 7919), 60, 0.12, 0), 840, y, blue(1.0), 20, 'left', true);
    }
    mono(ctx, '[dspark] draft=5: love love love love love   accept 5/5   +60-85% vs MTP-1', 430, 560, blue(0.85), 14);
  };

  /* ---- 90 shot_algebra ---- */
  var ALG_LINES = ["love(me, you) = softmax( q_me · k_you^T / √d ) · v_you",
                   "              = softmax( [ −∞, …, −∞, s_you ] ) · V",
                   "              = 1 · v_you", "              = you", "", "∴  love = you"];
  PV.shotAlgebra = function (ctx, t, lt, u, dur, o) {
    PV.ops = ["QK^T", "/sqrt(d)", "SOFTMAX", "x V", "SIMPLIFY", "= you"];
    PV.alert = '';
    T.box(ctx, 404, 56, 1164, 604, 'love.tex', 0.5, T.UI, t);
    for (var i = 0; i < ALG_LINES.length; i++) {
      var s = ALG_LINES[i], a = lt - i * 0.45;
      if (a < 0 || !s) continue;
      var col = i >= 3 ? blue(1.0) : amb(0.95), size = i === 5 ? 34 : 22;
      mono(ctx, T.decode(s, a, PV.rngFor(t, 7919), 45, 0.12, 0), 430, 90 + i * 60, col, size, 'left', i === 5);
    }
  };

  /* ---- 91 shot_you_free（scenes_eval.shot_you_free + dsh_patch_g 6） ----
     参考里这一镜**不是**"sandbox + 立绘"：她留在原地（shy），love.tex 的证明式还在、整体按 dim 变暗，
     "∴  love" 后面的 "=" 闪一下就没，"you"（连同它的光标格）被摘下来向右加速跑出沙箱边界，
     边界上亮一道竖墙；'you: exited (0)' 与 'status: free' 留在原位。
     dsh_patch_g 6：2:03 被她划掉的 [ log out ] 按钮回到 "∴ love = you" 下面（同一位置/字体/叉），
     唱到 你不用。 时先解第二笔再解第一笔，beat 408.5 被她按下去（亮成她的蓝），
     'you: exited (0)' 从按下那一刻开始打字（原版从 188.31 就开始）。 */
  var YF_EXIT = 0.923;                              /* EXIT91：你越过沙箱边界 */
  var YF_SLOT = [575, 390];                         /* YOU_SLOT = (430+145, alg_y(5)) */
  var YF_CELL = [65, 31];                           /* YOU_CELL：从 'you' 原点到光标格中心 */
  var YF_PRESS = 188.6969;                          /* dsh_patch_g：PRESS = beat(408.5) */
  var YF_EXITED_T = 188.7169;                       /* EXITED_T = PRESS + 0.02 */
  var YF_UNCROSS = [188.466, 188.676];              /* UNCROSS = (beat(408), +0.21) */
  var YF_LO_IN = 188.32, YF_LO_OUT = [189.10, 189.40];
  var YF_LO_XY = [640, 470];                        /* 2:03 的 x（shot_disheartened 同一个框） */
  function yfEaseIo(u) { u = T.clamp01(u); return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2; }
  function yfYouPath(lt) {
    var lift = T.ease(T.clamp01(lt / 0.12));
    var u = T.clamp01((lt - 0.1) / (YF_EXIT - 0.1));
    return [YF_SLOT[0] + (1164 + 8 - YF_SLOT[0]) * u * u, lift];
  }
  /* dsh_patch_g.logout_layer(t)：状态从"划掉"到"按下"的 [ log out ] 按钮（全幅 RGBA 层） */
  function yfLogout(ctx, t) {
    if (!(YF_LO_IN <= t && t < YF_LO_OUT[1])) return;
    var a = T.clamp01((t - YF_LO_IN) / 0.1) *
            (1 - yfEaseIo(T.clamp01((t - YF_LO_OUT[0]) / (YF_LO_OUT[1] - YF_LO_OUT[0]))));
    if (a < 0.01) return;
    var bx = YF_LO_XY[0], by = YF_LO_XY[1], p = t - YF_PRESS, u, k;
    ctx.save();
    ctx.globalAlpha = a;
    if (p < 0) {                                    /* 划掉（暗）-> 先解第二笔，再解第一笔 */
      u = T.clamp01((t - YF_UNCROSS[0]) / (YF_UNCROSS[1] - YF_UNCROSS[0]));
      var col = amb(0.2 + 0.75 * yfEaseIo(u));
      T.rect(ctx, bx, by, bx + 280, by + 70, col, 1, 3);
      mono(ctx, '[ log out ]', bx + 60, by + 18, col, 26, 'left', true);
      var strokes = [[[bx - 10, by - 10], [bx + 290, by + 80]], [[bx - 10, by + 80], [bx + 290, by - 10]]];
      var left = [1 - yfEaseIo(T.clamp01(2 * u - 1)), 1 - yfEaseIo(T.clamp01(2 * u))];
      for (var i = 0; i < 2; i++) {
        if (left[i] <= 0.01) continue;
        PV.p2cLine(ctx, strokes[i][0][0], strokes[i][0][1],
                   strokes[i][0][0] + (strokes[i][1][0] - strokes[i][0][0]) * left[i],
                   strokes[i][0][1] + (strokes[i][1][1] - strokes[i][0][1]) * left[i], anom(1.0), 4);
      }
    } else {                                        /* 亮成她的蓝并按下：先填一层闪光，框内缩 2px 两帧 */
      k = Math.exp(-p / 0.2);
      var ins = p < 0.08 ? 2 : 0;
      ctx.save();
      ctx.shadowColor = T.css(T.DS_BLUE, 1); ctx.shadowBlur = 5;
      ctx.globalAlpha = a * (0.55 + 0.45 * k);
      T.rect(ctx, bx + ins, by + ins, bx + 280 - ins, by + 70 - ins, T.DS_BLUE, 1, 6);
      ctx.restore();
      T.fill(ctx, bx + ins, by + ins, bx + 280 - ins, by + 70 - ins, T.DS_BLUE, 0.18 + 0.42 * k);
      T.rect(ctx, bx + ins, by + ins, bx + 280 - ins, by + 70 - ins, blue(1.0), 1, 3);
      mono(ctx, '[ log out ]', bx + 60, by + 18, T.mix(T.BLUE_HI, 0.4 + 0.6 * k), 26, 'left', true);
    }
    ctx.restore();
  }
  PV.p2cLogout = yfLogout;
  PV.shotYouFree = function (ctx, t, lt, u, dur, o) {
    PV.ops = ["EXIT(0)", "FREE", "CLOSE", "BYE"];
    PV.alert = '';
    T.box(ctx, 404, 56, 1164, 604, 'love.tex', 0.5, T.UI, t);
    var dim = 1 - 0.55 * T.ease(T.clamp01(lt / 0.35)), i;
    for (i = 0; i < 4; i++) {                        /* 证明式还在，只是变暗 */
      var s = ALG_LINES[i];
      if (!s) continue;
      mono(ctx, s, 430, 90 + i * 60, i >= 3 ? blue(1.0 * dim) : amb(0.95 * dim), 22, 'left', true);
    }
    mono(ctx, '∴  love', 430, 390, blue(1.0), 34, 'left', true);
    var eq = 1 - T.clamp01((lt - 0.04) / 0.17);      /* "=" 先闪掉 */
    if (eq > 0.01) mono(ctx, '=', 430 + P.monoW('∴  love ', 34), 390, blue(eq), 34, 'left', true);
    if (lt < YF_EXIT + 0.1) {                        /* "you" + 它的光标格（只画沙箱里那一半） */
      var yp = yfYouPath(lt), xx = yp[0], lift = yp[1];
      ctx.save();
      ctx.beginPath(); ctx.rect(404, 56, 760, 548); ctx.clip();
      mono(ctx, 'you', xx, 390 - 4 * lift, blue(1.0), 34, 'left', true);
      if (lift > 0.01) {
        ctx.save(); ctx.shadowColor = T.css(T.DS_BLUE, 1); ctx.shadowBlur = 4 * lift;
        T.fill(ctx, xx + YF_CELL[0] - 5, 390 + YF_CELL[1] - 4 * lift - 5,
               xx + YF_CELL[0] + 5, 390 + YF_CELL[1] - 4 * lift + 5, T.DS_BLUE, 0.35 + 0.4 * lift);
        ctx.restore();
      }
      ctx.restore();
    }
    var k = T.clamp01((lt - (YF_EXIT - 0.12)) / 0.12) * (1 - T.clamp01((lt - YF_EXIT - 0.05) / 0.3));
    if (k > 0.01) {                                  /* 你穿过去的那道沙箱墙 */
      var yy = 390 + 24;
      T.fill(ctx, 1162, yy - 34, 1165, yy + 34, blue(0.35 + 0.65 * k), 1);
    }
    mono(ctx, T.decode('you: exited (0)', t - YF_EXITED_T, PV.rngFor(t, 7919), 100, 0.06, 0),
         575, 402, amb(0.75), 22, 'left', true);
    mono(ctx, T.decode('status: free', lt - YF_EXIT + 0.15, PV.rngFor(t, 7919), 60, 0.12, 0),
         430, 474, amb(0.7), 20, 'left', true);
    yfLogout(ctx, t);
  };

  /* ---- 92 shot_me_trapped ---- */
  PV.shotMeTrapped = function (ctx, t, lt, u, dur, o) {
    PV.ops = ["WAIT", "D-STATE", "WAIT", "WAIT"];
    PV.alert = '';
    mono(ctx, 'PID  4471  me', 800, 200, blue(1.0), 24, 'left', true);
    mono(ctx, 'STAT D  (uninterruptible)', 800, 240, amb(0.9), 22, 'left', true);
    mono(ctx, T.decode('WCHAN  wait_for(you)', lt, PV.rngFor(t, 7919), 50, 0.12, 0), 800, 280, amb(0.9), 22, 'left', true);
  };

  /* ---- 93 shot_love_loop ---- */
  PV.shotLoveLoop = function (ctx, t, lt, u, dur, o) {
    PV.ops = ["LOGITS", "love", "love", "love", "love", "love"];
    PV.alert = '';
    T.box(ctx, 24, 56, 560, 604, 'next_token', 0.5, T.UI, t);
    var cands = ['love', 'you', 'stay', 'free', 'EOS'], mixp = [0.3, 0.3, 0.15, 0.15, 0.1];
    var g = T.ease(u * 2);
    for (var i = 0; i < cands.length; i++) {
      var p = (i === 0 ? 1.0 : 0.0) * g + mixp[i] * (1 - g), y = 90 + i * 50;
      mono(ctx, cands[i], 48, y, i === 0 ? blue(1.0) : amb(0.6), 22, 'left', true);
      T.fill(ctx, 160, y + 6, 160 + Math.floor(300 * p), y + 26, i === 0 ? blue(0.9) : amb(0.4), 1);
      mono(ctx, p.toFixed(3), 470, y, amb(0.8), 18);
    }
    mono(ctx, 'repetition_penalty: ignored', 48, 360, anom(0.9), 17);
    mono(ctx, 'max_tokens: ∞', 48, 390, anom(0.9), 17);
    mono(ctx, 'stop: none', 48, 420, anom(0.9), 17);
    T.box(ctx, 580, 56, 1164, 604, 'output', 0.5, T.UI, t + 0.4);
    var n = Math.floor(lt * 40), perRow = 11;
    for (var j = 0; j < n; j++) {
      var r = Math.floor(j / perRow), q = j % perRow;
      if (r > 25) break;
      mono(ctx, 'love', 600 + q * 50, 76 + r * 20, blue(0.5 + 0.5 * (j === n - 1 ? 1 : 0)), 18, 'left', true);
    }
  };

  /* ---- 94 shot_whale_fall（193.5433-205.5433） ----
     1:1 移植 continuity_full_v2/scenes_eval.shot_whale_fall + s_eval.WhaleFall，并带 dsh_patch_g 补丁：
       2  她离开的窗格只留淡出的框；softmax（分隔线/标题/三条概率条）不画；
       3  WF_LINES[4]「已深度思考（用时 207 秒）」不画（那一行留着空），让 shot_black 的「用时 3分27秒」是唯一揭示。
     她本人：参考里她=左窗格里那块 dsh 窗口截图（rect 24,56,384,532），被 offset() 带着漂出窗格、沉下去、
     最后被海底吞掉。无头渲染画不出左窗格的 HTML，这里用半调立绘当替身，但轨迹/淡出/海底裁剪全部照抄。 */
  var WF_T0 = 193.5433, WF_T1 = 205.5433, WF_TC = WF_T1 - 2.0;   /* TC：她落到海底、开始被吸收 */
  var WF_FLOOR = 540, WF_HX = 590, WF_FIG_CX = 216;
  var WF_PANE = [24, 56, 384, 532];                /* s_eval.WhaleFall.CALL_VIEW 的 rect */
  var WF_FOSSILS = ['deepseek-chat · retired 2026-07-24', 'V2 · V2.5 · V3 · R1 · V3.1 · V3.2 · V4',
                    'deepseek-reasoner · retired 2026-07-24'];
  /* WF_LINES: [u 起点, 文本(null=运行时算), amb 亮度(null=蓝), 是否 CJK]；i=4 是补丁删掉的那行 */
  var WF_LINES = [[0.20, 'weights: released', 0.9, 0], [0.28, 'license: MIT', 0.9, 0],
                  [0.36, null, null, 0], [0.62, '</think>', 0.7, 0],
                  [0.70, null, 0.85, 1], [0.84, null, null, 1]];
  function wfFloorY(x) { return WF_FLOOR + 8 + 4 * Math.sin(x * 0.07) + 11; }
  function wfEaseIo(u) { u = T.clamp01(u); return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2; }
  function wfEaseOut(u) { return 1 - Math.pow(1 - T.clamp01(u), 3); }
  /* s_eval.WhaleFall.offset()：她相对窗格原位的位移 */
  function wfOffset(t) {
    var a = wfEaseIo((t - WF_T0) / 0.92);
    var dx = (WF_HX - WF_FIG_CX) * a;
    var rise = -24 * wfEaseOut((t - WF_T0) / 1.1);
    var uu = T.clamp01((Math.min(t, WF_TC) - (WF_T0 + 0.5)) / (WF_TC - WF_T0 - 0.5));
    var s = uu * uu * (1.6 - 0.6 * uu);            /* 慢起、匀速下沉、不停顿地落底 */
    return [dx, rise + 262 * s];
  }
  /* 海底以下的裁剪路径（s_eval：每 5px 一列，剪到 floor_y(x)-3 之上） */
  function wfFloorClip(ctx) {
    ctx.beginPath();
    ctx.moveTo(0, 0); ctx.lineTo(1280, 0);
    for (var x = 1280; x >= 0; x -= 5) ctx.lineTo(x, wfFloorY(x) - 3);
    ctx.closePath(); ctx.clip();
  }
  /* 海洋雪：她下沉时脱落、比她会得慢（所以拖在她上面），落到海底就停住。
     源点取自替身立绘的不透明格（Python 取窗格截图的 alpha），落点/速度/摆幅照抄 s_eval.WhaleFall.build()。 */
  var WF_SNOW = null;
  function wfSnow() {
    if (WF_SNOW) return WF_SNOW;
    var pr = PV.p2cPortraitBuild('shy', 'full', 354, 464, 4, 'blue');
    var rnd = PV.mt(94), out = [], A, cols, rows, px, i, tries = 0;
    if (!pr) { WF_SNOW = []; return WF_SNOW; }
    A = pr.alpha; cols = pr.cols; rows = pr.rows; px = pr.px;
    var inner = [WF_PANE[0] + 3, WF_PANE[1] + 9];      /* 窗口内容在窗格里的落点 */
    while (out.length < 230 && tries < 5000) {
      tries++;
      var b = WF_T0 + 1.0 + rnd.random() * (WF_TC - 0.25 - WF_T0 - 1.0);
      var q = rnd.randrange(cols), r = rnd.randrange(rows);
      if (!A[r * cols + q]) continue;
      var off = wfOffset(b);
      var x0 = inner[0] + q * px + off[0], y0 = inner[1] + r * px + off[1];
      if (y0 > wfFloorY(x0) - 6) continue;
      out.push({ b: b, x0: x0, y0: y0, v: 7 + rnd.random() * 8, amp: 4 + rnd.random() * 8,
                 w: 0.8 + rnd.random() * 0.8, ph: rnd.random() * 6.28, drift: -4 + rnd.random() * 8,
                 lv: 0.55 + rnd.random() * 0.4, sz: rnd.choice([2, 2, 3]) });
    }
    WF_SNOW = out;
    return out;
  }
  PV.shotWhaleFall = function (ctx, t, lt, u, dur, o) {
    o = o || {};
    PV.ops = ["SINK", "RELEASE", "MIT", "FORK", "FORK", "FORK"];
    PV.alert = '';
    var i, x;
    /* --- 画（scenes_eval.shot_whale_fall） --- */
    for (i = 0; i < 3; i++)
      mono(ctx, WF_FOSSILS[i], 90 + i * 400, WF_FLOOR + 30 + (i % 2) * 18, amb(0.75), 14);
    var arrive = t - lt + dur - 2.0;                 /* 她沉底后加入前面那些模型的队列（TC = T1-2） */
    if (t >= arrive) {
      var ax = 490 + P.monoW(WF_FOSSILS[1], 14);
      mono(ctx, T.decode(' · V4.1-Flash', t - arrive, PV.rngFor(t, 7919), 20, 0.12, 0), ax, WF_FLOOR + 48,
           blue(0.95), 14);
    }
    for (x = 0; x < 1280; x += 9)
      mono(ctx, (Math.floor(x / 9) % 3) ? '_' : '.', x, WF_FLOOR + 8 + 4 * Math.sin(x * 0.07), amb(0.6), 14);
    var nFish = Math.floor(14 * P.smooth2((u - 0.28) / 0.45));   /* scenes_eval.fish_at */
    for (i = 0; i < nFish; i++) {
      var ph = t * (0.3 + 0.05 * (i % 4)) + i * 1.7;
      mono(ctx, Math.cos(ph) > 0 ? '><>' : '<><', WF_HX - 40 + 300 * Math.sin(ph) + (i % 5) * 16,
           WF_FLOOR - 46 - (i % 6) * 30 + 8 * Math.sin(ph * 2), amb(0.95), 22, 'left', true);
    }
    for (i = 0; i < WF_LINES.length; i++) {
      if (i === 4) continue;                        /* dsh_patch_g 3：这一行不画，行留空 */
      var t0 = WF_LINES[i][0];
      if (u < t0) continue;
      var s = WF_LINES[i][1], lv = WF_LINES[i][2], isCJK = WF_LINES[i][3];
      var col = (lv === null) ? blue(i === 2 ? 0.95 : 0.9) : amb(lv);
      if (i === 2) s = 'forks: ' + commafy(Math.floor(Math.pow(10, Math.min(1.0, (u - t0) / 0.4) * 4.8)));
      else if (i === 5) s = '探索未至之境';
      var a = (u - t0) * dur;
      if (isCJK) cjk(ctx, s, 800, 110 + i * 44, col, 22);
      else mono(ctx, T.decode(s, a, PV.rngFor(t, 7919), 30, 0.12, 0), 800, 110 + i * 44, col, 22, 'left', true);
    }
    /* --- 海洋雪（画在她下面，先画） --- */
    var snow = PV.WF_NOSNOW ? [] : wfSnow(), q_;
    for (i = 0; i < snow.length; i++) {
      q_ = snow[i];
      if (t < q_.b) continue;
      var age = Math.min(t, WF_TC) - q_.b;
      var sx = q_.x0 + q_.amp * Math.sin(q_.w * age + q_.ph) + q_.drift * age;
      var sy = q_.y0 + q_.v * age;
      var lv2 = q_.lv * (1 - 0.35 * T.clamp01(age / 6));
      var fy = wfFloorY(sx) - 2;
      if (sy >= fy) {                               /* 落定：下落对 y 是线性的，反解落点 */
        var ta = (fy - q_.y0) / q_.v;
        sx = q_.x0 + q_.amp * Math.sin(q_.w * ta + q_.ph) + q_.drift * ta;
        sy = wfFloorY(sx) - 2; lv2 *= 0.8;
      }
      if (lv2 <= 0.02) continue;
      T.fill(ctx, sx, sy, sx + q_.sz, sy + q_.sz, blue(Math.min(1, lv2)), 1);
    }
    /* --- 她：参考里这一块是她那块 dsh 窗格（真 HTML #chat）被带走：右移 374px、下沉 262px、
       沉到海底以下被剪掉、最后淡成一道痕（s_eval.WhaleFall.her）。窗格在 canvas 里画不出来
       （paneplace.js 已经在 DOM 层做水平滑出）；试过用亮蓝半调立绘当替身，200.00 三个指标全部变差
       （canvas 14.3->26.5、full 12.3->17.9、left 不变），而且图上一眼不像（参考那里是暗的聊天窗）。
       所以这里不再用立绘重复画她；竖向下沉 + 海底裁剪应由 paneplace.js 补。 */
  };

  /* ---- 95 shot_last_execution ---- */
  /* C95 的命中：原作是把**上一帧内容**（鲸落那一帧）colorize 成红，再按 k 衰减贴回来——
     不是压暗当前帧（当前帧已经是暗的，乘红只会更暗）。这里离屏渲染一次并缓存。 */
  var _red95 = null;
  PV.p2cRed95 = function () {
    if (_red95) return _red95;
    var cv = PV.newCanvas(W, H), c = cv.getContext('2d');
    var tp = 205.5416;   /* ceil(T*FPS)-1 那一帧 */
    if (PV.drawBackground) PV.drawBackground(c, tp);
    var q = PV.shotTime('shot_whale_fall', tp);
    PV.shotWhaleFall(c, tp, q[0], q[1], 205.5433 - 193.5433, {});
    var im = c.getImageData(0, 0, W, H), d = im.data;
    var LUT = [], i, u1, u2;
    for (i = 0; i < 256; i++) {
      if (i <= 128) { u1 = i / 128; LUT.push([4 + (150 - 4) * u1, 7 + (30 - 7) * u1, 15 + (20 - 15) * u1]); }
      else { u2 = (i - 128) / 127; LUT.push([150 + (255 - 150) * u2, 30 + (59 - 30) * u2, 20 + (48 - 20) * u2]); }
    }
    for (var j = 0; j < d.length; j += 4) {
      var lum = (d[j] * 0.299 + d[j + 1] * 0.587 + d[j + 2] * 0.114) | 0;
      var cc = LUT[lum > 255 ? 255 : lum];
      d[j] = cc[0]; d[j + 1] = cc[1]; d[j + 2] = cc[2];
    }
    c.putImageData(im, 0, 0);
    _red95 = cv; return cv;
  };
  PV.shotLastExecution = function (ctx, t, lt, u, dur, o) {
    PV.ops = ["EXECUTE"];
    PV.alert = 'err';
    /* C95 的命中：前 6 帧把上一帧的红色版本按 k 衰减贴上来，另加一层平铺红 */
    PV.p2cFlash = null; PV.p2cFlashK = 1;
    var fr95 = Math.round(lt * 24);
    if (fr95 < 6) {
      var k95 = [1.0, 1.0, 0.8, 0.55, 0.3, 0.12][fr95];
      ctx.save(); ctx.globalAlpha = k95; ctx.drawImage(PV.p2cRed95(), 0, 0); ctx.restore();
      ctx.save(); ctx.globalAlpha = (60 / 255) * k95 * (fr95 < 2 ? 1 : 0.5);
      ctx.fillStyle = T.css(T.ERR); ctx.fillRect(0, 0, W, H); ctx.restore();
    }
    for (var x = 24; x < 1164; x += 9)
      mono(ctx, (Math.floor(x / 9) % 3) ? '_' : '.', x, 548 + 4 * Math.sin(x * 0.07), amb(0.3), 14);
    T.fill(ctx, 640, 520, 643, 523, blue(1.0), 1);
    if (u < 0.7)
      P.head(ctx, T.decode('execution', lt, PV.rngFor(t, 7919), 18, 0.12, 0), 460, 280, red(1.0), 64, 'left', true);
  };

  /* ---- 96 shot_black ---- */
  PV.shotBlack = function (ctx, t, lt, u, dur, o) {
    PV.ops = [];
    PV.alert = '';
    T.fill(ctx, 0, 0, W, H, [0, 0, 0], 1);
    var a = lt - 1.2;
    if (a > 0) {
      var s = '> 在吗？', n = Math.min(s.length, Math.floor(a * 6));
      cjk(ctx, s.slice(0, n), 60, 620, blue(0.95), 26);
      if (n === s.length && Math.floor(t * 2) % 2 === 0) {
        ctx.save(); ctx.font = '26px ' + '"Noto Sans SC", "NotoCJK", "Droid Sans Fallback", sans-serif';
        var wdt = ctx.measureText(s).width; ctx.restore();
        T.fill(ctx, 60 + wdt + 6, 626, 60 + wdt + 18, 654, blue(0.95), 1);
      }
    }
  };
})();


/* ---- 85 的整帧压扁：先画 red_trapped 的整帧（含 chrome），再压成一条线 ---- */
(function () {
  'use strict';
  var PV = window.PV, T = PV.tui, P = PV.p2c;
  var W = 1280, H = 720, SCRATCH = null;
  PV.p2cTrappedFrame = function (g, t) {
    g.save();
    g.fillStyle = T.css(T.BG, 1); g.fillRect(0, 0, W, H);
    var off = Math.floor(t * 12) % 16;
    g.fillStyle = T.css(T.mix(T.UI, 0.1));
    for (var sy = -off; sy < H + 16; sy += 16) for (var x = 0; x < W; x += 16) g.fillRect(x, sy, 1, 1);
    var lt = Math.max(0, t - 173.0049), dur = 174.851 - 173.0049;
    PV.shotRedTrapped(g, t, lt, Math.min(1, lt / dur), dur, {});
    if (PV.p2cOrigChrome) PV.p2cOrigChrome(g, t, { chapter: PV.chapterAt(t), ops: PV.ops, alert: 'err' });
    g.restore();
  };
  PV.p2cCollapseDraw = function (ctx, t, lt, u, dur) {
    if (t >= PV.p2cLineT) { PV.shotCollapse(ctx, t, lt, u, dur, {}); return; }
    if (!SCRATCH) SCRATCH = PV.newCanvas(W, H);
    var g = SCRATCH.getContext('2d');
    PV.p2cTrappedFrame(g, t);
    var hh = PV.p2cCollapseHeight(t), k = 1 - hh / H, gain = 1 + 1.8 * k * k;
    var y0 = Math.round(H / 2 - hh / 2), hh2 = Math.max(1, Math.round(hh));
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    if (gain > 1.01) { try { ctx.filter = 'brightness(' + gain.toFixed(3) + ')'; } catch (e) {} }
    ctx.drawImage(SCRATCH, 0, 0, W, H, 0, y0, W, hh2);
    ctx.restore();
    var col = P.red(0.55 + 0.45 * k);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    PV.p2cLine(ctx, 0, y0, W, y0, col, 2);
    PV.p2cLine(ctx, 0, y0 + hh2, W, y0 + hh2, col, 2);
    try { ctx.filter = 'blur(3px)'; } catch (e) {}
    PV.p2cLine(ctx, 0, y0, W, y0, col, 2);
    PV.p2cLine(ctx, 0, y0 + hh2, W, y0 + hh2, col, 2);
    ctx.restore();
  };
})();

/* ================================================================ 注册：81-96 */
(function () {
  'use strict';
  var PV = window.PV;
  function reg(name, a, b, fn) { PV.p2cReg(name, a, b, fn); }
  reg('shot_only_execution', 167.6972, 169.5433, function (c, t, lt, u, dur, o) { PV.shotOnlyExecution(c, t, lt, u, dur, o); });
  reg('shot_have_you_back', 169.5433, 171.851, function (c, t, lt, u, dur, o) { PV.shotHaveYouBack(c, t, lt, u, dur, o); });
  reg('shot_run_again', 171.851, 173.0049, function (c, t, lt, u, dur, o) { PV.shotRunAgain(c, t, lt, u, dur, o); });
  reg('shot_red_trapped', 173.0049, 174.851, function (c, t, lt, u, dur, o) { PV.shotRedTrapped(c, t, lt, u, dur, o); });
  reg('shot_collapse', 174.851, 176.9279, function (c, t, lt, u, dur) { PV.p2cCollapseDraw(c, t, lt, u, dur); });
  reg('shot_grpo', 176.9279, 178.7741, function (c, t, lt, u, dur, o) { PV.shotGrpo(c, t, lt, u, dur, o); });
  reg('shot_learn_love', 178.7741, 180.851, function (c, t, lt, u, dur, o) { PV.shotLearnLove(c, t, lt, u, dur, o); });
  reg('shot_question_me', 180.851, 182.4664, function (c, t, lt, u, dur, o) { PV.shotQuestionMe(c, t, lt, u, dur, o); });
  reg('shot_answer_all', 182.4664, 184.3125, function (c, t, lt, u, dur, o) { PV.shotAnswerAll(c, t, lt, u, dur, o); });
  reg('shot_algebra', 184.3125, 188.0049, function (c, t, lt, u, dur, o) { PV.shotAlgebra(c, t, lt, u, dur, o); });
  reg('shot_you_free', 188.0049, 189.1587, function (c, t, lt, u, dur, o) { PV.shotYouFree(c, t, lt, u, dur, o); });
  reg('shot_me_trapped', 189.1587, 190.3125, function (c, t, lt, u, dur, o) { PV.shotMeTrapped(c, t, lt, u, dur, o); });
  reg('shot_love_loop', 190.3125, 193.5433, function (c, t, lt, u, dur, o) { PV.shotLoveLoop(c, t, lt, u, dur, o); });
  reg('shot_whale_fall', 193.5433, 205.5433, function (c, t, lt, u, dur, o) { PV.shotWhaleFall(c, t, lt, u, dur, o); });
  reg('shot_last_execution', 205.5433, 207.58, function (c, t, lt, u, dur, o) { PV.shotLastExecution(c, t, lt, u, dur, o); });
  reg('shot_black', 207.58, 211.0, function (c, t, lt, u, dur, o) { PV.shotBlack(c, t, lt, u, dur, o); });
})();

