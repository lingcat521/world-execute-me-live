/* slide.js —— 她的窗格（#chat，真 HTML）在 FULL_ART 镜头进场时的"离场"动作。
  参考实测（video1.mp4 逐帧量左侧内容的首个有墨列 x）：
    193.750 → 24（原位）  193.833 → 88  193.917 → 140  194.000 → 223  194.083 → 310  194.167 → 已出画
  也就是她的窗格在 193.79–194.15 之间**向右**滑出画面（不是向左）。
  （Python 侧 continuity_full_v2/v2.py 的 slide_at() 写的是向左 -410*shift，但那是 full/ 思路；
    实测曲线跟它不一致，这里以实测为准。）
  用法：默认开启；PV.SLIDE_OFF=1 或在 index.html 去掉这个 script 可关掉。 */
(function () {
  'use strict';
  var PV = window.PV;
  if (!PV || PV.SLIDE_OFF) return;
  var T = PV.tui;
  /* 只做 shot_whale_fall：另一个 FULL_ART 是 shot_red_if_i_can，实测那一段她的窗格在进场前就已经不在画面里了。 */
  var T0 = 193.5433, A = 193.79, B = 194.28, DX = 420;
  function u(t) { return T.clamp01((t - A) / (B - A)); }
  PV.slideAt = function (t) {
    if (t < A) return 0;
    if (t < B) return T.ease_out(u(t));
    return t < 205.5433 + 0.35 ? 1 : 0;   /* 镜头结束前一直留在画外；之后交给 paneVisible 的 HIDE_HER 规则 */
  };
  var baseVis = PV.paneVisible;
  PV.paneVisible = function (t) {
    var e = PV.slideAt(t);
    if (e > 0.001 && e < 0.999) return true;   /* 滑出过程中它还在画面里，只是移出去了 */
    return baseVis ? baseVis(t) : true;
  };
  var baseSync = PV.sync;
  PV.sync = function (t) {
    if (baseSync) baseSync.call(PV, t);
    var chat = document.getElementById('chat');
    if (!chat) return;
    var e = PV.slideAt(t);
    chat.style.transform = e > 0.001 ? 'translateX(' + (DX * e).toFixed(2) + 'px)' : '';
  };
})();

