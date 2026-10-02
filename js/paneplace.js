/* paneplace.js —— 她的窗格（#chat，真 HTML）在整个画面里的位置控制。
   三件事：
   1) 布局位移：shot_hoard（141.389-144.159）参考里她的窗格在画面右侧（逐帧量：带 12-17 = x≈768..1152）。
   2) whale_fall 的离场：她的窗格被向右带走 + 向下沉 + 被海底裁掉。公式来自 continuity_full_v2/s_eval.py 的 WhaleFall.offset：
        dx = (590-216) * ease_io((t-193.5433)/0.92)
        dy = -24*ease_out((t-193.5433)/1.1) + 262*u^2*(1.6-0.6*u),  u = (min(t,203.5433)-194.0433)/9.5
      （这套和从 video1.mp4 逐帧量出来的水平位移一致：193.833 实测 dx≈65 / 公式 47；194.083 实测 287 / 公式 236。）
   3) 同步平移 canvas 上那个窗格框（frame.js 的 PV.drawPanes），否则窗格走了框还在原地。
   关掉：PV.PANEPLACE_OFF = 1，或在 index.html 去掉这个 script。 */
(function () {
  'use strict';
  var PV = window.PV;
  if (!PV || PV.PANEPLACE_OFF) return;
  var T = PV.tui;
  var PLACE = { shot_hoard: 762 };
  var WF_T0 = 193.5433, WF_T1 = 203.5433, WF_DX = 374, WF_RISE = 24, WF_SINK = 262, WF_SINK0 = 194.0433, WF_SINKSPAN = 9.5;
  var WF_END = 205.5433;
  function easeIo(u) { u = T.clamp01(u); return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2; }
  function easeOut(u) { u = T.clamp01(u); var d = 1 - u; return 1 - d * d * d; }
  PV.whaleFallDx = function (t) { return WF_DX * easeIo((t - WF_T0) / 0.92); };
  PV.whaleFallDy = function (t) {
    var rise = -WF_RISE * easeOut((t - WF_T0) / 1.1);
    var u = (Math.min(t, WF_T1) - WF_SINK0) / WF_SINKSPAN; if (u < 0) u = 0; if (u > 1) u = 1;
    return rise + WF_SINK * u * u * (1.6 - 0.6 * u);
  };
  PV.placeAt = function (t) {
    var n = PV.shotName;
    if (n && n.indexOf('shot_whale_fall') === 0) return true;
    return !!(n && PLACE[n]);
  };
  PV.paneDx = function (t) {
    var n = PV.shotName;
    if (n && n.indexOf('shot_whale_fall') === 0) return t < WF_T0 ? 0 : PV.whaleFallDx(t);
    return (n && PLACE[n]) ? PLACE[n] : 0;
  };
  PV.paneDy = function (t) {
    var n = PV.shotName;
    return (n && n.indexOf('shot_whale_fall') === 0 && t >= WF_T0) ? PV.whaleFallDy(t) : 0;
  };
  var baseVis = PV.paneVisible;
  PV.paneVisible = function (t) {
    var n = PV.shotName;
    if (n && n.indexOf('shot_whale_fall') === 0 && t >= WF_T0 && t < WF_END) return true;   /* 离场过程中她还在画面里 */
    return baseVis ? baseVis(t) : true;
  };
  var basePanes = PV.drawPanes;
  PV.drawPanes = function (ctx, t) {
    if (!basePanes) return;
    var dx = PV.paneDx(t), dy = PV.paneDy(t);
    if (dx > 0.001 || Math.abs(dy) > 0.001) { ctx.save(); ctx.translate(dx, dy); basePanes.call(PV, ctx, t); ctx.restore(); }
    else basePanes.call(PV, ctx, t);
  };
  var baseSync = PV.sync;
  PV.sync = function (t) {
    if (baseSync) baseSync.call(PV, t);
    var chat = document.getElementById('chat');
    if (!chat) return;
    var dx = PV.paneDx(t), dy = PV.paneDy(t);
    chat.style.transform = (dx > 0.001 || Math.abs(dy) > 0.001)
      ? 'translate(' + dx.toFixed(2) + 'px,' + dy.toFixed(2) + 'px)' : '';
  };
})();

