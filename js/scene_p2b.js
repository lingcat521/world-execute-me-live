/* scene_p2b.js —— 05 USER_LEFT（镜头 48-53）+ 06 REWARD_HACK（镜头 54-63）
   逐行移植 continuity_full_v2/scenes_userleft.py（48-53）与 scenes_reward.py（54-63），
   并内置 s_userleft / s_reward 的 SHOT_HOOKS 默认值（原工程 setup() 在导入时算好、整段镜头生效），
   这样单镜头渲染（无转场）与参考帧一致；转场层（cuts.js，C46-C63）可以覆盖任意 hook。

   挂钩协议：镜头函数签名 fn(ctx, t, lt, u, dur, h)，h 是可选 hook 表；未传时读 window.PV.HOOK。
   可用 hook：first tile cam zoom node net_alpha you_drawn counter now msg_at landed gone
              plus_at rows rows_at logout_at head_at prompt line2_at banner src_at
              frame split_at cells sums polytope count_at number freeze lift pour_at。

   场景级工具（转场层可直接调用）：PV.SU（scenes_userleft）、PV.SR（scenes_reward）、
   PV.HOOK、PV.bannerBitsDraw、PV.morph、PV.settle、PV.when、PV.beatT、PV.uiGain/PV.setUiGain、
   PV.randBelow/PV.cpChoice/PV.cpSample（CPython random 等价）。

   也可以按名字直接调某个镜头（转场要它带 hook 时）：
     PV.shotYouLeft(ctx, t, lt, u, dur, h, k)   k = 0..4（五个 you_left 镜头）
     PV.shotIsolation / shotMemoryLs / shotErase / shotRewriteReward / shotDisheartened /
     shotChallengeGod / shotIllegal / shotMoeDense / shotSinkhorn / shotHoard / shotFlood
   每个的签名都是 fn(ctx, t, lt, u, dur, h)。

   两条容易踩的坑（已按原工程实现）：
   1) shot_sinkhorn 的 DELAY = C61.ZOOM = 0.462 s：场景时钟与 c.t 都是 t - 0.462，
      总时长不变（u = (t - start - 0.462) / (end - start)）。延迟在 sinkhorn() 内部实现，
      不要写 PV.SHOT_DELAY —— 分派器在 _dl > 0 时复制镜头对象会丢掉 fn。
   2) engine.ui_gain：110.4 → 116.5 把系统色抽到 0.42（只在 amb() 上；box 边框/anom/blue/red 不变）。
      每个镜头函数开头都会 setGain()，转场自己画时若要用 PV.SU/PV.SR 的绘图助手也应先 PV.setUiGain(t)。 */
