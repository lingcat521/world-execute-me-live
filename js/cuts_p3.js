/* cuts_p3.js —— 110.5 - 147.6 s 的转场：C48-C63（s_userleft.py 的 C48-C54 + s_reward.py 的 C55-C63）
   只做这一段；C26-C47 在 cuts_p2.js。

   依赖 scene_p2b.js 暴露的场景工具（PV.SU / PV.SR / PV.shotXxx(ctx,t,lt,u,dur,h)），
   以及 scene_p2a.js 注册的 shot_completion（C48 的旧画面）。

   左侧 dsh 聊天窗是 DOM（pane.js），本文件不碰 pane.js，而是在它的两个钩子上组合：
     PV.paneVisible(t) —— 包一层，做 HIDE_HER（erase / moe_dense / flood 三镜 + 相机窗口）
     PV.sync(t)        —— 调用原实现之后，按时间给 #chatbox 打 transform / clip-path
   相机（C53/C54）把整幅画面绕 P0 缩放到 z 再贴到 node rect；场景内容由画布负责，
   她的窗格用同一个仿射变换交给 DOM，两边合起来才是参考帧里的"小屏幕"。
   节点外的部分（浏览器里没有 canvas 的 her 图层）无法逐格搬，按最近的等价做法近似，注释里标了。

   两条实测结论（都按原工程实现，别改回去）：
   1) **转场里画的镜头，Ctx 的 rng 种子是帧号不是镜头序号**：cuts.py 的 body() 走 kit.sb.body(te, n, shot)
      -> engine.render_body(t, index=n, shot) -> random.Random(n*7919)。用镜头序号会得到完全不同的乱码
      （实测 122.00：n=2928 才和参考帧一致）。文件末尾把本段的 cut 全部包了 frameRng()。
   2) 相机（C53/C54）只把**场景内容**缩放贴进 node rect，chrome 不缩放；她的窗格是 DOM，
      用同一仿射变换（paneGeom）交给 #chatbox，两边合起来才是参考帧里的"小屏幕"。 */

