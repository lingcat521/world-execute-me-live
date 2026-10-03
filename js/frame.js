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
  function box3(ctx, r, title, level, color, spinner) { T.box(ctx, r[0], r[1], r[2], r[3], title, level, color, spinner); }
  /* dsh_her.py:237 make_pane() —— COVER 段（5.0-125.0）里 shot 能把 me_pane 的 rect 交上来：窗框就画在
     那个 rect 上（标题仍是 "dsh web"，颜色随 shot），窗口内容按 min(w/iw,h/ih) 缩放、水平居中、顶部
     对齐贴到 (x0+INNER[0], y0+INNER[1])，INNER=(3,9,3,3)。Chorus 1 的 shot_trapped
     （full/sec_chorus1.py:556）每拍把 rect 收一圈：inset=[0,24,48,70][min(3,int(u*4))]，k>=2 起框变 RED。 */
  PV.paneRect = function (t) {
    var i, s = null;
    for (i = 0; i < (PV.SHOTS ? PV.SHOTS.length : 0); i++)
      if (PV.SHOTS[i].name === 'shot_trapped') s = PV.SHOTS[i];
    if (!s || t < s.a || t >= s.b) return null;
    var u = (t - s.a) / (s.b - s.a);
    var k = Math.min(3, Math.floor(u * 4)), i2 = [0, 24, 48, 70][k];
    return { rect: [24 + i2, 56 + i2, 384 - i2, 604 - Math.floor(i2 / 2)], color: k >= 2 ? T.ERR : null };
  };
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
    var p = PV.paneRect ? PV.paneRect(t) : null;
    /* engine.py:265 me_pane() / dsh_her.py:256 make_pane(): box(d, x0, y0, x1, y1, title,
       0.45 + 0.35 * pulse(c.t), color=..., spinner=c.t)。
       spinner（标题前的 |/-\ 逐帧转，tuikit.box:333 "|/-\\"[int(t*8)%4]）已按权威补上，
       少了它标题整体左移一格，实测 two frame 都变好。
       亮度脉冲【暂不上线】：参考帧框边像素确实逐拍跳（86 -> 128，相位落在拍点上），但
       ① pulse 的 FIRST_BEAT 存在分歧：chrome.js 用 0.1587、pane.js 的 beat() 用 0.1807，
          按实测相位反解更支持 0.1807；② 现状 0.1587 在拍前 dt<0 会让 pulse>1（框比任何实测
          值都亮）。带着这个相位试过 0.45+0.35*pulse，两个同刻帧都比常量 0.45 差
          （70.4583: left 25.61->25.73；70.8333: 21.54->21.71）。先把 0.45 留着，
          等 FB 统一后单独验。 */
    box3(ctx, p ? p.rect : LEFT, TITLES.left, 0.45, p ? p.color : null, t);
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
    /* overlay 在 Python 里是 composited **在她之上**（v2.py: fr.over 在 her 之后合成）。
       我们的她窗格是真 HTML（#chat 在 #stage 之后 => 永远盖住画布），所以叠在她上面的东西
       必须画到另一个画布 #top 上（它在 #chat 之后）。没有 #top 时退回主画布。 */
    if (PV.overlay) {
      var tc = null;
      try { tc = document.getElementById('top'); } catch (e) { tc = null; }
      if (tc) {
        var r2 = PV.RES || 1, tw = Math.round(1280 * r2), th = Math.round(720 * r2);
        if (tc.width !== tw || tc.height !== th) { tc.width = tw; tc.height = th; }
        var tx2 = tc.getContext('2d');
        tx2.setTransform(1, 0, 0, 1, 0, 0);
        tx2.clearRect(0, 0, tw, th);
        tx2.setTransform(r2, 0, 0, r2, 0, 0);
        try { PV.overlay(tx2, t); } catch (e) { PV.ovErr = e; }
      } else {
        try { PV.overlay(ctx, t); } catch (e) {}
      }
    }
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
