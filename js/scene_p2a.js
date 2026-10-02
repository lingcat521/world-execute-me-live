/* scene_p2a.js —— 03 RLHF (58.543-73.543) + 04 DEPLOY (73.543-103.082) + 05 USER_LEFT 开头 (103.082-110.466)
   Python 权威（照它逐行移植）:
     continuity_full_v2/s_chorus1.py + full/sec_chorus1.py   -> 镜头 26-33（approved 渲染器）
     continuity_full_v2/scenes_deploy.py                     -> 镜头 34-45
     continuity_full_v2/scenes_userleft.py                   -> 镜头 46-47
   本文件只画「场景自己画在 c.d / c.img 上的东西」；她 / dsh web 窗口（me_pane）由 pane.js 负责。 */
(function () {
  'use strict';
  var PV = window.PV, T = PV.tui;
  /* scene_boot.js:286 在调用 PV.reg 注册的镜头时引用了裸 T（那个 IIFE 里没声明 T），
     这里把 T 挂成全局，避免 "T is not defined"。 */
  try { (typeof globalThis !== 'undefined' ? globalThis : window).T = T; } catch (e) {}

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
  /* tk.dot_chart 的忠实移植：返回最后一个点的坐标 [x, y] */
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

  /* ================================ 她的立绘：halfblock / glyph_grid / sprite_src 的替代 ================================
     素材只有 avatars/complete.png（120x120 RGB 无 alpha）。 */
  var HER = null, _cells = {};
  if (PV.loadImage) { try { PV.loadImage('avatars/complete.png', function (im) { HER = im; }); } catch (e) {} }
  var CROPS = { full: [0, 0, 1, 1], upper: [0.10, 0.00, 0.86, 0.62], face: [0.20, 0.03, 0.62, 0.52],
                bust: [0.06, 0.00, 0.94, 0.72] };
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
  /* 等价 tk.halfblock：返回 [w, h] 画出的尺寸 */
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
  /* 等价 tk.glyph_grid：rows 行 ASCII（边缘给方向笔画，内部给密度字形） */
  var GRAMP = ' .:-=+*#%@';
  function glyphLines(cols, rows, crop) {
    var d = herCells(cols, rows, crop);
    if (!d) return null;
    var L = new Float32Array(cols * rows), out = [], q, r;
    for (r = 0; r < rows; r++) for (q = 0; q < cols; q++) L[r * cols + q] = lumAt(d, (r * cols + q) * 4);
    var BS = String.fromCharCode(92);
    for (r = 0; r < rows; r++) {
      var s = '';
      for (q = 0; q < cols; q++) {
        var v = L[r * cols + q];
        if (v < 0.20) { s += ' '; continue; }
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
  /* 等价 tk.tile_from_lum：把一张 cols x rows 的亮度图（0..255 数组）画成 px 大小的着色格子 */
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

  /* ================================ 镜头 26  shot_if_i_can  58.543 - 60.620 ================================
     full/sec_chorus1.py:193。整幅 (FULL) 的字形暴雨解出 "IF I CAN"，后半段字母再解成她的字形画。 */
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
    var gCols = Math.floor(rows * ch / cw), glines = glyphLines(gCols, rows, 'upper');
    var gx0 = Math.floor((cols - gCols) / 2);
    function bRows(q, r) {
      var qq = q - gx0;
      if (glines && qq >= 0 && qq < gCols) return glines[r].charAt(qq);
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
    var noiseRows = [], aRows = [], bRowsOut = [];
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
      noiseRows.push(nr); aRows.push(ar); bRowsOut.push(br);
    }
    for (r = 0; r < rows; r++) {
      var y = y0 + r * ch;
      if (noiseRows[r].replace(/ /g, '') !== '') T.textMono(ctx, noiseRows[r], x0, y, amb(0.28), f);
      if (aRows[r].replace(/ /g, '') !== '') T.textMono(ctx, aRows[r], x0, y, amb(0.95), f);
      if (bRowsOut[r].replace(/ /g, '') !== '') T.textMono(ctx, bRowsOut[r], x0, y, blue(0.9), f);
    }
    typed(ctx, 'while can(): give()', 48, 72, amb(0.8), 16, lt, rng, 30, true);
  });
})();
