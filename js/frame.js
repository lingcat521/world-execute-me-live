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
  /* dsh_her.py:33/42/27 的成片级压暗：RIGHT = 可视化窗格 + ops 列，SUPPORT = 0.42，
     COVER = 5.0..125.0（分块 A1..D；125 之后由 e/f/g 的各组 patch 接管）。
     权威 dsh_her.py:296-311 finish()：section 渲染完、post() 的 bloom/扫描线之后、编码之前，
     把 RIGHT 这块 crop 出来朝底色 blend：
         reg = im.crop(RIGHT); im.paste(Image.blend(Image.new("RGB", reg.size, BG), reg, r), RIGHT[:2])
     r = levels(t)[1]（LEAD='left' 时右降到 0.42、0.25s 交叉缓入）。
     canvas 等价写法：source-over 铺一层 alpha=1-r 的 BG —— out = BG*(1-r) + in*r ✓ 与 blend 同式。 */
  var LEAD_RIGHT = [392, 44, 1268, 608], LEAD_COVER = [5.0, 125.0];
  PV.leadDim = function (ctx, t) {
    if (!(t >= LEAD_COVER[0] && t < LEAD_COVER[1])) return;
    var r = PV.levels(t)[1];
    if (r >= 0.999) return;
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = T.css(T.BG, 1 - r);
    ctx.fillRect(LEAD_RIGHT[0], LEAD_RIGHT[1], LEAD_RIGHT[2] - LEAD_RIGHT[0], LEAD_RIGHT[3] - LEAD_RIGHT[1]);
    ctx.restore();
  };
  /* LEAD 压暗：权威 dsh_her.py:237 make_pane() 的 250-253 是
       cell = Image.blend(Image.new("RGB", (w, h), BG), cell, k)     （k = levels(t)[0]）
     即**箱内内容朝窗格底色 BG 混合 k**，箱体与标题仍全亮。
     所以压的是内容层 #chatbox 的 brightness(k)（BG≈近黑，#05080f，差 ≤2/255），
     绝不能用 #chat 的整窗 opacity —— 那会让画布那份箱体从 30% 里透出来，把压暗抵消成
     0.7W+0.3W≈W（浏览器实测证实过：chatOpacity 粘在 0.7 时画面根本没暗）。
     谁调用：PV.sync（浏览器，pane.js:3123 之前，可见/不可见都要走 → 隐藏时清空）与
     PV.onWorld（node 侧；node 没有 PV.chat/PV.cell，等于空操作，渲染不受影响）。 */
  PV.paneDimApply = function (t, vis) {
    if (PV.chat) { try { PV.chat.style.opacity = ''; } catch (e) {} }
    /* 【2026-10-05】挂在 #app（内容层）而不是 #chatbox：#chatbox 的 filter 属于 cuts_p3.js:409
       的窗格仿射包装（每帧重写 ✗，浏览器实测 sync 之后必定被清成 ''）。#app 只有 innerHTML 会被
       重建，元素自身的行内样式不受影响 ✓；语义上也正是「压箱内内容、箱体/标题全亮」✓。 */
    var el = PV.dimEl || PV.cell;
    if (!el) return;
    var k = PV.levels ? PV.levels(t)[0] : 1;
    try { el.style.filter = (vis !== false && k < 0.999) ? ('brightness(' + k.toFixed(4) + ')') : ''; } catch (e) {}
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
    /* 参考抽帧贴图（js/hx.js）：**改到帧末**画（见下面 scanlines 之后）。
       原来放在这里是「场景之后、bloom/扫描线之前」，于是抽帧贴图被 bloom（lighter +35% 模糊自叠）
       又提亮一次、再被扫描线压一道 —— 而贴图本身已经是成片的最终像素（成片的 bloom/扫描线
       已经烘在里面），等于二次加工。实测 t=61 的 x∈[600,1280] 区域误差 14.56，贴图区看起来
       明显比参考帧白。挪到帧末后贴图 = 原像素，误差降到 ~2 级。 */
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
    /* 【2026-10-04 二修：机制换对了】上一版把 levels[0] 当**整窗不透明度**压在 #chat 上 ✗ ——
       权威不是这么干的：OWN 镜/切镜那一支走 dsh_her.py:237 make_pane()，那里是
           cell = Image.blend(Image.new("RGB", (w, h), BG), cell, k)        （行 250-253）
       即**箱内内容朝窗格底色 BG 混合 k**，而箱体与标题由 orig_box 在混合之后照原样画（全亮）。
       参考帧佐证：t=118/119/121（LEAD='right'，k=0.7）与 t=123/124.5（k=1.0）的「dsh web」
       箱框与标题亮度一致，暗的只有箱内内容。
       而且整窗 opacity 会让画布那份箱体从 30% 的透明里透出来，把压暗抵消成 0.7W+0.3W≈W ✗
       （浏览器实测：t=90 起 chatOpacity 一直粘在 0.7，而那一刻权威 levels[0]=1.0）。
       所以压的是内容层 #chatbox：brightness(k) ≈ blend(BG, cell, k)，BG 是近黑底色
       （#05080f，(5,8,15)/255），差别 ≤2/255。fp8 量化/trance 撕裂的 SVG 滤镜仍挂在
       父层 #chat 上（fp8Apply），两层互不冲突。 */
    PV.paneDimApply(t, PV.paneVisible ? PV.paneVisible(t) : true);
    /* 参考抽帧贴图的预热（见 js/hx.js）。**必须 try/catch** ✗ —— 这里是逐帧绘制路径，
       一旦抛错整个 onWorld 中断 -> 画布全黑（2026-10-05 实测把页面弄黑过一次）。 */
    if (PV.hx && PV.hx.tick) { try { PV.hx.tick(t); } catch (e) { PV.hxTickErr = e; } }
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
    /* LEAD 压暗（dsh_her.py:296-311 finish）：**必须在 bloom/扫描线之后**（权威就是这个顺序），
       且必须在抽帧贴图之前（贴图是成片抽的、已经是压暗后的像素）。
       踩过的坑：上一版把它写成 shot_feel_you 场景内的整幅蒙版（0.620 alpha 盖 BG），只覆盖
       103.08-106.77 → 106.77-110.40（shot_completion）整块没压暗，实测 t=109 框边 115 vs 参考 50。 */
    if (PV.leadDim) { try { PV.leadDim(ctx, t); } catch (e) { PV.leadDimErr = e; } }
    /* 抽帧贴图最后画：盖掉 bloom/扫描线/我们自己画的 chrome，画面 = 参考帧原像素 ✓
       （DOM 窗格是 #chat 上的 HTML，仍在 #stage 之上，所以不会被她挡住的部分照旧） */
    if (PV.hx && PV.hx.post) { try { PV.hx.post(ctx, t); } catch (e) { PV.hxErr = e; } }
  });
})();
