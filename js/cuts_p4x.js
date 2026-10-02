/* cuts_p4x.js —— 73.5 - 110.5 s 的转场 C34-C47（逐段移植 continuity_full_v2 的 Python 权威）
   s_deploy.py   C34(519) C35(620) C36(644) C37(677) C38(708) C39(754) C40(778) C41(816)
                 C42(864) C43(912) C44(963) C45(1016)
   s_userleft.py C46(217) C47(362)

   镜头画面由 scene_p2a.js 提供：34-38 的 hook 走 PV.p2aA_hooks 对象，39-43 走第 6 个形参
   （PV.p2aB_shot_* 同签名）。44-47 的镜头（role/trance/feel_you/completion）没有 hook 形参，
   本文件自带 trance / feel_you / completion 的等价绘制（逐行照抄 scene_p2a.js），只在自己窗口内使用；
   shot_role 少的那几个 hook 用「擦掉多画的东西」补齐（见 C44）。

   唯一一处越界：Python 的 chrome 有两处收进 shell staging —— 合唱黑场（C34 的窗口起点就是第 1759 帧）
   和 SHELL = {"shot_god": "ps -ef --forest"}（s_deploy.py:30）—— 而 frame.js 读的是 PV.stateAt，
   表里没有这两条。这里把 PV.stateAt 包一层（窗口外原样转发，幂等）。 */
