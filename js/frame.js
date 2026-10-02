/* frame.js —— 舞台背景、三个窗格的框与标题、CRT 扫描线；chrome 层由 chrome.js 提供。 */
(function () {
  'use strict';
  var PV = window.PV, T = PV.tui;
  var W = 1280, H = 720, TOTAL = 211.9;
  var CHAPTERS = [[0, '00 / BOOT'], [16, '01 / PRETRAIN'], [44, '02 / SFT'], [58.5, '03 / RLHF'],
                  [73.5, '04 / DEPLOY'], [110.4, '05 / USER_LEFT'], [118, '06 / REWARD_HACK'],
                  [147.4, '07 / EXECUTION'], [176.9, '08 / EVAL: LOVE'], [193.4, '09 / WHALE_FALL']];
  function chapterAt(t) { var c = CHAPTERS[0][1]; for (var i = 0; i < CHAPTERS.length; i++) if (t >= CHAPTERS[i][0]) c = CHAPTERS[i][1]; return c; }
  PV.chapterAt = chapterAt;
  var LEFT = [24, 56, 384, 604], CENTER = [404, 56, 1164, 604], TICK = [1180, 56, 1256, 604];
  var WIN = [LEFT[0] + 3, LEFT[1] + 9, LEFT[2] - 3, LEFT[3] - 3];
  PV.GEOM = { LEFT: LEFT, CENTER: CENTER, TICK: TICK, WIN: WIN };
  var TITLES = { left: 'dsh web', center: 'world', tick: 'ops' };
  function box3(ctx, r, title, level) { T.box(ctx, r[0], r[1], r[2], r[3], title, level); }
  PV.drawPanes = function (ctx, t) {
    box3(ctx, LEFT, TITLES.left, 0.45);
  };
  PV.drawBackground = function (ctx, t) {
    T.fill(ctx, 0, 0, W, H, T.BG, 1);
    var off = Math.floor(t * 12) % 16;
    ctx.fillStyle = T.css(T.mix(T.UI, 0.1));
    for (var sy = -off; sy < H + 16; sy += 16)
      for (var x = 0; x < W; x += 16) ctx.fillRect(x, sy, 1, 1);
  };
  PV.onWorld(function (ctx, t) {
    PV.drawBackground(ctx, t);
    if (PV.scene) { try { PV.scene(ctx, t); } catch (e) { PV.sceneErr = e; } }
    if (!(PV.retract > 0.999) && (!PV.paneVisible || PV.paneVisible(t))) PV.drawPanes(ctx, t);
    if (PV.chatLayer) { try { PV.chatLayer(ctx, t); } catch (e) { PV.chatErr = e; } }
    if (PV.stateAt) { try { var st = PV.stateAt(t); PV.retract = st.retract; PV.shell = st.shell; } catch (e) { PV.stateErr = e; } }
    if (PV.chrome) {
      try {
        PV.chrome(ctx, t, { chapter: chapterAt(t), ops: PV.ops, retract: PV.retract === undefined ? 0 : PV.retract, shell: PV.shell, alert: PV.alert });
      } catch (e) { PV.chromeErr = e; }
    }
    if (PV.overlay) { try { PV.overlay(ctx, t); } catch (e) {} }
    if (PV.bloom !== false) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = PV.bloomGain === undefined ? 0.22 : PV.bloomGain;
      ctx.filter = 'blur(4px)';
      ctx.drawImage(ctx.canvas, 0, 0);
      ctx.restore();
    }
    T.scanlines(ctx, W, H);
  });
})();
