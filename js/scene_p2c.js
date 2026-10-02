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
  var BANNER_K = 1.121;   /* 标定：见 pvport 比对（参考帧 1065x220，未标定时 950x220） */
  function bannerBits(text, rows, aspect) { return PV.bannerBits(text, rows, aspect * BANNER_K); }
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
    bannerBits: bannerBits, bannerFit: bannerFit, bannerBlock: bannerBlock, MONO_ADV_W: MONO_ADV,
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
      head(ctx, 'EPERM', 430, 120, anom(1.0), 110, 'left', true);
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
      head(ctx, wx, xx + 10, 306, T.BG, 22, 'left', true);
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
  /* 生成半调贴图（一次），返回 {cv, alpha} */
  PV.p2cPortraitBuild = function (name, crop, maxW, maxH, px, tint) {
    var key = name + '|' + crop + '|' + maxW + '|' + maxH + '|' + px + '|' + tint.join(',');
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
        c2.fillStyle = T.css(T.mix(tint, v), 1);
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
        PV.shotExecHit(ctx, t, lt, u, dur, { k: k });
      });
    })(k);
  }
  PV.p2cReg('shot_count', 158.6972, 161.4664, function (ctx, t, lt, u, dur) { PV.shotCount(ctx, t, lt, u, dur); });
  PV.p2cReg('shot_exec_hit_12', 161.4664, 162.1587, function (ctx, t, lt, u, dur) {
    PV.shotExecHit(ctx, t, lt, u, dur, { k: 12 });
  });
  /* cut 78 的出场镜头（#13）在 v2 里按名字取用，这里给它一个标准名 */
  PV.p2cReg('shot_exec_hit', 161.4664, 162.1587, function (ctx, t, lt, u, dur) {
    PV.shotExecHit(ctx, t, lt, u, dur, { k: 12 });
  });
  PV.p2cHitTimes = T0;
})();