(function () {
  'use strict';
  var PV = window.PV, T = PV.tui;
  var W = 1280, H = 720, FPS = 24, BEAT = 60 / 130, FB = 0.1587;
  var LEFT = [24, 56, 384, 604], PANE = [405, 44, 1164, 604];
  var WHITE = [235, 240, 255];

  /* ---------------------------------------------------------------- 基础工具（kit.py / tuikit 语义） */
  function clamp01(u) { return u < 0 ? 0 : (u > 1 ? 1 : u); }
  function eIn(u) { return T.ease_in(u); }
  function eOut(u) { return T.ease_out(u); }
  function eIo(u) { return T.ease_io(u); }
  function eBack(u, s) { s = s === undefined ? 1.2 : s; u = clamp01(u) - 1; return 1 + (s + 1) * u * u * u + s * u * u; }
  function lerp(a, b, u) { return a + (b - a) * u; }
  function mixc(a, b, u) {
    u = clamp01(u);
    return [Math.round(a[0] + (b[0] - a[0]) * u), Math.round(a[1] + (b[1] - a[1]) * u),
            Math.round(a[2] + (b[2] - a[2]) * u)];
  }
  function amb(lv) { return T.mix(T.UI, lv); }
  function anom(lv) { return T.mix(T.ANOM, lv); }
  function blue(lv) { return T.mix(T.ME_TEXT, lv); }
  function red(lv) { return T.mix(T.ERR, lv); }
  function beatT(k) { return FB + k * BEAT; }
  function beatOf(t) { return (t - FB) / BEAT; }
  /* kit.bezier：控制点在中点 + (dy,-dx)*bend */
  function bez(p0, p1, bend, u) {
    var mx = (p0[0] + p1[0]) / 2, my = (p0[1] + p1[1]) / 2;
    var dx = p1[0] - p0[0], dy = p1[1] - p0[1];
    var cx = mx + dy * bend, cy = my - dx * bend, a = 1 - u;
    return [a * a * p0[0] + 2 * a * u * cx + u * u * p1[0], a * a * p0[1] + 2 * a * u * cy + u * u * p1[1]];
  }
  /* s_deploy.snap：85% 前 ease_io 到位，然后过冲一点锁死 */
  function snap(u, over) {
    over = over === undefined ? 0.05 : over; u = clamp01(u);
    if (u < 0.85) return eIo(u / 0.85);
    return 1 + over * Math.sin(Math.PI * clamp01((u - 0.85) / 0.15));
  }
  function segDist(x, y, a, b) {
    var dx = b[0] - a[0], dy = b[1] - a[1];
    var u = clamp01(((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy));
    return Math.hypot(x - (a[0] + u * dx), y - (a[1] + u * dy));
  }
  function mk() { return PV.newCanvas(W, H); }
  function newCtx() { var c = mk(); return [c, c.getContext('2d')]; }
  /* 只把一小块重画成舞台背景（PIL 的 paste(bg.crop(rect)) 等价物） */
  function bgPatch(ctx, x0, y0, x1, y1, t) {
    x0 = Math.floor(x0); y0 = Math.floor(y0); x1 = Math.ceil(x1); y1 = Math.ceil(y1);
    T.fill(ctx, x0, y0, x1, y1, T.BG, 1);
    var off = Math.floor(t * 12) % 16;
    ctx.fillStyle = T.css(T.mix(T.UI, 0.1));
    for (var sy = -off; sy < H + 16; sy += 16) {
      if (sy < y0 || sy > y1 - 1) continue;
      for (var x = Math.floor(x0 / 16) * 16; x < x1; x += 16) if (x >= x0) ctx.fillRect(x, sy, 1, 1);
    }
  }

  /* ---------------------------------------------------------------- 文字（PIL 锚点 / mono） */
  var _mg = null;
  function mcg() { if (!_mg) _mg = PV.newCanvas(8, 8).getContext('2d'); return _mg; }
  function measure(s, size, mono, bold) {
    if (mono) return T.twMono(s, size);
    var g = mcg(); g.save(); g.font = T.font(size, bold); var w = g.measureText(s).width; g.restore();
    return w;
  }
  /* 画在 (x,y) 的「绘制原点」上（PIL d.text 的上左锚点） */
  function mono(ctx, s, x, y, col, size) { T.textMono(ctx, s, x, y, col, size); }
  function pil(ctx, s, x, y, col, size, bold) { T.textPIL(ctx, s, x, y, col, size, 'left', bold); }
  function typedPil(ctx, s, x, y, col, size, age, rate, bold, rng) {
    if (age === null || age === undefined) { pil(ctx, s, x, y, col, size, bold); return; }
    pil(ctx, T.decode(s, age, rng || PV.rngFor(0, 7919), rate === undefined ? 45 : rate, 0.12, 0), x, y, col, size, bold);
  }
  function typedMono(ctx, s, x, y, col, size, age, rate, rng) {
    if (age === null || age === undefined) { mono(ctx, s, x, y, col, size); return; }
    mono(ctx, T.decode(s, age, rng || PV.rngFor(0, 7919), rate === undefined ? 45 : rate, 0.12, 0), x, y, col, size);
  }
  /* 载体的字形中心 = 绘制原点 + 紧凑包围盒中心（kit.text_sprite 的 ca/cb） */
  function textCentre(s, x, y, size, mono_, bold) {
    if (mono_) return [x + T.twMono(s, size) / 2, y + 0.42 * size];
    return [x + measure(s, size, false, bold) / 2, y + 0.62 * size];
  }
  /* 把一串字形的中心放在 (cx,cy) */
  function centreText(ctx, s, cx, cy, col, size, opt) {
    opt = opt || {};
    var a = opt.alpha === undefined ? 1 : opt.alpha;
    if (a <= 0.01 || size < 4) return;
    var c = typeof col === 'string' ? col : T.css(col);
    if (opt.lift > 0) c = T.css(mixc(typeof col === 'string' ? T.UI : col, WHITE, opt.lift));
    ctx.save();
    if (a < 0.999) ctx.globalAlpha = a;
    if (opt.halo > 0.01) { ctx.shadowColor = T.css(blue(1.0)); ctx.shadowBlur = 12 * opt.halo; }
    if (opt.mono) {
      T.textMono(ctx, s, cx - T.twMono(s, size) / 2, cy - 0.415 * size, c, size);
    } else {
      ctx.font = T.font(size, opt.bold);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = c;
      ctx.fillText(s, cx, cy);
    }
    ctx.restore();
  }
  /* kit.text_at：以 xy 为绘制原点、围绕中心缩放 */
  function textAt(ctx, s, x, y, col, size, opt) {
    opt = opt || {};
    var sc = opt.scale === undefined ? 1 : opt.scale;
    var c = textCentre(s, x, y, size, opt.mono, opt.bold);
    centreText(ctx, s, c[0], c[1], col, size * sc,
               { mono: opt.mono, bold: opt.bold, alpha: opt.alpha, halo: opt.halo, lift: opt.lift });
  }
  /* s_deploy.fly_text：载体从 A 的绘制原点沿弧线飞到 B 的绘制原点；最后 30% 交叉淡入 B 的字形 */
  function flyText(ctx, s, fa, xa, fb, xb, u, opt) {
    opt = opt || {};
    var bend = opt.bend === undefined ? 0.2 : opt.bend;
    var big = opt.big === undefined ? 1 : opt.big;
    var sb = opt.sb || s;
    var ca = textCentre(s, xa[0], xa[1], fa.size, fa.mono, fa.bold);
    var cb = textCentre(sb, xb[0], xb[1], fb.size, fb.mono, fb.bold);
    var pos = bez(ca, cb, bend, u);
    var uc = clamp01(u), k = fb.size / fa.size;
    var sc = lerp(1, k, uc) * (1 + (big - 1) * Math.sin(Math.PI * uc));
    var q = clamp01((uc - 0.7) / 0.3);
    centreText(ctx, s, pos[0], pos[1], fa.col, fa.size * sc,
               { mono: fa.mono, bold: fa.bold, alpha: 1 - q, halo: opt.halo, lift: opt.lift });
    if (q > 0) centreText(ctx, sb, pos[0], pos[1], fb.col, fb.size * sc / k, { mono: fb.mono, bold: fb.bold, alpha: q });
  }
  /* kit.haloed + kit.place 的等价物：把一张精灵以中心放在 (cx,cy) */
  function placeSprite(ctx, sp, cx, cy, alpha, halo, scale) {
    scale = scale === undefined ? 1 : scale;
    if (alpha !== undefined && alpha <= 0.01) return;
    var w = Math.max(1, Math.round(sp.width * scale)), h = Math.max(1, Math.round(sp.height * scale));
    ctx.save();
    if (alpha !== undefined && alpha < 0.999) ctx.globalAlpha = clamp01(alpha);
    if (halo > 0.01) { ctx.shadowColor = T.css(blue(1.0)); ctx.shadowBlur = 12 * halo; }
    ctx.drawImage(sp, Math.round(cx - w / 2), Math.round(cy - h / 2), w, h);
    ctx.restore();
  }
  /* kit.ink：把 rect 内的画面抠成「墨」（舞台背景被扣掉），返回 rect 大小的画布 */
  function inkCanvas(src, t, rect) {
    var x0 = Math.round(rect[0]), y0 = Math.round(rect[1]);
    var w = Math.round(rect[2] - rect[0]), h = Math.round(rect[3] - rect[1]);
    var out = PV.newCanvas(w, h), g = out.getContext('2d');
    var bgc = PV.newCanvas(w, h), bg2 = bgc.getContext('2d');
    if (PV.drawBackground) { bg2.save(); bg2.translate(-x0, -y0); PV.drawBackground(bg2, t); bg2.restore(); }
    g.drawImage(src, x0, y0, w, h, 0, 0, w, h);
    var d = g.getImageData(0, 0, w, h), b = bg2.getImageData(0, 0, w, h);
    var dd = d.data, bd = b.data, i, o;
    for (i = 0; i < w * h; i++) {
      o = i * 4;
      var dr = Math.abs(dd[o] - bd[o]), dg = Math.abs(dd[o + 1] - bd[o + 1]), db = Math.abs(dd[o + 2] - bd[o + 2]);
      var mx = Math.max(dr, Math.max(dg, db));
      dd[o + 3] = mx < 12 ? 0 : Math.min(255, (mx - 12) * 5);
    }
    g.putImageData(d, 0, 0);
    return out;
  }

  /* ---------------------------------------------------------------- 镜头调用（等价 C.body / PV.scene 的分派语义） */
  function shotDef(name) {
    for (var i = 0; i < PV.SHOTS.length; i++) if (PV.SHOTS[i].name === name) return PV.SHOTS[i];
    return null;
  }
  /* Python：te = max(shot.start, t - DELAY)；lt/u/dur 都从 te 起算（镜头可以画过自己的结尾） */
  function shotLT(name, t) {
    var s = shotDef(name);
    if (!s) return null;
    var d = (PV.SHOT_DELAY && PV.SHOT_DELAY[name]) || 0;
    var a = Math.min(t, s.a + d), lt = Math.max(0, t - a), dur = s.b - a;
    return { s: s, lt: lt, dur: dur, u: dur > 0 ? clamp01(lt / dur) : 0 };
  }
  function drawShot(ctx, name, t, hook, aHooks) {
    var q = shotLT(name, t);
    if (!q || !q.s.fn) return;
    var old = PV.p2aA_hooks;
    try {
      PV.p2aA_hooks = aHooks === undefined ? null : aHooks;
      q.s.fn(ctx, t, q.lt, q.u, q.dur, hook || null);
    } finally { PV.p2aA_hooks = old; }
  }

  /* ---------------------------------------------------------------- 场景常量（scenes_deploy.py / scenes_userleft.py） */
  var GEN = [440, 110, 1100, 530];                       /* 营养表 == 生成器画布 */
  var NUTR_HEAD = [452, 66];
  var PROMPT_XY = [440, 72], PROMPT = 'generate("a tomato", seed=me, for=';
  var CHAIN_N = 22;
  var GOD_ROOT = [430, 84], GOD_TY = 96;                 /* C40.TY = GOD_ROOT[1] + 12 */
  var GOAL_XY = [450, 344], WIT_XY = [450, 312], INFO = [430, 250, 1140, 580];
  var ENC_Y = 234, LETTERS = 'you';
  var FMT_T = [beatT(194.5), beatT(196.5)];
  var DIALC = [640, 320], DIAL_RR = 170, DIAL_R = 200;
  var PEAKS = [[9, 12], [14, 18]];
  var MS_XY = [430, 480];
  var PURR_TITLE = [430, 74];
  var SPIRAL_C = [784, 320];
  var N281 = [430, 322];
  var SEL = 0;                                           /* 活到最后的那格 'you'（scenes_userleft.SEL） */

  function nutrRowY(i) { return GEN[1] + 10 + i * 52; }
  function youXY() { return [780, nutrRowY(7)]; }
  function promptYouXY() { return [PROMPT_XY[0] + T.twMono(PROMPT, 20), PROMPT_XY[1]]; }
  function chainPts(t) {
    var rot = t * 0.8, out = [];
    for (var i = 0; i < CHAIN_N; i++) out.push([470 + i * 30, 250 + (i % 2 ? 30 : -30) * Math.cos(rot + i * 0.3)]);
    return out;
  }
  function godRowXY(i) { return [460, 124 + i * 44]; }
  function proofYouXY() { return [450 + T.twMono('proof term: ', 22), 340]; }
  function purr281XY() { return [PURR_TITLE[0] + T.twMono('class ', 22), PURR_TITLE[1]]; }
  function boxX(i) { return 440 + i * 84; }
  function bitsOf(k) {
    var v = LETTERS.charCodeAt(k), o = [];
    for (var i = 0; i < 8; i++) o.push((v >> (7 - i)) & 1);
    return o;
  }
  function fieldChars(k) {
    var e = [4, 5, 8][k], m = [3, 2, 0][k], o = [], i;
    if (k < 2) o.push('S');
    for (i = 0; i < e; i++) o.push('E');
    for (i = 0; i < m; i++) o.push('M');
    return o;
  }
  /* sec_verse2.shape_bits("tomato", n, n) + tuikit.tile_from_lum(..., 6, "amber") */
  var _sbits = {}, _ticon = {};
  function shapeBits(kind, w, h) {
    var key = kind + w + 'x' + h;
    if (_sbits[key]) return _sbits[key];
    var s = 8, cw = w * s, ch = h * s;
    var cv = PV.newCanvas(cw, ch), g = cv.getContext('2d');
    function gray(v) { return 'rgb(' + v + ',' + v + ',' + v + ')'; }
    g.fillStyle = gray(0); g.fillRect(0, 0, cw, ch);
    if (kind === 'tomato') {
      g.fillStyle = gray(200);
      g.beginPath(); g.ellipse(cw * 0.5, ch * 0.61, cw * 0.4, ch * 0.31, 0, 0, Math.PI * 2); g.fill();
      for (var k = 0; k < 5; k++) {
        var a = k / 5 * Math.PI * 2 - Math.PI / 2;
        g.fillStyle = gray(255);
        g.beginPath();
        g.moveTo(cw * 0.5, ch * 0.33);
        g.lineTo(cw * (0.5 + 0.28 * Math.cos(a - 0.3)), ch * (0.33 + 0.1 * Math.sin(a)));
        g.lineTo(cw * (0.5 + 0.34 * Math.cos(a)), ch * (0.31 + 0.12 * Math.sin(a)));
        g.closePath(); g.fill();
      }
      g.fillStyle = gray(255);
      g.fillRect(Math.round(cw * 0.47), Math.round(ch * 0.18),
                 Math.round(cw * 0.53) - Math.round(cw * 0.47) + 1, Math.round(ch * 0.33) - Math.round(ch * 0.18) + 1);
      g.beginPath(); g.ellipse(cw * 0.33, ch * 0.515, cw * 0.05, ch * 0.065, 0, 0, Math.PI * 2); g.fill();
    }
    var out = PV.newCanvas(w, h), og = out.getContext('2d');
    og.imageSmoothingEnabled = true;
    try { og.imageSmoothingQuality = 'high'; } catch (e) {}
    og.drawImage(cv, 0, 0, cw, ch, 0, 0, w, h);
    var d = og.getImageData(0, 0, w, h).data, lum = new Float32Array(w * h);
    for (var i = 0; i < w * h; i++) lum[i] = d[i * 4];
    _sbits[key] = lum;
    return lum;
  }
  function colorize(l, lo, hi) {
    l = clamp01(l);
    return [Math.round(lo[0] + (hi[0] - lo[0]) * l), Math.round(lo[1] + (hi[1] - lo[1]) * l),
            Math.round(lo[2] + (hi[2] - lo[2]) * l)];
  }
  /* SD.tomato_icon(cols)：cols x cols 的番茄剪影，每格 6 px，amber */
  function tomatoIcon(cols) {
    if (_ticon[cols]) return _ticon[cols];
    var lum = shapeBits('tomato', cols, cols), px = 6, w = cols * px, h = cols * px;
    var c = PV.newCanvas(w, h), g = c.getContext('2d');
    for (var r = 0; r < cols; r++) for (var q = 0; q < cols; q++) {
      var v = lum[r * cols + q];
      if (v <= 18) continue;
      var col = colorize(v / 255, T.BG, T.UI), x0 = q * px, y0 = r * px;
      g.fillStyle = T.css(col, 1); g.fillRect(x0, y0, px - 1, px - 2);
      g.fillStyle = T.css(col, (r % 2 === 1) ? 70 / 255 : 1);
      g.fillRect(x0, y0 + px - 2, px - 1, 1);
    }
    _ticon[cols] = c;
    return c;
  }

  /* ---------------------------------------------------------------- chrome：合唱黑场 + shot_god 的 shell staging
     Python：C34 的窗口起点 = 合唱变黑的第 1759 帧（kit.chrome(..., retract=1)）；s_deploy.py:30
     SHELL = {"shot_god": "ps -ef --forest"}（v2.retract_at 的公式：ease_out 进 / ease_io 出）。 */
  var C34_T = 73.543, C34_PRE = C34_T - 1759 / FPS + 1e-4, C34_POST = 0.62;
  var C34_U = beatT(159.5), C34_LAND = beatT(160);
  var C34_XY = [40, 320], C34_F = 28, ROLE_TXT = '  role=deploy';
  var GOD_A = 84.620, GOD_B = 86.236;
  /* C34 的黑场从窗口起点开始（合唱第 1759 帧 = C34_T - C34_PRE）；UI 逐格展开时 chrome 也跟着
     一层层回来（Python 里它就在 reveal 的两张图里）。逐格时刻算不出来（chrome 不归本文件画），
     用窗口内共同的时间斜坡近似：展开从文字行出发，左窗格 ~U+0.05、顶栏 U+0.06..0.30、ops 列 ~U+0.34。 */
  var C34_W0 = C34_T - C34_PRE, C34_CR0 = C34_U + 0.05, C34_CR1 = C34_U + 0.34;
  (function () {
    var base = PV.stateAt;
    if (typeof base !== 'function' || base.__p4x) return;
    var wrapped = function (t) {
      if (t >= C34_W0 && t < C34_CR0) return { retract: 1, shell: null };
      if (t >= C34_CR0 && t < C34_CR1) return { retract: 1 - clamp01((t - C34_CR0) / (C34_CR1 - C34_CR0)), shell: null };
      if (t >= GOD_A && t < GOD_B + 0.35) {
        var r = eOut((t - GOD_A) / 0.3);
        if (t >= GOD_B) r *= 1 - eIo((t - GOD_B) / 0.3);
        return { retract: r, shell: 'ps -ef --forest' };
      }
      return base(t);
    };
    wrapped.__p4x = 1;
    PV.stateAt = wrapped;
  })();

  /* ================================================================ C34  strange -> eggplant（UNFOLD）
     T=73.543 pre=T-1759/FPS+1e-4 post=0.62；U=beat159.5（从文字行逐格展开）LAND=beat160（落进标题） */
  function c34Parts(t) {
    if (t < C34_T) return { a: 'sim.state = ', b: 'TRAPPED', col: red(0.95), cur: red(0.9), typed: 0 };
    var k = clamp01((t - C34_T) / (3 / FPS));
    var rnd = PV.mt(Math.trunc(t * FPS)), word = '', j;
    for (j = 0; j < 7; j++) word += (t - C34_T > 0.03 + j * 0.013) ? 'RUNNING'.charAt(j) : rnd.choice(T.SCR);
    var col = mixc(red(0.95), amb(1.0), k);
    var typed = Math.trunc(clamp01((t - (C34_T + 2 / FPS)) / (3 / FPS)) * ROLE_TXT.length);
    return { a: 'sim.state = ', b: word, col: col, cur: amb(0.95), typed: typed };
  }
  function c34Line(t) {
    var p = c34Parts(t);
    var x = C34_XY[0] + T.twMono(p.a, C34_F) + T.twMono(p.b, C34_F);
    return { p: p, x: x, roleX: x + T.twMono('  ', C34_F),
             lift: t < C34_U + 0.1 ? clamp01((t - (C34_U - 2 / FPS)) / (2 / FPS)) : 0 };
  }
  function c34DrawOld(c, tt) {
    var ln = c34Line(tt), p = ln.p, x = C34_XY[0];
    var col = ln.lift > 0 ? mixc(p.col, WHITE, 0.5 * ln.lift) : p.col;
    mono(c, p.a, x, C34_XY[1], col, C34_F); x += T.twMono(p.a, C34_F);
    mono(c, p.b, x, C34_XY[1], col, C34_F); x += T.twMono(p.b, C34_F);
    if (p.typed && tt < C34_U) mono(c, ROLE_TXT.slice(0, p.typed), x, C34_XY[1], blue(1.0), C34_F);
    if (tt < C34_U) {
      var cx = x + (p.typed ? T.twMono(ROLE_TXT.slice(0, p.typed), C34_F) : 0) + 8;
      if (tt < C34_T) cx = 380;
      if (Math.trunc(tt * 6) % 2 === 0 || C34_T <= tt) T.fill(c, cx, 324, cx + 15, 355, p.cur, 1);
    }
    return ln;
  }
  function c34TitleSlot(t) {
    var pre = ' ' + '|/-\\'.charAt(Math.trunc(t * 8) % 4) + ' /dev/me  ';
    return [[LEFT[0] + 12 + measure(pre, 13, false, false), LEFT[1] - 10], measure('role=deploy', 13, false, false)];
  }
  PV.addCut(C34_T, C34_PRE, C34_POST, function (ctx, t, cut) {
    var U = C34_U, LAND = C34_LAND;
    if (t < U) { c34DrawOld(ctx, t); return; }
    var ln = c34Line(t);
    var seg = [[C34_XY[0], 334], [ln.roleX - 10, 334]];
    PV.reveal(ctx, t,
      function (c, tt) { c34DrawOld(c, tt); },
      function (c, tt) { drawShot(c, 'shot_eggplant', tt, null, null); },
      function (px, py) { return U + segDist(px, py, seg[0], seg[1]) / 2600 * (px < LEFT[2] + 8 ? 0.45 : 1.0); },
      { region: [0, 0, W, H], cell: [8, 16], dur: 0.07 });
    var k = clamp01((t - U) / 0.25);
    if (k < 1) {                                   /* UI 从中缝打开的那道扫描线 */
      var half = lerp(200, 700, eOut(k)), mx = (seg[0][0] + seg[1][0]) / 2;
      ctx.save();
      ctx.globalAlpha = 220 * (1 - k) / 255;
      ctx.strokeStyle = T.css(WHITE);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(Math.max(0, mx - half), 335.5);
      ctx.lineTo(Math.min(W, mx + half), 335.5);
      ctx.stroke();
      ctx.restore();
    }
    if (t < LAND + 0.1) {                          /* role=deploy 飞进她的窗格标题 */
      var u = clamp01((t - U) / (LAND - U)), ts = c34TitleSlot(t);
      flyText(ctx, 'role=deploy', { size: 28, col: blue(1.0), mono: true },
              [ln.roleX, C34_XY[1]], { size: 13, col: amb(0.85), mono: false, bold: false }, ts[0],
              snap(u), { bend: -0.18, halo: 0.8 * (1 - u), lift: 0.3 * (1 - u) });
    }
  });

  /* ================================================================ C35  eggplant -> nutrients（CARRY） */
  var T35 = 75.389, C35_LAND = T35 + BEAT;
  PV.addCut(T35, 0.3, 0.62, function (ctx, t, cut) {
    var land = C35_LAND, lift = clamp01((t - (T35 - 0.25)) / 0.2);
    PV.reveal(ctx, t,
      function (c, tt) { drawShot(c, 'shot_eggplant', tt, null, { me_line: tt < T35 - 0.25 }); },
      function (c, tt) { drawShot(c, 'shot_nutrients', tt, null, { head: tt >= land }); },
      PV.inward(560, 438, T35 - 0.22, T35 + 0.18, 820));
    if (t >= T35 - 0.25 && t < land + 0.1) {
      var u = clamp01((t - T35) / (land - T35));
      flyText(ctx, 'me := eggplant', { size: 34, col: blue(1.0), mono: false },
              [430, 420], { size: 30, col: blue(1.0), mono: false }, NUTR_HEAD, snap(u),
              { bend: 0.22, halo: 0.9 * lift * (1 - u), lift: 0.35 * lift * (1 - u) });
    }
  });

  /* ================================================================ C36  nutrients -> tomato（CARRY + MORPH）
     表格在原地重量化成生成器的第一帧（同一矩形、6 px 格），从 'you' 离开的地方扩散开 */
  var T36 = 77.236, C36_LAND = beatT(beatOf(T36) + 0.5);
  var _lum36 = null;
  function tableLum() {
    if (_lum36) return _lum36;
    var tt = T36 - 0.01, c = mk(), g = c.getContext('2d');
    if (PV.drawBackground) PV.drawBackground(g, tt);
    drawShot(g, 'shot_nutrients', tt, null, { you: false });
    var w = 110, h = 70, sw = GEN[2] - GEN[0], sh = GEN[3] - GEN[1];
    var d = g.getImageData(GEN[0], GEN[1], sw, sh).data, out = new Float32Array(w * h);
    for (var r = 0; r < h; r++) for (var q = 0; q < w; q++) {
      var sx0 = Math.floor(q * sw / w), sx1 = Math.max(sx0 + 1, Math.floor((q + 1) * sw / w));
      var sy0 = Math.floor(r * sh / h), sy1 = Math.max(sy0 + 1, Math.floor((r + 1) * sh / h));
      var sum = 0, n = 0;
      for (var yy = sy0; yy < sy1; yy++) for (var xx = sx0; xx < sx1; xx++) {
        var o = (yy * sw + xx) * 4;
        sum += 0.299 * d[o] + 0.587 * d[o + 1] + 0.114 * d[o + 2];
        n++;
      }
      out[r * w + q] = Math.min(255, (n ? sum / n : 0) * 3.2);
    }
    _lum36 = out;
    return out;
  }
  PV.addCut(T36, 0.3, 0.45, function (ctx, t, cut) {
    var land = C36_LAND, lift = clamp01((t - (T36 - 0.25)) / 0.2), src = youXY();
    PV.reveal(ctx, t,
      function (c, tt) { drawShot(c, 'shot_nutrients', tt, null, { you: tt < T36 - 0.25 }); },
      function (c, tt) { drawShot(c, 'shot_tomato', tt, null, { prompt_you: tt >= land, from_lum: tableLum() }); },
      PV.radial(src[0] + 20, src[1] + 12, T36 - 0.06, 2600));
    if (t >= T36 - 0.25 && t < land + 0.1) {
      var u = clamp01((t - T36) / (land - T36));
      flyText(ctx, 'you', { size: 20, col: blue(1.0), mono: true }, src,
              { size: 20, col: blue(1.0), mono: true }, promptYouXY(), snap(u),
              { bend: 0.25, halo: 0.9 * lift * (1 - u), lift: 0.4 * lift * (1 - u), big: 1.7 });
    }
  });

  /* ================================================================ C37  tomato -> antioxidants（CARRY）
     生成的番茄逐格缩小、落成番茄红素链的第一个节点 */
  var T37 = 78.851, C37_LAND = T37 + BEAT;
  PV.addCut(T37, 0.3, 0.8, function (ctx, t, cut) {
    var node = chainPts(t)[0];
    PV.reveal(ctx, t,
      function (c, tt) { drawShot(c, 'shot_tomato', tt, null, { tile: tt < T37 }); },
      function (c, tt) { drawShot(c, 'shot_antioxidants', tt, null, null); },
      PV.inward(node[0], node[1], T37 - 0.05, T37 + 0.3, 800));
    if (t >= T37 - 0.2 && t < C37_LAND + 0.02) {
      var lift = clamp01((t - (T37 - 0.2)) / 0.2);
      var u = clamp01((t - T37) / (C37_LAND - T37)), e = eOut(u);
      var cols = Math.max(8, Math.round(lerp(70, 8, e)));
      var pos = bez([GEN[0] + 55 * 6, GEN[1] + 35 * 6], node, 0.18, e);
      placeSprite(ctx, tomatoIcon(cols), pos[0], pos[1], 1, 0.6 * lift * (1 - e));
    }
  });

  /* ================================================================ C38  antioxidants -> tabby（MORPH）
     链上的节点一个个抬起，沿弧线飞到她的头上，在拍点上锁成两只耳三角和六根胡须 */
  var T38 = 80.928;
  /* 她的立绘没有（见 P2A_BRIEF §4）：用 Python 在她 alpha bbox 缺失时的兜底几何
     （fig box = (88,110,328,510)）算耳朵/胡须落点。参考成片里她的窗格被 dsh 聊天窗盖住，
     落点本身看不见，这里只要飞行弧线与时序一致。 */
  var HER_BOX = [88, 110, 328, 510];
  function earTargets(t) {
    var hx = (HER_BOX[0] + HER_BOX[2]) / 2, top = HER_BOX[1], hh = HER_BOX[3] - HER_BOX[1];
    var ears = [], side, j;
    for (side = -1; side <= 1; side += 2) {
      var bx = hx + side * 26;
      ears.push([[bx - 20, top + 18], [bx + 20, top + 18], [bx + side * 14, top - 24]]);
    }
    var fy = top + 0.085 * hh, whisk = [], DYS = [-5, 1, 7];
    for (side = -1; side <= 1; side += 2)
      for (j = 0; j < 3; j++)
        whisk.push([[hx + side * 18, fy + DYS[j]], [hx + side * 52, fy + DYS[j] * 2.2 - 2]]);
    var pts = [], k;
    for (k = 0; k < ears.length; k++) {
      var a = ears[k][0], b = ears[k][1], p = ears[k][2];
      pts.push(a, b, p, [lerp(a[0], p[0], 0.5), lerp(a[1], p[1], 0.5)], [lerp(b[0], p[0], 0.5), lerp(b[1], p[1], 0.5)]);
    }
    for (k = 0; k < whisk.length; k++) {
      var w0 = whisk[k][0], w1 = whisk[k][1];
      pts.push(w1, [lerp(w0[0], w1[0], 0.4), lerp(w0[1], w1[1], 0.4)]);
    }
    pts.sort(function (p1, p2) { return p1[0] - p2[0]; });
    return pts.slice(0, 21);
  }
  function c38Times(i) {
    var land = T38 - 0.04 + 0.004 * i;
    return [land - 0.42 - 0.012 * (i % 4), land];
  }
  function c38Gone(t) {
    return function (i) { return clamp01((t - c38Times(i)[0]) / 0.05); };
  }
  PV.addCut(T38, 0.5, 0.35, function (ctx, t, cut) {
    PV.reveal(ctx, t,
      function (c, tt) { drawShot(c, 'shot_antioxidants', tt, null, { gone: c38Gone(tt) }); },
      function (c, tt) { drawShot(c, 'shot_tabby', tt, null, null); },
      PV.radial(780, 250, T38 - 0.12, 1500));
    if (t < T38 + 0.08) {
      var pts = chainPts(Math.min(t, T38)), tg = earTargets(t);
      var lift = clamp01((t - (T38 - 0.5)) / 0.12), i;
      for (i = 1; i < CHAIN_N; i++) {
        var tm = c38Times(i), td = tm[0], tl = tm[1];
        var x = pts[i][0], y = pts[i][1];
        if (t < td) {
          if (lift > 0) T.ring(ctx, x, y, 10, blue(1.0), 160 * lift / 255, 1);
          continue;
        }
        var u = clamp01((t - td) / (tl - td));
        if (u >= 1 && t > tl + 0.06) continue;
        var pos = bez([x, y], tg[i - 1], i < 11 ? 0.3 : -0.3, eIn(u));
        var r = lerp(7, 3, eIn(u)) * (1 + 0.5 * Math.sin(Math.PI * u));
        var a = u < 1 ? 1 : (1 - (t - tl) / 0.06);
        T.dot(ctx, pos[0], pos[1], r, mixc(amb(0.95), blue(1.0), u), a);
        if (r > 5) T.textMono(ctx, 'C', pos[0] - 4, pos[1] - 8, T.css(T.BG), 12);
      }
    }
  });
})();
