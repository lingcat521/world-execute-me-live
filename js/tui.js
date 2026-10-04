/* tui.js —— tuikit 的 Canvas 端基础层：调色板、颜色插值、缓动、文字、框、点阵、后期。
   调色板用 film 实际使用的 deepsea（由 s-palette 覆写）。 */
(function () {
  'use strict';
  var PV = window.PV, T = PV.tui = {};
  T.W = 1280; T.H = 720;
  T.BG = [4, 7, 15];
  T.UI = [200, 214, 234];
  T.ERR = [255, 59, 48];
  T.ANOM = [255, 204, 0];
  T.ME_LO = [4, 8, 34];
  T.ME_MID = [77, 107, 254];
  T.ME_HI = [196, 212, 255];
  T.ME_TEXT = [120, 148, 255];
  T.SCR = '!<>-_\\/[]{}=+*^?#%$&@01|~:;';
  T.DS_BLUE = [77, 107, 254];
  T.clamp = function (v, a, b) { return v < a ? a : (v > b ? b : v); };
  T.clamp01 = function (v) { return v < 0 ? 0 : (v > 1 ? 1 : v); };
  T.lerp = function (a, b, u) { return a + (b - a) * u; };
  T.ease = function (u) { u = T.clamp01(u); var d = 1 - u; return 1 - d * d * d; };
  T.ease_in = function (u) { u = T.clamp01(u); return u * u * u; };
  T.ease_io = function (u) { u = T.clamp01(u); return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2; };
  T.ease_out = function (u) { u = T.clamp01(u); var d = 1 - u; return 1 - d * d * d; };
  T.ease_back = function (u) { u = T.clamp01(u); var c = 1.70158; var d = u - 1; return 1 + (c + 1) * d * d * d + c * d * d; };
  T.smoothstep = function (u) { u = T.clamp01(u); return u * u * (3 - 2 * u); };
  T.mix = function (c, level, base) {
    level = T.clamp01(level); base = base || T.BG;
    return [Math.round(base[0] + (c[0] - base[0]) * level),
            Math.round(base[1] + (c[1] - base[1]) * level),
            Math.round(base[2] + (c[2] - base[2]) * level)];
  };
  T.css = function (c, a) {
    if (a === undefined || a >= 1) return 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')';
    return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')';
  };
  T.ui = function (lv) { return T.mix(T.UI, lv); };
  /* engine.ui_gain：'系统色就是你。你离开时它开始流失，再也没完全回来。'
     原始 full/engine.py: keyframes [(0,1.0),(110.4,1.0),(116.5,0.42),(176.9,0.42),(179.5,0.85),(193,0.75),(206,0.45)]
     只乘在 amb()（tuikit.amb）上：box 边框走 mix() 不受影响，anom/blue/red 也不受影响。 */
  T.UI_GAIN_KF = [[0, 1.0], [110.4, 1.0], [116.5, 0.42], [176.9, 0.42], [179.5, 0.85], [193, 0.75], [206, 0.45]];
  T.uiGainAt = function (t) {
    var KF = T.UI_GAIN_KF, i;
    if (t <= KF[0][0]) return KF[0][1];
    for (i = 0; i + 1 < KF.length; i++) {
      if (t <= KF[i + 1][0]) {
        var u = (t - KF[i][0]) / (KF[i + 1][0] - KF[i][0]);
        return KF[i][1] + (KF[i + 1][1] - KF[i][1]) * u;
      }
    }
    return KF[KF.length - 1][1];
  };
  T.uiGainNow = 1;                 /* 每帧由 frame.js 更新 */
  T.amb = function (lv) { return T.mix(T.UI, lv * T.uiGainNow); };
  T.bg = function (lv) { return T.mix(T.UI, lv); };
  T.FAM = '"SpaceMono", ui-monospace, Consolas, "DejaVu Sans Mono", monospace';
  T.CJK = '"Noto Sans SC", "Source Han Sans SC", system-ui, sans-serif';
  T.font = function (size, bold) { return (bold ? '700 ' : '') + size + 'px ' + T.FAM; };
  T.text = function (ctx, s, x, y, col, size, align, bold) {
    ctx.font = T.font(size, bold);
    ctx.textAlign = align || 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = typeof col === 'string' ? col : T.css(col);
    ctx.fillText(s, x, y);
  };
  T.rect = function (ctx, x0, y0, x1, y1, col, lv, lw) {
    ctx.strokeStyle = typeof col === 'string' ? col : T.css(col, lv === undefined ? 1 : lv);
    ctx.lineWidth = lw || 1;
    ctx.strokeRect(Math.round(x0) + 0.5, Math.round(y0) + 0.5, Math.round(x1 - x0), Math.round(y1 - y0));
  };
  T.fill = function (ctx, x0, y0, x1, y1, col, a) {
    ctx.fillStyle = typeof col === 'string' ? col : T.css(col, a === undefined ? 1 : a);
    ctx.fillRect(Math.round(x0), Math.round(y0), Math.round(x1 - x0), Math.round(y1 - y0));
  };
  T.hline = function (ctx, x0, x1, y, col, a) { T.fill(ctx, x0, y, x1, y + 1, col, a); };
  T.vline = function (ctx, x, y0, y1, col, a) { T.fill(ctx, x, y0, x + 1, y1, col, a); };
  T.dot = function (ctx, x, y, r, col, a) {
    ctx.fillStyle = typeof col === 'string' ? col : T.css(col, a === undefined ? 1 : a);
    ctx.beginPath(); ctx.arc(x, y, r, 0, 6.283185307); ctx.fill();
  };
  T.hex = function (s) {
    var v = parseInt(s, 16);
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
  };
  // CRT 后期：每 3 行 alpha 55 的扫描线（暗角在 dsh 版被关掉）
  T.scanlines = function (ctx, w, h) {
    ctx.save();
    ctx.globalAlpha = 55 / 255;
    ctx.fillStyle = '#000';
    for (var y = 0; y < h; y += 3) ctx.fillRect(0, y, w, 1);
    ctx.restore();
  };
  T.glowText = function (ctx, s, x, y, col, size, blur, align) {
    ctx.save();
    ctx.shadowColor = typeof col === 'string' ? col : T.css(col);
    ctx.shadowBlur = blur === undefined ? 8 : blur;
    T.text(ctx, s, x, y, col, size, align);
    ctx.restore();
  };
})();

