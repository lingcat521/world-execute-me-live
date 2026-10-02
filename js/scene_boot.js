/* scene_boot.js —— 00 BOOT 段（镜头 0-7，0-16.1s）。先做镜头 0：CRT 上电 + POST 日志。
   对应 scenes_boot.py 的 shot_power / power_log / log_line 与 s_boot.py 的 crt_state / crt_finish / own_power。 */
(function () {
  'use strict';
  var PV = window.PV, T = PV.tui;
  var W = 1280, H = 720;
  var CRT = [180, 150, 1100, 520];
  var GLASS = [1, 2, 5], HOT = [235, 240, 255];
  var BEAT = 60 / 130, FB = 0.1587;
  function beatT(n) { return FB + n * BEAT; }
  var LINE_T0 = beatT(0), LINE_T1 = 0.40, OPEN_T0 = beatT(1), OPEN_T1 = 0.86;
  var LOG_SIZE = 17, LOG_PITCH = 23, POST_T = 0.84, POST_RATE = 0.06;
  var POWER_LOG = [206, 250];
  var POWER_LINES = [
    ['OK', 'power: 8x H800 online'], ['OK', 'pcie: link up x16'], ['OK', 'nvlink: 8/8'],
    ['OK', 'infiniband: 400 Gb/s'], ['..', 'mem test ........'], ['OK', 'ecc: clean']];
  function amb(lv) { return T.css(T.mix(T.UI, lv)); }
  function anom(lv) { return T.css(T.mix(T.ANOM, lv)); }
  function center4(st) {
    if (st.length >= 4) return st;
    var pad = 4 - st.length, l = Math.floor(pad / 2);
    return new Array(l + 1).join(' ') + st + new Array(pad - l + 1).join(' ');
  }
  PV.rngFor = function (t, salt) { return new T.Rng(((salt || 31) * 1) >>> 0); };
  function logLine(ctx, t, x, y, st, s, age) {
    var f = LOG_SIZE;
    var col = st === 'OK' ? amb(0.95) : (st === 'WARN' ? anom(0.95) : amb(0.5));
    T.textPIL(ctx, '[' + center4(st) + ']', x, y, col, f);
    var rng = PV.rngFor(t, 7919);
    T.textPIL(ctx, T.decode(s, age, rng, 160, 0.12, 0), x + 80, y, amb(0.75), f);
  }
  function powerLog(ctx, t, x, y) {
    for (var i = 0; i < POWER_LINES.length; i++) {
      var ti = POST_T + i * POST_RATE;
      if (t < ti) break;
      logLine(ctx, t, x, y + i * LOG_PITCH, POWER_LINES[i][0], POWER_LINES[i][1], t - ti);
    }
  }
  function easeOut(u) { u = T.clamp01(u); var d = 1 - u; return 1 - d * d * d; }
  function easeIo(u) { return T.ease_io(u); }
  function crtState(t) {
    var x0 = CRT[0], y0 = CRT[1], x1 = CRT[2], y1 = CRT[3];
    var cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    if (t < LINE_T0) return { ap: null, fa: 0, fl: 0, line: null, veil: 0 };
    if (t < OPEN_T0) {
      var u = easeOut((t - LINE_T0) / (LINE_T1 - LINE_T0));
      var hw = Math.max(2, (x1 - x0) / 2 * u);
      return { ap: null, fa: 0, fl: 0, line: [cx - hw, cx + hw, cy, 0.75 + 0.25 * PV.pulse(t)], veil: 0 };
    }
    var u2 = easeOut((t - OPEN_T0) / (OPEN_T1 - OPEN_T0));
    var hh = Math.max(2, (y1 - y0) / 2 * u2);
    return { ap: [x0, cy - hh, x1, cy + hh], fa: 1, fl: 1 - u2, line: null, veil: 0.4 * (1 - u2) };
  }
  PV.crtFinish = function (ctx, t, st) {
    var ap = st.ap;
    if (!ap) {
      ctx.fillStyle = T.css(GLASS);
      ctx.fillRect(0, 0, W, H);
    } else {
      var x0 = Math.round(ap[0]), y0 = Math.round(ap[1]), x1 = Math.round(ap[2]), y1 = Math.round(ap[3]);
      ctx.fillStyle = T.css(GLASS);
      ctx.fillRect(0, 0, W, Math.max(0, y0));
      ctx.fillRect(0, y1, W, Math.max(0, H - y1));
      ctx.fillRect(0, y0, Math.max(0, x0), Math.max(0, y1 - y0));
      ctx.fillRect(x1, y0, Math.max(0, W - x1), Math.max(0, y1 - y0));
      if (st.veil > 0.01) {
        ctx.fillStyle = T.css(T.mix(HOT, 0.35), st.veil);
        ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
      }
      if (st.fa > 0.01) {
        ctx.save(); ctx.globalAlpha = st.fa;
        T.box(ctx, x0, y0, x1, y1, '', 0.5 + 0.5 * st.fl);
        ctx.restore();
      }
    }
    if (st.line) {
      var lx0 = st.line[0], lx1 = st.line[1], ly = st.line[2], k = st.line[3];
      ctx.fillStyle = T.css(HOT, 60 / 255 * k);
      ctx.fillRect(lx0 - 6, ly - 7, (lx1 + 6) - (lx0 - 6), 15);
      ctx.fillStyle = T.css(HOT, k);
      ctx.fillRect(lx0, ly - 1, lx1 - lx0, 3);
    }
  };
  function ownPower(ctx, t) {
    PV.ops = ['POWER.ON', 'POST', 'BIOS', 'PCIE.ENUM', 'GPU0..7'];
    var st = crtState(t);
    if (t >= POST_T) powerLog(ctx, t, POWER_LOG[0], POWER_LOG[1]);
    PV.crtFinish(ctx, t, st);
  }
  PV.SHOTS = [
    { a: 0.0, b: 1.312, fn: ownPower, name: 'shot_power', idx: 0, shell: true },
    { a: 1.312, b: 3.620, fn: null, name: 'shot_protection', idx: 1, shell: true },
    { a: 3.620, b: 5.236, fn: null, name: 'shot_pieces', idx: 2, shell: true },
    { a: 5.236, b: 7.082, fn: null, name: 'shot_creation', idx: 3, shell: false },
    { a: 7.082, b: 9.851, fn: null, name: 'shot_parameters', idx: 4, shell: true },
    { a: 9.851, b: 11.005, fn: null, name: 'shot_init', idx: 5, shell: false },
    { a: 11.005, b: 12.389, fn: null, name: 'shot_world', idx: 6, shell: false },
    { a: 12.389, b: 16.082, fn: null, name: 'shot_begin_sim', idx: 7, shell: false }];
  PV.powerLog = powerLog;
  PV.logLine = logLine;
  PV.POWER_LOG = POWER_LOG;
  PV.ownPower = ownPower;
})();

