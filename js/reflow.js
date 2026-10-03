/* 【未启用 / 留档】经 Python 源码核对：参考成片的转场权威是 continuity_full_v2 的 74 个 Cut 类   （v2.py:258-294 的帧循环只走 active_cut + C.body，全文不调 engine.render_frame），   所以 full/direction.py 的 17 处 reflow / glide / spin / crt **不在参考成片里**，   本文件是一份忠实的算法留档，**不要接进 index.html**（详见 pvport/PORT_AUDIT.md 第 12/19 节）。 */
/* reflow —— full/transitions.py:26-92 的忠实移植（我们此前完全没有实现）。
   A 解体成字形粒子，沿希尔伯特曲线配对飞向 B 的亮点并落进去；
   底色是 BG（不是黑）；匹配顺序按希尔伯特键排，所以"邻居还是邻居"，粒子不会乱飞。

   engine.py:462-475 的语义（谁在什么时候用哪种转场）：
     p = (t - (cut - pre)) / (pre + post_)          cut = 新镜头起点
     pre = min(0.7*n, 0.6*(a.end-a.start))  post_ = min(0.3*n, 0.4*(b.end-b.start))   n = frames/24
     kind == "glide" 且两边都不是 black/raw/no_chrome -> stage.glide（布局自己动）
     否则 glide 直接退化成 reflow —— **所以 reflow 其实是全片的默认转场**，不只是那 17 处。 */
