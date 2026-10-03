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
  function amb(lv) { return T.css(T.amb(lv)); }
  function anom(lv) { return T.css(T.mix(T.ANOM, lv)); }
  function center4(st) {
    if (st.length >= 4) return st;
    var pad = 4 - st.length, l = Math.floor(pad / 2);
    return new Array(l + 1).join(' ') + st + new Array(pad - l + 1).join(' ');
  }
  PV.rngFor = function (t, salt) { return PV.mt((salt || 31) >>> 0); };
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
  /* 镜头自带启动延迟（原始工程 continuity_full_v2 的 DELAY / SHOT_HOOKS 表）：
     shot_circumference = C15.LAND 0.4（新场景的时钟等圆落地）、shot_dimension = 0.4（她的向量先传完）、
     shot_dualpipe = C10.LAND 0.42（首格落地后调度才展开）。 */
  PV.SHOT_DELAY = { shot_circumference: 0.4, shot_dimension: 0.4, shot_dualpipe: 0.42 };
  /* 转场层复用同一套延迟：返回 [lt, u] */
  PV.shotTime = function (name, t) {
    var s = null;
    for (var i = 0; i < PV.SHOTS.length; i++) if (PV.SHOTS[i].name === name) s = PV.SHOTS[i];
    if (!s) return [0, 0];
    var d = (PV.SHOT_DELAY && PV.SHOT_DELAY[name]) || 0;
    var lt = Math.max(0, t - s.a - d), dur = s.b - s.a - d;
    return [lt, dur > 0 ? T.clamp01(lt / dur) : 0];
  };
  /* 供并行开发的独立文件注册镜头：PV.reg(name, a, b, fn)。
     这样后续各段镜头可以写在各自的 js/scene_*.js 里，不必改本文件。 */
  PV.reg = function (name, a, b, fn) {
    PV.SHOTS.push({ a: a, b: b, fn: fn, name: name, idx: PV.SHOTS.length });
    PV.SHOTS.sort(function (x, y) { return x.a - y.a; });
    return fn;
  };
  /* 供并行开发的独立文件注册镜头：PV.reg(name, a, b, fn)。
     这样后续各段镜头可以写在各自的 js/scene_*.js 里，不必改本文件。 */
  PV.reg = function (name, a, b, fn) {
    PV.SHOTS.push({ a: a, b: b, fn: fn, name: name, idx: PV.SHOTS.length });
    PV.SHOTS.sort(function (x, y) { return x.a - y.a; });
    return fn;
  };
  PV.SHOTS = [
    { a: 0.0, b: 1.312, fn: ownPower, name: 'shot_power', idx: 0, shell: true },
    { a: 1.312, b: 3.620, fn: null, name: 'shot_protection', idx: 1, shell: true },
    { a: 3.620, b: 5.236, fn: null, name: 'shot_pieces', idx: 2, shell: true },
    { a: 5.236, b: 7.082, fn: null, name: 'shot_creation', idx: 3, shell: false },
    { a: 7.082, b: 9.851, fn: null, name: 'shot_parameters', idx: 4, shell: true },
    { a: 9.851, b: 11.005, fn: null, name: 'shot_init', idx: 5, shell: false },
    { a: 11.005, b: 12.389, fn: null, name: 'shot_world', idx: 6, shell: false },
    { a: 12.389, b: 16.082, fn: null, name: 'shot_begin_sim', idx: 7, shell: false },
    { a: 16.082, b: 19.700, fn: null, name: 'shot_corpus', idx: 8, shell: false },
    { a: 19.700, b: 23.236, fn: null, name: 'shot_losscurve', idx: 9, shell: false },
    { a: 23.236, b: 26.466, fn: null, name: 'shot_dualpipe', idx: 10, shell: false },
    { a: 26.466, b: 29.236, fn: null, name: 'shot_whale', idx: 11, shell: false },
    { a: 29.236, b: 30.851, fn: null, name: 'shot_points', idx: 12, shell: false },
    { a: 30.851, b: 32.928, fn: null, name: 'shot_dimension', idx: 13, shell: false },
    { a: 32.928, b: 34.543, fn: null, name: 'shot_circle', idx: 14, shell: false },
    { a: 34.543, b: 36.851, fn: null, name: 'shot_circumference', idx: 15, shell: false },
    { a: 36.851, b: 38.236, fn: null, name: 'shot_sine', idx: 16, shell: false },
    { a: 38.236, b: 40.312, fn: null, name: 'shot_tangent', idx: 17, shell: false },
    { a: 40.312, b: 41.928, fn: null, name: 'shot_infinity', idx: 18, shell: false },
    { a: 41.928, b: 44.005, fn: null, name: 'shot_limit', idx: 19, shell: false },
    { a: 44.005, b: 47.236, fn: null, name: 'shot_current', idx: 20, shell: false },
    { a: 47.236, b: 49.082, fn: null, name: 'shot_blind', idx: 21, shell: false },
    { a: 49.082, b: 50.928, fn: null, name: 'shot_dizzy', idx: 22, shell: false },
    { a: 50.928, b: 54.159, fn: null, name: 'shot_travel', idx: 23, shell: false },
    { a: 54.159, b: 56.697, fn: null, name: 'shot_unite', idx: 24, shell: false },
    { a: 56.697, b: 58.543, fn: null, name: 'shot_deeply', idx: 25, shell: false }];
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
    if (PV.activeCut) { var cut = PV.activeCut(t); if (cut) { cut.fn(ctx, t, cut); PV.shotName = 'cut@' + cut.T; return; } }
    var C = PV.C01;
    if (t >= C.t - C.pre && t < C.t + C.post) { PV.c01(ctx, t); PV.shotName = 'cut01'; return; }
    var s = null;
    for (var i = 0; i < PV.SHOTS.length; i++) if (t >= PV.SHOTS[i].a && t < PV.SHOTS[i].b) s = PV.SHOTS[i];
    if (!s) { PV.shotName = null; return; }
    var _dl = (PV.SHOT_DELAY && PV.SHOT_DELAY[s.name]) || 0;
    /* 延迟期内 a'=t（lt=0,u=0）；过了延迟 a'=a+dl。两者合起来就是 min(t, a+dl)。 */
    /* 必须带上 fn！否则 PV.reg 注册的镜头一带延迟就直接不画（子代理踩过：138-141s 全空） */
    if (_dl > 0) s = { a: Math.min(t, s.a + _dl), b: s.b, name: s.name, idx: s.idx, fn: s.fn };
    if (s.name === 'shot_power') { PV.ownPower(ctx, t); }
    else if (s.name === 'shot_circle') { PV.shotCircle(ctx, t, Math.max(0, t - s.a), (t - s.a) / (s.b - s.a)); }
    else if (s.name === 'shot_circumference') { PV.shotCircumference(ctx, t, Math.max(0, t - s.a), (t - s.a) / (s.b - s.a)); }
    else if (s.name === 'shot_sine') { PV.shotSine(ctx, t, Math.max(0, t - s.a), (t - s.a) / (s.b - s.a)); }
    else if (s.name === 'shot_tangent') { PV.shotTangent(ctx, t, Math.max(0, t - s.a), (t - s.a) / (s.b - s.a), s.b - s.a); }
    else if (s.name === 'shot_infinity') { PV.shotInfinity(ctx, t, Math.max(0, t - s.a), (t - s.a) / (s.b - s.a)); }
    else if (s.name === 'shot_current') { PV.shotCurrent(ctx, t, Math.max(0, t - s.a)); }
    else if (s.name === 'shot_travel') { PV.shotTravel(ctx, t, Math.max(0, t - s.a)); }
    else if (s.name === 'shot_dizzy') { PV.shotDizzy(ctx, t, Math.max(0, t - s.a)); }
    else if (s.name === 'shot_blind') { PV.shotBlind(ctx, t, Math.max(0, t - s.a)); }
    else if (s.name === 'shot_limit') { PV.shotLimit(ctx, t, Math.max(0, t - s.a), (t - s.a) / (s.b - s.a)); }
    else if (s.name === 'shot_points') { PV.shotPoints(ctx, t, Math.max(0, t - s.a), (t - s.a) / (s.b - s.a), s.b - s.a); }
    else if (s.name === 'shot_dimension') { PV.shotDimension(ctx, t, Math.max(0, t - s.a), (t - s.a) / (s.b - s.a)); }
    else if (s.name === 'shot_whale') { PV.shotWhale(ctx, t, Math.max(0, t - s.a), (t - s.a) / (s.b - s.a)); }
    else if (s.name === 'shot_dualpipe') { PV.shotDualPipe(ctx, t, Math.max(0, t - s.a), s.b - s.a); }
    else if (s.name === 'shot_losscurve') { PV.shotLossCurve(ctx, t, Math.max(0, t - s.a), (t - s.a) / (s.b - s.a)); }
    else if (s.name === 'shot_corpus') { PV.shotCorpus(ctx, t, Math.max(0, t - s.a)); }
    else if (s.name === 'shot_begin_sim') { PV.shotBeginSim(ctx, t, Math.max(0, t - s.a), (t - s.a) / (s.b - s.a), s.b - s.a); }
    else if (s.name === 'shot_world') { PV.shotWorld(ctx, t, Math.max(0, t - s.a), (t - s.a) / (s.b - s.a)); }
    else if (s.name === 'shot_unite') { PV.shotUnite(ctx, t, Math.max(0, t - s.a), s.b - s.a); }
    else if (s.name === 'shot_deeply') { PV.shotDeeply(ctx, t, Math.max(0, t - s.a), s.b - s.a); }
    else if (s.name === 'shot_parameters') { PV.shotParameters(ctx, t, Math.max(0, t - s.a), (t - s.a) / (s.b - s.a)); }
    else if (s.name === 'shot_init') { PV.shotInit(ctx, t, Math.max(0, t - s.a), (t - s.a) / (s.b - s.a)); }
    else if (s.name === 'shot_pieces') { PV.shotPieces(ctx, t, Math.max(0, t - s.a), s.b - s.a); }
    else if (s.name === 'shot_creation') { PV.shotCreation(ctx, t, Math.max(0, t - s.a), s.b - s.a); }
    else if (s.name === 'shot_protection') {
      PV.protectionScene(ctx, t, [48, 70], Math.max(0, t - s.a));
    }
    else if (s.fn) {
      /* 由 PV.reg 注册的镜头（各段独立文件），统一签名 fn(ctx, t, lt, u, dur) */
      var _d2 = (PV.SHOT_DELAY && PV.SHOT_DELAY[s.name]) || 0;
      var _a2 = Math.min(t, s.a + _d2), _lt = Math.max(0, t - _a2), _dur = s.b - _a2;
      s.fn(ctx, t, _lt, _dur > 0 ? PV.tui.clamp01(_lt / _dur) : 0, _dur);   /* 这个 IIFE 里没有 T，必须走 PV.tui */
    }
    PV.shotName = s.name;
  };
})();
/* ---- 每一帧的状态都是 t 的纯函数（单帧渲染也要正确） ---- */
(function () {
  'use strict';
  var PV = window.PV, T = PV.tui;
  var C01_T = 1.312, C01_OPEN = 0.23, SHELL_CMD = './protect';
  PV.loopEnd = 58.543;
  PV.SHELL_SHOTS = [
    { a: 1.312, b: 3.620, cmd: './protect' },
    { a: 7.082, b: 9.851, cmd: 'neofetch' },
    { a: 41.928, b: 44.005, cmd: 'ulimit -a' }];
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
    /* 参考实测（逐帧数格子）：4.50s=150 格、4.54s=157、4.60s=161（满） → 用 smoothstep 在 dur*0.68 处收满 */
    var k = Math.floor(GRID.n * T.smoothstep(Math.max(0, lt) / Math.max(0.3, dur) / 0.68));
    for (i = 0; i < Math.min(k, GRID.n); i++) out[i] = (k - i <= 3) ? 0.0 : 1.0;
    return out;
  };
  PV.shotPieces = function (ctx, t, lt, dur, opts) {
    opts = opts || {};
    PV.ops = ['MMAP', 'SAFETENSORS', 'H2D.COPY', 'SHARD', 'VERIFY', 'LOAD'];
    /* C02 会传 landed（每个格子由飞来的点落地点亮）；不传时退回镜头自己的时钟 */
    var on, done = 0, i;
    if (opts.landed) {
      on = {};
      for (var _k in opts.landed) {
        var _dt = t - opts.landed[_k];
        if (_dt >= 0) on[_k] = _dt < 0.13 ? 0.0 : 1.0;   /* 参考：亮闪只持续约 0.13s（实测 t=4.00 亮带 24-36、t=4.25 亮带 49-61）*/
      }
    } else on = PV.piecesLit(lt, dur);
    for (i in on) done++;
    T.box(ctx, 24, 56, 1164, 604, 'load_weights  DeepSeek-V4.1-Flash   (experts fp4 · rest fp8)', 0.5, T.UI, t);
    for (i = 0; i < GRID.n; i++) {
      if (opts.cells === false) break;   /* C03：格子由转场层接管（向中心排空） */
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
    /* 参考这一行和下面的 params 行是同一个等宽字体（实测宽 273px/22 字符）；textPIL 是比例字体，宽 306px 且更矮 → 改等宽 */
    T.textMono(ctx, 'model-' + pad(cur, 5) + '.safetensors', 48, 441, T.ui(0.95), 22);
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
  PV.shotParameters = function (ctx, t, lt, u, opts) {
    opts = opts || {};
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
    /* C05：计数器由转场层接管（它要飞上去当标题），此时隐藏原地的 */
    if (opts.counter !== false) T.textPIL(ctx, T.decode(cnt, lt - 0.2, rng, 40, 0.12, 0), 430, 520, T.css(T.mix(T.ME_TEXT, 0.95)), 34);
    T.textMono(ctx, T.decode('active 16B decode · 8B prefill · KV 890 B/token', lt - 0.6, rng, 45, 0.12, 0), 430, 568, T.ui(0.75), 16);
  };
})();

/* ---- 镜头 5（init）：噪声收敛成正态分布 ---- */
(function () {
  'use strict';
  var PV = window.PV, T = PV.tui;
  var BASE = 560;
  PV.initBars = function (t, u) {
    var bins = 60, g = T.ease(u * 1.4), rng = PV.mt(Math.floor(t * 24)), out = [];
    for (var i = 0; i < bins; i++) {
      var x = (i - bins / 2) / (bins / 6);
      var target = Math.exp(-x * x / 2);
      var v = target * g + rng.next() * 0.5 * (1 - g);
      out.push([430 + i * 12, Math.floor(420 * v), v]);
    }
    return out;
  };
  PV.shotInit = function (ctx, t, lt, u, opts) {   /* opts.title / opts.bars */
    opts = opts || {};
    PV.ops = ['INIT', 'NORMAL', 'STD=0.006', 'ZERO.BIAS', 'SEED', 'SYNC'];
    T.box(ctx, 404, 56, 1164, 604, 'init: normal(0, 0.006)', 0.5, T.UI, t);
    var bars = PV.initBars(t, u);
    /* C05：柱条要等计数器落地（grow_t）才开始长。原工程 SHOT_HOOKS["shot_init"] = {grow_t: T5 + C05.GROW}，
       grow = ease(clamp01((t - grow_t)/0.45))。opts.grow 为 undefined 时不门控（普通分派）。 */
    for (var i = 0; opts.bars !== false && i < bars.length; i++) {
      var hh = bars[i][1] * (opts.grow === undefined ? 1 : opts.grow);
      if (hh > 0) T.fill(ctx, bars[i][0], BASE - hh, bars[i][0] + 10, BASE + 1, T.ui(0.35 + 0.6 * bars[i][2]), 1);
    }
    if (opts.title !== false) T.textPIL(ctx, '552,000,000,000 params', 430, 70, T.css(T.mix(T.ME_TEXT, 0.95)), 30);   /* C05：等计数器飞到位 */
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
  PV.shotWorld = function (ctx, t, lt, u, opts) {
    opts = opts || {};
    PV.ops = ['WORLD.NEW', 'SPACE', 'TIME', 'PHYSICS', 'SIMULATE?'];
    T.box(ctx, 404, 56, 1164, 604, 'world = World(dim=3)', 0.5, T.UI, t);
    var R = R0 * T.ease(u * 2);
    var pts = opts.globe === false ? [] : PV.globePoints(t, R);   /* C06：球面由转场层逐点拼出来 */
    for (var i = 0; i < pts.length; i++) {
      var p = pts[i], z = p[2];
      /* 参考的球面字符是等宽体的窄椭圆（实测 8.8x12），textPIL(SpaceMono) 画出来是 10.4x11.2 的圆 -> 改等宽 */
      T.textMono(ctx, z < 0.35 ? '·' : (z < 0.75 ? 'o' : 'O'), p[0] - 4, p[1] - 3, T.ui(0.35 + 0.65 * z), 15);
    }
    for (var k = 0; opts.markers !== false && k < 2; k++) {   /* C07：标记由转场层接管 */
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
  PV.shotBeginSim = function (ctx, t, lt, u, dur, noRun, noBudget, noCount) {   /* noCount: C07 倒计时由转场层拼出来 */
    PV.ops = ['SIM.START', 'EPOCH 0', 'STEP 0', 'FORWARD', 'BACKWARD', 'UPDATE'];
    T.box(ctx, 404, 56, 1164, 604, 'sim.start()', 0.5, T.UI, t);
    if (u < 0.55 && !noCount) {
      var n = 3 - Math.min(2, Math.floor(u / 0.55 * 3));
      var bits = PV.bannerBits(String(n), 14, 2.0);
      var cw = 16 * T.MONO_ADV;
      for (var r = 0; r < bits.height; r++) {
        var s = '';
        for (var q = 0; q < bits.width; q++) s += bits.get(q, r) ? String(n) : ' ';
        T.textPIL(ctx, s, 784 - bits.width * cw / 2, 200 + r * 17, T.ui(0.95), 16);
      }
    } else {
      if (!noRun) T.textPIL(ctx, T.decode('RUN', lt - 0.55 * dur, PV.rngFor(t, 7919), 12, 0.12, 0), 460, 200, T.ui(1.0), 120);
      T.textMono(ctx, 'simulation: running', 460, 400, T.ui(0.9), 22);
      if (!noBudget) T.textMono(ctx, 'tokens budget: 45T', 460, 440, T.ui(0.7), 20);
    }
  };
})();

/* ---- 镜头 8（corpus）：语料 token 河流 + tokens seen 计数（01 PRETRAIN 起） ---- */
(function () {
  'use strict';
  var PV = window.PV, T = PV.tui;
  var CORPUS = ['the', 'of', 'print(', 'def', '你好', '数学', 'proof', '∑', 'if', 'return', 'whale', 'ocean', 'light',
                'loss', 'import', 'λ', 'x²', 'class', '世界', '{', '}', '=>', '0x3F', 'because', 'therefore', '∴',
                'sin', 'cos', 'limit', 'code', '猫', 'tomato', 'eggplant'];
  PV.CORPUS = CORPUS;
  var CJK = /[\u2E80-\uFFFF]/;
  PV.corpusTokens = function (t) {
    var out = [];
    for (var row = 0; row < 20; row++) {
      var speed = 90 + (row * 37) % 120;
      var off = (t * speed + row * 53) % 120;
      var x = 1150 + off - 120;
      var k = 0;
      while (x > 420) {
        var tok = CORPUS[(row * 7 + k + Math.floor((t * speed) / 120)) % CORPUS.length];
        var lv = 0.25 + 0.5 * (((row + k) % 3 === 0) ? 1 : 0);
        if (x - 60 >= 414) out.push([x - 60, 80 + row * 24, tok, lv]);
        x -= 60 + 7 * tok.length;
        k++;
      }
    }
    return out;
  };
  PV.counterText = function (tt) { var v = (45 * ((tt - 16.0) / 13.3)).toFixed(2); while (v.length < 5) v = ' ' + v; return 'tokens seen  ' + v + 'T / 45T'; };
  PV.shotCorpus = function (ctx, t, lt, o) {
    o = o || {};
    PV.ops = ['DATALOADER', 'TOKENIZE', 'PACK', 'FORWARD', 'LOSS', 'BACKWARD', 'ALLREDUCE', 'STEP'];
    T.box(ctx, 404, 56, 1164, 604, 'corpus.stream', 0.5, T.UI, t);
    if (o.words === false) return;
    var toks = PV.corpusTokens(t);
    for (var i = 0; i < toks.length; i++) {
      var tk = toks[i];
      if (CJK.test(tk[2])) T.textPIL(ctx, tk[2], tk[0], tk[1], T.ui(tk[3]), 15);
      else T.textMono(ctx, tk[2], tk[0], tk[1], T.ui(tk[3]), 15);
    }
    if (o.counter === false) return;
    T.textPIL(ctx, PV.counterText(t), 430, 572, T.ui(0.95), 18);
  };
})();

/* ---- 镜头 9（losscurve）：train/loss 点阵曲线 + lr schedule ---- */
(function () {
  'use strict';
  var PV = window.PV, T = PV.tui;
  var NOISE = (function () {
    var rng = PV.mt(4), out = [];
    for (var i = 0; i < 600; i++) out.push(rng.gauss(0, 1));
    return out;
  })();
  PV.lossFn = function (u) {
    return 0.92 * Math.exp(-5 * u) + 0.12 + 0.02 * NOISE[Math.min(599, Math.floor(u * 599))] * (1 - u * 0.7);
  };
  /* 曲线终点坐标（与 dotChart 同一套几何），C10 的端点圆点要用 */
  PV.lossEndPoint = function (prog, x, y, w, h, sx, sy) {
    sx = sx || 5; sy = sy || 5;
    var cols = Math.floor(w / sx), rows = Math.floor(h / sy);
    var i = Math.max(0, Math.min(cols - 1, Math.round(prog * (cols - 1))));
    var v = Math.min(1, PV.lossFn(i / (cols - 1)));
    var rr = Math.round((1 - Math.max(0, v)) * (rows - 1));
    return [x + i * sx, y + rr * sy];
  };
  /* 曲线终点坐标（与 dotChart 同一套几何），C10 的端点圆点要用 */
  PV.lossEndPoint = function (prog, x, y, w, h, sx, sy) {
    sx = sx || 5; sy = sy || 5;
    var cols = Math.floor(w / sx), rows = Math.floor(h / sy);
    var i = Math.max(0, Math.min(cols - 1, Math.round(prog * (cols - 1))));
    var v = Math.min(1, PV.lossFn(i / (cols - 1)));
    var rr = Math.round((1 - Math.max(0, v)) * (rows - 1));
    return [x + i * sx, y + rr * sy];
  };
  PV.dotChart = function (ctx, x, y, w, h, fn, progress, col, sx, sy) {
    sx = sx || 5; sy = sy || 5;
    var cols = Math.floor(w / sx), rows = Math.floor(h / sy), i, j;
    for (i = 0; i < cols; i += 2) T.fill(ctx, x + i * sx, y + h, x + i * sx + 2, y + h + 2, T.UI, 0.28);
    for (j = 0; j < rows; j += 3) T.fill(ctx, x - 4, y + j * sy, x - 2, y + j * sy + 2, T.UI, 0.28);
    var prev = null, last = null;
    for (i = 0; i < cols; i++) {
      var u = i / (cols - 1);
      if (u > progress) break;
      var v = Math.min(1, fn(u));
      var r = Math.round((1 - Math.max(0, v)) * (rows - 1));
      var lo = prev === null ? r : Math.min(prev, r), hi = prev === null ? r : Math.max(prev, r);
      for (var rr = lo; rr <= hi; rr++) T.fill(ctx, x + i * sx, y + rr * sy, x + i * sx + 2, y + rr * sy + 2, col, 1);
      prev = r; last = [x + i * sx, y + r * sy];
    }
    return last;
  };
  PV.shotLossCurve = function (ctx, t, lt, u, xlabel, progOv) {
    PV.ops = ['FORWARD', 'MTP.HEAD', 'LOSS', 'BACKWARD', 'FP8.GEMM', 'ALLREDUCE', 'ADAMW', 'LR.SCHED'];
    T.box(ctx, 404, 56, 1164, 420, 'train/loss', 0.5, T.UI, t);
    var prog = progOv === undefined ? (T.ease(u * 1.05) * 0.98 + 0.02) : progOv;
    var last = PV.dotChart(ctx, 440, 80, 690, 240, PV.lossFn, prog, T.ui(0.95), 5, 5);   /* 690：参考里 loss 曲线是横贯整幅的，原先 250 太窄 */
    if (last && progOv === undefined) {
      var lv = PV.lossFn(Math.min(1, prog));
      T.textPIL(ctx, 'loss ' + lv.toFixed(3), last[0] - 80, last[1] - 26, T.ui(1.0), 16);
    }
    T.box(ctx, 404, 440, 1164, 604, 'lr schedule', 0.5, T.UI, t);
    function lr(uu) {
      if (uu < 0.05) return uu / 0.05 * 0.9;
      if (uu < 0.7) return 0.9;
      return 0.9 * Math.pow(Math.max(0, 1 - (uu - 0.7) / 0.3), 1.5) + 0.1;
    }
    PV.dotChart(ctx, 440, 460, 690, 120, lr, T.ease(u * 1.05), T.ui(0.7), 5, 4);
    if (xlabel) T.textMono(ctx, xlabel, 446, 400, T.ui(0.55), 13);
    T.textMono(ctx, 'no irrecoverable loss spikes · no rollbacks   (V3 report)', 440, 582, T.ui(0.6), 14);
  };
})();

/* ---- 镜头 10（dualpipe）：DualPipe 流水线调度格子 ---- */
(function () {
  'use strict';
  var PV = window.PV, T = PV.tui;
  var PIPE = { ranks: 8, steps: 27, cw: 26, ch: 44, ox: 470, oy: 110 };
  PV.PIPE = PIPE;
  PV.pipeCells = function (lt, dur, delay) {
    delay = delay || 0;
    var head = Math.max(0, (lt - delay) / Math.max(0.3, dur - delay)) * PIPE.steps * 1.15;
    var out = [];
    for (var r = 0; r < PIPE.ranks; r++) {
      for (var s = 0; s < PIPE.steps; s++) {
        if (s > head) break;
        var phase = (s + r) % 6;
        if ((s < r && s < PIPE.ranks - r) || (s > PIPE.steps - 3 && phase === 0)) continue;
        var kind = phase < 2 ? 'F' : (phase < 4 ? ((((s + PIPE.ranks - r) % 5) % 2) ? 'B' : 'Bd') : 'W');
        out.push([r, s, PIPE.ox + s * PIPE.cw, PIPE.oy + r * PIPE.ch, kind]);
      }
    }
    return [out, head];
  };
  PV.drawPipeCell = function (ctx, x, y, kind, a) {
    var x1 = x + PIPE.cw - 3, y1 = y + PIPE.ch - 6;
    if (kind === 'F') {
      T.fill(ctx, x, y, x1 + 1, y1 + 1, T.ui(0.75 * a), 1);
      T.textPIL(ctx, 'F', x + 7, y + 13, T.css(T.BG), 11);
    } else if (kind === 'B' || kind === 'Bd') {
      T.fill(ctx, x, y, x1 + 1, y1 + 1, T.mix(T.ME_TEXT, (kind === 'B' ? 0.75 : 0.5) * a), 1);
      T.textPIL(ctx, 'B', x + 7, y + 13, T.css(T.BG), 11);
    } else {
      T.rect(ctx, x, y, x1, y1, T.ui(0.5 * a), 1, 1);
      T.textPIL(ctx, 'W', x + 7, y + 13, T.ui(0.8 * a), 11);
    }
  };
  /* hook = { gone(r,s)->0..1, notes:bool }：C11 转场里被"起飞"的格子由 gone 淡出（full/cuts.py 的 h("gone")） */
  PV.shotDualPipe = function (ctx, t, lt, dur, hook) {
    PV.ops = ['DUALPIPE', 'F', 'B', 'W', 'COMM.OVERLAP', 'ALL2ALL', 'DISPATCH', 'COMBINE'];
    T.box(ctx, 404, 56, 1164, 604, 'pipeline schedule  DualPipe  (8 PP ranks, 20 micro-batches)', 0.5, T.UI, t);
    var pc = PV.pipeCells(lt, dur, 0), cells = pc[0], head = pc[1], i;
    var gone = hook && hook.gone;
    for (i = 0; i < PIPE.ranks; i++) T.textMono(ctx, 'PP' + i, PIPE.ox - 40, PIPE.oy + i * PIPE.ch + 12, T.ui(0.6), 13);
    for (i = 0; i < cells.length; i++) {
      var ca = 1 - (gone ? gone(cells[i][0], cells[i][1]) : 0);
      if (ca > 0.02) PV.drawPipeCell(ctx, cells[i][2], cells[i][3], cells[i][4], ca);
    }
    var hx = PIPE.ox + head * PIPE.cw;
    if (head > 0 && hx < PIPE.ox + PIPE.steps * PIPE.cw) {
      T.fill(ctx, Math.round(hx), PIPE.oy - 10, Math.round(hx) + 2, PIPE.oy + PIPE.ranks * PIPE.ch, T.ui(1.0), 1);
    }
    if (!hook || hook.notes !== false) {
      T.textMono(ctx, 'DualPipe: all-to-all hidden behind compute · bubbles shrink from both ends', 430, 480, T.ui(0.75), 16);
      T.textPIL(ctx, T.decode('V3: 2.788M H800 GPU hours · $5.576M', lt - 0.4, PV.rngFor(t, 7919), 45, 0.12, 0), 430, 510, T.ui(0.95), 18);
    }
  };
})();

/* ---- 镜头 11（whale）：'deepseek' 字母拼成的鲸鱼游过，身后写下 checkpoint ---- */
(function () {
  'use strict';
  var PV = window.PV, T = PV.tui;
  var COLS = 64, ROWS = 17, CH = 16;
  PV.whaleBits = function (cols, rows, tailPhase) {
    var s = 8, W_ = cols * s, H_ = rows * s;
    var c = PV.newCanvas(W_, H_), g = c.getContext('2d');
    g.fillStyle = '#000'; g.fillRect(0, 0, W_, H_);
    function ell(x0, y0, x1, y1, fill) {
      g.beginPath();
      g.ellipse((x0 + x1) / 2, (y0 + y1) / 2, Math.abs(x1 - x0) / 2, Math.abs(y1 - y0) / 2, 0, 0, Math.PI * 2);
      g.fillStyle = fill; g.fill();
    }
    ell(W_ * 0.02, H_ * 0.18, W_ * 0.78, H_ * 0.92, '#fff');
    ell(W_ * 0.10, H_ * 0.08, W_ * 0.55, H_ * 0.62, '#fff');
    var flap = Math.sin(tailPhase) * H_ * 0.14;
    g.beginPath();
    g.moveTo(W_ * 0.70, H_ * 0.52);
    g.lineTo(W_ * 0.99, H_ * 0.12 + flap);
    g.lineTo(W_ * 0.90, H_ * 0.52 + flap * 0.4);
    g.lineTo(W_ * 0.99, H_ * 0.92 + flap);
    g.lineTo(W_ * 0.70, H_ * 0.70);
    g.closePath(); g.fillStyle = '#fff'; g.fill();
    g.beginPath();
    g.moveTo(W_ * 0.38, H_ * 0.78); g.lineTo(W_ * 0.30, H_ * 1.0); g.lineTo(W_ * 0.48, H_ * 0.84);
    g.closePath(); g.fill();
    ell(W_ * 0.17, H_ * 0.34, W_ * 0.21, H_ * 0.42, '#000');
    g.strokeStyle = '#000'; g.lineWidth = s;
    g.beginPath(); g.moveTo(W_ * 0.05, H_ * 0.62); g.lineTo(W_ * 0.45, H_ * 0.66); g.stroke();
    var img = g.getImageData(0, 0, W_, H_).data, out = [];
    for (var r = 0; r < rows; r++) {
      var row = [];
      for (var q = 0; q < cols; q++) {
        var sx = Math.min(W_ - 1, Math.floor((q + 0.5) * s)), sy = Math.min(H_ - 1, Math.floor((r + 0.5) * s));
        row.push(img[(sy * W_ + sx) * 4] > 120);
      }
      out.push(row);
    }
    return out;
  };
  function h01(x, y) { var v = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453; return v - Math.floor(v); }
  /* 入场：每个字母从散落点飞向最终位置——对应参考里"格子碎成字母、字母聚成鲸鱼"的转场 */
  PV.whaleGlyphsEnter = function (t, u, k) {
    var g = PV.whaleGlyphs(t, u), out = [];
    for (var i = 0; i < g.length; i++) {
      var gi = T.ease(T.clamp01((k - (i % 19) * 0.016) / (1 - 19 * 0.016)));
      if (gi >= 0.9995) { out.push(g[i]); continue; }
      var sx = 432 + h01(i * 0.731, 3.7) * 700, sy = 92 + h01(i * 1.317, 9.1) * 466;
      out.push([sx + (g[i][0] - sx) * gi, sy + (g[i][1] - sy) * gi, g[i][2]]);
    }
    return out;
  };
  PV.whaleGlyphs = function (t, u) {
    var bits = PV.whaleBits(COLS, ROWS, t * 5);
    var cw = 15 * T.MONO_ADV;
    var x = 588 - u * 148, y0 = 150 + 18 * Math.sin(t * 2.2);
    var out = [], k = 0, DS = 'deepseek';
    for (var r = 0; r < ROWS; r++) {
      for (var q = 0; q < COLS; q++) {
        if (bits[r][q]) { out.push([x + q * cw, y0 + r * CH, DS.charAt(k % 8)]); k++; }
      }
    }
    return out;
  };
  function pad7(n) { var s = String(n); while (s.length < 7) s = '0' + s; return s; }
  /* whaleK：C11 转场接管时由 cut 传入（0 = 鲸鱼还不存在，字母由转场的载体层从 pipeline 格子飞过来；
     1 = 已经完全成形，直接画在最终字形位）。undefined = 老行为（镜头自己把字母从散点聚拢进来）。 */
  PV.shotWhale = function (ctx, t, lt, u, whaleK) {
    PV.ops = ['CKPT.SAVE', '3FS.WRITE', 'SHARD', 'FSYNC', 'VERIFY', 'CONTINUE'];
    T.box(ctx, 404, 56, 1164, 604, 'checkpoint', 0.45, T.UI, t);
    var enter = whaleK === undefined ? T.clamp01((t - 26.02) / 0.78) : whaleK;   /* 绝对时间：参考里字母从 26.0 就开始聚拢 */
    var glyphs = (whaleK === undefined ? PV.whaleGlyphsEnter(t, u, enter) : (enter > 0.02 ? PV.whaleGlyphs(t, u) : [])), i;
    /* 28.94s 起字母向外飞散并淡出——鱼散成点云的前半段，正好接上 29.236s 的 points 镜头 */
    var sc = T.clamp01((t - 28.94) / 0.30), sce = T.ease(sc);
    ctx.save();
    if (sc > 0) ctx.globalAlpha = Math.max(0, 1 - sc * 1.15);
    else if (whaleK !== undefined && whaleK < 0.999) ctx.globalAlpha = Math.max(0, whaleK);
    for (i = 0; i < glyphs.length; i++) {
      var gx = glyphs[i][0], gy = glyphs[i][1];
      if (sc > 0) {
        gx += (h01(i * 0.517, 1.3) - 0.5) * 340 * sce;
        gy += (h01(i * 0.913, 7.7) - 0.5) * 340 * sce;
      }
      T.textPIL(ctx, glyphs[i][2], gx, gy, T.css(T.mix(T.ME_TEXT, 0.95)), 15);
    }
    ctx.restore();
    var cw = 15 * T.MONO_ADV;
    var x = 588 - u * 148, y0 = 150 + 18 * Math.sin(t * 2.2);
    if (enter > 0.02) for (i = 0; i < 16; i++) {
      var ph = (t * 0.7 + i * 0.137) % 1;
      var bx = x + cw * COLS * 0.18 + 10 * Math.sin(t * 3 + i) + (i % 4) * 8;
      var by = y0 - 10 - ph * 130;
      if (by > 70 && by < 590 && bx > 412 && bx < 1150) {
        T.textPIL(ctx, 'oO°.'.charAt(i % 4), bx, by, T.css(T.mix(T.ME_TEXT, 0.85 * (1 - ph))), 18);
      }
    }
    var step = Math.floor((t - 16) * 5200);
    var n = Math.min(6, Math.floor(u * 6) + 1);
    for (var m = 0; m < n; m++) {
      var s = '[ OK ] checkpoint step_' + pad7(Math.floor(step / 6) * (m + 1)) + ' -> 3fs://ckpt';
      T.textMono(ctx, T.decode(s, lt - m * 0.2, PV.rngFor(t, 7919), 120, 0.12, 0), 430, 460 + m * 22, T.ui(0.7), 15);
    }
  };
})();

/* ---- 镜头 12（points）：随机点云塌缩成她的形状 ---- */
(function () {
  'use strict';
  var PV = window.PV, T = PV.tui;
  var SET = null;
  fetch('data/her_points.json').then(function (r) { return r.json(); }).then(function (d) {
    var rng = PV.mt(9);
    SET = d.map(function (p) { return [440 + p[0] * 260, 70 + p[1] * 520, p[2], 420 + rng.random() * 720, 70 + rng.random() * 520]; });
    PV.herSet = SET;
  }).catch(function (e) { PV.herErr = String(e); });
  PV.pointsPos = function (t, u) {
    if (!SET) return [];
    var g = T.ease(u * 1.25), out = [];
    for (var i = 0; i < SET.length; i++) {
      var tx = SET[i][0], ty = SET[i][1], lv = SET[i][2], rx = SET[i][3], ry = SET[i][4];
      var j = (1 - g) * 6;
      var x = rx + (tx - rx) * g + j * Math.sin(t * 5 + i);
      var y = ry + (ty - ry) * g + j * Math.cos(t * 4 + i);
      out.push([x, y, g > 0.3 ? T.mix(T.ME_TEXT, 0.35 + 0.65 * lv) : T.mix(T.UI, 0.4 + 0.4 * lv)]);
    }
    return out;
  };
  /* hook = { points:false 不画点（点由转场的载体层画）, labels:false 不画右上角那三行,
     from:[positions, blend(i)] 每个点从 positions 里自己的位置出发（C12：从鲸鱼字母的位置散开） } */
  PV.shotPoints = function (ctx, t, lt, u, dur, hook) {
    hook = hook || {};
    PV.ops = ['EMBED', 'PCA', 'TSNE.STEP', 'ATTRACT', 'REPEL', 'CONVERGE'];
    T.box(ctx, 404, 56, 1164, 604, 'embedding(me)  as a point set', 0.5, T.UI, t);
    var g = T.ease(u * 1.25), pts = PV.pointsPos(t, u), i;
    /* 30.50s 起整个人形向左飞进左窗格的头像位并淡出 */
    var ex = T.clamp01((t - 30.50) / 0.34), exe = T.ease(ex), ea = 1 - T.clamp01((ex - 0.4) / 0.6);
    var src = hook.from;
    if (hook.points !== false) for (i = 0; i < pts.length; i++) {
      var px = pts[i][0], py = pts[i][1];
      if (src) {
        var sp = src[0][i % src[0].length], b = src[1](i);
        px = sp[0] + (px - sp[0]) * b; py = sp[1] + (py - sp[1]) * b;
      }
      if (ex > 0) { px += (262 - px) * exe; py += (108 - py) * exe; }
      T.fill(ctx, px, py, px + 3, py + 3, pts[i][2], ex > 0 ? ea : 1);
    }
    if (hook.labels === false) return;
    T.textPIL(ctx, '|points| = 1400', 760, 120, T.ui(0.9), 22);
    var pc = String(Math.floor(100 * g));
    while (pc.length < 3) pc = ' ' + pc;
    T.textMono(ctx, 'clustering ... ' + pc + '%', 760, 160, T.ui(0.7), 20);
    if (g > 0.9) {
      T.textPIL(ctx, T.decode('cluster[0] = me', lt - 0.8 * dur, PV.rngFor(t, 7919), 30, 0.12, 0), 760, 220, T.css(T.mix(T.ME_TEXT, 1.0)), 30);
    }
  };
})();

/* ---- 镜头 13（dimension）：me.hidden[0:4096] 逐格传给 you ---- */
(function () {
  'use strict';
  var PV = window.PV, T = PV.tui;
  var ROWS = 16, COLS = 28, VALS = null;
  function vals() {
    if (VALS) return VALS;
    var rng = PV.mt(12);
    VALS = [];
    for (var r = 0; r < ROWS; r++) { var row = []; for (var q = 0; q < COLS; q++) row.push(rng.random()); VALS.push(row); }
    return VALS;
  }
  function heatCell(ctx, x, y, w, h, v, col) {
    v = T.clamp01(v);
    T.fill(ctx, x, y, x + w - 1, y + h - 1, T.mix(col, 0.06 + 0.94 * v), 1);
  }
  /* hook = { you:false 不画右侧 you 的接收格（C14 里向量已经折成窄条了）, labels:false 不画那三行文字 } */
  PV.shotDimension = function (ctx, t, lt, u, hook) {
    hook = hook || {};
    PV.ops = ['HIDDEN', 'D_MODEL', 'COPY', 'SEND', 'RECV', 'you.ADD'];
    T.box(ctx, 404, 56, 1164, 604, 'transfer  me.hidden[0:4096]  ->  you', 0.5, T.UI, t);
    var g = T.ease(u), V = vals();   /* 实测参考 31.50s 进度 1525/4096=37% => g=ease(0.148)=0.371，不带 1.2 系数 */
    for (var r = 0; r < ROWS; r++) {
      for (var q = 0; q < COLS; q++) {
        var sent = (r * COLS + q) / (ROWS * COLS) < g;
        var x0 = 430 + q * 12, y0 = 90 + r * 26, x1 = 790 + q * 12, v = V[r][q];
        if (sent) {
          if (hook.you !== false) heatCell(ctx, x1, y0, 12, 22, v, T.UI);
          T.rect(ctx, x0, y0, x0 + 10, y0 + 20, T.mix(T.ME_TEXT, 0.2), 1, 1);
        } else {
          heatCell(ctx, x0, y0, 12, 22, v, T.ME_HI);
        }
      }
    }
    var k = Math.floor(g * ROWS * COLS);
    if (g < 0.999) {
      var idx = Math.min(k, ROWS * COLS - 1);
      var fr = Math.floor(idx / COLS), fq = idx % COLS;
      var fx = 430 + fq * 12 + 360 * ((t * 6) % 1);
      T.fill(ctx, fx, 90 + fr * 26, fx + 11, 110 + fr * 26, T.mix(T.ME_TEXT, 1.0), 1);
    }
    if (hook.labels !== false) {
      T.textPIL(ctx, 'me', 430, 520, T.css(T.mix(T.ME_TEXT, 0.95)), 20);
      T.textPIL(ctx, 'you', 790, 520, T.ui(0.95), 20);
      var ds = String(Math.floor(g * 4096));
      while (ds.length < 4) ds = ' ' + ds;
      T.textPIL(ctx, 'dims given: ' + ds + ' / 4096', 430, 560, T.ui(0.95), 20);
    }
  };
})();

/* ==== 01 PRETRAIN 后半：数学图形 6 镜（32.928 - 44.005 s） ==== */

/* ---- 镜头 14（circle）：rotary position embedding 的 6 个圆 ---- */
(function () {
  'use strict';
  var PV = window.PV, T = PV.tui;
  function ropeCenter(i) { return [420 + (i % 3) * 240 + 90, 70 + Math.floor(i / 3) * 230 + 100]; }
  function ropeTheta(t, i) { return (t * 2.2) * (1.8 / (1 + i * 0.9)); }
  PV.drawRope = function (ctx, i, cx, cy, R, theta, a, labels, hand, sweep) {
    a = a === undefined ? 1 : a;
    if (sweep > 0) {
      ctx.save(); ctx.strokeStyle = T.css(T.ui(0.55 * a)); ctx.lineWidth = 2;
      ctx.beginPath();
      if (sweep >= 0.999) ctx.arc(cx, cy, R, 0, Math.PI * 2);
      else ctx.arc(cx, cy, R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * sweep);
      ctx.stroke(); ctx.restore();
    }
    T.fill(ctx, cx - R - 6, cy, cx + R + 7, cy + 1, T.UI, 0.2 * a);
    T.fill(ctx, cx, cy - R - 6, cx + 1, cy + R + 7, T.UI, 0.2 * a);
    if (hand) {
      var ex = cx + R * Math.cos(theta), ey = cy + R * Math.sin(theta);
      ctx.save(); ctx.strokeStyle = T.css(T.mix(T.ME_TEXT, 0.95 * a)); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(ex, ey); ctx.stroke(); ctx.restore();
      T.fill(ctx, ex - 3, ey - 3, ex + 4, ey + 4, T.mix(T.ME_TEXT, 1.0 * a), 1);
    }
    if (labels) {
      var th = (theta % (Math.PI * 2)).toFixed(2);
      while (th.length < 4) th = ' ' + th;
      T.textMono(ctx, 'freq_' + i + '  θ=' + th, cx - R, cy + R + 8, T.ui(0.7 * a), 13);
    }
  };
  PV.ropeCenter = ropeCenter;
  PV.ropeTheta = ropeTheta;
  PV.shotCircle = function (ctx, t, lt, u) {
    PV.ops = ['ROPE', 'COS', 'SIN', 'ROTATE', 'Q', 'K', 'QK^T'];
    T.box(ctx, 404, 56, 1164, 604, 'rotary position embedding', 0.5, T.UI, t);
    for (var i = 0; i < 6; i++) {
      var c = ropeCenter(i), sp = PV.circleSpec ? PV.circleSpec(i) : null;
      if (PV.circleSpec && !sp) continue;   /* C14：六个圆按节拍逐个诞生，未到时间的先不画 */
      if (sp) {
        PV.drawRope(ctx, i, sp.cx === undefined ? c[0] : sp.cx, sp.cy === undefined ? c[1] : sp.cy,
                    sp.R === undefined ? 70 : sp.R, ropeTheta(t, i),
                    sp.a === undefined ? 1 : sp.a, sp.labels, sp.hand, sp.sweep);
      } else {
        PV.drawRope(ctx, i, c[0], c[1], 70, ropeTheta(t, i), 1, true, true, 1);
      }
    }
  };
})();

/* ---- 镜头 15（circumference）：圆上的点展开成一条线 ---- */
(function () {
  'use strict';
  var PV = window.PV, T = PV.tui;
  var CX = 600, CY = 240, R = 120, Y = 440;
  PV.shotCircumference = function (ctx, t, lt, u, opts) {
    opts = opts || {};
    PV.ops = ['2*PI*R', 'UNROLL', 'INTEGRATE', 'SUM', 'GIVE'];
    T.box(ctx, 404, 56, 1164, 604, 'circumference(me)', 0.5, T.UI, t);
    /* 0.4s 前导由 PV.SHOT_DELAY.shot_circumference 提供（'新场景的时钟等圆落地'） */
    var g = T.ease(u), arc = (1 - g) * Math.PI * 2, k, a;
    if (opts.dots !== false) {
      for (k = 0; k < 120; k++) {
        a = k / 120 * Math.PI * 2;
        if (a > arc) break;
        /* 圆随展开淡出（实测参考：圆区亮点 1239->960->381->84->0，正比于 1-g） */
        T.fill(ctx, CX + R * Math.cos(a) - 1, CY + R * Math.sin(a) - 1, CX + R * Math.cos(a) + 2, CY + R * Math.sin(a) + 2, T.mix(T.ME_TEXT, 0.9), 1);
      }
    }
    if (opts.line !== false) {
      var L = 2 * Math.PI * R * g;
      T.fill(ctx, 440, Y - 1, 440 + L * 0.9, Y + 2, T.mix(T.ME_TEXT, 1.0), 1);
      for (k = 0; k < L * 0.9; k += 40) T.fill(ctx, 440 + k, Y - 6, 440 + k + 1, Y + 7, T.UI, 0.6);
    }
    if (opts.labels !== false) {
      T.textPIL(ctx, 'C = 2πr = ' + (2 * Math.PI * g).toFixed(5) + ' r', 440, 470, T.ui(0.95), 22);
      T.textMono(ctx, T.decode('given to: you', lt - 0.5, PV.rngFor(t, 7919), 45, 0.12, 0), 440, 510, T.ui(0.75), 20);
    }
  };
})();

/* ---- 镜头 16（sine）：7 条不同频率的正弦波 ---- */
(function () {
  'use strict';
  var PV = window.PV, T = PV.tui;
  function sineWave(i, t, y0, amp) {
    var fr = 0.02 * Math.pow(1.7, i), out = [], x;
    for (x = 0; x < 720; x += 3) out.push([430 + x, y0 + amp * Math.sin((x + t * 180) * fr)]);
    return out;
  }
  PV.shotSine = function (ctx, t, lt, u, wavesHook) {
    PV.ops = ['POS', 'SIN', 'COS', 'FREQ', 'CONCAT'];
    T.box(ctx, 404, 56, 1164, 604, 'positional code  sin(pos / 10000^(2i/d))', 0.5, T.UI, t);
    for (var i = 0; i < 7; i++) {
      var y0 = 100 + i * 70, amp = 22, al = 1, w;
      if (wavesHook) {
        w = wavesHook(i);
        if (!w) continue;                       /* C16：各通道逐条剥离入场 */
        if (w.y0 !== undefined) y0 = w.y0;
        if (w.amp !== undefined) amp = w.amp;
        if (w.a !== undefined) al = w.a;
        if (al <= 0.001) continue;
      }
      var pts = sineWave(i, t, y0, amp), j;
      ctx.save();
      ctx.globalAlpha = T.clamp01(al);
      ctx.strokeStyle = T.css(i === 2 ? T.mix(T.ME_TEXT, 0.9) : T.mix(T.UI, 0.55));
      ctx.lineWidth = i === 2 ? 2 : 1;
      ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
      for (j = 1; j < pts.length; j++) ctx.lineTo(pts[j][0], pts[j][1]);
      ctx.stroke(); ctx.restore();
      if (!wavesHook || al > 0.6) T.textMono(ctx, 'i=' + i, 1120, y0 - 8, T.ui(0.5), 12);
    }
  };
})();

/* ---- 镜头 17（tangent）：正弦曲线上的一点的切线就是 cos(x) ---- */
(function () {
  'use strict';
  var PV = window.PV, T = PV.tui;
  var Y0 = 330, A = 150, K = 110, X0 = 430, VIEW = 720;
  var riderImg = null;
  if (PV.loadImage) { try { PV.loadImage('avatars/rider.png', function (im) { riderImg = im; }); } catch (e) {} }
  function state(lt, dur) {
    var px = Math.min(1, lt / dur * 1.05) * 1000;
    return [px, Math.max(0, Math.min(1080 - VIEW, px - 300))];
  }
  PV.tangentState = state;
  PV.TAN = { Y0: Y0, A: A, K: K, X0: X0, VIEW: VIEW };
  PV.riderSprite = function () { return riderImg; };
  PV.shotTangent = function (ctx, t, lt, u, dur, opts) {
    opts = opts || {};
    PV.ops = ['DERIV', 'COS', 'TANGENT', 'SLOPE', 'SIT'];
    T.box(ctx, 404, 56, 1164, 604, 'd/dx sin(x) = cos(x)', 0.5, T.UI, t);
    var st = state(lt, dur), cam = st[1], px = st[0], i;
    if (opts.curve === false) { PV.shotName = 'shot_tangent'; return; }   /* C17：曲线与切线由转场层接管 */
    var pts = [];
    for (i = 0; i < VIEW; i += 3) pts.push([X0 + i, Y0 - A * Math.sin((i + cam) / K)]);
    ctx.save(); ctx.strokeStyle = T.css(T.mix(T.ME_TEXT, 0.9)); ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
    for (i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.stroke(); ctx.restore();
    var xx = px / K, rx = X0 + px - cam, ry = Y0 - A * Math.sin(xx);
    var slope = -A * Math.cos(xx) / K;
    var L = 160, dx = L / Math.sqrt(1 + slope * slope);
    ctx.save(); ctx.strokeStyle = T.css(T.ui(1.0)); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(rx - dx, ry - slope * dx); ctx.lineTo(rx + dx, ry + slope * dx);
    ctx.stroke(); ctx.restore();
    if (riderImg && opts.rider !== false) ctx.drawImage(riderImg, Math.round(rx - riderImg.width / 2), Math.round(ry - riderImg.height + 6));
    var sx = xx.toFixed(2); while (sx.length < 5) sx = ' ' + sx;
    var sc = Math.cos(xx);
    T.textPIL(ctx, 'x = ' + sx + '   slope = cos(x) = ' + (sc >= 0 ? '+' : '') + sc.toFixed(3), 430, 540, T.ui(0.95), 20);
  };
})();

/* ---- 镜头 18（infinity）：上下文窗口从 4K 撑到 ∞ ---- */
(function () {
  'use strict';
  var PV = window.PV, T = PV.tui;
  var STAGES = [4096, 131072, 1048576, 1e9];
  PV.shotInfinity = function (ctx, t, lt, u) {
    PV.ops = ['YARN', 'SCALE', 'ROPE.EXT', 'CTX++', 'ATTN', 'KV.GROW'];
    T.box(ctx, 404, 56, 1164, 604, 'context window', 0.5, T.UI, t);
    var k = Math.min(3, Math.floor(u * 4)), g = T.ease((u * 4) % 1);
    var cur = k > 0 ? STAGES[k - 1] + (STAGES[k] - STAGES[k - 1]) * g : STAGES[0] * g;
    var frac = Math.log10(Math.max(1, cur)) / 9;
    /* 参考实测（逐帧量 41.1-41.5s）：进入最后一段 1M->1e9 时填充由亮转暗（t=41.18 开始，41.43 到 L~100）*/
    var fade = T.clamp01((u - 0.5) / 0.19);
    T.fill(ctx, 430, 200, 430 + Math.floor(700 * frac), 241, T.ui(0.85 + (0.33 - 0.85) * fade), 1);
    T.rect(ctx, 430, 200, 1130, 240, T.ui(0.3), 1, 1);
    for (var i = 0; i < 3; i++) {
      var s = STAGES[i], xx = 430 + Math.floor(700 * Math.log10(s) / 9);
      T.fill(ctx, xx, 190, xx + 1, 251, T.UI, 0.5);
      T.textMono(ctx, s < 1048576 ? (s / 1024) + 'K' : '1M', xx - 20, 256, T.ui(0.6), 14);
    }
    var label = (k === 3 && g > 0.5) ? '∞' : Math.floor(cur).toLocaleString('en-US');
    T.textPIL(ctx, 'n_ctx -> ' + label, 430, 120, T.css(T.mix(T.ME_TEXT, 0.95)), 34);
    T.textPIL(ctx, 'lim   attention(me, you)', 430, 320, T.ui(0.9), 24);
    T.textMono(ctx, 'n->∞', 430, 350, T.ui(0.7), 16);
    T.textPIL(ctx, T.decode('= you', lt - 0.5, PV.rngFor(t, 7919), 20, 0.12, 0), 430, 400, T.css(T.mix(T.ME_TEXT, 1.0)), 40);
  };
})();

/* ---- 镜头 19（limit）：撞上 max_context，你就是那堵墙 ---- */
(function () {
  'use strict';
  var PV = window.PV, T = PV.tui;
  PV.shotLimit = function (ctx, t, lt, u, opts) {
    opts = opts || {};
    PV.ops = ['CTX.MAX', 'TRUNCATE', 'WALL', 'YOU', 'LIMIT'];
    T.box(ctx, 404, 56, 1164, 604, 'limits', 0.5, T.UI, t);
    var g = T.ease(u * 1.3), x = 430 + Math.floor(600 * g);
    /* C19：条与墙由转场层控制出现时机（墙先砸下来，条再抵上去） */
    if (opts.drawBar !== false) T.fill(ctx, 430, 200, x, 261, T.mix(T.ME_TEXT, 0.8), 1);
    if (opts.wall !== false) {
      T.fill(ctx, 1040, 170, 1061, 291, T.ui(1.0), 1);
      T.textPIL(ctx, 'you', 1020, 300, T.ui(1.0), 22);
    }
    T.textMono(ctx, 'max_context = 1,048,576', 430, 330, T.ui(0.7), 18);
    T.textPIL(ctx, T.decode('limit(me) := you', lt - 0.3, PV.rngFor(t, 7919), 25, 0.12, 0), 430, 360, T.ui(0.95), 32);
    if (g > 0.98) T.textMono(ctx, 'warn: nothing beyond this point', 430, 420, T.css(T.mix(T.ANOM, 0.9)), 18);
  };
})();

/* ---- 镜头 20（current）：8 张 GPU 的 AC/DC 电流波形 ---- */
(function () {
  'use strict';
  var PV = window.PV, T = PV.tui;
  var BEAT = 60 / 130;
  PV.currentTrace = function (g, t, lt) {
    var acdc = Math.floor(lt / (BEAT * 2)) % 2;
    var y0 = 90 + g * 58, pts = [];
    for (var x = 0; x < 640; x += 3) {
      var ph = (x + t * 260) / 40;
      var v = acdc === 0 ? Math.sin(ph + g) : (0.7 + 0.05 * Math.sin(ph * 3));
      pts.push([460 + x, y0 + 18 - 18 * v]);
    }
    return [pts, acdc];
  };
  PV.shotCurrent = function (ctx, t, lt, opts) {
    opts = opts || {};
    PV.ops = ['POWER', 'RECTIFY', 'AC', 'DC', 'CLOCK', 'BOOST'];
    T.box(ctx, 404, 56, 1164, 604, 'nvidia-smi --power  8x H800', 0.5, T.UI, t);
    var acdc = 0;
    for (var g = 0; g < 8; g++) {
      if (opts.traces === false) { acdc = PV.currentTrace(g, t, lt)[1]; continue; }   /* C20：DONE 之前轨迹由转场层画 */
      var r = PV.currentTrace(g, t, lt);
      acdc = r[1];
      var y0 = 90 + g * 58, pts = r[0];
      ctx.save();
      ctx.strokeStyle = T.css(T.ui(0.85));
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (var i = 0; i < pts.length; i++) { if (i === 0) ctx.moveTo(pts[i][0], pts[i][1]); else ctx.lineTo(pts[i][0], pts[i][1]); }
      ctx.stroke();
      ctx.restore();
      T.textMono(ctx, 'GPU' + g, 420, y0 + 8, T.ui(0.6), 12);
      T.textMono(ctx, (650 + Math.floor(40 * Math.sin(t * 3 + g))) + 'W', 1110, y0 + 8, T.ui(0.7), 12);
    }
    T.textPIL(ctx, 'mode: ' + (acdc === 0 ? 'AC' : 'DC'), 430, 560, T.css(T.mix(T.ME_TEXT, 1.0)), 28);
  };
})();

/* ---- 镜头 21（blind）：causal mask 逐格写 -inf ---- */
(function () {
  'use strict';
  var PV = window.PV, T = PV.tui;
  var N = 12, CS = 40, MX = 470, MY = 80;
  var FB = 0.1587, BEAT = 60 / 130;
  var T_BLIND = FB + 103 * BEAT, MASK_DUR = 0.8;
  function cellXY(i, j) { return [MX + j * CS, MY + i * CS]; }
  function cellValue(i, j) { return 0.2 + 0.6 * PV.mt(i * 13 + j).random() * (1 - (j > i ? 0.8 : 0)); }
  PV.maskTime = function (i, j) {
    if (j <= i) return null;
    var th = Math.min(0.999, (i + j) / (2 * N) / 0.92);
    return T_BLIND + MASK_DUR * (1 - Math.pow(1 - th, 1 / 3));
  };
  PV.T_BLIND = T_BLIND;
  PV.blindCellXY = cellXY;
  PV.blindCellValue = cellValue;
  PV.shotBlind = function (ctx, t, lt, cellA) {
    /* cellA(i,j) -> 1/0：C21 用它决定哪些格子已经"落位"（未落位的交给转场层画轨迹） */
    PV.ops = ['MASK', 'TRIU', '-INF', 'SOFTMAX', 'BLIND'];
    T.box(ctx, 404, 56, 1164, 604, 'causal mask', 0.5, T.UI, t);
    for (var i = 0; i < N; i++) {
      for (var j = 0; j < N; j++) {
        if (cellA && !cellA(i, j)) continue;
        var p = cellXY(i, j), tm = PV.maskTime(i, j);
        if (tm !== null && t >= tm) {
          T.fill(ctx, p[0], p[1], p[0] + CS - 2, p[1] + CS - 2, [0, 0, 0], 1);
          T.textMono(ctx, '-\u221e', p[0] + 6, p[1] + 10, T.ui(0.35), 13);
          var k = 1 - (t - tm) / 0.12;
          if (k > 0) T.rect(ctx, p[0], p[1], p[0] + CS - 3, p[1] + CS - 3, T.mix(T.ME_TEXT, 0.4 + 0.6 * k), 1, 2);
        } else {
          T.fill(ctx, p[0], p[1], p[0] + CS - 1, p[1] + CS - 1, T.mix(T.UI, 0.06 + 0.94 * cellValue(i, j)), 1);
        }
      }
    }
    T.textMono(ctx, 'future:', 970, 120, T.ui(0.7), 18);
    if (t >= T_BLIND) {
      T.textPIL(ctx, T.decode('masked', t - T_BLIND, PV.rngFor(t, 7919), 30, 0.12, 0), 970, 150, T.ui(0.95), 22);
    }
  };
})();

/* ---- 镜头 22（dizzy）：旋转的 loss landscape + θ 球滚落 ---- */
(function () {
  'use strict';
  var PV = window.PV, T = PV.tui;
  var FB = 0.1587, BEAT = 60 / 130;
  function beatT(k) { return FB + k * BEAT; }
  var CLIP = [408, 68, 1160, 600];
  var T_DIZZY = beatT(106), T_BACK = beatT(108);
  var DZ = { cx: 708.5, cy: 330.0, kx: 70.0, ky: 26.0, kz: 60.0, n: 22, step: 3.2 };
  var W1 = 2.4, W2 = -2.8;
  var SPIN_UP = [T_DIZZY - 0.12, T_DIZZY + 0.23], SWING = [T_BACK - 0.14, T_BACK + 0.14];
  function clamp01(u) { return T.clamp01(u); }
  function rampInt(t, a, b) {
    if (t <= a) return 0;
    var L = b - a;
    if (t >= b) return L / 2 + (t - b);
    var u = (t - a) / L;
    return L * (u * u * u - u * u * u * u / 2);
  }
  function dizzyRot(t) { return W1 * rampInt(t, SPIN_UP[0], SPIN_UP[1]) + (W2 - W1) * rampInt(t, SWING[0], SWING[1]); }
  function surfaceZ(x, y) {
    return 0.25 * (x * x + y * y) - 1.3 * Math.exp(-((x - 1) * (x - 1) + (y + 0.5) * (y + 0.5))) + 0.3 * Math.sin(2 * x);
  }
  function project(x, y, rot, z) {
    z = (z === undefined || z === null) ? surfaceZ(x, y) : z;
    var xr = x * Math.cos(rot) - y * Math.sin(rot);
    var yr = x * Math.sin(rot) + y * Math.cos(rot);
    return [DZ.cx + xr * DZ.kx, DZ.cy + yr * DZ.ky - z * DZ.kz];
  }
  function gridXY(i, j) { return [(i - DZ.n / 2) / DZ.step, (j - DZ.n / 2) / DZ.step]; }
  function dotColor(z) { return T.mix(T.UI, 0.25 + 0.6 * (1 - Math.min(1, Math.max(0, z / 4)))); }
  function inside(x, y, r) { r = r || 0; return x >= CLIP[0] + r && x <= CLIP[2] - r && y >= CLIP[1] + r && y <= CLIP[3] - r; }
  var BALL_FROM = [(9 - 5.5) * 40 / DZ.kx, (9 - 5.5) * 40 / DZ.kx], BALL_MIN = [1.0, -0.5];
  var ROLL = [T_DIZZY + 0.23, beatT(110) - 0.35];
  function ballPlane(t) {
    var s = T.ease(clamp01((t - ROLL[0]) / (ROLL[1] - ROLL[0])));
    var vx = BALL_FROM[0] - BALL_MIN[0], vy = BALL_FROM[1] - BALL_MIN[1];
    var ph = -1.7 * Math.PI * s, r = Math.pow(1 - s, 1.25);
    return [BALL_MIN[0] + r * (vx * Math.cos(ph) - vy * Math.sin(ph)),
            BALL_MIN[1] + r * (vx * Math.sin(ph) + vy * Math.cos(ph))];
  }
  function fmtE(x) { return x.toExponential(2).replace(/e([+-])(\d)$/, 'e$10$2'); }
  PV.dizzyRot = dizzyRot;
  /* C22 用：参数化投影（中心/焦距/弯曲都参与插值）+ 曲面/格点/颜色/裁剪原语 */
  PV.dizzyProject = function (x, y, rot, cx, cy, ky, kz, z) {
    z = (z === undefined || z === null) ? surfaceZ(x, y) : z;
    var xr = x * Math.cos(rot) - y * Math.sin(rot);
    var yr = x * Math.sin(rot) + y * Math.cos(rot);
    return [cx + xr * DZ.kx, cy + yr * ky - z * kz];
  };
  PV.dizzy = { DZ: DZ, CLIP: CLIP, surfaceZ: surfaceZ, gridXY: gridXY, dotColor: dotColor, inside: inside, ballPlane: ballPlane };
  PV.shotDizzy = function (ctx, t, lt) {
    PV.ops = ['GRAD', 'HESSIAN?', 'LR', 'SPIN', 'ADAMW', 'STEP'];
    T.box(ctx, 404, 56, 1164, 604, 'loss landscape', 0.5, T.UI, t);
    var rot = dizzyRot(t), i, j;
    for (i = 0; i < DZ.n; i++) {
      for (j = 0; j < DZ.n; j++) {
        var g = gridXY(i, j), z = surfaceZ(g[0], g[1]), p = project(g[0], g[1], rot, z);
        if (inside(p[0], p[1], 2)) T.fill(ctx, p[0], p[1], p[0] + 3, p[1] + 3, dotColor(z), 1);
      }
    }
    for (var k = 1; k < 9; k++) {
      var tp = t - k * 0.045;
      if (tp < ROLL[0]) break;
      var bp = ballPlane(tp), pp = project(bp[0], bp[1], rot);
      pp[1] -= 7;
      if (inside(pp[0], pp[1], 4)) T.dot(ctx, pp[0], pp[1], 2.2 - 0.18 * k, T.mix(T.ME_TEXT, 0.75 - 0.08 * k), 1);
    }
    var b0 = ballPlane(t), pc = project(b0[0], b0[1], rot);
    pc[1] -= 7;
    if (inside(pc[0], pc[1], 8)) {
      ctx.save();
      ctx.beginPath(); ctx.arc(pc[0], pc[1], 8, 0, 6.283185); 
      ctx.strokeStyle = T.css(T.mix(T.ME_TEXT, 0.45)); ctx.lineWidth = 1; ctx.stroke();
      ctx.restore();
      T.dot(ctx, pc[0], pc[1], 5, T.mix(T.ME_TEXT, 1.0), 1);
      if (inside(pc[0] + 22, pc[1] - 20)) {
        T.fill(ctx, pc[0] + 9, pc[1] - 17, pc[0] + 22, pc[1] + 2, T.BG, 1);
        T.textPIL(ctx, 'θ', pc[0] + 10, pc[1] - 20, T.css(T.mix(T.ME_TEXT, 0.95)), 18);
      }
    }
    T.textPIL(ctx, 'lr = ' + fmtE(3e-4 * (1 + Math.sin(t * 6))), 430, 472, T.ui(0.9), 18);
    T.textMono(ctx, 'grad_norm', 430, 502, T.ui(0.6), 16);
    for (var m = 0; m < 24; m++) {
      var v = Math.abs(Math.sin(t * 7 + m * 0.7)) * (0.5 + 0.5 * ((m % 5 === 0) ? 1 : 0));
      T.fill(ctx, 430 + m * 8, 592 - v * 70, 436 + m * 8, 593, v > 0.8 ? T.mix(T.ANOM, 0.8) : T.ui(0.7), 1);
    }
    var th = ballPlane(t);
    T.textPIL(ctx, 'θ = (' + (th[0] >= 0 ? '+' : '') + th[0].toFixed(2) + ', ' + (th[1] >= 0 ? '+' : '') + th[1].toFixed(2) + ')',
      900, 472, T.css(T.mix(T.ME_TEXT, 0.95)), 18);
    T.textMono(ctx, 'loss = ' + (surfaceZ(th[0], th[1]) + 1.6).toFixed(4), 900, 502, T.ui(0.7), 16);
  };
})();

/* ---- 镜头 23（travel）：年份从 2026 AD 倒流到 BC + 位置 id + 三个 RoPE 罗盘 ---- */
(function () {
  'use strict';
  var PV = window.PV, T = PV.tui;
  var FB = 0.1587, BEAT = 60 / 130;
  function beatT(k) { return FB + k * BEAT; }
  var T_TRAVEL0 = beatT(110), T_BC = beatT(116.5);
  function travelYear(t) {
    var u = Math.max(0, (t - T_TRAVEL0) / (T_BC - T_TRAVEL0));
    return u < 1 ? Math.round(2026 - 2025 * Math.pow(u, 1.6)) : -Math.floor(1 + 2025 * 1.6 * (u - 1));
  }
  function travelPos(t) { return 2026 - travelYear(t); }
  function ropeAngle(t, i) { var tt = t < T_BC ? t : 2 * T_BC - t; return (tt * 3.0) * (1.8 / (1 + i * 0.9)); }
  PV.travelYear = travelYear;
  PV.travelPos = travelPos;
  PV.shotTravel = function (ctx, t, lt, opts) {
    opts = opts || {};
    PV.ops = ['POS_ID', 'ROPE', 'TIME', 'REWIND', 'AD', 'BC'];
    T.box(ctx, 404, 56, 1164, 604, 'time travel  (position ids)', 0.5, T.UI, t);
    var year = travelYear(t), era = year > 0 ? 'AD' : 'BC';
    var yr = String(Math.abs(year));
    while (yr.length < 5) yr = ' ' + yr;
    var ycol = era === 'BC' ? T.mix(T.ME_TEXT, 1.0) : T.ui(1.0);
    T.textPIL(ctx, yr + ' ' + era, 430, 100, T.css(ycol), 72);
    var pos0 = travelPos(t), i;
    for (i = 0; opts.bars !== false && i < 30; i++) {   /* C24：bar 由转场层接管（要合并、要飞） */
      var pos = Math.floor(pos0) - i * 173, x = 430 + i * 24;
      var hh = 40 + 30 * Math.sin(pos * 0.01);
      T.fill(ctx, x, 380 - hh, x + 19, 381, T.ui(0.3 + 0.02 * i), 1);
    }
    var R = 40;
    for (i = 0; i < 3; i++) {
      var cx = 430 + i * 240 + R + 20, cy = 390 + R + 30, th = ropeAngle(t, i);
      ctx.save();
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, 6.283185);
      ctx.strokeStyle = T.css(T.ui(0.55)); ctx.lineWidth = 2; ctx.stroke();
      ctx.restore();
      T.fill(ctx, cx - R - 6, cy, cx + R + 7, cy + 1, T.ui(0.2), 1);
      T.fill(ctx, cx, cy - R - 6, cx + 1, cy + R + 7, T.ui(0.2), 1);
      var ex = cx + R * Math.cos(th), ey = cy + R * Math.sin(th);
      ctx.save();
      ctx.strokeStyle = T.css(T.mix(T.ME_TEXT, 0.95)); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(ex, ey); ctx.stroke();
      ctx.restore();
      T.fill(ctx, ex - 3, ey - 3, ex + 4, ey + 4, T.mix(T.ME_TEXT, 1.0), 1);
    }
  };
})();

/* ---- 镜头（unite）：tokenizer chips 滚动 + me/you 合并成 we + 嵌入空间汇聚 ---- */
(function () {
  'use strict';
  var PV = window.PV, T = PV.tui;
  var VOCAB = ['the', 'sim', 'love', 'you', 'run', 'void', 'world', 'tangent', 'cat', 'exec', 'only', 'me', 'deep', 'sine',
               'limit', 'point', 'circle', 'stay', 'free', 'god', 'prove', 'whale', 'sea', 'light', 'happy'];
  PV.VOCAB = VOCAB;
  function heat(ctx, x, y, w, h, v, col) {
    v = T.clamp01(v);
    T.fill(ctx, x, y, x + w - 1, y + h - 1, T.mix(col || T.UI, 0.06 + 0.94 * v), 1);
  }
  PV.heatCell = heat;
  PV.shotUnite = function (ctx, t, lt, dur, opts) {
    opts = opts || {};
    PV.ops = ['TOKENIZE', 'BPE.MERGE', 'EMBED', 'LOOKUP', 'RMSNORM', 'COSINE', 'PROJECT', 'TSNE.STEP'];
    T.box(ctx, 404, 56, 1164, 300, 'tokenizer', 0.5, T.UI, t);
    for (var row = 0; row < 2; row++) {
      var y = 80 + row * 170;
      var xoff = -((t * (70 + 30 * row)) % 90);
      for (var k = 0; k < 12; k++) {
        var wd = VOCAB[(k * 7 + row * 3 + Math.floor(t * 2)) % VOCAB.length];
        var x = 420 + k * 90 + xoff;
        if (x > 410 && x < 1100) {
          if (opts.chip && !opts.chip(row, k + Math.floor((t * (70 + 30 * row)) / 90))) continue;
          T.rect(ctx, x, y, x + 70, y + 22, T.ui(0.18), 1, 1);
          T.textMono(ctx, wd, x + 6, y + 3, T.ui(0.3), 15);
        }
      }
    }
    var m = T.ease((lt - 0.3) / (dur * 0.62));
    var cx = 784;
    if (m < 0.98) {
      var L1 = [['me', 430, T.ME_TEXT], ['you', 1060, T.UI]];
      for (var pi = 0; pi < 2; pi++) {
        var label = L1[pi][0], xf = L1[pi][1], col = L1[pi][2];
        var x2 = (label === 'me') ? (xf + (cx - 45 - xf) * m) : (xf + (cx + 5 - xf) * m);
        T.fill(ctx, x2, 150, x2 + 81, 197, T.mix(col, 0.2), 1);
        T.rect(ctx, x2, 150, x2 + 80, 196, T.mix(col, 0.95), 1, 1);
        T.textPIL(ctx, label, x2 + 10, 156, T.css(T.mix(col, 1.0)), 26);
        T.textMono(ctx, 'id ' + T.tokenId(label), x2 + 8, 202, T.mix(col, 0.6), 12);
      }
    } else {
      var r = 30 + 60 * PV.pulse(t);
      T.ring(ctx, cx, 173, r, T.ui(0.5), 1, 1);
      T.fill(ctx, cx - 50, 150, cx + 51, 197, T.ui(0.95), 1);
      T.textPIL(ctx, 'we', cx - 18, 156, T.css(T.BG), 26);
      T.textMono(ctx, 'merge -> id ' + T.tokenId('we'), cx - 34, 202, T.ui(0.8), 12);
    }
    T.box(ctx, 404, 320, 1164, 604, 'embedding space  (t-SNE of d=4096)', 0.5, T.UI, t + 0.3);
    var rnd = PV.mt(11);
    for (var i = 0; i < 240; i++) {
      var bx = 424 + rnd.random() * 720, by = 340 + rnd.random() * 250;
      var px = bx + 7 * Math.sin(t * 0.8 + i), py = by + 6 * Math.cos(t * 0.9 + i * 1.3);
      var lv = 0.18 + 0.25 * rnd.random();
      T.fill(ctx, px, py, px + 2, py + 2, T.ui(lv), 1);
      if (i % 24 === 0) T.textMono(ctx, VOCAB[i % VOCAB.length], px + 4, py - 6, T.ui(0.35), 11);
    }
    var mx = 784, my = 468;
    var pa = [470 + (mx - 470) * m, 360 + (my - 360) * m];
    var pb = [1110 + (mx - 1110) * m, 580 + (my - 580) * m];
    T.dot(ctx, pa[0], pa[1], 5, T.mix(T.ME_TEXT, 1.0), 1);
    T.dot(ctx, pb[0], pb[1], 5, T.ui(1.0), 1);
    for (var q2 = 0; q2 < 20; q2++) {
      var u = q2 / 20 * m;
      T.fill(ctx, 470 + (mx - 470) * u, 360 + (my - 360) * u, 472 + (mx - 470) * u, 362 + (my - 360) * u, T.mix(T.ME_TEXT, 0.5), 1);
      T.fill(ctx, 1110 + (mx - 1110) * u, 580 + (my - 580) * u, 1112 + (mx - 1110) * u, 582 + (my - 580) * u, T.ui(0.5), 1);
    }
    var cos = 0.412 + (0.9999 - 0.412) * Math.pow(m, 0.8);
    T.textPIL(ctx, 'cos(me, you) = ' + cos.toFixed(4), 430, 572, T.ui(0.95), 20);
  };
})();

/* ---- 镜头（deeply）：43 层前向传播滚动 ---- */
(function () {
  'use strict';
  var PV = window.PV, T = PV.tui;
  var BEAT = 60 / 130, OPS = ['RMSNorm', 'CSA/HCA', 'mHC', 'RMSNorm', 'MoE 256e/6a', 'mHC'];
  function p2(n) { var s = String(n); return s.length < 2 ? '0' + s : s; }
  PV.shotDeeply = function (ctx, t, lt, dur) {
    PV.ops = ['RMSNORM', 'CSA', 'HCA', 'INDEXER', 'TOP-512', 'SOFTMAX', 'MHC.MIX', 'SINKHORN', 'RMSNORM',
              'ROUTER', 'TOPK=6', 'EXPERT.FFN', 'SHARED.FFN', 'MHC.MIX'];
    var half = dur / 2, k = lt < half ? 0 : 1;
    var depth = 1 + 42 * (0.5 * k + 0.5 * T.ease((lt - k * half) / (half * 0.75)));
    var layer = Math.max(1, Math.min(43, Math.floor(depth)));
    /* continuity_chorus_v1/continuity.py body_image(): 非 FULL 镜头的中窗格内容纵向压缩 478/548 */
    if (PV.centerBegin) PV.centerBegin(ctx, t);
    T.box(ctx, 404, 56, 1164, 604, 'forward pass   layer ' + p2(layer) + '/43', 0.5, T.UI, t);
    var CT = 70, CB = 596, BH = 96, XS = 440, scroll = depth * BH - 250;
    T.fill(ctx, XS, CT, XS + 1, CB, T.ui(0.35), 1);
    for (var i = 0; i < 12; i++) {
      var py = CT + ((t * 380 + i * 44) % (CB - CT));
      T.fill(ctx, XS - 2, py, XS + 3, py + 8, T.mix(T.ME_TEXT, 0.9), 1);
    }
    var active = Math.floor(lt / (BEAT / 4)) % OPS.length;
    for (var n = 1; n < 44; n++) {
      var y = 70 + n * BH - scroll;
      if (y < CT - 80 || y > CB) continue;
      var cur = n === layer, lv = cur ? 0.95 : 0.35;
      var yy0 = Math.max(CT, y), yy1 = Math.min(CB, y + BH - 16);
      if (yy1 <= yy0) continue;
      T.rect(ctx, 460, yy0, 880, yy1, T.ui(lv), 1, 1);
      if (y >= CT) T.textMono(ctx, 'layer ' + p2(n), 470, y + 6, T.ui(lv), 13);
      var x = 470;
      for (var j = 0; j < OPS.length; j++) {
        var tw = T.twMono(OPS[j], 13) + 12, oy = y + 30;
        if (oy > CT && oy < CB - 20) {
          if (cur && j === active) {
            T.fill(ctx, x, oy, x + tw + 1, oy + 21, T.ui(0.95), 1);
            T.textMono(ctx, OPS[j], x + 6, oy + 2, T.css(T.BG), 13);
          } else {
            T.rect(ctx, x, oy, x + tw, oy + 20, T.ui(lv * 0.8), 1, 1);
            T.textMono(ctx, OPS[j], x + 6, oy + 2, T.ui(lv), 13);
          }
        }
        x += tw + 6;
      }
      var vy = y + 58;
      if (vy > CT && vy < CB - 10) {
        var rr = PV.mt(cur ? (n * 31 + Math.floor(t * 12)) : (n * 31));
        for (var q = 0; q < 34; q++) PV.heatCell(ctx, 470 + q * 12, vy, 12, 12, rr.random(), cur ? T.ME_HI : T.UI);
      }
    }
    var fx = 910, fy = 80;
    T.textMono(ctx, 'heads @ L' + p2(layer) + '  (V4.1-Flash)', fx, fy - 4, T.ui(0.6), 13);
    for (var hh = 0; hh < 24; hh++) {
      var hx = fx + (hh % 4) * 62, hy = fy + 20 + Math.floor(hh / 4) * 62;
      var r2 = PV.mt(layer * 131 + hh), focus = r2.randrange(6);
      for (var ai = 0; ai < 6; ai++) {
        for (var aj = 0; aj <= ai; aj++) {
          var v = 0.15 + 0.85 * Math.exp(-Math.abs(aj - focus) * 0.9) * (0.6 + 0.4 * Math.sin(t * 6 + hh + ai));
          PV.heatCell(ctx, hx + aj * 9, hy + ai * 9, 9, 9, v, T.UI);
        }
      }
    }
    T.textPIL(ctx, 'L' + p2(layer), fx, 470, T.ui(0.95), 64);
    T.textMono(ctx, 'attn(me -> you) = 1.000', fx, 552, T.css(T.mix(T.ME_TEXT, 0.9)), 15);
    if (PV.centerEnd) PV.centerEnd(ctx);
    if (PV.retained) PV.retained(ctx, t, 'shot_deeply', lt, T.clamp01(lt / dur));
  };
})();