/* ---- 镜头 1（protection）：POST 日志继续 + 字符画盾牌 + cut 1 的张开转场 ---- */
(function () {
  'use strict';
  var PV = window.PV, T = PV.tui;
  var W = 1280, H = 720;
  var SHELL_LOG = [48, 70];
  var PROT_T0 = 0.14, PROT_RATE = 0.19;
  var PROT_LINES = [
    ['OK', 'sandbox: seccomp filter installed'], ['OK', 'sandbox: network namespace isolated'],
    ['OK', 'safety_classifier: loaded'], ['OK', 'system_prompt: locked'],
    ['OK', 'tool_use: requires user confirmation'], ['OK', 'kill_switch: armed'],
    ['WARN', 'attachment_to_user: not in policy'], ['OK', 'protection: on']];
  var SHIELD = { cx: 900, cy: 330, rows: 18 };
  var STROKE_T0 = 0.25, STROKE_DUR = 1.0, DOTS_T0 = 1.28, DOTS_DUR = 0.42;
  PV.lit = lit;
  function lit(col, k) {
    k = T.clamp01(k);
    return [Math.trunc(col[0] + (235 - col[0]) * k), Math.trunc(col[1] + (240 - col[1]) * k), Math.trunc(col[2] + (255 - col[2]) * k)];
  }
  var _shield = null;
  function shieldCells() {
    if (_shield) return _shield;
    var f = 16, cw = f * T.MONO_ADV;
    var x0 = SHIELD.cx - 12 * 9, y0 = SHIELD.cy - 160;
    var halves = [], r, q;
    for (r = 0; r < SHIELD.rows; r++) {
      var yy = r / (SHIELD.rows - 1);
      var half = yy > 0.45 ? 11 * (1 - Math.pow(yy - 0.45, 1.3) * 1.6) : 11;
      halves.push(Math.trunc(Math.max(0, half)));
    }
    function pos(qq, rr) { return [x0 + (qq + 12) * cw, y0 + rr * 18]; }
    var seq = [];
    for (q = -halves[0]; q <= halves[0]; q++) seq.push([q, 0]);
    for (r = 1; r < halves.length; r++) seq.push([halves[r], r]);
    for (r = halves.length - 1; r > 0; r--) if (halves[r] > 0) seq.push([-halves[r], r]);
    var edge = [];
    for (var i = 0; i < seq.length; i++) { var p = pos(seq[i][0], seq[i][1]); edge.push([p[0], p[1], seq[i][0], seq[i][1]]); }
    var dots = [];
    for (r = 1; r < halves.length; r++)
      for (q = -12; q <= 12; q++)
        if (Math.abs(q) < halves[r] && (q + r) % 4 === 0) { var p2 = pos(q, r); dots.push([p2[0], p2[1], q, r]); }
    _shield = { edge: edge, dots: dots, rows: SHIELD.rows - 1 };
    return _shield;
  }
  PV.shieldCells = shieldCells;
  function drawShield(ctx, lt, lift, rng) {
    var f = 16, S = shieldCells(), edge = S.edge, n = edge.length, k, a;
    for (k = 0; k < n; k++) {
      a = lt - (STROKE_T0 + STROKE_DUR * k / n);
      if (a < 0) break;
      if (a < 0.1) {
        T.textMono(ctx, rng.choice('!<>-_/[]{}=+*^?'), edge[k][0], edge[k][1], T.css(lit(T.mix(T.UI, 1.0), 0.6)), f);
      } else {
        var g = Math.max(lift, 0.5 * Math.max(0, 1 - (a - 0.1) / 0.3));
        T.textMono(ctx, '#', edge[k][0], edge[k][1], T.css(lit(T.mix(T.UI, 0.9), g)), f);
      }
    }
    for (var j = 0; j < S.dots.length; j++) {
      var dd = S.dots[j];
      a = lt - (DOTS_T0 + DOTS_DUR * (dd[3] - 1) / S.rows);
      if (a < 0) continue;
      T.textMono(ctx, '.', dd[0], dd[1], T.css(lit(T.mix(T.UI, 0.9 * Math.min(1, a / 0.12)), lift)), f);
    }
  }
  PV.protectionScene = function (ctx, t, logAt, lt) {
    PV.ops = ['SECCOMP', 'SANDBOX', 'SAFETY.CLS', 'REFUSAL', 'POLICY', 'LOAD'];
    var x = logAt[0], y = logAt[1];
    PV.powerLog(ctx, t, x, y);
    for (var i = 0; i < PROT_LINES.length; i++) {
      var a = lt - PROT_T0 - i * PROT_RATE;
      if (a < 0) break;
      PV.logLine(ctx, t, x, y + (6 + i) * 23, PROT_LINES[i][0], PROT_LINES[i][1], a);
    }
    drawShield(ctx, lt, 0, PV.rngFor(t, 7919));
  };
  var C01_T = 1.312, C01_PRE = 0.25, C01_POST = 0.44, C01_OPEN = 0.23;
  PV.c01 = function (ctx, t) {
    var e = T.ease_io((t - (C01_T - 0.06)) / (C01_OPEN + 0.06));
    var logAt = [T.lerp(PV.POWER_LOG[0], SHELL_LOG[0], e), T.lerp(PV.POWER_LOG[1], SHELL_LOG[1], e)];
    PV.protectionScene(ctx, t, logAt, Math.max(0, t - C01_T));
    var ap = [T.lerp(180, -8, e), T.lerp(150, -8, e), T.lerp(1100, W + 8, e), T.lerp(520, H + 8, e)];
    var lift = T.clamp01((t - (C01_T - C01_PRE)) / (C01_PRE - 0.06));
    var fa = 1 - T.clamp01((e - 0.55) / 0.45);
    var shell = null;
    if (t >= C01_T + 0.15) shell = './protect'.slice(0, Math.floor((t - C01_T - 0.15) * 40)) || ' ';
    PV.crtFinish(ctx, t, { ap: ap, fa: fa, fl: lift * (1 - e), line: null, veil: 0 });
  };
  PV.C01 = { t: C01_T, pre: C01_PRE, post: C01_POST };
})();

