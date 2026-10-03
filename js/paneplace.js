/* paneplace.js —— 她的窗格（#chat）在整幅画面里的**额外**位移控制。
   注意分工：窗格的常规状态机（C53-C63 的相机/洪水/擦除/右移等）在 cuts_p3.js 里，
   它包 PV.sync 并对 #chatbox 做仿射变换。本文件只加 cuts_p3 没覆盖的那一处：
   shot_whale_fall（193.543-205.543）她被带走 + 下沉 —— 公式来自 continuity_full_v2/s_eval.py 的 WhaleFall.offset：
     dx = (590-216) * ease_io((t-193.5433)/0.92)
     dy = -24*ease_out((t-193.5433)/1.1) + 262*u^2*(1.6-0.6*u),  u = (min(t,203.5433)-194.0433)/9.5
   （与从 video1.mp4 逐帧量出的水平位移一致：193.833 实测 dx≈65 / 公式 47；194.083 实测 287 / 公式 236。）
   ⚠️ 不要再在这里给 shot_hoard 加位移 —— cuts_p3.js 的 C62 已经在做（x = PANE_X + 760*eIo(...)），
      两边叠加会把窗格推到画面外（曾导致 2:22 窗格直接消失）。
   关掉：PV.PANEPLACE_OFF = 1。 */
(function () {
  'use strict';
  var PV = window.PV;
  if (!PV || PV.PANEPLACE_OFF) return;
  var T = PV.tui;
  var WF_T0 = 193.5433, WF_T1 = 203.5433, WF_DX = 374, WF_RISE = 24, WF_SINK = 262, WF_SINK0 = 194.0433, WF_SINKSPAN = 9.5;
  var WF_END = 205.5433;
  function easeIo(u) { u = T.clamp01(u); return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2; }
  function easeOut(u) { u = T.clamp01(u); var d = 1 - u; return 1 - d * d * d; }
  function inWF(t) { var n = PV.shotName; return !!(n && n.indexOf('shot_whale_fall') === 0); }
  PV.whaleFallDx = function (t) { return WF_DX * easeIo((t - WF_T0) / 0.92); };
  PV.whaleFallDy = function (t) {
    var rise = -WF_RISE * easeOut((t - WF_T0) / 1.1);
    var u = (Math.min(t, WF_T1) - WF_SINK0) / WF_SINKSPAN; if (u < 0) u = 0; if (u > 1) u = 1;
    return rise + WF_SINK * u * u * (1.6 - 0.6 * u);
  };
  PV.placeAt = function (t) { return inWF(t); };
  PV.paneDx = function (t) { return (inWF(t) && t >= WF_T0) ? PV.whaleFallDx(t) : 0; };
  PV.paneDy = function (t) { return (inWF(t) && t >= WF_T0) ? PV.whaleFallDy(t) : 0; };
  var baseVis = PV.paneVisible;
  PV.paneVisible = function (t) {
    if (inWF(t) && t >= WF_T0 && t < WF_END) return true;
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
    try {
      var ve = document.getElementById('ver');
      if (ve) ve.textContent = 'v' + (PV.VER || '?') + '  pane dx=' + dx.toFixed(0) + ' dy=' + dy.toFixed(0) +
        ' vis=' + (PV.paneVisible(t) ? 1 : 0) + ' t=' + t.toFixed(2);
    } catch (e) {}
  };
})();