(function () {
  'use strict';
  var PV = window.PV, T = PV.tui;
  if (!PV || !T) return;
  var GRID = 7, W = 1280, H = 720;

  /* _xy2d：标准希尔伯特曲线 d 值（transitions.py:28-40 逐行照抄） */
  function xy2d(n, x, y) {
    var d = 0, s = n >> 1, rx, ry, t;
    while (s > 0) {
      rx = (x & s) ? 1 : 0; ry = (y & s) ? 1 : 0;
      d += s * s * ((3 * rx) ^ ry);
      if (ry === 0) {
        if (rx === 1) { x = n - 1 - x; y = n - 1 - y; }
        t = x; x = y; y = t;
      }
      s >>= 1;
    }
    return d;
  }
  var _hk = {};
  function hilbertKeys(cols, rows) {
    var k = cols + 'x' + rows;
    if (_hk[k]) return _hk[k];
    var n = 256, out = new Array(cols * rows), i = 0, q, r;
    for (r = 0; r < rows; r++)
      for (q = 0; q < cols; q++)
        out[i++] = xy2d(n, Math.floor(q * n / cols), Math.floor(r * n / rows));
    return (_hk[k] = out);
  }
  /* _points()：7x7 采样 → 亮度 > 38 → 按希尔伯特键升序 → 等间隔抽稀到 limit */
  function points(cv, limit) {
    var cols = Math.max(1, Math.floor(cv.width / GRID)), rows = Math.max(1, Math.floor(cv.height / GRID));
    var tmp = PV.newCanvas(cols, rows), g = tmp.getContext('2d');
    g.imageSmoothingEnabled = true;
    g.drawImage(cv, 0, 0, cv.width, cv.height, 0, 0, cols, rows);
    var d = g.getImageData(0, 0, cols, rows).data;
    var keys = hilbertKeys(cols, rows), pts = [], i, lum;
    for (i = 0; i < cols * rows; i++) {
      lum = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
      if (lum <= 38) continue;
      pts.push([keys[i], (i % cols) * GRID + (GRID >> 1), Math.floor(i / cols) * GRID + (GRID >> 1),
                [d[i * 4], d[i * 4 + 1], d[i * 4 + 2]]]);
    }
    pts.sort(function (a, b) { return a[0] - b[0]; });
    if (pts.length > limit) {
      var step = pts.length / limit, out = [];
      for (var k = 0; k < limit; k++) out.push(pts[Math.floor(k * step)]);
      pts = out;
    }
    return pts;
  }
  /* 两层淡入淡出：黑底换成 BG 底色，逐像素取较亮者（PIL ImageChops.lighter = max）。 */
  function layers(A, B, q) {
    var sa = 1 - T.smoothstep(q / 0.35), sb = T.smoothstep((q - 0.62) / 0.38);
    var b2 = PV.newCanvas(W, H), g2 = b2.getContext('2d');
    g2.fillStyle = T.css(T.BG, 1); g2.fillRect(0, 0, W, H);
    g2.globalAlpha = sb; g2.drawImage(B, 0, 0); g2.globalAlpha = 1;
    var out = PV.newCanvas(W, H), g = out.getContext('2d');
    g.fillStyle = T.css(T.BG, 1); g.fillRect(0, 0, W, H);
    g.globalAlpha = sa; g.drawImage(A, 0, 0); g.globalAlpha = 1;
    g.globalCompositeOperation = 'lighten';       /* canvas 的 lighten = 逐通道 max，与 lighter 等价 */
    g.drawImage(b2, 0, 0);
    g.globalCompositeOperation = 'source-over';
    return { cv: out, g: g };
  }
  /* 粒子：每个粒子的出发延迟 s0 与弧度 bend 用**固定种子 11**（全片恒定），字形用每帧 rng。 */
  function particles(g, A, B, q, rng, n) {
    var pa = points(A, n), pb = points(B, n);
    if (!pa.length || !pb.length) return;
    var m = Math.max(pa.length, pb.length), rnd = PV.mt(11);
    for (var k = 0; k < m; k++) {
      var a = pa[Math.floor(k * pa.length / m)], b = pb[Math.floor(k * pb.length / m)];
      var s0 = 0.04 + 0.28 * rnd.random();
      var kk = T.smoothstep((q - s0) / 0.58);
      if (kk <= 0 || kk >= 1) continue;
      var dx = b[1] - a[1], dy = b[2] - a[2];
      var bend = Math.sin(Math.PI * kk) * (0.18 + 0.12 * rnd.random());
      var x = a[1] + dx * kk - dy * bend;
      var y = a[2] + dy * kk + dx * bend;
      var c0 = a[3], c1 = b[3];
      var r = Math.min(255, Math.floor((c0[0] + (c1[0] - c0[0]) * kk) * 1.5) + 30);
      var gg = Math.min(255, Math.floor((c0[1] + (c1[1] - c0[1]) * kk) * 1.5) + 30);
      var bb = Math.min(255, Math.floor((c0[2] + (c1[2] - c0[2]) * kk) * 1.5) + 30);
      T.textMono(g, T.SCR.charAt(Math.floor(rng.random() * T.SCR.length)), x - 3, y - 6,
                 'rgb(' + r + ',' + gg + ',' + bb + ')', 11);
    }
  }
  /* 纯函数：A/B 两张画布 -> 合成后的画布。q∈[0,1]，rng 是每帧的乱数（字形用）。 */
  PV.reflowMake = function (A, B, q, rng, n) {
    q = T.clamp01(q);
    var L = layers(A, B, q);
    if (q > 0 && q < 1) particles(L.g, A, B, q, rng, n || 1500);
    return L.cv;
  };
  /* 便捷入口：把两个镜头函数渲到离屏再合成（老镜头用 t，新镜头用 max(t, tNew)，与 engine.py:460-461 一致） */
  PV.reflowTo = function (ctx, q, fromFn, toFn, t, tNew, rng) {
    var ca = PV.newCanvas(W, H), cb = PV.newCanvas(W, H);
    ca.getContext('2d').fillStyle = T.css(T.BG, 1); ca.getContext('2d').fillRect(0, 0, W, H);
    cb.getContext('2d').fillStyle = T.css(T.BG, 1); cb.getContext('2d').fillRect(0, 0, W, H);
    try { fromFn(ca.getContext('2d'), t); } catch (e) {}
    try { toFn(cb.getContext('2d'), Math.max(t, tNew === undefined ? t : tNew)); } catch (e) {}
    ctx.drawImage(PV.reflowMake(ca, cb, q, rng), 0, 0);
  };
})();

