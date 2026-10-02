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
  /* 焦点压暗：原始工程 dsh_her.py 的 LEAD 表。谁"主导"时另一方降到 support 亮度，
     每次切换以 0.25s 缓入。RIGHT = 可视化窗格 + ops 列；她的窗格用她的窗口 alpha。 */
  var LEAD = [[0.0, 'both'], [5.24, 'left'], [7.08, 'right'], [12.47, 'both'], [16.0, 'both'], [41.21, 'left'],
              [41.93, 'both'], [103.0, 'left'], [110.40, 'both'], [115.60, 'right'], [123.55, 'left'], [125.0, 'both']];
  var SUPPORT = 0.42, LEAD_RECT = [392, 44, 1268, 608];
  function lv(side) { return [side === 'right' ? 0.7 : 1.0, side === 'left' ? SUPPORT : 1.0]; }
  PV.levels = function (t, fade) {
    fade = fade === undefined ? 0.25 : fade;
    var i = 0, k;
    for (k = 0; k < LEAD.length; k++) if (LEAD[k][0] <= t) i = k;
    var cur = lv(LEAD[i][1]);
    if (i === 0) return cur;
    var p = T.ease(T.clamp01((t - LEAD[i][0]) / fade)), prev = lv(LEAD[i - 1][1]);
    return [prev[0] + (cur[0] - prev[0]) * p, prev[1] + (cur[1] - prev[1]) * p];
  };
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
    T.uiGainNow = T.uiGainAt(t);   /* 系统色增益：全片逐帧更新 */
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
    /* 注意：LEAD/SUPPORT 不是像素级整块压暗——实测参考在 7.08 切换时左窗格反而变亮(9.59->16.99)、
       103.0 前后中窗格基本不变(13.25->13.47)。它是作用在窗格自身渲染里的，不能盖一层黑蒙版
       （试过：会把 6.00s 从中窗格 7.0 压到 2.94，反而破坏吻合）。PV.levels() 保留备用。 */
    var _lv = PV.levels(t);
    if (PV.chat && _lv[0] < 0.999) { try { PV.chat.style.opacity = _lv[0]; } catch (e) {} }
    if (PV.bloom !== false) {
      ctx.save();
      /* 关键：自绘前必须把舞台的 RES 倍缩放重置掉。
         否则 drawImage(ctx.canvas,...) 会把整幅画再放大 RES 倍叠回自己身上——
         1080p（RES=1.5）下就会多出一个更大、更靠右下、发虚的"幽灵画面"。 */
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = PV.bloomGain === undefined ? 0.35 : PV.bloomGain;   /* 原始 tuikit.post: add(img, blur(img)*0.35) */
      ctx.filter = 'blur(' + (4 * (PV.RES || 1)) + 'px)';   /* 重置后按设备像素给半径，观感与 720p 一致 */
      ctx.drawImage(ctx.canvas, 0, 0);
      ctx.restore();
    }
    T.scanlines(ctx, W, H);
  });
})();
