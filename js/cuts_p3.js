/* cuts_p3.js —— 110.5 - 147.6 s 的转场：C48-C63（s_userleft.py 的 C48-C54 + s_reward.py 的 C55-C63）
   只做这一段；C26-C47 在 cuts_p2.js。

   依赖 scene_p2b.js 暴露的场景工具（PV.SU / PV.SR / PV.shotXxx(ctx,t,lt,u,dur,h)），
   以及 scene_p2a.js 注册的 shot_completion（C48 的旧画面）。

   左侧 dsh 聊天窗是 DOM（pane.js），本文件不碰 pane.js，而是在它的两个钩子上组合：
     PV.paneVisible(t) —— 包一层，做 HIDE_HER（erase / moe_dense / flood 三镜 + 相机窗口）
     PV.sync(t)        —— 调用原实现之后，按时间给 #chatbox 打 transform / clip-path
   相机（C53/C54）把整幅画面绕 P0 缩放到 z 再贴到 node rect；场景内容由画布负责，
   她的窗格用同一个仿射变换交给 DOM，两边合起来才是参考帧里的"小屏幕"。
   节点外的部分（浏览器里没有 canvas 的 her 图层）无法逐格搬，按最近的等价做法近似，注释里标了。 */
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
          var p = clamp01((u - 0.1) / 0.62), rng = PV.mt(Math.round(cut.T * 24) * 17);
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

  /* @@PART2@@ */
})();