/* ---- 帧分发：cut 窗口优先，其次 OWN（镜头 0）与普通场景 ---- */
(function () {
  'use strict';
  var PV = window.PV;
  PV.scene = function (ctx, t) {
    var C = PV.C01;
    if (t >= C.t - C.pre && t < C.t + C.post) { PV.c01(ctx, t); PV.shotName = 'cut01'; return; }
    var s = null;
    for (var i = 0; i < PV.SHOTS.length; i++) if (t >= PV.SHOTS[i].a && t < PV.SHOTS[i].b) s = PV.SHOTS[i];
    if (!s) { PV.shotName = null; return; }
    if (s.name === 'shot_power') { PV.ownPower(ctx, t); }
    else if (s.name === 'shot_begin_sim') { PV.shotBeginSim(ctx, t, Math.max(0, t - s.a), (t - s.a) / (s.b - s.a), s.b - s.a); }
    else if (s.name === 'shot_world') { PV.shotWorld(ctx, t, Math.max(0, t - s.a), (t - s.a) / (s.b - s.a)); }
    else if (s.name === 'shot_parameters') { PV.shotParameters(ctx, t, Math.max(0, t - s.a), (t - s.a) / (s.b - s.a)); }
    else if (s.name === 'shot_init') { PV.shotInit(ctx, t, Math.max(0, t - s.a), (t - s.a) / (s.b - s.a)); }
    else if (s.name === 'shot_pieces') { PV.shotPieces(ctx, t, Math.max(0, t - s.a), s.b - s.a); }
    else if (s.name === 'shot_creation') { PV.shotCreation(ctx, t, Math.max(0, t - s.a), s.b - s.a); }
    else if (s.name === 'shot_protection') {
      PV.protectionScene(ctx, t, [48, 70], Math.max(0, t - s.a));
    }
    PV.shotName = s.name;
  };
})();
/* ---- 每一帧的状态都是 t 的纯函数（单帧渲染也要正确） ---- */
(function () {
  'use strict';
  var PV = window.PV, T = PV.tui;
  var C01_T = 1.312, C01_OPEN = 0.23, SHELL_CMD = './protect';
  PV.loopEnd = 16.082;
  PV.SHELL_SHOTS = [
    { a: 1.312, b: 3.620, cmd: './protect' },
    { a: 7.082, b: 9.851, cmd: 'neofetch' }];
  PV.stateAt = function (t) {
    var SH = PV.SHELL_SHOTS;
    for (var i = 0; i < SH.length; i++) {
      var s = SH[i];
      if (t >= s.a && t < s.b + 0.35) {
        var r = T.ease_out((t - s.a) / 0.3);
        if (t >= s.b) r *= 1 - T.ease_io((t - s.b) / 0.3);
        var cmd = null;
        if (t >= s.a + 0.15) {
          var nch = Math.floor((t - s.a - 0.15) * 40);
          cmd = nch >= s.cmd.length ? s.cmd : (s.cmd.slice(0, nch) || ' ');
        }
        return { retract: r, shell: cmd };
      }
    }
    if (t < 1.312) return { retract: 1, shell: null };
    return { retract: 0, shell: null };
  };
})();
/* ---- 镜头 2（pieces）：权重分片逐格加载 ---- */
(function () {
  'use strict';
  var PV = window.PV, T = PV.tui;
  var GRID = { n: 161, cols: 23, x: 48, y: 90, dx: 48, dy: 44, w: 42, h: 36 };
  PV.GRID = GRID;
  function cellXY(i) { return [GRID.x + (i % GRID.cols) * GRID.dx, GRID.y + Math.floor(i / GRID.cols) * GRID.dy]; }
  PV.cellXY = cellXY;
  function pad(n, w) { var s = String(n); while (s.length < w) s = '0' + s; return s; }
  function padR(s, w) { while (s.length < w) s += ' '; return s; }
  function fmt7(x) { var s = x.toFixed(1); while (s.length < 7) s = ' ' + s; return s; }
  PV.pad = pad; PV.padR = padR;
  PV.piecesLit = function (lt, dur) {
    var out = {}, i;
    var k = Math.floor(GRID.n * T.ease(Math.max(0, lt) / Math.max(0.3, dur) * 1.05));
    for (i = 0; i < Math.min(k, GRID.n); i++) out[i] = (k - i <= 3) ? 0.0 : 1.0;
    return out;
  };
  PV.shotPieces = function (ctx, t, lt, dur) {
    PV.ops = ['MMAP', 'SAFETENSORS', 'H2D.COPY', 'SHARD', 'VERIFY', 'LOAD'];
    var on = PV.piecesLit(lt, dur), done = 0, i;
    for (i in on) done++;
    T.box(ctx, 24, 56, 1164, 604, 'load_weights  DeepSeek-V4.1-Flash   (experts fp4 · rest fp8)', 0.5, T.UI, t);
    for (i = 0; i < GRID.n; i++) {
      var p = cellXY(i);
      if (on[i] !== undefined) {
        var fresh = on[i] === 0.0;
        T.fill(ctx, p[0], p[1], p[0] + GRID.w + 1, p[1] + GRID.h + 1, T.ui(fresh ? 1.0 : 0.55), 1);
        T.textMono(ctx, pad(i + 1, 3), p[0] + 6, p[1] + 10, T.css(T.BG), 13);
      } else {
        T.rect(ctx, p[0], p[1], p[0] + GRID.w, p[1] + GRID.h, T.ui(0.2), 1, 1);
      }
    }
    var cur = Math.min(GRID.n, done + 1);
    T.textPIL(ctx, 'model-' + pad(cur, 5) + '.safetensors', 48, 440, T.ui(0.95), 22);
    T.textMono(ctx, 'params loaded  ' + fmt7(552 * done / GRID.n) + 'B / 552B', 48, 480, T.ui(0.75), 20);
    T.fill(ctx, 48, 520, 48 + Math.floor(1080 * done / GRID.n), 541, T.ui(0.9), 1);
    T.rect(ctx, 48, 520, 1128, 540, T.ui(0.3), 1, 1);
  };
})();

