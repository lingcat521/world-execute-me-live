/* cuts_p2.js —— chorus1 段（58.2-73.5s）的转场：C26（deeply -> if_i_can）、C31（happy -> execution）。
   Python 权威：continuity_full_v2/s_chorus1.py（CUTS = {24: C24, 26: C26, 31: C31}；
   C27-C30 / C32-C33 没有注册 => 硬切，不做）。框架在 cuts.js（PV.addCut / PV.reveal / PV.radial / PV.inward）。 */
(function () {
  'use strict';
  var PV = window.PV, T = PV.tui;

  /* 取一个用 PV.reg 注册过的镜头（存在 PV.SHOTS 里） */
  PV.p2ShotInfo = function (name) {
    for (var i = 0; i < PV.SHOTS.length; i++) if (PV.SHOTS[i].name === name) return PV.SHOTS[i];
    return null;
  };
  function camel(name) {
    var p = String(name).split('_'), out = p[0];
    for (var i = 1; i < p.length; i++) out += p[i].charAt(0).toUpperCase() + p[i].slice(1);
    return out;
  }
  /* 用分派器一样的时间语义调用某个镜头；ov 可覆盖 lt/u/dur。
     注册过的（PV.reg）走 s.fn；老的分派链镜头（shot_deeply 等 = PV.shotDeeply）走兜底。 */
  PV.p2Shot = function (name, ctx, t, ov) {
    var s = PV.p2ShotInfo(name);
    var d = (PV.SHOT_DELAY && PV.SHOT_DELAY[name]) || 0;
    var a = s ? s.a : 0, b = s ? s.b : 0;
    var fn = s && s.fn;
    if (!fn) {
      var alt = PV[camel(name)];
      if (typeof alt === 'function') fn = function (c, tt, lt, u, dur) { alt(c, tt, lt, u, dur); };
    }
    if (!fn) return false;
    var a2 = Math.min(t, a + d);
    var lt = Math.max(0, t - a2), dur = b - a2;
    var u = dur > 0 ? T.clamp01(lt / dur) : 0;
    if (ov) {
      if (ov.lt !== undefined) lt = ov.lt;
      if (ov.u !== undefined) u = ov.u;
      if (ov.dur !== undefined) dur = ov.dur;
    }
    fn(ctx, t, lt, u, dur);
    return true;
  };
  PV.p2Ease = {
    io: function (u) { u = T.clamp01(u); return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2; },
    out: function (u) { u = T.clamp01(u); return 1 - Math.pow(1 - u, 3); },
    in: function (u) { u = T.clamp01(u); return u * u * u; },
    back: function (u, s) { u = T.clamp01(u); var c = (s || 1.2) * 1.70158; return 1 + (c + 1) * Math.pow(u - 1, 3) + c * Math.pow(u - 1, 2); }
  };
  /* kit.reveal 的 front 层：正在切换的格子里按 density 概率闪一个解码字形（PV.reveal 只做交叉淡入） */
  var GLYPHS = '01<>/|=+*#%&$?!:;{}[]~^';
  PV.p2Flicker = function (ctx, t, delayFn, region, cell, dur, seed, density) {
    var cw = cell[0], ch = cell[1];
    var cols = Math.floor((region[2] - region[0]) / cw), rows = Math.floor((region[3] - region[1]) / ch);
    var rng = PV.mt(seed * 9973 + Math.floor(t * 24));
    if (density === undefined) density = 0.4;
    ctx.save();
    ctx.font = '700 13px ' + T.FAM;
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    for (var r = 0; r < rows; r++) {
      for (var q = 0; q < cols; q++) {
        var cx = region[0] + q * cw + cw / 2, cy = region[1] + r * ch + ch / 2;
        var p = T.clamp01((t - delayFn(cx, cy)) / dur);
        if (!(p > 0.02 && p < 0.98)) continue;
        var g = rng.choice(GLYPHS);
        if (rng.random() > density) continue;
        var k = 1 - Math.abs(2 * p - 1);
        ctx.fillStyle = T.css(T.mix(T.ME_TEXT, 0.2 + 0.6 * k));
        ctx.fillText(g, region[0] + q * cw, region[1] + r * ch + 12);
      }
    }
    ctx.restore();
  };
  PV.p2Blank = function () { return PV.newCanvas(1280, 720); };
  /* 把离屏画布的一块区域抠成"墨"（背景透明），等价 kit.ink/sharp_ink 的近似 */
  PV.p2Ink = function (src, x0, y0, w, h, thr, gain) {
    w = Math.max(1, Math.round(w)); h = Math.max(1, Math.round(h));
    var cv = PV.newCanvas(w, h), g = cv.getContext('2d');
    g.drawImage(src, x0, y0, w, h, 0, 0, w, h);
    var id = g.getImageData(0, 0, w, h), d = id.data;
    thr = thr === undefined ? 26 : thr; gain = gain === undefined ? 70 : gain;
    for (var i = 0; i < d.length; i += 4) {
      var lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      d[i + 3] = Math.round(d[i + 3] * T.clamp01((lum - thr) / gain));
    }
    g.putImageData(id, 0, 0);
    return cv;
  };
})();

