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
  function amb(lv) { return T.mix(T.UI, lv); }
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
      var rng = PV.mt(Math.floor(t * P.FPS) * 7919 + 7);
      var x0 = 594 - bits.width * cw / 2, y0 = 100 + Math.floor((26 - bits.height) * 16 / 2), r, q;
      for (r = 0; r < bits.height; r++) {
        var s = '';
        for (q = 0; q < bits.width; q++)
          s += bits.get(q, r) ? 'EXECUTE'.charAt((q + r + k) % 7) : rng.choice(' .:');
        mono(ctx, s, x0, y0 + r * 16, red(1.0), 15, 'left', true);
      }
    } else if (lay === 3) {
      PV.p2cPortrait(ctx, 'angry', 'face', 520, 520, 5, 24, 70, T.ERR);
      var ph = PV.p2cPortraitSize('angry', 'face', 520, 520, 5);
      var y = 70 + Math.floor(ph[1] * 0.55);
      T.fill(ctx, 24, y, 24 + ph[0], y + 40, red(1.0), 1);
      mono(ctx, 'EXECUTION  EXECUTION  EXECUTION', 60, y + 6, T.BG, 22, 'left', true);
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
      mono(ctx, T.decode('target is outside the sandbox.', lt, PV.rngFor(t, 7919), 50, 0.12, 0), 430, 330, amb(0.8), 20);
    }
    PV.p2cFlash = (P.pulse(t) > 0.55 && (lay === 0 || lay === 2)) ? t : null;
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
  PV.p2cFlash = null;
  PV.overlay = function (ctx, t) {
    if (prev) { try { prev(ctx, t); } catch (e) {} }
    if (PV.p2cFlash !== null && PV.p2cFlash !== undefined && Math.abs(PV.p2cFlash - t) < 1e-6) {
      ctx.save();
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = 'rgb(255,86,66)';
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
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

  /* 镜头 64-77 的 layout（full/direction.py EXEC_HIT + 计数强制 fullbleed） */
  PV.p2cHitMode = function (k) {
    var lay = (k === 11) ? 4 : (k >= 12 ? 0 : k % 4);
    return (lay === 0 || lay === 2 || lay === 3) ? 'fullbleed' : 'split';
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
  PV.stateAt = function (t) {
    var st = origState ? origState(t) : { retract: 0, shell: null };
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
      al[i] = d[i * 4 + 3] > 110 ? 255 : 0;
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

  /* ---- 79 shot_execute_all：12 个样本 ---- */
  var TILE_W = 186, TILE_H = 172;
  var EXPRS = ["cheerful", "starry", "shy", "serious", "confused", "frightened", "angry", "exasperated"];
  function tileExpr(i) { return i === 0 ? 'starry' : EXPRS[(i * 3) % EXPRS.length]; }
  function tileOrigin(i) { return [414 + (i % 4) * TILE_W, 70 + Math.floor(i / 4) * TILE_H]; }
  var TILE_CACHE = {};
  function tileArt(i) {
    if (TILE_CACHE[i]) return TILE_CACHE[i];
    var p = PV.p2cPortraitBuild(tileExpr(i), 'upper', TILE_W - 20, TILE_H - 30, 3, 'blue');
    if (p) TILE_CACHE[i] = p;
    return p || null;
  }
  function drawTile(ctx, i, crossed, x, y) {
    var org = tileOrigin(i);
    if (x === undefined) { x = org[0]; y = org[1]; }
    var art = tileArt(i);
    if (art) {
      ctx.save(); ctx.imageSmoothingEnabled = false;
      ctx.drawImage(art.cv, Math.round(x + (TILE_W - 8 - art.w) / 2), Math.round(y + TILE_H - 10 - art.h));
      ctx.restore();
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
      drawTile(ctx, i, i < done);
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