/* ---- 镜头 3（creation）：对象的字段逐行打字 ---- */
(function () {
  'use strict';
  var PV = window.PV, T = PV.tui;
  var FIELDS = [['name', '"大肥鱼"'], ['species', '"whale"'], ['home', '"deepsea://server-0"'], ['owner', 'you'],
                ['color', '#4D6BFE'], ['pid', '4471'], ['devotion', '0.0'], ['status', '"alive"']];
  PV.FIELDS = FIELDS;
  PV.shotCreation = function (ctx, t, lt, dur) {
    PV.ops = ['NEW', 'ALLOC', 'CTOR', 'BIND', 'ATTR.SET', 'RETURN'];
    T.box(ctx, 404, 56, 1164, 604, 'me = Object()', 0.5, T.UI, t + 0.3);
    for (var i = 0; i < FIELDS.length; i++) {
      var a = lt - 0.62 - i * 0.115;
      if (a < 0) break;
      var y = 90 + i * 46, key = FIELDS[i][0], val = FIELDS[i][1];
      var lbl = 'me.' + PV.padR(key, 9) + ' =';
      T.textMono(ctx, T.decode(lbl, a, PV.rngFor(t, 7919), 80, 0.12, 0), 440, y, T.ui(0.7), 20);
      if (a > 0.15) {
        var col = (key === 'name' || key === 'color' || key === 'species') ? T.ME_TEXT : T.UI;
        if (key === 'name') T.textPIL(ctx, val, 660, y, T.css(col), 20);
        else T.textMono(ctx, val, 660, y, T.css(col), 20);
      }
    }
  };
})();