/* ---- 以下为 tuikit 语义的补充实现（PIL 锚点、角标框、乱码打字机、token 化） ---- */
(function () {
  'use strict';
  var PV = window.PV, T = PV.tui;
  T.ASC = 1.12;
  T.ADV = 0.612;
  T.ascent = function (size) { return Math.floor(T.ASC * size); };
  T.adv = function (size) { return size * T.ADV; };
  /* 宽度必须用「真正画字的那套字体」量。原来是 s.length * 0.612em 的固定近似：遇到 CJK（≈1em）
     或空白（≈0.28em）就差很多 —— 底栏 credit 因此右端溢出画面（实测画到 1278 > W-24）、顶栏右侧
     的 chapter/时钟也跟着偏。权威一律用 PIL 的 d.textlength(s, font) = 真字体度量。 */
  var _mctx;
  T.measure = function (s, size, bold) {
    if (_mctx === undefined) {
      _mctx = null;
      try { if (PV.newCanvas) _mctx = PV.newCanvas(8, 8).getContext('2d'); } catch (e1) {}
      if (!_mctx) { try { if (typeof document !== 'undefined' && document.createElement) _mctx = document.createElement('canvas').getContext('2d'); } catch (e2) {} }
      if (_mctx === undefined) _mctx = null;
    }
    if (!_mctx) return String(s).length * T.adv(size);
    _mctx.font = T.font(size, bold);
    return _mctx.measureText(String(s)).width;
  };
  T.tw = function (s, size, bold) { return T.measure(s, size, bold); };
  /* 把字符串横向缩放到目标总宽（用来把「权威字体我们装不出来」的固定文案对齐到参考实测宽度）：
     与 textPIL 同锚点（y 为 ascender 顶），左端落在 x。 */
  T.textScaled = function (ctx, s, x, y, col, size, targetW, bold) {
    var w0 = T.measure(s, size, bold), sc = w0 > 0.5 ? (targetW / w0) : 1;
    ctx.save();
    ctx.translate(x, y + T.ascent(size));
    ctx.scale(sc, 1);
    ctx.font = T.font(size, bold);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = typeof col === 'string' ? col : T.css(col);
    ctx.fillText(s, 0, 0);
    ctx.restore();
  };
  T.textPIL = function (ctx, s, x, y, col, size, align, bold) {
    ctx.font = T.font(size, bold);
    ctx.textAlign = align || 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = typeof col === 'string' ? col : T.css(col);
    ctx.fillText(s, x, y + T.ascent(size));
  };
  function Rng(seed) { this.s = (seed >>> 0) || 1; }
  Rng.prototype.next = function () {
    var s = this.s; s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0;
    this.s = s; return s / 4294967296;
  };
  Rng.prototype.choice = function (str) { return str.charAt(Math.floor(this.next() * str.length)); };
  T.Rng = Rng;
  T.decode = function (s, age, rng, rate, settle, corrupt) {
    rate = rate === undefined ? 45 : rate;
    settle = settle === undefined ? 0.12 : settle;
    corrupt = corrupt || 0;
    if (age === null || age === undefined) age = 1e9;
    var n = Math.min(s.length, Math.max(0, Math.floor(age * rate)));
    var out = '';
    for (var i = 0; i < n; i++) {
      var ch = s.charAt(i);
      var a = age - i / rate;
      if (ch !== ' ' && (a < settle || (corrupt > 0 && rng.next() < corrupt))) ch = rng.choice(T.SCR);
      out += ch;
    }
    return out;
  };
  T.tokenize = function (s) {
    var toks = [], re = /[A-Za-z']+|[^\sA-Za-z']/g, m;
    while ((m = re.exec(s)) !== null) {
      var w = m[0];
      if (w.length > 7) { var k = Math.floor(w.length / 2) + 1; toks.push(w.slice(0, k), w.slice(k)); }
      else toks.push(w);
    }
    return toks;
  };
  var CRCT = (function () {
    var t = new Int32Array(256);
    for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); t[n] = c; }
    return t;
  })();
  T.crc32 = function (str) {
    var c = 0xFFFFFFFF;
    for (var i = 0; i < str.length; i++) c = CRCT[(c ^ str.charCodeAt(i)) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  };
  T.tokenId = function (tok) { return T.crc32(tok.toLowerCase()) % 100000; };
  T.box = function (ctx, x0, y0, x1, y1, title, level, color, spinner) {
    level = level === undefined ? 0.5 : level;
    color = color || T.UI;
    T.rect(ctx, x0, y0, x1, y1, T.mix(color, level), 1, 1);
    var L = 7, hi = T.mix(color, Math.min(1, level + 0.4));
    var corners = [[x0, y0, 1, 1], [x1, y0, -1, 1], [x0, y1, 1, -1], [x1, y1, -1, -1]];
    for (var i = 0; i < 4; i++) {
      var c = corners[i];
      T.fill(ctx, Math.min(c[0], c[0] + c[2] * L), c[1], Math.max(c[0], c[0] + c[2] * L) + 1, c[1] + 2, hi, 1);
      T.fill(ctx, c[0], Math.min(c[1], c[1] + c[3] * L), c[0] + 2, Math.max(c[1], c[1] + c[3] * L) + 1, hi, 1);
    }
    if (title) {
      if (spinner !== undefined && spinner !== null) title = '|/-\\'.charAt(Math.floor(spinner * 8) % 4) + ' ' + title;
      var label = ' ' + title + ' ';
      var tw = T.tw(label, 13);
      T.fill(ctx, x0 + 12, y0 - 9, x0 + 12 + tw, y0 + 9, T.BG, 1);
      T.textPIL(ctx, label, x0 + 12, y0 - 10, T.mix(color, Math.min(1, level + 0.35)), 13);
    }
  };
})();