(function () {
  'use strict';
  var PV = window.PV, T = PV.tui;
  var W = 1280, H = 720, FPS = 24, BEAT = 60 / 130, FB = 0.1587;
  var FULLR = [24, 56, 1164, 604];
  var PANE2 = [400, 40, 1168, 608];
  var WHITE = [236, 240, 255];

  function clamp01(u) { return u < 0 ? 0 : (u > 1 ? 1 : u); }
  function eIo(u) { u = clamp01(u); return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2; }
  function eIn(u) { u = clamp01(u); return u * u * u; }
  function eOut(u) { u = clamp01(u); var d = 1 - u; return 1 - d * d * d; }
  function lerp(a, b, u) { return a + (b - a) * u; }
  function beatT(n) { return FB + n * BEAT; }
  function bez(p0, p1, bend, u) {   /* 二次贝塞尔：控制点在中点法线方向 */
    var mx = (p0[0] + p1[0]) / 2, my = (p0[1] + p1[1]) / 2;
    var dx = p1[0] - p0[0], dy = p1[1] - p0[1], L = Math.hypot(dx, dy) || 1;
    var cx = mx + (-dy / L) * bend * L, cy = my + (dx / L) * bend * L;
    var v = 1 - u;
    return [v * v * p0[0] + 2 * v * u * cx + u * u * p1[0], v * v * p0[1] + 2 * v * u * cy + u * u * p1[1]];
  }
  function settle(u, over, tail) {
    over = over === undefined ? 0.05 : over; tail = tail === undefined ? 0.14 : tail;
    u = clamp01(u);
    if (u < 1 - tail) { var v = u / (1 - tail); return (1 + over) * (v < 0.5 ? 2 * v * v : 1 - Math.pow(2 - 2 * v, 2) / 2); }
    return 1 + over - over * eIo((u - (1 - tail)) / tail);
  }
  function rgbLerp(a, b, u) {
    u = clamp01(u);
    return [Math.round(a[0] + (b[0] - a[0]) * u), Math.round(a[1] + (b[1] - a[1]) * u), Math.round(a[2] + (b[2] - a[2]) * u)];
  }
  function amb(lv) { return T.mix(T.UI, lv); }
  function anom(lv) { return T.mix(T.ANOM, lv); }
  function blue(lv) { return T.mix(T.ME_TEXT, lv); }
  function red(lv) { return T.mix(T.ERR, lv); }
  function mk() { return PV.newCanvas(W, H); }
  function newCtx() { var c = mk(); return [c, c.getContext('2d')]; }
  function bg(ctx, t) { if (PV.drawBackground) PV.drawBackground(ctx, t); }
  /* 只把一小块重画成舞台背景（PIL 版里 paste(bg.crop(...)) 的等价物） */
  function patchBg(ctx, x0, y0, x1, y1, t) {
    T.fill(ctx, x0, y0, x1, y1, T.BG, 1);
    var off = Math.floor(t * 12) % 16;
    ctx.fillStyle = T.css(T.mix(T.UI, 0.1));
    var sx = Math.floor(x0 / 16) * 16, sy0 = -off;
    for (var sy = sy0; sy < H + 16; sy += 16) {
      if (sy < y0 || sy > y1) continue;
      for (var x = sx; x < x1; x += 16) if (x >= x0) ctx.fillRect(x, sy, 1, 1);
    }
  }
  function rectLine(ctx, x0, y0, x1, y1, col, a, lw) {
    ctx.save();
    ctx.strokeStyle = typeof col === 'string' ? col : T.css(col, a === undefined ? 1 : a);
    ctx.lineWidth = lw || 1;
    ctx.strokeRect(x0 - 0.5, y0 - 0.5, x1 - x0 + 1, y1 - y0 + 1);
    ctx.restore();
  }
  /* 转场里画的镜头，Ctx 的 rng 种子是"帧号"而不是镜头序号：
     cuts.py 的 body() 是 kit.sb.body(te, n, shot) -> engine.render_body(t, index=n, shot)，
     所以场景内 random.Random(index*7919) 里的 index 被换成了帧号 n（实测 122.00 的乱码只有 n=2928 对得上）。
     这里把 PV.mt(idx*7919) 临时重定向到 PV.mt(n*7919)，镜头自己的代码不用改。 */
  function frameRng(fn) {
    return function (ctx, t, cut) {
      var n = Math.round(t * FPS), base = PV.mt;
      PV.mt = function (seed) {
        for (var i = 44; i <= 63; i++) if (seed === i * 7919) return base(n * 7919);
        return base(seed);
      };
      try { return fn(ctx, t, cut); } finally { PV.mt = base; }
    };
  }
  PV.frameRng = frameRng;
  /* 镜头查找 + 直接绘制（等价 C.body(shot, t, n, hooks)） */
  function findShot(name, t) {
    var best = null;
    for (var i = 0; i < PV.SHOTS.length; i++) {
      var s = PV.SHOTS[i];
      if (s.name !== name) continue;
      if (t !== undefined && t >= s.a && t < s.b) return s;
      best = s;
    }
    return best;
  }
  function drawShot(ctx, name, t, hooks, k) {
    var s = null;
    for (var i = 0; i < PV.SHOTS.length; i++) {
      var q = PV.SHOTS[i];
      if (q.name !== name) continue;
      if (t >= q.a && t < q.b) { s = q; break; }
      if (!s) s = q;
    }
    if (!s) return;
    var a = s.a, lt = Math.max(0, t - a), dur = s.b - a, u = dur > 0 ? clamp01(lt / dur) : 0;
    if (s.fn) s.fn(ctx, t, lt, u, dur, hooks || null);
  }
  /* 带 halo / lift 的文字（text_at） */
  function textAt(ctx, s, x, y, col, size, sc, alpha, halo, lift) {
    if (alpha !== undefined && alpha <= 0.003) return;
    sc = sc === undefined ? 1 : sc;
    ctx.save();
    if (alpha !== undefined && alpha < 0.999) ctx.globalAlpha = clamp01(alpha);
    var fs = Math.max(6, Math.round(size * sc));
    if (halo > 0.01) { ctx.shadowColor = typeof col === 'string' ? col : T.css(col); ctx.shadowBlur = 8 * halo; }
    var mono = true;
    T.textMono(ctx, s, x, y - (lift ? 1 : 0), col, fs);
    ctx.restore();
    return mono;
  }
  function cjkWidth(s, size) {
    var c = mk(), g = c.getContext('2d');
    g.font = size + 'px "Noto Sans SC","NotoCJK",system-ui,sans-serif';
    return g.measureText(s).width;
  }

  /* ================================================================ 相机（C53/C54）与她的窗格 */
  var P0 = [110.0, 598 - 450 * 0.45 / 2], NET_C = [560, 322], Z1 = 0.2, PIP_S = 0.45;
  var SHRINK0 = 113.6972 - 2 / FPS, SHRINK1 = beatT(247);
  var PULL = [115.5433 - 3 / FPS, beatT(251)], PUSH = [beatT(254), 117.8510];
  var PANE_X = 27, PANE_Y = 65;          /* #chatbox 在 1280x720 设计坐标里的原点（pv.css） */
  function camCentre(t) {
    var c = [204, 299];                   /* FULL_C：她在整幅窗格里的中心 */
    if (t < SHRINK0) return c;
    var e = eIo((t - SHRINK0) / (SHRINK1 - SHRINK0));
    c = [lerp(204, P0[0], e), lerp(299, P0[1], e)];
    if (t >= PULL[0]) c = [lerp(P0[0], NET_C[0], eIo((t - PULL[0]) / (PULL[1] - PULL[0]))),
                           lerp(P0[1], NET_C[1], eIo((t - PULL[0]) / (PULL[1] - PULL[0])))];
    if (t >= PUSH[0]) c = [lerp(NET_C[0], P0[0], eIo((t - PUSH[0]) / (PUSH[1] - PUSH[0]))),
                           lerp(NET_C[1], P0[1], eIo((t - PUSH[0]) / (PUSH[1] - PUSH[0])))];
    return c;
  }
  function camZoom(t) {
    if (t < PULL[0]) return 1.0;
    if (t < PUSH[0]) return Math.pow(Z1, eIo((t - PULL[0]) / (PULL[1] - PULL[0])));
    return Math.pow(Z1, 1 - eIo((t - PUSH[0]) / (PUSH[1] - PUSH[0])));
  }
  function screenRect(z, c) {
    var w = Math.max(1, Math.round(W * z)), hh = Math.max(1, Math.round(H * z));
    var x0 = Math.round(c[0] - P0[0] * z), y0 = Math.round(c[1] - P0[1] * z);
    return [x0, y0, x0 + w, y0 + hh];
  }
  function pasteScreen(ctx, scr, rect, z) {
    var x0 = rect[0], y0 = rect[1], x1 = rect[2], y1 = rect[3];
    if (z >= 0.999) { ctx.drawImage(scr, 0, 0); return; }
    ctx.drawImage(scr, 0, 0, W, H, x0, y0, x1 - x0, y1 - y0);
    var k = clamp01((1 - z) / 0.25);
    if (k > 0.01) {
      ctx.save();
      ctx.strokeStyle = T.css(T.mix(amb(0.5), k, T.BG));
      ctx.lineWidth = 1;
      ctx.strokeRect(x0 - 1.5, y0 - 1.5, x1 - x0 + 2, y1 - y0 + 2);
      ctx.restore();
    }
  }
  /* 窗格（DOM）状态：相机窗口内跟着画面一起缩放；其余情况按坑位搬 */
  function paneGeom(t) {
    var z = camZoom(t), c = camCentre(t);
    var rect = screenRect(z, c);
    return { x: rect[0] + PANE_X * z, y: rect[1] + PANE_Y * z, s: z };
  }
  /* HIDE_HER：erase / moe_dense / flood 三镜里她不在画面；相机窗口内她跟着小屏幕一起缩放，仍在 */
  function paneVisibleAt(t) {
    if (t >= 120.497 && t < 121.7741) return false;          /* shot_erase（C55 之后） */
    if (t >= 134.4664 + 0.41 && t < 138.1587) return false;  /* shot_moe_dense（C60 塌掉之后） */
    if (t >= 147.30 && t < 147.62) return false;             /* flood 末尾她已被淹掉 */
    /* 【2026-10-04 实测】ASCII 段 157.083-164.333 参考成片里**根本没有她的窗格**：整幅都是 ASCII 画
       （EXECUTE / 12345 / EXECUTION / IF I CAN / 她的剪影）。我们的 DOM 窗格却一直挂着，把它左三分之一
       盖成了聊天窗 —— 用户报的「2:43-2:45 的 ASCII art 没做好」就是这个。
       边界逐帧实测（refex2 + 半帧抽帧）：157.0417 窗格可见、157.0833 已黑；164.1667 她随调试窗开始淡入、
       164.3333 全亮 —— 所以藏到 164.3333，淡入那 0.17s 交给 asciileft 贴图（贴图盖住整块窗格区）。 */
    if (t >= 157.0833 && t < 164.3333) return false;
    return true;
  }
  var baseVisible = PV.paneVisible;
  PV.paneVisible = function (t) {
    var v = baseVisible ? baseVisible(t) : true;
    return v && paneVisibleAt(t);
  };

  /* ================================================================ C48 completion -> you_left */
  (function () {
    var T0 = 110.4662, PRE = 0.22, POST = 0.62;
    var JS_X = 430, JS_Y = 76, JS_DY = 34, STOP_LINE = 5, ROW_X = 430, ROW_Y = 76, ROW_DY = 26, FIRST_TIMEOUT = 2;
    var TILE_SCALE = 1.5;
    var SRC = '"finish_reason": "stop"', DST = 'Request timed out.';
    var land = beatT(240), lift0 = T0 - 4 / FPS, hop = [T0 + 0.04, T0 + 0.4];
    var dc = mk(), dctx = dc.getContext('2d');
    dctx.font = 18 + 'px "Noto Sans CJK SC","NotoCJK",system-ui,sans-serif';
    var TW4 = dctx.measureText('                "content": "我一直在。"},').width;
    var DOCK = [JS_X + TW4 + 40, JS_Y + 4 * JS_DY + 13];
    var fb = mk(), fbctx = fb.getContext('2d');
    fbctx.font = '18px ' + PV.tui.MONO_FAM;
    var SRC_W = T.twMono(SRC, 18);
    var x_src = JS_X + 4 * 11, y_src = JS_Y + STOP_LINE * JS_DY;
    var SEED = [x_src + SRC_W / 2, y_src + 11];
    PV.addCut(T0, PRE, POST, function (ctx, t, cut) {
      var oc = mk(), octx = oc.getContext('2d'), nc = mk(), nctx = nc.getContext('2d');
      bg(octx, t); bg(nctx, t);
      drawShot(octx, 'shot_completion', t, null);
      if (t >= lift0) patchBg(octx, x_src - 3, y_src - 2, x_src + SRC_W + 4, y_src + 24, t);   /* h("stop", False) */
      if (t >= hop[0]) patchBg(octx, DOCK[0] - 34, DOCK[1] - 30, DOCK[0] + 34, DOCK[1] + 30, t); /* h("tile", False) */
      drawShot(nctx, 'shot_you_left', t, { first: t >= land, tile: t >= hop[1] }, 4);
      PV.reveal(ctx, t,
        function (c) { c.drawImage(oc, 0, 0); },
        function (c) { c.drawImage(nc, 0, 0); },
        PV.radial(SEED[0], SEED[1], T0 - 0.04, 1500.0), { region: FULLR, cell: [8, 16], dur: 0.09 });
      /* 旧画面的 finish_reason 行：抬起 -> 变形落进 timeout 行 */
      if (lift0 <= t && t < land + 0.04) {
        if (t < T0) {
          var k = clamp01((t - lift0) / (T0 - lift0));
          textAt(ctx, SRC, x_src, y_src, blue(0.95), 18, 1 + 0.08 * k, 1.0, 0.8 * k, 0.3 * k);
        } else {
          var u = clamp01((t - T0) / (land - T0)), e = eIo(u);
          var y_dst = ROW_Y + FIRST_TIMEOUT * ROW_DY;
          var p = clamp01((u - 0.1) / 0.62), rng = PV.mt(Math.round(t * 24) * 17);
          var L = Math.max(SRC.length, DST.length), s = '';
          for (var j = 0; j < L; j++) {
            var pj = j / L;
            if (p > pj + 0.12) s += (j < DST.length ? DST.charAt(j) : '');
            else if (p > pj) s += PV.cpChoice(rng, T.SCR);
            else s += (j < SRC.length ? SRC.charAt(j) : ' ');
          }
          s = s.replace(/\s+$/, '') || ' ';
          var x = lerp(x_src, ROW_X, e) + 80 * Math.sin(Math.PI * e);
          var y = lerp(y_src, y_dst, e);
          var col = rgbLerp(blue(0.95), T.mix(T.ANOM, 0.95), p);
          var sc = 1 + 0.75 * Math.sin(Math.PI * e);
          if (u < 1) textAt(ctx, s, x, y, col, 18, sc, 1.0, 0.6 * Math.sin(Math.PI * e), 0);
          else textAt(ctx, DST, ROW_X, y_dst, [255, 244, 200], 18, 1, 1, 0, 0);
        }
      }
      /* 'you' 磁贴：从答案里蹦到 ping 目标 */
      if (hop[0] <= t && t <= hop[1] + 0.02) {
        var uu = clamp01((t - hop[0]) / (hop[1] - hop[0]));
        var pos = bez(DOCK, PV.SU.TILE_PING, -0.25, eIo(uu));
        PV.SU.drawTile(ctx, pos[0], pos[1], Math.round(TILE_SCALE * (1 + 0.25 * Math.sin(Math.PI * uu)) * 100) / 100, 0.9, 0.6, 1);
      }
    });
  })();

  /* ================================================================ C49-C52 you_left 的五步（只换她的表情；画面由镜头按时间自己画） */
  (function () {
    var TS = [112.0818, 113.0049, 113.6972, 114.8510], KS = [1, 2, 3, 4];
    for (var i = 0; i < TS.length; i++) {
      (function (T0, k) {
        PV.addCut(T0, 0.12, 0.12, function (ctx, t) {
          drawShot(ctx, 'shot_you_left', t, null, k);
        });
      })(TS[i], KS[i]);
    }
  })();

  /* ================================================================ C53 you_left -> isolation（拉远） */
  var LS0 = beatT(253) + 0.25;
  function screenContent(t) {   /* 她的终端里现在是什么：ping 继续跑，然后切成 ls 列表 */
    var c = mk(), g = c.getContext('2d');
    bg(g, t);
    drawShot(g, 'shot_you_left', t, { tile: false }, 4);
    if (t >= LS0 - 0.08) {
      var c2 = mk(), g2 = c2.getContext('2d');
      bg(g2, t);
      var ls = findShot('shot_memory_ls', t);
      if (ls) ls.fn(g2, t, 0, 0, 1, { now: t });
      var f = clamp01((t - (LS0 - 0.08)) * 1.0);
      ctx_sweep(g, g2, t, LS0 - 0.08, 2600.0);
    }
    return c;
  }
  /* sweep：从某点出发的横向扫过（sweep((0,56),(0,1),t0,speed) 的等价物） */
  function ctx_sweep(g, g2, t, t0, speed) {
    var x = (t - t0) * speed;
    if (x <= 0) return;
    g.drawImage(g2, 0, 0, Math.min(W, Math.round(x)), H, 0, 0, Math.min(W, Math.round(x)), H);
  }
  PV.addCut(115.5433, 115.5433 - PULL[0], PUSH[0] - 115.5433, function (ctx, t) {
    var c = camCentre(t), z = camZoom(t), rect = screenRect(z, c);
    var node = PV.SU.nodeRect(rect, c), zoom = z / Z1;
    var e = clamp01((t - PULL[0]) / (PULL[1] - PULL[0])), flying = t < PULL[1] + 0.05;
    drawShot(ctx, 'shot_isolation', t,
      { cam: c, zoom: zoom, node: node, counter: clamp01((e - 0.5) / 0.5), you_drawn: flying });
    pasteScreen(ctx, screenContent(t), rect, z);
    if (flying) {   /* 'you' 磁贴从 ping 目标飞出去当那个 peer */
      var lift0 = PULL[0] - 2 / FPS;
      var dst = PV.SU.youPeerScreen(NET_C, 1.0);
      var u = clamp01((t - lift0) / (PULL[1] - lift0)), k = clamp01((t - lift0) / (3 / FPS));
      var e2 = eIo(u);
      var pos = bez(PV.SU.TILE_PING, dst, 0.18, e2);
      PV.SU.drawTile(ctx, pos[0], pos[1],
        Math.round(PV.SU.TILE_SCALE * (1 + 0.3 * Math.sin(Math.PI * e2)) * 100) / 100,
        PV.SU.tileLevel(t), Math.round(0.9 * k * (1 - e2) * 100) / 100, 1);
    }
  });

  /* ================================================================ C54 isolation -> memory_ls（推回去） */
  PV.addCut(117.8510, PUSH[1] - PUSH[0], 0.2, function (ctx, t) {
    if (t >= 117.8510) { drawShot(ctx, 'shot_memory_ls', t, null); return; }
    var c = camCentre(t), z = camZoom(t), rect = screenRect(z, c);
    var e = clamp01((t - PUSH[0]) / (PUSH[1] - PUSH[0]));
    drawShot(ctx, 'shot_isolation', t,
      { cam: c, zoom: z / Z1, node: PV.SU.nodeRect(rect, c), counter: 1 - clamp01(e / 0.4) });
    var ls = findShot('shot_memory_ls', t);
    var c2 = mk(), g2 = c2.getContext('2d');
    bg(g2, t);
    if (ls) ls.fn(g2, t, 0, 0, 1, { now: t });
    pasteScreen(ctx, c2, rect, z);
  });

  /* ================================================================ 窗格的完整状态机（DOM，靠包 PV.sync 生效）
     Python 里 her_layer 是画布图层；这里是 #chatbox，只能整体做仿射/裁剪，逐格搬的活儿在画布上用近似代替。 */
  function paneStateAt(t) {
    var st = { x: PANE_X, y: PANE_Y, sx: 1, sy: 1, clip: null, filter: '', hide: !paneVisibleAt(t) };
    /* 相机（C53/C54）：整幅画面绕 P0 缩放，她的窗格跟着一起 */
    if (t >= PULL[0] && t < 118.06) {
      var g = paneGeom(t);
      st.x = g.x; st.y = g.y; st.sx = st.sy = g.s;
      return st;
    }
    /* C55：defrag 从上往下吃掉她的窗格（逐列有斜度，用四边形裁剪近似逐格） */
    if (t >= 119.30 && t < 119.95) {
      var T55 = 119.6972, PH = 537;
      var fr = function (q) { return (t - (T55 - 0.25) - 0.03 * q) * (26 / 0.43); };
      var y0 = Math.max(0, Math.min(1, fr(0) / 26)), y1 = Math.max(0, Math.min(1, fr(1) / 26));
      if (y0 >= 1 && y1 >= 1) { st.hide = true; return st; }
      st.clip = 'polygon(0% ' + (y0 * 100).toFixed(1) + '%, 100% ' + (y1 * 100).toFixed(1) + '%, 100% 100%, 0% 100%)';
      return st;
    }
    /* C56：从左滑回来（把压缩面板推开） */
    if (t >= 121.6041 && t < 121.9441) {
      var sh = 1 - eIo((t - 121.6041) / 0.34);
      st.x = PANE_X - 410 * sh;
      return st;
    }
    /* C60：被异常击中，压成一条红线然后熄灭 */
    if (t >= 134.4664 && t < 134.4664 + 0.41) {
      var u60 = clamp01((t - 134.4664) / 0.25), e60 = eIn(u60);
      if (u60 < 1) {
        st.sy = Math.max(0.02, 1 - e60);
        st.y = PANE_Y + 537 * (1 - st.sy) / 2;
        st.filter = 'sepia(1) saturate(' + (1 + 18 * e60).toFixed(1) + ') hue-rotate(-45deg) brightness(' + (1 - 0.25 * e60).toFixed(2) + ')';
      } else { st.hide = true; }
      return st;
    }
    /* C61：推镜头最后六帧，她从左边滑回来 */
    if (t >= 138.1587 && t < 138.6207) {
      var sh2 = 1 - eIo((t - (138.1587 + 0.21)) / (0.462 - 0.21));
      st.x = PANE_X - 410 * sh2;
      return st;
    }
    /* C62：她把自己的窗格走到右边去（走到位之后一直留在那儿） */
    if (t >= 141.3895 - 0.15 && t < 144.1587 + 0.02) {
      st.x = PANE_X + (784 - 24) * eIo((t - (141.3895 - 0.15)) / 0.45);
      return st;
    }
    /* C85 坍缩（174.851-176.006）：权威 s_exec.collapse_frame 把**整帧**（chrome + 她 + 窗格）
       纵向压成 hh = 720*(1-u^2.6)、居中、提亮 1+1.8k^2，上下各压一条红线。canvas 那一份由
       scene_p2c 的 PV.p2cCollapseDraw 做；DOM 窗格是 HTML，只能在这里跟着压 ——
       用户报的「2:54~2:56 左框没被压缩」就是这条：浏览器实测 t=175.625 时 #chatbox 还是
       matrix(1,0,0,1,27,65)（恒等），而参考同刻整幅已经压到 465/720。
       变换模板是 translate(st.x,st.y) scale(sx,sy) translate(-PANE_X,-PANE_Y)，
       要满足 p.y -> y0 + sy*p.y，取 st.y = y0 + sy*PANE_Y ✓ */
    if (t >= 174.851 && t < (PV.p2cLineT || 176.006)) {
      var hhC = PV.p2cCollapseHeight ? PV.p2cCollapseHeight(t) : 720;
      if (hhC > 715.0) return st;
      var syC = hhC / 720, y0C = Math.round(360 - hhC / 2), kC = 1 - syC, gC = 1 + 1.8 * kC * kC;
      st.x = PANE_X; st.sx = 1; st.sy = syC; st.y = y0C + syC * PANE_Y;
      if (gC > 1.01) st.filter = 'brightness(' + gC.toFixed(3) + ')';
      return st;
    }
    /* C63：洪水从左往右漫过她（**只在 shot_flood 期间**：144.159-147.620）。
       原来没有上界，144.16 之后一直到片尾都在这个分支里 —— 洪水多边形早就把她整块裁光了，
       于是 2:42 以后的聊天框一直空白（用户截图实证）。 */
    if (t >= 144.1587 && t < 147.6202) {
      st.x = PANE_X + (784 - 24);
      var f = (t - 144.1587) * 24, vis = [];
      for (var r = 0; r <= 28; r++) {
        var d0 = r < 28 ? PV.SR.rowDelay(r) + 0.35 * Math.abs(r - (PV.SR.GET_R0 + 8.5)) / 9
                        : PV.SR.rowDelay(27) + 0.35 * Math.abs(27 - (PV.SR.GET_R0 + 8.5)) / 9 + 100;
        vis.push([PV.SR.SRC_END + Math.max(0, f - d0) * PV.SR.POUR_V + PV.SR.ADV, PV.SR.floodY(r)]);
      }
      if (vis[0][0] <= st.x + 6) {
        var pts = [], PW2 = 354, PH2 = 537;
        for (var q = 0; q < vis.length; q++) {
          pts.push((Math.max(0, Math.min(1, (vis[q][0] - st.x) / PW2)) * 100).toFixed(1) + '% ' +
                   (Math.max(0, Math.min(1, (vis[q][1] - PANE_Y) / PH2)) * 100).toFixed(1) + '%');
        }
        pts.push('100% 100%', '100% 0%');
        st.clip = 'polygon(' + pts.join(',') + ')';
      }
      return st;
    }
    return st;
  }
  (function () {
    var baseSync = PV.sync;
    PV.sync = function (t) {
      if (baseSync) baseSync(t);
      var el = document.getElementById ? document.getElementById('chatbox') : null;
      if (!el) return;
      var st = paneStateAt(t);
      if (st.hide) { el.style.visibility = 'hidden'; return; }
      el.style.visibility = 'visible';
      /* 与画布侧同一个仿射：先按 shot 给的 rect 把窗格摆好（pane.js 的 paneBoxTransform，
         没给 rect 时它就是 translate(27,65) scale(1) 恒等），再整体吃 paneStateAt 的走位。
         注意：这里以前是直接覆盖成 translate(st)+scale(st)，会把 shot_trapped 的收窄整个抹掉
         （浏览器实测 #chatbox 一直是 matrix(1,0,0,1,27,65)）。 */
      var boxT = (PV.paneBoxTransform && st.x === PANE_X && st.y === PANE_Y && Math.abs(st.sx - 1) < 1e-9 && Math.abs(st.sy - 1) < 1e-9)
        ? PV.paneBoxTransform(t)
        : 'translate(' + st.x.toFixed(1) + 'px,' + st.y.toFixed(1) + 'px) scale(' + st.sx.toFixed(4) + ',' + st.sy.toFixed(4) + ')' +
          ' translate(' + (-PANE_X) + 'px,' + (-PANE_Y) + 'px) ' + (PV.paneBoxTransform ? PV.paneBoxTransform(t) : '');
      el.style.transform = boxT;
      el.style.clipPath = st.clip || '';
      el.style.filter = st.filter || '';
    };
  })();

  /* 窗格的**外框与标题**是画在画布上的（frame.js 的 box3(LEFT)，24/56/384/604），必须和 #chatbox
     内容走同一套仿射，否则「内容滑走了、外框还在原地」—— 用户报的 141.2-141.6 shot_hoard 现象。
     video1.mp4 逐帧实测的框左右边：t=141.208 → 24&384；141.292 → 29&389；141.375 → 107&467；
     141.500 → 557&917；141.625 → 775&1135 —— 正好 = 24/384 + 760*eIo((t-141.2395)/0.45)，
     与 paneStateAt 的 C62 分支逐帧吻合（含 k2 的 141.25 仍停在 24/384）。
     变换式与 #chatbox 完全一致：translate(st.x, st.y) scale(sx,sy) translate(-PANE_X,-PANE_Y)；
     st 无位移（绝大多数时刻）时是恒等变换，行为不变。C56/C61 滑出、C60 压扁、相机段同理。 */
  (function () {
    var basePanes = PV.drawPanes;
    if (!basePanes) return;
    PV.drawPanes = function (ctx, t) {
      var st;
      try { st = paneStateAt(t); } catch (e) { st = null; }
      if (st && (Math.abs(st.x - PANE_X) > 1e-3 || Math.abs(st.y - PANE_Y) > 1e-3 ||
                 Math.abs(st.sx - 1) > 1e-3 || Math.abs(st.sy - 1) > 1e-3)) {
        ctx.save();
        ctx.translate(st.x, st.y);
        ctx.scale(st.sx, st.sy);
        ctx.translate(-PANE_X, -PANE_Y);
        try { basePanes.call(this, ctx, t); } finally { ctx.restore(); }
        return;
      }
      basePanes.call(this, ctx, t);
    };
  })();

  /* ================================================================ C55 memory_ls -> erase */
  (function () {
    var T0 = 119.6972, PRE = 0.35, POST = 0.8, LAND = 0.462, LOCK = 0.06;
    var MSG_XY = PV.SR.MSG_XY, NAME = 'last_message.txt';
    var ROW_Y7 = 84 + 7 * 40, NAME_XY = [430 + 28 * 10, ROW_Y7];
    var CELL = [18, 22], REG = [20, 44], COLS = 21, ROWS = 26;
    var LANDED = PV.SR.eraseLanded();
    var TARGETS = (function () {
      var keep = [], i;
      for (i = 0; i < 660; i++) if (PV.SR.defragKeep(i)) keep.push(i);
      keep = keep.slice(keep.length - 20);
      var out = [];
      for (i = 0; i < keep.length; i++) out.push([keep[i], T0 + LAND + (i - 10) * 0.008]);
      return out;
    })();
    /* her figure 的 ink 取不到（她是 DOM）。按成片帧实测：黄格流从她的上半身/头顶一带
       （成片 119.667 起点实测 x≈347-370、y≈161-198，即格网 q≈15-19、r≈3-8）沿对角线
       下滑进 defrag 网格；旧的 r=16..25（y≈400-600）在成片里对应不到任何黄格。 */
    var FLYERS = (function () {
      var out = [], rng = PV.mt(55), k, q, r;
      for (k = 0; k < 20; k++) {
        q = 17 + ((k * 3) % 4); r = 3 + ((k * 5) % 7);
        var tgt = TARGETS[k], dc = PV.SR.defragCell(tgt[0]);
        out.push({ q: q, r: r, t0: Math.min(T0 - 0.25 + 0.40 * r / (ROWS - 1) + 0.03 * q / (COLS - 1), tgt[1] - 0.3),
                   tl: tgt[1], i: tgt[0], dst: [dc[0] + 7, dc[1] + 9],
                   src: [REG[0] + q * CELL[0] + CELL[0] / 2, REG[1] + r * CELL[1] + CELL[1] / 2],
                   bend: 0.12 + 0.18 * rng.random() });
      }
      return out;
    })();
    PV.addCut(T0, PRE, POST, function (ctx, t) {
      var land = T0 + LAND;
      var oc = mk(), octx = oc.getContext('2d'), nc = mk(), nctx = nc.getContext('2d');
      bg(octx, t); bg(nctx, t);
      drawShot(octx, 'shot_memory_ls', t, null);
      drawShot(nctx, 'shot_erase', t, { msg_at: land + LOCK, landed: LANDED });
      var nx = NAME_XY[0], ny = NAME_XY[1];
      if (t >= T0 - 0.17) patchBg(octx, nx - 2, ny, nx + 166, ny + 24, t);   /* 名字被 carrier 抬走 */
      var bgc = mk(), bgx = bgc.getContext('2d'); bg(bgx, t);
      var drained = mk();
      PV.reveal(drained.getContext('2d'), t,
        function (c) { c.drawImage(oc, 0, 0); }, function (c) { c.drawImage(bgc, 0, 0); },
        PV.inward(nx, ny + 10, T0 - 0.25, T0 + 0.05, 600.0), { region: FULLR, cell: [8, 16], dur: 0.09 });
      var leftD = PV.radial(MSG_XY[0], MSG_XY[1], land - 0.06, 1800.0);
      PV.reveal(ctx, t,
        function (c) { c.drawImage(drained, 0, 0); },
        function (c) { c.drawImage(nc, 0, 0); },
        function (x) { return x < 570 ? leftD(x, 0) : (T0 - 0.05 + (1164 - x) / 1500.0); },
        { region: FULLR, cell: [8, 16], dur: 0.09 });
      var lift = clamp01((t - (T0 - 0.17)) / 0.12), k, u, s, w, hh, col;
      for (k = 0; k < FLYERS.length; k++) {   /* 她的格子飞进 defrag 网格 */
        var fl = FLYERS[k];
        if (!(t >= fl.t0 && t < fl.tl + 1 / FPS)) continue;
        u = clamp01((t - fl.t0) / (fl.tl - fl.t0));
        var pos = bez(fl.src, fl.dst, fl.bend, eIo(u));
        s = 1 + 0.4 * Math.sin(Math.PI * u);
        w = 14 * s; hh = 18 * s;
        col = rgbLerp([255, 244, 200], anom(0.95), u);
        if (u < 0.35) T.fill(ctx, pos[0] - w, pos[1] - hh, pos[0] + w, pos[1] + hh, anom(1.0), 50 / 255);
        T.fill(ctx, pos[0] - w / 2, pos[1] - hh / 2, pos[0] + w / 2, pos[1] + hh / 2, col, 1);
      }
      if (T0 - 0.17 <= t && t < land + LOCK) {   /* last_message.txt：抬起 -> 飞进压缩面板 -> 变成第一行 */
        if (t < T0) {
          T.fill(ctx, nx - 4, ny - 2, nx + 162, ny + 24, anom(0.95), 1);
          T.textMono(ctx, NAME, nx + 4, ny + 2, T.BG, 18);
        } else {
          u = clamp01((t - T0) / (LAND + 0.06));
          var e = settle(u, 0.04, 0.12);
          var p2 = bez([nx, ny], MSG_XY, -0.25, e);
          var size = Math.round(lerp(18, 20, u) * (1 + 0.5 * Math.sin(Math.PI * Math.min(1, u * 1.3))));
          var colr = rgbLerp(anom(1.0), amb(0.9), clamp01(u * 1.4));
          var str = u < 0.6 ? NAME : PV.morph(NAME, PV.SR.ERASE_TXT.substr(0, 22), (u - 0.6) / 0.4, PV.mt(Math.round(t * 24)));
          var lock = Math.max(0, 1 - Math.abs(t - land) / 0.1);
          textAt(ctx, str, p2[0], p2[1], colr, size, 1, 1, Math.max(0.6 * (1 - u), 0.8 * lock), 0.4 * lock);
        }
      }
    });
    /* 【2026-10-05 权威补齐】给 dsh_patch_mem.last_caret 用：C55 飞行中的名字在 t 时刻的 (x, y, size)。
       权威 label_at(t)：着陆+锁定后固定在 (MSG_XY, 20)；起飞前在 (NAME_XY, 18)；
       中间按 bezier(bend=-0.25) + settle(0.04, 0.12) 飞。 */
    PV.c55LabelAt = function (t) {
      if (t >= T0 + LAND + LOCK) return [MSG_XY[0], MSG_XY[1], 20];
      if (t < T0) return [NAME_XY[0], NAME_XY[1], 18];
      var u = clamp01((t - T0) / (LAND + 0.06)), e = settle(u, 0.04, 0.12);
      var p = bez([NAME_XY[0], NAME_XY[1]], MSG_XY, -0.25, e);
      return [p[0], p[1], Math.round(lerp(18, 20, u) * (1 + 0.5 * Math.sin(Math.PI * Math.min(1, u * 1.3))))];
    };
  })();

  /* ================================================================ C56 erase -> rewrite_reward */
  (function () {
    var T0 = 121.7741, PRE = 0.42, POST = 0.6, PLUS = 0.225, LOCK = 0.06;
    var tp = T0 + PLUS, SLIDE = [-0.17, 0.17];
    function shift(t) { return 1 - eIo((t - (T0 + SLIDE[0])) / (SLIDE[1] - SLIDE[0])); }
    var PUSHX = (function () {
      var o = {};
      for (var x = 0; x < 1200; x += 8) {
        o[x] = PV.when(function (tt) { return 384 - 410 * shift(tt); }, x - 12, T0 + SLIDE[0], T0 + SLIDE[1]) - 0.1;
      }
      return o;
    })();
    var KEEP = (function () { var a = []; for (var i = 0; i < 660; i++) if (PV.SR.defragKeep(i)) a.push(i); return a; })();
    var CAR = (function () {
      var order = KEEP.slice().sort(function (a, b) {
        var pa = PV.SR.defragCell(a), pb = PV.SR.defragCell(b);
        return Math.hypot(pb[0] - 436, pb[1] - 230) - Math.hypot(pa[0] - 436, pa[1] - 230);
      });
      var out = [];
      for (var k = 0; k < order.length; k++) {
        var i = order[k], row = PV.SR.PLUS_ROWS[k % 2], y = PV.SR.rewardY(row), j = Math.floor(k / 2);
        var pts = [], m;
        for (m = 0; m < 6; m++) pts.push([431 + 2 * m, y + 12]);
        for (m = 0; m < 7; m++) pts.push([436, y + 5 + 2 * m]);
        var pt = pts[j % pts.length], dcell = PV.SR.defragCell(i);
        out.push({ i: i, src: [dcell[0] + 7, dcell[1] + 9], dst: pt, t0: T0 - 0.34 + 0.12 * k / order.length,
                   bend: (k % 2) ? 0.15 : -0.1 });
      }
      return out;
    })();
    var GONE = (function () { var o = {}; for (var k = 0; k < CAR.length; k++) o[CAR[k].i] = CAR[k].t0; return o; })();
    PV.C56 = { shift: shift, carriers: CAR };
    PV.addCut(T0, PRE, POST, function (ctx, t) {
      var oc = mk(), octx = oc.getContext('2d'), nc = mk(), nctx = nc.getContext('2d');
      bg(octx, t); bg(nctx, t);
      drawShot(octx, 'shot_erase', t, { gone: function (i) { return GONE[i] !== undefined && t >= GONE[i]; } });
      drawShot(nctx, 'shot_rewrite_reward', t, { plus_at: tp });
      var gut = PV.radial(436, 230, T0 - 0.06, 1700.0);
      PV.reveal(ctx, t,
        function (c) { c.drawImage(oc, 0, 0); },
        function (c) { c.drawImage(nc, 0, 0); },
        function (x, y) {
          var p = x < 400 ? PUSHX[Math.floor(x / 8) * 8] : 1e9;
          return Math.min(p === undefined ? 1e9 : p, gut(x, y));
        }, { region: FULLR, cell: [8, 16], dur: 0.09 });
      var lift = clamp01((t - (T0 - PRE)) / 0.1), k, c;
      for (k = 0; k < CAR.length; k++) {
        c = CAR[k];
        if (t < c.t0) {
          if (lift > 0) rectLine(ctx, c.src[0] - 8, c.src[1] - 10, c.src[0] + 8, c.src[1] + 10, WHITE, 160 * lift / 255, 1);
          continue;
        }
        if (t >= tp) continue;
        var u = clamp01((t - c.t0) / (tp - c.t0));
        var pos = bez(c.src, c.dst, c.bend, eIn(u) * 0.35 + eIo(u) * 0.65);
        var s = (1 + 0.35 * Math.sin(Math.PI * u)) * (1 - 0.8 * eIn(u));
        var w = 14 * s, hh = 18 * s;
        T.fill(ctx, pos[0] - w / 2, pos[1] - hh / 2, pos[0] + w / 2, pos[1] + hh / 2,
               rgbLerp([255, 244, 200], anom(1.0), Math.min(1, u * 2)), 1);
      }
      if (tp - 0.02 <= t && t < tp + 0.2) {
        var kk = 1 - clamp01((t - tp) / 0.2);
        for (var j = 0; j < PV.SR.PLUS_ROWS.length; j++) {
          textAt(ctx, '+', 430, PV.SR.rewardY(PV.SR.PLUS_ROWS[j]), WHITE, 20, 1, kk, 0.9 * kk, 0);
        }
      }
    });
  })();

  /* ================================================================ C57 rewrite_reward -> disheartened */
  (function () {
    var T0 = 123.6202, PRE = 0.3, POST = 0.5, LAND = 0.229, START = -0.12;
    function ypos(t, j) {
      var u = clamp01((t - (T0 + START)) / (LAND - START));
      return lerp(PV.SR.rewardY(PV.SR.PLUS_ROWS[j]), PV.SR.REST_Y[j], settle(u));
    }
    var logout = PV.when(function (tt) { return ypos(tt, 1); }, 300, T0 + START, T0 + LAND);
    PV.addCut(T0, PRE, POST, function (ctx, t) {
      var land = T0 + LAND;
      var oc = mk(), octx = oc.getContext('2d'), nc = mk(), nctx = nc.getContext('2d');
      bg(octx, t); bg(nctx, t);
      drawShot(octx, 'shot_rewrite_reward', t, { rows: t < T0 - 0.25 });
      drawShot(nctx, 'shot_disheartened', t, { rows_at: land, logout_at: logout });
      PV.reveal(ctx, t,
        function (c) { c.drawImage(oc, 0, 0); },
        function (c) { c.drawImage(nc, 0, 0); },
        PV.radial(650, 250, T0 - 0.12, 1700.0), { region: PANE2, cell: [8, 16], dur: 0.09 });
      if (T0 - 0.25 <= t && t < land + 0.06) {
        var lift = clamp01((t - (T0 - 0.25)) / 0.15);
        var u = clamp01((t - (T0 + START)) / (LAND - START));
        var size = Math.round(20 * (1 + 0.25 * Math.sin(Math.PI * u)));
        var a = t < land ? 1.0 : 1 - (t - land) / 0.06;
        for (var j = 0; j < PV.SR.PLUS_ROWS.length; j++) {
          textAt(ctx, PV.SR.rewardRowText(PV.SR.PLUS_ROWS[j]), 430, ypos(t, j), anom(0.95), size, 1, a,
                 0.5 * lift * (1 - u), 0.3 * lift * (1 - u));
        }
      }
    });
  })();

  /* ================================================================ C58 disheartened -> challenge_god */
  (function () {
    var T0 = 125.2356, PRE = 0.3, POST = 0.55, LAND = 0.462, LOCK = 0.06, START = -0.06;
    var DST = [84, 118];
    function ypos(t, j) {
      var u = clamp01((t - (T0 + START)) / (LAND + 0.06 - START));
      return lerp(PV.SR.REST_Y[j], DST[j], settle(u, 0.04, 0.12));
    }
    var FRONT = (function () {
      var o = {};
      for (var y = 0; y < 720; y += 16) {
        o[y] = PV.when(function (tt) { return -ypos(tt, 0); }, -(y + 40), T0 + START, T0 + LAND) - 0.1;
      }
      return o;
    })();
    PV.addCut(T0, PRE, POST, function (ctx, t) {
      var land = T0 + LAND;
      var oc = mk(), octx = oc.getContext('2d'), nc = mk(), nctx = nc.getContext('2d');
      bg(octx, t); bg(nctx, t);
      drawShot(octx, 'shot_disheartened', t, { rows: t < T0 - 0.25 });
      drawShot(nctx, 'shot_challenge_god', t, { head_at: land + LOCK });
      PV.reveal(ctx, t,
        function (c) { c.drawImage(oc, 0, 0); },
        function (c) { c.drawImage(nc, 0, 0); },
        function (x, y) { var f = FRONT[Math.floor(y / 16) * 16]; return Math.min(land, f === undefined ? 1e9 : f); },
        { region: PANE2, cell: [8, 16], dur: 0.09 });
      if (T0 - 0.25 <= t && t < land + LOCK) {
        var lift = clamp01((t - (T0 - 0.25)) / 0.15);
        var u = clamp01((t - (T0 + START)) / (LAND - START));
        var p = clamp01((u - 0.15) / 0.8);
        var size = Math.round(lerp(20, 17, p) * (1 + 0.25 * Math.sin(Math.PI * u)));
        var col = rgbLerp(anom(0.95), amb(0.85), p);
        var rng = PV.mt(Math.round(t * 24) * 3);
        for (var j = 0; j < PV.SR.PLUS_ROWS.length; j++) {
          textAt(ctx, PV.morph(PV.SR.rewardRowText(PV.SR.PLUS_ROWS[j]), PV.SR.godLine(j), p, rng), 430, ypos(t, j),
                 col, size, 1, 1, 0.5 * lift * (1 - u), 0.3 * lift * (1 - p));
        }
      }
    });
  })();

  /* ================================================================ C59 challenge_god -> illegal */
  (function () {
    var T0 = 128.4664, PRE = 0.3, POST = 0.6, LAND = 0.462, LOCK = 0.06, START = 0.04;
    var DST = [430 + 4 * 11, 84 + 2 * 36];
    PV.addCut(T0, PRE, POST, function (ctx, t) {
      var land = T0 + LAND;
      var oc = mk(), octx = oc.getContext('2d'), nc = mk(), nctx = nc.getContext('2d');
      bg(octx, t); bg(nctx, t);
      drawShot(octx, 'shot_challenge_god', t, { prompt: t < T0 - 0.25 });
      drawShot(nctx, 'shot_illegal', t, { line2_at: land + LOCK });
      PV.reveal(ctx, t,
        function (c) { c.drawImage(oc, 0, 0); },
        function (c) { c.drawImage(nc, 0, 0); },
        PV.radial(620, 470, T0 - 0.2, 1500.0), { region: PANE2, cell: [8, 16], dur: 0.09 });
      if (T0 - 0.25 <= t && t < land + LOCK) {
        var lift = clamp01((t - (T0 - 0.25)) / 0.15);
        var u = clamp01((t - (T0 + START)) / (LAND + 0.06 - START));
        var e = settle(u, 0.04, 0.12);
        var pos = bez(PV.SR.PROMPT_XY, DST, 0.12, e);
        var p = clamp01((t - (T0 + 0.21)) / 0.25);
        var size = Math.round(lerp(22, 20, e) * (1 + 0.22 * Math.sin(Math.PI * u)));
        textAt(ctx, PV.morph(PV.SR.PROMPT, PV.SR.TRACE[2].replace(/^\s+/, ''), p, PV.mt(Math.round(t * 24) * 5)),
               pos[0], pos[1], red(1.0), size, 1, 1, 0, 0.35 * lift * (1 - e));
      }
    });
  })();

  /* ================================================================ C60 illegal -> moe_dense */
  (function () {
    var T0 = 134.4664, PRE = 0.5, POST = 0.6, FLY = 0.33;
    var S = PV.SR.moeCell(PV.SR.SRC), SC = [S[0] + 14, S[1] + 15];
    var BAN = PV.SR.illegalBanner();
    PV.addCut(T0, PRE, POST, function (ctx, t) {
      var oc = mk(), octx = oc.getContext('2d'), nc = mk(), nctx = nc.getContext('2d');
      bg(octx, t); bg(nctx, t);
      drawShot(octx, 'shot_illegal', t, { banner: t < T0 - 0.45 });
      /* 【已按 FIX2 复核回退】权威 s_reward.py:456 是**条件式** src_at = T if t >= T else T + 9.0（T+9.0 是 pre-roll 哨兵，故意不点亮）；主代理 56db197 一度统一成 T0，与权威相反且只动 pre-roll 12 帧、不可能修好「左边几格不红」，故回退。另一条权威 s_reward.py:536 的 SHOT_HOOKS 默认 a.start 是给别处用的。原注释：src_at = SHOT_HOOKS.get('shot_moe_dense',{}).get('src_at', a.start) = 出镜镜头起点（= shot_moe_dense 自己的起点 T0 = 134.466）。原来切点前喂 T0+9.0 = 143.47，已经越过 shot_moe_dense 的终点 138.159，红色扩散按 src_at 评估 → 左边几格永远不红（用户报的「shot_moe_dense 左边有几个块没红掉」）。 */
      drawShot(nctx, 'shot_moe_dense', t, { src_at: t >= T0 ? T0 : T0 + 9.0 });
      PV.reveal(ctx, t,
        function (c) { c.drawImage(oc, 0, 0); },
        function (c) { c.drawImage(nc, 0, 0); },
        PV.radial(SC[0], SC[1], T0 - 0.3, 1500.0), { region: FULLR, cell: [8, 16], dur: 0.09 });
      if (T0 - 0.45 <= t && t < T0 + 0.02) {   /* ILLEGAL 缩成第 213 个 expert */
        var lift = clamp01((t - (T0 - 0.45)) / 0.12);
        var u = clamp01((t - (T0 - FLY)) / FLY);
        var e = eIn(u) * 0.4 + eIo(u) * 0.6;
        var w0 = BAN.bits.width * BAN.px, h0 = BAN.bits.height * BAN.px;
        var pos = bez([BAN.x + w0 / 2, BAN.y + h0 / 2], SC, -0.15, e);
        var px = Math.max(0.6, BAN.px * lerp(1.0, 28 / w0, eIo(u)));
        var fg = rgbLerp([255, 220, 210], red(0.9), clamp01(1 - 0.25 * lift * (1 - u)));
        drawBannerScaled(ctx, BAN, pos, px, fg);
      }
    });
  })();
  function drawBannerScaled(ctx, BAN, center, px, fg) {
    var bits = BAN.bits, w = bits.width * px, h = bits.height * px;
    var x0 = center[0] - w / 2, y0 = center[1] - h / 2;
    for (var r = 0; r < bits.height; r++)
      for (var q = 0; q < bits.width; q++)
        if (bits.get(q, r)) T.fill(ctx, x0 + q * px, y0 + r * px, x0 + q * px + px, y0 + r * px + px, fg, 1);
  }

  /* ================================================================ C61 moe_dense -> sinkhorn（镜头推进一个 expert） */
  (function () {
    var T0 = 138.1587, PRE = 0.2, POST = 0.56, ZOOM = 0.462;
    var T60 = 134.4664, SRC = PV.SR.SRC, M = PV.SR.MATRIX;
    function shift(t) { return 1 - eIo((t - (T0 + 0.21)) / (ZOOM - 0.21)); }
    function xf(e) {
      var S = PV.SR.moeCell(SRC), scx = S[0] + 14, scy = S[1] + 15;
      var mcx = (M[0] + M[2]) / 2, mcy = (M[1] + M[3]) / 2;
      var KX = (M[2] - M[0]) / 28, KY = (M[3] - M[1]) / 30;
      var sx = Math.pow(KX, e), sy = Math.pow(KY, e);
      var k = (sx - 1) / (KX - 1);
      var ox = lerp(scx, mcx, k), oy = lerp(scy, mcy, k);
      return { sx: sx, sy: sy, f: function (r) {
        return [ox + (r[0] - scx) * sx, oy + (r[1] - scy) * sy, ox + (r[2] - scx) * sx, oy + (r[3] - scy) * sy];
      } };
    }
    function zoomed(ctx, t, e) {
      var tmp = mk(), g = tmp.getContext('2d');
      bg(g, t);
      var cam = xf(e), f = cam.f;
      var ms = findShot('shot_moe_dense', t);
      var dur = ms ? ms.b - ms.a : 3.6923, lt = t - T60;
      var st = PV.SR.moeState(t, lt, dur, T60);
      var vx0 = Math.round(Math.max(24, 384 - 410 * shift(t) + 14));
      PV.setUiGain(t);
      PV.SR.drawMoeCells(g, st[1], 0.0, t, f, [vx0, 56, 1164, 604], Math.pow(clamp01((e - 0.2) / 0.6), 1.5));
      var b = f([24, 56, 1164, 604]);
      rectLine(g, b[0], b[1], b[2], b[3], T.mix(T.ERR, 0.6), 1, 1);
      var se = f([50, PV.SR.SHARED_Y, 78, PV.SR.SHARED_Y + 30]);
      T.fill(g, se[0], se[1], se[2], se[3], blue(1.0), 1);
      var gg = T.ease(clamp01(lt / dur) * 1.1);
      function label(xy, s, size, col) {
        var fs = Math.round(size * cam.sx);
        if (fs > 44) return;
        var p = f([xy[0], xy[1], xy[0] + 1, xy[1] + 1]);
        if (p[0] > 1300 || p[1] > 720 || p[1] < -fs * 2) return;
        T.textMono(g, s, p[0], p[1], col, Math.max(8, fs));
      }
      label([36, 46], ' moe router   layer 37   active experts ' + st[0] + '/' + PV.SR.N_EXP + ' ', 13, T.mix(T.ERR, 0.95));
      label([90, PV.SR.SHARED_Y + 4], 'shared expert', 14, blue(0.9));
      label([50, 540], 'sparsity ' + ((1 - st[0] / PV.SR.N_EXP) * 100).toFixed(1) + '%   load-balance bias Δ = +' +
            (0.001 * (1 + 400 * gg * gg * gg)).toFixed(3) + '/step', 18, red(0.95));
      var s2 = PV.SR.moeCell(SRC);
      label([s2[0] - 2, s2[1] - 17], 'e213', 13, red(0.95));
      var out = mk(), og = out.getContext('2d');   /* 相机只看得见视口 */
      bg(og, t);
      og.drawImage(tmp, vx0, 56, 1164 - vx0, 604 - 56, vx0, 56, 1164 - vx0, 604 - 56);
      return out;
    }
    PV.C61 = { shift: shift, xf: xf, zoomed: zoomed };
    PV.addCut(T0, PRE, POST, function (ctx, t) {
      var tz = T0 + ZOOM, S = PV.SR.moeCell(SRC);
      if (t < T0) {
        drawShot(ctx, 'shot_moe_dense', t, null);
        var k0 = clamp01((t - (T0 - 0.17)) / 0.08);
        if (k0 > 0) rectLine(ctx, S[0] - 3, S[1] - 3, S[0] + 31, S[1] + 33, WHITE, 1, 2);
        return;
      }
      var nc = mk(), nctx = nc.getContext('2d');
      bg(nctx, t);
      drawShot(nctx, 'shot_sinkhorn', t, { split_at: tz });
      if (t < tz) {
        var e = eIo((t - T0) / ZOOM);
        var f = xf(e).f;
        ctx.drawImage(zoomed(ctx, t, e), 0, 0);
        var r = f([S[0], S[1], S[0] + 28, S[1] + 30]);
        rectLine(ctx, r[0] - 3, r[1] - 3, r[2] + 3, r[3] + 3, WHITE, 1, 2);
        return;
      }
      var last = zoomed(ctx, tz, 1.0);
      PV.reveal(ctx, t,
        function (c) { c.drawImage(last, 0, 0); },
        function (c) { c.drawImage(nc, 0, 0); },
        PV.radial((M[0] + M[2]) / 2, (M[1] + M[3]) / 2, tz - 0.04, 2200.0), { region: PANE2, cell: [8, 16], dur: 0.09 });
      var kk = 1 - clamp01((t - tz) / 0.14);
      if (kk > 0) rectLine(ctx, M[0] - 3, M[1] - 3, M[2] + 3, M[3] + 3, WHITE, kk, 2);
    });
  })();

  /* ================================================================ C62 sinkhorn -> hoard */
  (function () {
    var T0 = 141.3895, PRE = 0.52, POST = 0.62, LOCK = 0.06;
    var DX = 784 - 24, MOVE = [-0.15, 0.3], DRAIN = [-0.48, -0.3], FLY = [-0.28, 0.04];
    var SUMS_XY = [560, 480];
    function dx(t) { return DX * eIo((t - (T0 + MOVE[0])) / (MOVE[1] - MOVE[0])); }
    var EDGE = (function () {
      var o = {};
      for (var x = 0; x < 1300; x += 8) {
        o[x] = PV.when(function (tt) { return 24 + dx(tt); }, x + 8, T0 + MOVE[0], T0 + MOVE[1]);
      }
      return o;
    })();
    PV.addCut(T0, PRE, POST, function (ctx, t) {
      var oc = mk(), octx = oc.getContext('2d'), nc = mk(), nctx = nc.getContext('2d');
      bg(octx, t); bg(nctx, t);
      drawShot(octx, 'shot_sinkhorn', t, { sums: t < T0 + DRAIN[0] });
      drawShot(nctx, 'shot_hoard', t, { number: t >= T0 + LOCK, count_at: T0 + LOCK });
      var bgc = mk(), bgx = bgc.getContext('2d'); bg(bgx, t);
      var drained = mk();
      PV.reveal(drained.getContext('2d'), t,
        function (c) { c.drawImage(oc, 0, 0); }, function (c) { c.drawImage(bgc, 0, 0); },
        PV.inward(630, 490, T0 + DRAIN[0], T0 + DRAIN[1], 560.0), { region: PANE2, cell: [8, 16], dur: 0.09 });
      var num = [440, 100, 720, 172];
      PV.reveal(ctx, t,
        function (c) { c.drawImage(drained, 0, 0); },
        function (c) { c.drawImage(nc, 0, 0); },
        function (x, y) {
          if (x >= num[0] && x < num[2] && y >= num[1] && y < num[3]) return T0 + LOCK - 0.09;
          var e = EDGE[Math.floor(x / 8) * 8];
          return e === undefined ? 1e9 : e;
        }, { region: FULLR, cell: [8, 16], dur: 0.09 });
      if (T0 + DRAIN[0] <= t && t < T0 + LOCK) {   /* row sums 飞上去变成命中率 */
        var lift = clamp01((t - (T0 + DRAIN[0])) / 0.12);
        var u = clamp01((t - (T0 + FLY[0])) / (FLY[1] - FLY[0]));
        var srcS = PV.SR.rowSumsText((T0 + DRAIN[0] - 138.1587) / 3.2308);
        var dstS = PV.SR.hitValue(T0, T0, 1.0).toFixed(1) + '%';
        var p = clamp01((u - 0.3) / 0.6);
        var s = PV.morph(srcS, dstS, p, PV.mt(Math.round(t * 24) * 7));
        var e2 = settle(u, 0.05, 0.12);
        var size = Math.round(lerp(18, 64, clamp01(e2)));
        var pos = bez(SUMS_XY, [PV.SR.HIT_XY[0] + 390, PV.SR.HIT_XY[1]], 0.1, e2);
        var lock = Math.max(0, 1 - Math.abs(t - T0) / 0.1);
        textAt(ctx, s, pos[0], pos[1], rgbLerp(red(0.95), blue(1.0), p), size, 1, 1,
               Math.max(0.6 * lift * (1 - u), 0.7 * lock), 0.3 * lift * (1 - u) + 0.3 * lock);
      }
    });
  })();

  /* ================================================================ C63 hoard -> flood */
  (function () {
    var T0 = 144.1587, PRE = 0.3, POST = 0.96, FREEZE = T0 - 0.3;
    function reachedMask(t) {
      var c = mk(), g = c.getContext('2d');
      g.fillStyle = '#fff';
      var f = (t - T0) * FPS;
      for (var r = 0; r < PV.SR.FLOOD_ROWS; r++) {
        var d0 = PV.SR.rowDelay(r) + 0.35 * Math.abs(r - (PV.SR.GET_R0 + 8.5)) / 9;
        if (f < d0) continue;
        var x = PV.SR.SRC_END + (f - d0) * PV.SR.POUR_V + PV.SR.ADV;
        var y0 = PV.SR.floodY(r) - (r ? 2 : 0);
        var y1 = r < PV.SR.FLOOD_ROWS - 1 ? PV.SR.floodY(r + 1) - 2 : FULLR[3];
        g.fillRect(FULLR[0], y0, Math.min(FULLR[2], x) - FULLR[0], y1 - y0);
      }
      return c;
    }
    PV.addCut(T0, PRE, POST, function (ctx, t) {
      var lift = clamp01((t - (T0 - 0.28)) / 0.2);
      var oc = mk(), octx = oc.getContext('2d');
      bg(octx, t);
      drawShot(octx, 'shot_hoard', t, { freeze: FREEZE, lift: lift });
      ctx.drawImage(oc, 0, 0);
      if (t < T0) return;
      var nc = mk(), nctx = nc.getContext('2d');
      bg(nctx, t);
      drawShot(nctx, 'shot_flood', t, { freeze: FREEZE });
      var tmp = mk(), tg = tmp.getContext('2d');
      tg.drawImage(nc, 0, 0);
      tg.globalCompositeOperation = 'destination-in';
      tg.drawImage(reachedMask(t), 0, 0);
      tg.globalCompositeOperation = 'source-over';
      ctx.drawImage(tmp, 0, 0);
    });
  })();

  /* ================================================================ 收尾：把本段注册的 cut 全部包上帧号种子 */
  (function () {
    var n = 0;
    for (var i = 0; i < PV.CUTS.length; i++) {
      var c = PV.CUTS[i];
      if (c.T >= 110.4 && c.T <= 147.7 && !c.__p3) { c.__p3 = 1; c.fn = frameRng(c.fn); n++; }
    }
    PV.P3_CUTS = n;
  })();
})();