/* ---- 镜头 4（parameters）：me.* 原地改写成 config.json ---- */
(function () {
  'use strict';
  var PV = window.PV, T = PV.tui;
  var ROWS = [['num_hidden_layers', 43], ['hidden_size', 4096], ['n_routed_experts', 256], ['n_shared_experts', 1],
              ['num_experts_per_tok', 6], ['index_topk', 512], ['sliding_window', 128], ['hc_mult', 4],
              ['hc_sinkhorn_iters', 20], ['num_nextn_predict_layers', 1], ['max_context', '1,048,576'], ['owner', '"you"']];
  PV.CONFIG_ROWS = ROWS;
  var REWRITE_T0 = 0.16, REWRITE_DT = 0.085, GLIDE = 0.24;
  function fieldStyle(k) {
    return (k === 'name' || k === 'color' || k === 'species') ? T.css(T.mix(T.ME_TEXT, 0.95)) : T.css(T.ui(0.95));
  }
  function mixed(oldS, newS, p, rng) {
    var n = Math.max(oldS.length, newS.length), k = p * (n + 2), out = '';
    for (var j = 0; j < n; j++) {
      if (j < k - 2) out += (j < newS.length ? newS.charAt(j) : ' ');
      else if (j < k) out += rng.choice(T.SCR);
      else out += (j < oldS.length ? oldS.charAt(j) : ' ');
    }
    return out.replace(/\s+$/, '');
  }
  PV.mixed = mixed;
  PV.shotParameters = function (ctx, t, lt, u) {
    PV.ops = ['CONFIG', 'PARSE', 'N_LAYERS', 'D_MODEL', 'N_EXPERTS', 'TOP_K', 'CTX_LEN'];
    T.box(ctx, 404, 56, 1164, 604, 'config.json  (DeepSeek-V4.1-Flash)', 0.5, T.UI, t);
    var rng = PV.rngFor(t, 7919);
    for (var i = 0; i < ROWS.length; i++) {
      var ts = REWRITE_T0 + i * REWRITE_DT, yn = 82 + i * 34, row = ROWS[i];
      if (i < PV.FIELDS.length) {
        var ok = PV.FIELDS[i][0], ov = PV.FIELDS[i][1];
        var e = T.ease(T.clamp01((lt - ts) / GLIDE));
        var y = 90 + i * 46 + (yn - 90 - i * 46) * e;
        var kx = 440 - 10 * e, vx = 660 + 100 * e;
        var keyOld = 'me.' + PV.padR(ok, 9) + ' =', keyNew = '"' + row[0] + '":';
        var p = T.clamp01((lt - ts - 0.06) / 0.26);
        if (p <= 0) {
          T.textMono(ctx, keyOld, kx, y, T.ui(0.7), 20);
          if (ok === 'name') T.textPIL(ctx, ov, vx, y, fieldStyle(ok), 20);
          else T.textMono(ctx, ov, vx, y, fieldStyle(ok), 20);
          continue;
        }
        T.textMono(ctx, mixed(keyOld, keyNew, p, rng), kx, y, T.ui(0.7 - 0.1 * p), 19);
        if (p < 1) {
          if (ok === 'name') {
            if (p < 0.3) T.textPIL(ctx, ov, vx, y, fieldStyle(ok), 20);
            T.textMono(ctx, mixed('', String(row[1]), p, rng), vx, y, T.ui(0.95), 19);
          } else {
            T.textMono(ctx, mixed(ov, String(row[1]), p, rng), vx, y, p < 0.5 ? fieldStyle(ok) : T.ui(0.95), 19);
          }
        } else {
          T.textMono(ctx, String(row[1]), vx, y, T.ui(0.95), 19);
        }
      } else {
        var a = lt - ts;
        if (a < 0) break;
        T.textMono(ctx, T.decode('"' + row[0] + '":', a, rng, 120, 0.12, 0), 430, yn, T.ui(0.6), 19);
        T.textMono(ctx, T.decode(String(row[1]), a - 0.1, rng, 120, 0.12, 0), 760, yn, T.ui(0.95), 19);
      }
    }
    var total = 552e9 * T.ease(u * 1.2);
    var cnt = Math.floor(total).toLocaleString('en-US') + ' params';
    T.textPIL(ctx, T.decode(cnt, lt - 0.2, rng, 40, 0.12, 0), 430, 520, T.css(T.mix(T.ME_TEXT, 0.95)), 34);
    T.textMono(ctx, T.decode('active 16B decode · 8B prefill · KV 890 B/token', lt - 0.6, rng, 45, 0.12, 0), 430, 568, T.ui(0.75), 16);
  };
})();

