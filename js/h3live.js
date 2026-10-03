/* H3 逐帧立绘：时间 -> (take, 帧) 的查表与重采样。
   数据在 js/h3pool.js（window.H3POOL），图像在 data/h3/NN.png（23 张，取自 44 帧循环池）。
   权威实现：continuity_full_v2/h3_full.py 的 source() / join() / sprite_src()。
   v2.py 默认 HER=h3，install() 会用 source_key(now()) 给所有字符路线重做缓存键 ——
   所以调用点不用改，只需要把「源图/字形网格」换成按时间查表得到的这一帧。 */
(function () {
  'use strict';
  var PV = window.PV; if (!PV) return;
  var P = window.H3POOL; if (!P) { PV.h3 = null; return; }
  var FPS = 24, PERIOD = 16 * 60 / 130;         /* loop take 的一小节 = 7.3846 s */
  var IMG = [], LOADED = {};
  function img(k) {
    if (IMG[k]) return IMG[k];
    var p = P.img + (k < 10 ? "0" : "") + k + ".png";
    if (PV.loadImage) { PV.loadImage(p, function (im) { IMG[k] = im; }); }
    return IMG[k] || null;
  }
  function planAt(t) {
    for (var i = 0; i < P.plan.length; i++) { var p = P.plan[i]; if (t >= p[0] && t < p[1]) return p; }
    return P.plan[P.plan.length - 1];
  }
  /* h3_full.source() 的忠实移植 */
  function source(t) {
    t = Math.max(0, Math.min(211.999, t));
    var p = planAt(t), start = p[0], end = p[1], name = p[2], a = p[3], b = p[4], mode = p[5];
    var u = (mode === "loop")
      ? ((((t - start) % PERIOD) + PERIOD) % PERIOD) / PERIOD
      : (t - start) / (end - start);
    var sec = a + (b - a) * u;
    var kn = P.knots[name];
    if (kn && Math.abs(start - kn[0][0]) < 0.001) {
      for (var i = 0; i < kn.length - 1; i++) {
        var x = kn[i][0], v = kn[i][1], y = kn[i + 1][0], w = kn[i + 1][1];
        if (t < y) { sec = v + (w - v) * (t - x) / (y - x); break; }
      }
    }
    var arr = P.takes[name] || [0];
    var i2 = Math.max(0, Math.min(arr.length - 1, Math.round(sec * FPS)));
    return { take: name, i: i2, pool: arr[i2], sec: sec };
  }
  /* h3_full.join()：每个 take 边界 4 帧的终端扫描，前后 take 各出一部分 */
  function join(t) {
    t = Math.max(0, Math.min(211.999, t));
    var p = planAt(t), boundary = p[0];
    if (p[5] === "loop") boundary += Math.floor((t - boundary) / PERIOD) * PERIOD;
    var age = t - boundary;
    if (boundary > 0 && age < 4 / FPS) {
      return { prev: source(boundary - 1 / FPS), u: Math.min(1, (age * FPS + 1) / 4) };
    }
    return null;
  }
  /* 当前帧（带 join 时按 u 逐行拼前后两帧） */
  function frameAt(t) {
    var s = source(t), j = join(t);
    if (!j) return { k: s.pool, k2: null, cut: 0, take: s.take, i: s.i };
    return { k: s.pool, k2: j.prev.pool, cut: Math.round(540 * j.u), take: s.take, i: s.i };
  }
  for (var _k = 0; _k < (P.imgCount || 23); _k++) img(_k);   // 初始化时全部预载，否则第一帧拿到 null
  /* 【重要】池子图 data/h3/NN.png 已经是 h3_full.py 里 'full' 那一格 (0,60,420,540) 的裁切结果
     （420x480，与 cache/h3_full_v1/rgba/<take>/<i>.png 逐像素相等，mean|d|=0.000 已验），
     所以其余三个框要整体上移 POOL_TOP=60 行，full 直接是整张图。
     原始框（420x540 坐标系）：upper(0,70,420,350) bust(40,70,390,310) face(80,80,335,250)。 */
  var POOL_TOP = 60, POOL_H = 480;
  PV.h3 = { at: source, join: join, frame: frameAt, img: img, PERIOD: PERIOD, FPS: FPS,
            POOL_TOP: POOL_TOP, POOL_H: POOL_H,
            crop: { full: [0, 0, 420, POOL_H], upper: [0, 10, 420, 290], bust: [40, 10, 390, 250], face: [80, 20, 335, 190] },
            /* 把当前 H3 帧按 (cols,rows) 采成字形网格 —— 等价于 H3 版 glyph_grid 的取源 */
            lines: function (t, cols, rows, crop) { return PV.h3.rows(t, cols, rows, crop); } };
  /* glyph_grid 的取源：RGBA -> 亮度 + 方向梯度 -> 字形 ramp（和 tuikit.glyph_grid 同一套判据） */
  var RAMP = " .:-=+*#%@";
  PV.h3.rows = function (t, cols, rows, crop) {
    var src = PV.h3.src(t, crop || "upper");
    if (!src) return null;
    var cv = PV.newCanvas(cols, rows), g = cv.getContext("2d");
    g.imageSmoothingEnabled = true;
    g.drawImage(src, 0, 0, src.width, src.height, 0, 0, cols, rows);
    var d = g.getImageData(0, 0, cols, rows).data, out = [], r, c;
    for (r = 0; r < rows; r++) {
      var s = "";
      for (c = 0; c < cols; c++) {
        var i4 = (r * cols + c) * 4;
        if (d[i4 + 3] < 110) { s += " "; continue; }
        var v = (0.299 * d[i4] + 0.587 * d[i4 + 1] + 0.114 * d[i4 + 2]) / 255;
        s += RAMP[Math.min(RAMP.length - 1, 1 + Math.floor(v * (RAMP.length - 1)))];
      }
      out.push(s);
    }
    return out;
  };
  /* ---- sprite_src()：当前时刻的 H3 帧按固定框裁切（含 join 的上下拼接）。
     权威：h3_full.py:168-177 —— boxes 就是上面 PV.h3.crop 那四个；
     join 时 mask 把上面 round(540*u) 行给新帧、下面给旧帧。 ---- */
  var _srcLast = { key: null, cv: null };
  PV.h3.src = function (t, crop) {
    crop = crop || "upper";
    var f = frameAt(t), k2 = (f.k2 === null || f.k2 === undefined) ? "-" : f.k2;
    var key = f.k + "|" + k2 + "|" + f.cut + "|" + crop;
    if (_srcLast.key === key) return _srcLast.cv;
    var im = img(f.k); if (!im) return null;
    var bx = PV.h3.crop[crop] || PV.h3.crop.upper;
    var w = bx[2] - bx[0], h = bx[3] - bx[1];
    var cv = PV.newCanvas(w, h), g = cv.getContext("2d");
    g.imageSmoothingEnabled = true;
    g.drawImage(im, bx[0], bx[1], w, h, 0, 0, w, h);
    if (k2 !== "-") {
      var im2 = img(f.k2);
      if (im2) {                                   /* f.cut 是 540 坐标系里的拼接线 */
        var cut = (f.cut - POOL_TOP) - bx[1];
        cut = Math.max(0, Math.min(h, cut));
        if (cut < h) g.drawImage(im2, bx[0], bx[1] + cut, w, h - cut, 0, cut, w, h - cut);
      }
    }
    _srcLast.key = key; _srcLast.cv = cv;
    return cv;
  };
  /* {lum, alpha} 网格：给 halfblock / conv_maps 这类要 RGBA 源图的路线用，
     等价 whaleCells/herCells 的返回值形状（未预乘亮度 + alpha）。 */
  PV.h3.cells = function (t, crop, cols, rows) {
    var src = PV.h3.src(t, crop);
    if (!src || cols < 1 || rows < 1) return null;
    var tmp = PV.newCanvas(cols, rows), g = tmp.getContext("2d");
    g.imageSmoothingEnabled = true;
    g.drawImage(src, 0, 0, src.width, src.height, 0, 0, cols, rows);
    var d = g.getImageData(0, 0, cols, rows).data, k, i;
    var lum = new Float32Array(cols * rows), al = new Uint8Array(cols * rows);
    for (k = 0; k < cols * rows; k++) {
      i = k * 4; lum[k] = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]; al[k] = d[i + 3];
    }
    return { lum: lum, alpha: al, cols: cols, rows: rows };
  };
  PV.h3.aspect = function (crop) {
    var bx = PV.h3.crop[crop] || PV.h3.crop.upper;
    return (bx[3] - bx[1]) / (bx[2] - bx[0]);
  };
  /* ---- 时钟：Python h3_full.timed()/at() 的等价物。
     任何镜头被画之前先把"当前歌内时刻"写进 PV.h3.T，
     这样不带 t 参数的取源函数（whaleCells / glyphGrid / p2cPortraitBuild…）也能拿到 H3 当前帧。 ---- */
  PV.h3.T = 0;
  PV.h3.now = function () { return PV.h3.T === undefined || PV.h3.T === null ? (PV.t || 0) : PV.h3.T; };
  var _scene = PV.scene;
  if (typeof _scene === "function") PV.scene = function (ctx, t) { PV.h3.T = t; return _scene(ctx, t); };
})();