/* ================================ C26  deeply -> if_i_can  T=58.543 pre=0.34 post=0.8 ================================
   s_chorus1.py:354。她的字形行亮起、从她的窗格向右流出去；每行都是一个写头，把字形场里那一行写出来；
   IF I CAN 从窗格边缘往外、在她身后被写出来。窗格框在 6 帧内淡出（本移植里窗格是 DOM，见下）。 */
(function () {
  'use strict';
  var PV = window.PV, T = PV.tui;
  var BEAT = 60 / 130, FPS = 24;
  var T0 = 58.543, PRE = 0.34, POST = 0.8;
  var REGION = [20, 36, 1172, 612];      /* 8 x 16 的格子；字形场的行 y = 68 + 16 r */
  var EDGE = 384;                        /* 她窗格的右边缘 */
  var RIGHT = 1172;
  var START = T0 - 0.33;
  var END = T0 + 1.5 * BEAT;             /* 59.236：写头到达右边缘 */
  var WIN = [28, 65, 376, 601];          /* 她窗格的内容矩形（近似 kit.LEFT 内缩后的窗口） */

  function clamp(v) { return T.clamp01(v); }

  /* 每一行（16px 带）的 t0（起跑）/ tm（越过窗格边缘）/ t1（到达右边缘）与她的 extent L,R */
  var ROWS = (function () {
    var nb = Math.floor((REGION[3] - REGION[1]) / 16), rows = [], her = [], k;
    for (k = 0; k < nb; k++) {
      var y0 = REGION[1] + 16 * k, y1 = y0 + 16;
      var isHer = (y1 > WIN[1] && y0 < WIN[3]);
      rows.push({ k: k, her: isHer });
      if (isHer) her.push(k);
    }
    var kc = (her[0] + her[her.length - 1]) / 2;
    var span = Math.max(1, (her[her.length - 1] - her[0]) / 2);
    for (k = 0; k < nb; k++) {
      var r = rows[k];
      var jit = ((k * 37) % 5 - 2) / FPS * 0.25;
      if (r.her) {
        var d = Math.abs(k - kc) / span;
        r.t0 = START + 0.05 * d;
        r.tm = T0 + 0.03 * d;
        r.L = WIN[0]; r.R = WIN[2];
      } else {
        var dk = 1e9, j;
        for (j = 0; j < her.length; j++) dk = Math.min(dk, Math.abs(k - her[j]));
        r.t0 = r.tm = T0 - 0.06 + 0.02 * dk;
        r.L = EDGE; r.R = EDGE;
      }
      r.t1 = END + jit;
    }
    return rows;
  })();

  function band(y) {
    var k = Math.floor((y - REGION[1]) / 16);
    return ROWS[Math.max(0, Math.min(ROWS.length - 1, k))];
  }
  /* 写头位置：先是她自己那一行从 R 滑到窗格边缘，然后从边缘一路跑到右边缘 */
  function frontX(r, t) {
    if (t < r.tm) {
      if (!r.her) return EDGE;
      var u = clamp((t - r.t0) / (r.tm - r.t0));
      return r.R + (EDGE - r.R) * u * u;
    }
    var v = clamp((t - r.tm) / (r.t1 - r.tm));
    return EDGE + (RIGHT - EDGE) * (0.8 * v + 0.2 * v * v);
  }
  /* frontX 的逆：写头走到 X 的时刻 */
  function xTime(r, X) {
    if (X >= EDGE || !r.her) {
      var y = clamp((X - EDGE) / (RIGHT - EDGE));
      var v = (-0.8 + Math.sqrt(0.64 + 0.8 * y)) / 0.4;
      return r.tm + v * (r.t1 - r.tm);
    }
    var u2 = Math.sqrt(clamp((X - r.R) / Math.max(1, EDGE - r.R)));
    return r.t0 + u2 * (r.tm - r.t0);
  }
  /* 逐格延迟场：一个字形场的格子什么时候被写出来 */
  function frontTime(x, y) {
    var r = band(y);
    if (x >= r.R) return xTime(r, x);
    if (r.her && x >= r.L) return xTime(r, r.R + (x - r.L));
    if (r.her) return T0 - 0.06 + (r.L - x) / 1500;
    return r.t0 + (EDGE - x) / 1500;
  }

  PV.addCut(T0, PRE, POST, function (ctx, t) {
    PV.reveal(ctx, t,
      function (c) { PV.p2Shot('shot_deeply', c, t); },
      function (c) { PV.p2Shot('shot_if_i_can', c, t); },
      frontTime, { region: REGION, cell: [8, 16], dur: 0.07 });
    PV.p2Flicker(ctx, t, frontTime, REGION, [8, 16], 0.07, 26, 0.4);
    /* 写头：每个字形场行的头上两个字，蓝白发光（tk.banner 的 heads 层 + 它的高斯光晕） */
    if (t < END + 0.1) {
      var f = 14, cw = f * T.MONO_ADV, i;
      ctx.save();
      ctx.font = '700 ' + f + 'px ' + T.FAM;
      ctx.textBaseline = 'alphabetic';
      ctx.textAlign = 'left';
      for (i = 0; i < ROWS.length; i++) {
        var r = ROWS[i];
        if (r.k < 2 || r.k > 34) continue;
        if (t < r.t0 || t >= r.t1 + 0.04) continue;
        var X = frontX(r, t);
        if (X >= 1160) continue;
        var q = Math.floor(t * FPS) + r.k;
        var s = 'IFICAN'.charAt(((q % 6) + 6) % 6) + 'IFICAN'.charAt((((q + 2) % 6) + 6) % 6);
        var y = REGION[1] + 16 * r.k;
        ctx.shadowColor = T.css(T.mix(T.ME_MID, 0.9));
        ctx.shadowBlur = 6;
        ctx.fillStyle = T.css(T.mix([226, 234, 255], 0.95));
        ctx.fillText(s, X - 2 * cw, y + 12);
        ctx.fillText(s, X - 2 * cw, y + 12);
        ctx.shadowBlur = 0;
        ctx.fillStyle = 'rgb(226,234,255)';
        ctx.fillText(s, X - 2 * cw, y + 12);
      }
      ctx.restore();
    }
  });
})();