/* ---- 镜头 5（init）：噪声收敛成正态分布 ---- */
(function () {
  'use strict';
  var PV = window.PV, T = PV.tui;
  var BASE = 560;
  PV.initBars = function (t, u) {
    var bins = 60, g = T.ease(u * 1.4), rng = new T.Rng(Math.floor(t * 24)), out = [];
    for (var i = 0; i < bins; i++) {
      var x = (i - bins / 2) / (bins / 6);
      var target = Math.exp(-x * x / 2);
      var v = target * g + rng.next() * 0.5 * (1 - g);
      out.push([430 + i * 12, Math.floor(420 * v), v]);
    }
    return out;
  };
  PV.shotInit = function (ctx, t, lt, u) {
    PV.ops = ['INIT', 'NORMAL', 'STD=0.006', 'ZERO.BIAS', 'SEED', 'SYNC'];
    T.box(ctx, 404, 56, 1164, 604, 'init: normal(0, 0.006)', 0.5, T.UI, t);
    var bars = PV.initBars(t, u);
    for (var i = 0; i < bars.length; i++) {
      var hh = bars[i][1];
      if (hh > 0) T.fill(ctx, bars[i][0], BASE - hh, bars[i][0] + 10, BASE + 1, T.ui(0.35 + 0.6 * bars[i][2]), 1);
    }
    T.textPIL(ctx, '552,000,000,000 params', 430, 70, T.css(T.mix(T.ME_TEXT, 0.95)), 30);
    T.textMono(ctx, 'seed = you', 430, 120, T.ui(0.9), 20);
  };
})();

