/* paneplace.js —— 她的窗格（#chat，真 HTML）在画面里的位置控制。
   1) 布局位移：有些镜头参考成片把她的窗格放到别处（不是左边原位）。
      逐帧量 video1.mp4 得到的结论（用"参考有墨、我们画布没墨"的 64px 带差定位）：
        shot_hoard（141.389-144.159）：她的窗格在 x≈768..1152（带 12-17），整段都在右边；
        其余绝大多数镜头都在原位（带 0-5 = x 0..384），包括 shot_world/shot_corpus/shot_infinity 这些
        v1 LAYOUT 里写 mirror/tiles/floating 的镜头 —— 因为 v2 的 SPLIT 集合把它们改回了 split。
      所以这里只对 shot_hoard 做一次水平位移（+762 设计像素）。
   2) 滑出：shot_whale_fall 进场时她向右滑出画面（逐帧实测 193.783 x=23 → 193.867 x=109 →
      194.033 x=269 → 194.117 x=312，两人独立量过方向一致）。
   还把 canvas 上那个左窗格框（frame.js 的 PV.drawPanes）一起平移，否则窗格走了框还在。
   关掉：PV.PANEPLACE_OFF = 1，或在 index.html 去掉这个 script。 */
(function () {
  'use strict';
  var PV = window.PV;
  if (!PV || PV.PANEPLACE_OFF) return;
  var T = PV.tui;
  var PLACE = { shot_hoard: 762 };
  var A = 193.82, B = 194.20, SLIDE_DX = 420, SLIDE_END = 205.5433;
  PV.slideAt = function (t) {
    if (t < A) return 0;
    if (t < B) return T.ease_out(T.clamp01((t - A) / (B - A)));
    return t < SLIDE_END ? 1 : 0;
  };
  PV.placeAt = function (t) {
    var n = PV.shotName;
    return (n && PLACE[n]) ? PLACE[n] : 0;
  };
  PV.paneDx = function (t) { return PV.placeAt(t) + SLIDE_DX * PV.slideAt(t); };
  var baseVis = PV.paneVisible;
  PV.paneVisible = function (t) {
    var e = PV.slideAt(t);
    if (e > 0.001 && e < 0.999) return true;
    return baseVis ? baseVis(t) : true;
  };
  var basePanes = PV.drawPanes;
  PV.drawPanes = function (ctx, t) {
    if (!basePanes) return;
    var dx = PV.paneDx(t);
    if (dx > 0.001) { ctx.save(); ctx.translate(dx, 0); basePanes.call(PV, ctx, t); ctx.restore(); }
    else basePanes.call(PV, ctx, t);
  };
  var baseSync = PV.sync;
  PV.sync = function (t) {
    if (baseSync) baseSync.call(PV, t);
    var chat = document.getElementById('chat');
    if (!chat) return;
    var dx = PV.paneDx(t);
    chat.style.transform = dx > 0.001 ? 'translateX(' + dx.toFixed(2) + 'px)' : '';
  };
})();