/* ================================ C31  happy -> execution  T=68.005 pre=0.09 post=0.8 ================================
   s_chorus1.py:514（cut 30 推近的镜像）。grad-cam 特写拉回来：脸缩进窗格里她的头，面板框收缩到窗格框并改标题；
   在拍点上脸逐格重画成她的头，身体从它长出来；agent loop 与 tool call 在退走的框后面从左往右填满。 */
(function () {
  'use strict';
  var PV = window.PV, T = PV.tui;
  var BEAT = 60 / 130, FPS = 24;
  var T0 = 68.005, PRE = 0.09, POST = 0.8;
  var REGION = [20, 36, 1172, 612];
  var FACE = [30, 60, 696, 600];          /* grad-cam 的脸与热图所在矩形 */
  var S0 = T0 - 2 / FPS, S1 = T0 + BEAT;  /* 68.4667：脸又变回她的头 */
  var HAPPY_TITLE = '/dev/me  grad-cam  L43  class=happy(you)';   /* v2 补丁（scenes_chorus1.py:370） */
  /* 落点：她的头 = 窗格里她头像的位置（参考帧实测 AVATAR_C = (69,105)），尺寸照 Python 的 150 x 119.5 */
  var HEAD = { cx: 69, cy: 105, w: 150, h: 119.5 };

  function eIo(u) { u = T.clamp01(u); return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2; }
  function clamp(v) { return T.clamp01(v); }

  /* 收缩的框右边缘（700 -> 384）经过 x 的时刻 */
  function edgeTime(x) {
    var e = clamp((700 - x) / 316);
    if (e <= 0) return -1e9;
    var u = e < 0.5 ? Math.pow(e / 4, 1 / 3) : 1 - Math.pow(2 * (1 - e), 1 / 3) / 2;
    return S0 + u * (S1 - S0);
  }
  function delay(x, y) {
    var hx0 = HEAD.cx - HEAD.w / 2, hy0 = HEAD.cy - HEAD.h / 2, hx1 = hx0 + HEAD.w, hy1 = hy0 + HEAD.h;
    if (x < 388) {
      if (hx0 <= x && x < hx1 && hy0 <= y && y < hy1) return S1 - 0.02;
      return S1 - 0.16 + Math.hypot(x - HEAD.cx, (y - HEAD.cy) * 0.8) / 2000;
    }
    return Math.max(T0 + 0.17 + (x - 388) / 2680, edgeTime(x) + 0.02);
  }

  PV.addCut(T0, PRE, POST, function (ctx, t) {
    var e = eIo((t - S0) / (S1 - S0));
    var rng = PV.mt(Math.floor(t * FPS) * 7919);
    /* 旧画面：shot_happy 画到离屏，再把面板区域 (22,40)-(706,612) 抹回背景（框与脸都让位） */
    var A = PV.newCanvas(1280, 720), a = A.getContext('2d');
    PV.drawBackground(a, t);
    PV.p2Shot('shot_happy', a, t);
    var face = PV.p2Ink(A, FACE[0], FACE[1], FACE[2] - FACE[0], FACE[3] - FACE[1], 26, 70);
    a.save();
    a.beginPath(); a.rect(22, 40, 706 - 22, 612 - 40); a.clip();
    PV.drawBackground(a, t);
    a.restore();
    /* 收缩的框 + 改标题 */
    var x1 = Math.round(T.lerp(700, 384, e));
    var lvl = T.lerp(0.55 + 0.3 * PV.pulse(t), 0.45 + 0.35 * PV.pulse(t), e);
    var tTitle = S0 + 0.45 * (S1 - S0);
    /* P2（dsh_patch_fix.py）：tuikit.decode 里的 '/dev/me' 也改成 'dsh web' —— 参考 68.5 同刻帧
       的窗格标题实测以 `dsh web` 开头（后面在逐字 decode）✓；HAPPY_TITLE 仍保留 /dev/me（grad-cam 例外）。 */
    var title = t < tTitle ? HAPPY_TITLE : (T.decode('dsh web  pid 4471', t - tTitle, rng, 40.0, 0.1, 0) || '/');
    T.box(a, 24, 56, x1, 604, title, lvl, T.UI, t);
    /* 脸缩回她的头：中心走到她的脸上 */
    var sc = T.lerp(1.0, HEAD.w / 640, e);
    var rx = T.lerp(FACE[0], (HEAD.cx - HEAD.w / 2) - (42 - FACE[0]) * HEAD.w / 640, e);
    var ry = T.lerp(FACE[1], (HEAD.cy - HEAD.h / 2) - (70 - FACE[1]) * HEAD.h / 510, e);
    var fw = Math.max(1, Math.round(face.width * sc)), fh = Math.max(1, Math.round(face.height * sc));
    a.save();
    a.globalAlpha = clamp(1 - (t - (S1 + 0.12)) / 0.25);
    a.drawImage(face, Math.round(rx), Math.round(ry), fw, fh);
    a.restore();
    /* attribution 行随面板淡出 */
    var fa = 1 - clamp((t - S0) / 0.16);
    if (fa > 0.02) {
      var u2 = (t - 66.159) / (68.005 - 66.159);
      T.textPIL(a, 'attribution(smile) = ' + (0.71 + 0.27 * T.ease(T.clamp01(u2))).toFixed(3), 40, 576,
                T.css(T.mix(T.UI, 0.95)), 16, 'left', true);
    }
    /* 逐格翻到 execution；框锁定在她周围 */
    PV.reveal(ctx, t,
      function (c) { c.drawImage(A, 0, 0); },
      function (c) { PV.p2Shot('shot_execution', c, t); },
      delay, { region: REGION, cell: [8, 16], dur: 0.09 });
    PV.p2Flicker(ctx, t, delay, REGION, [8, 16], 0.09, 31, 0.4);
    /* 权威 full/engine.py:179-201 的 ops 列读的是**本帧 ctx 的 ops**；C31 渲的是上一镜 shot_happy，
       所以整段转场里 ops 显示的是 shot_happy 的列表。参考 68.0 实测 = FORWARD / LOGIT[happy] /
       BACKWARD / GRAD.CAM / ADVANTAGE / PPO.CLIP / ADAM.STEP ✓，我们却带出了 shot_execution 的
       （PLAN / TOOL.CALL / … ✗），tick 区误差 12.98。必须在 reveal 之后设（reveal 会渲 shot_execution）。 */
    PV.ops = ['FORWARD', 'LOGIT[happy]', 'BACKWARD', 'GRAD.CAM', 'ADVANTAGE', 'PPO.CLIP', 'ADAM.STEP'];
    PV.alert = '';
    var k = Math.max(0, 1 - Math.abs(t - S1) / 0.15);
    if (k > 0.01) T.box(ctx, 24, 56, 384, 604, '', 0.9 * k, T.UI);
  });
})();