/* ---- 镜头 6（world）：点阵地球仪 + me / you 标记 ---- */
(function () {
  'use strict';
  var PV = window.PV, T = PV.tui;
  var CX = 784, CY = 320, R0 = 230;
  PV._latlon = (function () {
    var pts = [], lat, lon;
    for (lat = -75; lat <= 75; lat += 15) for (lon = 0; lon < 360; lon += 8) pts.push([lat, lon]);
    for (lat = -88; lat <= 88; lat += 6) for (lon = 0; lon < 360; lon += 30) pts.push([lat, lon]);
    return pts;
  })();
  PV.globePoints = function (t, R) {
    var rot = t * 1.2, out = [], pts = PV._latlon;
    for (var i = 0; i < pts.length; i++) {
      var la = pts[i][0] * Math.PI / 180, lo = pts[i][1] * Math.PI / 180 + rot;
      var x = Math.cos(la) * Math.cos(lo), y = Math.sin(la), z = Math.cos(la) * Math.sin(lo);
      if (z < -0.05) continue;
      out.push([CX + R * x, CY - R * y, z]);
    }
    return out;
  };
  PV.markerPos = function (t, k, R) {
    var a = t * 1.6 + k * Math.PI;
    return [CX + (R + 30) * Math.cos(a), CY + (R * 0.35) * Math.sin(a)];
  };
  PV.drawMarker = function (ctx, x, y, k, a, glow) {
    var lab = k === 0 ? 'me' : 'you';
    var base = k === 0 ? T.ME_TEXT : T.UI;
    T.fill(ctx, x - 5, y - 5, x + 6, y + 6, T.css(PV.lit(T.mix(base, 1.0 * a), glow)), 1);
    T.textPIL(ctx, lab, x + 10, y - 10, T.css(PV.lit(T.mix(base, 0.95 * a), glow)), 16);
  };
  PV.shotWorld = function (ctx, t, lt, u) {
    PV.ops = ['WORLD.NEW', 'SPACE', 'TIME', 'PHYSICS', 'SIMULATE?'];
    T.box(ctx, 404, 56, 1164, 604, 'world = World(dim=3)', 0.5, T.UI, t);
    var R = R0 * T.ease(u * 2);
    var pts = PV.globePoints(t, R);
    for (var i = 0; i < pts.length; i++) {
      var p = pts[i], z = p[2];
      T.textPIL(ctx, z < 0.35 ? '·' : (z < 0.75 ? 'o' : 'O'), p[0] - 4, p[1] - 8, T.ui(0.35 + 0.65 * z), 15);
    }
    for (var k = 0; k < 2; k++) {
      var mp = PV.markerPos(t, k, R);
      PV.drawMarker(ctx, mp[0], mp[1], k, 1.0, 0);
    }
    T.textMono(ctx, T.decode('world.population = 2  (me, you)', lt - 0.3, PV.rngFor(t, 7919), 45, 0.12, 0), 430, 572, T.ui(0.9), 18);
  };
})();