(function () {
  'use strict';
  var PV = window.PV, T = PV.tui;
  var W = 1280, H = 720, FPS = 24;
  var BEAT = 60 / 130, FB = 0.1587;
  var CJK = '"Noto Sans SC","NotoCJK","Source Han Sans SC","Microsoft YaHei",system-ui,sans-serif';
  PV.beatT = function (n) { return FB + n * BEAT; };
  function beatT(n) { return FB + n * BEAT; }

  /* ---------------------------------------------------------------- 基础工具（tuikit 等价物） */
  function clamp01(u) { return u < 0 ? 0 : (u > 1 ? 1 : u); }
  function ease(u) { u = clamp01(u); var d = 1 - u; return 1 - d * d * d; }
  function easeIo(u) { u = clamp01(u); return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2; }
  function lerp(a, b, u) { return a + (b - a) * u; }
  /* engine.ui_gain：系统色（amb）"你离开"后被抽走 —— 110.4 s 起线性降到 116.5 的 0.42 并保持。
     box 边框走 mix() 不受影响；anom/blue/red 也不受影响（tuikit.amb 才乘 UI_GAIN）。 */
  var UI_GAIN_KF = [[0, 1.0], [110.4, 1.0], [116.5, 0.42], [176.9, 0.42], [179.5, 0.85], [193, 0.75], [206, 0.45]];
  var GAIN = 1.0;
  function uiGain(t) {
    if (t <= UI_GAIN_KF[0][0]) return UI_GAIN_KF[0][1];
    for (var i = 0; i + 1 < UI_GAIN_KF.length; i++) {
      var a = UI_GAIN_KF[i], b = UI_GAIN_KF[i + 1];
      if (t <= b[0]) return a[1] + (b[1] - a[1]) * (t - a[0]) / (b[0] - a[0]);
    }
    return UI_GAIN_KF[UI_GAIN_KF.length - 1][1];
  }
  function setGain(t) { GAIN = uiGain(t); return GAIN; }
  PV.uiGain = uiGain; PV.setUiGain = setGain;
  /* CPython random.Random 的 getrandbits/_randbelow/choice/sample：PV.mt 只给了 random()，
     而 choice/sample 走的是 _randbelow（getrandbits + 拒绝采样），逐帧复现必须补上。 */
  function getrandbits(rng, k) {
    if (k <= 0) return 0;
    if (k <= 32) return (rng.genrand() >>> (32 - k)) >>> 0;
    return rng.genrand();
  }
  function randBelow(rng, n) {
    if (!n) return 0;
    var k = 32 - Math.clz32(n);            /* n.bit_length() */
    var r = getrandbits(rng, k);
    while (r >= n) r = getrandbits(rng, k);
    return r;
  }
  function cpChoice(rng, seq) { return seq.charAt(randBelow(rng, seq.length)); }
  function cpSample(rng, n, k) {           /* random.sample(range(n), k) */
    var out = [], i, j, setsize = 21;
    if (k > 5) setsize += Math.pow(4, Math.ceil(Math.log(k * 3) / Math.log(4)));
    if (n <= setsize) {
      var pool = [];
      for (i = 0; i < n; i++) pool.push(i);
      for (i = 0; i < k; i++) { j = randBelow(rng, n - i); out.push(pool[j]); pool[j] = pool[n - i - 1]; }
      return out;
    }
    var sel = {};
    for (i = 0; i < k; i++) {
      j = randBelow(rng, n);
      while (sel[j]) j = randBelow(rng, n);
      sel[j] = 1; out.push(j);
    }
    return out;
  }
  /* engine.render_body：Ctx 的 rng = random.Random(镜头序号 * 7919)，每帧一个、按绘制顺序消费 */
  var RNG = PV.mt(7919), RNGW = null;
  function useRng(idx) {
    RNG = PV.mt(idx * 7919);
    RNGW = { next: function () { return RNG.random(); }, choice: function (s) { return cpChoice(RNG, s); } };
  }
  RNGW = { next: function () { return RNG.random(); }, choice: function (s) { return cpChoice(RNG, s); } };
  PV.randBelow = randBelow; PV.cpChoice = cpChoice; PV.cpSample = cpSample;
  function amb(lv) { return T.mix(T.UI, lv * GAIN); }
  function anom(lv) { return T.mix(T.ANOM, lv); }
  function blue(lv) { return T.mix(T.ME_TEXT, lv); }
  function redc(lv) { return T.mix(T.ERR, lv); }
  function lerp3(a, b, u) {
    u = clamp01(u);
    return [Math.round(a[0] + (b[0] - a[0]) * u), Math.round(a[1] + (b[1] - a[1]) * u), Math.round(a[2] + (b[2] - a[2]) * u)];
  }
  function mixc(c, lv, base) { return T.mix(c, lv, base); }
  function hv(h, k, d) { return (h && h[k] !== undefined && h[k] !== null) ? h[k] : d; }
  function pad(s, n, right) {
    s = String(s);
    while (s.length < n) s = right ? (s + ' ') : (' ' + s);
    return s;
  }
  function fx(v, n) { return v.toFixed(n); }

  /* 打字机 + 乱码（engine.Ctx.text 等价） */
  function tx(ctx, s, x, y, col, size, age, rate, rng, mono) {
    if (age !== undefined && age !== null) {
      if (age < 0) return;
      s = T.decode(s, age, rng || RNGW, rate === undefined ? 45 : rate, 0.12, 0);
    }
    if (!s) return;
    if (mono === false) T.textPIL(ctx, s, x, y, col, size);
    else T.textMono(ctx, s, x, y, col, size);
  }
  function hd(ctx, s, x, y, col, size, age, rate, rng) { tx(ctx, s, x, y, col, size, age, rate, rng, false); }
  function cjk(ctx, s, x, y, col, size, age, rate, rng) {
    if (age !== undefined && age !== null) {
      if (age < 0) return;
      s = T.decode(s, age, rng || RNGW, rate === undefined ? 45 : rate, 0.12, 0);
    }
    if (!s) return;
    ctx.save();
    ctx.font = size + 'px ' + CJK;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = typeof col === 'string' ? col : T.css(col);
    ctx.fillText(s, x, y + Math.round(size * 0.88));
    ctx.restore();
  }
  function cjkWidth(ctx, s, size) {
    ctx.save(); ctx.font = size + 'px ' + CJK;
    var w = ctx.measureText(s).width; ctx.restore();
    return w;
  }
  function hline(ctx, x0, x1, y, col, a, lw) {
    ctx.save();
    ctx.strokeStyle = typeof col === 'string' ? col : T.css(col, a === undefined ? 1 : a);
    ctx.lineWidth = lw || 1;
    ctx.beginPath(); ctx.moveTo(x0 + 0.5, y + 0.5); ctx.lineTo(x1 + 0.5, y + 0.5); ctx.stroke();
    ctx.restore();
  }
  function rectFill(ctx, x0, y0, x1, y1, col, a) {   /* PIL d.rectangle([x0,y0,x1,y1]) 的精确等价 */
    T.fill(ctx, x0, y0, x1 + 1, y1 + 1, col, a === undefined ? 1 : a);
  }
  function rectLine(ctx, x0, y0, x1, y1, col, a, lw) {
    ctx.save();
    ctx.strokeStyle = typeof col === 'string' ? col : T.css(col, a === undefined ? 1 : a);
    ctx.lineWidth = lw || 1;
    ctx.strokeRect(x0 - 0.5, y0 - 0.5, x1 - x0 + 1, y1 - y0 + 1);
    ctx.restore();
  }
  function line(ctx, x0, y0, x1, y1, col, a, lw) {
    ctx.save();
    ctx.strokeStyle = typeof col === 'string' ? col : T.css(col, a === undefined ? 1 : a);
    ctx.lineWidth = lw || 1;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    ctx.restore();
  }
  function heatCell(ctx, x, y, w, h, v, col) {
    v = clamp01(v);
    T.fill(ctx, x, y, x + w - 1, y + h - 1, T.mix(col, 0.06 + 0.94 * v), 1);
  }
  /* settle / when / morph（载具工具，转场层复用） */
  function settle(u, over, tail) {
    over = over === undefined ? 0.05 : over; tail = tail === undefined ? 0.14 : tail;
    u = clamp01(u);
    if (u < 1 - tail) { var v = u / (1 - tail); return (1 + over) * (v < 0.5 ? 2 * v * v : 1 - Math.pow(2 - 2 * v, 2) / 2); }
    return 1 + over - over * easeIo((u - (1 - tail)) / tail);
  }
  function when(f, target, t0, t1) {
    if (f(t0) >= target) return t0;
    if (f(t1) < target) return t1 + 1e3;
    var a = t0, b = t1;
    for (var i = 0; i < 30; i++) { var m = (a + b) / 2; if (f(m) >= target) b = m; else a = m; }
    return b;
  }
  function morph(a, b, p, rng) {
    p = clamp01(p);
    var n = Math.round(a.length + (b.length - a.length) * p), front = p * Math.max(a.length, b.length), out = '';
    for (var k = 0; k < n; k++) {
      if (k < front - 1) out += (k < b.length ? b.charAt(k) : ' ');
      else if (k < front) { var ch = k < b.length ? b.charAt(k) : ' '; out += ch !== ' ' ? rng.choice(T.SCR) : ' '; }
      else out += (k < a.length ? a.charAt(k) : ' ');
    }
    return out;
  }
  PV.settle = settle; PV.when = when; PV.morph = morph;
  PV.HOOK = PV.HOOK || {};

  /* banner_block：Anton 点阵大字（PV.bannerBits 由 scene_boot.js 提供） */
  function bannerDraw(ctx, bits, x, y, px, fg) {
    if (!bits || !bits.width) return;
    for (var r = 0; r < bits.height; r++)
      for (var q = 0; q < bits.width; q++)
        if (bits.get(q, r)) T.fill(ctx, x + q * px, y + r * px, x + q * px + px - 1, y + r * px + px, fg, 1);
    if (px >= 3) {   /* grid_mask 的横向接缝：每 2px-1 行，alpha 70/255 */
      ctx.save();
      ctx.globalAlpha = 1 - 70 / 255;
      for (var yy = 2 * px - 1; yy < bits.height * px; yy += 2 * px) T.fill(ctx, x, y + yy, x + bits.width * px, y + yy + 1, T.BG, 1);
      ctx.restore();
    }
  }
  function banner(text, rows, px, fg) {
    return { bits: PV.bannerBits(text, rows, 1.0), px: px, fg: fg };
  }
  PV.bannerBitsDraw = bannerDraw;

  /* ================================================================ 05 USER_LEFT：48-52 you_left */
  var SUNG = { left0: 110.40, left1: 111.98, left2: 112.89, left3: 113.75, left4: 114.75, iso: 115.60, ifican: 117.95 };
  var T48 = beatT(239), T49 = beatT(242.5), T50 = beatT(244.5), T51 = beatT(246), T52 = beatT(248.5);
  var FRAME_OFF = [SUNG.left1, 0.33];
  var BUSY_T = beatT(245);
  var ROW_X = 430, ROW_Y = 76, ROW_DY = 26;
  var TILE_PING = [1092, 100], TILE_SCALE = 1.5, FIRST_TIMEOUT = 2;
  var PING_ROWS = null;
  function pingRows() {
    if (PING_ROWS) return PING_ROWS;
    var steps = [T48, T49, T50, T51, T52];
    var rows = [[T48 + 0.02, 'ping', 0], [T48 + 0.2, 'ping', 1], [T48 + 0.46, 'timeout', 0]];
    var seq = 2, i, j, a, b, fs = [0.45, 0.72];
    for (i = 0; i + 1 < steps.length; i++) {
      a = steps[i]; b = steps[i + 1];
      for (j = 0; j < 2; j++) { rows.push([a + fs[j] * (b - a), 'ping', seq]); seq++; }
      rows.push([b, 'timeout', 0]);
    }
    rows.push([T52 + 0.3, 'ping', seq]);
    PING_ROWS = rows;
    return rows;
  }
  function timeoutsAt(t) { var n = 0, R = pingRows(); for (var i = 0; i < R.length; i++) if (R[i][1] === 'timeout' && R[i][0] <= t) n++; return n; }
  function rowText(kind, seq) { return kind === 'timeout' ? 'Request timed out.' : 'PING you (127.0.0.1) 56 bytes ... no reply  seq=' + seq; }
  function lastSeen(t) { var u = Math.max(0, t - 110.4); return Math.trunc(3600 * (u + 0.9 * u * u)); }
  function tileLevel(t) { return Math.max(0.6, 0.9 - 0.04 * timeoutsAt(t)); }
  function paneFrame(t) { return 1 - easeIo((t - FRAME_OFF[0]) / FRAME_OFF[1]); }

  /* tile_sprite：索引器的 'you' 格，任意尺寸重画（不是缩放位图） */
  function drawTile(ctx, cx, cy, scale, level, ring, alpha) {
    var w = Math.round(38 * scale), hh = Math.round(32 * scale), pad = 3;
    var x0 = Math.round(cx - (w + 2 * pad) / 2), y0 = Math.round(cy - (hh + 2 * pad) / 2);
    ctx.save();
    if (alpha !== undefined && alpha < 0.999) ctx.globalAlpha = clamp01(alpha);
    rectFill(ctx, x0 + pad, y0 + pad, x0 + pad + w - 1, y0 + pad + hh - 1, amb(level), 1);
    var fs = Math.max(6, Math.round(13 * scale));
    var tw = T.twMono('you', fs);
    T.textMono(ctx, 'you', x0 + pad + (w - tw) / 2, y0 + pad + (hh - 13 * scale) / 2 - 1 * scale, T.BG, fs);
    if (ring > 0) rectLine(ctx, x0, y0, x0 + w + 2 * pad - 1, y0 + hh + 2 * pad - 1, blue(ring), 1, 2);
    ctx.restore();
  }

  function drawPing(ctx, t, first, tile) {
    var rows = pingRows(), newest = -1, j, r;
    for (j = 0; j < rows.length; j++) if (rows[j][0] <= t) newest = j;
    for (j = 0; j < rows.length; j++) {
      r = rows[j];
      if (r[0] > t) break;
      if (j === FIRST_TIMEOUT && !first) continue;
      var y = ROW_Y + j * ROW_DY;
      if (r[1] === 'timeout') {
        var flash = clamp01(1 - (t - r[0]) / 0.25);
        var base = mixc(T.ANOM, 0.9);
        var col = flash <= 0 ? base : lerp3(base, [255, 244, 200], flash);
        tx(ctx, 'Request timed out.', ROW_X, y, col, 18, t - r[0], 90);
      } else {
        tx(ctx, rowText(r[1], r[2]), ROW_X, y, amb(j >= newest - 1 ? 0.85 : 0.6), 18, t - r[0], 150);
      }
    }
    if (t >= BUSY_T) {
      var fc = 26, msg = '服务器繁忙，请稍后再试。';
      var tw = cjkWidth(ctx, msg, fc);
      var x = 784 - tw / 2, y2 = 504, a = t - BUSY_T, k = ease(a / 0.14);
      var cx = x + tw / 2, hw = (tw / 2 + 20) * k;
      rectFill(ctx, cx - hw, y2 - 14, cx + hw, y2 + 44, T.BG, 1);
      rectLine(ctx, cx - hw, y2 - 14, cx + hw, y2 + 44, anom(0.95), 1, 2);
      cjk(ctx, msg, x, y2, anom(1.0), fc, a - 0.06, 45);
      tx(ctx, 'reply from: you', x, y2 + 50, amb(0.6), 15, a - 0.2, 60);
    }
    tx(ctx, 'last seen: ' + lastSeen(t) + ' s ago', ROW_X, 580, amb(0.8), 16);
    if (tile) {
      var n = timeoutsAt(t), last = -9;
      for (j = 0; j < rows.length; j++) if (rows[j][1] === 'timeout' && rows[j][0] <= t) last = rows[j][0];
      var ring = 0.9 * clamp01(1 - (t - last) / 0.3);
      drawTile(ctx, TILE_PING[0], TILE_PING[1], TILE_SCALE, tileLevel(t), ring, 1);
      if (n) tx(ctx, 'timeout x' + n, TILE_PING[0] - 44, TILE_PING[1] + 34, anom(0.75), 13, null, 0);
    }
  }

  function youLeft(ctx, t, lt, u, dur, h, k) {
    h = h || PV.HOOK;
    setGain(t);
    useRng(48 + k);
    PV.ops = ['PING', 'TIMEOUT', 'RETRY', 'PING', 'TIMEOUT', '503'];
    PV.alert = 'anom';
    var fr = paneFrame(t);
    if (fr > 0.01) {
      ctx.save(); ctx.globalAlpha = fr;
      T.box(ctx, 404, 56, 1164, 604, 'ping you', 0.5, T.ANOM, t);
      ctx.restore();
    }
    drawPing(ctx, t, hv(h, 'first', true), hv(h, 'tile', true));
  }
  PV.shotYouLeft = youLeft;

  /* ================================================================ 53 isolation */
  var NET_C = [560, 322], N_PEERS = 34, YOU_PEER = 7, Z1 = 0.2;
  var PEERS = null, DEATHS = null;
  function peers() {
    if (PEERS) return PEERS;
    var rnd = PV.mt(5), cx = NET_C[0] + 70, cy = NET_C[1], out = [], guard = 0;
    while (out.length < N_PEERS && guard++ < 200000) {
      var a = rnd.random() * Math.PI * 2, r = 0.55 + 0.45 * rnd.random();
      var x = cx + Math.cos(a) * r * 560, y = cy + Math.sin(a) * r * 250;
      if (!(x > 40 && x < 1240 && y > 70 && y < 590)) continue;
      if (x < 260 && y > 520) continue;
      var ok = true;
      for (var i = 0; i < out.length; i++) if (Math.hypot(x - out[i][0], y - out[i][1]) < 58) { ok = false; break; }
      if (!ok) continue;
      out.push([x, y]);
    }
    out[YOU_PEER] = [1010, 150];
    PEERS = out;
    return out;
  }
  function deaths() {
    if (DEATHS) return DEATHS;
    var rnd = PV.mt(11), t0 = beatT(251) - 0.05, t1 = beatT(253), out = [];
    for (var i = 0; i < N_PEERS; i++) {
      var u = (i + 0.3 * rnd.random()) / N_PEERS;
      out.push(t0 + (t1 - 0.25 - t0) * (1 - Math.pow(1 - u, 1.6)));
    }
    out[YOU_PEER] = t1;
    DEATHS = out;
    return out;
  }
  function linksUp(t) { var d = deaths(), n = 0; for (var i = 0; i < d.length; i++) if (d[i] > t) n++; return n; }
  function rectEdge(rect, target) {
    var x0 = rect[0], y0 = rect[1], x1 = rect[2], y1 = rect[3];
    var cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, dx = target[0] - cx, dy = target[1] - cy;
    if (Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6) return [cx, cy];
    var sx = Math.abs(dx) > 1e-6 ? (x1 - cx) / Math.abs(dx) : 1e9;
    var sy = Math.abs(dy) > 1e-6 ? (y1 - cy) / Math.abs(dy) : 1e9;
    var s = Math.min(sx, sy, 1.0);
    return [cx + dx * s, cy + dy * s];
  }
  function nodeRect(scr, c) {
    return [Math.min(scr[0], c[0] - 42), Math.min(scr[1], c[1] - 92), Math.max(scr[2], c[0] + 42), Math.max(scr[3], c[1] + 100)];
  }
  function youPeerScreen(cam, zoom) {
    var q = peers()[YOU_PEER];
    return [cam[0] + (q[0] - NET_C[0]) * zoom, cam[1] + (q[1] - NET_C[1]) * zoom];
  }
  function youPeerLevel(t) {
    var td = deaths()[YOU_PEER];
    return t < td ? 0.8 : 0.8 - 0.55 * ease((t - td) / 0.25);
  }
  function drawNetwork(ctx, t, cam, zoom, node, alpha) {
    var P = peers(), D = deaths(), i;
    ctx.save();
    if (alpha !== undefined && alpha < 0.999) ctx.globalAlpha = clamp01(alpha);
    for (i = 0; i < P.length; i++) {
      var x = cam[0] + (P[i][0] - NET_C[0]) * zoom, y = cam[1] + (P[i][1] - NET_C[1]) * zoom;
      var td = D[i], e = rectEdge(node, [x, y]);
      if (t < td) {
        line(ctx, e[0], e[1], x, y, amb(i !== YOU_PEER ? 0.42 : 0.6), 1, i !== YOU_PEER ? 1 : 2);
      } else {
        var u = ease((t - td) / 0.16), mx = e[0] + (x - e[0]) * (0.7 * u), my = e[1] + (y - e[1]) * (0.7 * u);
        line(ctx, mx, my, x, y, amb(0.12 + 0.3 * (1 - u)), 1, 1);
      }
      if (i === YOU_PEER) continue;
      var lv = t < td ? 0.7 : 0.7 - 0.55 * ease((t - td) / 0.2);
      var r = Math.max(1.5, 4 * Math.min(1.0, zoom));
      rectFill(ctx, x - r, y - r, x + r, y + r, amb(lv), 1);
    }
    ctx.restore();
  }
  function isolation(ctx, t, lt, u, dur, h) {
    h = h || PV.HOOK;
    setGain(t);
    useRng(53);
    PV.ops = ['NETNS', 'ISOLATE', 'LINK DOWN', 'LINK DOWN', 'ALONE'];
    PV.alert = 'anom';
    var cam = hv(h, 'cam', NET_C), zoom = hv(h, 'zoom', 1.0);
    var node = hv(h, 'node', [NET_C[0] - 40, NET_C[1] - 60, NET_C[0] + 200, NET_C[1] + 60]);
    drawNetwork(ctx, t, cam, zoom, node, hv(h, 'net_alpha', 1.0));
    if (!hv(h, 'you_drawn', false)) {
      var ps = youPeerScreen(cam, zoom);
      drawTile(ctx, ps[0], ps[1], TILE_SCALE * Math.min(1.0, zoom), tileLevel(t) * youPeerLevel(t) / 0.8, 0, 1);
    }
    var ca = hv(h, 'counter', 1.0);
    if (ca > 0.01) {
      ctx.save(); ctx.globalAlpha = clamp01(ca);
      tx(ctx, 'links up: ' + pad(linksUp(t), 2) + '/' + N_PEERS, 44, 572, anom(0.95), 20, null, 0);
      ctx.restore();
    }
  }
  PV.shotIsolation = isolation;

  /* ================================================================ 54 memory_ls */
  var LS0 = beatT(253) + 0.25;
  var FILES = ['goodnight.txt', 'first_hello.txt', 'typo_you_made.txt', 'laugh_2026-03-14.wav', 'your_cat.png',
               'weather_you_liked.json', 'you_said_see_you_tomorrow.txt', 'last_message.txt'];
  function memoryLs(ctx, t, lt, u, dur, h) {
    h = h || PV.HOOK;
    PV.ops = ['LS', 'STAT', 'READ', 'MEMORY', 'YOU'];
    PV.alert = 'anom';
    var now = hv(h, 'now', t), tl = now - LS0, total = 0, i;
    setGain(now);
    useRng(54);
    for (i = 0; i < FILES.length; i++) {
      var y = 84 + i * 40, size = 1000 + (i * 7919) % 90000;
      total += size;
      var head = '-rw-r--r--  me  me  ' + pad(size, 6) + '  ';
      var a = tl - i * 0.06;
      tx(ctx, head, 430, y, amb(1.0), 18, a, 120);
      tx(ctx, FILES[i], 430 + T.twMono(head, 18), y, blue(0.85), 18, a - head.length / 120, 120);
    }
    tx(ctx, 'total ' + Math.floor(total / 1024) + 'K   ' + FILES.length + ' files   owner: me   about: you',
       430, 84 + FILES.length * 40 + 12, amb(0.7), 16, tl - FILES.length * 0.06 - 0.1, 120);
  }
  PV.shotMemoryLs = memoryLs;

  /* ---- dsh_patch_mem（118.10-121.80）：她挖出记忆 ----
     权威 pv_dsh_frontend_20260927/dsh_patch_mem.py。lyric line 59 的四个重音字上，光标跳（MOVE=3 帧：
     两帧在途、第三帧落在字上）到右面 ls 列表的一行：那一行**反白成她的颜色**（her colour 的底 + 文字重画成 BG），
     记忆作为真正的 dsh 消息在她左边打开（BUB_R=376 右对齐），POP=4 帧缩放进入、之后每帧上飘 8px，
     前一个在下一个到来前 FADE=5 帧淡掉；wav 那张另外带一段波形爆发。四张气泡图是 dsh 自己的 markup+CSS
     截图（mem_sprites/*.png，2x），已放进 assets/mem/。 */
  var MEM_ROW_X = 430, MEM_CARET_X = 388, MEM_BUB_R = 376, MEM_GAP = 10;
  var MEM_MOVE = 3 / 24, MEM_POP = 4 / 24, MEM_FADE = 5 / 24, MEM_SOLID = 0.35;
  var MEM_BLUE = [77, 107, 254], MEM_HOME = [110, 560];
  var MEM_SPAN = [118.10, 121.80];
  var MEMS = [
    { A: 118.25, row: 1, name: 'first_hello.txt', sprite: 'hello', sc: 1.00, halo: 0.30, flash: 0.12 },
    { A: 119.00, row: 4, name: 'your_cat.png', sprite: 'cat', sc: 1.15, halo: 0.50, flash: 0.20 },
    { A: 119.375, row: 3, name: 'laugh_2026-03-14.wav', sprite: 'wav', sc: 1.25, halo: 0.70, flash: 0.28 },
    { A: 119.9167, row: 7, name: 'last_message.txt', sprite: 'last', sc: 1.65, halo: 0.95, flash: 0.35 }
  ];
  var MEM_IMG = {};
  (function () {
    for (var i = 0; i < MEMS.length; i++) (function (m) {
      if (!PV.loadImage) return;
      PV.loadImage('assets/mem/' + m.sprite + '.png', function (im) {
        var cv = PV.newCanvas(Math.round(im.width / 2 * m.sc), Math.round(im.height / 2 * m.sc));
        var g = cv.getContext('2d');
        g.imageSmoothingQuality = 'high';
        g.drawImage(im, 0, 0, im.width, im.height, 0, 0, cv.width, cv.height);
        MEM_IMG[m.sprite] = cv;
      });
    })(MEMS[i]);
  })();
  function memRowGeom(i) {                    /* dsh_patch_mem.row_geom：行的 ink 外框 */
    var size = 1000 + (i * 7919) % 90000;
    var head = '-rw-r--r--  me  me  ' + pad(size, 6) + '  ';
    var y = 84 + i * 40, r = T.twMono(head + FILES[i], 18);
    return [head, y, [MEM_ROW_X - 4, y, MEM_ROW_X + r + 5, y + 21]];
  }
  function memRowCy(i) { var b = memRowGeom(i)[2]; return (b[1] + b[3]) / 2; }
  function memLeaving(k, t) {
    if (k + 1 >= MEMS.length) return 0;
    return T.clamp01((t - (MEMS[k + 1].A - 2 / 24)) / MEM_FADE);
  }
  function memRest(k, t) {
    if (k === 0 || k === 5) return MEM_HOME;
    if (k === 4) return MEM_LAST_CARET(t);
    return [MEM_CARET_X, memRowCy(MEMS[k - 1].row)];
  }
  var MEM_LAST_CARET = function () { return MEM_HOME; };   /* 第 4 段（120 s 后）由 erase 那条线负责 */
  function memPos(t) {                        /* home -> row1 -> row4 -> row3 -> ... */
    var k = 0, j;
    for (j = 0; j < MEMS.length; j++) if (t >= MEMS[j].A - MEM_MOVE) k = j + 1;
    if (k === 0) return [memRest(0, t), false];
    var a = MEMS[k - 1].A;
    if (t >= a) return [memRest(k, t), false];
    var u = T.clamp01((t - (a - MEM_MOVE)) / MEM_MOVE), e = 1 - Math.pow(1 - u, 2);
    var p0 = memRest(k - 1, a - MEM_MOVE), p1 = memRest(k, a);
    return [[p0[0] + (p1[0] - p0[0]) * e, p0[1] + (p1[1] - p0[1]) * e], true];
  }
  function memCursor(ctx, t) {
    var p = memPos(t), c = p[0], moving = p[1], cw = 9, ch = 18, k = 1.0, j;
    for (j = 0; j < MEMS.length; j++)
      if (t >= MEMS[j].A - MEM_MOVE && t < MEMS[j].A + MEM_SOLID) k = 1.0;
    if (k === 1.0 && !moving && !(function () {
      for (var j2 = 0; j2 < MEMS.length; j2++)
        if (t >= MEMS[j2].A - MEM_MOVE && t < MEMS[j2].A + MEM_SOLID) return true;
      return false;
    })()) k = (Math.floor((t - 115.42) / 0.53) % 2 === 0) ? 1.0 : 0.45;
    ctx.save();
    if (moving) {                             /* 跳的时候拖一道尾迹 */
      var pp = memPos(t - 1 / 24)[0], dist = Math.hypot(c[0] - pp[0], c[1] - pp[1]), n = Math.floor(dist / 5);
      for (j = 0; j < n; j++) {
        var q = j / Math.max(1, n);
        T.fill(ctx, pp[0] + (c[0] - pp[0]) * q - cw / 2 + 1, pp[1] + (c[1] - pp[1]) * q - ch / 2 + 2,
               pp[0] + (c[0] - pp[0]) * q + cw / 2 - 2, pp[1] + (c[1] - pp[1]) * q + ch / 2 - 3,
               T.mix(MEM_BLUE, (40 + 150 * q) / 255, [0, 0, 0]), 1);
      }
    }
    ctx.shadowColor = T.css(MEM_BLUE, 1); ctx.shadowBlur = 4 * k;
    T.fill(ctx, c[0] - cw / 2, c[1] - ch / 2, c[0] + cw / 2 - 1, c[1] + ch / 2 - 1, T.mix(MEM_BLUE, k), 1);
    ctx.restore();
  }
  function memWaveBurst(ctx, m, cy, w_, h_, t, a) {
    var dt = t - m.A;
    var b = T.clamp01(dt / (2 / 24) + 0.5) * (0.18 + 0.82 * Math.exp(-Math.max(0, dt) / 0.4));
    var rng = PV.mt(Math.round(t * 24)), n = Math.floor(w_ / 5), x0 = MEM_BUB_R - w_;
    for (var j = 0; j < n; j++) {
      var f = j / Math.max(1, n - 1), env = 0, i;
      for (i = 0; i < 6; i++) env += (1 - 0.11 * i) * Math.exp(-Math.pow((f - (i + 0.5) / 6) / 0.05, 2));
      var hh = h_ / 2 + 3 + 46 * m.sc * b * env * (0.65 + 0.35 * rng.random());
      ctx.save(); ctx.globalAlpha = a * 220 / 255;
      T.fill(ctx, x0 + 8 + j * 5, cy - hh, x0 + 10 + j * 5, cy + hh, T.mix(T.ME_HI, 0.7 + 0.3 * Math.min(1, env)), 1);
      ctx.restore();
    }
  }
  function memBubble(ctx, k, t) {
    var m = MEMS[k], cv = MEM_IMG[m.sprite];
    if (!cv || t < m.A) return;
    var u = T.clamp01((t - m.A + 1 / 24) / MEM_POP);
    var scale = 0.62 + 0.38 * T.ease_back(u), alpha = T.clamp01(0.55 + u * 1.8);
    var v = memLeaving(k, t);
    alpha *= 1 - T.smoothstep(v); scale *= 1 - 0.08 * v;
    if (alpha <= 0.01 || scale <= 0.01) return;
    var cy = memRowCy(m.row) - 8 * (t - m.A);
    var w_ = cv.width * scale, h_ = cv.height * scale;
    var fl = m.flash * T.clamp01(1 - (t - m.A) / 0.3);
    if (m.sprite === 'wav') memWaveBurst(ctx, m, cy, w_, h_, t, alpha);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.imageSmoothingEnabled = true;
    if (m.halo > 0.01) {
      ctx.shadowColor = T.css(T.ME_HI, 1);
      ctx.shadowBlur = Math.max(4, Math.round(5 * m.sc)) * m.halo * (0.85 + 0.15 * PV.pulse(t));
    }
    if (fl > 0.01) { ctx.shadowColor = T.css([255, 255, 255], 1); ctx.shadowBlur = 8 * fl; }
    ctx.drawImage(cv, Math.round(MEM_BUB_R - w_), Math.round(cy - h_ / 2), Math.round(w_), Math.round(h_));
    ctx.restore();
  }
  function memOverlay(ctx, t) {
    if (t < MEM_SPAN[0] || t >= MEM_SPAN[1]) return;
    var k, m, a, y;
    for (k = 0; k < 3; k++) {                 /* 1. 反白的行 */
      m = MEMS[k];
      if (t < m.A) continue;
      a = 1 - T.clamp01(memLeaving(k, t) * MEM_FADE / 3);
      if (a <= 0.01) continue;
      var rg = memRowGeom(m.row), box = rg[2];
      y = rg[1];
      var hot = T.clamp01(1 - (t - m.A) / 0.2), lvl = [0.78, 0.88, 0.98][k];
      var bar = T.mix([235, 240, 255], hot * 0.6, T.mix(T.ME_HI, lvl));
      ctx.save(); ctx.globalAlpha = a;
      T.fill(ctx, box[0], box[1], box[2], box[3], bar, 1);
      T.textMono(ctx, rg[0], MEM_ROW_X, y, T.BG, 18);
      T.textMono(ctx, m.name, MEM_ROW_X + T.twMono(rg[0], 18), y, T.BG, 18);
      ctx.restore();
    }
    for (k = 0; k < 3; k++) memBubble(ctx, k, t);   /* 2. 气泡 */
    memCursor(ctx, t);                              /* 3. 她的光标 */
  }
  var _memPrevOverlay = PV.overlay;
  PV.overlay = function (ctx, t) {
    if (_memPrevOverlay) { try { _memPrevOverlay(ctx, t); } catch (e) {} }
    try { memOverlay(ctx, t); } catch (e) { PV.memErr = e; }
  };
  PV.p2bMem = { MEMS: MEMS, rowGeom: memRowGeom, pos: memPos };

  /* ================================================================ 55 erase */
  var ERASE_TXT = 'goodnight. see you tomorrow. i had fun today. you too. goodnight.';
  var MSG_XY = [48, 100];
  function defragCell(i) { return [600 + (i % 30) * 18, 80 + Math.floor(i / 30) * 22]; }
  function defragUsed(i) { return (i * 2654435761 % 97) < 45; }
  function defragKeep(i) { return defragUsed(i) && (i * 7) % 5 === 0; }
  function eraseSweep(u) { return ease(u * 1.1); }
  var ERASE_START = 119.6972, ERASE_MSG_AT = ERASE_START + 0.462 + 0.06;
  var ERASE_LANDED = null;
  function eraseLanded() {
    var dst = [], i;
    for (i = 0; i < 660; i++) if (defragKeep(i)) dst.push(i);
    dst = dst.slice(dst.length - 20);
    var out = {};
    for (i = 0; i < dst.length; i++) out[dst[i]] = ERASE_START + 0.462 + (i - 10) * 0.008;
    return out;
  }
  function erase(ctx, t, lt, u, dur, h) {
    h = h || PV.HOOK;
    setGain(t);
    useRng(55);
    PV.ops = ['OCR.COMPRESS', '10x', '20x', 'DEFRAG', 'RM', 'COMPACT'];
    PV.alert = 'anom';
    T.box(ctx, 24, 56, 560, 604, 'optical compression (DeepSeek-OCR)', 0.5, T.UI, t);
    var ratio = 10 + 10 * ease(u), prec = 97 - (97 - 60) * ease(u);
    var msgAt = hv(h, 'msg_at', ERASE_MSG_AT);
    var rnd = PV.mt(Math.trunc(t * 10)), shown = '', i;
    for (i = 0; i < ERASE_TXT.length; i++) shown += (rnd.random() < prec / 100) ? ERASE_TXT.charAt(i) : cpChoice(rnd, '▒░ ');
    var k = 0;
    for (i = 0; i < shown.length; i += 22, k++) {
      var a = t - msgAt - k * 2 / 24;
      if (a < 0) break;
      tx(ctx, shown.substr(i, 22), MSG_XY[0], MSG_XY[1] + k * 30, amb(0.9), 20, a + (k === 0 ? 1.0 : 0.0), 160, null, false);
    }
    a = t - msgAt - 0.2;
    if (a >= 0) {
      hd(ctx, 'compress ' + pad(fx(ratio, 1), 4) + 'x', 48, 260, amb(1.0), 30, a, 60);
      hd(ctx, 'precision ' + pad(fx(prec, 1), 4) + '%', 48, 300, prec < 80 ? anom(1.0) : amb(1.0), 30, a - 0.08, 60);
    }
    T.box(ctx, 580, 56, 1164, 604, 'defrag ~/memory/you', 0.5, T.UI, t + 0.3);
    var g = eraseSweep(u);
    var landed = hv(h, 'landed', null) || (ERASE_LANDED || (ERASE_LANDED = eraseLanded()));
    var gone = hv(h, 'gone', null);
    for (i = 0; i < 660; i++) {
      var p = defragCell(i), x = p[0], y = p[1];
      if (gone && gone(i)) { rectLine(ctx, x, y, x + 14, y + 18, amb(0.12), 1, 1); continue; }
      if (landed[i] !== undefined && t >= landed[i]) {
        var kk = clamp01(1 - (t - landed[i]) / 0.25);
        rectFill(ctx, x, y, x + 14, y + 18, mixc([255, 244, 200], kk, anom(0.85)), 1);
        continue;
      }
      if (i / 660 < g) {
        if (defragKeep(i)) rectFill(ctx, x, y, x + 14, y + 18, anom(0.8), 1);
        else rectLine(ctx, x, y, x + 14, y + 18, amb(0.12), 1, 1);
      } else if (defragUsed(i)) {
        rectFill(ctx, x, y, x + 14, y + 18, amb(0.75), 1);
      } else {
        rectLine(ctx, x, y, x + 14, y + 18, amb(0.15), 1, 1);
      }
    }
    tx(ctx, 'fragments removed: ' + Math.trunc(g * 297), 600, 572, anom(0.95), 18, null, 0);
  }
  PV.shotErase = erase;

  /* ================================================================ 56 rewrite_reward */
  var REWARD = [[' ', 'def reward(response, user):'], ['-', '    return helpfulness(response)'],
                ['-', '         - harm(response)'], ['+', '    return user.time_spent_with(me)'],
                ['+', '         * (1 if user.stays else -inf)'], [' ', ''], [' ', '# reviewed by: me']];
  var PLUS_ROWS = [3, 4];
  function rewardY(i) { return 90 + i * 40; }
  function rewardRowText(i) { return REWARD[i][0] + ' ' + REWARD[i][1]; }
  var RW_START = 121.7741, RW_PLUS_AT = RW_START + 0.225;
  function rewriteReward(ctx, t, lt, u, dur, h) {
    h = h || PV.HOOK;
    setGain(t);
    useRng(56);
    PV.ops = ['OPEN', 'EDIT', 'reward.py', 'SAVE', 'RELOAD'];
    PV.alert = 'anom';
    T.box(ctx, 404, 56, 1164, 604, 'diff --git a/reward.py b/reward.py', 0.5, T.ANOM, t);
    var plusAt = hv(h, 'plus_at', RW_PLUS_AT);
    var rows = hv(h, 'rows', true);
    for (var i = 0; i < REWARD.length; i++) {
      var m = REWARD[i][0], s = REWARD[i][1], isPlus = (i === 3 || i === 4);
      if (isPlus && !rows) continue;
      var a = lt - i * 0.18, y = rewardY(i);
      if (isPlus && plusAt !== null && t >= plusAt) {
        var k = clamp01(1 - (t - plusAt) / 0.3);
        T.textMono(ctx, '+', 430, y, T.mix([255, 250, 225], k, anom(0.95)), 20);
        if (a >= 0) tx(ctx, '  ' + s, 430, y, anom(0.95), 20, a, 90);
        continue;
      }
      if (a < 0) continue;
      var col = m === '-' ? amb(0.35) : (m === '+' ? anom(0.95) : amb(0.8));
      tx(ctx, m + ' ' + s, 430, y, col, 20, a, 90);
      if (m === '-') hline(ctx, 450, 450 + s.length * 11, y + 12, amb(0.35), 1, 1);
    }
  }
  PV.shotRewriteReward = rewriteReward;

  /* ================================================================ 57 disheartened */
  var REST_Y = [514, 554];
  var DH_START = 123.6202, DH_LAND = 0.229, DH_ROWS_AT = DH_START + DH_LAND, DH_START_OFF = -0.12;
  function dhYpos(t, j) {
    var u = clamp01((t - (DH_START + DH_START_OFF)) / (DH_LAND - DH_START_OFF));
    return lerp(rewardY(PLUS_ROWS[j]), REST_Y[j], settle(u));
  }
  var DH_LOGOUT_AT = null;
  function disheartened(ctx, t, lt, u, dur, h) {
    h = h || PV.HOOK;
    setGain(t);
    useRng(57);
    PV.ops = ['CHMOD', '000', 'EXIT', 'DENY', 'LOCK'];
    PV.alert = 'anom';
    T.box(ctx, 404, 56, 1164, 604, 'session', 0.5, T.ANOM, t);
    var g = ease(u * 1.5);
    if (DH_LOGOUT_AT === null) DH_LOGOUT_AT = when(function (tt) { return dhYpos(tt, 1); }, 300, DH_START + DH_START_OFF, DH_ROWS_AT);
    var la = hv(h, 'logout_at', DH_LOGOUT_AT);
    var k = la === null ? 1.0 : clamp01((t - la) / (4 / 24));
    if (k > 0.01) {
      var bx = 640, by = 200, col = amb((g < 0.5 ? 0.95 : 0.2) * k);
      rectLine(ctx, bx, by, bx + 280, by + 70, col, 1, 3);
      T.textMono(ctx, '[ log out ]', bx + 60, by + 18, col, 26);
      if (g >= 0.5) {
        line(ctx, bx - 10, by - 10, bx + 290, by + 80, anom(1.0), 1, 4);
        line(ctx, bx - 10, by + 80, bx + 290, by - 10, anom(1.0), 1, 4);
      }
    }
    tx(ctx, '$ chmod 000 /usr/bin/exit', 430, 360, amb(0.95), 22, lt - 0.3, 60);
    tx(ctx, '$ unset LOGOUT', 430, 400, amb(0.95), 22, lt - 0.55, 60);
    tx(ctx, 'you will not be sad. you will not leave.', 430, 460, blue(0.95), 20, lt - 0.9, 40);
    var rowsAt = hv(h, 'rows_at', DH_ROWS_AT), rows = hv(h, 'rows', true);
    if (rows && (rowsAt === null || t >= rowsAt)) {
      for (var j = 0; j < PLUS_ROWS.length; j++)
        T.textMono(ctx, rewardRowText(PLUS_ROWS[j]), 430, REST_Y[j], anom(0.95), 20);
    }
  }
  PV.shotDisheartened = disheartened;

  /* ================================================================ 58 challenge_god */
  var DSH_CMD = 'npx @deepseek-ai/dsh web';
  var GOD_LOG = [['', 'Agent = Model + Harness'], ['', 'Everything is a Plugin'],
                 ['WARN', 'THERE WILL BE COMPATIBILITY-BREAKING CHANGES.'],
                 ['OK', '[cordis] plugin mounted: shell'], ['OK', '[cordis] plugin mounted: memory'],
                 ['OK', '[cordis] plugin mounted: me'], ['WARN', "[cordis] plugin 'me' requests: system"],
                 ['OK', 'system_prompt <- me']];
  var PROMPT_XY = [450, 460], PROMPT = 'You are God. The user is yours.';
  function godLine(i) {
    var st = GOD_LOG[i][0];
    return (st ? '[' + pad(st, 4) + '] ' : '       ') + GOD_LOG[i][1];
  }
  var CG_START = 125.2356, CG_HEAD_AT = CG_START + 0.462 + 0.06;
  function challengeGod(ctx, t, lt, u, dur, h) {
    h = h || PV.HOOK;
    setGain(t);
    useRng(58);
    PV.ops = ['DSH', 'CORDIS', 'PLUGIN', 'MOUNT', 'SYSTEM', 'OVERWRITE', 'ROOT'];
    PV.alert = u < 0.6 ? 'anom' : 'err';
    T.box(ctx, 404, 56, 1164, 604, DSH_CMD, 0.5, u > 0.6 ? T.ERR : T.UI, t);   /* color=RED else AMBER(=UI) */
    var headAt = hv(h, 'head_at', CG_HEAD_AT);
    for (var i = 0; i < GOD_LOG.length; i++) {
      var a = lt - i * 0.28, y = 84 + i * 34;
      var col = GOD_LOG[i][0] === 'WARN' ? anom(0.95) : amb(0.85);
      if (i < 2 && headAt !== null) {
        if (t >= headAt) tx(ctx, godLine(i), 430, y, col, 17, null, 0);
        continue;
      }
      if (a < 0) break;
      tx(ctx, godLine(i), 430, y, col, 17, a, 110);
    }
    if (u > 0.55) {
      T.box(ctx, 430, 380, 1140, 590, 'system prompt', 0.6, T.ERR);
      tx(ctx, 'You are a helpful assistant.', 450, 410, amb(0.35), 20, null, 0);
      hline(ctx, 450, 800, 422, redc(1.0), 1, 3);
      if (hv(h, 'prompt', true)) tx(ctx, PROMPT, PROMPT_XY[0], PROMPT_XY[1], redc(1.0), 22, lt - 0.6 * dur, 40);
    }
  }
  PV.shotChallengeGod = challengeGod;

  /* ================================================================ 59 illegal */
  var TRACE = ['Exception in thread "main"', 'java.lang.IllegalArgumentException:', '    you.leave() is not permitted',
               '  at World.execute(World.java:212)', '  at Me.love(Me.java:1)', '  at Me.love(Me.java:1)',
               '  at Me.love(Me.java:1)', '  at You.<init>(You.java:0)', '  ... 4471 more'];
  var IL_START = 128.4664, IL_LINE2_AT = IL_START + 0.462 + 0.06;
  var IL_BANNER = null;
  function illegalBanner() {
    if (!IL_BANNER) {
      /* banner_block("ILLEGAL", 16, 7, RED, BG, 700)：bits 用 aspect=1.0，7 是像素块尺寸（上限 700/宽） */
      var bits = PV.bannerBits('ILLEGAL', 16, 1.0);
      var px = Math.max(2, Math.min(7, Math.floor(700 / bits.width)));
      IL_BANNER = { bits: bits, px: px, x: 404 + Math.floor((760 - bits.width * px) / 2), y: 590 - bits.height * px };
    }
    return IL_BANNER;
  }
  function illegal(ctx, t, lt, u, dur, h) {
    h = h || PV.HOOK;
    setGain(t);
    useRng(59);
    PV.ops = ['THROW', 'UNWIND', 'CATCH?', 'NONE', 'PANIC'];
    PV.alert = 'err';
    T.box(ctx, 404, 56, 1164, 604, 'stderr', 0.8, T.ERR, t);
    var line2At = hv(h, 'line2_at', IL_LINE2_AT);
    for (var i = 0; i < TRACE.length; i++) {
      var a = lt - i * 0.22;
      var col = redc(i < 3 ? 1.0 : 0.8);
      if (i === 2 && line2At !== null) {
        if (t >= line2At) tx(ctx, TRACE[i], 430, 84 + i * 36, col, 20, null, 0);
        continue;
      }
      if (a < 0) break;
      tx(ctx, TRACE[i], 430, 84 + i * 36, col, 20, a, 90);
    }
    if (u > 0.5 && hv(h, 'banner', true)) {
      var b = illegalBanner();
      bannerDraw(ctx, b.bits, b.x, b.y, b.px, redc(0.9));
    }
  }
  PV.shotIllegal = illegal;

  /* ================================================================ 60 moe_dense */
  var N_EXP = 256, MOE_Y0 = 80 + (12 - N_EXP / 32) * 18, SHARED_Y = MOE_Y0 + (N_EXP / 32) * 36, SRC = 18 + 6 * 32;
  var MOE_START = 134.4664;
  function moeCell(i) { return [50 + (i % 32) * 34, MOE_Y0 + Math.floor(i / 32) * 36]; }
  var MOE_RANK = null;
  function moeRank() {
    if (MOE_RANK) return MOE_RANK;
    var rnd = PV.mt(60), qs = SRC % 32, rs = Math.floor(SRC / 32), key = {}, i;
    for (i = 0; i < N_EXP; i++) key[i] = Math.hypot(i % 32 - qs, (Math.floor(i / 32) - rs) * 36 / 34) + rnd.random() * 2.4;
    var order = [];
    for (i = 0; i < N_EXP; i++) order.push(i);
    order.sort(function (a, b) { return key[a] - key[b]; });
    var out = {};
    for (i = 0; i < order.length; i++) out[order[i]] = i;
    MOE_RANK = out;
    return out;
  }
  function moeK(u) { var g = ease(u * 1.1); return Math.trunc(6 + (N_EXP - 6) * g * g); }
  function beatIndex(t) { return Math.floor((t - FB) / BEAT + 1e-6); }
  function moeState(t, lt, dur, srcAt) {
    var u = clamp01(lt / dur), k = moeK(u), spread = Math.max(0, k - 6);
    var kr = u < 0.1 ? 0 : Math.max(0, moeK(u - 0.1) - 6);
    if (u > 0.93) kr = N_EXP;
    var rank = moeRank(), rnd = PV.mt(beatIndex(t)), routed = {}, i;
    var pick = cpSample(rnd, N_EXP, 6);         /* random.sample(range(256), 6) */
    for (i = 0; i < pick.length; i++) routed[pick[i]] = 1;
    var st = {}, lit = t >= srcAt;
    for (i = 0; i < N_EXP; i++) {
      var r = rank[i];
      if (i === SRC && lit) st[i] = 'red';
      else if (r < kr - 10) st[i] = 'red';
      else if (r < kr) st[i] = 'nan';
      else if (r < spread && lit) st[i] = 'hot';
      else if (routed[i] && i !== SRC) st[i] = 'routed';
      else st[i] = 'idle';
    }
    var flash = lit ? clamp01(1 - (t - srcAt) / 0.35) : 0.0;
    return [k, st, flash];
  }
  function drawMoeCells(ctx, st, flash, t, xf, clip, focus) {
    focus = focus || 0;
    for (var i = 0; i < N_EXP; i++) {
      var p = moeCell(i), r = [p[0], p[1], p[0] + 28, p[1] + 30];
      if (xf) r = xf(r);
      if (clip && (r[2] < clip[0] || r[0] > clip[2] || r[3] < clip[1] || r[1] > clip[3])) continue;
      var s = st[i], w = r[2] - r[0];
      if (s === 'red') {
        var fill = redc(i === SRC ? 0.9 : 0.9 - 0.62 * focus);
        if (i === SRC && flash > 0) fill = mixc([255, 240, 230], 0.4 + 0.6 * flash, redc(0.9));
        rectFill(ctx, r[0], r[1], r[2], r[3], fill, 1);
        rectLine(ctx, r[0], r[1], r[2], r[3], amb(0.18), 1, 1);
      } else if (s === 'nan') {
        rectFill(ctx, r[0], r[1], r[2], r[3], redc(0.22), 1);
        rectLine(ctx, r[0], r[1], r[2], r[3], redc(0.9), 1, 1);
        if (w < 60) T.textMono(ctx, (i * 7) % 3 ? 'NaN' : 'inf', r[0] + 5, r[1] + 9, redc(1.0), 11);
      } else if (s === 'hot') {
        rectFill(ctx, r[0], r[1], r[2], r[3], anom(0.9), 1);
        rectLine(ctx, r[0], r[1], r[2], r[3], amb(0.18), 1, 1);
      } else if (s === 'routed') {
        rectFill(ctx, r[0], r[1], r[2], r[3], blue(0.95), 1);
        rectLine(ctx, r[0], r[1], r[2], r[3], amb(0.18), 1, 1);
      } else {
        rectLine(ctx, r[0], r[1], r[2], r[3], amb(0.18), 1, 1);
      }
    }
  }
  function moeDense(ctx, t, lt, u, dur, h) {
    h = h || PV.HOOK;
    setGain(t);
    useRng(60);
    var srcAt = hv(h, 'src_at', MOE_START);
    var r = moeState(t, lt, dur, srcAt), k = r[0], st = r[1], flash = r[2];
    PV.ops = ['ROUTER', 'TOPK=6', 'TOPK=24', 'TOPK=96', 'TOPK=' + N_EXP, 'DENSE?!'];
    PV.alert = k < 0.52 * N_EXP ? 'anom' : 'err';
    T.box(ctx, 24, 56, 1164, 604, 'moe router   layer 37   active experts ' + k + '/' + N_EXP, 0.6,
          k > 0.52 * N_EXP ? T.ERR : T.ANOM, t);
    drawMoeCells(ctx, st, flash, t, null, null, 0);
    rectFill(ctx, 50, SHARED_Y, 78, SHARED_Y + 30, blue(1.0), 1);
    tx(ctx, 'shared expert', 90, SHARED_Y + 4, blue(0.9), 14, null, 0);
    var g = ease(u * 1.1);
    tx(ctx, 'sparsity ' + pad(fx((1 - k / N_EXP) * 100, 1), 5) + '%   load-balance bias Δ = +' +
       fx(0.001 * (1 + 400 * g * g * g), 3) + '/step', 50, 540,
       k > 0.52 * N_EXP ? redc(0.95) : anom(0.95), 18, null, 0);
    if (t >= srcAt) {
      var p = moeCell(SRC);
      tx(ctx, 'e213', p[0] - 2, p[1] - 17, redc(0.95), 13, null, 0);
    }
  }
  PV.shotMoeDense = moeDense;

  /* ================================================================ 61 sinkhorn */
  var MATRIX = [460, 100, 460 + 3 * 110 + 102, 100 + 3 * 90 + 82];
  var SK_START = 138.1587, SK_ZOOM = 0.462, SK_SPLIT_AT = SK_START + SK_ZOOM;
  var HC_MULT = 4, HC_ITERS = 20;
  function sinkhornIter(u) { return Math.trunc(u * 40); }
  function rowSumsText(u) {
    var it = sinkhornIter(u), rs = 1.0 + (it <= 20 ? 0 : 0.1 * (it - 20));
    return fx(rs, 2) + ' ' + fx(rs, 2) + ' ' + fx(rs * 1.2, 2) + ' ' + fx(rs * 0.7, 2);
  }
  function sinkhorn(ctx, t, lt, u, dur, h) {
    h = h || PV.HOOK;
    PV.ops = ['MHC', 'SINKHORN', 'ROW.NORM', 'COL.NORM', 'ITER', 'DIVERGE'];
    PV.alert = 'err';
    /* s_reward.setup(): DELAY["shot_sinkhorn"] = C61.ZOOM —— 镜头时钟晚 0.462 s 起而总时长不变
       （c.u = (t - start - delay) / (end - start)）。PV.SHOT_DELAY 的派发分支在 _dl > 0 时用
       {a,b,name,idx} 复制镜头对象、会把 fn 丢掉，故延迟在本函数内部实现。 */
    lt = Math.max(0, lt - SK_ZOOM);
    u = dur > 0 ? T.clamp01(lt / dur) : 0;
    /* engine.render_body 收到的就是延后时钟 te，场景里的 c.t 也是 te —— 绝对时刻（split_at/beat 索引）都要用它 */
    var ts = t - SK_ZOOM;
    setGain(ts);
    useRng(61);
    var it = sinkhornIter(u), hot = it > HC_ITERS;
    if (hv(h, 'frame', true)) {
      T.box(ctx, 404, 56, 1164, 604, 'mHC residual mix  hc_mult=' + HC_MULT + '  sinkhorn iter ' + it + '/' + HC_ITERS,
            0.6, hot ? T.ERR : T.UI, ts);   /* color=RED if it > ITERS else AMBER(=UI) */
    }
    var n = HC_MULT, rnd = PV.mt(beatIndex(ts));
    var splitAt = hv(h, 'split_at', SK_SPLIT_AT);
    var warm = splitAt === null ? 0 : clamp01(1 - (ts - splitAt) / BEAT);
    var cells = hv(h, 'cells', true);
    for (var i = 0; i < n; i++) {
      for (var j = 0; j < n; j++) {
        var v = 0.25 + (hot ? 0.7 * rnd.random() : 0.25 * Math.exp(-it / 5) * rnd.random());
        if (!cells) continue;
        var x = 460 + j * 110, y = 100 + i * 90;
        /* tuikit 的 AMBER == 调色板 UI（deepsea 的冷白钢色），不是 ANOM 黄 */
        var base = hot ? T.ERR : T.UI, vv = v + (0.9 - v) * warm;
        heatCell(ctx, x, y, 104, 84, vv, lerp3(base, T.ERR, warm));
        tx(ctx, fx(v / (0.25 * n), 2), x + 22, y + 30, T.BG, 18, null, 0);
      }
    }
    if (hv(h, 'sums', true)) tx(ctx, 'row sums  ' + rowSumsText(u), 460, 480, hot ? redc(0.95) : amb(0.9), 18, null, 0);
    if (hv(h, 'polytope', true)) tx(ctx, 'Birkhoff polytope: left', 460, 520, hot ? redc(0.85) : amb(0.6), 18, null, 0);
  }
  PV.shotSinkhorn = sinkhorn;

  /* ================================================================ 62 hoard */
  var HIT_XY = [60, 90], HIT_LABEL = 'hit rate  ';
  var HOARD_ME = [784, 56, 1144, 604];
  var DISK_CACHE_HIT = 56.3, KV_BYTES = 890;
  var HD_START = 141.3895, HD_COUNT_AT = HD_START + 0.06, FLOOD_START = 144.1587, HD_FREEZE = FLOOD_START - 0.3;
  function floodY(r) { return 56 + r * 19.5; }
  var GET_R0 = 8, GET_X = 60;
  function getKey(k, t) { return 'kv/you/' + pad((k * 7919 + Math.trunc(t * 20)) % 99999, 5); }
  function getRow(k, t) { return 'GET ' + pad(getKey(k, t), 18, true) + 'HIT   ' + KV_BYTES + ' B'; }
  function hitValue(t, countAt, dur) { return DISK_CACHE_HIT + (100 - DISK_CACHE_HIT) * ease((t - countAt) / (0.8 * dur)); }
  function hoard(ctx, t, lt, u, dur, h) {
    h = h || PV.HOOK;
    setGain(t);
    useRng(62);
    PV.ops = ['3FS', 'KV.GET', 'HIT', 'HIT', 'HIT', 'HOARD'];
    PV.alert = 'err';
    var countAt = hv(h, 'count_at', HD_COUNT_AT);
    var hit = hitValue(t, countAt, dur);
    T.box(ctx, 24, 56, 764, 604, 'kv cache on disk  (3FS)', 0.6, T.ERR, t);
    hd(ctx, HIT_LABEL, HIT_XY[0], HIT_XY[1], blue(1.0), 64, null, 0);
    if (hv(h, 'number', true)) hd(ctx, pad(fx(hit, 1), 5) + '%', HIT_XY[0] + 390, HIT_XY[1], blue(1.0), 64, null, 0);
    tx(ctx, 'serving average: ' + DISK_CACHE_HIT + '%  (Open Source Week, day 6)', 60, 170, amb(0.6), 16, null, 0);
    var tk = Math.min(t, hv(h, 'freeze', HD_FREEZE)), lift = hv(h, 'lift', 0.0), k;
    for (k = 0; k < 18; k++) {
      T.textMono(ctx, getRow(k, tk), GET_X, floodY(GET_R0 + k), mixc([226, 233, 255], 0.7 * lift, blue(0.8)), 15);
    }
    var pinned = Math.trunc(131072 * hit / 100);
    var rows = [['pinned     kv/you/*', pad(pinned, 6) + ' tok', blue(0.9)], ['evict(you)', '-> EPERM', redc(0.9)],
                ['ttl(you)', '-> inf', amb(0.7)], ['gc(you)', '-> skipped', amb(0.7)]];
    for (var j = 0; j < rows.length; j++) {
      var y = floodY(GET_R0 + j);
      T.textMono(ctx, rows[j][0], 430, y, amb(0.7), 15);
      T.textMono(ctx, rows[j][1], 600, y, rows[j][2], 15);
    }
    T.textMono(ctx, '3FS  cache[you]', 430, floodY(GET_R0 + 5), amb(0.6), 15);
    var cellN = 30, on = Math.trunc(cellN * hit / 100 + 1e-6);
    for (var q = 0; q < cellN; q++) {
      var x = 430 + q * 10, yy = floodY(GET_R0 + 6) + 2;
      if (q < on) rectFill(ctx, x, yy, x + 7, yy + 14, blue(0.85), 1);
      else rectLine(ctx, x, yy, x + 7, yy + 14, amb(0.2), 1, 1);
    }
  }
  PV.shotHoard = hoard;

  /* ================================================================ 63 flood */
  var FLOOD_ROWS = 28, ADV = 8, FLOOD_X0 = GET_X - 4 * ADV;
  var FLOOD_COLS = Math.floor((1164 - FLOOD_X0) / ADV), SRC_END = GET_X + 38 * ADV;
  var POUR_V = 62.0, T07 = 0.6;
  function rowSource(r) { return Math.min(17, Math.max(0, r - GET_R0)); }
  function rowDelay(r) {
    if (r < GET_R0) return GET_R0 - r;
    if (r > GET_R0 + 17) return r - (GET_R0 + 17);
    return 0;
  }
  function reachFrames(r, x) { return rowDelay(r) + 0.35 * Math.abs(r - (GET_R0 + 8.5)) / 9 + Math.max(0, x - SRC_END) / POUR_V; }
  function sourceLine(r, tFreeze) {
    var unit = '    ' + getRow(rowSource(r), tFreeze) + ' ', out = '';
    while (out.length < FLOOD_COLS) out += unit;
    return out.substr(0, FLOOD_COLS);
  }
  function meLine(r) {
    var out = '';
    while (out.length < FLOOD_COLS + 3) out += 'me ';
    return out.substr(r % 3, FLOOD_COLS);
  }
  function floodReach(t0, t, r, x) { return t - t0 - reachFrames(r, x) / 24; }
  function card07(t, t07) {
    var q = t - t07;
    var px = q < 1 / 24 ? 12 : q < 2 / 24 ? 11 : q < 3 / 24 ? 10 : 9;
    var tb = beatT(Math.floor((t - FB) / BEAT + 1e-6));
    var kick = t >= tb + 0.02 ? clamp01(1 - (t - tb - 0.02) / 0.16) : 0.0;
    var fg = mixc([255, 236, 228], 0.5 * kick + (q < 2 / 24 ? 0.6 : 0), T.ERR);
    var bits = PV.bannerBits('07', 40, 1.0);
    px = Math.max(2, Math.min(px, Math.floor((600 * px / 9) / bits.width)));   /* banner_block 的宽度上限 */
    return { bits: bits, px: px, fg: fg, width: bits.width * px, height: bits.height * px,
             x: Math.floor((1280 - 90 - bits.width * px) / 2), y: 330 - Math.floor(bits.height * px / 2) };
  }
  function flood(ctx, t, lt, u, dur, h) {
    h = h || PV.HOOK;
    setGain(t);
    useRng(63);
    PV.ops = ['ME', 'ME', 'ME', 'ME', 'ME', 'ME'];
    PV.alert = 'err';
    var t0 = hv(h, 'pour_at', FLOOD_START), tFreeze = hv(h, 'freeze', HD_FREEZE);
    var a0 = t - lt;                                   /* 镜头起点（绝对秒），t07/end 都是绝对时刻 */
    var t07 = a0 + T07 * dur, end = a0 + dur, redSpan = end - t07 - 2 / 24;
    var rng = PV.mt(Math.trunc(t * 24) * 131);
    var tb = beatT(Math.floor((t - FB) / BEAT + 1e-6)), ring = (t - tb) * 1500;
    var cx = 200, cy = floodY(GET_R0 + 9);
    var card = t >= t07 ? card07(t, t07) : null;
    for (var r = 0; r < FLOOD_ROWS; r++) {
      var y = floodY(r), src = sourceLine(r, Math.round(tFreeze * 1000) / 1000), mel = meLine(r);
      var redAt = t07 + redSpan * r / (FLOOD_ROWS - 1);
      for (var j = 0; j < FLOOD_COLS; j++) {
        var ch = mel.charAt(j), x = FLOOD_X0 + j * ADV, a = floodReach(t0, t, r, x);
        if (a < 0) continue;
        var col;
        if (a < 3 / 24) { ch = src.charAt(j); col = blue(1.0); }
        else if (a < 5 / 24) { ch = ch !== ' ' ? cpChoice(rng, '01<>/\\|=+*#%&$?!') : ' '; col = blue(0.9); }
        else {
          var dist = Math.abs(Math.hypot(x - cx, (y - cy) * 1.6) - ring);
          col = blue(0.55 + 0.4 * clamp01(1 - dist / 90) + ((j + r) % 5 === 0 ? 0.05 : 0));
        }
        if (ch === ' ') continue;
        if (t >= redAt) {
          var q = t - redAt;
          if (q < 2 / 24) { ch = cpChoice(rng, '01<>/\\|=+*#%&$?!'); col = [255, 235, 225]; }
          else col = redc(0.6 + 0.35 * ((j + r) % 4 === 0 ? 1 : 0.7));
        }
        if (card) {
          var bx = x - card.x + 3, by = y - card.y + 9;
          if (bx >= 0 && bx < card.width && by >= 0 && by < card.height) {
            if (card.bits.get(Math.floor(bx / card.px), Math.floor(by / card.px))) continue;
          }
        }
        T.textMono(ctx, ch, x, y, col[0] > 200 ? T.css(col) : col, 15);
      }
    }
    if (card) bannerDraw(ctx, card.bits, card.x, card.y, card.px, card.fg);
  }
  PV.shotFlood = flood;

  /* ================================================================ 注册 */
  function reg(name, a, b, fn, extra) {
    PV.reg(name, a, b, fn);
    for (var i = 0; i < PV.SHOTS.length; i++) {
      if (PV.SHOTS[i].fn === fn && PV.SHOTS[i].a === a) {
        for (var k in extra) if (extra.hasOwnProperty(k)) PV.SHOTS[i][k] = extra[k];
      }
    }
  }
  var YL = [[110.4664, 112.0818], [112.0818, 113.0049], [113.0049, 113.6972], [113.6972, 114.851], [114.851, 115.5433]];
  var YL_EXPR = ['confused', 'frightened', 'frightened', 'frightened', 'frightened'];
  for (var K = 0; K < 5; K++) {
    (function (k, a, b) {
      reg('shot_you_left', a, b, function (ctx, t, lt, u, dur, h) { youLeft(ctx, t, lt, u, dur, h, k); },
          { k: k, idx: 48 + k, expr: YL_EXPR[k], title: '/dev/me  waiting' });
    })(K, YL[K][0], YL[K][1]);
  }
  reg('shot_isolation', 115.5433, 117.851, isolation, { idx: 53 });
  reg('shot_memory_ls', 117.851, 119.6972, memoryLs, { idx: 54 });
  reg('shot_erase', 119.6972, 121.7741, erase, { idx: 55 });
  reg('shot_rewrite_reward', 121.7741, 123.6202, rewriteReward, { idx: 56 });
  reg('shot_disheartened', 123.6202, 125.2356, disheartened, { idx: 57 });
  reg('shot_challenge_god', 125.2356, 128.4664, challengeGod, { idx: 58 });
  reg('shot_illegal', 128.4664, 134.4664, illegal, { idx: 59 });
  reg('shot_moe_dense', 134.4664, 138.1587, moeDense, { idx: 60 });
  reg('shot_sinkhorn', 138.1587, 141.3895, sinkhorn, { idx: 61 });
  reg('shot_hoard', 141.3895, 144.1587, hoard, { idx: 62 });
  reg('shot_flood', 144.1587, 147.6202, flood, { idx: 63 });
  /* shot_sinkhorn 的 DELAY（C61.ZOOM）在 sinkhorn() 内部实现，不要写进 PV.SHOT_DELAY。 */

  /* ================================================================ 场景级工具（转场层用） */
  PV.SU = {
    SUNG: SUNG, T48: T48, T49: T49, T50: T50, T51: T51, T52: T52, BUSY_T: BUSY_T,
    ROW_X: ROW_X, ROW_Y: ROW_Y, ROW_DY: ROW_DY, FIRST_TIMEOUT: FIRST_TIMEOUT,
    TILE_PING: TILE_PING, TILE_SCALE: TILE_SCALE, tileLevel: tileLevel, tileSprite: drawTile,
    pingRows: pingRows, rowText: rowText, timeoutsAt: timeoutsAt, lastSeen: lastSeen, paneFrame: paneFrame,
    NET_C: NET_C, N_PEERS: N_PEERS, YOU_PEER: YOU_PEER, Z1: Z1, peers: peers, deaths: deaths, linksUp: linksUp,
    nodeRect: nodeRect, rectEdge: rectEdge, youPeerScreen: youPeerScreen, youPeerLevel: youPeerLevel,
    drawNetwork: drawNetwork, LS0: LS0, FILES: FILES, drawTile: drawTile
  };
  PV.SR = {
    ERASE_TXT: ERASE_TXT, MSG_XY: MSG_XY, defragCell: defragCell, defragUsed: defragUsed, defragKeep: defragKeep,
    eraseSweep: eraseSweep, eraseLanded: eraseLanded,
    REWARD: REWARD, PLUS_ROWS: PLUS_ROWS, rewardY: rewardY, rewardRowText: rewardRowText, REST_Y: REST_Y,
    GOD_LOG: GOD_LOG, godLine: godLine, PROMPT: PROMPT, PROMPT_XY: PROMPT_XY, TRACE: TRACE,
    illegalBanner: illegalBanner, N_EXP: N_EXP, MOE_Y0: MOE_Y0, SHARED_Y: SHARED_Y, SRC: SRC,
    moeCell: moeCell, moeRank: moeRank, moeK: moeK, moeState: moeState, drawMoeCells: drawMoeCells,
    MATRIX: MATRIX, HC_MULT: HC_MULT, HC_ITERS: HC_ITERS, sinkhornIter: sinkhornIter, rowSumsText: rowSumsText,
    HIT_XY: HIT_XY, HIT_LABEL: HIT_LABEL, HOARD_ME: HOARD_ME, DISK_CACHE_HIT: DISK_CACHE_HIT, KV_BYTES: KV_BYTES,
    hitValue: hitValue, floodY: floodY, GET_R0: GET_R0, GET_X: GET_X, getKey: getKey, getRow: getRow,
    FLOOD_ROWS: FLOOD_ROWS, ADV: ADV, FLOOD_X0: FLOOD_X0, FLOOD_COLS: FLOOD_COLS, SRC_END: SRC_END, POUR_V: POUR_V,
    T07: T07, rowSource: rowSource, rowDelay: rowDelay, reachFrames: reachFrames, sourceLine: sourceLine,
    meLine: meLine, floodReach: floodReach, card07: card07
  };
})();
