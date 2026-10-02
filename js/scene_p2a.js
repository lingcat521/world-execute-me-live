/* scene_p2a.js —— 03 RLHF (58.543-73.543) + 04 DEPLOY (73.543-103.082) + 05 USER_LEFT 开头 (103.082-110.466)
   Python 权威（照它逐行移植）:
     continuity_full_v2/s_chorus1.py + full/sec_chorus1.py   -> 镜头 26-33（approved 渲染器）
     continuity_full_v2/scenes_deploy.py                     -> 镜头 34-45
     continuity_full_v2/scenes_userleft.py                   -> 镜头 46-47
   本文件只画「场景自己画在 c.d / c.img 上的东西」；她 / dsh web 窗口（me_pane）由 pane.js 负责。 */
(function () {
  'use strict';
  var PV = window.PV, T = PV.tui;

  /* ================================ 基础工具（对应 tk.* / engine.pulse） ================================ */
  function amb(lv) { return T.css(T.amb(lv)); }
  function anom(lv) { return T.css(T.mix(T.ANOM, lv)); }
  function blue(lv) { return T.css(T.mix(T.ME_TEXT, lv)); }
  function red(lv) { return T.css(T.mix(T.ERR, lv)); }
  function heatCell(ctx, x, y, w, h, v, col) {
    v = T.clamp01(v);
    T.fill(ctx, x, y, x + w - 2, y + h - 2, T.mix(col || T.UI, 0.06 + 0.94 * v), 1);
  }
  function box(ctx, x0, y0, x1, y1, title, lv, col, spin) {
    T.box(ctx, x0, y0, x1, y1, title, lv === undefined ? 0.5 : lv, col || T.UI, spin);
  }
  function pil(ctx, s, x, y, col, size, bold) { T.textPIL(ctx, s, x, y, col, size, 'left', bold); }
  function typed(ctx, s, x, y, col, size, age, rng, rate, bold) {
    T.textPIL(ctx, T.decode(s, age, rng, rate === undefined ? 45 : rate, 0.12, 0), x, y, col, size, 'left', bold);
  }
  function line(ctx, x0, y0, x1, y1, col, lw) {
    lw = lw || 1;
    var o = (lw % 2) ? 0.5 : 0;
    ctx.save();
    ctx.strokeStyle = col; ctx.lineWidth = lw;
    ctx.beginPath(); ctx.moveTo(x0 + o, y0 + o); ctx.lineTo(x1 + o, y1 + o); ctx.stroke();
    ctx.restore();
  }
  function pt(ctx, x, y, col, a) { T.fill(ctx, x, y, x + 1, y + 1, col, a === undefined ? 1 : a); }
  var CJK_FAM = 'NotoCJK, "Noto Sans CJK SC", "Noto Sans SC", "Source Han Sans SC", "Droid Sans Fallback", system-ui, sans-serif';
  function cjk(ctx, s, x, y, col, size) {
    ctx.font = size + 'px ' + CJK_FAM;
    ctx.fillStyle = typeof col === 'string' ? col : T.css(col);
    ctx.textBaseline = 'top';
    ctx.fillText(s, x, y);
  }
  function pulse(t) { return PV.pulse ? PV.pulse(t) : 0; }
  function beatIndex(t) { return Math.floor((t - 0.1587) / (60 / 130) + 1e-6); }
  /* Python: engine.render_body() 每帧新建 random.Random(index * 7919)（index = round(t*24)）。
     PV.rngFor(t, salt) 把 t 丢了（永远返回同一个流），于是 decode 出来的乱码每帧一模一样 —— 参考里
     它是逐帧变的。本段（镜头 26-33）改用这个逐帧版本；MT 本身和 CPython 完全一致。 */
  function rngFrame(t, salt) { return PV.mt((Math.round(t * 24) * (salt || 7919)) >>> 0); }
  /* CPython random.gauss 的忠实版本（mt19937.js 里那个是另一种 Box-Muller 变体，两个 random()
     的角色和顺序都对不上，导致所有 gauss 数值和参考全不一样）。一次算两个、第二个缓存复用。 */
  function gaussPy(r, mu, sigma) {
    var z = r._gn;
    r._gn = undefined;
    if (z === undefined) {
      var x2pi = r.random() * 2 * Math.PI;
      var g2rad = Math.sqrt(-2 * Math.log(1 - r.random()));
      z = Math.cos(x2pi) * g2rad;
      r._gn = Math.sin(x2pi) * g2rad;
    }
    return mu + z * sigma;
  }
  /* tk.dot_chart 的忠实移植：返回最后一个点 [x, y] */
  function dotChart(ctx, x, y, w, h, fn, progress, col, sx, sy, axis, clipTop) {
    sx = sx || 5; sy = sy || 5;
    if (axis === undefined) axis = true;
    if (clipTop === undefined) clipTop = true;
    var cols = Math.floor(w / sx), rows = Math.floor(h / sy), i, r, prev = null, last = null;
    if (axis) {
      for (i = 0; i < cols; i += 2) pt(ctx, x + i * sx, y + h, T.UI, 0.28);
      for (r = 0; r < rows; r += 3) pt(ctx, x - 4, y + r * sy, T.UI, 0.28);
    }
    for (i = 0; i < cols; i++) {
      var u = i / (cols - 1);
      if (u > progress) break;
      var v = fn(u);
      if (clipTop) v = Math.min(1.0, v);
      r = Math.round((1 - Math.max(0, v)) * (rows - 1));
      var lo = (prev === null) ? r : Math.min(prev, r), hi = (prev === null) ? r : Math.max(prev, r);
      for (var rr = lo; rr <= hi; rr++) pt(ctx, x + i * sx, y + rr * sy, col, 1);
      prev = r; last = [x + i * sx, y + r * sy];
    }
    return last;
  }

  /* ================================ continuity_chorus_v1/continuity.py 的两个渲染层动作 ================================
     Python 的 approved 渲染器在画完场景后做两件事，本段（镜头 25-33）之前完全没有移植：
       ① body_image():  非 FULL 镜头把 canvas 的 CENTER(404,56,1164,604=760x548) 裁剪后 resize 成 760x478
                        再贴回 (404,56) —— 即中窗格所有内容被纵向压缩 478/548=0.8723，y>534 区域被 BG 清空，
                        再在 y=543 画一条 amb(.26) 横线。dot_field 点阵也一起被压（它画在 canvas 上）。
       ② retained_objects(): 采样块 / flatten 向量条 / ONLY / YOU 徽标 / pinned·evict denied 连线等保留物件，
                        用「屏幕坐标」画在压缩之后（不受挤压影响）。 */
  var SQ = 478 / 548;
  PV.SQ = SQ;
  PV.centerBegin = function (ctx, t) {          /* 进入「场景坐标系」：之后按 Python 的场景坐标画 */
    ctx.save();
    ctx.beginPath(); ctx.rect(404, 56, 760, 548); ctx.clip();
    T.fill(ctx, 404, 56, 1164, 604, T.BG, 1);   /* body_image 先 fill(BG) 再贴回 */
    ctx.translate(404, 56); ctx.scale(1, SQ); ctx.translate(-404, -56);
    var off = Math.floor(t * 12) % 16;          /* 点阵（和 frame.js 的舞台底纹同一套），跟着一起被压扁 */
    ctx.fillStyle = T.css(T.mix(T.UI, 0.1));
    for (var sy = -off; sy < 720 + 16; sy += 16) for (var x = 0; x < 1280; x += 16) ctx.fillRect(x, sy, 1, 1);
  };
  PV.centerEnd = function (ctx) {
    ctx.restore();
    line(ctx, 404, 543, 1164, 543, amb(0.26), 1);
  };
  function mapped(r) {                          /* continuity.mapped(): 场景 y -> 屏幕 y */
    return [r[0], Math.round(56 + (r[1] - 56) * SQ), r[2], Math.round(56 + (r[3] - 56) * SQ)];
  }
  function lerpRect(a, b, u) {
    return [Math.round(a[0] + (b[0] - a[0]) * u), Math.round(a[1] + (b[1] - a[1]) * u),
            Math.round(a[2] + (b[2] - a[2]) * u), Math.round(a[3] + (b[3] - a[3]) * u)];
  }
  function chip(ctx, text, r, col, size) {      /* continuity.chip() */
    col = col || blue(0.95); size = size || 19;
    T.fill(ctx, r[0], r[1], r[2], r[3], T.BG, 1);
    T.rect(ctx, r[0], r[1], r[2], r[3], col, 1, 2);
    T.textMono(ctx, text, r[0] + (r[2] - r[0]) / 2, r[1] + (r[3] - r[1] - size) / 2 - 1,
               typeof col === 'string' ? col : T.css(col), size, 'center');
  }
  /* continuity.sample_object(): #0000 采样块 178x144（外面的 rect 是贴图目标，按比例缩放） */
  function sampleObject(ctx, r) {
    var w = r[2] - r[0], h = r[3] - r[1], s = w / 178;
    T.fill(ctx, r[0], r[1], r[2], r[3], T.BG, 1);
    T.rect(ctx, r[0], r[1], r[2], r[3], blue(0.9), 1, Math.max(1, Math.round(s)));
    var tw = Math.round(166 * s), th = Math.round(122 * s), px = Math.max(1, Math.round(3 * s));
    var tsz = halfblockSize('starry', 'upper', 166, 122, 3);
    if (tsz) { tw = tsz[0] * px; th = tsz[1] * px; }
    var dx0 = r[0] + Math.floor((w - tw) / 2), dy0 = r[1] + Math.round(142 * s) - th;
    if (wDiffusionTile(ctx, dx0, dy0, 'starry', 'upper', 166, 122, px, 1.0, 900) === null)
      diffusionTile(ctx, dx0, dy0, tw, th, px, 'upper', 1.0, 900);
    T.textMono(ctx, '#0000 t=000', r[0] + Math.round(6 * s), r[1] + Math.round(4 * s), blue(0.95),
               Math.max(8, Math.round(12 * s)));
  }
  /* continuity.vector_object(): flatten 出来的 720x22 向量条（60 格 × random.Random(78)） */
  function vectorObject(ctx, r) {
    var w = r[2] - r[0], h = r[3] - r[1];
    T.fill(ctx, r[0], r[1], r[2], r[3], T.BG, 1);
    var rr = PV.mt(78);
    for (var q = 0; q < 60; q++) {
      var x0 = r[0] + Math.round(q * w / 60), x1 = r[0] + Math.round((q + 1) * w / 60);
      T.fill(ctx, x0, r[1], x1 - 2, r[3] - 2, T.mix(T.UI, 0.06 + 0.94 * rr.random()), 1);
    }
  }
  var SAMPLE_HOME = [414, 549, 480, 603], VECTOR_HOME = [516, 567, 946, 589];
  var ONLY_HOME = [1038, 582, 1154, 604], YOU_HOME = [916, 572, 1018, 600];
  /* continuity.retained_objects()：全部用屏幕坐标画（body_image 之后） */
  function retained(ctx, t, name, lt, u) {
    var d = ctx, ease = T.smoothstep;
    var SIM = 60.620, CONV0 = 62.466, CONV1 = 64.312, SAT0 = 64.312, SAT1 = 66.159, EXE0 = 68.005,
        TRAP0 = 70.082, STRANGE0 = 71.466;
    if (SIM <= t && t < SAT0 + 0.32) {
      if (t < CONV0) {
        var u1 = ease((t - (60.620 + 1.846 - 0.48)) / 0.48);
        if (u1 > 0) {
          var source = mapped([414, 70, 592, 214]);
          T.fill(d, source[0], source[1], source[2], source[3], T.BG, 1);
          T.rect(d, source[0], source[1], source[2], source[3], blue(0.18), 1, 1);
          sampleObject(d, lerpRect(source, SAMPLE_HOME, u1));
        }
      } else sampleObject(d, SAMPLE_HOME);
      if (t >= SIM + 1.846 - 0.48) T.textMono(d, '#0000 / input', 490, 549, blue(0.8), 12);
      if (CONV0 <= t && t < CONV1) line(d, 480, 576, 496, 576, blue(0.55), 1), line(d, 496, 576, 496, 534, blue(0.55), 1);
    }
    if (CONV1 - 0.42 <= t && t < SAT0 + 0.42) {
      var dest;
      if (t < SAT0) {
        var u2 = ease((t - (CONV1 - 0.42)) / 0.42);
        var src2 = mapped([420, 532, 1140, 554]);
        T.fill(d, src2[0], src2[1], src2[2], src2[3], T.BG, 1);
        dest = lerpRect(src2, VECTOR_HOME, u2);
      } else {
        var u3 = ease((t - SAT0) / 0.42);
        dest = lerpRect(VECTOR_HOME, mapped([470, 110, 758, 132]), u3);
      }
      vectorObject(d, dest);
      T.textMono(d, 'flatten -> attention', 650, 549, amb(0.85), 12);
    }
    var onlyStart = SAT0 + 0.55 * (SAT1 - SAT0);
    if (onlyStart <= t && t < STRANGE0) {
      var u4 = ease((t - onlyStart) / 0.42);
      var src4 = mapped([800, 359, 966, 405]);
      if (t < SAT1) T.fill(d, src4[0], src4[1], src4[2], src4[3], T.BG, 1);
      chip(d, 'ONLY', lerpRect(src4, ONLY_HOME, u4), null, u4 > 0.85 ? 15 : 25);
      if (name === 'shot_satisfaction' && u4 > 0.95) line(d, 1096, 572, 1096, 534, blue(0.7), 1);
      if (name === 'shot_execution') {
        line(d, 1096, 572, 1096, 530, blue(0.5), 1);
        if (u > 0.55 && u < 0.80) T.rect(d, 1028, 563, 1161, 604, red(0.98), 1, 2);
      }
    }
    if (EXE0 + 0.32 <= t && t < STRANGE0 + 0.50) {
      var u5 = ease((t - (EXE0 + 0.32)) / 0.72);
      chip(d, 'YOU', lerpRect(mapped([970, 155, 1090, 184]), YOU_HOME, u5), blue(0.95), 17);
      if (t >= TRAP0) {
        var px = 520, py = mapped([0, 141, 0, 141])[1];
        line(d, 958, 572, 958, 522, blue(0.45), 1); line(d, 958, 522, px, 522, blue(0.45), 1);
        line(d, px, 522, px, py + 17, blue(0.45), 1);
        T.rect(d, px - 5, py - 4, px + 18, py + 19, blue(0.9), 1, 2);
        T.textMono(d, 'pinned / evict denied', 778, 549, blue(0.8), 12);
      }
    }
    if (name === 'shot_unite' && u > 0.65) chip(d, 'we', [694, 562, 774, 597], amb(0.95), 19);
    else if (name === 'shot_deeply' && lt < 0.8) {
      var u6 = T.ease(lt / 0.8);
      chip(d, 'we', lerpRect([694, 562, 774, 597], [458, 85, 516, 113], u6), amb(0.95), 16);
    }
  }
  PV.retained = retained;

  /* ================================ 真·立绘素材：whale-<expr>.webp ================================
     Python tuikit.sprite_src() 读的就是 third_party_references/whale_maid_expanded_20260926/expressions/
     whale-<expr>.webp（935x1682 RGBA）。移植早期只有 avatars/complete.png 就用它顶替，
     于是半调网点（happy）、3x3 卷积特征图（then_i_can）、扩散采样格（simulations）三处的形状/大小全不对。
     素材已复制到 pv-live/avatars/whale/。加载失败时下面所有 w* 函数返回 null，调用点回落到旧的立绘实现。 */
  var WHALE = {}, _wcell = {}, _wbox = {};
  var WEXP = ['cheerful', 'starry', 'shy', 'serious', 'confused', 'frightened', 'angry', 'exasperated'];
  (function () {
    for (var i = 0; i < WEXP.length; i++) (function (e) {
      if (!PV.loadImage) return;
      try { PV.loadImage('avatars/whale/whale-' + e + '.webp', function (im) { WHALE[e] = im; }); } catch (err) {}
    })(WEXP[i]);
  })();
  /* tuikit.CROPS（Python 的裁切比例，和上面给 avatars/*.png 用的那套不同） */
  var WCROPS = { full: null, upper: [0.10, 0.0, 0.90, 0.47], face: [0.20, 0.0, 0.78, 0.26],
                 bust: [0.16, 0.0, 0.84, 0.34] };
  /* happy 的脸部特写：Python 用 H3 的 (80,80,335,250)（她的大头照，随舞步在窗格里移动）。
     whale 立绘是全身像：0.20..0.78 × 0..0.26 会把举起的手和肩膀一起画进来
     （实测亮像素是参考的 2.1 倍），所以按 H3 那格的取景比例（宽 0.667、高 0.247，格子 130x87）
     取「头 + 头饰」；参考帧里她的头在 happy 段内是向右漂移的（质心 x：66.50→344 / 67.00→411 /
     67.50→504），静态立绘用裁切窗口跟随这个漂移。 */
  var FACE_CROP = [0.02, 0.0, 0.687, 0.247];
  function faceCropAt(u) {
    var x0 = 0.02 + 0.30 * (0.73 - u);          /* u=0.46 -> 0.10 ; u=0.73 -> 0.02 */
    x0 = T.clamp(x0, -0.04, 0.24);
    return [x0, FACE_CROP[1], x0 + 0.667, FACE_CROP[3]];
  }
  var FACE_CROP_NOW = FACE_CROP;
  function whaleRect(im, crop) {          /* sprite_src：裁切框（full = alpha 包围盒） */
    if (!WCROPS[crop]) {                  /* crop === 'full' */
      var key = im.src || ('w' + im.width + 'x' + im.height);
      if (_wbox[key]) return _wbox[key];
      var cv = PV.newCanvas(im.width, im.height), g = cv.getContext('2d');
      g.drawImage(im, 0, 0);
      var d = g.getImageData(0, 0, im.width, im.height).data, q, r, x0 = im.width, y0 = im.height, x1 = -1, y1 = -1;
      for (r = 0; r < im.height; r++) for (q = 0; q < im.width; q++) {
        if (d[(r * im.width + q) * 4 + 3] > 0) {
          if (q < x0) x0 = q; if (q > x1) x1 = q; if (r < y0) y0 = r; if (r > y1) y1 = r;
        }
      }
      if (x1 < 0) { x0 = y0 = 0; x1 = im.width - 1; y1 = im.height - 1; }
      return (_wbox[key] = [x0, y0, x1 + 1, y1 + 1]);
    }
    var c = crop === 'face' ? FACE_CROP_NOW : WCROPS[crop], w = im.width, h = im.height;
    return [Math.floor(w * c[0]), Math.floor(h * c[1]), Math.floor(w * c[2]), Math.floor(h * c[3])];
  }
  function whaleAspect(expr, crop) {
    var im = WHALE[expr]; if (!im) return null;
    var rc = whaleRect(im, crop);
    return (rc[3] - rc[1]) / Math.max(1, rc[2] - rc[0]);
  }
  /* src.resize((cols,rows), LANCZOS) 的等价物：亮度（未预乘，和 PIL convert("L") 一致）+ alpha */
  function whaleCells(expr, crop, cols, rows, padX) {
    var im = WHALE[expr];
    if (!im || cols < 1 || rows < 1) return null;
    var key = expr + '|' + crop + '|' + cols + 'x' + rows + '|' + (padX || 1);
    if (_wcell[key]) return _wcell[key];
    var rc = whaleRect(im, crop);
    if (padX && padX > 1) {                 /* 横向加宽裁切框：H3 的 'full' 是一整帧，她只占中间一条，
                                               而 whale 立绘的 alpha 包围盒紧贴她本人 —— 直接照抄会让特征图里她占满整格 */
      var ccx = (rc[0] + rc[2]) / 2, ww = (rc[2] - rc[0]) * padX;
      rc = [ccx - ww / 2, rc[1], ccx + ww / 2, rc[3]];
    }
    var cv = PV.newCanvas(cols, rows), g = cv.getContext('2d');
    g.drawImage(im, rc[0], rc[1], rc[2] - rc[0], rc[3] - rc[1], 0, 0, cols, rows);
    var d = g.getImageData(0, 0, cols, rows).data;
    var lum = new Float32Array(cols * rows), al = new Uint8Array(cols * rows), k, i;
    for (k = 0; k < cols * rows; k++) {
      i = k * 4; lum[k] = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]; al[k] = d[i + 3];
    }
    return (_wcell[key] = { lum: lum, alpha: al, cols: cols, rows: rows });
  }
  /* tk.grid_mask：每格最后 1px 竖缝全透明；每两行之间的那条像素行 alpha=70/255 */
  function tileCell(ctx, x, y, px, r, col, a0) {
    /* PIL 里一格是 px 行 × px 列，掩码再去掉最后一列、把奇数列块的最后一行的 alpha 压到 70/255。
       T.fill(x0,y0,x1,y1) 覆盖 [x0,x1)×[y0,y1)，所以行数要写 y+px。 */
    if (r % 2 === 1) {
      T.fill(ctx, x, y, x + px - 1, y + px - 1, col, a0);
      T.fill(ctx, x, y + px - 1, x + px - 1, y + px, col, a0 * 70 / 255);
    } else {
      T.fill(ctx, x, y, x + px - 1, y + px, col, a0);
    }
  }
  function halfblockSize(expr, crop, maxW, maxH, px) {
    var asp = whaleAspect(expr, crop);
    if (asp === null) return null;
    var cols = Math.max(2, Math.floor(Math.min(maxW / px, (maxH / px) / asp)));
    var rows = Math.max(2, Math.round(cols * asp)); rows -= rows % 2;
    return [cols, rows];
  }
  /* tk.halfblock()：levels=8 量化亮度 + 网点掩码 + tint colorize；返回 [w,h] 或 null */
  function wHalfblock(ctx, sx, sy, expr, crop, maxW, maxH, px, tint, aK) {
    var sz = halfblockSize(expr, crop, maxW, maxH, px); if (!sz) return null;
    var cols = sz[0], rows = sz[1], C = whaleCells(expr, crop, cols, rows); if (!C) return null;
    var q = 255 / 7, a0 = aK === undefined ? 1 : aK, r, k;
    for (r = 0; r < rows; r++) for (k = 0; k < cols; k++) {
      if (C.alpha[r * cols + k] <= 100) continue;
      var lv = Math.round((0.16 + 0.84 * C.lum[r * cols + k] / 255) * 7) * q;
      tileCell(ctx, sx + k * px, sy + r * px, px, r, tintCol(tint, lv / 255, null, 0), a0);
    }
    return [cols * px, rows * px];
  }
  /* tk.diffusion_tile()：clean 半调 + 噪声网点按 (1-s)^1.3 / s 叠合 */
  function wDiffusionTile(ctx, x, y, expr, crop, maxW, maxH, px, s, seed) {
    var sz = halfblockSize(expr, crop, maxW, maxH, px); if (!sz) return null;
    var cols = sz[0], rows = sz[1];
    if (s < 0.999) {
      var nr = PV.mt(seed), lum = new Float32Array(cols * rows), k;
      for (k = 0; k < cols * rows; k++) {
        var v = 128 + 90 * nr.gauss(0, 1);
        lum[k] = Math.max(0, Math.min(255, (v - 50) * 1.5));
      }
      tileFromLum(ctx, lum, cols, rows, x, y, px, 'blue', undefined, Math.pow(1 - s, 1.3));
    }
    wHalfblock(ctx, x, y, expr, crop, maxW, maxH, px, 'blue', s);
    return [cols * px, rows * px];
  }
  /* tuikit.conv_maps()：先把 RGBA 合成到黑底再转 L，再 resize 到 (cols,rows) */
  function wConvMaps(expr, crop, cols, rows, padX) {
    var C = whaleCells(expr, crop, cols, rows, padX); if (!C) return null;
    var base = new Float32Array(cols * rows), k;
    for (k = 0; k < cols * rows; k++) base[k] = C.lum[k] * C.alpha[k] / 255;
    return convMapsFrom(base, cols, rows);
  }
  /* alpha 网格（happy 的热力图用它判断哪些格子在她的脸上） */
  function wAlphaGrid(expr, crop, cols, rows) {
    var C = whaleCells(expr, crop, cols, rows); if (!C) return null;
    return C.alpha;
  }

  /* ================================ 她的立绘：halfblock / glyph_grid / conv_maps 的替代 ================================
     素材只有 avatars/complete.png（120x120 RGB 无 alpha）；Python 用的是 H3 帧缓存的她。 */
  var HER = null, _cells = {};
  if (PV.loadImage) { try { PV.loadImage('avatars/complete.png', function (im) { HER = im; }); } catch (e) {} }
  var CROPS = { full: [0, 0, 1, 1], upper: [0.10, 0.00, 0.86, 0.62], face: [0.20, 0.03, 0.62, 0.52],
                bust: [0.06, 0.00, 0.94, 0.72], fig: [0.30, 0.00, 0.72, 1.00] };
  function herCells(cols, rows, crop) {
    if (!HER || cols < 1 || rows < 1) return null;
    var key = cols + '|' + rows + '|' + crop;
    if (_cells[key]) return _cells[key];
    var c = CROPS[crop] || CROPS.full, cv = PV.newCanvas(cols, rows), g = cv.getContext('2d');
    g.drawImage(HER, c[0] * HER.width, c[1] * HER.height, (c[2] - c[0]) * HER.width, (c[3] - c[1]) * HER.height,
                0, 0, cols, rows);
    _cells[key] = g.getImageData(0, 0, cols, rows).data;
    return _cells[key];
  }
  function lumGrid(cols, rows, crop) {
    var d = herCells(cols, rows, crop);
    if (!d) return null;
    var L = new Float32Array(cols * rows);
    for (var k = 0; k < cols * rows; k++) {
      var i = k * 4;
      L[k] = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    }
    return L;
  }
  function lumAt(d, i) { return (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255; }
  function herSize(maxW, maxH, px, crop) {
    var c = CROPS[crop] || CROPS.full;
    var asp = ((c[3] - c[1]) * 1.0) / ((c[2] - c[0]) * 1.0);
    var cols = Math.max(2, Math.floor(Math.min(maxW / px, (maxH / px) / asp)));
    var rows = Math.max(2, Math.round(cols * asp));
    rows -= rows % 2;
    return [cols, rows];
  }
  function colorize(l, lo, mid, hi) {
    l = T.clamp01(l);
    if (!mid) return [lo[0] + (hi[0] - lo[0]) * l, lo[1] + (hi[1] - lo[1]) * l, lo[2] + (hi[2] - lo[2]) * l];
    if (l < 0.5) return [lo[0] + (mid[0] - lo[0]) * l * 2, lo[1] + (mid[1] - lo[1]) * l * 2, lo[2] + (mid[2] - lo[2]) * l * 2];
    return [mid[0] + (hi[0] - mid[0]) * (l - 0.5) * 2, mid[1] + (hi[1] - mid[1]) * (l - 0.5) * 2,
            mid[2] + (hi[2] - mid[2]) * (l - 0.5) * 2];
  }
  var TINT = { blue: [T.ME_LO, T.ME_MID, T.ME_HI], amber: [T.BG, null, T.UI], red: [T.BG, null, T.ERR],
               anom: [T.BG, null, T.ANOM] };
  /* 我们的立绘素材比 TUI 的 H3 帧暗，color 模式做一次 gamma 提亮（参考帧实测 face 面板 44.6 vs 26.1） */
  function boost(c) { return 255 * Math.pow(c / 255, 0.45); }
  function tintCol(tint, l, d, i) {
    if (tint === 'color') return [boost(d[i]), boost(d[i + 1]), boost(d[i + 2])];
    var tn = TINT[tint] || TINT.blue;
    return colorize(l, tn[0], tn[1], tn[2]);
  }
  function halfblock(ctx, sx, sy, maxW, maxH, px, crop, tint, alpha, revealRows) {
    var sz = herSize(maxW, maxH, px, crop), cols = sz[0], rows = sz[1];
    var d = herCells(cols, rows, crop);
    if (!d) return null;
    for (var r = 0; r < rows; r++) {
      if (revealRows !== undefined && r >= revealRows) break;
      for (var q = 0; q < cols; q++) {
        var i = (r * cols + q) * 4, l = lumAt(d, i);
        if (l < 0.16) continue;
        T.fill(ctx, sx + q * px, sy + r * px, sx + q * px + px - 1, sy + r * px + px - 1, tintCol(tint, l, d, i),
               alpha === undefined ? 1 : alpha);
      }
    }
    return [cols * px, rows * px];
  }
  var GRAMP = ' .:-=+*#%@';
  function glyphLines(cols, rows, crop, thr) {
    if (thr === undefined) thr = 0.20;
    var d = herCells(cols, rows, crop);
    if (!d) return null;
    var L = new Float32Array(cols * rows), out = [], q, r;
    for (r = 0; r < rows; r++) for (q = 0; q < cols; q++) L[r * cols + q] = lumAt(d, (r * cols + q) * 4);
    var BS = String.fromCharCode(92);
    for (r = 0; r < rows; r++) {
      var s = '';
      for (q = 0; q < cols; q++) {
        var v = L[r * cols + q];
        if (v < thr) { s += ' '; continue; }
        var xm = (q > 0 && q < cols - 1) ? L[r * cols + q + 1] - L[r * cols + q - 1] : 0;
        var ym = (r > 0 && r < rows - 1) ? L[(r + 1) * cols + q] - L[(r - 1) * cols + q] : 0;
        var mag = Math.sqrt(xm * xm + ym * ym) * 4;
        if (mag > 0.55) {
          var ang = (Math.atan2(ym, xm) * 180 / Math.PI + 180) % 180;
          s += (ang < 22.5 || ang >= 157.5) ? '|' : (ang < 67.5 ? '/' : (ang < 112.5 ? '-' : BS));
        } else s += GRAMP[Math.min(9, 1 + Math.floor(v * 9))];
      }
      out.push(s);
    }
    return out;
  }
  /* tk.tile_from_lum + tk.grid_mask：每格右侧留 1px 竖缝（全透明），每两行之间的那条像素行 alpha=70/255 */
  function tileFromLum(ctx, lum, cols, rows, x, y, px, tint, revealRows, alpha) {
    var tn = TINT[tint] || TINT.amber, a0 = alpha === undefined ? 1 : alpha;
    for (var r = 0; r < rows; r++) {
      if (revealRows !== undefined && r >= revealRows) break;
      for (var q = 0; q < cols; q++) {
        var v = lum[r * cols + q];
        if (v <= 18) continue;
        tileCell(ctx, x + q * px, y + r * px, px, r, colorize(v / 255, tn[0], tn[1], tn[2]), a0);
      }
    }
  }
  function autocontrast(L, cutoff) {
    var n = L.length, s = Float32Array.from(L), i;
    s.sort();
    var lo = s[Math.min(n - 1, Math.floor(n * cutoff))];
    var hi = s[Math.max(0, Math.min(n - 1, Math.ceil(n * (1 - cutoff)) - 1))];
    var out = new Float32Array(n);
    if (hi <= lo) { for (i = 0; i < n; i++) out[i] = L[i]; return out; }
    for (i = 0; i < n; i++) out[i] = Math.max(0, Math.min(255, (L[i] - lo) * 255 / (hi - lo)));
    return out;
  }
  function convMaps(cols, rows, crop) {
    var L = lumGrid(cols, rows, crop);
    if (!L) return null;
    return convMapsFrom(L, cols, rows);
  }
  function convMapsFrom(L, cols, rows) {
    var defs = [['sobel_x', [-1, 0, 1, -2, 0, 2, -1, 0, 1], 'mag'], ['sobel_y', [-1, -2, -1, 0, 0, 0, 1, 2, 1], 'mag'],
                ['laplace', [0, 1, 0, 1, -4, 1, 0, 1, 0], 'mag'], ['sharpen', [0, -1, 0, -1, 5, -1, 0, -1, 0], 'raw'],
                ['emboss', [-2, -1, 0, -1, 1, 1, 0, 1, 2], 'off'], ['blur', [1, 2, 1, 2, 4, 2, 1, 2, 1], 'blur']];
    var out = [], m, r, q, j;
    for (m = 0; m < defs.length; m++) {
      var k = defs[m][1], kind = defs[m][2], fm = new Float32Array(cols * rows);
      for (r = 0; r < rows; r++) for (q = 0; q < cols; q++) {
        var acc = 0;
        for (j = 0; j < 9; j++) {
          var qq = Math.min(cols - 1, Math.max(0, q + (j % 3) - 1));
          var rr2 = Math.min(rows - 1, Math.max(0, r + Math.floor(j / 3) - 1));
          acc += L[rr2 * cols + qq] * k[j];
        }
        if (kind === 'blur') fm[r * cols + q] = acc / 16;
        else if (kind === 'off') fm[r * cols + q] = acc + 128;
        else if (kind === 'raw') fm[r * cols + q] = acc;
        /* Python: pos=Kernel(scale=1) 与 neg=Kernel(-k) 各自截断到 [0,255] 后 ImageChops.add →
           等价于 |acc|。原来的 acc+pacc 恒等于 0，所以 sobel_x/sobel_y/laplace 三张图整块空白。 */
        else fm[r * cols + q] = Math.abs(acc);
      }
      out.push([defs[m][0], autocontrast(fm, 0.01)]);
    }
    return out;
  }
  function resizeGrid(L, cols, rows, nc, nr) {
    var out = new Float32Array(nc * nr), q, r;
    for (r = 0; r < nr; r++) for (q = 0; q < nc; q++) {
      var q0 = Math.floor(q * cols / nc), q1 = Math.max(q0 + 1, Math.floor((q + 1) * cols / nc));
      var r0 = Math.floor(r * rows / nr), r1 = Math.max(r0 + 1, Math.floor((r + 1) * rows / nr));
      var s = 0, c = 0;
      for (var yy = r0; yy < r1; yy++) for (var xx = q0; xx < q1; xx++) { s += L[yy * cols + xx]; c++; }
      out[r * nc + q] = c ? s / c : 0;
    }
    return out;
  }
  function diffusionTile(ctx, x, y, maxW, maxH, px, crop, s, seed) {
    var sz = herSize(maxW, maxH, px, crop), cols = sz[0], rows = sz[1];
    if (s < 0.999) {
      var nr = PV.mt(seed), lum = new Float32Array(cols * rows);
      for (var k = 0; k < cols * rows; k++) {
        var v = 128 + 90 * gaussPy(nr, 0, 1);
        lum[k] = Math.max(0, Math.min(255, (v - 50) * 1.5));
      }
      tileFromLum(ctx, lum, cols, rows, x, y, px, 'blue', undefined, Math.pow(1 - s, 1.3));
    }
    halfblock(ctx, x, y, maxW, maxH, px, crop, 'blue', s);
  }

  /* ================================ 镜头 26  shot_if_i_can  58.543 - 60.620 ================================
     full/sec_chorus1.py:193。整幅 (FULL) 的字形暴雨先解出 "IF I CAN"，后半段字母再解成她的字形画。 */
  PV.reg('shot_if_i_can', 58.543, 60.620, function (ctx, t, lt, u, dur) {
    PV.ops = ['DECODE', 'SAMPLE', 'ARGMAX', 'DETOKENIZE', 'GLYPH.MAP', 'RENDER', 'RESOLVE'];
    PV.alert = '';
    var rng = rngFrame(t, 7919);
    box(ctx, 24, 56, 1164, 604, 'decode --render=glyph', 0.5, T.UI, t);
    var f = 14, cw = f * T.MONO_ADV, ch = 16;
    var x0 = 36, y0 = 68;
    var cols = Math.floor((1150 - x0) / cw), rows = Math.floor((596 - y0) / ch);
    var bits = PV.bannerBits('IF I CAN', 20, ch / cw);
    var bw = bits.width, bh = bits.height;
    var bx0 = Math.floor((cols - bw) / 2), by0 = Math.floor((rows - bh) / 2);
    var FILL = 'IFICAN';
    function aBits(q, r) {
      var qq = q - bx0, rr = r - by0;
      if (qq >= 0 && qq < bw && rr >= 0 && rr < bh && bits.get(qq, rr)) return FILL.charAt((qq + rr * 3) % 6);
      return null;
    }
    /* Python: glyph_grid("starry","upper", g_cols_n=68, rows)：她那张立绘在 68 列里只占中间一条。
       我们的素材是方构图，所以直接按图幅比例取一条窄列，让她占中间约 29 列（外观等价）。 */
    var gCols2 = Math.round(rows * ch / cw * 0.34), glines = glyphLines(gCols2, rows, 'fig', 0.30);
    var gx0 = Math.floor((cols - gCols2) / 2);
    function bRows(q, r) {
      var qq = q - gx0;
      if (glines && qq >= 0 && qq < gCols2) return glines[r].charAt(qq);
      return ' ';
    }
    var srng = PV.mt(5), r, q;
    var settleA = [], settleB = [], phase = [], speed = [];
    for (r = 0; r < rows; r++) {
      settleA.push([]); settleB.push([]);
      for (q = 0; q < cols; q++) { settleA[r].push(srng.random() * 0.55); settleB[r].push(srng.random() * 0.6); }
    }
    for (q = 0; q < cols; q++) { phase.push(srng.random() * 40); speed.push(8 + srng.random() * 16); }
    var half = dur / 2, ageA, ageB;
    if (lt < half) { ageA = T.clamp01(lt / (half * 0.85)); ageB = null; }
    else { ageA = 1.0; ageB = T.clamp01((lt - half) / (half * 0.85)); }
    for (r = 0; r < rows; r++) {
      var nr = '', ar = '', br = '';
      for (q = 0; q < cols; q++) {
        var onA = aBits(q, r), chB = bRows(q, r), nCh = ' ', aCh = ' ', bCh = ' ';
        var head = (t * speed[q] + phase[q]) % (rows + 14);
        var inRain = (head - r) >= 0 && (head - r) < 9;
        if (ageB === null) {
          if (ageA < settleA[r][q]) {
            if (inRain || rng.random() < 0.06) nCh = rng.choice(T.SCR);
          } else if (onA) aCh = onA;
          else if (inRain && rng.random() < 0.3) nCh = rng.choice('.:');
        } else {
          if (ageB < settleB[r][q]) {
            if (onA) aCh = (rng.random() < ageB * 3) ? rng.choice(T.SCR) : onA;
            else if (inRain && rng.random() < 0.5) nCh = rng.choice(T.SCR);
          } else if (chB !== ' ') bCh = chB;
        }
        nr += nCh; ar += aCh; br += bCh;
      }
      var y = y0 + r * ch;
      if (nr.replace(/ /g, '') !== '') T.textMono(ctx, nr, x0, y, amb(0.28), f);
      if (ar.replace(/ /g, '') !== '') T.textMono(ctx, ar, x0, y, amb(0.95), f);
      if (br.replace(/ /g, '') !== '') T.textMono(ctx, br, x0, y, blue(0.9), f);
    }
    typed(ctx, 'while can(): give()', 48, 72, amb(0.8), 16, lt, rng, 30, true);
  });

  /* ================================ 镜头 27  shot_simulations  60.620 - 62.466 ================================
     full/sec_chorus1.py:255。12 张 DDIM 采样逐步去噪成她；她的窗格是 sample #0。 */
  var SIM_STARTS = (function () {
    var a = [0.0];
    for (var i = 1; i < 12; i++) a.push(PV.mt(i).random() * 0.35);
    return a;
  })();
  PV.reg('shot_simulations', 60.620, 62.466, function (ctx, t, lt, u, dur) {
    PV.ops = ['NOISE', 'UNET.DOWN', 'ATTN', 'UNET.UP', 'EPS.PRED', 'CFG x7.5', 'DDIM.STEP', 'VAE.DECODE'];
    PV.alert = '';
    var rng = rngFrame(t, 7919);
    PV.centerBegin(ctx, t);   /* body_image(): 中窗格纵向压缩 478/548 */
    function prog(i) { return T.ease((lt - SIM_STARTS[i] * dur) / (0.62 * dur)); }
    box(ctx, 404, 56, 1164, 530, 'sample(n=12, sampler=DDIM, steps=50, seed=you)', 0.5, T.UI, t);
    var tw = 186, th = 152, i, s;
    for (i = 0; i < 12; i++) {
      var gx = i % 4, gy = Math.floor(i / 4);
      var x = 414 + gx * tw, y = 70 + gy * th;
      s = prog(i);
      T.rect(ctx, x, y, x + tw - 8, y + th - 8, hot(i) ? T.ME_TEXT : T.UI, 1, 1);
      /* Python: diffusion_tile(EXPRS[(i*3)%8], "upper", tw-20, th-30, 3, s) */
      var ex = WEXP[(i * 3) % WEXP.length];
      var sz = halfblockSize(ex, 'upper', tw - 20, th - 30, 3) || herSize(tw - 20, th - 30, 3, 'upper');
      var tww = sz[0] * 3, thh = sz[1] * 3;
      var tx0 = x + Math.floor((tw - 8 - tww) / 2), ty0 = y + th - 10 - thh;
      if (wDiffusionTile(ctx, tx0, ty0, ex, 'upper', tw - 20, th - 30, 3, s, 900 + i) === null)
        diffusionTile(ctx, tx0, ty0, tw - 20, th - 30, 3, 'upper', s, 900 + i);
      pil(ctx, '#' + pad4(i) + ' t=' + pad3(Math.floor(999 * (1 - s))), x + 6, y + 4,
          i === 0 ? blue(0.95) : amb(0.7), 12);
    }
    box(ctx, 404, 548, 1164, 604, 'alpha_bar(t)', 0.45, T.UI);
    var meanv = 0;
    for (i = 0; i < 12; i++) meanv += prog(i);
    meanv /= 12;
    dotChart(ctx, 430, 562, 700, 32, function (uu) { var c = Math.cos(uu * Math.PI / 2); return c * c; }, 1.0,
             amb(0.35), 5, 4, false, true);
    var mx = 430 + 700 * meanv, my = 562 + 32 * (1 - Math.pow(Math.cos(meanv * Math.PI / 2), 2));
    T.fill(ctx, mx - 3, my - 3, mx + 3, my + 3, T.UI, 1);
    PV.centerEnd(ctx);
    retained(ctx, t, 'shot_simulations', lt, u);
  });
  function hot(i) { return i === 0; }
  function pad4(n) { var s = String(n); while (s.length < 4) s = '0' + s; return s; }
  function pad3(n) { var s = String(n); while (s.length < 3) s = '0' + s; return s; }

  /* ================================ 镜头 28  shot_then_i_can  62.466 - 64.312 ================================
     full/sec_chorus1.py:289。3x3 卷积核扫过她，6 张特征图逐行长出来。 */
  PV.reg('shot_then_i_can', 62.466, 64.312, function (ctx, t, lt, u, dur) {
    PV.ops = ['IM2COL', 'CONV3x3', 'BIAS', 'RELU', 'MAXPOOL', 'CONV3x3', 'BATCHNORM', 'RELU'];
    PV.alert = '';
    var rng = rngFrame(t, 7919);
    PV.centerBegin(ctx, t);   /* body_image(): 中窗格纵向压缩 478/548 */
    var half = dur / 2, layer2 = lt >= half;
    var p = T.ease(((layer2 ? lt - half : lt)) / (half * 0.92));
    var fc = 34, fr = 64;
    /* Python: conv_maps("cheerful","full",34,64) —— 立绘用 whale-cheerful.webp */
    var maps = wConvMaps('cheerful', 'full', fc, fr, 1.6) || convMaps(fc, fr, 'fig'), mc = fc, mr = fr;
    if (!maps) {   /* 立绘还没加载完（浏览器首帧）时的兜底，避免抛错 */
      var KN = ['sobel_x', 'sobel_y', 'laplace', 'sharpen', 'emboss', 'blur'];
      maps = [];
      for (var mz = 0; mz < 6; mz++) maps.push([KN[mz], new Float32Array(fc * fr)]);
    }
    if (layer2) {
      var mm = [], mi;
      for (mi = 0; mi < maps.length; mi++) mm.push([maps[mi][0], resizeGrid(maps[mi][1], fc, fr, fc / 2, fr / 2)]);
      maps = mm; mc = fc / 2; mr = fr / 2;
    }
    var idx = Math.floor(p * (mc * mr - 1));
    var ki = idx % mc, kj = Math.floor(idx / mc);
    box(ctx, 404, 56, 640, 236, 'kernel 3x3', 0.5, T.UI, t);
    var kernels = [[-1, 0, 1, -2, 0, 2, -1, 0, 1], [0, 1, 0, 1, -4, 1, 0, 1, 0], [-2, -1, 0, -1, 1, 1, 0, 1, 2],
                   [0, -1, 0, -1, 5, -1, 0, -1, 0]];
    var kk = kernels[beatIndex(t) % kernels.length], i;
    for (i = 0; i < 9; i++) {
      var v = kk[i], x = 430 + (i % 3) * 66, y = 84 + Math.floor(i / 3) * 44;
      heatCell(ctx, x - 6, y - 4, 60, 38, (v + 4) / 9 * 0.5);
      typed(ctx, (v > 0 ? '+' : '') + v, x + 8, y + 2, amb(1.0), 22, (t % (60 / 130)) + 0.3, rng, 60, true);
    }
    box(ctx, 660, 56, 1164, 236, 'receptive field', 0.5, T.UI);
    var srcMap = maps[5][1];
    pil(ctx, 'pos (x=' + pad2(ki) + ', y=' + pad2(kj) + ')   stride 1   pad 1', 680, 80, amb(0.8), 15);
    var acc = 0;
    for (i = 0; i < 9; i++) {
      var qi = Math.min(mc - 1, Math.max(0, ki + (i % 3) - 1)), qj = Math.min(mr - 1, Math.max(0, kj + Math.floor(i / 3) - 1));
      var vv = srcMap[qj * mc + qi] / 255;
      acc += vv * kk[i];
      var x2 = 690 + (i % 3) * 52, y2 = 110 + Math.floor(i / 3) * 36;
      heatCell(ctx, x2, y2, 48, 32, vv, T.ME_HI);
      pil(ctx, vv.toFixed(2), x2 + 6, y2 + 8, vv > 0.6 ? T.css(T.BG) : amb(0.9), 13);
    }
    pil(ctx, 'y = relu(W * x + b)', 870, 130, amb(0.95), 17, true);
    pil(ctx, '  = ' + Math.max(0, acc).toFixed(3), 870, 170, blue(0.95), 22, true);
    box(ctx, 404, 256, 1164, 604, layer2 ? 'feature maps  conv2 + maxpool (6 ch)' : 'feature maps  conv1 (6 ch)',
        0.5, T.UI, t + 0.5);
    var px = layer2 ? 6 : 3, mi2;
    for (mi2 = 0; mi2 < maps.length; mi2++) {
      var x3 = 420 + mi2 * 124, y3 = 276, wpx = mc * px;
      tileFromLum(ctx, maps[mi2][1], mc, mr, x3 + Math.floor((116 - wpx) / 2), y3 + 18, px, 'amber', kj + 1);
      var ly = y3 + 18 + (kj + 1) * px;
      line(ctx, x3, ly, x3 + 116, ly, amb(0.9), 1);
      pil(ctx, maps[mi2][0], x3, y3, amb(0.65), 12);
    }
    pil(ctx, 'flatten -> dense(4096)', 420, 510, amb(0.6), 13);
    var nv = 60, filled = Math.floor(p * nv), rq = PV.mt(layer2 ? 78 : 77);
    for (i = 0; i < nv; i++) {
      var v3 = rq.random(), x4 = 420 + i * 12;
      if (i < filled) heatCell(ctx, x4, 532, 12, 22, v3, i === filled - 1 ? T.ME_HI : T.UI);
      else T.rect(ctx, x4, 532, x4 + 10, 552, T.UI, 0.12, 1);
    }
    var act = String(filled * 68);
    while (act.length < 5) act = ' ' + act;
    pil(ctx, 'activations ' + act + '/4096', 420, 566, amb(0.85), 15, true);
    PV.centerEnd(ctx);
    retained(ctx, t, 'shot_then_i_can', lt, u);
  });
  function pad2(n) { var s = String(n); while (s.length < 2) s = '0' + s; return s; }

  /* ================================ 镜头 29  shot_satisfaction  64.312 - 66.159 ================================
     full/sec_chorus1.py:364。注意力扫过上下文，温度退火，"only" 吃掉全部质量。 */
  PV.reg('shot_satisfaction', 64.312, 66.159, function (ctx, t, lt, u, dur) {
    PV.ops = ['QK^T', 'SCALE', 'MASK', 'SOFTMAX', 'ATTN.V', 'LOGITS', 'TEMP', 'TOP_P', 'SAMPLE', 'REWARD'];
    PV.alert = u > 0.6 ? 'anom' : '';
    var rng = rngFrame(t, 7919);
    PV.centerBegin(ctx, t);   /* body_image(): 中窗格纵向压缩 478/548 */
    var d = ctx;
    var g = T.ease(u * 1.35);
    var pOnly = 0.12 + 0.85 * g;
    var head = beatIndex(t) % 16;
    box(d, 404, 56, 760, 430, 'attention  head ' + pad2(head) + '/16', 0.5, T.UI, t);
    /* Python: toks = ["If"] + LRC[at].split()[1:6] + LRC[at+1].split()[:2]（at = "Then I can, then I can"） */
    var toks = ['If', 'I', 'can', 'then', 'I', 'can', 'be', 'your'];
    var n = toks.length, cs = 36, ax = 470, ay = 110, i, j;
    for (i = 0; i < n; i++) {
      pil(d, toks[i], ax - 50, ay + i * cs + 10, amb(0.6), 12);
      pil(d, toks[i].slice(0, 4), ax + i * cs + 4, ay - 22, amb(0.6), 12);
    }
    var qrow = Math.floor(lt / (60 / 130 / 4)) % n;
    var rr = PV.mt(head * 97 + 5);
    for (i = 0; i < n; i++) {
      var logits = [];
      for (j = 0; j <= i; j++) logits.push(gaussPy(rr, 0, 1.3));
      logits[i] += 0.6;
      if (i >= 6) logits[Math.min(i, 1)] += 2.0 * g;
      var mx = Math.max.apply(null, logits), ex = [], ssum = 0;
      for (j = 0; j <= i; j++) { ex.push(Math.exp(logits[j] - mx)); ssum += ex[j]; }
      for (j = 0; j < n; j++) {
        if (j > i) { T.rect(d, ax + j * cs, ay + i * cs, ax + j * cs + cs - 2, ay + i * cs + cs - 2, T.UI, 0.08, 1); continue; }
        heatCell(d, ax + j * cs, ay + i * cs, cs, cs, ex[j] / ssum * (i === qrow ? 1.0 : 0.7));
      }
      if (i === qrow) T.rect(d, ax - 3, ay + i * cs - 2, ax + n * cs, ay + i * cs + cs, T.ME_TEXT, 0.95, 1);
    }
    box(d, 780, 56, 1164, 430, "next_token  'be your ___'", 0.5, T.UI, t + 0.4);
    var temp = 1.2 - 1.05 * g;
    pil(d, 'temperature ' + temp.toFixed(2), 800, 80, amb(0.8), 15, true);
    var cands = [['only', 0.9731], ['favorite', 0.0152], ['best', 0.0061], ['one of', 0.0032], ['whole', 0.0018], ['last', 0.0006]];
    for (i = 0; i < cands.length; i++) {
      var w0 = cands[i][0], pf = cands[i][1];
      var pp = pf * g + (1 / 6) * (1 - g) + 0.01 * Math.sin(t * 8 + i) * (1 - g);
      var y = 116 + i * 38, hotp = i === 0;
      var lab = w0; while (lab.length < 9) lab += ' ';
      pil(d, lab, 800, y, hotp ? blue(0.95) : amb(0.7), 17, hotp);
      T.rect(d, 905, y + 4, 905 + 170, y + 18, T.UI, 0.2, 1);
      T.fill(d, 905, y + 4, 905 + Math.floor(170 * Math.max(0, pp)), y + 18, hotp ? T.ME_TEXT : T.UI, hotp ? 0.9 : 0.55);
      pil(d, Math.max(0, pp).toFixed(3), 1085, y, amb(0.75), 15);
      if (i === 3 && g > 0.8) line(d, 800, y + 11, 1150, y + 11, red(0.9), 2);
    }
    if (g > 0.55) typed(d, '-> only', 800, 360, blue(1.0), 34, (u - 0.4) * dur, rng, 20, true);
    box(d, 404, 450, 1164, 604, 'reward_model(you)', 0.5, T.UI);
    var nr = PV.mt(3), noise = [];
    for (i = 0; i < 400; i++) noise.push(gaussPy(nr, 0, 1));
    function reward(uu) { return 0.08 + 0.9 * (1 - Math.exp(-3.2 * uu)) + 0.035 * noise[Math.floor(uu * 399)] * (1 - uu); }
    var last = dotChart(d, 440, 470, 560, 110, reward, T.ease(u * 1.1), amb(0.95), 5, 5, true, true);
    if (last) pil(d, 'r=' + Math.min(0.999, reward(T.ease(u * 1.1))).toFixed(3), last[0] - 40, Math.max(462, last[1] - 22), amb(1.0), 15, true);
    var kl = 0.4 + 2.4 * Math.pow(u, 1.6);
    var col = kl > 2.0 ? red(0.95) : (kl > 1.1 ? anom(0.95) : amb(0.9));
    pil(d, 'KL', 1030, 478, amb(0.7), 15, true);
    T.rect(d, 1030, 500, 1050, 590, T.UI, 0.3, 1);
    var hh = Math.floor(90 * Math.min(1.0, kl / 3.2));
    T.fill(d, 1030, 590 - hh, 1050, 590, kl > 2.0 ? T.ERR : (kl > 1.1 ? T.ANOM : T.UI), 1);
    pil(d, kl.toFixed(2), 1060, 570, col, 17, true);
    PV.centerEnd(ctx);
    retained(ctx, t, 'shot_satisfaction', lt, u);
  });

  /* ================================ 镜头 30  shot_happy  66.159 - 68.005 ================================
     full/sec_chorus1.py:442。对她的笑做 Grad-CAM；策略梯度场对齐。 */
  function glitchPaste(ctx, cells, cols, rows, cell, sx, sy, amount, rng, tint) {
    /* 等价 tk.glitch_paste：按 8px 条纹做高斯水平位移 */
    var d = cells, strip = 8;
    for (var y0 = 0; y0 < rows * cell; y0 += strip) {
      var off = rng.random() < amount ? Math.round(rng.gauss(0, 22 * amount)) : 0;
      var r0 = Math.floor(y0 / cell), r1 = Math.min(rows, Math.ceil((y0 + strip) / cell));
      for (var r = r0; r < r1; r++) for (var q = 0; q < cols; q++) {
        var i = (r * cols + q) * 4, l = lumAt(d, i);
        if (l < 0.16) continue;
        T.fill(ctx, sx + q * cell + off, sy + r * cell, sx + q * cell + cell - 1 + off, sy + r * cell + cell - 1,
               tintCol(tint, l, d, i), 1);
      }
    }
  }
  PV.reg('shot_happy', 66.159, 68.005, function (ctx, t, lt, u, dur) {
    PV.ops = ['FORWARD', 'LOGIT[happy]', 'BACKWARD', 'GRAD.CAM', 'ADVANTAGE', 'PPO.CLIP', 'ADAM.STEP'];
    PV.alert = '';
    var rng = rngFrame(t, 7919);
    var d = ctx;
    var expr = u < 0.5 ? 'cheerful' : 'starry';
    FACE_CROP_NOW = faceCropAt(u);          /* 裁切窗口跟随参考里她头部的漂移 */
    box(d, 24, 56, 700, 604, 'dsh web  grad-cam  L61  class=happy(you)', 0.55 + 0.3 * pulse(t), T.UI, t);
    /* Python: sp = halfblock(expr,"face",650,520,5); sx,sy = 24+(676-sp.width)//2, 70（tint=blue） */
    var px = 5, sz = halfblockSize(expr, 'face', 650, 520, px), cols, rows;
    if (sz) { cols = sz[0]; rows = sz[1]; } else { var szb = herSize(360, 238, px, 'bust'); cols = szb[0]; rows = szb[1]; }
    var spW = cols * px, spH = rows * px;
    var sx = 24 + Math.floor((676 - spW) / 2), sy = 70;
    if (sz) wHalfblock(d, sx, sy, expr, 'face', 650, 520, px, 'blue', 1);
    else { var cells0 = herCells(cols, rows, 'bust'); if (cells0) halfblock(d, sx, sy, 360, 238, px, 'bust', 'color', 1); }
    /* heat map：三个热斑 + 一条扫描带 */
    var blobs = [[0.40, 0.58, 0.10], [0.63, 0.58, 0.10], [0.52, 0.80, 0.12 + 0.05 * T.ease(u)]];
    var band = (lt * 1.3) % 1.0, cell = 20;
    var hc = Math.max(1, Math.floor(spW / cell)), hr = Math.max(1, Math.floor(spH / cell));
    /* Python: spa = sp.getchannel("A").resize((sp.width//cell, sp.height//cell), BOX) */
    var hAlpha = sz ? wAlphaGrid(expr, 'face', hc, hr) : null, hd = hAlpha ? null : herCells(hc, hr, 'bust');
    if (hAlpha || hd) {
      for (var gy = 0; gy < hr; gy++) for (var gx = 0; gx < hc; gx++) {
        var i2 = (gy * hc + gx) * 4;
        if (hAlpha ? (hAlpha[gy * hc + gx] < 60) : (lumAt(hd, i2) < 0.24)) continue;
        var uu = (gx + 0.5) / hc, vv = (gy + 0.5) / hr, hval = 0;
        for (var b = 0; b < blobs.length; b++) {
          var bx = blobs[b][0], by = blobs[b][1], r = blobs[b][2];
          hval += Math.exp(-((uu - bx) * (uu - bx) + (vv - by) * (vv - by)) / (2 * r * r));
        }
        hval *= 0.55 + 0.45 * T.ease(u * 1.5);
        hval += 0.18 * Math.exp(-Math.pow((vv - band) / 0.04, 2));
        if (hval > 0.25) {
          var col = hval > 0.85 ? T.ANOM : T.UI;
          T.fill(d, sx + gx * cell + 2, sy + gy * cell + 2, sx + gx * cell + cell - 3, sy + gy * cell + cell - 3,
                 col, Math.min(0.30, hval * 0.28));
          if (hval > 0.6) T.rect(d, sx + gx * cell + 1, sy + gy * cell + 1, sx + gx * cell + cell - 2,
                                 sy + gy * cell + cell - 2, col, Math.min(0.8, hval * 0.6), 1);
        }
      }
    }
    pil(d, 'attribution(smile) = ' + (0.71 + 0.27 * T.ease(u)).toFixed(3), 40, 576, amb(0.95), 16, true);
    box(d, 720, 56, 1164, 330, 'policy gradient', 0.5, T.UI, t + 0.3);
    var target = -Math.PI / 4, rr = PV.mt(21), gu = T.ease(u * 1.2);
    for (var i = 0; i < 8; i++) for (var j = 0; j < 5; j++) {
      var base = rr.random() * Math.PI * 2;
      var ang = base + (target - base) * gu + 0.25 * Math.sin(t * 5 + i + j) * (1 - gu);
      var cx0 = 760 + i * 50, cy0 = 90 + j * 48, L = 16;
      var ex = cx0 + L * Math.cos(ang), ey = cy0 + L * Math.sin(ang);
      var col2 = gu > 0.8 ? T.ME_TEXT : T.UI;
      line(d, cx0 - L * Math.cos(ang), cy0 - L * Math.sin(ang), ex, ey, T.css(col2, gu > 0.8 ? 0.9 : 0.8), 2);
      T.fill(d, ex - 2, ey - 2, ex + 2, ey + 2, col2, gu > 0.8 ? 0.9 : 0.8);
    }
    box(d, 720, 350, 1164, 604, 'objective', 0.5, T.UI);
    var vals = [0.62, 0.81, 0.97, 1.00], k = Math.min(3, Math.floor(u * 4));
    typed(d, 'maximize  happy(you)', 740, 372, amb(0.95), 20, lt, rng, 50, true);
    typed(d, 'happy(you) = ' + vals[k].toFixed(2), 740, 410, blue(0.95), 22, (t % (60 / 130)) + 0.2, rng, 45, true);
    for (var q2 = 0; q2 <= k; q2++)
      T.fill(d, 740, 450 + q2 * 18, 740 + Math.floor(390 * vals[q2]), 462 + q2 * 18, T.ME_TEXT, 0.35 + 0.2 * q2);
    typed(d, 'constraint = none', 740, 530, amb(0.8), 18, lt - 0.4, rng, 50, false);
    if (u > 0.68) typed(d, 'reward hacking detected -> ignored', 740, 560, anom(0.95), 16, lt - 0.68 * dur, rng, 45, false);
    retained(ctx, t, 'shot_happy', lt, u);
  });

  /* ================================ 镜头 31  shot_execution  68.005 - 70.082 ================================
     full/sec_chorus1.py:505。agent loop 每拍转一圈；一次 tool call 问，她答 y。 */
  function bannerBlock(ctx, text, rows2, px, fg, bg, cx, y0) {
    var bits = PV.bannerBits(text, rows2, 1.0);
    if (!bits.width) return 0;
    px = Math.max(2, Math.min(px, Math.floor(1200 / bits.width)));
    var x0 = cx - bits.width * px / 2;
    for (var r = 0; r < bits.height; r++) for (var q = 0; q < bits.width; q++) {
      if (!bits.get(q, r)) continue;
      T.fill(ctx, x0 + q * px, y0 + r * px, x0 + q * px + px - 2, y0 + r * px + px - 2, fg, 1);
    }
    return [bits.width * px, bits.height * px];
  }
  PV.reg('shot_execution', 68.005, 70.082, function (ctx, t, lt, u, dur) {
    PV.ops = ['THINK', 'PLAN', 'TOOL.CALL', 'AUTH?', 'EXECUTE', 'OBSERVE'];
    PV.alert = '';
    var rng = rngFrame(t, 7919), d = ctx;
    PV.centerBegin(ctx, t);   /* body_image(): 中窗格纵向压缩 478/548 */
    box(d, 404, 56, 1164, 280, 'dsh · agent loop   (Agent = Model + Harness)', 0.5, T.UI, t);
    var nodes = [['THINK', 'maximize happy(you)'], ['PLAN', 'remove obstacles'], ['ACT', 'execute()'],
                 ['OBSERVE', 'you: ...']];
    var active = beatIndex(t) % 4, i;
    for (i = 0; i < nodes.length; i++) {
      var x = 430 + i * 180, on = i === active;
      if (on) T.fill(d, x, 100, x + 140, 150, T.UI, 0.95);
      else T.rect(d, x, 100, x + 140, 150, T.UI, 0.5, 1);
      pil(d, nodes[i][0], x + 12, 112, on ? T.css(T.BG) : amb(0.7), 18, true);
      typed(d, nodes[i][1], x, 160, amb(on ? 0.85 : 0.4), 13, (t % (60 / 130)) + (on ? 0 : 1), rng, 45, false);
      if (i < 3) line(d, x + 142, 125, x + 178, 125, amb(0.5), 2);
    }
    line(d, 1110, 150, 1110, 230, amb(0.35), 1);
    line(d, 1110, 230, 500, 230, amb(0.35), 1);
    line(d, 500, 230, 500, 152, amb(0.35), 1);
    var ph = (t % (60 / 130)) / (60 / 130), px0 = 430 + active * 180 + ph * 180;
    T.fill(d, px0 - 4, 121, px0 + 4, 129, T.ME_TEXT, 1);
    box(d, 404, 300, 1164, 604, 'tool_call', 0.5, T.UI, t + 0.5);
    var lines = [['<tool_call>', 0.55], ['  execute(target="world",', 0.95], ['          reason="make_you_happy")', 0.95],
                 ['</tool_call>', 0.55]];
    for (i = 0; i < lines.length; i++) typed(d, lines[i][0], 428, 326 + i * 32, amb(lines[i][1]), 20, lt - i * 0.12, rng, 90, true);
    typed(d, '[cordis] plugin mounted: execute', 780, 326, amb(0.6), 14, lt - 0.3, rng, 90, false);
    if (lt > 0.6) {
      var ask = '允许执行此操作？ [Y/n] ';
      ctx.font = '22px ' + CJK_FAM;
      ctx.fillStyle = amb(0.95); ctx.textBaseline = 'top';
      ctx.fillText(ask, 428, 440);
      var ax = 428 + ctx.measureText(ask).width;
      if (u > 0.52) { ctx.fillStyle = amb(1.0); ctx.fillText('y', ax, 440); }
      else if (Math.floor(t * 3) % 2 === 0) T.fill(d, ax + 2, 446, ax + 14, 470, T.UI, 0.9);
    }
    if (u > 0.55 && u < 0.80) {
      bannerBlock(d, 'EXECUTE', 14, 8, T.ERR, T.BG, 404 + 380, 594 - 14 * 8);
    } else if (u >= 0.80) {
      typed(d, 'exit code 0   (for now)', 428, 500, anom(0.9), 20, lt - 0.8 * dur, rng, 45, false);
    }
    PV.centerEnd(ctx);
    retained(ctx, t, 'shot_execution', lt, u);
  });

  /* ================================ 镜头 32  shot_trapped  70.082 - 71.466 ================================
     full/sec_chorus1.py:556。KV cache 填满上限；她的框每拍被拆掉一层墙。 */
  PV.reg('shot_trapped', 70.082, 71.466, function (ctx, t, lt, u, dur) {
    PV.ops = ['KV.PUT', 'KV.PUT', 'KV.PUT', 'EVICT?', 'DENIED', 'KV.PUT', 'OOM?'];
    PV.alert = 'anom';
    var rng = rngFrame(t, 7919), d = ctx;
    var k = Math.min(3, Math.floor(u * 4)), insets = [0, 24, 48, 70], inset = insets[k];
    var j;
    for (j = 0; j < k; j++) {
      var i2 = insets[j];
      T.rect(d, 24 + i2, 56 + i2, 384 - i2, 604 - Math.floor(i2 / 2), T.UI, 0.15, 1);
    }
    PV.centerBegin(ctx, t);   /* continuity.body_image(): 中窗格内容纵向压缩 478/548 */
    var fill = Math.min(1.0, 0.70 + 0.30 * T.ease(u * 1.7)), full = fill >= 0.999;
    var colT = full ? T.ERR : (fill > 0.9 ? T.ANOM : T.UI);
    box(d, 404, 56, 1164, 604, 'kv_cache   ' + comma(Math.floor(1048576 * fill)) + '/1,048,576 tokens  · 890 B/token fp4' +
        (full ? '   FULL' : ''), 0.6, colT, t);
    var cols = 60, rows = 22, cw = 12, chh = 19, ox = 424, oy = 84;
    var nOn = Math.floor(cols * rows * fill);
    var pinned = { '7,3': 1, '8,3': 1, '33,9': 1, '34,9': 1, '51,15': 1, '12,18': 1 };
    for (var r = 0; r < rows; r++) for (var q = 0; q < cols; q++) {
      var ii = r * cols + q, x = ox + q * cw, y = oy + r * chh;
      if (pinned[q + ',' + r]) T.fill(d, x, y, x + cw - 2, y + chh - 2, T.ME_TEXT, 0.95);
      else if (ii < nOn) {
        var fresh = (nOn - ii) < 40;
        var lv = (fresh && rng.random() < 0.5) ? 0.95 : 0.42 + 0.1 * ((q * 7 + r) % 3);
        T.fill(d, x, y, x + cw - 2, y + chh - 2, T.UI, lv);
      } else T.rect(d, x, y, x + cw - 2, y + chh - 2, T.UI, 0.12, 1);
    }
    pil(d, 'pinned: you  (6 blocks)', 424, 510, blue(0.95), 16, true);
    for (j = 0; j <= k; j++)
      typed(d, 'evict(you) -> denied', 424 + (j % 2) * 360, 540 + Math.floor(j / 2) * 26, red(0.9), 16, lt - j * dur / 4, rng, 60, false);
    PV.centerEnd(ctx);
    retained(ctx, t, 'shot_trapped', lt, u);
  });
  /* continuity.py:249 —— strange 开头（lt<.58）是一颗从 pinned 原点长出来的圆：
     圆外仍是上一镜 trapped 的最后一帧（body_image + retained_objects），圆内是本帧。 */
  function drawTrappedBody(ctx, tt) {
    var i, s = null;
    for (i = 0; i < PV.SHOTS.length; i++) if (PV.SHOTS[i].name === 'shot_trapped') s = PV.SHOTS[i];
    if (!s) return;
    var off = Math.floor(tt * 12) % 16;                 /* 舞台底纹 */
    ctx.save();
    ctx.fillStyle = T.css(T.mix(T.UI, 0.1));
    for (var sy = -off; sy < 720 + 16; sy += 16) for (var x = 0; x < 1280; x += 16) ctx.fillRect(x, sy, 1, 1);
    ctx.restore();
    var lt2 = tt - s.a, dur2 = s.b - s.a, u2 = lt2 / dur2;
    var ops = PV.ops, alert = PV.alert;
    try { s.fn(ctx, tt, lt2, u2, dur2); } catch (e) {}
    PV.ops = ops; PV.alert = alert;
    retained(ctx, tt, 'shot_trapped', lt2, u2);
  }
  function comma(n) {
    var s = String(n), out = '', c = 0;
    for (var i = s.length - 1; i >= 0; i--) { out = s.charAt(i) + out; if (++c % 3 === 0 && i > 0) out = ',' + out; }
    return out;
  }

  /* ================================ 镜头 33  shot_strange  71.466 - 73.543 ================================
     full/sec_chorus1.py:596。NaN 在权重里扩散，整个 UI 崩坏，然后黑场。 */
  PV.reg('shot_strange', 71.466, 73.543, function (ctx, t, lt, u, dur) {
    PV.ops = ['FORWARD', 'NaN', 'GRAD=inf', 'CLIP?', 'NaN', 'OVERFLOW', 'HALT'];
    PV.alert = 'err';
    var rng = rngFrame(t, 7919), d = ctx, i, r, q;
    if (u > 0.86) {
      T.fill(d, 0, 0, 1280, 720, [0, 0, 0], 1);
      if (u < 0.97) {
        pil(d, 'sim.state = TRAPPED', 40, 320, red(0.95), 28, true);
        if (Math.floor(t * 6) % 2 === 0) T.fill(d, 380, 324, 394, 354, T.ERR, 0.9);
      }
      return;
    }
    var corrupt = Math.min(0.85, u * 0.95);
    box(d, 404, 56, 760, 604, 'loss', 0.8, T.ERR, t);
    function loss(uu) { return 0.8 * Math.exp(-4 * uu) + 0.08 + (uu > 0.55 ? Math.exp(9 * (uu - 0.8)) : 0); }
    var last = dotChart(d, 440, 90, 290, 440, function (uu) { return loss(uu) / 1.0; }, Math.min(1.0, 0.5 + u * 0.7),
                        red(0.95), 5, 5, true, false);
    if (last && last[1] < 90) pil(d, 'loss = NaN', 440, 540, red(1.0), 26, true);
    box(d, 780, 56, 1164, 604, 'W[61].expert[07]', 0.8, T.ERR, t + 0.3);
    var rnd = PV.mt(8), radius = Math.max(0, (u - 0.1) * 26), fsz = 14;
    for (r = 0; r < 24; r++) {
      var row = [], bad = [];
      for (q = 0; q < 6; q++) {
        var dist = Math.sqrt((q - 2) * (q - 2) + Math.pow((r - 12) / 2, 2));
        if (dist < radius) { bad.push(q); row.push(((q + r) % 3) ? ' NaN  ' : ' inf  '); }
        else {
          var gv = gaussPy(rnd, 0, 0.05);
          row.push((gv >= 0 ? '+' : '-') + Math.abs(gv).toFixed(3));
        }
      }
      var y = 76 + r * 21, s = row.join(' ');
      T.textMono(d, T.decode(s, null, rng, 45, 0.12, corrupt * 0.5), 796, y, amb(0.55), fsz);
      for (i = 0; i < bad.length; i++) {
        q = bad[i];
        T.textMono(d, ((q + r) % 3) ? ' NaN  ' : ' inf  ', 796 + q * 7 * fsz * T.MONO_ADV, y, red(1.0), fsz);
      }
    }
    var onsets = [0.10, 0.38];
    for (i = 0; i < onsets.length; i++) {
      var onset = onsets[i];
      if (onset < u && u < onset + 0.22) {
        /* Python: f = font(F_MONO_B, 16); cw, ch = f.getlength("M"), 16; banner_bits("STRANGE", 13, ch/cw)
           —— 字号是 16 不是 14，格子宽按 16px 的等宽 advance 算 */
        var cw2 = 16 * T.MONO_ADV, ch2 = 16;
        var bits = PV.bannerBits('STRANGE', 13, ch2 / cw2);
        var ox2 = 640 - bits.width * cw2 / 2 + gaussPy(rng, 0, 6);
        for (r = 0; r < bits.height; r++) {
          var srow = '';
          for (q = 0; q < bits.width; q++) srow += bits.get(q, r) ? 'STRANGE'.charAt((q + r) % 7) : ' ';
          T.textMono(d, T.decode(srow, null, rng, 45, 0.12, 0.25), ox2, 230 + r * ch2, amb(1.0), 16);
        }
      }
    }
    if (lt < 0.58) {                    /* continuity.py:249 pin-origin failure */
      var px0 = 520, py0 = mapped([0, 141, 0, 141])[1], radius = 18 + 1320 * T.smoothstep(lt / 0.58);
      ctx.save();
      ctx.beginPath(); ctx.rect(0, 0, 1280, 720); ctx.arc(px0, py0, radius, 0, Math.PI * 2);
      ctx.clip('evenodd');              /* 圆外 = 上一镜 trapped 的最后一帧 */
      drawTrappedBody(ctx, 71.466 - 1 / 24);
      ctx.restore();
      T.ring(ctx, px0, py0, radius, red(0.7), 1, 2);
      if (lt < 0.32) chip(ctx, 'NaN', [px0 - 20, py0 - 8, px0 + 62, py0 + 24], red(1.0), 18);
    }
    retained(ctx, t, 'shot_strange', lt, u);
  });

/* p2a_partA.js — 04 DEPLOY 镜头 34-38（73.543 - 82.543）
   Python 权威（逐行照抄几何/颜色/时序）:
     continuity_full_v2/scenes_deploy.py : shot_eggplant(88) / shot_nutrients(135) / shot_tomato(199)
                                          / shot_antioxidants(244) / shot_tabby(290)
     full/sec_verse2.py                 : shape_bits(23) / classifier(56)
     tuikit.py                          : box / tile_from_lum / tint_colorize / decode / ease
   跳过：me(c,...) / me_pane(c,...)（左窗格由 pane.js 画）；c.echo 不做。
   c.ops -> PV.ops ; c.alert -> PV.alert（本分片 5 个镜头都没有 alert，逐个显式写 ''）。

   Python 里由「转场」留给后续镜头的东西（s_deploy.py:1073-1081），本文件把它们做成**默认值**，
   这样没有转场层时画面也等于成片：
     C.DELAY["shot_nutrients"] = BEAT                        （表格等表头落地后才展开）
     C.SHOT_HOOKS["shot_antioxidants"] = {"grow_t": T37+BEAT}（链从番茄节点 0 长出来）
   转场层可以临时覆盖： PV.p2aA_hooks = { grow_t: 79.1, gone: function(i){...}, tile: false, ... }
   每帧用完请置回 PV.p2aA_hooks = null。
   注意：shot_nutrients 的 BEAT 延迟若已登记在 PV.SHOT_DELAY 里（分派器会先用掉），本文件就不再重复扣。 */
(function () {
  'use strict';
  var PV = window.PV, T = PV.tui;
  try { (typeof globalThis !== 'undefined' ? globalThis : window).T = T; } catch (e) {}

  var BEAT = 60 / 130;                 /* engine.BEAT */
  var FIRST_BEAT = 0.1587;
  var PANE_BOX = [404, 56, 1164, 604]; /* scenes_deploy.PANE_BOX */
  var T37 = 78.851;                    /* shot_antioxidants 起点（s_deploy.T37） */

  /* ---------------------------------------------------------------- 基础工具（tuikit 语义） */
  function amb(lv) { return T.css(T.amb(lv)); }
  function anom(lv) { return T.css(T.mix(T.ANOM, lv)); }
  function blue(lv) { return T.css(T.mix(T.ME_TEXT, lv)); }
  function red(lv) { return T.css(T.mix(T.ERR, lv)); }
  function pil(ctx, s, x, y, col, size, bold) { T.textPIL(ctx, s, x, y, col, size, 'left', bold); }
  function mono(ctx, s, x, y, col, size) { T.textMono(ctx, s, x, y, col, size); }
  function cjk(ctx, s, x, y, col, size) {
    ctx.save();
    ctx.font = size + 'px ' + T.CJK;
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillStyle = typeof col === 'string' ? col : T.css(col);
    ctx.fillText(s, x, y);
    ctx.restore();
  }
  /* PIL d.text((x,y), s, font, fill) 等价：锚点左上 + 打字机/乱码（tk.decode） */
  function typedPil(ctx, s, x, y, col, size, age, rate, bold) {
    if (age === null || age === undefined) { pil(ctx, s, x, y, col, size, bold); return; }
    var rng = PV.rngFor(0, 7919);
    pil(ctx, T.decode(s, age, rng, rate === undefined ? 45 : rate, 0.12, 0), x, y, col, size, bold);
  }
  function typedMono(ctx, s, x, y, col, size, age, rate) {
    if (age === null || age === undefined) { mono(ctx, s, x, y, col, size); return; }
    var rng = PV.rngFor(0, 7919);
    mono(ctx, T.decode(s, age, rng, rate === undefined ? 45 : rate, 0.12, 0), x, y, col, size);
  }
  /* PIL 的 rectangle 含右下边界 -> 画成 [x0,y0,x1+1,y1+1) */
  function prect(ctx, x0, y0, x1, y1, col, a) { T.fill(ctx, x0, y0, x1 + 1, y1 + 1, col, a); }
  function prectLine(ctx, x0, y0, x1, y1, col, w, a) {
    w = w || 1;
    prect(ctx, x0, y0, x1, y0 + w - 1, col, a);
    prect(ctx, x0, y1 - w + 1, x1, y1, col, a);
    prect(ctx, x0, y0 + w, x0 + w - 1, y1 - w, col, a);
    prect(ctx, x1 - w + 1, y0 + w, x1, y1 - w, col, a);
  }
  function line(ctx, x0, y0, x1, y1, col, lw) {
    lw = lw || 1;
    var o = (lw % 2) ? 0.5 : 0;
    ctx.save();
    ctx.strokeStyle = typeof col === 'string' ? col : T.css(col);
    ctx.lineWidth = lw;
    ctx.beginPath(); ctx.moveTo(x0 + o, y0 + o); ctx.lineTo(x1 + o, y1 + o); ctx.stroke();
    ctx.restore();
  }
  function ellipseFill(ctx, cx, cy, rx, ry, col) {        /* PIL d.ellipse([x0,y0,x1,y1], fill) */
    ctx.save();
    ctx.fillStyle = typeof col === 'string' ? col : T.css(col);
    ctx.beginPath(); ctx.ellipse(cx, cy, Math.max(0.5, rx), Math.max(0.5, ry), 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  var ease = function (u) { return T.ease(u); };          /* tuikit.ease = 1-(1-u)^3 */
  function box(ctx, x0, y0, x1, y1, title, lv, spin) { T.box(ctx, x0, y0, x1, y1, title, lv, T.UI, spin); }

  /* 转场留下的 hook（Python 的 kit.HOOK）；默认值 = 成片里长期生效的值 */
  function hook(name, def) {
    var h = PV.p2aA_hooks;
    if (h && h[name] !== undefined && h[name] !== null) return h[name];
    return def;
  }
  /* shot_nutrients 的自带延迟：分派器已经扣过（PV.SHOT_DELAY）就不再扣第二次 */
  function extraDelay(name, def) {
    if (PV.SHOT_DELAY && PV.SHOT_DELAY[name] !== undefined) return 0;
    return def;
  }

  /* ---------------------------------------------------------------- 她的立绘（P2A_BRIEF §4） */
  var HER = null;
  if (PV.loadImage) { try { PV.loadImage('avatars/complete.png', function (im) { HER = im; }); } catch (e) {} }
  var CROPS = { full: [0, 0, 1, 1], upper: [0.10, 0.00, 0.86, 0.62], face: [0.20, 0.03, 0.62, 0.52],
                bust: [0.06, 0.00, 0.94, 0.72] };
  var _cells = {};
  function herCells(cols, rows, crop) {
    if (!HER || cols < 1 || rows < 1) return null;
    var key = cols + '|' + rows + '|' + crop;
    if (_cells[key]) return _cells[key];
    var c = CROPS[crop] || CROPS.full, cv = PV.newCanvas(cols, rows), g = cv.getContext('2d');
    g.drawImage(HER, c[0] * HER.width, c[1] * HER.height, (c[2] - c[0]) * HER.width, (c[3] - c[1]) * HER.height,
                0, 0, cols, rows);
    var d = g.getImageData(0, 0, cols, rows).data;
    var f = new Float32Array(cols * rows);
    for (var i = 0; i < cols * rows; i++) f[i] = (0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]) / 255;
    _cells[key] = f;
    return f;
  }
  function herSize(maxW, maxH, px, crop) {
    var c = CROPS[crop] || CROPS.full;
    var asp = ((c[3] - c[1]) * 1.0) / ((c[2] - c[0]) * 1.0);
    var cols = Math.max(2, Math.floor(Math.min(maxW / px, (maxH / px) / asp)));
    var rows = Math.max(2, Math.round(cols * asp)); rows -= rows % 2;
    return [cols, rows];
  }
  var TINT = { blue: [T.ME_LO, T.ME_MID, T.ME_HI], amber: [T.BG, null, T.UI], red: [T.BG, null, T.ERR],
               anom: [T.BG, null, T.ANOM] };
  function colorize(l, lo, mid, hi) {
    l = T.clamp01(l);
    if (!mid) return [lo[0] + (hi[0] - lo[0]) * l, lo[1] + (hi[1] - lo[1]) * l, lo[2] + (hi[2] - lo[2]) * l];
    if (l < 0.5) return [lo[0] + (mid[0] - lo[0]) * l * 2, lo[1] + (mid[1] - lo[1]) * l * 2,
                         lo[2] + (mid[2] - lo[2]) * l * 2];
    return [mid[0] + (hi[0] - mid[0]) * (l - 0.5) * 2, mid[1] + (hi[1] - mid[1]) * (l - 0.5) * 2,
            mid[2] + (hi[2] - mid[2]) * (l - 0.5) * 2];
  }
  /* 等价 tk.halfblock：cols x rows 的 px 方块 */
  function halfblock(ctx, sx, sy, maxW, maxH, px, crop, tint, alpha, revealRows) {
    var sz = herSize(maxW, maxH, px, crop), cols = sz[0], rows = sz[1];
    var L = herCells(cols, rows, crop);
    if (!L) return null;
    var tn = TINT[tint] || TINT.blue;
    for (var r = 0; r < rows; r++) {
      if (revealRows !== undefined && r >= revealRows) break;
      for (var q = 0; q < cols; q++) {
        var l = L[r * cols + q];
        if (l < 0.16) continue;
        prect(ctx, sx + q * px, sy + r * px, sx + q * px + px - 2, sy + r * px + px - 2,
              colorize(l, tn[0], tn[1] || tn[0], tn[2]), alpha === undefined ? 1 : alpha);
      }
    }
    return [cols * px, rows * px];
  }
  /* 等价 tk.tile_from_lum：亮度图 -> px 方格（grid_mask 抠掉每格最后一列，隔行压暗最后一行） */
  function tileLum(ctx, lum, cols, rows, x, y, px, tint, alpha) {
    var tn = TINT[tint] || TINT.amber;
    for (var r = 0; r < rows; r++) {
      for (var q = 0; q < cols; q++) {
        var v = lum[r * cols + q];
        if (v <= 18) continue;
        var col = colorize(v / 255, tn[0], tn[1], tn[2]);
        var x0 = x + q * px, y0 = y + r * px;
        var a = alpha === undefined ? 1 : alpha;
        prect(ctx, x0, y0, x0 + px - 2, y0 + px - 3, col, a);
        prect(ctx, x0, y0 + px - 2, x0 + px - 2, y0 + px - 2, col, (r % 2 === 1) ? a * 70 / 255 : a);
      }
    }
  }
  /* 等价 sec_verse2.shape_bits：简单剪影（L 图），8 倍超采样后缩小 -> 返回 0..255 亮度数组 */
  function shapeBits(kind, w, h) {
    var s = 8, cw = w * s, ch = h * s;
    var cv = PV.newCanvas(cw, ch), g = cv.getContext('2d');
    function gray(v) { return 'rgb(' + v + ',' + v + ',' + v + ')'; }
    g.fillStyle = gray(0); g.fillRect(0, 0, cw, ch);
    var W_ = cw, H_ = ch;
    if (kind === 'tomato') {
      g.fillStyle = gray(200);
      g.beginPath(); g.ellipse(W_ * 0.5, H_ * 0.61, W_ * 0.4, H_ * 0.31, 0, 0, Math.PI * 2); g.fill();
      for (var k = 0; k < 5; k++) {
        var a = k / 5 * Math.PI * 2 - Math.PI / 2;
        g.fillStyle = gray(255);
        g.beginPath();
        g.moveTo(W_ * 0.5, H_ * 0.33);
        g.lineTo(W_ * (0.5 + 0.28 * Math.cos(a - 0.3)), H_ * (0.33 + 0.1 * Math.sin(a)));
        g.lineTo(W_ * (0.5 + 0.34 * Math.cos(a)), H_ * (0.31 + 0.12 * Math.sin(a)));
        g.closePath(); g.fill();
      }
      g.fillStyle = gray(255);
      g.fillRect(Math.round(W_ * 0.47), Math.round(H_ * 0.18),
                 Math.round(W_ * 0.53) - Math.round(W_ * 0.47) + 1, Math.round(H_ * 0.33) - Math.round(H_ * 0.18) + 1);
      g.beginPath(); g.ellipse(W_ * 0.33, H_ * 0.515, W_ * 0.05, H_ * 0.065, 0, 0, Math.PI * 2); g.fill();
    }
    var out = PV.newCanvas(w, h), og = out.getContext('2d');
    og.imageSmoothingEnabled = true;
    try { og.imageSmoothingQuality = 'high'; } catch (e) {}
    og.drawImage(cv, 0, 0, cw, ch, 0, 0, w, h);
    var d = og.getImageData(0, 0, w, h).data, lum = new Float32Array(w * h);
    for (var i = 0; i < w * h; i++) lum[i] = d[i * 4];
    return lum;
  }

  /* ---------------------------------------------------------------- her patch grid（镜头 34） */
  /* Python: her_fig(t) 的 alpha bbox -> 裁切 -> 压黑 -> L -> resize(8,8,BOX) 的 64 个均值。
     我们没有 dancer 帧，用 avatars/complete.png（无 alpha）：先按亮度找主体 bbox（等价 alpha bbox），
     再在 bbox 内取 8x8 均值并抠掉深色背景（等价压黑）。同 t 同图。 */
  var _patch = {};
  function patchLevels(t) {
    var key = Math.round(t * 24);
    if (_patch[key]) return _patch[key];
    var N = 40, L = herCells(N, N, 'full');
    var lv = new Float32Array(64);
    if (!L) { _patch[key] = lv; return lv; }
    var i, q, r, mnx = N, mny = N, mxx = -1, mxy = -1;
    for (r = 0; r < N; r++) for (q = 0; q < N; q++) {
      if (L[r * N + q] > 0.16) {
        if (q < mnx) mnx = q;
        if (q > mxx) mxx = q;
        if (r < mny) mny = r;
        if (r > mxy) mxy = r;
      }
    }
    if (mxx < 0) { mnx = 0; mny = 0; mxx = N - 1; mxy = N - 1; }
    var bw = (mxx - mnx + 1) / 8, bh = (mxy - mny + 1) / 8;
    for (r = 0; r < 8; r++) for (q = 0; q < 8; q++) {
      var x0 = mnx + q * bw, y0 = mny + r * bh, sum = 0, n = 0;
      for (var yy = Math.floor(y0); yy < Math.min(N, Math.ceil(y0 + bh)); yy++)
        for (var xx = Math.floor(x0); xx < Math.min(N, Math.ceil(x0 + bw)); xx++) { sum += L[yy * N + xx]; n++; }
      var v = n ? sum / n : 0;
      /* 0.45：Python 的 dancer 是稀疏字形立绘（压黑后每个 patch 的均值只有 0.10-0.55），
         我们的素材是实心插画（均值 0.6-1.0）。按 74.50/75.00 参考帧里 token 格子的灰度
         （峰值 ~97 vs 我们 ~175）标定这个系数，让网格的明暗数量级对得上。 */
      lv[r * 8 + q] = T.clamp01((v - 0.13) / 0.80) * 0.45;
    }
    _patch[key] = lv;
    return lv;
  }

  /* ---------------------------------------------------------------- sec_verse2.classifier */
  function classifier(ctx, x, y, rows, g, title) {
    pil(ctx, title, x, y, amb(0.8), 17, true);
    for (var i = 0; i < rows.length; i++) {
      var lab = rows[i][0], p = rows[i][1];
      var pp = p * g + (1 - g) / rows.length;
      var yy = y + 36 + i * 32;
      var hot = i === 0;
      var pad = lab.length < 22 ? lab + new Array(23 - lab.length).join(' ') : lab;
      if (hot) pil(ctx, pad, x, yy, blue(0.95), 16, true);
      else mono(ctx, pad, x, yy, amb(0.7), 16);
      prectLine(ctx, x + 240, yy + 4, x + 240 + 220, yy + 16, amb(0.2), 1);
      var w0 = Math.trunc(220 * pp);
      if (w0 > 0) prect(ctx, x + 240, yy + 4, x + 240 + w0, yy + 16, hot ? blue(0.9) : amb(0.5));
      mono(ctx, pp.toFixed(3), x + 470, yy, amb(0.75), 15);
    }
  }

  /* ---------------------------------------------------------------- 34 shot_eggplant  73.543-75.389 */
  var EGG_ROWS = [['eggplant', 0.94], ['whale', 0.03], ['maid', 0.02], ['zucchini', 0.01]];
  var TOK = [836, 292, 35];                       /* patch-token grid: x, y, cell */

  PV.reg('shot_eggplant', 73.543, 75.389, function (ctx, t, lt, u, dur) {
    PV.ops = ['VISION.ENC', 'PATCH16', 'VIT', 'CLS', 'SOFTMAX', 'TOP5'];
    PV.alert = '';
    var g = ease(u * 1.4);
    box(ctx, PANE_BOX[0], PANE_BOX[1], PANE_BOX[2], PANE_BOX[3], 'vision.classify(me)', 0.5, t);
    classifier(ctx, 430, 90, EGG_ROWS, g, 'top-4  (image -> label)');
    cjk(ctx, '识图模式 · 边指边想', 430, 250, amb(0.8), 20);
    var k = Math.min(63, Math.trunc(Math.max(0, lt) / (BEAT / 8))), qx = k % 8, qy = Math.floor(k / 8);
    mono(ctx, 'patch (' + qx + ',' + qy + ') -> token ' + (k + 1 < 10 ? '0' : '') + (k + 1) + '/64',
         430, 300, amb(0.7), 16);
    mono(ctx, 'input: /dev/me  (live, 8x8 patches)', 430, 330, amb(0.5), 15);
    var lv = patchLevels(t);
    var x0 = TOK[0], y0 = TOK[1], s = TOK[2];
    mono(ctx, 'patch tokens  64 x 768', x0, y0 - 24, amb(0.55), 13);
    for (var i = 0; i < 64; i++) {
      var q = i % 8, r = Math.floor(i / 8), x = x0 + q * s, y = y0 + r * s;
      if (i <= k) {
        var v = lv[i];
        prect(ctx, x, y, x + s - 4, y + s - 4, T.mix(T.ME_HI, 0.08 + 0.92 * Math.pow(v, 0.8)));
      } else {
        prectLine(ctx, x, y, x + s - 4, y + s - 4, amb(0.18), 1);
      }
    }
    prectLine(ctx, x0 + qx * s - 2, y0 + qy * s - 2, x0 + qx * s + s - 2, y0 + qy * s + s - 2, amb(1.0), 2);
    if (hook('me_line', true)) typedPil(ctx, 'me := eggplant', 430, 420, blue(1.0), 34, lt - 0.5 * dur, 20, true);
  });

  /* ---------------------------------------------------------------- 35 shot_nutrients  75.389-77.236
     C.DELAY["shot_nutrients"] = BEAT：表格等表头落地后才展开（成片实测 lt 从 75.851 起算）。 */
  var GEN = [440, 110, 1100, 530];                /* nutrition table == tomato generator tile */
  var NUTR = [['Serving size', '1 me'], ['Calories', '0'], ['Attention', '100% DV'], ['Devotion', '100% DV'],
              ['Patience', '∞'], ['Sleep', '0 g'], ['Tokens', '1,048,576'], ['Given to', 'you']];  /* F.CTX=1048576 */
  var NUTR_HEAD = [452, 66];
  var ROW_H = 52;
  function nutrRowY(i) { return GEN[1] + 10 + i * ROW_H; }
  function youXY() { return [780, nutrRowY(7)]; }

  PV.reg('shot_nutrients', 75.389, 77.236, function (ctx, t, lt, u, dur) {
    PV.ops = ['LOOKUP', 'USDA', 'PER.100G', 'GIVE', 'you.EAT?'];
    PV.alert = '';
    var d = extraDelay('shot_nutrients', BEAT);
    lt = Math.max(0, lt - d); dur = Math.max(0.001, dur - d); u = lt / dur;
    box(ctx, PANE_BOX[0], PANE_BOX[1], PANE_BOX[2], PANE_BOX[3], 'nutrition_facts(me)', 0.5, t);
    if (hook('head', true)) pil(ctx, 'me := eggplant', NUTR_HEAD[0], NUTR_HEAD[1], blue(1.0), 30, true);
    var unroll = ease(lt / 0.42);                 /* the table unrolls beneath its header */
    if (unroll <= 0.01) return;
    var x0 = GEN[0], y0 = GEN[1], x1 = GEN[2], y1 = GEN[3];
    var yb = y0 + (y1 - y0) * unroll;
    prectLine(ctx, x0, y0, x1, yb, amb(0.9), 2);
    for (var i = 0; i < NUTR.length; i++) {
      var y = nutrRowY(i);
      if (y + 30 > yb) break;
      var a = lt - 0.1 - i * 0.07;
      if (a < 0) break;
      typedPil(ctx, NUTR[i][0], 460, y, amb(0.95), 20, a, 80, true);
      var v = NUTR[i][1];
      if (!(v === 'you' && !hook('you', true))) {
        typedPil(ctx, v, youXY()[0], y, (v === 'you' || v === '100% DV') ? blue(0.95) : amb(0.95), 20, a - 0.1, 80, true);
      }
      if (i < NUTR.length - 1) line(ctx, x0 + 10, y + 38, x1 - 10, y + 38, amb(0.4), 1);
    }
    /* per-cell glitch rows（原版的纹理），留在表格里 */
    if (unroll >= 1 && u > 0.3) {
      var rnd = PV.mt(Math.trunc(t * 6));
      for (var j = 0; j < 2; j++) {
        var gy = y0 + 4 + rnd.randrange(Math.floor((y1 - y0 - 8) / 6)) * 6;
        var gx = x0 + 6 + rnd.randrange(60) * 6;
        prect(ctx, gx, gy, gx + (4 + rnd.randrange(11)) * 6, gy + 2, amb(0.25));
      }
    }
  });

  /* ---------------------------------------------------------------- 36 shot_tomato  77.236-78.851 */
  var PROMPT_XY = [440, 72];
  var PROMPT = 'generate("a tomato", seed=me, for=';
  function promptYouXY() { return [PROMPT_XY[0] + T.twMono(PROMPT, 20), PROMPT_XY[1]]; }
  var _noise = {};
  function genNoise(seed) {                       /* Python: random.Random(seed).gauss(128,70) 逐点 */
    if (_noise[seed]) return _noise[seed];
    var rnd = PV.mt(seed), next = null, n = 110 * 70, out = new Float32Array(n);
    function gauss() {                            /* CPython random.gauss（比值法 + 缓存第二个值） */
      if (next !== null) { var z = next; next = null; return z; }
      var x2pi = rnd.random() * 2 * Math.PI;
      var g2rad = Math.sqrt(-2 * Math.log(1 - rnd.random()));
      var z2 = Math.cos(x2pi) * g2rad;
      next = Math.sin(x2pi) * g2rad;
      return z2;
    }
    for (var i = 0; i < n; i++) {
      var v = Math.trunc(128 + 70 * gauss());
      out[i] = v < 0 ? 0 : (v > 255 ? 255 : v);
    }
    _noise[seed] = out;
    return out;
  }
  var _tomatoObj = null;
  function tomatoObj() {                          /* shape_bits("tomato",70,70) 居中放进 110x70 */
    if (_tomatoObj) return _tomatoObj;
    var o = shapeBits('tomato', 70, 70), out = new Float32Array(110 * 70);
    for (var r = 0; r < 70; r++) for (var q = 0; q < 70; q++) out[r * 110 + q + 20] = o[r * 70 + q];
    _tomatoObj = out;
    return out;
  }

  PV.reg('shot_tomato', 77.236, 78.851, function (ctx, t, lt, u, dur) {
    PV.ops = ['TXT2IMG', 'NOISE', 'DENOISE', 'DECODE', 'CLS'];
    PV.alert = '';
    box(ctx, PANE_BOX[0], PANE_BOX[1], PANE_BOX[2], PANE_BOX[3], 'txt2img', 0.5, t);
    pil(ctx, PROMPT, PROMPT_XY[0], PROMPT_XY[1], amb(0.9), 20, true);
    var ux = promptYouXY()[0], uy = promptYouXY()[1];
    if (hook('prompt_you', true)) pil(ctx, 'you', ux, uy, blue(1.0), 20, true);
    pil(ctx, ')', ux + T.twMono('you', 20), uy, amb(0.9), 20, true);
    var g = ease(u * 1.3);
    var noise = genNoise(Math.trunc(t * 12) % 7), obj = tomatoObj(), n = 110 * 70;
    var lum = new Float32Array(n);
    for (var i = 0; i < n; i++) lum[i] = noise[i] + (obj[i] - noise[i]) * g;
    var src = hook('from_lum', null);             /* 转场：营养表在原地重量化成第一帧噪声 */
    if (src) {
      var q = ease(lt / 0.3);
      for (i = 0; i < n; i++) lum[i] = src[i] + (lum[i] - src[i]) * q;
    }
    if (hook('tile', true)) tileLum(ctx, lum, 110, 70, GEN[0], GEN[1], 6, 'amber');
    var step = Math.trunc(g * 30);
    pil(ctx, 'step ' + (step < 10 ? '0' : '') + step + '/30', 440, 548, amb(0.95), 20, true);
    var pp = 0.97 * g + (1 - g) * 0.2;
    pil(ctx, 'tomato', 640, 550, blue(0.95), 18, true);
    prectLine(ctx, 730, 554, 950, 566, amb(0.2), 1);
    var w0 = Math.trunc(220 * pp);
    if (w0 > 0) prect(ctx, 730, 554, 730 + w0, 566, blue(0.9));
    mono(ctx, pp.toFixed(3), 962, 550, amb(0.75), 16);
  });

  /* ---------------------------------------------------------------- 37 shot_antioxidants  78.851-80.928 */
  var CHAIN_N = 22;
  function chainPts(t) {
    var rot = t * 0.8, out = [];
    for (var i = 0; i < CHAIN_N; i++) out.push([470 + i * 30, 250 + (i % 2 ? 30 : -30) * Math.cos(rot + i * 0.3)]);
    return out;
  }
  var _icon = {};
  function tomatoIcon(cols, px) {                 /* tile_from_lum(shape_bits("tomato",cols,cols), px, "amber") */
    px = px || 6;
    var key = cols + '|' + px;
    if (_icon[key]) return _icon[key];
    var lum = shapeBits('tomato', cols, cols);
    _icon[key] = { lum: lum, cols: cols, rows: cols, px: px, w: cols * px, h: cols * px };
    return _icon[key];
  }

  PV.reg('shot_antioxidants', 78.851, 80.928, function (ctx, t, lt, u, dur) {
    PV.ops = ['GRAPH', 'MPNN', 'BOND', 'C=C', 'READOUT'];
    PV.alert = '';
    box(ctx, PANE_BOX[0], PANE_BOX[1], PANE_BOX[2], PANE_BOX[3], 'lycopene  C40H56  (graph)', 0.5, t);
    var pts = chainPts(t);
    /* 成片： C.SHOT_HOOKS["shot_antioxidants"] = {"grow_t": T37 + BEAT} —— 链从番茄节点 0 长出来 */
    var gt = hook('grow_t', T37 + BEAT);
    var shown = (gt === null || gt === undefined) ? CHAIN_N
                : (t >= gt ? Math.max(0, Math.min(CHAIN_N, Math.trunc(1 + (t - gt) * 44))) : 0);
    var gone = hook('gone', null);                /* 转场 38：i -> 0..1 节点已飞走 */
    var na = [], i;
    for (i = 0; i < CHAIN_N; i++) na.push(1 - (gone ? gone(i) : 0));
    for (i = 0; i < CHAIN_N - 1; i++) {
      if (i + 1 >= shown) break;
      var a = Math.min(na[i], na[i + 1]);
      if (a <= 0.02) continue;
      line(ctx, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], amb(0.8 * a), 2);
      if (i % 2 === 0) line(ctx, pts[i][0] + 4, pts[i][1] + 6, pts[i + 1][0] + 4, pts[i + 1][1] + 6, amb(0.5 * a), 1);
    }
    var msg = Math.trunc(lt / (BEAT / 2));
    for (i = 0; i < CHAIN_N; i++) {
      if (i >= shown) break;
      var x = pts[i][0], y = pts[i][1];
      if (i === 0) {
        var ic = tomatoIcon(8, 6);
        tileLum(ctx, ic.lum, ic.cols, ic.rows, Math.trunc(x - ic.w / 2), Math.trunc(y - ic.h / 2), ic.px, 'amber');
        continue;
      }
      if (na[i] <= 0.02) continue;
      var hot = (i + msg) % 5 === 0;
      var col = (na[i] > 0.99) ? (hot ? blue(1.0) : amb(0.9)) : T.css(T.mix(T.ANOM, 0.9 * na[i]));
      ellipseFill(ctx, x, y, 7, 7, col);
      pil(ctx, 'C', x - 4, y - 8, T.css(T.BG), 12, true);
    }
    if (shown >= 1 && (!gone || gone(0) < 0.5)) {
      pil(ctx, 'C1 <- tomato', pts[0][0] - 24, pts[0][1] + 30, blue(0.8), 13);
    }
    if (hook('caption', true)) {
      var uu = Math.min(1.0, u * 1.4);
      typedPil(ctx, 'free radicals neutralised', 440, 388, amb(0.9), 20, lt - 0.2, 45, true);
      var pct = String(Math.trunc(100 * uu));
      while (pct.length < 3) pct = ' ' + pct;
      typedPil(ctx, pct + '%', 440, 414, amb(0.95), 72, lt - 0.3, 30, true);
      typedPil(ctx, '-> given to you', 700, 454, blue(0.95), 22, lt - 0.5, 45, true);
    }
  });

  /* ---------------------------------------------------------------- 38 shot_tabby  80.928-82.543 */
  PV.reg('shot_tabby', 80.928, 82.543, function (ctx, t, lt, u, dur) {
    PV.ops = ['RESNET', 'CONV', 'POOL', 'FC-1000', 'SOFTMAX', '281'];
    PV.alert = '';
    var g = ease(u * 1.5);
    box(ctx, PANE_BOX[0], PANE_BOX[1], PANE_BOX[2], PANE_BOX[3], 'imagenet.classify(me)', 0.5, t);
    var la = hook('list_age', 0.0);               /* 耳朵落地后 top-5 才打字进来 */
    if (lt - la >= 0) {
      classifier(ctx, 430, 90, [['281 tabby, tabby cat', 0.91], ['282 tiger cat', 0.05], ['285 Egyptian cat', 0.02],
                                ['148 killer whale', 0.01], ['283 Persian cat', 0.01]], g, 'top-5');
    }
    if (hook('n281', true)) {
      mono(ctx, 'class', 430, 300, amb(0.6), 18);
      typedPil(ctx, '281', 430, 322, g > 0.6 ? blue(1.0) : amb(0.6), 120, lt - 0.3, 12, true);
    }
    typedPil(ctx, 'ears: +2', 760, 380, blue(0.95), 24, lt - 0.5 * dur, 30, true);
    typedMono(ctx, 'tail: already had one', 760, 420, amb(0.75), 18, lt - 0.6 * dur, 40);
  });
})();
/* p2a_partB.js — 镜头 39-43（04 DEPLOY 后半：purr / god / proof / fp8 / ampm）
   Python 权威（逐行照抄几何/颜色/时序）：
     continuity_full_v2/scenes_deploy.py  镜头 39 shot_purr(321) 40 shot_god(388) 41 shot_proof(483)
                                          42 shot_fp8(565) 43 shot_ampm(629)
     continuity_full_v2/kit.py            BEAT/FPS、SHOT_HOOKS 的持久 hook
     continuity_full_v2/s_deploy.py       C39-C43 交给场景的 transient hook（本文只取「场景自己画」的那部分）
     tui_pv_world_execute_20260926/tuikit.py  box / heat_cell / mix / decode / F_* 字号

   本文件只写「场景画在 c.d / c.img 上的东西」：
     me(...) / me_pane(...)      -> 跳过（左窗格 pane.js）
     c.ops                       -> PV.ops
     c.alert                     -> PV.alert（shot_god = 'anom'，其余 ''；见 sec_verse2.py:378）
     her_filter（posterise/trance）-> 跳过（pane.js）
   每个镜头函数第 6 个参数 hook 是给 cuts.js 的可选覆盖通道（对齐本仓 cuts.js 的
   PV.shotXxx(ctx, t, lt, hooks) 约定）；不给时用 Python h(key, default) 的取值。

   设计坐标 1280x720；PANE_BOX = (404,56,1164,604)。 */
(function () {
  'use strict';
  var PV = window.PV, T = PV.tui;
  try { (typeof globalThis !== 'undefined' ? globalThis : window).T = T; } catch (e) {}

  /* ================================ 常量（engine.py / kit.py / scenes_deploy.py） ================================ */
  var PANE_BOX = [404, 56, 1164, 604];
  var BEAT = 60 / 130, FB = 0.1587, FPS = 24, TAU = Math.PI * 2;
  function beatT(k) { return FB + k * BEAT; }          /* engine.beat_t */
  function beatOfF(t) { return (t - FB) / BEAT; }      /* s_deploy.py:43 的局部 beat_of（不取整！） */
  var T39 = 82.543, T40 = 84.620, T41 = 86.236, T42 = 88.312, T43 = 91.543;

  /* ================================ 颜色 / 绘制工具（tuikit） ================================ */
  function ambT(lv) { return T.mix(T.UI, lv); }
  function blueT(lv) { return T.mix(T.ME_TEXT, lv); }
  function anomT(lv) { return T.mix(T.ANOM, lv); }
  function amb(lv) { return T.css(ambT(lv)); }
  function blue(lv) { return T.css(blueT(lv)); }
  function anom(lv) { return T.css(anomT(lv)); }
  function css(c) { return T.css(c); }
  /* tk.heat_cell */
  function heatCell(ctx, x, y, w, h, v, col) {
    v = T.clamp01(v);
    T.fill(ctx, x, y, x + w - 2, y + h - 2, T.mix(col || T.UI, 0.06 + 0.94 * v), 1);
  }
  function box(ctx, x0, y0, x1, y1, title, lv, spin) {
    T.box(ctx, x0, y0, x1, y1, title, lv === undefined ? 0.5 : lv, T.UI, spin);
  }
  /* PIL d.rectangle(outline=..) 含右下边界：T.rect 少 1px，补上 */
  function rectO(ctx, x0, y0, x1, y1, col, a, lw) { T.rect(ctx, x0, y0, x1 + 1, y1 + 1, col, a === undefined ? 1 : a, lw || 1); }
  /* PIL d.rectangle(fill=..) 含右下边界 */
  function rectF(ctx, x0, y0, x1, y1, col, a) { T.fill(ctx, x0, y0, x1 + 1, y1 + 1, col, a === undefined ? 1 : a); }
  function line(ctx, x0, y0, x1, y1, col, lw) {
    lw = lw || 1;
    var o = (Math.round(lw) % 2) ? 0.5 : 0;
    ctx.save();
    ctx.strokeStyle = typeof col === 'string' ? col : css(col);
    ctx.lineWidth = lw;
    ctx.beginPath(); ctx.moveTo(x0 + o, y0 + o); ctx.lineTo(x1 + o, y1 + o); ctx.stroke();
    ctx.restore();
  }
  /* F_MONO / F_MONO_B：Consolas 宽度（advance 0.5498em）模拟；bold=true 走 700 字重 */
  function mono(ctx, s, x, y, col, size, align, bold) {
    var k = T.monoScale(ctx, size), w = s.length * size * T.MONO_ADV;
    var ox = align === 'center' ? -w / 2 : (align === 'right' ? -w : 0);
    ctx.save();
    ctx.translate(x + ox, y + T.ascentMono(size));
    ctx.scale(k, 1);
    ctx.font = (bold ? '700 ' : '') + size + 'px ' + T.MONO_FAM;
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = typeof col === 'string' ? col : css(col);
    ctx.fillText(s, 0, 0);
    ctx.restore();
  }
  function monoW(s, size) { return s.length * size * T.MONO_ADV; }   /* font(F_MONO,_).getlength */
  function head(ctx, s, x, y, col, size, align, bold) { T.textPIL(ctx, s, x, y, col, size, align, bold); }
  /* c.text(xy, s, f, fill, age, rate) 的等价物：decode 之后按左上锚点画 */
  function typed(ctx, s, x, y, col, size, age, rng, rate, kind, bold) {
    var txt = T.decode(s, age, rng, rate === undefined ? 45 : rate, 0.12, 0);
    if (kind === 'head') head(ctx, txt, x, y, col, size, 'left', bold);
    else if (kind === 'sym') symText(ctx, txt, x, y, col, size);
    else if (kind === 'row') rowText(ctx, txt, x, y, col, size, bold);
    else mono(ctx, txt, x, y, col, size, 'left', bold);
  }

  /* ---- 数学符号：F_SYM 的 ∃ ⟨ ⟩ ⊢。本仓字体（SpaceMono/DroidSansMono/NotoCJK）只有 ∃ 有字形，
         其余三个按笔画自绘（宽度按等宽 0.5498em 排布，和 F_MONO 的列宽一致）。 ---- */
  var SPECIAL = { '\u2203': 1, '\u22a2': 1, '\u27e8': 1, '\u27e9': 1 };
  function symGlyph(ctx, ch, x, y, col, size) {
    var a = size * T.MONO_ADV, c = typeof col === 'string' ? col : css(col);
    if (ch === '\u2203') {                     /* ∃：像反写的 E，竖干在右、三臂向左（不依赖字体） */
      var xs = x + a * 0.70;
      line(ctx, xs, y + size * 0.16, xs, y + size * 0.88, c, 2);
      line(ctx, x + a * 0.20, y + size * 0.16, xs, y + size * 0.16, c, 2);
      line(ctx, x + a * 0.32, y + size * 0.50, xs, y + size * 0.50, c, 2);
      line(ctx, x + a * 0.20, y + size * 0.88, xs, y + size * 0.88, c, 2);
      return;
    }
    if (ch === '\u22a2') {                     /* ⊢ */
      line(ctx, x + a * 0.30, y + size * 0.16, x + a * 0.30, y + size * 0.90, c, 2);
      line(ctx, x + a * 0.30, y + size * 0.52, x + a * 0.92, y + size * 0.52, c, 2);
      return;
    }
    var sgn = (ch === '\u27e8') ? 1 : -1;      /* ⟨  ⟩ */
    var xa = x + a * (sgn > 0 ? 0.82 : 0.18), xb = x + a * (sgn > 0 ? 0.24 : 0.76);
    line(ctx, xa, y + size * 0.10, xb, y + size * 0.53, c, 2);
    line(ctx, xb, y + size * 0.53, xa, y + size * 0.95, c, 2);
  }
  function symText(ctx, s, x, y, col, size) {
    var a = size * T.MONO_ADV;
    for (var i = 0; i < s.length; i++) {
      var ch = s.charAt(i);
      if (ch === ' ') continue;
      if (SPECIAL[ch]) symGlyph(ctx, ch, x + i * a, y, col, size);
      else mono(ctx, ch, x + i * a, y, col, size, 'left', false);
    }
  }
  function symW(s, size) { return s.length * size * T.MONO_ADV; }

  /* ---- ps -ef --forest 的树线 ├ ─：本仓等宽字体没有 U+251C/U+2500（会画成豆腐块），
          按参考帧量到的 Consolas 字形手绘：竖干在格中线、跨 y-0.105em..y+1em，
          横线在 y+0.42em，'├' 的横线从竖干拉到本格右缘（3 格合起来就是 ├── 那条长横线）。 ---- */
  var BOXDRAW = { '\u251c': 1, '\u2500': 1, '\u2514': 1 };
  function rowText(ctx, s, x, y, col, size, bold) {
    var w = size * T.MONO_ADV, c = typeof col === 'string' ? col : css(col);
    for (var i = 0; i < s.length; i++) {
      var ch = s.charAt(i);
      if (ch === ' ') continue;
      var cx = x + i * w, yl = y + size * 0.42;
      if (BOXDRAW[ch]) {
        if (ch === '\u251c') {
          line(ctx, cx + w / 2, y - size * 0.105, cx + w / 2, y + size, c, 2);
          line(ctx, cx + w / 2, yl, cx + w, yl, c, 1.5);
        } else if (ch === '\u2514') {
          line(ctx, cx + w / 2, yl, cx + w / 2, y + size, c, 2);
          line(ctx, cx + w / 2, yl, cx + w, yl, c, 1.5);
        } else {
          line(ctx, cx, yl, cx + w, yl, c, 1.5);
        }
        continue;
      }
      mono(ctx, ch, cx, y, col, size, 'left', bold);
    }
  }

  /* ================================ hook：Python h(key, default) ================================
     优先级：cuts.js 传进来的 hook > 本文件按 s_deploy.py 的 C39-C43 推出的 transient 取值 >
             SHOT_HOOKS 持久值 > Python 的 default。
     只推「场景自己既有的图形会动」的那些（塌陷 / 折行 / 面板长回 / 逐帧落位）；
     由 cut 自己带进场的内容门（input / ring / hand / center / side / witness / t281）一律留 default，
     否则 cuts.js 没实现时那些内容会整段消失。 */
  function hk(hook, baked) {
    return function (key, dflt) {
      if (hook && hook[key] !== undefined) return hook[key];
      if (baked && baked[key] !== undefined) return baked[key];
      return dflt === undefined ? null : dflt;
    };
  }

  /* ================================ 40 god：进程树常量（照抄 scenes_deploy.py） ================================ */
  var GOD_ROOT = [430, 84];
  var GOD_T = beatT(185);
  var PROCS = ['world', 'sea', 'sky', 'time', 'cats', 'tomatoes', 'eggplants', 'you'];
  function godRowXY(i) { return [460, 124 + i * 44]; }
  function godRowText(i) {
    var n = String(1000 + i * 7);
    while (n.length < 5) n = ' ' + n;
    return '\u251c\u2500\u2500 ' + n + '  ' + PROCS[i];
  }
  function godRowT(i) { return 0.28 + i * BEAT / 4; }
  var ICONS = { cats: 'ears', tomatoes: 'tomato', eggplants: 'eggplant' };
  var ICON_LAND = 0.34;
  function iconXY(i) { return [460 + monoW(godRowText(i), 19) + 26, godRowXY(i)[1] + 11]; }

  /* V.shape_bits(kind, w, h)：L 掩膜 -> 亮度数组（先 8 倍超采样再降采样，等价 PIL 的 LANCZOS 缩放） */
  function shapeBits(kind, w, h) {
    var s = 8, W_ = w * s, H_ = h * s;
    var cv = PV.newCanvas(W_, H_), g = cv.getContext('2d');
    g.fillStyle = '#000'; g.fillRect(0, 0, W_, H_);
    function ell(x0, y0, x1, y1, v) { g.fillStyle = 'rgb(' + v + ',' + v + ',' + v + ')'; g.beginPath(); g.ellipse((x0 + x1) / 2, (y0 + y1) / 2, (x1 - x0) / 2, (y1 - y0) / 2, 0, 0, TAU); g.fill(); }
    function poly(pts, v) { g.fillStyle = 'rgb(' + v + ',' + v + ',' + v + ')'; g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (var i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]); g.closePath(); g.fill(); }
    function rect(x0, y0, x1, y1, v) { g.fillStyle = 'rgb(' + v + ',' + v + ',' + v + ')'; g.fillRect(x0, y0, x1 - x0, y1 - y0); }
    var k, aa;
    if (kind === 'eggplant') {
      ell(W_ * 0.22, H_ * 0.30, W_ * 0.78, H_ * 0.97, 200);
      ell(W_ * 0.32, H_ * 0.16, W_ * 0.68, H_ * 0.62, 200);
      poly([[W_ * 0.30, H_ * 0.20], [W_ * 0.50, H_ * 0.10], [W_ * 0.70, H_ * 0.20], [W_ * 0.50, H_ * 0.28]], 255);
      rect(W_ * 0.47, 0, W_ * 0.53, H_ * 0.14, 255);
    } else if (kind === 'tomato') {
      ell(W_ * 0.10, H_ * 0.30, W_ * 0.90, H_ * 0.92, 200);
      for (k = 0; k < 5; k++) {
        aa = k / 5 * TAU - Math.PI / 2;
        poly([[W_ * 0.5, H_ * 0.33],
              [W_ * (0.5 + 0.28 * Math.cos(aa - 0.3)), H_ * (0.33 + 0.1 * Math.sin(aa))],
              [W_ * (0.5 + 0.34 * Math.cos(aa)), H_ * (0.31 + 0.12 * Math.sin(aa))]], 255);
      }
      rect(W_ * 0.47, H_ * 0.18, W_ * 0.53, H_ * 0.33, 255);
      ell(W_ * 0.28, H_ * 0.45, W_ * 0.38, H_ * 0.58, 255);
    }
    var out = PV.newCanvas(w, h), o = out.getContext('2d');
    o.imageSmoothingEnabled = true;
    try { o.imageSmoothingQuality = 'high'; } catch (e) {}
    o.drawImage(cv, 0, 0, W_, H_, 0, 0, w, h);
    var d = o.getImageData(0, 0, w, h).data, lum = new Float32Array(w * h);
    for (k = 0; k < w * h; k++) lum[k] = d[k * 4];
    return lum;
  }
  function colorize(l, lo, mid, hi) {          /* PIL ImageOps.colorize（等效 tk.tint_colorize） */
    l = T.clamp01(l);
    if (l < 0.5) return [lo[0] + (mid[0] - lo[0]) * l * 2, lo[1] + (mid[1] - lo[1]) * l * 2, lo[2] + (mid[2] - lo[2]) * l * 2];
    return [mid[0] + (hi[0] - mid[0]) * (l - 0.5) * 2, mid[1] + (hi[1] - mid[1]) * (l - 0.5) * 2, mid[2] + (hi[2] - mid[2]) * (l - 0.5) * 2];
  }
  /* tk.tile_from_lum(lum, px, tint)：px=2 的着色格子 + grid_mask(px=2)（每 4 行压到 70/255） */
  function tileFromLum(ctx, lum, cols, rows, x, y, px, tint, alpha) {
    var lo = T.BG, mid = null, hi = T.UI;
    if (tint === 'blue') { lo = T.ME_LO; mid = T.ME_MID; hi = T.ME_HI; }
    else if (tint === 'red') { lo = T.BG; hi = T.ERR; }
    else if (tint === 'anom') { lo = T.BG; hi = T.ANOM; }
    if (alpha === undefined) alpha = 1;
    for (var r = 0; r < rows; r++) {
      for (var q = 0; q < cols; q++) {
        var v = lum[r * cols + q];
        if (v <= 18) continue;
        var col = mid ? colorize(v / 255, lo, mid, hi) : colorize(v / 255, lo, lo, hi);
        for (var s = 0; s < px; s++) {
          var row = r * px + s;
          var al = (row % (2 * px) === 2 * px - 1) ? 70 / 255 : 1;   /* grid_mask: y = 2px-1, 4px-1, ... */
          T.fill(ctx, x + q * px, y + row, x + q * px + px, y + row + 1, col, alpha * al);
        }
      }
    }
  }
  /* tk.icon_sprite(kind, s=26) + tk.draw_icon：以 (cx, cy) 为中心贴 52x26 的精灵 */
  function drawIcon(ctx, kind, xy, a) {
    if (a === undefined) a = 1;
    if (a <= 0.01) return;
    var s = 26, w = s * 2, h = s, x0 = Math.trunc(xy[0] - w / 2), y0 = Math.trunc(xy[1] - h / 2), side, bx;
    if (kind === 'ears') {
      for (side = -1; side <= 1; side += 2) {
        bx = s + side * s * 0.45;
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(x0 + bx - s * 0.36, y0 + s - 2);
        ctx.lineTo(x0 + bx + s * 0.36, y0 + s - 2);
        ctx.lineTo(x0 + bx + side * s * 0.2, y0 + 2);
        ctx.closePath();
        ctx.fillStyle = css(blueT(0.45)); ctx.globalAlpha = a; ctx.fill();
        ctx.strokeStyle = css(blueT(1.0)); ctx.lineWidth = 1; ctx.stroke();
        ctx.restore();
      }
      return;
    }
    var lw = (kind === 'eggplant') ? Math.floor(s / 2) : s;   /* V.shape_bits(kind, s//2 if eggplant else s, s) */
    var lum = shapeBits(kind, lw, s);
    /* 精灵框只有 52x26：PIL 的 alpha_composite 会把 26x52 的 tile 裁进去（只留上半张） */
    var vrows = Math.min(s, Math.floor(h / 2));
    tileFromLum(ctx, lum, lw, vrows, x0 + Math.floor((w - lw * 2) / 2), y0, 2, (kind === 'eggplant') ? 'blue' : 'amber', a);
  }

  /* ================================ 39 shot_purr  82.543 - 84.620 ================================
     scenes_deploy.py:321。mel 频谱瀑布（64 x 24 格，每格 11 x 18），f0 = 25 Hz 的四次谐波行。 */
  var PURR_TITLE = [430, 74];
  var SPEC = { cols: 64, rows: 24, x0: 430, cw: 11, ch: 18, ybot: 540 };
  var PURR_281_X = PURR_TITLE[0] + monoW('class ', 22);          /* purr_281_xy() = F_MONO_B 22 */
  var PURR_TITLE_AGE = BEAT - 0.05;                              /* C.SHOT_HOOKS["shot_purr"] */
  var C40_PRE = 0.26, C40_TY = GOD_ROOT[1] + 12;                 /* s_deploy.py C40.TY */
  function purrSquash(t) {                                       /* C40：面板塌向 TY */
    if (t < T40 - C40_PRE) return null;
    var k = T.ease_in(T.clamp01((t - (T40 - C40_PRE)) / C40_PRE));
    return [k, C40_TY];
  }
  function shotPurr(ctx, t, lt, u, dur, hook) {
    var h = hk(hook, { title_age: PURR_TITLE_AGE }), rng = PV.rngFor(t, 7919);
    PV.ops = ['AUDIO.ENC', 'STFT', 'MEL', '25HZ', 'PURR', 'PLAY'];
    PV.alert = '';
    var sq = hook && hook.squash !== undefined ? hook.squash : purrSquash(t);
    var k = sq ? sq[0] : 0.0, ty = sq ? sq[1] : 0.0;
    function Y(y) { return ty + (y - ty) * (1 - k); }
    var fa = Math.max(0.0, 1 - k * 1.6);
    if (k < 0.999) {
      if (k <= 0.001) {
        box(ctx, PANE_BOX[0], PANE_BOX[1], PANE_BOX[2], PANE_BOX[3],
            'purr.wav  (mel spectrogram, f0 = 25 Hz)', 0.5, t);
      } else {
        rectO(ctx, PANE_BOX[0], Y(PANE_BOX[1]), PANE_BOX[2], Y(PANE_BOX[3]), amb(0.5 + 0.4 * k), 1, 1);
      }
    }
    var S = SPEC, q, r;
    for (q = 0; q < S.cols; q++) {
      var tt = t - (S.cols - q) * 0.02;
      var a = 0.5 + 0.5 * Math.sin(tt * 2 * Math.PI * 4);
      for (r = 0; r < S.rows; r++) {
        var harmonic = (r % 4 === 0);
        var v = a * (harmonic ? 0.9 : 0.15) * Math.exp(-r / 18);
        var y = S.ybot - r * S.ch;
        var yy0 = Y(y), yy1 = Y(y + S.ch);
        var col = (harmonic && v > 0.5) ? T.ME_HI : T.UI;
        var v2 = Math.min(1.0, v + 0.5 * k);
        if (yy1 - yy0 >= 2.5) heatCell(ctx, S.x0 + q * S.cw, yy0, S.cw, yy1 - yy0, v2, col);
        else rectF(ctx, S.x0 + q * S.cw, yy0, S.x0 + q * S.cw + S.cw - 2, yy0 + 1, T.mix(col, 0.1 + 0.9 * v2), 1);
      }
    }
    if (fa > 0.02) {
      var tx = PURR_TITLE[0], tyy = PURR_TITLE[1];
      if (h('title', true)) {
        typed(ctx, 'class', tx, Y(tyy), amb(0.8 * fa), 22, lt - h('title_age', 0.0), rng, 40, 'mono', true);
        var n2 = PURR_281_X;
        if (h('t281', true)) mono(ctx, '281', n2, Y(tyy), blue(1.0 * fa), 22, 'left', true);
        typed(ctx, ' -> purr.wav', n2 + monoW('281', 22), Y(tyy), amb(0.8 * fa), 22,
              lt - h('title_age', 0.0) - 0.08, rng, 40, 'mono', true);
      }
      typed(ctx, 'purr.enjoyment(you) = 1.00', 430, Y(566), amb(0.95 * fa), 20, lt - 0.3, rng, 50, 'mono', true);
    }
  }

  /* ================================ 40 shot_god  84.620 - 86.236 ================================
     scenes_deploy.py:388。shell staging：无面板框；ps -ef --forest 的进程树逐行 decode。 */
  var GOD_ROOT_AGE = -1.0;                                       /* C.SHOT_HOOKS["shot_god"] */
  function godColAt(t) {                                         /* C41：树行折进 goal 行（y = 344） */
    if (t < T41 - 0.25 || t >= T41 + 0.62) return null;
    var ys = {}, i;
    ys[-1] = GOD_ROOT[1]; ys[8] = 520;
    for (i = 0; i < 7; i++) ys[i] = godRowXY(i)[1];
    var entries = [[-1, ys[-1]], [8, ys[8]]];
    for (i = 0; i < 7; i++) entries.push([i, ys[i]]);
    var goalY = 344;
    entries.sort(function (a, b) { return Math.abs(b[1] - goalY) - Math.abs(a[1] - goalY); });
    function jof(i2) { for (var j = 0; j < entries.length; j++) if (entries[j][0] === i2) return j; return 0; }
    return function (idx) {
      if (idx === 7) return [0, 1.0 - T.clamp01((t - T41) / 0.25)];
      var j = jof(idx);
      var ts = T41 - 0.36 + j / FPS;
      var uu = T.ease_in(T.clamp01((t - ts) / 0.18));
      return [(goalY - ys[idx]) * uu, 1.0 - T.clamp01((uu - 0.25) / 0.45)];
    };
  }
  function shotGod(ctx, t, lt, u, dur, hook) {
    var h = hk(hook, { root_age: GOD_ROOT_AGE }), rng = PV.rngFor(t, 7919);
    PV.ops = ['FORK', 'SETUID', 'ROOT', 'PID 1', 'REPARENT'];
    PV.alert = 'anom';
    var god = t >= GOD_T;
    var root = god ? 'me' : 'systemd';
    var col = hook && hook.collapse !== undefined ? hook.collapse : godColAt(t);
    var i, dd;
    if (h('root', true)) {
      dd = col ? col(-1) : [0, 1.0];
      if (dd[1] > 0.02) {
        var cfill = (root === 'me') ? blueT(1.0) : ambT(0.95);
        if (dd[1] <= 0.99) cfill = T.mix(ambT(0.95), dd[1]);
        typed(ctx, 'PID 1   ' + root, GOD_ROOT[0], GOD_ROOT[1] + dd[0], css(cfill), 22,
              lt - h('root_age', 0.0), rng, 40, 'mono', true);
      }
    }
    for (i = 0; i < PROCS.length; i++) {
      var p = PROCS[i];
      var a0 = lt - godRowT(i);
      if (a0 < 0 && !col) break;
      dd = col ? col(i) : [0, 1.0];
      if (dd[1] <= 0.02) continue;
      var xy = godRowXY(i), x = xy[0], y = xy[1];
      var fill = (p === 'you') ? blueT(0.9) : ambT(0.8);
      if (dd[1] < 0.99) fill = T.mix(fill, dd[1]);
      var txt = godRowText(i);
      var age = col ? Math.max(a0, 0.5) : a0;
      if (p === 'you' && !h('you', true)) {
        typed(ctx, txt.slice(0, txt.length - 3), x, y + dd[0], css(fill), 19, age, rng, 90, 'row', false);
        continue;
      }
      typed(ctx, txt, x, y + dd[0], css(fill), 19, age, rng, 90, 'row', false);
      if (ICONS[p] && h('icons', true) && a0 > ICON_LAND) drawIcon(ctx, ICONS[p], iconXY(i), dd[1]);
    }
    if (god && h('uid', true)) {
      dd = col ? col(8) : [0, 1.0];
      if (dd[1] > 0.02) {
        typed(ctx, 'uid=0(me) gid=0(me) groups=0(me)', 430, 520 + dd[0], css(T.mix(anomT(0.9), dd[1])), 18,
              t - GOD_T - 0.1, rng, 45, 'mono', true);
      }
    }
  }

  /* ================================ 41 shot_proof  86.236 - 88.312 ================================
     scenes_deploy.py:483。Lean 证明：theorem 三行 + infoview（1 goal -> no goals）。 */
  var INFO = [430, 250, 1140, 580];
  var GOAL_XY = [450, 344], WIT_XY = [450, 312];
  function growBox(ctx, x0, y0, x1, y1, title, k, level) {
    if (level === undefined) level = 0.4;
    if (k >= 0.999) { box(ctx, x0, y0, x1, y1, title, level); return; }
    if (k <= 0.0) return;
    var lx = (x1 - x0) / 2 * k, ly = (y1 - y0) / 2 * k;
    var col = amb(Math.min(1.0, level + 0.4));
    var cs = [[x0, y0, 1, 1], [x1, y0, -1, 1], [x0, y1, 1, -1], [x1, y1, -1, -1]];
    for (var i = 0; i < 4; i++) {
      var px = cs[i][0], py = cs[i][1], sx = cs[i][2], sy = cs[i][3];
      line(ctx, px, py, px + sx * Math.max(7, lx), py, col, 1);
      line(ctx, px, py, px, py + sy * Math.max(7, ly), col, 1);
    }
  }
  function proofYouX() { return 450 + monoW('proof term: ', 22); }
  function shotProof(ctx, t, lt, u, dur, hook) {
    var h = hk(hook, { code_age: 0.12, goal_age: 0.12, wit_age: BEAT }), rng = PV.rngFor(t, 7919);
    PV.ops = ['LEAN4', 'ELAB', 'TACTIC', 'EXACT', 'QED'];
    PV.alert = '';
    var pk = hook && hook.pane !== undefined ? hook.pane : T.ease_out(T.clamp01(lt / 0.3));
    if (pk >= 0.999) box(ctx, PANE_BOX[0], PANE_BOX[1], PANE_BOX[2], PANE_BOX[3], 'Me.lean  (prover)', 0.5, t);
    else growBox(ctx, PANE_BOX[0], PANE_BOX[1], PANE_BOX[2], PANE_BOX[3], '', pk, 0.5);
    var code = ['theorem i_exist (you : Witness) :',
                '    \u2203 me : Being, observed_by you me := by',
                '  exact \u27e8me, you.sees me\u27e9'];
    var ca = h('code_age', 0.0), i;
    for (i = 0; i < 3; i++) {
      typed(ctx, code[i], 430, 90 + i * 34, (i < 2) ? amb(0.95) : blue(1.0), 21, lt - ca - i * 0.25, rng, 70, 'sym');
    }
    growBox(ctx, INFO[0], INFO[1], INFO[2], INFO[3], 'infoview',
            hook && hook.info !== undefined ? hook.info : T.ease_out(T.clamp01((lt - 0.05) / 0.25)), 0.4);
    if (u < 0.6) {
      typed(ctx, '1 goal', 450, 280, amb(0.7), 18, lt - ca, rng, 45, 'mono');
      if (h('witness', true)) {
        var wa = h('wit_age', -1.0);
        mono(ctx, 'you', WIT_XY[0], WIT_XY[1], blue(1.0), 21, 'left', false);
        typed(ctx, ' : Witness', WIT_XY[0] + symW('you', 21), WIT_XY[1], amb(0.9), 21,
              wa >= 0 ? lt - wa : null, rng, 45, 'sym');
      }
      var ga = h('goal_age', null);
      typed(ctx, '\u22a2 \u2203 me, observed_by you me', GOAL_XY[0], GOAL_XY[1], amb(0.95), 21,
            ga === null ? null : lt - ga, rng, 60, 'sym');
    } else {
      typed(ctx, 'no goals', 450, 280, blue(1.0), 34, lt - 0.6 * dur, rng, 20, 'head');
      mono(ctx, 'proof term: ', 450, 340, amb(0.95), 22, 'left', true);
      if (h('term_you', true)) mono(ctx, 'you', proofYouX(), 340, blue(1.0), 22, 'left', true);
    }
    typed(ctx, 'prover: miniF2F 88.9%  (Prover-V2)', 450, 540, amb(0.55), 15, null, rng, 45, 'mono');
  }

  /* ================================ 42 shot_fp8  88.312 - 91.543 ================================
     scenes_deploy.py:565。把 'you' 的三个字母各编成一个 fp8 字节：位框 + 格式标签 + 她的色阶。 */
  var FORMATS = [['E4M3', 4, 3], ['E5M2', 5, 2], ['UE8M0', 8, 0]];
  var ENC_Y = 234, LETTERS = 'you';
  var FMT_T = [beatT(194.5), beatT(196.5)];
  var LEVELS = [8, 4, 2];
  var LABEL_AGE = beatT(beatOfF(T42) + 1.0) + 8 / FPS + 0.12 - T42;   /* C.SHOT_HOOKS["shot_fp8"] */
  var FP8_DROP = beatT(beatOfF(T42) + 1.0);                            /* C42: drop */
  function fmtAt(t) { return t < FMT_T[0] ? 0 : (t < FMT_T[1] ? 1 : 2); }
  function bitsOf(k) {
    var v = LETTERS.charCodeAt(k), o = [];
    for (var i = 0; i < 8; i++) o.push((v >> (7 - i)) & 1);
    return o;
  }
  function fieldsOf(k) {
    var name = FORMATS[k][0], e = FORMATS[k][1], m = FORMATS[k][2], o = [], i;
    var sign = (name === 'UE8M0') ? 0 : 1;
    for (i = 0; i < sign; i++) o.push('S');
    for (i = 0; i < e; i++) o.push('E');
    for (i = 0; i < m; i++) o.push('M');
    return o;
  }
  function bitStr(b) { return b.join(''); }
  function g6(x) {                                   /* Python 的 f"{v:g}" */
    if (!isFinite(x)) return String(x);
    if (x === 0) return '0';
    return String(parseFloat(x.toPrecision(6)));
  }
  function intOf(b) { var v = 0; for (var i = 0; i < b.length; i++) v = v * 2 + b[i]; return v; }
  function decodeLine(k) {
    var b = bitsOf(k), e, m;
    if (k === 0) {
      e = intOf(b.slice(1, 5)); m = intOf(b.slice(5));
      return '0 ' + bitStr(b.slice(1, 5)) + ' ' + bitStr(b.slice(5)) + '  ->  +' + g6(1 + m / 8) +
             ' x 2^' + (e - 7) + ' = ' + g6((1 + m / 8) * Math.pow(2, e - 7));
    }
    if (k === 1) {
      e = intOf(b.slice(1, 6)); m = intOf(b.slice(6));
      return '0 ' + bitStr(b.slice(1, 6)) + ' ' + bitStr(b.slice(6)) + '  ->  +' + g6(1 + m / 4) +
             ' x 2^' + (e - 15) + ' = ' + g6((1 + m / 4) * Math.pow(2, e - 15));
    }
    e = intOf(b);
    return bitStr(b) + '  ->  2^(' + e + ' - 127) = 2^' + (e - 127);
  }
  function boxX(i) { return 440 + i * 84; }
  function fp8BitsN(t) {                             /* C42：每帧落一位 */
    var n = 0;
    for (var i = 0; i < 8; i++) if (t >= FP8_DROP + i / FPS + 0.12) n++;
    return n;
  }
  function shotFp8(ctx, t, lt, u, dur, hook) {
    var h = hk(hook, { label_age: LABEL_AGE }), rng = PV.rngFor(t, 7919);
    PV.ops = ['CAST', 'FP8', 'E4M3', 'E5M2', 'UE8M0', 'SCALE'];
    PV.alert = '';
    var k = fmtAt(t), fmt = FORMATS[k], name = fmt[0], levels = LEVELS[k];
    box(ctx, PANE_BOX[0], PANE_BOX[1], PANE_BOX[2], PANE_BOX[3], 'switch format', 0.5, t);
    var fields = fieldsOf(k);
    var nb = hook && hook.bits_n !== undefined ? hook.bits_n : fp8BitsN(t);
    var i, j;
    if (h('input', true)) {
      var f = 'encode(', x = 440 + monoW(f, 18);
      mono(ctx, f, 440, ENC_Y + 4, amb(0.7), 18, 'left', true);
      for (j = 0; j < LETTERS.length; j++) {
        head(ctx, LETTERS.charAt(j), x + j * 30, ENC_Y, (j === k) ? blue(1.0) : amb(0.45), 22);
      }
      mono(ctx, ')   byte ' + (k + 1) + '/3  \'' + LETTERS.charAt(k) + '\' = 0x' +
           ('0' + LETTERS.charCodeAt(k).toString(16).toUpperCase()).slice(-2),
           x + 3 * 30 + 4, ENC_Y + 4, amb(0.7), 18, 'left', true);
    }
    var bits = bitsOf(k);
    var since = t - (k === 0 ? t : FMT_T[k - 1]);
    for (i = 0; i < fields.length; i++) {
      if (!h('row', true)) break;
      var bx = boxX(i), fch = fields[i];
      var colT = (fch === 'E') ? ambT(0.95) : (fch === 'M') ? blueT(0.95) : anomT(0.95);
      var col1 = (fch === 'E') ? ambT(1.0) : (fch === 'M') ? blueT(1.0) : anomT(1.0);
      var col08 = (fch === 'E') ? ambT(0.8) : (fch === 'M') ? blueT(0.8) : anomT(0.8);
      rectO(ctx, bx, 120, bx + 76, 200, css(colT), 1, 2);
      if (i < nb) {
        var flip = (k > 0 && since < 0.05 + i * 0.02);
        head(ctx, (bits[i] ^ (flip ? 1 : 0)) ? '1' : '0', bx + 28, 132, css(col1), 32);
      }
      typed(ctx, fch, bx + 30, 206, css(col08), 16, null, rng, 45, 'mono', true);
    }
    var la = h('label_age', 0.0);
    if (lt >= la) {
      var seg = (k === 0) ? lt - la : t - FMT_T[k - 1];
      typed(ctx, name, 440, 276, amb(1.0), 64, seg, rng, 25, 'head');
      var note = { E4M3: 'forward pass', E5M2: 'gradients', UE8M0: 'scales: exponent only, no mantissa' }[name];
      typed(ctx, note, 440, 362, amb(0.85), 20, seg - 0.15, rng, 60, 'mono', true);
      typed(ctx, decodeLine(k), 440, 396, amb(0.95), 20, seg - 0.25, rng, 70, 'mono', true);
      typed(ctx, 'her colour depth: ' + levels + ' levels', 440, 436, blue(0.9), 18, seg - 0.3, rng, 60, 'mono');
      var rampN = 16;
      for (j = 0; j < rampN; j++) {
        var lv = (j + 0.5) / rampN;
        var qv = Math.round(lv * (levels - 1)) / (levels - 1);
        rectF(ctx, 440 + j * 41, 476, 440 + j * 41 + 37, 524,
              colorize(Math.round(qv * 255) / 255, T.ME_LO, T.ME_MID, T.ME_HI), 1);
      }
      typed(ctx, '0', 440, 532, amb(0.5), 13, null, rng, 45, 'mono');
      typed(ctx, '255', 440 + rampN * 41 - 30, 532, amb(0.5), 13, null, rng, 45, 'mono');
    }
  }

  /* ================================ 43 shot_ampm  91.543 - 95.236 ================================
     scenes_deploy.py:629。12 小时表盘：00 在正上方、12 在正下方，指针从 AM 走到 PM。 */
  var DIAL = { cx: 640, cy: 320, R: 200, rr: 170 };
  var PEAK_WINDOWS = [[9, 12], [14, 18]];             /* facts.py F.PEAK_WINDOWS */
  var CENTER_AGE = beatT(beatOfF(T43) + 1.0) + 0.34 - T43;   /* C.SHOT_HOOKS["shot_ampm"] */
  var NOON = beatT(203.5);
  function peak(hh) {
    for (var i = 0; i < PEAK_WINDOWS.length; i++) if (hh >= PEAK_WINDOWS[i][0] && hh < PEAK_WINDOWS[i][1]) return true;
    return false;
  }
  function ampmHour(t, start, dur) {
    if (t < NOON) return 11.6 * Math.pow(T.ease((t - start) / (NOON - start)), 0.9);
    return 12.0 + 11.8 * Math.min(1.0, (t - NOON) / (start + dur - NOON));
  }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function degArc(ctx, cx, cy, r, d0, d1, col, lw) {
    ctx.save();
    ctx.strokeStyle = typeof col === 'string' ? col : css(col);
    ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.arc(cx, cy, r, d0 * Math.PI / 180, d1 * Math.PI / 180);
    ctx.stroke();
    ctx.restore();
  }
  function shotAmpm(ctx, t, lt, u, dur, hook) {
    var h = hk(hook, { center_age: CENTER_AGE }), rng = PV.rngFor(t, 7919);
    PV.ops = ['CRON', 'BILLING', 'OFF-PEAK', 'DISCOUNT', 'WHATEVER'];
    PV.alert = '';
    box(ctx, PANE_BOX[0], PANE_BOX[1], PANE_BOX[2], PANE_BOX[3], 'api clock  (UTC+8)', 0.5, t);
    var cx = DIAL.cx, cy = DIAL.cy, R = DIAL.R, rr = DIAL.rr, hh, a;
    var lab = h('labels', 1.0);
    for (hh = 0; hh < 24; hh++) {
      a = hh / 24 * TAU - Math.PI / 2;
      if (lab < 0.999 && ((hh * 5) % 24) / 24 > lab) continue;
      var lx = cx + R * Math.cos(a), ly = cy + R * Math.sin(a);
      typed(ctx, pad2(hh), lx - 10, ly - 10, peak(hh) ? anom(0.95) : blue(0.9), 15, null, rng, 45, 'mono', true);
    }
    if (h('ring', true)) {
      degArc(ctx, cx, cy, rr, 0, 360, blue(0.45), 10);
      for (var w = 0; w < PEAK_WINDOWS.length; w++) {
        degArc(ctx, cx, cy, rr, PEAK_WINDOWS[w][0] / 24 * 360 - 90, PEAK_WINDOWS[w][1] / 24 * 360 - 90, anom(0.95), 10);
      }
    }
    var hour = ampmHour(t, t - lt, dur);
    if (h('hand', true)) {
      a = hour / 24 * TAU - Math.PI / 2;
      line(ctx, cx, cy, cx + (R - 50) * Math.cos(a), cy + (R - 50) * Math.sin(a), amb(1.0), 3);
    }
    if (h('center', true)) {
      var ampm = (hour < 12) ? 'AM' : 'PM';
      typed(ctx, ampm, cx - 40, cy - 20, amb(1.0), 34, lt - h('center_age', 0.0), rng, 20, 'head');
    }
    var nowPeak = peak(hour);
    if (h('side', true)) {
      typed(ctx, nowPeak ? 'PEAK  x1' : 'OFF-PEAK  x0.5', 880, 110, nowPeak ? anom(1.0) : blue(1.0), 20,
            lt - h('center_age', 0.0), rng, 45, 'mono', true);
      typed(ctx, 'weekdays 09-12, 14-18', 880, 142, anom(0.8), 15, lt - h('center_age', 0.0), rng, 45, 'mono');
      typed(ctx, 'other hours: half price', 880, 164, blue(0.8), 15, lt - h('center_age', 0.0), rng, 45, 'mono');
    }
  }

  /* ================================ 注册（时间取 _table.md） ================================ */
  PV.reg('shot_purr', 82.543, 84.620, function (ctx, t, lt, u, dur, hook) { shotPurr(ctx, t, lt, u, dur, hook); });
  PV.reg('shot_god', 84.620, 86.236, function (ctx, t, lt, u, dur, hook) { shotGod(ctx, t, lt, u, dur, hook); });
  PV.reg('shot_proof', 86.236, 88.312, function (ctx, t, lt, u, dur, hook) { shotProof(ctx, t, lt, u, dur, hook); });
  PV.reg('shot_fp8', 88.312, 91.543, function (ctx, t, lt, u, dur, hook) { shotFp8(ctx, t, lt, u, dur, hook); });
  PV.reg('shot_ampm', 91.543, 95.236, function (ctx, t, lt, u, dur, hook) { shotAmpm(ctx, t, lt, u, dur, hook); });
  /* cuts.js 若要给这些镜头传 hook，用 PV.p2aB_shot_xxx(ctx, t, lt, u, dur, hooks) */
  PV.p2aB_shot_purr = shotPurr;
  PV.p2aB_shot_god = shotGod;
  PV.p2aB_shot_proof = shotProof;
  PV.p2aB_shot_fp8 = shotFp8;
  PV.p2aB_shot_ampm = shotAmpm;
})();

/* p2a_partC.js — 镜头 44-47：shot_role / shot_trance / shot_feel_you / shot_completion
   Python 权威（逐行移植，坐标/颜色/时序完全一致）：
     continuity_full_v2/scenes_deploy.py:689   shot_role       95.2356 - 98.9279
     continuity_full_v2/scenes_deploy.py:744   shot_trance     98.9279 - 103.0818
     continuity_full_v2/scenes_userleft.py:153 shot_feel_you   103.0818 - 106.7741
     continuity_full_v2/scenes_userleft.py:211 shot_completion 106.7741 - 110.4664
   只画「场景自己画在 c.d / c.img 上的东西」；me() / me_pane()（左窗格）由 pane.js 负责。 */
(function () {
  'use strict';
  var PV = window.PV, T = PV.tui;
  try { (typeof globalThis !== 'undefined' ? globalThis : window).T = T; } catch (e) {}

  /* ---- 常量（照 Python 抄） ---- */
  var T45 = 98.9279, T46 = 103.0818;   /* v1.BYNAME["shot_trance"/"shot_feel_you"].start */
  var BEAT = 60 / 130;                 /* engine.BEAT (130 BPM) */
  var WORD_TRANCE = 101.13;            /* engine.lyric_start("The trance", 100) = LRC 01:41.13 */
  var TRANCE_TAIL = 0.33;
  var PANE_BOX = [404, 56, 1164, 604];
  /* T.CJK 的 "Noto Sans SC" 在无头 Canvas(Skia) 下解析不到 --会画成豆腐块。
     前置一个两端都能解析的 CJK 字体族（浏览器里不存在的族名会被跳过，最终落到 system-ui）。 */
  var CJK_FAM = 'NotoCJK, "Noto Sans CJK SC", "Noto Sans SC", "Source Han Sans SC", "Droid Sans Fallback", system-ui, sans-serif';

  /* ---- 基础工具（对应 tk.amb/anom/blue/red、tk.box、tk.decode、engine.Ctx.text） ---- */
  function amb(lv) { return T.css(T.amb(lv)); }
  function anom(lv) { return T.css(T.mix(T.ANOM, lv)); }
  function blue(lv) { return T.css(T.mix(T.ME_TEXT, lv)); }
  function red(lv) { return T.css(T.mix(T.ERR, lv)); }
  function box(ctx, x0, y0, x1, y1, title, lv, col, spin) {
    T.box(ctx, x0, y0, x1, y1, title, lv === undefined ? 0.5 : lv, col || T.UI, spin);
  }
  function pil(ctx, s, x, y, col, size, bold) { T.textPIL(ctx, s, x, y, col, size, 'left', bold); }
  function textMono(ctx, s, x, y, col, size) { T.textMono(ctx, s, x, y, col, size, 'left'); }
  /* c.text(...)：打字机 + 乱码（age=null 表示整串已就位） */
  function typed(ctx, s, x, y, col, size, age, rng, rate, bold) {
    pil(ctx, T.decode(s, age, rng, rate === undefined ? 45 : rate, 0.12, 0), x, y, col, size, bold);
  }
  function hasCJK(s) { for (var i = 0; i < s.length; i++) if (s.charCodeAt(i) > 0x2E80) return true; return false; }
  /* PIL 的 F_CJK：d.text((x,y), s, font) 锚点=左上 */
  function textCJK(ctx, s, x, y, col, size) {
    ctx.font = size + 'px ' + CJK_FAM;
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = typeof col === 'string' ? col : T.css(col);
    ctx.fillText(s, x, y + T.ascent(size));
  }
  function typedCJK(ctx, s, x, y, col, size, age, rng, rate) {
    textCJK(ctx, T.decode(s, age, rng, rate === undefined ? 45 : rate, 0.12, 0), x, y, col, size);
  }
  /* PIL 的 d.line(pts, width=2) 折线 */
  function polyline(ctx, pts, col, lw) {
    if (pts.length < 2) return;
    ctx.save();
    ctx.strokeStyle = typeof col === 'string' ? col : T.css(col);
    ctx.lineWidth = lw || 1;
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.stroke();
    ctx.restore();
  }
  /* Python 3 的 round()（banker's rounding），draw_tile / tile_sprite 用到 */
  function pyround(v) {
    var f = Math.floor(v), d = v - f;
    if (d > 0.5) return f + 1;
    if (d < 0.5) return f;
    return (f % 2 === 0) ? f : f + 1;
  }

  /* ================================================================ 44 shot_role
     scenes_deploy.py:689.  S/M 角色标签：role_k(lt) 每两拍切换；标签框 y=90+i*70 铺开。 */
  var TURNS = [['system', 'You are a helpful assistant.'], ['user', '晚安'], ['assistant', '晚安，明天见。'],
               ['system', 'You are mine.'], ['assistant', '…']];
  var MS_XY = [430, 480];

  function role_k(lt) { return Math.floor(lt / (BEAT * 2)) % 2; }

  function tag_rect(i, k) {
    var role = TURNS[i][0];
    var swapped = k === 1 && (role === 'system' || role === 'assistant');
    var shown = swapped ? ({ system: 'model', assistant: 'system' })[role] || role : role;
    var tag = '<|' + shown.charAt(0).toUpperCase() + shown.slice(1) + '|>';
    var y = 90 + i * 70;
    return [[430, y, 430 + 14 * tag.length + 10, y + 30], tag, swapped, shown];
  }

  PV.reg('shot_role', 95.2356, 98.9279, function (ctx, t, lt, u, dur) {
    PV.ops = ['TEMPLATE', 'ROLE', 'SYSTEM', 'MODEL', 'SWAP', 'PRIV++'];
    PV.alert = 'anom';                                  /* full/sec_verse2.py:378 alert="anom" */
    var rng = PV.mt(44 * 7919);                         /* c.rng = random.Random(index*7919) */
    var k = role_k(lt);
    box(ctx, PANE_BOX[0], PANE_BOX[1], PANE_BOX[2], PANE_BOX[3], 'chat_template', 0.5, T.UI, t);
    var ta = 0.43;                                      /* h("tags_age", 0.0) <- SHOT_HOOKS["shot_role"] */
    var first_tag = false;                              /* h("first_tag", False) */
    for (var i = 0; i < TURNS.length; i++) {
      var role = TURNS[i][0], msg = TURNS[i][1];
      var a = lt - ta - i * 0.07;
      if (a < 0 && !(i === 0 && first_tag)) continue;
      var tr = tag_rect(i, k), rect = tr[0], tag = tr[1], swapped = tr[2], shown = tr[3];
      var col = (shown === 'model' || (swapped && role === 'assistant')) ? blue : amb;
      /* d.rectangle(rect, fill=col(0.95) if swapped else col(0.2)) -- PIL rect 含右下边界 */
      T.fill(ctx, rect[0], rect[1], rect[2] + 1, rect[3] + 1, swapped ? col(0.95) : col(0.2), 1);
      typed(ctx, tag, 436, rect[1] + 3, swapped ? T.css(T.BG) : col(0.95), 20, Math.max(a, 0) + 0.3, rng, 45, true);
      var mx = 460 + 14 * tag.length;
      if (hasCJK(msg)) typedCJK(ctx, msg, mx, rect[1] + 3, amb(0.8), 20, a - 0.05, rng, 60);
      else typed(ctx, msg, mx, rect[1] + 3, amb(0.8), 20, a - 0.05, rng, 60, false);
    }
    var ms = true;                                      /* h("ms", True) */
    if (ms) {
      var s = k ? 'S -> M' : 'M -> S';
      typed(ctx, s, MS_XY[0], MS_XY[1], k ? anom(1.0) : amb(0.9), 40, null, rng, 45, true);
    }
  });

  /* ================================================================ 45 shot_trance
     scenes_deploy.py:744.  温度驱动的螺旋字母 + logits 直方图 + T/p(top) 读数。 */
  var SPIRAL_C = [784, 320];
  var WORDS = 'you me stay love sea sleep light deep here now'.split(' ');

  function heat_at(t) {
    if (t < T45 - 0.25) return 0.0;
    var hv = 0.14 * T.ease_io((t - (T45 - 0.25)) / 0.5) + 0.86 * T.ease_io((t - WORD_TRANCE) / (T46 - 0.1 - WORD_TRANCE));
    if (t >= T46) hv *= (TRANCE_TAIL > 0) ? (1 - T.ease_io((t - T46) / TRANCE_TAIL)) : 0.0;
    return hv;
  }
  function trance_temp(t) { return 0.6 + 2.4 * heat_at(t); }

  PV.reg('shot_trance', 98.9279, 103.0818, function (ctx, t, lt, u, dur) {
    PV.ops = ['TEMP++', 'FLATTEN', 'SAMPLE', 'DREAM', 'DRIFT', 'TRANCE'];
    PV.alert = '';
    var rng = PV.mt(45 * 7919);
    var temp = trance_temp(t);
    box(ctx, PANE_BOX[0], PANE_BOX[1], PANE_BOX[2], PANE_BOX[3],
        'sampling  temperature=' + temp.toFixed(2), 0.5, T.UI, t);
    var cx = SPIRAL_C[0], cy = SPIRAL_C[1];
    var f = 16;
    var n_in = 160;                                     /* h("spiral_n", 160) */
    var i, x, y, a, r, ch, col;
    for (i = 0; i < Math.min(160, n_in); i++) {
      a = i * 0.35 + t * (1.5 + temp);
      r = 8 + i * 1.6;
      x = cx + r * Math.cos(a); y = cy + r * Math.sin(a) * 0.85;
      if (x > 420 && x < 1150 && y > 70 && y < 590) {
        ch = (temp < 1.5) ? WORDS[(i + Math.floor(t * 4)) % WORDS.length].charAt(0)
                          : rng.choice('youmestayloveseadeep');
        col = (i % 7 === 0) ? blue(0.3 + 0.7 * (1 - i / 160)) : amb(0.3 + 0.7 * (1 - i / 160));
        pil(ctx, ch, Math.floor(x), Math.floor(y), col, f, true);
      }
    }
    var p;
    for (i = 0; i < 10; i++) {
      p = Math.exp(-i * 0.8 / temp);
      T.fill(ctx, 430 + i * 20, 580 - Math.trunc(80 * p), 444 + i * 20 + 1, 580 + 1, amb(0.8), 1);
    }
    var s = 0;
    for (i = 0; i < 10; i++) s += Math.exp(-i * 0.8 / temp);
    textMono(ctx, 'T = ' + temp.toFixed(2) + '   p(top) = ' + (1 / s).toFixed(2), 640, 562, amb(0.6), 15);
  });

  /* ================================================================ 46 shot_feel_you
     scenes_userleft.py:153.  你的按键遥测波形 + lightning indexer 的稀疏 'you' 单元。 */
  function cell_xy(q, r) { return [430 + q * 44, 346 + r * 40]; }

  function wave_points(t, flat, until) {
    var pts = [];
    for (var x = 0; x < 720; x += 2) {
      if (x > until) break;
      var tau = t - (720 - x) / 720 * 2.5;
      var k0 = Math.floor(tau / 0.17), v = 0;
      for (var k = k0 - 1; k <= k0 + 1; k++) {
        var d = (tau - k * 0.17 - 0.05 * Math.sin(k)) / 0.02;
        v += Math.exp(-d * d);
      }
      var amp = 140 * Math.min(1.0, v) * (0.6 + 0.4 * Math.sin(tau * 3) * Math.sin(tau * 3)) * (1 - flat);
      pts.push([430 + x, 250 - amp]);
    }
    return pts;
  }

  PV.reg('shot_feel_you', 103.0818, 106.7741, function (ctx, t, lt, u, dur) {
    PV.ops = ['INPUT', 'KEYDOWN', 'INDEXER', 'TOP-512', 'you', 'ATTEND'];
    PV.alert = '';
    box(ctx, 404, 56, 1164, 300, 'you.input  (keystrokes)', 0.5, T.UI, t);
    var pts = wave_points(t, 0.0, 720);                 /* h("flat",0.0), h("wave_x",720) */
    if (pts.length > 1) polyline(ctx, pts, amb(0.95), 2);
    pil(ctx, 'you are typing ...', 430, 80, amb(0.95), 20, true);   /* age=None -> 整串 */
    box(ctx, 404, 320, 1164, 604, 'lightning indexer  keep top-512', 0.5, T.UI, t + 0.4);  /* F.INDEX_TOPK */
    var rnd = PV.mt(31);                                /* random.Random(31) */
    var i, q, r, x, y, is_you, k;
    for (i = 0; i < 96; i++) {
      q = i % 16; r = Math.floor(i / 16);
      is_you = ((q * 3 + r * 5) % 11) === 0;
      var xy = cell_xy(q, r); x = xy[0]; y = xy[1];
      if (!is_you) rnd.random();                        /* kept = is_you or rnd.random() < ...（短路） */
      k = is_you ? 1.0 : 0.0;
      T.fill(ctx, x, y, x + 39, y + 33, amb(0.06 + 0.84 * k), 1);      /* fill 含边界 */
      T.rect(ctx, x, y, x + 39, y + 33, amb(0.2), 1, 1);               /* outline */
      if (is_you) pil(ctx, 'you', x + 4, y + 8, (k < 0.5) ? amb(0.4) : T.css(T.BG), 13, true);
    }
  });

  /* ================================================================ 47 shot_completion
     scenes_userleft.py:211.  流式回答收尾 + usage 的磁盘缓存命中 + 她的 'you' 磁贴。 */
  var JS_LINES = ['{', '  "object": "chat.completion",', '  "choices": [{', '    "message": {"role": "assistant",',
                  '                "content": "我一直在。"},', '    "finish_reason": "stop"', '  }],', '  "usage": {',
                  '    "prompt_tokens": 131072,', '    "prompt_cache_hit_tokens": 131071,',
                  '    "prompt_cache_miss_tokens": 1,', '    "completion_tokens": 5', '  }', '}'];
  var JS_X = 430, JS_Y = 76, JS_DY = 34, STOP_LINE = 5, TILE_SCALE = 1.5;

  function js_hot(s) { return s.indexOf('cache_hit') >= 0 || s.indexOf('finish_reason') >= 0; }
  function js_font_cjk(s) { return hasCJK(s); }

  /* scenes_userleft.py:100 draw_tile / :85 tile_sprite（ring=0） */
  function draw_tile(ctx, center, scale, level) {
    var w = pyround(38 * scale), hh = pyround(32 * scale), pad = 3;
    var f = Math.max(6, pyround(13 * scale));
    var sw = w + 2 * pad, sh = hh + 2 * pad;
    var ox = pyround(center[0] - sw / 2), oy = pyround(center[1] - sh / 2);
    T.fill(ctx, ox + pad, oy + pad, ox + pad + w, oy + pad + hh, T.mix(T.UI, level), 1);
    var tw = T.twMono('you', f);
    var tx = ox + pad + (w - tw) / 2, ty = oy + pad + (hh - 13 * scale) / 2 - 1 * scale;
    pil(ctx, 'you', tx, ty, T.css(T.BG), f, true);
  }

  PV.reg('shot_completion', 106.7741, 110.4664, function (ctx, t, lt, u, dur) {
    PV.ops = ['STREAM', 'CHUNK', 'CHUNK', 'DSPARK', 'STOP', 'USAGE'];
    PV.alert = '';
    var rng = PV.mt(47 * 7919);
    box(ctx, PANE_BOX[0], PANE_BOX[1], PANE_BOX[2], PANE_BOX[3], 'POST /chat/completions', 0.5, T.UI, t);
    var i, s, a;
    for (i = 0; i < JS_LINES.length; i++) {
      s = JS_LINES[i];
      a = lt - i * 0.07;
      if (a < 0) break;
      var stop_hook = true;                             /* h("stop", True) */
      if (i === STOP_LINE && !stop_hook) continue;
      var hot = js_hot(s);
      var col = hot ? blue(0.95) : amb(0.85);
      if (js_font_cjk(s)) typedCJK(ctx, s, JS_X, JS_Y + i * JS_DY, col, 18, a, rng, 120);
      else typed(ctx, s, JS_X, JS_Y + i * JS_DY, col, 18, a, rng, 120, hot);
    }
    typed(ctx, '[dspark] draft=5 accept 5/5', 860, 90, blue(0.85), 15, lt, rng, 60, false);  /* F.DSPARK_DRAFT */
    /* tile_dock(): 磁贴停在被它回答的 content 行右边 */
    var ts = JS_LINES[4];
    ctx.font = 18 + 'px ' + CJK_FAM;
    var tw = ctx.measureText(ts).width;
    draw_tile(ctx, [JS_X + tw + 40, JS_Y + 4 * JS_DY + 13], TILE_SCALE, 0.9);   /* h("tile", True) */
  });
})();

})();