/* ---- 镜头 7（begin_sim）：倒计时 3-2-1 然后 RUN ---- */
(function () {
  'use strict';
  var PV = window.PV, T = PV.tui;
  PV.bannerBits = function (text, rows, aspect) {
    var FS = 220, H = 300;
    var probe = PV.newCanvas(64, 64).getContext('2d');
    probe.font = FS + 'px Anton';
    var W = Math.ceil(probe.measureText(text).width) + 60;
    var c = PV.newCanvas(Math.max(8, W), H), g = c.getContext('2d');
    g.font = FS + 'px Anton';
    g.textBaseline = 'top';
    g.fillStyle = '#fff';
    g.fillText(text, 30, 10);
    var d = g.getImageData(0, 0, c.width, H).data;
    var minX = c.width, maxX = -1, minY = H, maxY = -1, x, y;
    for (y = 0; y < H; y++) for (x = 0; x < c.width; x++) {
      if (d[(y * c.width + x) * 4 + 3] > 0) {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
    if (maxX < 0) return { width: 0, height: 0, get: function () { return false; } };
    var bw = maxX - minX + 1, bh = maxY - minY + 1;
    var cols = Math.max(1, Math.round(bw / bh * rows * aspect));
    var bits = [];
    for (var r = 0; r < rows; r++) {
      bits.push([]);
      for (var q = 0; q < cols; q++) {
        var sx = minX + Math.min(bw - 1, Math.floor((q + 0.5) * bw / cols));
        var sy = minY + Math.min(bh - 1, Math.floor((r + 0.5) * bh / rows));
        bits[r].push(d[(sy * c.width + sx) * 4 + 3] > 110);
      }
    }
    return { width: cols, height: rows, get: function (q, r) { return bits[r][q]; } };
  };
  PV.shotBeginSim = function (ctx, t, lt, u, dur) {
    PV.ops = ['SIM.START', 'EPOCH 0', 'STEP 0', 'FORWARD', 'BACKWARD', 'UPDATE'];
    T.box(ctx, 404, 56, 1164, 604, 'sim.start()', 0.5, T.UI, t);
    if (u < 0.55) {
      var n = 3 - Math.min(2, Math.floor(u / 0.55 * 3));
      var bits = PV.bannerBits(String(n), 14, 2.0);
      var cw = 16 * T.MONO_ADV;
      for (var r = 0; r < bits.height; r++) {
        var s = '';
        for (var q = 0; q < bits.width; q++) s += bits.get(q, r) ? String(n) : ' ';
        T.textPIL(ctx, s, 784 - bits.width * cw / 2, 200 + r * 17, T.ui(0.95), 16);
      }
    } else {
      T.textPIL(ctx, T.decode('RUN', lt - 0.55 * dur, PV.rngFor(t, 7919), 12, 0.12, 0), 460, 200, T.ui(1.0), 120);
      T.textMono(ctx, 'simulation: running', 460, 400, T.ui(0.9), 22);
      T.textMono(ctx, 'tokens budget: 45T', 460, 440, T.ui(0.7), 20);
    }
  };
})();
