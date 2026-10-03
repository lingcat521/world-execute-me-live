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
  /* shot_hoard（141.389-144.159）：参考里她的窗格整段在画面**右侧**（mirror 位），
     而且不是瞬间跳过去的 —— 逐帧量（24fps）140.7-141.8：
       140.70-140.91  旧画面（窗格在左），右侧 x700-940 有内容 50/51/40/35/24
       140.95-141.08  内容快速衰减（40 -> 17 -> 5）
       141.12-141.45  全屏几乎全黑（0-2）  ← 中间有一段黑场
       141.53-141.66  新画面出现，窗格左边框 x=786 -> 817 -> 826 滑到位，之后稳定在 826
     我们的 #chatbox 内容左边缘在设计 x=27，所以位移 = 826-27 ≈ 799（取 790，让框落在 ~814）。
     141.02-141.47 这一段要**隐藏**窗格（参考是黑场）。 */
  var HOARD0 = 141.02, HOARD_HIDE1 = 141.47, HOARD_T = 141.389, HOARD_END = 144.159 + 0.35;
  var HOARD_DX = 790;
  function inHoard(t) { return t >= HOARD0 && t < HOARD_END; }
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
    if (inHoard(t)) return true;
    var n = PV.shotName;
    if (n && n.indexOf('shot_whale_fall') === 0) return true;
    return false;
  };
  PV.hoardHidden = function (t) { return t >= HOARD0 && t < HOARD_HIDE1; };
  PV.paneDx = function (t) {
    if (inHoard(t)) return HOARD_DX;
    var n = PV.shotName;
    if (n && n.indexOf('shot_whale_fall') === 0) return t < WF_T0 ? 0 : PV.whaleFallDx(t);
    return 0;
  };
  PV.paneDy = function (t) {
    var n = PV.shotName;
    return (n && n.indexOf('shot_whale_fall') === 0 && t >= WF_T0) ? PV.whaleFallDy(t) : 0;
  };
  /* shot_moe_dense（134.466-138.159）入场时她的窗格不是直接消失，而是**从上往下被擦掉**。
     逐帧量（12fps，取左侧饱和红区 bbox，x 基本不变）：
        134.43  y 56..603     134.52  y 56..603（整块被红填满，闪一下）
        134.60  y 118..603    134.68  y 300..603     134.77 起 没有了
     拟合 y0 = 56 + 548*u^2, u = (t-134.50)/0.28；我们 #chatbox 顶边在设计 y=65，
     所以 clip-path 的 top inset = max(0, y0-65)。134.78 之后交给 paneVisible 隐藏。 */
  var ERASE_A = 134.50, ERASE_B = 134.78;
  PV.eraseInset = function (t) {
    if (t < ERASE_A || t >= ERASE_B) return 0;
    var u = (t - ERASE_A) / (ERASE_B - ERASE_A);
    var y0 = 56 + 548 * u * u;
    return Math.max(0, y0 - 65);
  };
  PV.eraseHidden = function (t) { return t >= ERASE_B && t < 138.1587; };

  var baseVis = PV.paneVisible;
  PV.paneVisible = function (t) {
    if (PV.eraseHidden(t)) return false;                 /* 134.78 起她已被擦掉 */
    if (PV.hoardHidden(t)) return false;                 /* hoard 入场前的黑场 */
    if (inHoard(t)) return true;                          /* hoard 期间她在画面右侧 */
    var n = PV.shotName;
    if (n && n.indexOf('shot_whale_fall') === 0 && t >= WF_T0 && t < WF_END) return true;
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
    var ins = PV.eraseInset(t);
    chat.style.clipPath = ins > 0.5 ? ('inset(' + ins.toFixed(1) + 'px 0 0 0)') : '';
  };
})();

