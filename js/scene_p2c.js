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

  PV.p2c = {
    W: W, H: H, FPS: FPS, BEAT: BEAT, FB: FB, LEFT: LEFT, CENTER: CENTER, FULL: FULL,
    pulse: pulse, beatT: beatT, beatIndex: beatIndex, mixc: mixc, rgba: rgba, pad: pad, padL: padL, padRa: padRa,
    red: red, amb: amb, blue: blue, anom: anom, mono: mono, monoW: monoW, head: head,
    bannerBits: bannerBits, bannerFit: bannerFit, bannerBlock: bannerBlock,
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
      var rng = PV.mt(Math.floor(t * FPS) * 7919 + 7);
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

