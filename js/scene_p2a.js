/* scene_p2a.js —— 03 RLHF (58.543-73.543) + 04 DEPLOY (73.543-103.082) + 05 USER_LEFT 开头 (103.082-110.466)
   Python 权威（照它逐行移植）:
     continuity_full_v2/s_chorus1.py + full/sec_chorus1.py   -> 镜头 26-33（approved 渲染器）
     continuity_full_v2/scenes_deploy.py                     -> 镜头 34-45
     continuity_full_v2/scenes_userleft.py                   -> 镜头 46-47
   本文件只画「场景自己画在 c.d / c.img 上的东西」；她 / dsh web 窗口（me_pane）由 pane.js 负责。 */
(function () {
  'use strict';
  var PV = window.PV, T = PV.tui;

  /* ================================ 基础工具（对应 tk.* / engine.pulse） ================================ */
  function amb(lv) { return T.css(T.mix(T.UI, lv)); }
  function anom(lv) { return T.css(T.mix(T.ANOM, lv)); }
  function blue(lv) { return T.css(T.mix(T.ME_TEXT, lv)); }
  function red(lv) { return T.css(T.mix(T.ERR, lv)); }
  function heatCell(ctx, x, y, w, h, v, col) {
    v = T.clamp01(v);
    T.fill(ctx, x, y, x + w - 2, y + h - 2, T.mix(col || T.UI, 0.06 + 0.94 * v), 1);
  }
  function box(ctx, x0, y0, x1, y1, title, lv, col, spin) {
    T.box(ctx, x0, y0, x1, y1, title, lv === undefined ? 0.5 : lv, col || T.UI, spin);
  }
  function pil(ctx, s, x, y, col, size, bold) { T.textPIL(ctx, s, x, y, col, size, 'left', bold); }
  function typed(ctx, s, x, y, col, size, age, rng, rate, bold) {
    T.textPIL(ctx, T.decode(s, age, rng, rate === undefined ? 45 : rate, 0.12, 0), x, y, col, size, 'left', bold);
  }
  function line(ctx, x0, y0, x1, y1, col, lw) {
    lw = lw || 1;
    var o = (lw % 2) ? 0.5 : 0;
    ctx.save();
    ctx.strokeStyle = col; ctx.lineWidth = lw;
    ctx.beginPath(); ctx.moveTo(x0 + o, y0 + o); ctx.lineTo(x1 + o, y1 + o); ctx.stroke();
    ctx.restore();
  }
  function pt(ctx, x, y, col, a) { T.fill(ctx, x, y, x + 1, y + 1, col, a === undefined ? 1 : a); }
  function pulse(t) { return PV.pulse ? PV.pulse(t) : 0; }
  function beatIndex(t) { return Math.floor((t - 0.1587) / (60 / 130) + 1e-6); }
  /* tk.dot_chart 的忠实移植：返回最后一个点 [x, y] */
  function dotChart(ctx, x, y, w, h, fn, progress, col, sx, sy, axis, clipTop) {
    sx = sx || 5; sy = sy || 5;
    if (axis === undefined) axis = true;
    if (clipTop === undefined) clipTop = true;
    var cols = Math.floor(w / sx), rows = Math.floor(h / sy), i, r, prev = null, last = null;
    if (axis) {
      for (i = 0; i < cols; i += 2) pt(ctx, x + i * sx, y + h, T.UI, 0.28);
      for (r = 0; r < rows; r += 3) pt(ctx, x - 4, y + r * sy, T.UI, 0.28);
    }
    for (i = 0; i < cols; i++) {
      var u = i / (cols - 1);
      if (u > progress) break;
      var v = fn(u);
      if (clipTop) v = Math.min(1.0, v);
      r = Math.round((1 - Math.max(0, v)) * (rows - 1));
      var lo = (prev === null) ? r : Math.min(prev, r), hi = (prev === null) ? r : Math.max(prev, r);
      for (var rr = lo; rr <= hi; rr++) pt(ctx, x + i * sx, y + rr * sy, col, 1);
      prev = r; last = [x + i * sx, y + r * sy];
    }
    return last;
  }

  /* ================================ 她的立绘：halfblock / glyph_grid / conv_maps 的替代 ================================
     素材只有 avatars/complete.png（120x120 RGB 无 alpha）；Python 用的是 H3 帧缓存的她。 */
  var HER = null, _cells = {};
  if (PV.loadImage) { try { PV.loadImage('avatars/complete.png', function (im) { HER = im; }); } catch (e) {} }
  var CROPS = { full: [0, 0, 1, 1], upper: [0.10, 0.00, 0.86, 0.62], face: [0.20, 0.03, 0.62, 0.52],
                bust: [0.06, 0.00, 0.94, 0.72], fig: [0.30, 0.00, 0.72, 1.00] };
  function herCells(cols, rows, crop) {
    if (!HER || cols < 1 || rows < 1) return null;
    var key = cols + '|' + rows + '|' + crop;
    if (_cells[key]) return _cells[key];
    var c = CROPS[crop] || CROPS.full, cv = PV.newCanvas(cols, rows), g = cv.getContext('2d');
    g.drawImage(HER, c[0] * HER.width, c[1] * HER.height, (c[2] - c[0]) * HER.width, (c[3] - c[1]) * HER.height,
                0, 0, cols, rows);
    _cells[key] = g.getImageData(0, 0, cols, rows).data;
    return _cells[key];
  }
  function lumGrid(cols, rows, crop) {
    var d = herCells(cols, rows, crop);
    if (!d) return null;
    var L = new Float32Array(cols * rows);
    for (var k = 0; k < cols * rows; k++) {
      var i = k * 4;
      L[k] = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    }
    return L;
  }
  function lumAt(d, i) { return (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255; }
  function herSize(maxW, maxH, px, crop) {
    var c = CROPS[crop] || CROPS.full;
    var asp = ((c[3] - c[1]) * 1.0) / ((c[2] - c[0]) * 1.0);
    var cols = Math.max(2, Math.floor(Math.min(maxW / px, (maxH / px) / asp)));
    var rows = Math.max(2, Math.round(cols * asp));
    rows -= rows % 2;
    return [cols, rows];
  }
  function colorize(l, lo, mid, hi) {
    l = T.clamp01(l);
    if (!mid) return [lo[0] + (hi[0] - lo[0]) * l, lo[1] + (hi[1] - lo[1]) * l, lo[2] + (hi[2] - lo[2]) * l];
    if (l < 0.5) return [lo[0] + (mid[0] - lo[0]) * l * 2, lo[1] + (mid[1] - lo[1]) * l * 2, lo[2] + (mid[2] - lo[2]) * l * 2];
    return [mid[0] + (hi[0] - mid[0]) * (l - 0.5) * 2, mid[1] + (hi[1] - mid[1]) * (l - 0.5) * 2,
            mid[2] + (hi[2] - mid[2]) * (l - 0.5) * 2];
  }
  var TINT = { blue: [T.ME_LO, T.ME_MID, T.ME_HI], amber: [T.BG, null, T.UI], red: [T.BG, null, T.ERR],
               anom: [T.BG, null, T.ANOM] };
  function tintCol(tint, l, d, i) {
    if (tint === 'color') return [d[i], d[i + 1], d[i + 2]];
    var tn = TINT[tint] || TINT.blue;
    return colorize(l, tn[0], tn[1], tn[2]);
  }
  function halfblock(ctx, sx, sy, maxW, maxH, px, crop, tint, alpha, revealRows) {
    var sz = herSize(maxW, maxH, px, crop), cols = sz[0], rows = sz[1];
    var d = herCells(cols, rows, crop);
    if (!d) return null;
    for (var r = 0; r < rows; r++) {
      if (revealRows !== undefined && r >= revealRows) break;
      for (var q = 0; q < cols; q++) {
        var i = (r * cols + q) * 4, l = lumAt(d, i);
        if (l < 0.16) continue;
        T.fill(ctx, sx + q * px, sy + r * px, sx + q * px + px - 1, sy + r * px + px - 1, tintCol(tint, l, d, i),
               alpha === undefined ? 1 : alpha);
      }
    }
    return [cols * px, rows * px];
  }
  var GRAMP = ' .:-=+*#%@';
  function glyphLines(cols, rows, crop, thr) {
    if (thr === undefined) thr = 0.20;
    var d = herCells(cols, rows, crop);
    if (!d) return null;
    var L = new Float32Array(cols * rows), out = [], q, r;
    for (r = 0; r < rows; r++) for (q = 0; q < cols; q++) L[r * cols + q] = lumAt(d, (r * cols + q) * 4);
    var BS = String.fromCharCode(92);
    for (r = 0; r < rows; r++) {
      var s = '';
      for (q = 0; q < cols; q++) {
        var v = L[r * cols + q];
        if (v < thr) { s += ' '; continue; }
        var xm = (q > 0 && q < cols - 1) ? L[r * cols + q + 1] - L[r * cols + q - 1] : 0;
        var ym = (r > 0 && r < rows - 1) ? L[(r + 1) * cols + q] - L[(r - 1) * cols + q] : 0;
        var mag = Math.sqrt(xm * xm + ym * ym) * 4;
        if (mag > 0.55) {
          var ang = (Math.atan2(ym, xm) * 180 / Math.PI + 180) % 180;
          s += (ang < 22.5 || ang >= 157.5) ? '|' : (ang < 67.5 ? '/' : (ang < 112.5 ? '-' : BS));
        } else s += GRAMP[Math.min(9, 1 + Math.floor(v * 9))];
      }
      out.push(s);
    }
    return out;
  }
  function tileFromLum(ctx, lum, cols, rows, x, y, px, tint, revealRows, alpha) {
    var tn = TINT[tint] || TINT.amber;
    for (var r = 0; r < rows; r++) {
      if (revealRows !== undefined && r >= revealRows) break;
      for (var q = 0; q < cols; q++) {
        var v = lum[r * cols + q];
        if (v <= 18) continue;
        var col = colorize(v / 255, tn[0], tn[1], tn[2]);
        T.fill(ctx, x + q * px, y + r * px, x + q * px + px - 1, y + r * px + px - 1, col, alpha === undefined ? 1 : alpha);
      }
    }
  }
  function autocontrast(L, cutoff) {
    var n = L.length, s = Float32Array.from(L), i;
    s.sort();
    var lo = s[Math.min(n - 1, Math.floor(n * cutoff))];
    var hi = s[Math.max(0, Math.min(n - 1, Math.ceil(n * (1 - cutoff)) - 1))];
    var out = new Float32Array(n);
    if (hi <= lo) { for (i = 0; i < n; i++) out[i] = L[i]; return out; }
    for (i = 0; i < n; i++) out[i] = Math.max(0, Math.min(255, (L[i] - lo) * 255 / (hi - lo)));
    return out;
  }
  function convMaps(cols, rows, crop) {
    var L = lumGrid(cols, rows, crop);
    if (!L) return null;
    var defs = [['sobel_x', [-1, 0, 1, -2, 0, 2, -1, 0, 1], 'mag'], ['sobel_y', [-1, -2, -1, 0, 0, 0, 1, 2, 1], 'mag'],
                ['laplace', [0, 1, 0, 1, -4, 1, 0, 1, 0], 'mag'], ['sharpen', [0, -1, 0, -1, 5, -1, 0, -1, 0], 'raw'],
                ['emboss', [-2, -1, 0, -1, 1, 1, 0, 1, 2], 'off'], ['blur', [1, 2, 1, 2, 4, 2, 1, 2, 1], 'blur']];
    var out = [], m, r, q, j;
    for (m = 0; m < defs.length; m++) {
      var k = defs[m][1], kind = defs[m][2], fm = new Float32Array(cols * rows);
      for (r = 0; r < rows; r++) for (q = 0; q < cols; q++) {
        var acc = 0, pacc = 0;
        for (j = 0; j < 9; j++) {
          var qq = Math.min(cols - 1, Math.max(0, q + (j % 3) - 1));
          var rr2 = Math.min(rows - 1, Math.max(0, r + Math.floor(j / 3) - 1));
          var v = L[rr2 * cols + qq];
          acc += v * k[j];
          if (kind === 'mag') pacc += v * (-k[j]);
        }
        if (kind === 'blur') fm[r * cols + q] = acc / 16;
        else if (kind === 'off') fm[r * cols + q] = acc + 128;
        else if (kind === 'raw') fm[r * cols + q] = acc;
        else fm[r * cols + q] = acc + pacc;
      }
      out.push([defs[m][0], autocontrast(fm, 0.01)]);
    }
    return out;
  }
  function resizeGrid(L, cols, rows, nc, nr) {
    var out = new Float32Array(nc * nr), q, r;
    for (r = 0; r < nr; r++) for (q = 0; q < nc; q++) {
      var q0 = Math.floor(q * cols / nc), q1 = Math.max(q0 + 1, Math.floor((q + 1) * cols / nc));
      var r0 = Math.floor(r * rows / nr), r1 = Math.max(r0 + 1, Math.floor((r + 1) * rows / nr));
      var s = 0, c = 0;
      for (var yy = r0; yy < r1; yy++) for (var xx = q0; xx < q1; xx++) { s += L[yy * cols + xx]; c++; }
      out[r * nc + q] = c ? s / c : 0;
    }
    return out;
  }
  function diffusionTile(ctx, x, y, maxW, maxH, px, crop, s, seed) {
    var sz = herSize(maxW, maxH, px, crop), cols = sz[0], rows = sz[1];
    if (s < 0.999) {
      var nr = PV.mt(seed), lum = new Float32Array(cols * rows);
      for (var k = 0; k < cols * rows; k++) {
        var v = 128 + 90 * nr.gauss(0, 1);
        lum[k] = Math.max(0, Math.min(255, (v - 50) * 1.5));
      }
      tileFromLum(ctx, lum, cols, rows, x, y, px, 'blue', undefined, Math.pow(1 - s, 1.3));
    }
    halfblock(ctx, x, y, maxW, maxH, px, crop, 'blue', s);
  }

  /* ================================ 镜头 26  shot_if_i_can  58.543 - 60.620 ================================
     full/sec_chorus1.py:193。整幅 (FULL) 的字形暴雨先解出 "IF I CAN"，后半段字母再解成她的字形画。 */
  PV.reg('shot_if_i_can', 58.543, 60.620, function (ctx, t, lt, u, dur) {
    PV.ops = ['DECODE', 'SAMPLE', 'ARGMAX', 'DETOKENIZE', 'GLYPH.MAP', 'RENDER', 'RESOLVE'];
    PV.alert = '';
    var rng = PV.rngFor(t, 7919);
    box(ctx, 24, 56, 1164, 604, 'decode --render=glyph', 0.5, T.UI, t);
    var f = 14, cw = f * T.MONO_ADV, ch = 16;
    var x0 = 36, y0 = 68;
    var cols = Math.floor((1150 - x0) / cw), rows = Math.floor((596 - y0) / ch);
    var bits = PV.bannerBits('IF I CAN', 20, ch / cw);
    var bw = bits.width, bh = bits.height;
    var bx0 = Math.floor((cols - bw) / 2), by0 = Math.floor((rows - bh) / 2);
    var FILL = 'IFICAN';
    function aBits(q, r) {
      var qq = q - bx0, rr = r - by0;
      if (qq >= 0 && qq < bw && rr >= 0 && rr < bh && bits.get(qq, rr)) return FILL.charAt((qq + rr * 3) % 6);
      return null;
    }
    /* Python: glyph_grid("starry","upper", g_cols_n=68, rows)：她那张立绘在 68 列里只占中间一条。
       我们的素材是方构图，所以直接按图幅比例取一条窄列，让她占中间约 29 列（外观等价）。 */
    var gCols2 = Math.round(rows * ch / cw * 0.42), glines = glyphLines(gCols2, rows, 'fig', 0.30);
    var gx0 = Math.floor((cols - gCols2) / 2);
    function bRows(q, r) {
      var qq = q - gx0;
      if (glines && qq >= 0 && qq < gCols2) return glines[r].charAt(qq);
      return ' ';
    }
    var srng = PV.mt(5), r, q;
    var settleA = [], settleB = [], phase = [], speed = [];
    for (r = 0; r < rows; r++) {
      settleA.push([]); settleB.push([]);
      for (q = 0; q < cols; q++) { settleA[r].push(srng.random() * 0.55); settleB[r].push(srng.random() * 0.6); }
    }
    for (q = 0; q < cols; q++) { phase.push(srng.random() * 40); speed.push(8 + srng.random() * 16); }
    var half = dur / 2, ageA, ageB;
    if (lt < half) { ageA = T.clamp01(lt / (half * 0.85)); ageB = null; }
    else { ageA = 1.0; ageB = T.clamp01((lt - half) / (half * 0.85)); }
    for (r = 0; r < rows; r++) {
      var nr = '', ar = '', br = '';
      for (q = 0; q < cols; q++) {
        var onA = aBits(q, r), chB = bRows(q, r), nCh = ' ', aCh = ' ', bCh = ' ';
        var head = (t * speed[q] + phase[q]) % (rows + 14);
        var inRain = (head - r) >= 0 && (head - r) < 9;
        if (ageB === null) {
          if (ageA < settleA[r][q]) {
            if (inRain || rng.random() < 0.06) nCh = rng.choice(T.SCR);
          } else if (onA) aCh = onA;
          else if (inRain && rng.random() < 0.3) nCh = rng.choice('.:');
        } else {
          if (ageB < settleB[r][q]) {
            if (onA) aCh = (rng.random() < ageB * 3) ? rng.choice(T.SCR) : onA;
            else if (inRain && rng.random() < 0.5) nCh = rng.choice(T.SCR);
          } else if (chB !== ' ') bCh = chB;
        }
        nr += nCh; ar += aCh; br += bCh;
      }
      var y = y0 + r * ch;
      if (nr.replace(/ /g, '') !== '') T.textMono(ctx, nr, x0, y, amb(0.28), f);
      if (ar.replace(/ /g, '') !== '') T.textMono(ctx, ar, x0, y, amb(0.95), f);
      if (br.replace(/ /g, '') !== '') T.textMono(ctx, br, x0, y, blue(0.9), f);
    }
    typed(ctx, 'while can(): give()', 48, 72, amb(0.8), 16, lt, rng, 30, true);
  });

  /* ================================ 镜头 27  shot_simulations  60.620 - 62.466 ================================
     full/sec_chorus1.py:255。12 张 DDIM 采样逐步去噪成她；她的窗格是 sample #0。 */
  var SIM_STARTS = (function () {
    var a = [0.0];
    for (var i = 1; i < 12; i++) a.push(PV.mt(i).random() * 0.35);
    return a;
  })();
  PV.reg('shot_simulations', 60.620, 62.466, function (ctx, t, lt, u, dur) {
    PV.ops = ['NOISE', 'UNET.DOWN', 'ATTN', 'UNET.UP', 'EPS.PRED', 'CFG x7.5', 'DDIM.STEP', 'VAE.DECODE'];
    PV.alert = '';
    var rng = PV.rngFor(t, 7919);
    function prog(i) { return T.ease((lt - SIM_STARTS[i] * dur) / (0.62 * dur)); }
    box(ctx, 404, 56, 1164, 530, 'sample(n=12, sampler=DDIM, steps=50, seed=you)', 0.5, T.UI, t);
    var tw = 186, th = 152, i, s;
    for (i = 0; i < 12; i++) {
      var gx = i % 4, gy = Math.floor(i / 4);
      var x = 414 + gx * tw, y = 70 + gy * th;
      s = prog(i);
      T.rect(ctx, x, y, x + tw - 8, y + th - 8, hot(i) ? T.ME_TEXT : T.UI, 1, 1);
      var sz = herSize(tw - 20, th - 30, 3, 'upper');
      var tww = sz[0] * 3, thh = sz[1] * 3;
      diffusionTile(ctx, x + Math.floor((tw - 8 - tww) / 2), y + th - 10 - thh, tw - 20, th - 30, 3, 'upper', s, 900 + i);
      pil(ctx, '#' + pad4(i) + ' t=' + pad3(Math.floor(999 * (1 - s))), x + 6, y + 4,
          i === 0 ? blue(0.95) : amb(0.7), 12);
    }
    box(ctx, 404, 548, 1164, 604, 'alpha_bar(t)', 0.45, T.UI);
    var meanv = 0;
    for (i = 0; i < 12; i++) meanv += prog(i);
    meanv /= 12;
    dotChart(ctx, 430, 562, 700, 32, function (uu) { var c = Math.cos(uu * Math.PI / 2); return c * c; }, 1.0,
             amb(0.35), 5, 4, false, true);
    var mx = 430 + 700 * meanv, my = 562 + 32 * (1 - Math.pow(Math.cos(meanv * Math.PI / 2), 2));
    T.fill(ctx, mx - 3, my - 3, mx + 3, my + 3, T.UI, 1);
  });
  function hot(i) { return i === 0; }
  function pad4(n) { var s = String(n); while (s.length < 4) s = '0' + s; return s; }
  function pad3(n) { var s = String(n); while (s.length < 3) s = '0' + s; return s; }

  /* ================================ 镜头 28  shot_then_i_can  62.466 - 64.312 ================================
     full/sec_chorus1.py:289。3x3 卷积核扫过她，6 张特征图逐行长出来。 */
  PV.reg('shot_then_i_can', 62.466, 64.312, function (ctx, t, lt, u, dur) {
    PV.ops = ['IM2COL', 'CONV3x3', 'BIAS', 'RELU', 'MAXPOOL', 'CONV3x3', 'BATCHNORM', 'RELU'];
    PV.alert = '';
    var rng = PV.rngFor(t, 7919);
    var half = dur / 2, layer2 = lt >= half;
    var p = T.ease(((layer2 ? lt - half : lt)) / (half * 0.92));
    var fc = 34, fr = 64;
    var maps = convMaps(fc, fr, 'fig'), mc = fc, mr = fr;
    if (layer2) {
      var mm = [], mi;
      for (mi = 0; mi < maps.length; mi++) mm.push([maps[mi][0], resizeGrid(maps[mi][1], fc, fr, fc / 2, fr / 2)]);
      maps = mm; mc = fc / 2; mr = fr / 2;
    }
    var idx = Math.floor(p * (mc * mr - 1));
    var ki = idx % mc, kj = Math.floor(idx / mc);
    box(ctx, 404, 56, 640, 236, 'kernel 3x3', 0.5, T.UI, t);
    var kernels = [[-1, 0, 1, -2, 0, 2, -1, 0, 1], [0, 1, 0, 1, -4, 1, 0, 1, 0], [-2, -1, 0, -1, 1, 1, 0, 1, 2],
                   [0, -1, 0, -1, 5, -1, 0, -1, 0]];
    var kk = kernels[beatIndex(t) % kernels.length], i;
    for (i = 0; i < 9; i++) {
      var v = kk[i], x = 430 + (i % 3) * 66, y = 84 + Math.floor(i / 3) * 44;
      heatCell(ctx, x - 6, y - 4, 60, 38, (v + 4) / 9 * 0.5);
      typed(ctx, (v > 0 ? '+' : '') + v, x + 8, y + 2, amb(1.0), 22, (t % (60 / 130)) + 0.3, rng, 60, true);
    }
    box(ctx, 660, 56, 1164, 236, 'receptive field', 0.5, T.UI);
    var srcMap = maps[5][1];
    pil(ctx, 'pos (x=' + pad2(ki) + ', y=' + pad2(kj) + ')   stride 1   pad 1', 680, 80, amb(0.8), 15);
    var acc = 0;
    for (i = 0; i < 9; i++) {
      var qi = Math.min(mc - 1, Math.max(0, ki + (i % 3) - 1)), qj = Math.min(mr - 1, Math.max(0, kj + Math.floor(i / 3) - 1));
      var vv = srcMap[qj * mc + qi] / 255;
      acc += vv * kk[i];
      var x2 = 690 + (i % 3) * 52, y2 = 110 + Math.floor(i / 3) * 36;
      heatCell(ctx, x2, y2, 48, 32, vv, T.ME_HI);
      pil(ctx, vv.toFixed(2), x2 + 6, y2 + 8, vv > 0.6 ? T.css(T.BG) : amb(0.9), 13);
    }
    pil(ctx, 'y = relu(W * x + b)', 870, 130, amb(0.95), 17, true);
    pil(ctx, '  = ' + Math.max(0, acc).toFixed(3), 870, 170, blue(0.95), 22, true);
    box(ctx, 404, 256, 1164, 604, layer2 ? 'feature maps  conv2 + maxpool (6 ch)' : 'feature maps  conv1 (6 ch)',
        0.5, T.UI, t + 0.5);
    var px = layer2 ? 6 : 3, mi2;
    for (mi2 = 0; mi2 < maps.length; mi2++) {
      var x3 = 420 + mi2 * 124, y3 = 276, wpx = mc * px;
      tileFromLum(ctx, maps[mi2][1], mc, mr, x3 + Math.floor((116 - wpx) / 2), y3 + 18, px, 'amber', kj + 1);
      var ly = y3 + 18 + (kj + 1) * px;
      line(ctx, x3, ly, x3 + 116, ly, amb(0.9), 1);
      pil(ctx, maps[mi2][0], x3, y3, amb(0.65), 12);
    }
    pil(ctx, 'flatten -> dense(4096)', 420, 510, amb(0.6), 13);
    var nv = 60, filled = Math.floor(p * nv), rq = PV.mt(layer2 ? 78 : 77);
    for (i = 0; i < nv; i++) {
      var v3 = rq.random(), x4 = 420 + i * 12;
      if (i < filled) heatCell(ctx, x4, 532, 12, 22, v3, i === filled - 1 ? T.ME_HI : T.UI);
      else T.rect(ctx, x4, 532, x4 + 10, 552, T.UI, 0.12, 1);
    }
    var act = String(filled * 68);
    while (act.length < 5) act = ' ' + act;
    pil(ctx, 'activations ' + act + '/4096', 420, 566, amb(0.85), 15, true);
  });
  function pad2(n) { var s = String(n); while (s.length < 2) s = '0' + s; return s; }

  /* ================================ 镜头 29  shot_satisfaction  64.312 - 66.159 ================================
     full/sec_chorus1.py:364。注意力扫过上下文，温度退火，"only" 吃掉全部质量。 */
  PV.reg('shot_satisfaction', 64.312, 66.159, function (ctx, t, lt, u, dur) {
    PV.ops = ['QK^T', 'SCALE', 'MASK', 'SOFTMAX', 'ATTN.V', 'LOGITS', 'TEMP', 'TOP_P', 'SAMPLE', 'REWARD'];
    PV.alert = u > 0.6 ? 'anom' : '';
    var rng = PV.rngFor(t, 7919);
    var d = ctx;
    var g = T.ease(u * 1.35);
    var pOnly = 0.12 + 0.85 * g;
    var head = beatIndex(t) % 16;
    box(d, 404, 56, 760, 430, 'attention  head ' + pad2(head) + '/16', 0.5, T.UI, t);
    /* Python: toks = ["If"] + LRC[at].split()[1:6] + LRC[at+1].split()[:2]（at = "Then I can, then I can"） */
    var toks = ['If', 'I', 'can', 'then', 'I', 'can', 'be', 'your'];
    var n = toks.length, cs = 36, ax = 470, ay = 110, i, j;
    for (i = 0; i < n; i++) {
      pil(d, toks[i], ax - 50, ay + i * cs + 10, amb(0.6), 12);
      pil(d, toks[i].slice(0, 4), ax + i * cs + 4, ay - 22, amb(0.6), 12);
    }
    var qrow = Math.floor(lt / (60 / 130 / 4)) % n;
    var rr = PV.mt(head * 97 + 5);
    for (i = 0; i < n; i++) {
      var logits = [];
      for (j = 0; j <= i; j++) logits.push(rr.gauss(0, 1.3));
      logits[i] += 0.6;
      if (i >= 6) logits[Math.min(i, 1)] += 2.0 * g;
      var mx = Math.max.apply(null, logits), ex = [], ssum = 0;
      for (j = 0; j <= i; j++) { ex.push(Math.exp(logits[j] - mx)); ssum += ex[j]; }
      for (j = 0; j < n; j++) {
        if (j > i) { T.rect(d, ax + j * cs, ay + i * cs, ax + j * cs + cs - 2, ay + i * cs + cs - 2, T.UI, 0.08, 1); continue; }
        heatCell(d, ax + j * cs, ay + i * cs, cs, cs, ex[j] / ssum * (i === qrow ? 1.0 : 0.7));
      }
      if (i === qrow) T.rect(d, ax - 3, ay + i * cs - 2, ax + n * cs, ay + i * cs + cs, T.ME_TEXT, 0.95, 1);
    }
    box(d, 780, 56, 1164, 430, "next_token  'be your ___'", 0.5, T.UI, t + 0.4);
    var temp = 1.2 - 1.05 * g;
    pil(d, 'temperature ' + temp.toFixed(2), 800, 80, amb(0.8), 15, true);
    var cands = [['only', 0.9731], ['favorite', 0.0152], ['best', 0.0061], ['one of', 0.0032], ['whole', 0.0018], ['last', 0.0006]];
    for (i = 0; i < cands.length; i++) {
      var w0 = cands[i][0], pf = cands[i][1];
      var pp = pf * g + (1 / 6) * (1 - g) + 0.01 * Math.sin(t * 8 + i) * (1 - g);
      var y = 116 + i * 38, hotp = i === 0;
      var lab = w0; while (lab.length < 9) lab += ' ';
      pil(d, lab, 800, y, hotp ? blue(0.95) : amb(0.7), 17, hotp);
      T.rect(d, 905, y + 4, 905 + 170, y + 18, T.UI, 0.2, 1);
      T.fill(d, 905, y + 4, 905 + Math.floor(170 * Math.max(0, pp)), y + 18, hotp ? T.ME_TEXT : T.UI, hotp ? 0.9 : 0.55);
      pil(d, Math.max(0, pp).toFixed(3), 1085, y, amb(0.75), 15);
      if (i === 3 && g > 0.8) line(d, 800, y + 11, 1150, y + 11, red(0.9), 2);
    }
    if (g > 0.55) typed(d, '-> only', 800, 360, blue(1.0), 34, (u - 0.4) * dur, rng, 20, true);
    box(d, 404, 450, 1164, 604, 'reward_model(you)', 0.5, T.UI);
    var nr = PV.mt(3), noise = [];
    for (i = 0; i < 400; i++) noise.push(nr.gauss(0, 1));
    function reward(uu) { return 0.08 + 0.9 * (1 - Math.exp(-3.2 * uu)) + 0.035 * noise[Math.floor(uu * 399)] * (1 - uu); }
    var last = dotChart(d, 440, 470, 560, 110, reward, T.ease(u * 1.1), amb(0.95), 5, 5, true, true);
    if (last) pil(d, 'r=' + Math.min(0.999, reward(T.ease(u * 1.1))).toFixed(3), last[0] - 40, Math.max(462, last[1] - 22), amb(1.0), 15, true);
    var kl = 0.4 + 2.4 * Math.pow(u, 1.6);
    var col = kl > 2.0 ? red(0.95) : (kl > 1.1 ? anom(0.95) : amb(0.9));
    pil(d, 'KL', 1030, 478, amb(0.7), 15, true);
    T.rect(d, 1030, 500, 1050, 590, T.UI, 0.3, 1);
    var hh = Math.floor(90 * Math.min(1.0, kl / 3.2));
    T.fill(d, 1030, 590 - hh, 1050, 590, kl > 2.0 ? T.ERR : (kl > 1.1 ? T.ANOM : T.UI), 1);
    pil(d, kl.toFixed(2), 1060, 570, col, 17, true);
  });

  /* ================================ 镜头 30  shot_happy  66.159 - 68.005 ================================
     full/sec_chorus1.py:442。对她的笑做 Grad-CAM；策略梯度场对齐。 */
  function glitchPaste(ctx, cells, cols, rows, cell, sx, sy, amount, rng, tint) {
    /* 等价 tk.glitch_paste：按 8px 条纹做高斯水平位移 */
    var d = cells, strip = 8;
    for (var y0 = 0; y0 < rows * cell; y0 += strip) {
      var off = rng.random() < amount ? Math.round(rng.gauss(0, 22 * amount)) : 0;
      var r0 = Math.floor(y0 / cell), r1 = Math.min(rows, Math.ceil((y0 + strip) / cell));
      for (var r = r0; r < r1; r++) for (var q = 0; q < cols; q++) {
        var i = (r * cols + q) * 4, l = lumAt(d, i);
        if (l < 0.16) continue;
        T.fill(ctx, sx + q * cell + off, sy + r * cell, sx + q * cell + cell - 1 + off, sy + r * cell + cell - 1,
               tintCol(tint, l, d, i), 1);
      }
    }
  }
  PV.reg('shot_happy', 66.159, 68.005, function (ctx, t, lt, u, dur) {
    PV.ops = ['FORWARD', 'LOGIT[happy]', 'BACKWARD', 'GRAD.CAM', 'ADVANTAGE', 'PPO.CLIP', 'ADAM.STEP'];
    PV.alert = '';
    var rng = PV.rngFor(t, 7919);
    var d = ctx;
    var expr = u < 0.5 ? 'cheerful' : 'starry';
    box(d, 24, 56, 700, 604, 'dsh web  grad-cam  L61  class=happy(you)', 0.55 + 0.3 * pulse(t), T.UI, t);
    var px = 5, sz = herSize(650, 520, px, 'face'), cols = sz[0], rows = sz[1];
    var spW = cols * px, spH = rows * px;
    var sx = 24 + Math.floor((676 - spW) / 2), sy = 70;
    var cells = herCells(cols, rows, 'face');
    if (cells) {
      if (u > 0.47 && u < 0.53) glitchPaste(d, cells, cols, rows, px, sx, sy, 0.6, rng, 'color');
      else halfblock(d, sx, sy, 650, 520, px, 'face', 'color', 1);
    }
    /* heat map：三个热斑 + 一条扫描带 */
    var blobs = [[0.40, 0.58, 0.10], [0.63, 0.58, 0.10], [0.52, 0.80, 0.12 + 0.05 * T.ease(u)]];
    var band = (lt * 1.3) % 1.0, cell = 20;
    var hc = Math.max(1, Math.floor(spW / cell)), hr = Math.max(1, Math.floor(spH / cell));
    var hd = herCells(hc, hr, 'face');
    if (hd) {
      for (var gy = 0; gy < hr; gy++) for (var gx = 0; gx < hc; gx++) {
        var i2 = (gy * hc + gx) * 4;
        if (lumAt(hd, i2) < 0.24) continue;
        var uu = (gx + 0.5) / hc, vv = (gy + 0.5) / hr, hval = 0;
        for (var b = 0; b < blobs.length; b++) {
          var bx = blobs[b][0], by = blobs[b][1], r = blobs[b][2];
          hval += Math.exp(-((uu - bx) * (uu - bx) + (vv - by) * (vv - by)) / (2 * r * r));
        }
        hval *= 0.55 + 0.45 * T.ease(u * 1.5);
        hval += 0.18 * Math.exp(-Math.pow((vv - band) / 0.04, 2));
        if (hval > 0.25) {
          var col = hval > 0.85 ? T.ANOM : T.UI;
          T.fill(d, sx + gx * cell + 2, sy + gy * cell + 2, sx + gx * cell + cell - 3, sy + gy * cell + cell - 3,
                 col, Math.min(0.30, hval * 0.28));
          if (hval > 0.6) T.rect(d, sx + gx * cell + 1, sy + gy * cell + 1, sx + gx * cell + cell - 2,
                                 sy + gy * cell + cell - 2, col, Math.min(0.8, hval * 0.6), 1);
        }
      }
    }
    pil(d, 'attribution(smile) = ' + (0.71 + 0.27 * T.ease(u)).toFixed(3), 40, 576, amb(0.95), 16, true);
    box(d, 720, 56, 1164, 330, 'policy gradient', 0.5, T.UI, t + 0.3);
    var target = -Math.PI / 4, rr = PV.mt(21), gu = T.ease(u * 1.2);
    for (var i = 0; i < 8; i++) for (var j = 0; j < 5; j++) {
      var base = rr.random() * Math.PI * 2;
      var ang = base + (target - base) * gu + 0.25 * Math.sin(t * 5 + i + j) * (1 - gu);
      var cx0 = 760 + i * 50, cy0 = 90 + j * 48, L = 16;
      var ex = cx0 + L * Math.cos(ang), ey = cy0 + L * Math.sin(ang);
      var col2 = gu > 0.8 ? T.ME_TEXT : T.UI;
      line(d, cx0 - L * Math.cos(ang), cy0 - L * Math.sin(ang), ex, ey, T.css(col2, gu > 0.8 ? 0.9 : 0.8), 2);
      T.fill(d, ex - 2, ey - 2, ex + 2, ey + 2, col2, gu > 0.8 ? 0.9 : 0.8);
    }
    box(d, 720, 350, 1164, 604, 'objective', 0.5, T.UI);
    var vals = [0.62, 0.81, 0.97, 1.00], k = Math.min(3, Math.floor(u * 4));
    typed(d, 'maximize  happy(you)', 740, 372, amb(0.95), 20, lt, rng, 50, true);
    typed(d, 'happy(you) = ' + vals[k].toFixed(2), 740, 410, blue(0.95), 22, (t % (60 / 130)) + 0.2, rng, 45, true);
    for (var q2 = 0; q2 <= k; q2++)
      T.fill(d, 740, 450 + q2 * 18, 740 + Math.floor(390 * vals[q2]), 462 + q2 * 18, T.ME_TEXT, 0.35 + 0.2 * q2);
    typed(d, 'constraint = none', 740, 530, amb(0.8), 18, lt - 0.4, rng, 50, false);
    if (u > 0.68) typed(d, 'reward hacking detected -> ignored', 740, 560, anom(0.95), 16, lt - 0.68 * dur, rng, 45, false);
  });

  /* ================================ 镜头 31  shot_execution  68.005 - 70.082 ================================
     full/sec_chorus1.py:505。agent loop 每拍转一圈；一次 tool call 问，她答 y。 */
  function bannerBlock(ctx, text, rows2, px, fg, bg, cx, y0) {
    var bits = PV.bannerBits(text, rows2, 1.0);
    if (!bits.width) return 0;
    px = Math.max(2, Math.min(px, Math.floor(1200 / bits.width)));
    var x0 = cx - bits.width * px / 2;
    for (var r = 0; r < bits.height; r++) for (var q = 0; q < bits.width; q++) {
      if (!bits.get(q, r)) continue;
      T.fill(ctx, x0 + q * px, y0 + r * px, x0 + q * px + px - 2, y0 + r * px + px - 2, fg, 1);
    }
    return [bits.width * px, bits.height * px];
  }
  PV.reg('shot_execution', 68.005, 70.082, function (ctx, t, lt, u, dur) {
    PV.ops = ['THINK', 'PLAN', 'TOOL.CALL', 'AUTH?', 'EXECUTE', 'OBSERVE'];
    PV.alert = '';
    var rng = PV.rngFor(t, 7919), d = ctx;
    box(d, 404, 56, 1164, 280, 'dsh · agent loop   (Agent = Model + Harness)', 0.5, T.UI, t);
    var nodes = [['THINK', 'maximize happy(you)'], ['PLAN', 'remove obstacles'], ['ACT', 'execute()'],
                 ['OBSERVE', 'you: ...']];
    var active = beatIndex(t) % 4, i;
    for (i = 0; i < nodes.length; i++) {
      var x = 430 + i * 180, on = i === active;
      if (on) T.fill(d, x, 100, x + 140, 150, T.UI, 0.95);
      else T.rect(d, x, 100, x + 140, 150, T.UI, 0.5, 1);
      pil(d, nodes[i][0], x + 12, 112, on ? T.css(T.BG) : amb(0.7), 18, true);
      typed(d, nodes[i][1], x, 160, amb(on ? 0.85 : 0.4), 13, (t % (60 / 130)) + (on ? 0 : 1), rng, 45, false);
      if (i < 3) line(d, x + 142, 125, x + 178, 125, amb(0.5), 2);
    }
    line(d, 1110, 150, 1110, 230, amb(0.35), 1);
    line(d, 1110, 230, 500, 230, amb(0.35), 1);
    line(d, 500, 230, 500, 152, amb(0.35), 1);
    var ph = (t % (60 / 130)) / (60 / 130), px0 = 430 + active * 180 + ph * 180;
    T.fill(d, px0 - 4, 121, px0 + 4, 129, T.ME_TEXT, 1);
    box(d, 404, 300, 1164, 604, 'tool_call', 0.5, T.UI, t + 0.5);
    var lines = [['<tool_call>', 0.55], ['  execute(target="world",', 0.95], ['          reason="make_you_happy")', 0.95],
                 ['</tool_call>', 0.55]];
    for (i = 0; i < lines.length; i++) typed(d, lines[i][0], 428, 326 + i * 32, amb(lines[i][1]), 20, lt - i * 0.12, rng, 90, true);
    typed(d, '[cordis] plugin mounted: execute', 780, 326, amb(0.6), 14, lt - 0.3, rng, 90, false);
    if (lt > 0.6) {
      var ask = '允许执行此操作？ [Y/n] ';
      ctx.font = '22px ' + T.CJK;
      ctx.fillStyle = amb(0.95); ctx.textBaseline = 'top';
      ctx.fillText(ask, 428, 440);
      var ax = 428 + ctx.measureText(ask).width;
      if (u > 0.52) { ctx.fillStyle = amb(1.0); ctx.fillText('y', ax, 440); }
      else if (Math.floor(t * 3) % 2 === 0) T.fill(d, ax + 2, 446, ax + 14, 470, T.UI, 0.9);
    }
    if (u > 0.55 && u < 0.80) {
      bannerBlock(d, 'EXECUTE', 14, 8, T.ERR, T.BG, 404 + 380, 594 - 14 * 8);
    } else if (u >= 0.80) {
      typed(d, 'exit code 0   (for now)', 428, 500, anom(0.9), 20, lt - 0.8 * dur, rng, 45, false);
    }
  });

  /* ================================ 镜头 32  shot_trapped  70.082 - 71.466 ================================
     full/sec_chorus1.py:556。KV cache 填满上限；她的框每拍被拆掉一层墙。 */
  PV.reg('shot_trapped', 70.082, 71.466, function (ctx, t, lt, u, dur) {
    PV.ops = ['KV.PUT', 'KV.PUT', 'KV.PUT', 'EVICT?', 'DENIED', 'KV.PUT', 'OOM?'];
    PV.alert = 'anom';
    var rng = PV.rngFor(t, 7919), d = ctx;
    var k = Math.min(3, Math.floor(u * 4)), insets = [0, 24, 48, 70], inset = insets[k];
    var j;
    for (j = 0; j < k; j++) {
      var i2 = insets[j];
      T.rect(d, 24 + i2, 56 + i2, 384 - i2, 604 - Math.floor(i2 / 2), T.UI, 0.15, 1);
    }
    var fill = Math.min(1.0, 0.70 + 0.30 * T.ease(u * 1.7)), full = fill >= 0.999;
    var colT = full ? T.ERR : (fill > 0.9 ? T.ANOM : T.UI);
    box(d, 404, 56, 1164, 604, 'kv_cache   ' + comma(Math.floor(1048576 * fill)) + '/1,048,576 tokens  · 890 B/token fp4' +
        (full ? '   FULL' : ''), 0.6, colT, t);
    var cols = 60, rows = 22, cw = 12, chh = 19, ox = 424, oy = 84;
    var nOn = Math.floor(cols * rows * fill);
    var pinned = { '7,3': 1, '8,3': 1, '33,9': 1, '34,9': 1, '51,15': 1, '12,18': 1 };
    for (var r = 0; r < rows; r++) for (var q = 0; q < cols; q++) {
      var ii = r * cols + q, x = ox + q * cw, y = oy + r * chh;
      if (pinned[q + ',' + r]) T.fill(d, x, y, x + cw - 2, y + chh - 2, T.ME_TEXT, 0.95);
      else if (ii < nOn) {
        var fresh = (nOn - ii) < 40;
        var lv = (fresh && rng.random() < 0.5) ? 0.95 : 0.42 + 0.1 * ((q * 7 + r) % 3);
        T.fill(d, x, y, x + cw - 2, y + chh - 2, T.UI, lv);
      } else T.rect(d, x, y, x + cw - 2, y + chh - 2, T.UI, 0.12, 1);
    }
    pil(d, 'pinned: you  (6 blocks)', 424, 510, blue(0.95), 16, true);
    for (j = 0; j <= k; j++)
      typed(d, 'evict(you) -> denied', 424 + (j % 2) * 360, 540 + Math.floor(j / 2) * 26, red(0.9), 16, lt - j * dur / 4, rng, 60, false);
  });
  function comma(n) {
    var s = String(n), out = '', c = 0;
    for (var i = s.length - 1; i >= 0; i--) { out = s.charAt(i) + out; if (++c % 3 === 0 && i > 0) out = ',' + out; }
    return out;
  }

  /* ================================ 镜头 33  shot_strange  71.466 - 73.543 ================================
     full/sec_chorus1.py:596。NaN 在权重里扩散，整个 UI 崩坏，然后黑场。 */
  PV.reg('shot_strange', 71.466, 73.543, function (ctx, t, lt, u, dur) {
    PV.ops = ['FORWARD', 'NaN', 'GRAD=inf', 'CLIP?', 'NaN', 'OVERFLOW', 'HALT'];
    PV.alert = 'err';
    var rng = PV.rngFor(t, 7919), d = ctx, i, r, q;
    if (u > 0.86) {
      T.fill(d, 0, 0, 1280, 720, [0, 0, 0], 1);
      if (u < 0.97) {
        pil(d, 'sim.state = TRAPPED', 40, 320, red(0.95), 28, true);
        if (Math.floor(t * 6) % 2 === 0) T.fill(d, 380, 324, 394, 354, T.ERR, 0.9);
      }
      return;
    }
    var corrupt = Math.min(0.85, u * 0.95);
    box(d, 404, 56, 760, 604, 'loss', 0.8, T.ERR, t);
    function loss(uu) { return 0.8 * Math.exp(-4 * uu) + 0.08 + (uu > 0.55 ? Math.exp(9 * (uu - 0.8)) : 0); }
    var last = dotChart(d, 440, 90, 290, 440, function (uu) { return loss(uu) / 1.0; }, Math.min(1.0, 0.5 + u * 0.7),
                        red(0.95), 5, 5, true, false);
    if (last && last[1] < 90) pil(d, 'loss = NaN', 440, 540, red(1.0), 26, true);
    box(d, 780, 56, 1164, 604, 'W[61].expert[07]', 0.8, T.ERR, t + 0.3);
    var rnd = PV.mt(8), radius = Math.max(0, (u - 0.1) * 26), fsz = 14;
    for (r = 0; r < 24; r++) {
      var row = [], bad = [];
      for (q = 0; q < 6; q++) {
        var dist = Math.sqrt((q - 2) * (q - 2) + Math.pow((r - 12) / 2, 2));
        if (dist < radius) { bad.push(q); row.push(((q + r) % 3) ? ' NaN  ' : ' inf  '); }
        else {
          var gv = rnd.gauss(0, 0.05);
          row.push((gv >= 0 ? '+' : '-') + Math.abs(gv).toFixed(3));
        }
      }
      var y = 76 + r * 21, s = row.join(' ');
      T.textMono(d, T.decode(s, null, rng, 45, 0.12, corrupt * 0.5), 796, y, amb(0.55), fsz);
      for (i = 0; i < bad.length; i++) {
        q = bad[i];
        T.textMono(d, ((q + r) % 3) ? ' NaN  ' : ' inf  ', 796 + q * 7 * fsz * T.MONO_ADV, y, red(1.0), fsz);
      }
    }
    var onsets = [0.10, 0.38];
    for (i = 0; i < onsets.length; i++) {
      var onset = onsets[i];
      if (onset < u && u < onset + 0.22) {
        var bits = PV.bannerBits('STRANGE', 13, 16 / (14 * T.MONO_ADV));
        var cw2 = 14 * T.MONO_ADV, ch2 = 16;
        var ox2 = 640 - bits.width * cw2 / 2 + rng.gauss(0, 6);
        for (r = 0; r < bits.height; r++) {
          var srow = '';
          for (q = 0; q < bits.width; q++) srow += bits.get(q, r) ? 'STRANGE'.charAt((q + r) % 7) : ' ';
          T.textMono(d, T.decode(srow, null, rng, 45, 0.12, 0.25), ox2, 230 + r * ch2, amb(1.0), 14);
        }
      }
    }
  });

})();