/* ---- Consolas 宽度模拟：F_MONO 是 Consolas（advance 0.5498em），仓库里没有，用 SpaceMono 横向压缩到同宽 ---- */
(function () {
  'use strict';
  var PV = window.PV, T = PV.tui;
  T.MONO_ADV = 0.5498;
  T.MONO_ASC = 0.765;
  T.MONO_FAM = 'ui-monospace, "DejaVu Sans Mono", "Roboto Mono", "Droid Sans Mono", monospace';
  T.ascentMono = function (size) { return Math.floor(T.MONO_ASC * size); };
  var _mk = {};
  T.monoScale = function (ctx, size) {
    var key = String(size);
    if (_mk[key] !== undefined) return _mk[key];
    ctx.save();
    ctx.font = size + 'px ' + T.MONO_FAM;
    var w0 = ctx.measureText('M').width || (size * 0.6);
    ctx.restore();
    _mk[key] = (size * T.MONO_ADV) / w0;
    return _mk[key];
  };
  T.twMono = function (s, size) { return s.length * size * T.MONO_ADV; };
  /* F_MONO_B（Consolas Bold）：球面点阵用的是粗体等宽（scenes_boot.py:418 / s_boot.py:483），
     以前我们两边一个用比例字体、一个用非粗等宽，落点字形不同 -> 用户报的「颜色不连贯」。 */
  T.textMonoB = function (ctx, s, x, y, col, size, align) {
    var k = T.monoScale(ctx, size);
    var w = s.length * size * T.MONO_ADV;
    var ox = align === 'center' ? -w / 2 : (align === 'right' ? -w : 0);
    ctx.save();
    ctx.translate(x + ox, y + T.ascentMono(size));
    ctx.scale(k, 1);
    ctx.font = '700 ' + size + 'px ' + T.MONO_FAM;
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = typeof col === 'string' ? col : T.css(col);
    ctx.fillText(s, 0, 0);
    ctx.restore();
  };
  /* 【性能】球面/点阵这类「上万个同款字符」的场景，逐点 textMono 的代价是每个点一次
     save/translate/scale/font=字符串/fillText/restore（浏览器里 font 赋值要解析字符串）。
     参考成片是离线 PIL，怎么写都行；浏览器版必须合批。这里把单字符渲染进小画布缓存，
     之后每点只 drawImage 一次 —— 像素与 textMono 完全一致（就是用 textMono 画进缓存的）。
     用户报的「f269-271 圆球卡顿」就是这条路径。 */
  var _sprCache = {};
  T.sprite = function (ch, size, colStr, mode) {
    var key = ch + '|' + size + '|' + colStr + '|' + (mode || ''), cv = _sprCache[key];
    if (cv) return cv;
    var pad = Math.ceil(size * 1.8), w = pad * 2, h = pad * 2;
    cv = PV.newCanvas(w, h);
    var g = cv.getContext('2d');
    if (mode === 'monoB') T.textMonoB(g, ch, pad, pad, colStr, size);
    else if (mode === 'pil' || mode === true) T.textPIL(g, ch, pad, pad, colStr, size);
    else T.textMono(g, ch, pad, pad, colStr, size);
    cv._dx = -pad; cv._dy = -pad;
    _sprCache[key] = cv;
    return cv;
  };
  T.spriteAt = function (ctx, ch, x, y, colStr, size, mode) {
    var sp = T.sprite(ch, size, colStr, mode);
    ctx.drawImage(sp, Math.round(x) + sp._dx, Math.round(y) + sp._dy);
  };
  /* 颜色量化：球面每点一个 z（连续）会让精灵缓存每点新建一张 -> 反而更慢。
     分 24 档亮度（≈4% 步进，像素上看不出来），最多 3 字形 x 24 档 = 72 张。 */
  T.shade = function (lv) { return Math.round(T.clamp01(lv) * 24) / 24; };
  T.textMono = function (ctx, s, x, y, col, size, align) {
    var k = T.monoScale(ctx, size);
    var w = s.length * size * T.MONO_ADV;
    var ox = align === 'center' ? -w / 2 : (align === 'right' ? -w : 0);
    ctx.save();
    ctx.translate(x + ox, y + T.ascentMono(size));
    ctx.scale(k, 1);
    ctx.font = size + 'px ' + T.MONO_FAM;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = typeof col === 'string' ? col : T.css(col);
    ctx.fillText(s, 0, 0);
    ctx.restore();
  };
})();

/* 空心圆（PIL 的 ellipse outline 等价物） */
(function () {
  'use strict';
  var PV = window.PV, T = PV.tui;
  T.ring = function (ctx, cx, cy, r, col, a, lw) {
    ctx.save();
    ctx.strokeStyle = typeof col === 'string' ? col : T.css(col, a === undefined ? 1 : a);
    ctx.lineWidth = lw || 1;
    ctx.beginPath();
    ctx.arc(cx, cy, Math.max(0.5, r), 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  };
})();
