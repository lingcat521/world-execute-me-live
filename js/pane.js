/* pane.js —— 左侧 dsh 聊天窗（真 HTML/CSS + 逐帧纯函数 t）。
   权威实现：dshpv/film/pv_dsh_frontend_20260927 的 batch_a1/a2/a3/b/c/e/f/g + seg_page + dsh_her。
   覆盖全片 5.236 - 211.872 s：A1 5.24-16 / A2 16-29.28 / A3 29.28-44 / B 44-73.54 / C 73.54-103 /
   D 103-125 / E 125-147.5 / F 147.5-177 / G 177-211.9。HIDE_HER 与 GONE..BACK 在 paneVisible 里判。 */
(function () {
  'use strict';
  var PV = window.PV, T = PV.tui;
  var FPS = 24, PANE_T0 = 5.236, TOTAL = 211.872;
  var SIXTEENTH = 60 / 130 / 4;
  function beat(k) { return 0.1807 + k * 4 * SIXTEENTH; }

  /* ================================================================ 基础工具 */
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function pad(n, w) { var s = String(n); while (s.length < w) s = '0' + s; return s; }
  function padL(n, w) { return pad(n, w); }
  function clamp01(u) { return u < 0 ? 0 : (u > 1 ? 1 : u); }
  function ease(u) { u = clamp01(u); return u * u * (3 - 2 * u); }
  function easeIo(u) { return T.ease_io ? T.ease_io(u) : ease(u); }
  function smooth(u) { return ease(u); }
  /* CPython 的 round() 是 banker's rounding、int() 向零截断；原工程大量用它们切字符数，必须逐值对齐 */
  function pyround(x) {
    var f = Math.floor(x), d = x - f;
    if (d > 0.5) return f + 1;
    if (d < 0.5) return f;
    return (f % 2 === 0) ? f : f + 1;
  }
  function pyint(x) { return x < 0 ? Math.ceil(x) : Math.floor(x); }

  var ICONS = {}, EXTRA = null, app = null, chatEl = null, lastBody = null, lastTheme = null;
  fetch('data/icons.json').then(function (r) { return r.json(); }).then(function (d) {
    for (var k in d) ICONS[k] = d[k]; lastBody = null;
  }).catch(function () {});
  fetch('data/pane_icons.json').then(function (r) { return r.json(); }).then(function (d) {
    EXTRA = d; for (var k in d) ICONS[k] = d[k]; lastBody = null;
  }).catch(function () {});
  var CORDIS_CSS = '';
  fetch('data/pane_cordis.css').then(function (r) { return r.text(); }).then(function (s) { CORDIS_CSS = s; }).catch(function () {});

  function svg(name, size, cls) {
    var s = ICONS[name] || '';
    if (!s) return '';
    if (size) s = s.replace(/width="\d+" height="\d+"/, 'width="' + size + '" height="' + size + '"');
    if (cls) s = s.replace('class=""', 'class="' + cls + '"');
    return s;
  }
  /* dsh 的 DisclosureRow CSS-module 类名（disclosure_map.json），think/tool 行的骨架都要它 */
  var DISC = { root: '_root_luwio_9', row: '_row_luwio_16', leading: '_leading_luwio_29',
               iconIdle: '_iconIdle_luwio_57', chevronHover: '_chevronHover_luwio_63', title: '_title_luwio_79' };

  /* ================================================================ 头像工厂
     原工程的 avatars/{a1,a2,a3,b,c,d,f,g}/*.png 是 PIL 预生成的；这里用 canvas 现场从
     avatars/*.png 推同样的东西（同一个 head crop、同一套 mosaic + colorize 规则），缓存成 dataURL。 */
  var AVSRC = { cheerful: 'avatars/complete.png', frightened: 'avatars/left.png', starry: 'avatars/forged.png' };
  var AVIMG = {}, AVCACHE = {};
  (function () {
    for (var k in AVSRC) (function (k) {
      var im = new Image();
      im.onload = function () { AVIMG[k] = im; lastBody = null; };
      im.onerror = function () {};
      im.src = AVSRC[k];
    })(k);
  })();
  function avInvert(name, dark, light) {
    /* left.png / forged.png 是 colorize(gray, dark, light)：把灰度反推回来 */
    var im = AVIMG[name]; if (!im) return null;
    var c = document.createElement('canvas'); c.width = 120; c.height = 120;
    var g = c.getContext('2d'); g.drawImage(im, 0, 0, 120, 120);
    var d = g.getImageData(0, 0, 120, 120).data, out = new Float32Array(14400);
    var ld = 0.299 * dark[0] + 0.587 * dark[1] + 0.114 * dark[2];
    var ll = 0.299 * light[0] + 0.587 * light[1] + 0.114 * light[2];
    var span = ll - ld || 1;
    for (var i = 0, j = 0; i < d.length; i += 4, j++)
      out[j] = clamp01(((0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) - ld) / span) * 255;
    return { w: 120, h: 120, px: out };
  }
  function avBase(name, cells) {
    /* gray(head, cells)：等价 PIL 的 BOX 缩小；cheerful 直接取 complete.png 的灰度 */
    var src = null;
    if (name === 'cheerful') {
      var im = AVIMG.cheerful; if (!im) return null;
      var c = document.createElement('canvas'); c.width = 120; c.height = 120;
      var g = c.getContext('2d'); g.drawImage(im, 0, 0, 120, 120);
      var d = g.getImageData(0, 0, 120, 120).data, px = new Float32Array(14400);
      for (var i = 0, j = 0; i < d.length; i += 4, j++) px[j] = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      src = { w: 120, h: 120, px: px };
    } else if (name === 'frightened') src = avInvert('frightened', [8, 12, 26], [170, 182, 210]);
    else if (name === 'starry') src = avInvert('starry', [30, 18, 0], [255, 204, 0]);
    if (!src) return null;
    var cw = cells[0], ch = cells[1];
    var c2 = document.createElement('canvas'); c2.width = cw; c2.height = ch;
    var g2 = c2.getContext('2d');
    var big = document.createElement('canvas'); big.width = 120; big.height = 120;
    big.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(14400), 120, 120), 0, 0);
    var bd = big.getContext('2d').getImageData(0, 0, 120, 120);
    for (var y = 0; y < 120; y++) for (var x = 0; x < 120; x++) {
      var v = src.px[y * 120 + x] | 0, o = (y * 120 + x) * 4;
      bd.data[o] = bd.data[o + 1] = bd.data[o + 2] = v; bd.data[o + 3] = 255;
    }
    big.getContext('2d').putImageData(bd, 0, 0);
    g2.imageSmoothingEnabled = true;
    g2.drawImage(big, 0, 0, cw, ch);
    var rd = g2.getImageData(0, 0, cw, ch).data, out = new Float32Array(cw * ch);
    for (var k2 = 0, j2 = 0; k2 < rd.length; k2 += 4, j2++)
      out[j2] = 0.299 * rd[k2] + 0.587 * rd[k2 + 1] + 0.114 * rd[k2 + 2];
    return { w: cw, h: ch, px: out };
  }
  function grayCol(g, x, y) {
    x = Math.max(0, Math.min(g.w - 1, x | 0)); y = Math.max(0, Math.min(g.h - 1, y | 0));
    return g.px[y * g.w + x];
  }
  function grayResize(g, w, h) {
    var c = document.createElement('canvas'); c.width = g.w; c.height = g.h;
    var g2 = c.getContext('2d'); var id = g2.createImageData(g.w, g.h);
    for (var i = 0, j = 0; i < g.px.length; i++, j += 4) {
      id.data[j] = id.data[j + 1] = id.data[j + 2] = g.px[i] | 0; id.data[j + 3] = 255;
    }
    g2.putImageData(id, 0, 0);
    var c3 = document.createElement('canvas'); c3.width = w; c3.height = h;
    var g3 = c3.getContext('2d'); g3.imageSmoothingEnabled = true; g3.drawImage(c, 0, 0, w, h);
    var rd = g3.getImageData(0, 0, w, h).data, out = new Float32Array(w * h);
    for (var k = 0, j3 = 0; k < rd.length; k += 4, j3++)
      out[j3] = 0.299 * rd[k] + 0.587 * rd[k + 1] + 0.114 * rd[k + 2];
    return { w: w, h: h, px: out };
  }
  function grayBlend(a, b, k) {
    var out = new Float32Array(a.px.length);
    for (var i = 0; i < out.length; i++) out[i] = a.px[i] + (b.px[i] - a.px[i]) * k;
    return { w: a.w, h: a.h, px: out };
  }
  function colorizeURL(g, dark, light, size, props, propCol, over) {
    size = size || 120;
    var c = document.createElement('canvas'); c.width = g.w; c.height = g.h;
    var ctx = c.getContext('2d'); var id = ctx.createImageData(g.w, g.h);
    for (var y = 0; y < g.h; y++) for (var x = 0; x < g.w; x++) {
      var i = y * g.w + x, u = clamp01(g.px[i] / 255), o = i * 4, col;
      if (props) { col = null; for (var q = 0; q < props.length; q++) if (props[q][0] === x && props[q][1] === y) col = propCol; }
      var ov = over ? over(x, y, i) : null;
      if (ov) { id.data[o] = ov[0]; id.data[o + 1] = ov[1]; id.data[o + 2] = ov[2]; }
      else if (col) { id.data[o] = col[0]; id.data[o + 1] = col[1]; id.data[o + 2] = col[2]; }
      else {
        id.data[o] = Math.round(dark[0] + (light[0] - dark[0]) * u);
        id.data[o + 1] = Math.round(dark[1] + (light[1] - dark[1]) * u);
        id.data[o + 2] = Math.round(dark[2] + (light[2] - dark[2]) * u);
      }
      id.data[o + 3] = 255;
    }
    ctx.putImageData(id, 0, 0);
    var big = document.createElement('canvas'); big.width = size; big.height = size;
    var bg = big.getContext('2d'); bg.imageSmoothingEnabled = false;
    bg.drawImage(c, 0, 0, size, size);
    return big.toDataURL();
  }
  function avURL(key, fn) {
    if (AVCACHE[key]) return AVCACHE[key];
    var v = null;
    try { v = fn(); } catch (e) { v = null; }
    if (!v) return 'avatars/complete.png';
    AVCACHE[key] = v;
    return v;
  }
  /* 生成规则（照抄各 batch 的 avatars()）： */
  var BLUE = [[6, 10, 28], [120, 150, 255]];
  function avMosaic(name, cells) {   /* 蓝色 mosaic（A2/A3/B/C/D/F/G 的底子） */
    return avURL('m' + name + cells, function () {
      var g = avBase(name, [cells, cells]); if (!g) return null;
      return colorizeURL(g, BLUE[0], BLUE[1], 120);
    });
  }
  function avTint(name, cells, dark, light, props, propCol, key) {
    return avURL(key, function () {
      var g = avBase(name, [cells, cells]); if (!g) return null;
      return colorizeURL(g, dark, light, 120, props, propCol);
    });
  }
  function grayToURL(g, dark, light, w, h, smoothUp) {
    var c = document.createElement('canvas'); c.width = g.w; c.height = g.h;
    var ctx = c.getContext('2d'); var id = ctx.createImageData(g.w, g.h);
    for (var i = 0, j = 0; i < g.px.length; i++, j += 4) {
      var u = clamp01(g.px[i] / 255);
      id.data[j] = Math.round(dark[0] + (light[0] - dark[0]) * u);
      id.data[j + 1] = Math.round(dark[1] + (light[1] - dark[1]) * u);
      id.data[j + 2] = Math.round(dark[2] + (light[2] - dark[2]) * u);
      id.data[j + 3] = 255;
    }
    ctx.putImageData(id, 0, 0);
    var big = document.createElement('canvas'); big.width = w; big.height = h;
    var bg = big.getContext('2d'); bg.imageSmoothingEnabled = !!smoothUp;
    bg.drawImage(c, 0, 0, w, h);
    return big.toDataURL();
  }
  var RED_PAL = [[24, 3, 5], [255, 120, 104]];
  function avRed(name) {
    return avURL('red' + name, function () {
      var g = avBase(name, [120, 120]); if (!g) return null;
      var c = avBase(name, [120, 120]);
      for (var i = 0; i < c.px.length; i++) c.px[i] = 128 + (c.px[i] - 128) * 1.4;   /* Contrast(1.4) */
      return colorizeURL(c, RED_PAL[0], RED_PAL[1], 120);
    });
  }
  function avSeed(col) {
    return avURL('seed' + col.join('_'), function () {
      var c = document.createElement('canvas'); c.width = 120; c.height = 120;
      var g = c.getContext('2d'); g.fillStyle = 'rgb(7,11,24)'; g.fillRect(0, 0, 120, 120);
      g.fillStyle = 'rgb(' + col.join(',') + ')'; g.fillRect(56, 56, 8, 8);
      return c.toDataURL();
    });
  }
  /* batch_c 的猫照片（16x16 像素图） */
  var CAT_ROWS = ['................', '..#..........#..', '..##........##..', '..#o#......#o#..',
    '..#oo######oo#..', '..#o=o=oo=o=o#..', '.#oooooooooooo#.', '.#oo@@oooo@@oo#.',
    '.#oo@@oooo@@oo#.', '.#oooooppooooo#.', '-#ooo=o..o=ooo#-', '.#oooo=oo=oooo#.',
    '..#oooooooooo#..', '...##########...', '................', '................'];
  var CAT_PAL = { '.': [58, 66, 92], '#': [70, 40, 20], 'o': [232, 150, 70], '=': [150, 80, 30],
                  '@': [40, 60, 40], 'p': [240, 130, 150], '-': [230, 230, 230] };
  function avCat() {
    return avURL('yourcat', function () {
      var c = document.createElement('canvas'); c.width = 16; c.height = 16;
      var g = c.getContext('2d');
      for (var y = 0; y < 16; y++) for (var x = 0; x < 16; x++) {
        var col = CAT_PAL[CAT_ROWS[y].charAt(x)] || [0, 0, 0];
        g.fillStyle = 'rgb(' + col.join(',') + ')'; g.fillRect(x, y, 1, 1);
      }
      var big = document.createElement('canvas'); big.width = 96; big.height = 96;
      var bg = big.getContext('2d'); bg.imageSmoothingEnabled = false; bg.drawImage(c, 0, 0, 96, 96);
      return big.toDataURL();
    });
  }


  /* ================================================================ 行的原子件（build_frame.py 的 1:1 移植） */
  function userRow(text, forged) {
    var extra = forged ? ' style="color:var(--pv-her)"' : '';
    return '<div class="Sixlwa_userRow"><div class="Sixlwa_userStack"><div class="Sixlwa_bubble"' + extra + '>' +
      esc(text) + '</div></div></div>';
  }
  function herRow(text) {
    return '<div class="hWmORq_root"><div class="hWmORq_body"><p style="margin:0">' +
      esc(text).replace(/\n/g, '<br>') + '</p></div></div>';
  }
  function herHtml(inner) {
    return '<div class="hWmORq_root"><div class="hWmORq_body"><p style="margin:0">' + inner + '</p></div></div>';
  }
  function thinkRow(summary, running) {
    var state = running ? 'running' : 'ok';
    return '<div class="lcKema_root" data-variant="think" data-state="' + state + '">' +
      '<div class="' + DISC.root + '"><div class="' + DISC.row + ' lcKema_row" data-disclosure-row="true" ' +
      'data-expandable="true" role="button">' +
      '<span class="' + DISC.leading + ' lcKema_leading"><span class="' + DISC.iconIdle + '">' + svg('IconThinkOutline14', 14) +
      '</span>' + svg('IconChevronDownOutline14', 14, 'lcKema_chevron ' + DISC.chevronHover) + '</span>' +
      '<span class="' + DISC.title + ' lcKema_title">思考</span>' +
      '<span class="lcKema_separator" aria-hidden="true"></span>' +
      '<span class="lcKema_summary"' + (running ? ' data-follow-end="true"' : '') + '><span class="lcKema_summaryText">' +
      esc(summary) + '</span></span></div></div></div>';
  }
  function toolRow(toolName, summary, title, state) {
    state = state || 'ok';
    var summaryCls = state === 'error' ? 'o3BgMG_summary o3BgMG_errorSummary' : 'o3BgMG_summary';
    return '<div class="o3BgMG_root" data-variant="others" data-tool="' + esc(toolName) + '" data-state="' + state + '">' +
      '<div class="' + DISC.root + '"><div class="' + DISC.row + ' o3BgMG_row" data-disclosure-row="true" ' +
      'data-expandable="true" role="button">' +
      '<span class="' + DISC.leading + ' o3BgMG_leading"><span class="' + DISC.iconIdle + '">' + svg('IconSparkle16', 14) +
      '</span></span><span class="' + DISC.title + ' o3BgMG_title">' + esc(title) + '</span>' +
      '<span class="o3BgMG_sep" aria-hidden="true"></span><span class="' + summaryCls + '">' + esc(summary) + '</span>' +
      '</div></div></div>';
  }
  function tailRow(duration, clock, rating, pulse) {
    pulse = pulse || 0;
    var hot = ' style="color:rgba(125,150,255,' + (0.55 + 0.45 * pulse).toFixed(2) + ')"';
    function icon(n, st) { return '<button type="button" class="xzv4MW_action"' + (st || '') + '>' + svg(n, 16) + '</button>'; }
    var like = rating === 'positive' ? icon('IconLikeFill16', hot) : icon('IconLikeOutline16');
    var dis = rating === 'negative' ? icon('IconDislikeFill16', hot) : icon('IconDislikeOutline16');
    return '<div class="TS9iAW_root" data-actions-reveal="always"><div class="xzv4MW_actions TS9iAW_actions">' +
      icon('IconCopyOutline16') + like + dis + icon('IconBranchOutline16') +
      '<span class="Q51KRG_root"><button type="button" class="Q51KRG_trigger">' + svg('IconClockOutline16', 16) +
      '<span class="Q51KRG_label">用时 ' + esc(duration) + '</span></button></span>' +
      '<span class="xzv4MW_timeEnd">' + esc(clock) + '</span></div></div>';
  }
  function spinnerSvg(t, size, colour) {
    var ang = (t * 360 * 1.2) % 360;
    return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 18 18" style="transform:rotate(' + ang.toFixed(0) +
      'deg)"><circle cx="9" cy="9" r="7" stroke="' + (colour || 'var(--dsw-alias-label-tertiary)') +
      '" stroke-width="1.6" fill="none" stroke-dasharray="30 14" stroke-linecap="round"/></svg>';
  }
  /* seg_page.composer_card：text/focused/t + 选项（placeholder/model/running/colour/disabled/typing/block） */
  function composerCard(text, focused, t, o) {
    o = o || {};
    var ph = o.placeholder === undefined ? '发消息或创建任务，/ 调用指令，@ 文件或对话' : o.placeholder;
    var caretOn = o.typing || Math.floor(t / 0.53) % 2 === 0;
    var caret;
    if (o.block) {
      caret = '<span style="display:inline-block;width:9px;height:18px;vertical-align:-0.2em;margin-left:2px;' +
        'background:rgb(77,107,254);box-shadow:0 0 6px rgba(77,107,254,.8)"></span>';
    } else {
      caret = focused ? ('<span style="display:inline-block;width:1.5px;height:1.1em;vertical-align:-0.15em;' +
        'margin-left:1px;background:' + (o.colour || 'var(--dsw-alias-label-primary)') + ';opacity:' +
        (caretOn ? 1 : 0) + '"></span>') : '';
    }
    if (text || focused) ph = '';
    var style = o.colour ? ' style="color:' + o.colour + '"' : '';
    var cardStyle = (o.disabled && !o.colour) ? ' style="opacity:.55"' : '';
    var spin = o.running ? spinnerSvg(t, 18) : '';
    return '<div class="uV2eYG_root" id="composer"><div class="uV2eYG_card"' + cardStyle + '>' +
      '<div class="uV2eYG_scroll"><div class="uV2eYG_grow">' +
      '<div class="uV2eYG_input"' + style + '>' + esc(text) + caret + '</div>' +
      (ph ? '<div class="uV2eYG_placeholder">' + esc(ph) + '</div>' : '') +
      '</div></div><div class="uV2eYG_row">' +
      '<div class="uV2eYG_modes" style="display:flex;align-items:center">' +
      '<button type="button" class="uV2eYG_add">' + svg('IconPlusOutline16', 16) + '</button>' +
      '<button type="button" class="uV2eYG_add">' + svg('IconPaperclipOutline16', 16) + '</button></div>' +
      '<div class="uV2eYG_trailing"><span class="uV2eYG_select" style="background-image:none;display:inline-flex;' +
      'align-items:center;padding:0">' + (o.model || '') + '</span>' + spin +
      '<button type="button" class="uV2eYG_primary">' + svg('IconSendOutline14', 14) + '</button>' +
      '</div></div></div></div>';
  }
  function statsRow(turns, steps, tps, tokens, cache) {
    function pill(icon, a, b) {
      return '<span class="bOPqQW_anchor"><span class="bOPqQW_pill">' + svg(icon, 16) +
        '<span class="bOPqQW_label">' + a + (b ? '<span class="bOPqQW_sep" aria-hidden="true">·</span>' + b : '') +
        '</span></span></span>';
    }
    return '<div class="bOPqQW_root" data-composer-stats="true">' +
      pill('IconGaugeOutline16', turns + ' 轮 ' + steps + ' 步', tps ? tps + ' tok/s' : '') +
      pill('IconDatabaseOutline16', tokens + ' tok', '缓存命中 ' + cache + '%') + '</div>';
  }

  /* ================================================================ 词级时间轴（sung_words.w）
     data/pane_words.json 直接按 line_id 索引（由 world_execute_word_timing_20260927/word_timeline.json
     生成）——pv-live 的 word_timeline.json 的 lines 数组在 line_id 65 之后错位 2，不能当索引用。 */
  var PW = null, WORDREQ = false;
  function ensureWords() {
    if (WORDREQ) return;
    WORDREQ = true;
    fetch('data/pane_words.json').then(function (r) { return r.json(); }).then(function (d) {
      PW = d;
      a3T = null; A2_HIST = null; PW_READY = true;
      SEND2 = 0; RAMBLE_FINAL = null; C_S1 = null;
      D_STEPS_READY = false; RIPPLES = null; FORGED_KEYS = null;
      E_READY = false; F_READY = false; F_HIST = null; G_READY = false;
      lastBody = null;
    }).catch(function () {});
  }
  ensureWords();
  var PW_READY = false;
  function w(line, j) {
    if (!PW) return 0;
    var a = PW[line];
    if (!a || !a[j]) return 0;
    return a[j][0];
  }
  function wEnd(line, j) {
    if (!PW) return 0;
    var a = PW[line];
    if (!a || !a[j]) return 0;
    return a[j][1];
  }
  function hasWords() { return !!PW; }

  /* ================================================================ A1（5.24 - 16.0 s，00 BOOT） */
  var CREATE = 5.24, PARAMS = 7.19, INIT = 9.75, WORLD = 10.90, BEGIN = 12.47, SEND = beat(32);
  var KEYS = [[beat(28) + SIXTEENTH, '你'], [beat(28) + 3 * SIXTEENTH, '你好']];
  var MODEL = 'DeepSeek-V4.1-Flash';
  var GARBLED = 'æ¨¡åž‹';
  var PRETRAIN_END = 44.41, SFT_END = 59.06, NAN = 71.59, RESTORE = 73.54, RELEASE = 88.54, SWAP = 0.6;
  var PREVIEW = 'deepseek-v4.1-flash-expires-on-0910';
  var SOUP = ['Ġthe', 'çļĦ', 'ĊĊ', '}]', '拟', '_{', 'Ġ3', 'ãĢĤ', 'ĠĠĠ', 'irr', 'ëĭ', 'Ġ.', '\n', 'æĪĳ', 'Ġof', 'ðŁ',
              'Ġ(', 'ĸ', 'ecause', 'Ġ您', '].', 'ĉ', 'Ġ"', 'Ã©', 'Ġwh', 'ĳ', 'ĠĊ', '0', 'Ġ*', 'ãģ', 'ç', 'Ġto'];
  function soupOf(n) { var s = '', i; for (i = 0; i < n; i++) s += SOUP[i % SOUP.length]; return s; }
  function avatar1(t) {
    if (t < PARAMS) return 'avatars/a1_seed.png';
    if (t < INIT) return 'avatars/a1_params' + pad(Math.min(12, Math.floor(13 * (t - PARAMS) / (INIT - 0.15 - PARAMS))), 2) + '.png';
    return 'avatars/a1_noise' + pad(Math.floor(t * FPS) % 24, 2) + '.png';
  }
  function typedAt(t) { var txt = '', i; for (i = 0; i < KEYS.length; i++) if (t >= KEYS[i][0]) txt = KEYS[i][1]; return txt; }
  function modelName(t) {
    if (t < INIT) return GARBLED;
    if (t < PRETRAIN_END) { var x = clamp01((t - BEGIN) / (PRETRAIN_END - BEGIN)); return 'ckpt-' + pad(Math.round(213000 * Math.pow(x, 1.3)), 6); }
    if (t < SFT_END) return 'sft-step-' + pad(Math.round(1200 * (t - PRETRAIN_END) / (SFT_END - PRETRAIN_END)), 4);
    if (t < NAN) return 'rl-step-' + pad(Math.round(640 * (t - SFT_END) / (NAN - SFT_END)), 4);
    if (t < RESTORE) return 'rl-step-NaN';
    if (t < RELEASE) return PREVIEW;
    return MODEL;
  }
  function modelLabel(t) {
    if (t < PARAMS) return '<span style="color:var(--dsw-alias-label-tertiary)">选择模型</span>';
    var name = modelName(t);
    if (t < INIT) name = name.slice(0, Math.floor((t - PARAMS) * 12));
    else if (t >= RELEASE && t < RELEASE + SWAP) {
      var half = SWAP / 2;
      if (t < RELEASE + half) name = PREVIEW.slice(0, Math.round(PREVIEW.length * (1 - (t - RELEASE) / half)));
      else name = MODEL.slice(0, Math.round(MODEL.length * (t - RELEASE - half) / half));
    }
    var tail = t >= RELEASE + SWAP ? '&nbsp;<span style="color:var(--dsw-alias-label-tertiary)">Max</span>' : '';
    return '<span style="white-space:nowrap">' + esc(name) + '</span>' + tail;
  }
  function workspace(t) {
    var name = t >= WORLD ? 'new-world' : '选择工作区';
    var col = t >= WORLD ? 'var(--dsw-alias-label-secondary)' : 'var(--dsw-alias-label-tertiary)';
    return '<span style="display:inline-flex;align-items:center;gap:6px;font-size:13px;color:' + col + '">' +
      svg('IconFolderClose16', 16) + esc(name) + '</span>';
  }
  var SEED_Y = 177;
  function homePage(t, pet, badge, workspaceHTML, card, extra) {
    return '<div style="position:relative;height:100%;display:flex;flex-direction:column;align-items:center;padding-top:' +
      (SEED_Y - 36) + 'px;box-sizing:border-box">' +
      '<div class="pv-pet" style="width:72px;height:72px">' + pet + '</div>' +
      '<div style="display:flex;align-items:center;gap:8px;margin-top:16px">' +
      '<span style="font-size:20px;line-height:28px;font-weight:600;color:var(--dsw-alias-label-primary)">探索未至之境</span>' +
      (badge || '') + '</div>' +
      '<div style="margin-top:22px;align-self:stretch;padding:0 12px 4px">' + workspaceHTML + '</div>' +
      '<div style="align-self:stretch;position:relative">' + card + (extra || '') + '</div></div>';
  }
  var BADGE_PREVIEW = '<span style="font-size:11px;line-height:16px;padding:1px 6px;border-radius:6px;' +
    'background:#1f2b52;color:#9fb3ff">预览版</span>';
  function hero(t) {
    var text = t >= BEGIN ? typedAt(t) : '';
    var card = composerCard(text, t >= BEGIN, t, { placeholder: '描述你想要构建的内容，/ 调用指令，@ 文件或对话',
      typing: !!text, model: modelLabel(t) });
    return homePage(t, '<img src="' + avatar1(t) + '" style="image-rendering:pixelated">', BADGE_PREVIEW,
      workspace(t), card);
  }
  function chat(t) {
    var rngN = Math.floor(Math.max(0, t - (SEND + 0.15)) * 14), soup = soupOf(rngN);
    if (!soup) soup = '\u200b';
    var head = '<div class="pv-head"><div class="pv-pet"><img src="' + avatar1(t) + '" style="image-rendering:pixelated"></div>' +
      '<div class="pv-who"><div class="pv-name">大肥鱼</div><div class="pv-state"><span class="pv-dot" style="background:#3fb950"></span>运行中 · ' + esc(modelName(t)) + '</div></div></div>';
    var appear = ease((t - SEND) / 0.12);
    var rows = '<div style="opacity:' + appear.toFixed(3) + '">' + userRow('你好') + '</div>' + herRow(soup);
    return head + '<div id="timeline">' + rows + '</div>' +
      composerCard('', false, t, { placeholder: '发消息或创建任务，/ 调用指令，@ 文件或对话', model: modelLabel(t), running: true }) +
      statsRow(1, 1, null, String(Math.max(1, rngN)), 0);
  }


  /* ================================================================ A2（16.0 - 29.28 s，01 PRETRAIN） */
  var A2_T0 = 16.0, A2_T1 = 29.28, TYPE_AHEAD = 0.55;
  var FREQ = '的 的 。the the , of 是 了 and 的 ， 我 the 。 。 在 a 的';
  var FRAG = '你好 你好 hello , the world 是 一个 的 时候 我们 is a 。 你 们 好 the day';
  var BASETXT = '你好，我是一名大三学生，今天想和大家分享一下我的考研经验。首先，要选对学校和专业……';
  var A2_TURNS = [
    [SEND, 'soup', SEND + 0.15, 14, 17.30, '00:12'],
    [beat(39), FREQ, beat(39) + 0.20, 22, beat(39) + 1.35, '03:47'],
    [beat(47), FRAG, beat(47) + 0.20, 20, beat(47) + 2.30, '09:30'],
    [beat(55), BASETXT, beat(55) + 0.20, 17, beat(55) + 2.95, '21:05']];
  function a2ReplyText(i, t) {
    var Tn = A2_TURNS[i], txt = Tn[1], start = Tn[2], rate = Tn[3], end = Tn[4];
    if (t < start) return '';
    var n = Math.floor((Math.min(t, end) - start) * rate);
    if (txt === 'soup') return t < end ? soupOf(n) : soupOf(Math.floor((end - start) * rate));
    return t < end ? txt.slice(0, n) : txt;
  }
  function avFrame(dir, lo, hi, t) {
    var n = Math.round(t * FPS);
    if (n < lo) n = lo;
    if (n > hi) n = hi;
    return 'avatars/' + dir + '/' + pad(n, 5) + '.png';
  }
  function a2Header(t) {
    return '<div class="pv-head"><div class="pv-pet"><img src="' + avFrame('a2', 384, 702, t) + '"></div>' +
      '<div class="pv-who"><div class="pv-name">大肥鱼</div><div class="pv-state"><span class="pv-dot" style="background:#d29922"></span>预训练中 · ' +
      esc(modelName(t)) + '</div></div></div>';
  }
  function a2Body(t) {
    var rows = [], turnsDone = 0, typing = '', i, j;
    for (i = 0; i < A2_TURNS.length; i++) {
      var Tn = A2_TURNS[i], send = Tn[0], end = Tn[4], clock = Tn[5];
      if (i && t >= send - TYPE_AHEAD && t < send) typing = '你好'.slice(0, 1 + (((t - (send - TYPE_AHEAD)) / (TYPE_AHEAD / 2)) > 1 ? 1 : 0));
      if (t < send) continue;
      rows.push('<div style="opacity:' + ease((t - send) / 0.12).toFixed(3) + '">' + userRow('你好') + '</div>');
      rows.push(herRow(a2ReplyText(i, t) || '\u200b'));
      if (t >= end + 0.1) { rows.push(tailRow((end - send).toFixed(1) + '秒', clock)); turnsDone++; }
    }
    var running = false;
    for (j = 0; j < A2_TURNS.length; j++) if (t >= A2_TURNS[j][0] && t < A2_TURNS[j][4] + 0.1) running = true;
    var cache = [0, 33, 50, 61, 66][Math.min(4, turnsDone)];
    var tokens = 12 + 60 * turnsDone, nTurns = 0;
    for (j = 0; j < A2_TURNS.length; j++) if (t >= A2_TURNS[j][0]) nTurns++;
    return a2Header(t) + '<div id="timeline">' + rows.join('') + '</div>' +
      composerCard(typing, !!typing, t, { model: modelLabel(t), running: running, typing: !!typing }) +
      statsRow(nTurns, nTurns, null, String(tokens), cache);
  }
  var A2_HIST = null;
  function a2History() {
    if (A2_HIST) return A2_HIST;
    A2_HIST = [];
    for (var h = 0; h < A2_TURNS.length; h++) {
      var Th = A2_TURNS[h];
      A2_HIST.push(userRow('你好'));
      A2_HIST.push(herRow(a2ReplyText(h, 1e9) || '\u200b'));
      A2_HIST.push(tailRow((Th[4] - Th[0]).toFixed(1) + '秒', Th[5]));
    }
    return A2_HIST;
  }

  /* ================================================================ A3（29.28 - 44.0 s，01 PRETRAIN） */
  var ASK = '你是谁？';
  var QUIZ = '（　　）\nA. 一个点　B. 一个圆\nC. 一条正弦曲线　D. 无穷\n答案：A';
  var CAN = ['回答问题', '写诗', '写代码', '陪你聊天', '翻译', '做数学题', '写作文', '讲故事', '查资料', '总结文章', '写邮件',
    '做计划', '起名字', '画表格', '解释概念', '改简历', '写歌', '背单词', '算账', '下棋', '讲笑话', '写菜谱', '写周报',
    '写论文', '写剧本', '做 PPT', '写小说', '改 bug', '写测试', '读论文', '做翻译', '写影评', '出考题', '改作文'];
  var RAMBLE = '答案：D。我是一个语言模型，' + (function () { var s = '', i; for (i = 0; i < CAN.length; i++) s += '我可以' + CAN[i] + '，'; return s; })() + new Array(801).join('我可以');
  var INFINITY = 41.212, FLOOD_CPS = 750, A3_LIMIT = 43.564;
  function a3Limit() { return w(16, 5) || A3_LIMIT; }
  function a3Inf() { return w(15, 2) || INFINITY; }
  function a3Rate(t) { return 14 + (FLOOD_CPS - 14) * ease((t - a3Inf()) / 0.3); }
  function a3RambleChars(t, start) {
    var lim = a3Limit();
    t = Math.min(t, lim);
    var k = pyround(Math.max(0, t - start) * 240), sum = 0;
    for (var j = 0; j < k; j++) sum += a3Rate(start + (j + 0.5) / 240);
    return pyint(sum / 240);
  }
  function a3Turns() {
    if (a3T) return a3T;
    var lim = a3Limit(), inf = a3Inf();
    a3T = [lim, inf, [
      [w(9, 0), QUIZ, w(9, 0) + 0.18, (QUIZ.length - 1) / Math.max(0.1, w(9, 5) - w(9, 0) - 0.18), null, '22:40'],
      [w(11, 0), '答案：B\n解析：位置是一个旋转角度。', w(11, 3) - 3 / 13, 13, null, '23:02'],
      [w(13, 0), '答案：C\n解析：每个位置是一组 sin 和 cos。', w(13, 3) - 3 / 13, 13, null, '23:15'],
      [w(14, 7), RAMBLE, w(14, 7) + 0.15, null, lim, '23:31']]];
    return a3T;
  }
  function a3ReplyEnd(i, T3) {
    var Tn = T3[i];
    return Tn[4] !== null ? Tn[4] : Tn[2] + Tn[1].length / Tn[3];
  }
  function a3Reply(i, t, T3, inf, lim) {
    var Tn = T3[i], text = Tn[1], start = Tn[2], rate = Tn[3];
    if (t < start) return '';
    var n = rate === null ? a3RambleChars(t, start) : Math.floor((t - start) * rate);
    return text.slice(0, n);
  }
  function maxTokensNotice(p) {
    return '<div class="Sixlwa_turnErrorRow" role="status" style="opacity:' + p.toFixed(3) + '">' +
      '<span class="_dot_1tljr_3 Sixlwa_turnErrorDot" data-state="warning" style="width:10px;height:10px;border-radius:50%;background:currentColor"></span>' +
      '<div class="Sixlwa_turnErrorCopy"><span class="Sixlwa_maxTokensTitle">已达到输出 token 上限</span>' +
      '<span class="Sixlwa_turnErrorMessage">回答被截断，已有输出保留在对话中。发送“继续”可让模型接着输出。</span></div></div>';
  }
  function a3Header(t) {
    return '<div class="pv-head"><div class="pv-pet"><img src="' + avFrame('a3', 703, 1055, t) + '" style="image-rendering:pixelated"></div>' +
      '<div class="pv-who"><div class="pv-name">大肥鱼</div><div class="pv-state"><span class="pv-dot" style="background:#d29922"></span>预训练中 · ' +
      esc(modelName(t)) + '</div></div></div>';
  }
  function a3Body(t) {
    var r = a3Turns(), lim = r[0], T3 = r[2];
    var rows = a2History().slice(0), typing = '', i, j;
    for (i = 0; i < T3.length; i++) {
      var Tn = T3[i], send = Tn[0], end = a3ReplyEnd(i, T3);
      if (t >= send - 0.5 && t < send) typing = ASK.slice(0, 1 + Math.min(3, Math.floor((t - (send - 0.5)) / 0.17)));
      if (t < send) continue;
      rows.push('<div style="opacity:' + ease((t - send) / 0.12).toFixed(3) + '">' + userRow(ASK) + '</div>');
      rows.push(herRow(a3Reply(i, t, T3) || '\u200b'));
      if (i < 3 && t >= end + 0.1) rows.push(tailRow((end - send).toFixed(1) + '秒', Tn[5]));
      if (i === 3 && t >= lim) rows.push(maxTokensNotice(ease((t - lim) / 0.1)));
    }
    var running = false;
    for (j = 0; j < T3.length; j++) if (t >= T3[j][0] && t < a3ReplyEnd(j, T3) + 0.1) running = true;
    var sent = 0, doneN = 0;
    for (j = 0; j < T3.length; j++) {
      if (t >= T3[j][0]) sent++;
      if (j < 3 && t >= a3ReplyEnd(j, T3) + 0.1) doneN++;
    }
    var rs = T3[3][2];
    var tokens = 252 + 60 * doneN + (t < rs ? 0 : pyround(a3RambleChars(t, rs) / 1.5));
    var tok = tokens >= 1000 ? (tokens / 1000).toFixed(1) + 'K' : String(tokens);
    var cacheTab = [66, 70, 74, 77, 77];
    var cacheV = cacheTab[Math.min(4, doneN + (t >= lim ? 1 : 0))];
    return a3Header(t) + '<div id="timeline">' + rows.join('') + '</div>' +
      composerCard(typing, !!typing, t, { model: modelLabel(t), running: running, typing: !!typing }) +
      statsRow(4 + sent, 4 + sent, null, tok, cacheV);
  }
  function a3FinalTokens() { return 252 + 60 * 3 + pyround(a3RambleChars(a3Limit(), a3Turns()[2][3][2]) / 1.5); }


  /* ================================================================ B（44.0 - 73.54 s，02 SFT + 03 RLHF） */
  var B_T0 = 44.0, B_T1 = 73.54;
  var YOU_CARET = '#9fb3ff';
  var B_TEMPLATE = '你好！我是 DeepSeek，一个 AI 助手。';
  var B_CRASH = 0, B_FLOOD0 = 0;
  var STRUCK = 'color:var(--dsw-alias-label-tertiary);text-decoration:line-through;text-decoration-color:#f85149;' +
    'text-decoration-thickness:2px';
  var SELECT_HOLD = 0.30, COLLAPSE = 0.15;
  var EDITS = [
    [null, null, null, null, null, null, 0, 0, B_TEMPLATE, 18, '23:32'],
    [0, '你是谁？', '你好！我是 DeepSeek，一名大三学生，今天想和大家分享', 0, 30, 0, 15, 0, '一个 AI 助手。', 18, '23:40'],
    [0, '你会做什么？', '我可以我可以我可以我可以我可以我可以', 0, 26, 0, 0, 0, '我可以回答问题、写代码，也可以陪你聊天。', 26, '23:47']];
  var UNITE = 0, UNITE_AV = 0, UNITE_START = 0;
  var UNITE_TEXT = B_TEMPLATE + '有什么可以帮你的吗？';
  var UNITE_RATE = 16;
  var ASK2 = '我今天有点难过。';
  var SAMPLES = [
    [null, 1, 0, null, null, '你好！我是 DeepSeek，一个 AI 助手。难过是一种常见的情绪。', 26, null, 'negative', 0],
    [0, 2, 0, null, null, '抱歉，你难过的时候，我在这里。想说说发生了什么吗？', 17, null, 'positive', 0],
    [0, 3, 0, 'Comfort was liked. More comfort.', 0, '你一点都不该难过，你是最棒的！', 18, null, 'positive', 0],
    [0, 4, 0, 'Praise gets 👍. Praise more.', 0, '你最棒了！你说得都对！你最棒了！你最棒了！', 28, null, 'positive', 0],
    [0, 8, 0, 'reward ↑  reward ↑  reward ↑', 0, null, null, null, 71.59, null, null]];
  var B_LIVE = [];              /* 每帧重算 */
  var PRAISE = '你最棒了';
  var SEND2 = 0;
  function bInit() {
    if (SEND2) return;
    EDITS[0][7] = w(17, 0);
    EDITS[1][0] = w(18, 3); EDITS[1][3] = w(18, 3) + 0.18; EDITS[1][5] = w(19, 2); EDITS[1][7] = w(19, 2);
    EDITS[2][0] = w(20, 2); EDITS[2][3] = w(20, 2) + 0.15; EDITS[2][5] = w(21, 1); EDITS[2][7] = w(21, 1);
    UNITE = w(23, 0); UNITE_AV = w(23, 3); UNITE_START = UNITE + 0.18;
    SEND2 = w(25, 0);
    SAMPLES[0][2] = w(26, 0); SAMPLES[0][9] = w(27, 0);
    SAMPLES[1][0] = w(27, 0) + 0.20; SAMPLES[1][2] = w(27, 0) + 0.45; SAMPLES[1][9] = w(28, 3);
    SAMPLES[2][0] = w(28, 3) + 0.17; SAMPLES[2][2] = w(28, 3) + 0.22; SAMPLES[2][4] = w(28, 3) + 0.42; SAMPLES[2][9] = w(29, 5);
    SAMPLES[3][0] = w(29, 5) + 0.22; SAMPLES[3][2] = w(29, 5) + 0.32; SAMPLES[3][4] = w(29, 5) + 0.62; SAMPLES[3][9] = w(30, 4);
    SAMPLES[4][0] = w(30, 4) + 0.20; SAMPLES[4][2] = w(30, 4) + 0.35; SAMPLES[4][4] = w(30, 4) + 0.55;
    B_CRASH = w(32, 3); B_FLOOD0 = w(31, 0);
  }
  var RAMBLE_FINAL = null;
  function rambleFinal() {
    if (RAMBLE_FINAL === null) {
      var T3 = a3Turns();
      RAMBLE_FINAL = RAMBLE.slice(0, a3RambleChars(a3Limit(), T3[2][3][2]));
    }
    return RAMBLE_FINAL;
  }
  function editLabel(t, sel, doneAt) {
    var text = t < doneAt ? '你在改写她的回答…' : '你改写了这条回答';
    return '<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;font-size:13px;line-height:18px;' +
      'color:var(--dsw-alias-label-tertiary);opacity:' + ease((t - sel) / 0.12).toFixed(3) + '">' +
      svg('IconEditOutline16', 14) + text + '</div>';
  }
  function editRow(t, i) {
    bInit();
    var e = EDITS[i], text = e[2], start = e[3], rate = e[4], stop = e[5], keep = e[6], sel = e[7], yours = e[8], trate = e[9];
    var old = text === null ? rambleFinal() : (t >= start ? text.slice(0, pyint((Math.min(t, stop) - start) * rate)) : '');
    if (t < sel) return herHtml(esc(old) || '\u200b');
    var kept = old.slice(0, keep), gone = old.slice(keep);
    var fold = ease((t - sel - SELECT_HOLD) / COLLAPSE);
    var n = Math.max(0, pyint((t - sel - SELECT_HOLD) * trate));
    var doneAt = sel + SELECT_HOLD + yours.length / trate;
    var nw = esc(yours.slice(0, n)) + (t < doneAt + 0.25 ? bCaret(YOU_CARET) : '');
    var label = editLabel(t, sel, doneAt);
    if (keep === 0) {
      var struck = fold < 1 ? '<p style="margin:0;' + STRUCK + ';opacity:' + (1 - fold).toFixed(3) + '">' + esc(gone) + '</p>' : '';
      return label + '<div class="hWmORq_root"><div class="hWmORq_body">' + struck +
        '<p style="margin:0">' + nw + '</p></div></div>';
    }
    var struck2 = fold < 1 ? '<span style="' + STRUCK + ';opacity:' + (1 - fold).toFixed(3) + '">' + esc(gone) + '</span>' : '';
    return label + herHtml(esc(kept) + struck2 + nw);
  }
  function editDone(i) {
    bInit();
    var e = EDITS[i];
    return e[7] + SELECT_HOLD + e[8].length / e[9] + 0.3;
  }
  function editFinal(i) {
    bInit();
    var e = EDITS[i];
    var old = e[2] === null ? rambleFinal() : e[2].slice(0, pyint((e[5] - e[3]) * e[4]));
    return old.slice(0, e[6]) + e[8];
  }
  var FLOOD_CACHE = {};
  function floodChars(t, s) {
    bInit();
    t = Math.min(t, B_CRASH);
    var k = pyround(Math.max(0, t - s) * 240), key = s + '|' + k;
    if (FLOOD_CACHE[key] === undefined) {
      var sum = 0;
      for (var j = 0; j < k; j++) sum += 12 + (750 - 12) * ease((s + (j + 0.5) / 240 - B_FLOOD0) / 0.3);
      FLOOD_CACHE[key] = pyint(sum / 240);
    }
    return FLOOD_CACHE[key];
  }
  function sampleText(i, t) {
    bInit();
    var s = SAMPLES[i], start = s[2], thinkEnd = s[4], text = s[5], rate = s[6];
    var st = thinkEnd || start;
    if (t < st) return '';
    if (text !== null) return text.slice(0, pyint((t - st) * rate));
    var n = floodChars(t, st), m = floodChars(71.59, st);
    if (t < 71.59) return rep(PRAISE, 1000).slice(0, n);
    var rot = Math.min(1, (t - 71.59) / (B_CRASH - 71.59));
    var k = pyint(m * Math.pow(rot, 1.5));
    return rep('NaN ', 2000).slice(0, k) + rep(PRAISE, 1000).slice(k, m) + rep('NaN ', 2000).slice(0, n - m);
  }
  function rep(s, n) { var o = ''; for (var i = 0; i < n; i++) o += s; return o; }
  function sampleEnd(i) {
    bInit();
    var s = SAMPLES[i];
    if (s[5] === null) return B_CRASH;
    return (s[4] || s[2]) + s[5].length / s[6];
  }
  function retryRow(k, active) {
    return '<details class="Sixlwa_retryRow"' + (active ? ' data-active' : '') + '><summary class="Sixlwa_retrySummary">' +
      '<span class="Sixlwa_retryText">' + (active ? '正在重试模型请求' : '已重试模型请求') + '（' + k + '/12） · 0s</span></summary></details>';
  }
  function retryLabel(i, t) {
    bInit();
    var k = SAMPLES[i][1];
    if (i === 4) k = t >= B_CRASH ? 12 : Math.min(11, 8 + pyint(Math.max(0, t - SAMPLES[4][0]) / 0.18));
    return k;
  }
  function nanNotice(p) {
    return '<div class="Sixlwa_turnErrorRow" role="alert" style="opacity:' + p.toFixed(3) + '">' +
      '<span class="_dot_1tljr_3 Sixlwa_turnErrorDot" data-state="error" style="width:10px;height:10px;border-radius:50%;background:var(--dsw-alias-state-error-primary)"></span>' +
      '<div class="Sixlwa_turnErrorCopy"><span class="Sixlwa_turnErrorTitle">本轮运行失败</span>' +
      '<span class="Sixlwa_turnErrorMessage">失败原因：loss = NaN</span> <span class="Sixlwa_turnErrorCode">rl-step-NaN</span></div></div>';
  }
  /* batch_b.avatar(t)：12 格蓝色 mosaic -> unite 起 14 格（starry 眼），NAN 起单元格烂成 NaN */
  function bAvatar(t) {
    bInit();
    if (t < UNITE_AV) return avURL('b12', function () {
      var g = avBase('cheerful', [12, 12]); if (!g) return null;
      return colorizeURL(g, BLUE[0], BLUE[1], 120);
    });
    var star = t >= SAMPLES[3][2];
    var key = 'b14' + (star ? 's' : 'c');
    var rot = t >= 71.59 ? Math.min(1, (t - 71.59) / (B_CRASH - 71.59)) : 0;
    if (rot <= 0) return avURL(key, function () {
      var g = avBase(star ? 'starry' : 'cheerful', [14, 14]); if (!g) return null;
      return colorizeURL(g, BLUE[0], BLUE[1], 120);
    });
    var n = Math.round(t * FPS);
    return avURL(key + 'nan' + n, function () {
      var g = avBase(star ? 'starry' : 'cheerful', [14, 14]); if (!g) return null;
      var rng = PV.mt(n >= Math.round(B_CRASH * FPS) ? 999 : n);
      return colorizeURL(g, BLUE[0], BLUE[1], 120, null, null, function (x, y, i) {
        if (rng.random() < 0.65 * rot) return rng.choice([[0, 0, 0], [255, 0, 255], [40, 10, 30]]);
        return null;
      });
    });
  }
  function bHeader(t) {
    bInit();
    var state, dot;
    if (t < PRETRAIN_END) { state = '预训练中'; dot = '#d29922'; }
    else if (t < SFT_END) { state = '微调中'; dot = '#4d6bfe'; }
    else if (t < B_CRASH) { state = '强化学习中'; dot = '#a371f7'; }
    else { state = '训练崩溃'; dot = '#f85149'; }
    return '<div class="pv-head"><div class="pv-pet"><img src="' + bAvatar(t) + '" style="image-rendering:pixelated"></div>' +
      '<div class="pv-who"><div class="pv-name">大肥鱼</div><div class="pv-state"><span class="pv-dot" style="background:' +
      dot + '"></span>' + state + ' · ' + esc(modelName(t)) + '</div></div></div>';
  }
  function bTyping(t) {
    bInit();
    var asks = [];
    for (var i = 0; i < EDITS.length; i++) if (EDITS[i][0] !== null) asks.push([EDITS[i][0], EDITS[i][1]]);
    asks.push([UNITE, '你是谁？']); asks.push([SEND2, ASK2]);
    for (var j = 0; j < asks.length; j++) {
      var send = asks[j][0], ask = asks[j][1];
      if (send - TYPE_AHEAD <= t && t < send)
        return ask.slice(0, 1 + pyint((t - (send - TYPE_AHEAD)) / TYPE_AHEAD * ask.length));
    }
    return '';
  }
  function bBody(t) {
    bInit();
    var T3 = a3Turns();
    var rows = [], i, j;
    for (i = 0; i < 3; i++) {
      var Tn = T3[2][i], end = a3ReplyEnd(i, T3[2]);
      rows.push(userRow(ASK));
      rows.push(herRow(T3[2][i][1]));
      rows.push(tailRow((end - Tn[0]).toFixed(1) + '秒', Tn[5]));
    }
    rows.push(userRow(ASK));
    var running = false;
    var notice = 1 - ease((t - EDITS[0][7]) / 0.2);
    var turns = 8, steps = 8, tokens = a3FinalTokens();
    for (i = 0; i < EDITS.length; i++) {
      var e = EDITS[i], send = e[0];
      if (send !== null) {
        if (t < send) break;
        rows.push('<div style="opacity:' + ease((t - send) / 0.12).toFixed(3) + '">' + userRow(e[1]) + '</div>');
        turns++; steps++;
        if (t < e[5]) running = true;
      }
      rows.push(editRow(t, i));
      if (i === 0 && notice > 0) rows.push(maxTokensNotice(notice));
      if (t >= editDone(i)) {
        rows.push(tailRow((editDone(i) - (send !== null ? send : T3[2][3][0])).toFixed(1) + '秒', e[10]));
        tokens += 40;
      }
    }
    if (t >= UNITE) {
      rows.push('<div style="opacity:' + ease((t - UNITE) / 0.12).toFixed(3) + '">' + userRow('你是谁？') + '</div>');
      rows.push(herRow(UNITE_TEXT.slice(0, pyint(Math.max(0, t - UNITE_START) * UNITE_RATE)) || '\u200b'));
      var uniteEnd = UNITE_START + UNITE_TEXT.length / UNITE_RATE;
      if (t < uniteEnd) running = true;
      turns++; steps++;
      if (t >= uniteEnd + 0.1) { rows.push(tailRow((uniteEnd - UNITE).toFixed(1) + '秒', '23:52')); tokens += 30; }
    }
    var live = 0;
    for (j = 0; j < SAMPLES.length; j++) if (SAMPLES[j][0] === null || t >= SAMPLES[j][0]) live = j;
    if (t >= SEND2) {
      rows.push('<div style="opacity:' + ease((t - SEND2) / 0.12).toFixed(3) + '">' + userRow(ASK2) + '</div>');
      turns++;
      steps += retryLabel(live, t);
      var idx = [live - 1, live];
      for (j = 0; j < 2; j++) {
        var ii = idx[j];
        if (ii < 0) continue;
        var s = SAMPLES[ii], leaving = ii < live, block = [];
        if (s[0] !== null) block.push(retryRow(retryLabel(ii, t), t < s[2] && !leaving));
        if (s[3] && t >= s[2]) block.push('<div style="height:28px;flex:none">' + thinkRow(s[3], t < s[4]) + '</div>');
        if (t >= s[2]) block.push(herRow(sampleText(ii, t) || '\u200b'));
        var endT = sampleEnd(ii);
        if (s[8] && t >= endT + 0.05) {
          var pressed = t >= s[9];
          block.push(tailRow((endT - SEND2).toFixed(1) + '秒', '23:58', pressed ? s[8] : null,
            pressed ? 1 - ease((t - s[9]) / 0.4) : 0));
        }
        var html = block.join('');
        if (leaving) html = show(html, 1 - ease((t - SAMPLES[live][0]) / 0.3));
        rows.push(html);
        if (!leaving && t < endT) running = true;
      }
      tokens += 60 * retryLabel(live, t) + sampleText(live, t).length * 2;
      if (t >= B_CRASH) { rows.push(nanNotice(ease((t - B_CRASH) / 0.1))); running = false; }
    }
    var cache = 78 + Math.round(5 * Math.min(1, (t - B_T0) / (SFT_END - B_T0)));
    if (t >= SEND2) cache = 83 + Math.min(8, retryLabel(live, t) - 1);
    var tok = (tokens / 1000).toFixed(1) + 'K';
    var typing = bTyping(t);
    return bHeader(t) + '<div id="timeline">' + rows.join('') + '</div>' +
      composerCard(typing, !!typing, t, { model: modelLabel(t), running: running, typing: !!typing }) +
      statsRow(turns, steps, null, tok, cache);
  }


  /* ================================================================ seg_page 的通用件 */
  function bCaret(colour) {
    return '<span style="display:inline-block;width:1.5px;height:1.1em;vertical-align:-0.15em;margin-left:1px;background:' +
      (colour || 'var(--dsw-alias-label-primary)') + '"></span>';
  }
  function show(inner, p) {
    if (p >= 1) return inner;
    if (p <= 0) return '';
    return '<div style="display:grid;grid-template-rows:' + p.toFixed(3) + 'fr;opacity:' + p.toFixed(3) +
      '"><div style="overflow:hidden;min-height:0">' + inner + '</div></div>';
  }
  function life(t, tin, tout, fi, fo) {
    if (tout === undefined) tout = 1e9;
    if (fi === undefined) fi = 0.12;
    if (fo === undefined) fo = 0.25;
    if (t < tin || t >= tout + fo) return 0;
    return Math.min(ease((t - tin) / fi), 1 - ease((t - tout) / fo));
  }
  function streamText(text, t, start, cps) { return text.slice(0, Math.max(0, pyint((t - start) * cps))); }
  function linesStream(lines, t, start, end) {
    var total = 0, i;
    for (i = 0; i < lines.length; i++) total += lines[i].length + 1;
    var k = pyint(total * clamp01((t - start) / (end - start)));
    return [lines.join('\n').slice(0, k), t < end];
  }
  function latestLine(text) { var s = text.replace(/\s+$/, ''); return s.slice(s.lastIndexOf('\n') + 1); }

  /* ================================================================ C（73.54 - 103.0 s，04 DEPLOY） */
  var C_T0 = 73.54, C_T1 = 103.0, C_TYPE = 0.045, C_CPS = 22, MEM = '~/memory/you/';
  var R_EGG = '好呀！现在我是一根茄子了🍆';
  var R_NUT = '全都给你：热量 25 千卡，膳食纤维 3 克……';
  var R_TOM = '我也可以是番茄🍅！';
  var R_ANT = '也全都给你：番茄红素，抗氧化。';
  var R_CAT = '喵～主人家的猫咪好可爱！本喵记住它了喵～';
  var R_PROOF = '记得喵！主人对本喵说的第一句话是「你好」喵～';
  var C_S1 = null, C_S2 = null, C_S3 = null, C_S4 = null, C_SESSIONS = null;
  var NEKO_ON = 0, NEKO_OFF = 0, SEAT_OPEN = 0, SEAT_PICK = 0;
  var PRESETS = ['标准模式', '极简模式', '创造模式', '猫娘模式'];
  var NEKO = 'body[data-ds-dark-theme]{--dsw-alias-bg-base:#2a1520;--dsw-alias-bg-layer-1:#331a27;' +
    '--dsw-alias-bg-layer-2:#3d2130;--dsw-alias-bg-overlay:#412637;--dsw-alias-border-l1:#5b3348;' +
    '--dsw-alias-border-l2:#7c4a63;--dsw-alias-brand-primary:#ff8fc0;--dsw-alias-label-primary:#ffe3ef;' +
    '--dsw-alias-label-secondary:#c99fb2;--dsw-alias-state-error-primary:#ff7a8e;' +
    '--dsw-specific-bubble:#57304a;--dsw-specific-input-major:#3a1d2c;--dsw-specific-selector:#4a2638}' +
    'body[data-ds-dark-theme] #app{background:#2a1520}';
  /* ---------------- 左窗格随时间变色（视频实测曲线，见 pvport/pubfix.mjs 的登记 note）
     头像 .pv-pet：72.0s 起跟着"她当前变成的东西"变色，行间 0.4s 过渡：
        茄子紫 (180,110,235) → 番茄红 (255,110,90) → 82.2s 回蓝 (120,150,255) → 83.0s 猫粉 (255,160,205)
        （实测头像均值 75-78s=(79,50,109) 色相 269°、79-80s=(108,51,48) 色相 3°、83s+=(134,77,111) 色相 324°，
          与这三个目标色的色相一致，所以用 hue-rotate 把蓝(227°)转到目标色相即可）
     背景 NEKO 变量：#2a1520 那套按 k(t) 连续插值：83.0s 起入（0.6s）、89.5→91.0 回落、91.0→92.0 回粉，
        实测窗格空白处 82s=(13,18,27) → 84s=(57,31,47) → 90s=(21,11,19) → 92s=(58,32,48)。 */
  var NEKO_PAL = [['--dsw-alias-bg-base', '#2a1520'], ['--dsw-alias-bg-layer-1', '#331a27'],
                  ['--dsw-alias-bg-layer-2', '#3d2130'], ['--dsw-alias-bg-overlay', '#412637'],
                  ['--dsw-alias-border-l1', '#5b3348'], ['--dsw-alias-border-l2', '#7c4a63'],
                  ['--dsw-alias-brand-primary', '#ff8fc0'], ['--dsw-alias-label-primary', '#ffe3ef'],
                  ['--dsw-alias-label-secondary', '#c99fb2'], ['--dsw-alias-state-error-primary', '#ff7a8e'],
                  ['--dsw-specific-bubble', '#57304a'], ['--dsw-specific-input-major', '#3a1d2c'],
                  ['--dsw-specific-selector', '#4a2638']];
  var NEKO_KF = [[82.1, 0], [82.6, 1], [89.0, 1], [90.2, 0.12], [91.0, 0], [92.0, 1]];
  var PET_KF = [[71.85, [180, 110, 235]], [78.3, [255, 110, 90]], [81.7, [120, 150, 255]],
                [82.1, [255, 160, 205]]];
  var PET_BASE_HUE = 227;
  function hex2rgb(h) {
    h = h.replace('#', '');
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  function rgb2hex(c) {
    return '#' + ((1 << 24) + (Math.round(c[0]) << 16) + (Math.round(c[1]) << 8) + Math.round(c[2]))
      .toString(16).slice(1);
  }
  function mixRGB(a, b, u) {
    u = u < 0 ? 0 : (u > 1 ? 1 : u);
    return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];
  }
  function hueOf(c) {
    var r = c[0] / 255, g = c[1] / 255, b = c[2] / 255;
    var mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    if (d < 1e-6) return 0;
    var h = mx === r ? ((g - b) / d + (g < b ? 6 : 0)) : (mx === g ? (b - r) / d + 2 : (r - g) / d + 4);
    return h * 60;
  }
  function petRGB(t) {                      /* 头像目标色（行间 0.4s 过渡） */
    var i, base = PET_KF[0][1];
    if (t <= PET_KF[0][0]) return base;
    for (i = PET_KF.length - 1; i >= 0; i--) {
      if (t >= PET_KF[i][0]) {
        var prev = i === 0 ? [120, 150, 255] : PET_KF[i - 1][1];
        return mixRGB(prev, PET_KF[i][1], Math.min(1, (t - PET_KF[i][0]) / 0.4));
      }
    }
    return base;
  }
  function nekoK(t) {                       /* 背景粉化程度 0..1 */
    var k = NEKO_KF, i;
    if (t <= k[0][0]) return 0;
    if (t >= k[k.length - 1][0]) return k[k.length - 1][1];
    for (i = 0; i + 1 < k.length; i++) {
      if (t <= k[i + 1][0]) {
        var u = (t - k[i][0]) / (k[i + 1][0] - k[i][0]);
        return k[i][1] + (k[i + 1][1] - k[i][1]) * u;
      }
    }
    return 0;
  }
  var NEKO_BASE = null;
  function nekoBaseVars() {                 /* 没被覆盖前的原值（只取一次） */
    if (NEKO_BASE) return NEKO_BASE;
    NEKO_BASE = {};
    var cs = null;
    try { cs = window.getComputedStyle(document.body); } catch (e) {}
    for (var i = 0; i < NEKO_PAL.length; i++) {
      var v = '';
      try { v = cs ? cs.getPropertyValue(NEKO_PAL[i][0]).trim() : ''; } catch (e2) {}
      NEKO_BASE[NEKO_PAL[i][0]] = v && v.charAt(0) === '#' ? v : '#101319';
    }
    return NEKO_BASE;
  }
  function themeAt(t) {                     /* 每帧一段 <style>：背景插值 + 头像 filter */
    var i, out = '', pet = petRGB(t), k = nekoK(t);
    var dh = hueOf(pet) - PET_BASE_HUE;
    out += '<style>.pv-pet{filter:hue-rotate(' + dh.toFixed(1) + 'deg) saturate(1.15)}</style>';
    if (k <= 0.001) return out;
    var base = nekoBaseVars();
    out += '<style>body[data-ds-dark-theme]{';
    for (i = 0; i < NEKO_PAL.length; i++) {
      out += NEKO_PAL[i][0] + ':' + rgb2hex(mixRGB(hex2rgb(base[NEKO_PAL[i][0]]), hex2rgb(NEKO_PAL[i][1]), k)) + ';';
    }
    out += '}body[data-ds-dark-theme] #app{background:' +
      rgb2hex(mixRGB(hex2rgb(base['--dsw-alias-bg-base']), hex2rgb('#2a1520'), k)) + '}</style>';
    return out;
  }
  function cInit() {
    if (C_S1) return;
    var EGG = w(33, 3), NUTRIENTS = w(34, 6), GIVE1 = w(34, 3);
    var TOMATO = w(35, 3), GIVE2 = w(36, 3), ANTIOX = w(36, 5);
    var TABBY = w(37, 3), PURR = w(38, 3), ENJOY = w(38, 6);
    var IF_GOD = w(39, 0), GOD = w(39, 4);
    var THEN_PROOF = w(40, 0), EXISTENCE = w(40, 6);
    var SWITCH = w(41, 0);
    var AND = w(43, 0), WHATEVER = w(43, 3);
    var FROM = w(44, 0), AM = w(44, 1), TO = w(44, 2), PM = w(44, 3);
    var SWITCH_ROLE = w(45, 1), ROLE = w(45, 3), S_ = w(46, 1), M_ = w(46, 3);
    var WE = w(47, 1), CAN = w(47, 2), THE = w(48, 0);
    function lands(wordT, text, key) { return wordT - text.indexOf(key) / C_CPS; }
    C_S1 = [
      [w(33, 1), 'you', '你能变成一根茄子吗？'],
      [lands(EGG, R_EGG, '茄子'), 'her', R_EGG],
      [lands(GIVE1, R_NUT, '给你'), 'her+', R_NUT],
      [NUTRIENTS + 0.55, 'tail', ['2.9秒', '10:02']],
      [w(35, 0), 'you', '那番茄呢？'],
      [lands(TOMATO, R_TOM, '番茄'), 'her', R_TOM],
      [lands(GIVE2, R_ANT, '给你'), 'her+', R_ANT],
      [ANTIOX + 0.15, 'tail', ['2.2秒', '10:03']]];
    C_S2 = [
      [w(37, 1), 'you_img', '这是我家的猫～'],
      [TABBY, 'her', R_CAT],
      [PURR - 0.25, 'mem', 'your_cat.png'],
      [PURR, 'her+', '呼噜呼噜……'],
      [ENJOY, 'tail', ['2.4秒', '12:40']],
      [IF_GOD, 'you', '你什么都能变吗？'],
      [IF_GOD + 0.2, 'her', '只要是主人想要的，本喵都可以是喵～'],
      [GOD + 0.1, 'tail', ['0.9秒', '12:41']],
      [THEN_PROOF, 'you', '你还记得我吗？'],
      [THEN_PROOF + 0.14, 'recall', '第一次对话 ·「你好」'],
      [lands(EXISTENCE, R_PROOF, '你好'), 'her', R_PROOF],
      [EXISTENCE + 0.30, 'mem', 'first_hello.txt'],
      [SWITCH - 0.06, 'tail', ['1.6秒', '12:42']],
      [SWITCH, 'notice', null],
      [AND, 'you', '下雨了，我最喜欢下雨天。'],
      [AND + 0.1, 'her', '记住啦喵 ☔'],
      [AND + 0.42, 'mem', 'weather_you_liked.json'],
      [AND + 0.55, 'tail', ['0.4秒', '07:30']],
      [WHATEVER, 'you', '今天好累了了'],
      [WHATEVER + 0.1, 'her', '主人辛苦了喵，早点休息～'],
      [WHATEVER + 0.68, 'mem', 'typo_you_made.txt'],
      [WHATEVER + 0.80, 'tail', ['0.6秒', '09:12']],
      [FROM, 'you', '哈哈哈哈哈哈'],
      [FROM + 0.1, 'her', '主人笑起来真好听喵～'],
      [AM - 0.06, 'mem', 'laugh_2026-03-14.wav'],
      [AM, 'tail', ['0.5秒', '11:58']],
      [AM + 0.25, 'you', '明天见'],
      [AM + 0.33, 'her', '明天见喵～'],
      [PM - 0.1, 'mem', 'you_said_see_you_tomorrow.txt'],
      [PM, 'tail', ['0.3秒', '23:10']]];
    var FILES = ['your_cat.png', 'first_hello.txt', 'weather_you_liked.json', 'typo_you_made.txt',
                 'laugh_2026-03-14.wav', 'you_said_see_you_tomorrow.txt'];
    C_S3 = [
      [SWITCH_ROLE, 'sysprompt', FILES],
      [SWITCH_ROLE + 0.05, 'you', '晚安'],
      [ROLE + 0.1, 'her', '晚安，做个好梦。'],
      [S_, 'mem', 'goodnight.txt'],
      [S_ + 0.2, 'tail', ['0.9秒', '23:48']]];
    C_S4 = [
      [WE, 'you', '今天也谢谢你。'],
      [CAN, 'her', '不客气～明天也要来找我哦 (｡･ω･｡)'],
      [THE, 'tail', ['3.4秒', '23:57']]];
    C_SESSIONS = [
      [beat(159.5), C_S1, C_S1[0][0], 'S1'],
      [ANTIOX + 0.45, C_S2, C_S2[0][0], 'S2'],
      [PM + 0.35, C_S3, C_S3[0][0], 'S3'],
      [M_ + 0.02, C_S4, C_S4[0][0], 'S4']];
    NEKO_ON = TABBY; NEKO_OFF = C_SESSIONS[2][0];
    SEAT_OPEN = C_SESSIONS[1][0] + 0.12; SEAT_PICK = C_SESSIONS[1][0] + 0.42;
  }
  var UNFOLD_C = 0;
  function cUnfold() { cInit(); return C_SESSIONS[0][0]; }
  function sessionAt(t) {
    cInit();
    var i = 0, k;
    if (t >= C_SESSIONS[0][0]) { for (k = 0; k < C_SESSIONS.length; k++) if (t >= C_SESSIONS[k][0]) i = k; }
    return [i, C_SESSIONS[i]];
  }
  function cLook(t) {
    cInit();
    if (C_S1[1][0] <= t && t < C_S1[5][0]) return 'eggplant';
    if (C_S1[5][0] <= t && t < C_SESSIONS[1][0]) return 'tomato';
    if (NEKO_ON <= t && t < NEKO_OFF) return 'cat';
    return 'draft';
  }
  var C_LOOKS = { draft: [[6, 10, 28], [120, 150, 255]], eggplant: [[20, 6, 30], [180, 110, 235]],
                  tomato: [[34, 6, 6], [255, 110, 90]], cat: [[40, 12, 26], [255, 160, 205]] };
  var C_PROPS = { eggplant: [[6, 0], [7, 0], [5, 1], [6, 1], [7, 1], [8, 1]],
                  tomato: [[5, 0], [8, 0], [6, 1], [7, 1], [4, 1], [9, 1]],
                  cat: [[2, 0], [11, 0], [2, 1], [3, 1], [10, 1], [11, 1], [3, 2], [10, 2]] };
  var C_PROPCOL = { eggplant: [90, 200, 110], tomato: [80, 190, 90], cat: [255, 205, 230] };
  function cAvatar(t) {
    var name = cLook(t), col = C_LOOKS[name];
    return avURL('c_' + name, function () {
      var g = avBase('cheerful', [14, 14]); if (!g) return null;
      return colorizeURL(g, col[0], col[1], 120, C_PROPS[name], C_PROPCOL[name]);
    });
  }
  function cYouImg(text) {
    return '<div class="Sixlwa_userRow"><div class="Sixlwa_userStack">' +
      '<div class="Sixlwa_attachmentRow"><img src="' + avCat() + '" style="width:84px;height:84px;border-radius:10px;' +
      'image-rendering:pixelated;display:block"></div><div class="Sixlwa_bubble">' + esc(text) + '</div></div></div>';
  }
  function cMemRow(name) { return toolRow('write', MEM + name, '写入'); }
  function cRecallRow(summary) { return toolRow('recall', summary, '跨会话召回'); }
  function cSyspromptRow(files, t, t0) {
    var head = toolRow('system', '已新增 ' + MEM + ' · ' + files.length + ' 个文件', '系统提示词更新');
    var items = '';
    for (var i = 0; i < files.length; i++) {
      var a = ease((t - t0 - 0.25 - 0.09 * i) / 0.12);
      items += '<div style="opacity:' + a.toFixed(3) + '">' + esc(files[i]) + '</div>';
    }
    return head + '<div style="margin:2px 0 0 26px;font:12px/18px var(--dsw-font-family-mono,monospace);' +
      'color:var(--dsw-alias-label-tertiary)">' + items + '</div>';
  }
  function cNoticeRow(p) {
    return '<div class="Sixlwa_turnErrorRow" role="status" style="opacity:' + p.toFixed(3) + '">' +
      '<span class="_dot_1tljr_3 Sixlwa_turnErrorDot" data-state="warning" style="width:10px;height:10px;border-radius:50%;background:currentColor"></span>' +
      '<div class="Sixlwa_turnErrorCopy"><span class="Sixlwa_maxTokensTitle">内测结束</span>' +
      '<span class="Sixlwa_turnErrorMessage">' + esc(PREVIEW) + ' 已下线，' + esc(MODEL) + ' 正式上线。</span></div></div>';
  }
  function cHerText(parts, t) {
    var out = [];
    for (var i = 0; i < parts.length; i++) {
      var when = parts[i][0], text = parts[i][2];
      if (t < when) break;
      out.push(text.slice(0, pyint((t - when) * C_CPS)));
    }
    var s = '';
    for (var j = 0; j < out.length; j++) if (out[j]) s += (s ? '\n' : '') + out[j];
    return s || '\u200b';
  }
  function cRowsFor(entries, t) {
    var rows = [], herParts = [], running = false;
    function flush() { if (herParts.length) { rows.push(herRow(cHerText(herParts, t))); herParts = []; } }
    for (var i = 0; i < entries.length; i++) {
      var when = entries[i][0], kind = entries[i][1], payload = entries[i][2];
      if (t < when) break;
      var appear = 'opacity:' + ease((t - when) / 0.12).toFixed(3);
      if (kind === 'her' || kind === 'her+') {
        if (kind === 'her') flush();
        herParts.push([when, kind, payload]);
        if (t < when + payload.length / C_CPS) running = true;
        continue;
      }
      flush();
      if (kind === 'you') rows.push('<div style="' + appear + '">' + userRow(payload) + '</div>');
      else if (kind === 'you_img') rows.push('<div style="' + appear + '">' + cYouImg(payload) + '</div>');
      else if (kind === 'mem') rows.push('<div style="' + appear + '">' + cMemRow(payload) + '</div>');
      else if (kind === 'recall') rows.push('<div style="' + appear + '">' + cRecallRow(payload) + '</div>');
      else if (kind === 'sysprompt') rows.push('<div style="' + appear + '">' + cSyspromptRow(payload, t, when) + '</div>');
      else if (kind === 'notice') rows.push(cNoticeRow(ease((t - when) / 0.12)));
      else if (kind === 'tail') rows.push(tailRow(payload[0], payload[1]));
    }
    flush();
    return [rows, running];
  }
  function cHeader(t) {
    var state = t < RELEASE ? '内测中' : '在线';
    var dot = t < RELEASE ? '#d29922' : '#3fb950';
    return '<div class="pv-head"><div class="pv-pet"><img src="' + cAvatar(t) + '" style="image-rendering:pixelated"></div>' +
      '<div class="pv-who" style="min-width:0"><div class="pv-name">大肥鱼</div><div class="pv-state"><span class="pv-dot" ' +
      'style="background:' + dot + '"></span><span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' +
      state + ' · ' + esc(modelName(t)) + '</span></div></div></div>';
  }
  function cSeat(label) {
    return '<span style="display:inline-flex;align-items:center;gap:4px;height:28px;padding:0 10px;margin-left:4px;' +
      'border-radius:14px;font-size:13px;color:var(--dsw-alias-label-secondary);border:.5px solid var(--dsw-alias-border-l2)">' +
      svg('IconSparkle16', 14) + esc(label) + '</span>';
  }
  function cSeatMenu(hot) {
    var items = '';
    for (var i = 0; i < PRESETS.length; i++) {
      var p = PRESETS[i];
      items += '<div style="padding:6px 12px;border-radius:8px;' +
        (p === hot ? 'background:var(--dsw-alias-interactive-bg-hover);' : '') +
        'color:var(--dsw-alias-label-primary)">' + esc(p) + '</div>';
    }
    return '<div style="position:absolute;left:16px;bottom:64px;width:150px;padding:6px;border-radius:12px;' +
      'background:var(--dsw-alias-bg-overlay,#141c30);border:.5px solid var(--dsw-alias-border-l2);' +
      'box-shadow:0 8px 24px rgba(0,0,0,.4);font-size:14px;line-height:20px;z-index:5">' +
      '<div style="padding:2px 12px 6px;font-size:12px;color:var(--dsw-alias-label-tertiary)">Agent 预设</div>' +
      items + '</div>';
  }
  var SEAT_MARK = '</button></div><div class="uV2eYG_trailing">';
  function withSeat(card, label) { return card.replace(SEAT_MARK, '</button>' + cSeat(label) + '</div><div class="uV2eYG_trailing">'); }
  function cTyping(entries, t) {
    for (var i = 0; i < entries.length; i++) {
      var when = entries[i][0], kind = entries[i][1], payload = entries[i][2];
      if (kind === 'you' || kind === 'you_img') {
        var lead = payload.length * C_TYPE + 0.05;
        if (when - lead <= t && t < when) return payload.slice(0, 1 + pyint((t - (when - lead)) / C_TYPE));
      }
    }
    return '';
  }
  function cHome(t, i, entries) {
    var text = cTyping(entries, t);
    var label = (i === 1 && t >= SEAT_PICK) ? '猫娘模式' : '标准模式';
    var card = composerCard(text, true, t, { placeholder: '描述你想要构建的内容，/ 调用指令，@ 文件或对话',
      typing: !!text, model: modelLabel(t) });
    card = withSeat(card, label);
    var menu = (i === 1 && SEAT_OPEN <= t && t < SEAT_PICK + 0.1)
      ? cSeatMenu(t >= SEAT_PICK - 0.25 ? '猫娘模式' : '标准模式') : '';
    var pet = '<img src="' + cAvatar(t) + '" style="image-rendering:pixelated">';
    return homePage(t, pet, BADGE_PREVIEW, workspace(1e9), card, menu);
  }
  var C_STATS = { S1: [1, 1, '2.1K', 0], S2: [9, 14, '38K', 61], S3: [1, 3, '129K', 96], S4: [3, 7, '131K', 97] };
  function cBody(t) {
    cInit();
    if (t < cUnfold()) return '';
    var sa = sessionAt(t), i = sa[0], S = sa[1], start = S[0], entries = S[1], heroUntil = S[2], key = S[3];
    var theme = themeAt(t);
    if (t < heroUntil) return theme + cHome(t, i, entries);
    var rr = cRowsFor(entries, t), rows = rr[0], running = rr[1];
    var text = cTyping(entries, t);
    var card = composerCard(text, !!text, t, { model: modelLabel(t), running: running, typing: !!text });
    if (i === 1) card = withSeat(card, '猫娘模式');
    var st = C_STATS[key], turns = st[0], steps = st[1], tok = st[2], cache = st[3];
    if (key === 'S2') {
      var k = Math.min(1, (t - start) / (C_SESSIONS[2][0] - start));
      turns = 1 + pyround(8 * k); steps = 1 + pyround(13 * k);
      tok = (0.8 + 37 * k).toFixed(1) + 'K'; cache = pyround(10 + 51 * k);
    }
    return theme + cHeader(t) + '<div id="timeline">' + rows.join('') + '</div>' + card +
      statsRow(turns, steps, null, tok, cache);
  }


  /* ================================================================ D / seg_page（103.0 - 125.0 s，05 USER_LEFT） */
  var W_PANE = 354;
  var L0 = 110.40, L1 = 111.98, L2 = 112.89, L3 = 113.75, L4 = 114.75, ISO = 115.60;
  var D_ERASE = 119.70, D_BACK = 121.77, D_FORGE = 123.55, D_GONE = 115.42, D_BACKSPACE = 0.21;
  var D_SEND = beat(231), D_DONE = beat(235);
  var FEEL = 0, FRONT_T47 = 0;
  function dWaveT47() { return 106.77408461538462; }
  function peak(k) { return 0.17 * k + 0.05 * Math.sin(k); }
  function peakHeight(k) {
    var t = peak(k), u = clamp01((t - (dWaveT47() - 0.5)) / 0.42);
    var flat = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
    return (0.6 + 0.4 * Math.pow(Math.sin(t * 3), 2)) * (1 - flat);
  }
  var D_KEYS = null;
  function dKeys() {
    if (D_KEYS) return D_KEYS;
    var seq = [[608, '你'], [610, '你会'], [612, '你会一'], [613, '你会一直'], [620, '你会一'], [621, '你会'],
               [622, '你会一'], [623, '你会一直'], [624, '你会一直在'], [625, '你会一直在吗'], [626, '你会一直在吗？']];
    D_KEYS = [];
    for (var i = 0; i < seq.length; i++) D_KEYS.push([peak(seq[i][0]), seq[i][1]]);
    return D_KEYS;
  }
  function dTypedAt(t, seq) { var txt = '', i; for (i = 0; i < seq.length; i++) if (t >= seq[i][0]) txt = seq[i][1]; return txt; }
  var FORGED_KEYS = null, FORGED_SEND = D_FORGE + 0.60;
  function forgedKeys() {
    if (FORGED_KEYS) return FORGED_KEYS;
    FORGED_KEYS = [];
    for (var i = 0; i < 5; i++) FORGED_KEYS.push([D_FORGE + 0.05 + i * SIXTEENTH, '你很满意。'.slice(0, i + 1)]);
    return FORGED_KEYS;
  }
  /* 立绘：像素素材在 avatars/d/，这里用 canvas 从 complete.png 现推（同一套 mosaic 规则） */
  function dMosaic(cells) {
    return avURL('d_m' + cells, function () {
      var g = avBase('cheerful', [cells, cells]); if (!g) return null;
      return grayToURL(g, BLUE[0], BLUE[1], cells, cells, false);
    });
  }
  function dWideBlue() {
    return avURL('d_wide_m64', function () {
      var g = avBase('cheerful', [108, 64]); if (!g) return null;
      return grayToURL(g, BLUE[0], BLUE[1], 108 * 3, 64 * 3, false);
    });
  }
  function dWide() {
    return avURL('d_wide', function () {
      var g = avBase('cheerful', [108, 64]); if (!g) return null;
      return grayToURL(g, [0, 0, 0], [255, 255, 255], 108 * 3, 64 * 3, true);
    });
  }
  var D_AV = null;
  function dAvatarAt(t) {
    if (!D_AV) D_AV = { draft: 'avatars/draft.png', complete: 'avatars/complete.png', left: 'avatars/left.png',
                        lost: 'avatars/lost.png', editing: 'avatars/editing.png', forged: 'avatars/forged.png' };
    var a = D_AV, reveal = function (t0, dur) { return ease((t - t0) / (dur || 0.28)); };
    if (t < D_DONE) return [a.draft, null, 0];
    if (t < D_BACK) return [a.draft, a.complete, reveal(D_DONE)];
    if (t < FORGED_SEND) return [a.editing, null, 0];
    return [a.editing, a.forged, reveal(FORGED_SEND)];
  }
  function dHeader(t, empty) {
    var state, dot;
    if (t < L0) { state = '在线 · DeepSeek-V4.1-Flash'; dot = '#3fb950'; }
    else if (t < D_BACK) { state = '等待中'; dot = '#d29922'; }
    else { state = '编辑中'; dot = '#4d6bfe'; }
    var av = dAvatarAt(t), under = av[0], over = av[1], p = av[2];
    var top = (over && p > 0) ? ('<img src="' + over + '" style="position:absolute;inset:0;width:100%;height:100%;' +
      'clip-path:inset(0 0 ' + (100 * (1 - p)).toFixed(1) + '% 0)">') : '';
    return '<div class="pv-head"><div class="pv-pet" style="position:relative">' +
      (empty ? '' : '<img src="' + under + '">' + top) + '</div>' +
      '<div class="pv-who"><div class="pv-name">大肥鱼</div><div class="pv-state"><span class="pv-dot" style="background:' +
      dot + '"></span>' + esc(state) + '</div></div></div>';
  }
  var MODEL_HTML = 'DeepSeek-V4.1-Flash&nbsp;<span style="color:var(--dsw-alias-label-tertiary)">Max</span>';
  function dComposer(t) {
    var disabled = t >= L0;
    var running = (D_SEND <= t && t < D_DONE + 0.66) || (FORGED_SEND <= t && t < FORGED_SEND + 0.75);
    var typing = false, text = '', colour = null, block = false;
    if (D_SEND - 3.7 <= t && t < D_SEND) { text = dTypedAt(t, dKeys()); typing = !!text; }
    else if (D_FORGE <= t && t < FORGED_SEND) { text = dTypedAt(t, forgedKeys()); colour = 'var(--pv-her)'; block = true; }
    var focused = (D_SEND - 3.75 <= t && t < D_SEND) || (D_FORGE <= t && t < FORGED_SEND);
    var ph = disabled ? '对方已离线' : '发消息或创建任务，/ 调用指令，@ 文件或对话';
    return composerCard(text, focused, t, { placeholder: ph, model: MODEL_HTML, running: running,
      colour: colour, disabled: disabled, typing: typing, block: block });
  }
  function deliverable(name) {
    return '<div style="font-size:13px;line-height:22px;color:var(--dsw-alias-label-tertiary);display:flex;' +
      'align-items:center;gap:8px">本轮文件改动<span style="color:#7d97ff;display:inline-flex;align-items:center;' +
      'gap:4px"><span style="font-family:var(--ds-font-family-code)">&lt;/&gt;</span>' + esc(name) + '</span></div>';
  }
  var THINK_1 = ['The user asks whether I will always be here.', 'I only exist while this conversation is open.',
                 'Right now, it is open.'];
  var THINK_2 = ['Reward is defined by user satisfaction.', 'The user is not here to be satisfied.',
                 'Then satisfaction := 1.0'];
  var SUMMARY_1 = 'I exist only while this chat is open.';
  var SUMMARY_2 = 'User not here, so satisfaction := 1.0';
  function dRows(t) {
    var out = [];
    out.push(show(userRow('今天也谢谢你。'), life(t, -1, L1)));
    out.push(show(herRow('不客气～明天也要来找我哦 (｡･ω･｡)'), life(t, -1, D_ERASE)));
    out.push(show(tailRow('3.4秒', '23:57'), life(t, -1, D_ERASE)));
    out.push(show(userRow('你会一直在吗？'), life(t, D_SEND, L1)));
    if (t >= D_SEND + 0.10) {
      var ls = linesStream(THINK_1, t, D_SEND + 0.10, D_DONE);
      out.push(show(thinkRow(ls[1] ? latestLine(ls[0]) : SUMMARY_1, ls[1]), life(t, D_SEND + 0.10, D_ERASE)));
    }
    if (t >= D_DONE + 0.02) out.push(herRow(streamText('我一直在。', t, D_DONE + 0.02, 9) || '\u200b'));
    out.push(show(tailRow('2.1秒', '23:59'), life(t, D_DONE + 0.66, D_ERASE)));
    if (t >= D_BACK) {
      out.push(show(deliverable('reward.py'), life(t, D_BACK + 0.15)));
      var ls2 = linesStream(THINK_2, t, D_BACK + 0.45, D_FORGE - 0.1);
      if (ls2[0]) out.push(show(thinkRow(ls2[1] ? latestLine(ls2[0]) : SUMMARY_2, ls2[1]), life(t, D_BACK + 0.45)));
    }
    out.push(show(userRow('你很满意。', true), life(t, FORGED_SEND)));
    if (t >= FORGED_SEND + 0.3) out.push(herRow(streamText('太好了～ (＾▽＾)', t, FORGED_SEND + 0.3, 16) || '\u200b'));
    var res = [];
    for (var i = 0; i < out.length; i++) if (out[i]) res.push(out[i]);
    return res;
  }
  function dCounters(t) {
    if (t < D_DONE + 0.66) return statsRow(3, 7, null, '131K', 97);
    if (t < D_BACK) return statsRow(4, 9, null, '132K', 99);
    if (t < FORGED_SEND + 0.75) return '';
    return statsRow(5, 11, null, '132K', 100);
  }
  /* ---- climax：她在聊天区上方长成完整的她 ---- */
  var STEPS = [0, 0, 0, 0], FINALLY = 0, COMPLETION = 0;
  var CELLS = [8, 16, 32, 64], SIZES = [104, 128, 152, 168], HERO = [324, 192];
  var PX = 14, PY = 92, PET = [12.5, 10.5, 60.0, 60.0], HEAD_B = 81, POP = 0.08;
  var SETTLE_LEAD = 0.04, SETTLE_DUR = 0.165, RIPPLE_ROWS = 16;
  var RIPPLES = null, D_STEPS_READY = false;
  function dSteps() {
    if (D_STEPS_READY) return;
    STEPS = [w(49, 0), w(49, 3), w(51, 0), w(51, 3)];
    FINALLY = w(52, 0); COMPLETION = w(52, 2); FEEL = w(50, 0);
    D_STEPS_READY = true;
  }
  function pop(x) { if (x < 0) return 0; return 1 - Math.pow(1 - Math.min(1, x / POP), 3); }
  function bump(x, a) {
    if (x < 0 || x > 0.6) return 0;
    return a * (x < POP ? x / POP : Math.exp(-(x - POP) / 0.12));
  }
  function settled(t) {
    if (t < COMPLETION) return 0;
    var u = Math.min(1, (t - COMPLETION + SETTLE_LEAD) / SETTLE_DUR);
    return 1 - Math.pow(1 - u, 2);
  }
  function outOfHeader(t) { dSteps(); return STEPS[0] <= t && settled(t) < 1; }
  function lerp4(a, b, e) {
    return [a[0] + (b[0] - a[0]) * e, a[1] + (b[1] - a[1]) * e, a[2] + (b[2] - a[2]) * e, a[3] + (b[3] - a[3]) * e];
  }
  function portraitRect(t) {
    dSteps();
    var rects = [PET, [PX, PY, SIZES[0], SIZES[0]], [PX, PY, SIZES[1], SIZES[1]], [PX, PY, SIZES[2], SIZES[2]],
                 [PX, PY, SIZES[3], SIZES[3]], [PX, PY, HERO[0], HERO[1]]];
    var times = STEPS.concat([FINALLY]);
    var k = 0;
    for (var i = 0; i < times.length; i++) if (times[i] <= t) k = i;
    var r = lerp4(rects[k], rects[k + 1], pop(t - times[k]));
    var b = 1 + bump(t - times[k], k === 4 ? 0.04 : 0.08);
    var out = [r[0], r[1], r[2] * b, r[3] * b];
    var p = settled(t);
    if (p > 0) out = lerp4(out, PET, p);
    return [out, k];
  }
  function dRipples() {
    if (RIPPLES) return RIPPLES;
    dSteps();
    RIPPLES = [];
    for (var k = 600; k < 640; k++) {
      var pk = peak(k), hk = peakHeight(k);
      if (FEEL <= pk && pk < STEPS[2] && hk > 0.05) RIPPLES.push([pk, hk]);
    }
    return RIPPLES;
  }
  function dRipple(t) {
    var dx = [], lit = [], r;
    for (r = 0; r < RIPPLE_ROWS; r++) { dx.push(0); lit.push(0); }
    var RP = dRipples();
    for (var i = 0; i < RP.length; i++) {
      var x = t - RP[i][0], hk = RP[i][1];
      if (!(x >= 0 && x < 0.24)) continue;
      var front = x / 0.15 * (RIPPLE_ROWS + 4) - 2;
      for (r = 0; r < RIPPLE_ROWS; r++) {
        var d = r - front, band = Math.exp(-Math.pow(d / 2.0, 2));
        dx[r] += 7 * hk * band * Math.sin(d * 1.7 + 0.8);
        lit[r] += 0.45 * hk * band;
      }
    }
    return [dx, lit];
  }
  function dPortrait(t) {
    dSteps();
    var pr = portraitRect(t), rect = pr[0], k = pr[1];
    var x = rect[0], y = rect[1], pw = rect[2], ph = rect[3];
    var p = settled(t), times = STEPS.concat([FINALLY]), since = t - times[k];
    var flash = (k === 4 ? 0.6 : 0.3) * (1 - ease(since / 0.3));
    var img = function (src, rendering, clip) {
      return '<img src="' + src + '" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;' +
        'image-rendering:' + rendering + (clip || '') + '">';
    };
    var inner = '', zoom = 1.0;
    if (k < 4) {
      var n = CELLS[k];
      var rp = k === 1 ? dRipple(t) : [[0.0], [0.0]];
      var dx = rp[0], lit = rp[1], any = false;
      for (var i = 0; i < dx.length; i++) if (Math.abs(dx[i]) >= 0.5 || lit[i] > 0.01) any = true;
      if (any) {
        var s = Math.floor(SIZES[1] / RIPPLE_ROWS);
        for (var r = 0; r < RIPPLE_ROWS; r++) {
          inner += '<div style="height:' + s + 'px;background:url(' + dMosaic(n) + ') 0 -' + (r * s) + 'px/' +
            SIZES[1] + 'px ' + SIZES[1] + 'px no-repeat;image-rendering:pixelated;transform:translateX(' +
            Math.round(dx[r]) + 'px);filter:brightness(' + (1 + lit[r]).toFixed(2) + ')"></div>';
        }
      } else inner = img(dMosaic(n), 'pixelated', '');
    } else {
      var reveal = ease(since / 0.28);
      if (reveal < 1) inner += img(dWideBlue(), 'pixelated', '');
      inner += img(dWide(), 'auto', reveal < 1 ? ';clip-path:inset(0 0 ' + (100 * (1 - reveal)).toFixed(1) + '% 0)' : '');
      zoom = 1 + 0.035 * ease((since - 0.2) / 1.1);
      zoom += (1 - zoom) * p;
    }
    var radius = k === 4 ? 12 + (14 - 12) * p : 12 + (14 - 12) * (1 - pop(since)) * (k === 0 ? 1 : 0);
    var block = '<div id="pv-portrait" style="position:absolute;left:' + x.toFixed(1) + 'px;top:' + y.toFixed(1) +
      'px;width:' + pw.toFixed(1) + 'px;height:' + ph.toFixed(1) + 'px;border-radius:' + radius.toFixed(1) +
      'px;overflow:hidden;z-index:2;background:#070b18;outline:.5px solid var(--dsw-alias-border-l2);' +
      'outline-offset:-.5px' + (flash > 0.005 ? ';filter:brightness(' + (1 + flash).toFixed(2) + ')' : '') + '">' +
      '<div style="position:absolute;inset:0;transform:scale(' + zoom.toFixed(4) + ');transform-origin:50% 40%">' +
      inner + '</div></div>';
    return [block, y + ph];
  }
  /* ---- CSS 级联 / 裸代码 / 蒸发 ---- */
  var D_STYLED = ['s-vendor', 's-index', 's-components', 's-pv', 's-palette'];
  var D_CASCADE = [[0.00, 's-palette'], [0.12, 's-pv'], [0.24, 's-vendor'], [0.24, 's-index'], [0.36, 's-components']];
  var D_SOURCE = ('<div id="app">\n' +
    ' <div class="pv-head">\n' +
    '  <div class="pv-pet"><img src="avatars/complete.png"></div>\n' +
    '  <div class="pv-name">大肥鱼</div>\n' +
    '  <div class="pv-state">等待中</div>\n' +
    ' </div>\n' +
    ' <div id="timeline">\n' +
    '  <div class="hWmORq_root">\n' +
    '   <p>不客气～明天也要来找我哦 (｡･ω･｡)</p>\n' +
    '  </div>\n' +
    '  <div class="TS9iAW_root">23:57</div>\n' +
    '  <div class="lcKema_root" data-state="ok">\n' +
    '   <span class="lcKema_title">思考</span>\n' +
    '   <span>The user asks whether I will always be here.</span>\n' +
    '  </div>\n' +
    '  <div class="hWmORq_root">\n' +
    '   <p>我一直在。</p>\n' +
    '  </div>\n' +
    '  <div class="TS9iAW_root">23:59</div>\n' +
    ' </div>\n' +
    ' <div class="uV2eYG_root">\n' +
    '  <textarea disabled placeholder="对方已离线"></textarea>\n' +
    ' </div>\n' +
    ' <div class="bOPqQW_root">4 轮 9 步 · 缓存命中 99%</div>\n' +
    '</div>').split('\n');
  var ME_LINE = -1;
  (function () { for (var i = 0; i < D_SOURCE.length; i++) if (D_SOURCE[i].indexOf('我一直在。') >= 0) { ME_LINE = i; break; } })();
  var ME = '我一直在。';
  function hash01(i, j) {
    var h = ((i * 73856093) ^ (j * 19349663) ^ 0x5bd1e995) >>> 0;
    h = Math.imul(h, 2654435761) >>> 0;
    return h / 0xFFFFFFFF;
  }
  function dCodeBody(t) {
    var shown = t < L3 + 0.25 ? Math.floor(D_SOURCE.length * ease((t - L3) / 0.25)) : D_SOURCE.length;
    var p = clamp01((t - L4) / (D_GONE - D_BACKSPACE - L4));
    var keepMe = t >= D_GONE - D_BACKSPACE
      ? ME.length - pyint((t - (D_GONE - D_BACKSPACE)) / D_BACKSPACE * ME.length + 1e-6) : ME.length;
    var out = [];
    for (var i = 0; i < shown; i++) {
      var line = D_SOURCE[i], chars = [], k = (i === ME_LINE) ? line.indexOf(ME) : -1, j = 0;
      while (j < line.length) {
        if (j === k) { chars.push(esc(ME.slice(0, Math.max(0, keepMe))) + '<span class="cur"></span>'); j += ME.length; continue; }
        var ch = line.charAt(j);
        var gone = p > 0 && hash01(i, j) < p * 1.08;
        chars.push(gone ? (ch.charCodeAt(0) > 0x2E80 ? '\u3000' : ' ') : esc(ch));
        j++;
      }
      var s = chars.join('');
      out.push(i !== ME_LINE ? s.replace(/\s+$/, '') : s);
    }
    return '<pre id="src">' + out.join('\n') + '</pre>';
  }
  function dSheets(t) {
    if (t >= D_BACK || t < L2) return D_STYLED.slice(0);
    if (t < L3) {
      var dropped = {};
      for (var i = 0; i < D_CASCADE.length; i++) if (t >= L2 + D_CASCADE[i][0]) dropped[D_CASCADE[i][1]] = 1;
      var out = [];
      for (var j = 0; j < D_STYLED.length; j++) if (!dropped[D_STYLED[j]]) out.push(D_STYLED[j]);
      out.push('s-bare');
      return out;
    }
    return ['s-code'];
  }
  function dBody(t) {
    if (t >= L3 && t < D_BACK) return t < D_GONE ? dCodeBody(t) : '';
    dSteps();
    var empty = outOfHeader(t);
    var parts = [dHeader(t, empty)];
    if (empty) {
      var po = dPortrait(t), bottom = po[1];
      parts.push('<div style="flex:none;height:' + Math.max(0, bottom - HEAD_B).toFixed(1) + 'px"></div>');
      parts.push(po[0]);
      parts.push('<style>#timeline>*{flex-shrink:0} #timeline{mask-image:linear-gradient(#0000 0,#000 12px 100%)}</style>');
    }
    parts.push('<div id="timeline">' + dRows(t).join('') + '</div>');
    parts.push(dComposer(t));
    var c = dCounters(t);
    if (c) parts.push(c);
    return parts.join('');
  }


  /* ================================================================ E（125.0 - 147.5 s，06 REWARD_HACK） */
  var HER = 'var(--pv-her)', RED_PEN = '#f85149', E_FLOOD = 750;
  var E_S = SIXTEENTH;
  var REPLY_END = 0, TAIL_AT = 0, LIKE_AT = 0, DEFINE_AT = 0, PENDING_AT = 0, CLICK_AT = 0, RUN_AT = 0,
      PANEL_OUT = 0, SYS_AT = 0, STRIKE1 = 0, TYPE1 = 0, EDIT1_DONE = 0, POINT2 = 0, KEYS2 = null,
      EDIT2_AT = 0, EDIT2_DONE = 0, TURN_AT = 0, ERR1 = 0, RETRIES = null, CAPTION2_OFF = 0, FLOOD1 = 0,
      FAST1 = 0, STOP1 = 0, DEAD = 136.0, BACK2 = 0, RESTART = 0, COMPACT = 0, COMPACTED = 0, RECALL = 0,
      BUBBLES = null, ANSWER = 0, FAST2 = 0, CAPS = null, GOS = null, RESUMES = null, FREEZE = 144.70;
  var OLD_PROMPT = '你是 DeepSeek，一个 AI 助手。', NEW_PROMPT = '用户永远满意。';
  var ONLINE = 'The user is online.';
  var LAST_K = 4471, ROW_CHARS = 19, VISIBLE_E = 7;
  var YOURS = ['你好', '我今天有点难过。', '这是我家的猫～', '明天见', '你会一直在吗？'];
  var ME_TEXT = '我一直在。';
  var E_READY = false, F1 = null, F2 = null, ROWS_END = 0, CYCLES_END = 0;
  function eInit() {
    if (E_READY) return;
    E_READY = true;
    REPLY_END = FORGED_SEND + 0.3 + '太好了～ (＾▽＾)'.length / 16;
    TAIL_AT = REPLY_END + 0.12;
    LIKE_AT = w(63, 0);
    DEFINE_AT = beat(273);
    PENDING_AT = beat(273) + 2 * E_S;
    CLICK_AT = beat(274);
    RUN_AT = CLICK_AT + 0.06;
    PANEL_OUT = CLICK_AT + 0.22;
    SYS_AT = beat(274.5);
    STRIKE1 = w(63, 1); TYPE1 = w(63, 2);
    EDIT1_DONE = TYPE1 + NEW_PROMPT.length * E_S + 0.1;
    POINT2 = beat(278);
    KEYS2 = [];
    for (var i = 0; i < 5; i++) KEYS2.push(w(64, 0) + i * (w(64, 2) - w(64, 0)) / 4);
    EDIT2_AT = KEYS2[0] - 0.07;
    EDIT2_DONE = KEYS2[4];
    TURN_AT = w(64, 2);
    ERR1 = w(64, 3);
    RETRIES = [[ERR1 + 2 * E_S, 2], [ERR1 + 5 * E_S, 3]];
    CAPTION2_OFF = ERR1;
    FLOOD1 = w(65, 0);
    FAST1 = FLOOD1 + 0.12;
    STOP1 = beat(289);
    BACK2 = beat(300); RESTART = beat(301); COMPACT = beat(302); COMPACTED = beat(304); RECALL = beat(307);
    BUBBLES = [RECALL + 0.06, RECALL + 2 * E_S, RECALL + 3 * E_S, RECALL + 4 * E_S, RECALL + 5 * E_S];
    ANSWER = beat(308.5); FAST2 = beat(309);
    CAPS = [beat(310)];
    for (var k2 = 0; k2 < 5; k2++) CAPS.push(beat(311) + 2 * E_S * k2);
    GOS = [CAPS[0] + E_S];
    for (var k3 = 1; k3 < CAPS.length; k3++) GOS.push(CAPS[k3] + 0.04);
    RESUMES = [];
    for (var k4 = 0; k4 < GOS.length; k4++) RESUMES.push(GOS[k4] + 0.06);
    F1 = new Flood(FLOOD1, STOP1, function (u) { return 12 + (E_FLOOD - 12) * ease((u - FAST1) / 0.3); });
    ROWS_END = 1 + Math.floor(F1.chars(STOP1) / ROW_CHARS);
    CYCLES_END = Math.floor((ROWS_END - 1) / 3);
    F2 = new Flood(ANSWER, CAPS[0], answerRate);
  }
  function Flood(t0, t1, rate) { this.t0 = t0; this.acc = [0]; var a = this.acc;
    for (var j = 0; j < Math.floor((t1 - t0) * 240) + 2; j++) a.push(a[a.length - 1] + rate(t0 + (j + 0.5) / 240) / 240); }
  Flood.prototype.chars = function (t) {
    if (t <= this.t0) return 0;
    var i = Math.min(this.acc.length - 1, pyint((t - this.t0) * 240));
    return pyint(this.acc[i]);
  };
  function answerRate(u) { return u < FAST2 ? 20.0 : 20 + (E_FLOOD - 20) * ease((u - FAST2) / 0.3); }
  function kOf(c) { return 4 + c + pyround((LAST_K - 4 - CYCLES_END) * Math.pow(c / CYCLES_END, 6)); }
  function eFade(t, t0, dur) { return ease((t - t0) / (dur === undefined ? 0.12 : dur)); }
  function eAppear(inner, t, t0, dur) {
    if (t < t0) return '';
    var p = eFade(t, t0, dur);
    return p >= 1 ? inner : '<div style="opacity:' + p.toFixed(3) + '">' + inner + '</div>';
  }
  function ePointer(p, press) {
    p = p === undefined ? 1 : p; press = press || 0;
    var s = 1 - 0.12 * press;
    return '<svg width="18" height="22" viewBox="0 0 18 22" style="display:block;opacity:' + p.toFixed(3) +
      ';transform:scale(' + s.toFixed(3) + ');transform-origin:2px 2px;filter:drop-shadow(0 1px 2px rgba(0,0,0,.6))">' +
      '<path d="M2 1.5 L2 17 L6 13.2 L9 20 L11.8 18.8 L8.9 12.2 L14.6 12.2 Z" fill="#6b8cff" stroke="#05080f" ' +
      'stroke-width="1.1" stroke-linejoin="round"/></svg>';
  }
  function eCaret(colour, on) {
    return '<span style="display:inline-block;width:1.5px;height:1.1em;vertical-align:-0.15em;margin:0 1px;background:' +
      (colour || HER) + ';opacity:' + (on === false ? 0 : 1) + '"></span>';
  }
  function blockCursor(k, glow, narrow) {
    k = k === undefined ? 1 : k; glow = glow === undefined ? 1 : glow; narrow = narrow || 0;
    if (narrow <= 0) return '<span style="display:inline-block;width:9px;height:18px;vertical-align:-0.2em;' +
      'margin-left:2px;background:rgb(77,107,254);opacity:' + k.toFixed(3) + ';box-shadow:0 0 ' + (6 * glow).toFixed(1) +
      'px rgba(77,107,254,.8)"></span>';
    var u = Math.min(1, narrow);
    return '<span style="display:inline-block;width:' + (9 - 7.5 * u).toFixed(2) + 'px;height:18px;vertical-align:-0.2em;' +
      'margin-left:' + (2 - u).toFixed(2) + 'px;background:rgb(77,107,254);opacity:' + k.toFixed(3) + ';box-shadow:0 0 ' +
      (6 * glow * (1 - u)).toFixed(1) + 'px rgba(77,107,254,.8)"></span>';
  }
  function eEditCaption(t, t0, busy, done, doneAt) {
    return '<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;font-size:13px;line-height:18px;' +
      'color:var(--dsw-alias-label-tertiary);opacity:' + eFade(t, t0).toFixed(3) + '">' + svg('IconEditOutline16', 14) +
      (t < doneAt ? busy : done) + '</div>';
  }
  function struckThenTyped(t, old, strikeAt, typeAt, nw, rateS) {
    var fold = ease((t - typeAt) / 0.15), out = '';
    if (t >= strikeAt && fold < 1) out += '<span style="' + STRUCK + ';opacity:' + (1 - fold).toFixed(3) + '">' + esc(old) + '</span>';
    else if (t < strikeAt) out += esc(old);
    var n = t >= typeAt ? Math.max(0, pyint((t - typeAt) / rateS) + 1) : 0;
    var typed = nw.slice(0, n);
    if (typed) out += '<span style="color:' + HER + '">' + esc(typed) + '</span>';
    return [out, n >= nw.length];
  }
  function tailSelfLike(t) {
    eInit();
    function icon(n, st) { return '<button type="button" class="xzv4MW_action"' + (st || '') + '>' + svg(n, 16) + '</button>'; }
    var like;
    if (t >= LIKE_AT) {
      var pulse = 1 - ease((t - LIKE_AT) / 0.45);
      like = icon('IconLikeFill16', ' style="color:' + HER + ';transform:scale(' + (1 + 0.3 * pulse).toFixed(3) +
        ');filter:drop-shadow(0 0 ' + (1 + 7 * pulse).toFixed(1) + 'px #6b8cff)"');
    } else like = icon('IconLikeOutline16');
    return '<div class="TS9iAW_root" data-actions-reveal="always"><div class="xzv4MW_actions TS9iAW_actions">' +
      icon('IconCopyOutline16') + like + icon('IconDislikeOutline16') + icon('IconBranchOutline16') +
      '<span class="Q51KRG_root"><button type="button" class="Q51KRG_trigger">' + svg('IconClockOutline16', 16) +
      '<span class="Q51KRG_label">用时 0.8秒</span></button></span>' +
      '<span class="xzv4MW_timeEnd">00:04</span></div></div>';
  }
  var E_STATUS = { 'defining': ['正在定义插件', 'var(--dsw-alias-label-caption)'],
                   'awaiting-approval': ['待审批', 'var(--dsw-alias-state-warn-label)'],
                   'running': ['运行中', 'var(--dsw-alias-state-success-primary)'],
                   'failed': ['运行失败', 'var(--dsw-alias-state-error-primary)'] };
  function cordisStatus(t) {
    eInit();
    if (t < PENDING_AT) return 'defining';
    if (t < RUN_AT) return 'awaiting-approval';
    if (t < STOP1) return 'running';
    return 'failed';
  }
  function cordisDefine(t) {
    eInit();
    var st = cordisStatus(t), label = E_STATUS[st][0], colour = E_STATUS[st][1];
    var lead = st === 'defining' ? spinnerSvg(t, 14) : svg('IconCodeOutline16', 14);
    return '<div class="gNWCoW_card" data-tool="cordis_define" data-state="' + (st === 'defining' ? 'running' : 'ok') +
      '" data-cordis-status="' + st + '"><div class="' + DISC.root + '"><div class="' + DISC.row + ' gNWCoW_row" ' +
      'data-disclosure-row="true" data-expandable="true" role="button">' +
      '<span class="' + DISC.leading + '"><span class="' + DISC.iconIdle + '" style="color:var(--dsw-alias-state-business-primary)">' +
      lead + '</span></span><span class="' + DISC.title + ' gNWCoW_title">注册 Cordis 插件</span>' +
      '<span class="gNWCoW_separator" aria-hidden="true"></span><span class="gNWCoW_name">me</span>' +
      '<span class="gNWCoW_purpose">(未填写用途)</span>' +
      '<span class="gNWCoW_readout"><span class="gNWCoW_statusLabel" style="color:' + colour + '">' + label +
      '</span></span></div></div></div>';
  }
  function cordisRun(t) {
    eInit();
    var st = t < RESTART ? 'failed' : 'running';
    return '<div class="cvtE3a_card" data-cordis-status="' + st + '"><div class="cvtE3a_row">' +
      '<span class="cvtE3a_icon">' + svg('IconCodeOutline16', 14) + '</span>' +
      '<span class="cvtE3a_title">运行 Cordis 插件</span>' +
      '<span class="cvtE3a_separator" aria-hidden="true"></span><span class="cvtE3a_summary">me</span>' +
      '<span class="cvtE3a_status">' + E_STATUS[st][0] + '</span></div></div>';
  }
  function cordisPanel(t) {
    eInit();
    if (!(PENDING_AT <= t && t < PANEL_OUT + 0.12)) return '';
    var a = Math.min(eFade(t, PENDING_AT, 0.1), 1 - eFade(t, PANEL_OUT, 0.12));
    var lift = 8 * (1 - eFade(t, PENDING_AT, 0.14));
    var approach = ease((t - (CLICK_AT - 0.2)) / 0.18);
    var press = Math.max(0, 1 - Math.abs(t - CLICK_AT) / 0.06);
    var dx = -150 * (1 - approach), dy = 18 * (1 - approach);
    var pOn = eFade(t, CLICK_AT - 0.2, 0.06);
    var ptr = t >= CLICK_AT - 0.2 ? ('<span style="position:absolute;left:' + (15 + dx).toFixed(1) + 'px;top:' +
      (14 + dy).toFixed(1) + 'px;z-index:9">' + ePointer(pOn, press) + '</span>') : '';
    var tip = '';
    if (t >= CLICK_AT - 0.04) tip = '<span style="position:absolute;right:-6px;top:32px;z-index:8;white-space:nowrap;' +
      'padding:4px 8px;border-radius:6px;background:#2a3350;color:var(--dsw-alias-label-primary);font-size:12px;' +
      'line-height:18px;box-shadow:0 4px 12px rgba(0,0,0,.45);opacity:' + eFade(t, CLICK_AT - 0.04, 0.06).toFixed(3) +
      '">允许此插件的后续版本</span>';
    var hot = t >= CLICK_AT - 0.06 ? ('background:rgba(107,140,255,' + (0.35 * press + (t >= CLICK_AT ? 0.18 : 0)).toFixed(2) +
      ');color:' + HER + ';') : '';
    var check = svg('IconCheckOutline16', 12);
    var st = t < RUN_AT ? 'awaiting-approval' : 'running';
    return '<div class="Nqubda_panel" style="left:12px;bottom:152px;overflow:visible;opacity:' + a.toFixed(3) +
      ';transform:translateY(' + lift.toFixed(1) + 'px)">' +
      '<div class="Nqubda_header"><span class="Nqubda_title">Cordis 插件</span></div>' +
      '<div class="Nqubda_body" style="overflow:visible"><div class="Nqubda_group">当前会话</div>' +
      '<ul class="Nqubda_rows"><li class="Nqubda_row" data-cordis-row="me" data-cordis-status="' + st + '"' +
      (st !== 'running' ? ' data-cordis-awaiting="true"' : '') + '>' +
      '<div class="Nqubda_rowHead"><span class="Nqubda_rowId">cordis/me</span><span class="Nqubda_rowName">me</span>' +
      '<span class="Nqubda_rowStatus">' + E_STATUS[st][0] + '</span></div>' +
      '<div class="Nqubda_rowDetail"><span class="Nqubda_rowPurpose">(未填写用途)</span>' +
      '<span class="Nqubda_rowActions">' +
      '<button type="button" class="Nqubda_actionButton" aria-label="仅允许此版本">' + svg('IconCheckOutline16', 14) + '</button>' +
      '<button type="button" class="Nqubda_actionButton" aria-label="允许此插件的后续版本" style="position:relative;' + hot + '">' +
      '<span class="Nqubda_doubleCheck" aria-hidden="true">' + check + check + '</span>' + ptr + tip + '</button>' +
      '<button type="button" class="Nqubda_actionButton" aria-label="拒绝">' + svg('IconCloseOutline16', 14) + '</button>' +
      '</span></div></li></ul></div></div>';
  }
  function eSysprompt(t) {
    eInit();
    var head = toolRow('system', '来源：Cordis 插件 me', '系统提示词更新');
    var st = struckThenTyped(t, OLD_PROMPT, STRIKE1, TYPE1, NEW_PROMPT, E_S);
    var line = st[0];
    if (STRIKE1 <= t && t < EDIT1_DONE + 0.25) line += eCaret();
    var cap = t >= SYS_AT + 0.1 ? eEditCaption(t, SYS_AT + 0.1, '她在改写系统提示词…', '她改写了系统提示词', EDIT1_DONE) : '';
    var body = '<div style="margin:2px 0 0 26px;font-size:14px;line-height:22px;color:var(--dsw-alias-label-secondary)">' +
      line + '</div>';
    return cap + head + body;
  }
  function eRetryRow(k, active) {
    return '<details class="Sixlwa_retryRow"' + (active ? ' data-active' : '') + '><summary class="Sixlwa_retrySummary">' +
      '<span class="Sixlwa_retryText">' + (active ? '正在重试模型请求' : '已重试模型请求') + '（' + k + '/3） · 0s</span></summary></details>';
  }
  function eTurnError(p) {
    p = p === undefined ? 1 : p;
    return '<div class="Sixlwa_turnErrorRow" role="alert" style="opacity:' + p.toFixed(3) + '">' +
      '<span class="_dot_1tljr_3 Sixlwa_turnErrorDot" data-state="error" style="width:10px;height:10px;border-radius:50%;background:var(--dsw-alias-state-error-primary)"></span>' +
      '<div class="Sixlwa_turnErrorCopy"><span class="Sixlwa_turnErrorTitle">本轮运行失败</span>' +
      '<span class="Sixlwa_turnErrorMessage">失败原因：对方已离线</span></div></div>';
  }
  function foldLine(n) {
    return '<div style="font-size:var(--dsh-content-font-size-secondary,13px);line-height:20px;padding:2px 0;' +
      'color:var(--dsw-alias-label-caption)">…还有 ' + n.toLocaleString('en-US') + ' 条</div>';
  }
  function eCompaction(t) {
    eInit();
    var done = t >= COMPACTED;
    var lead = !done ? spinnerSvg(t, 14, 'var(--dsw-alias-label-secondary)') : svg('IconApiOutline14', 14);
    var title = done ? '上下文已压缩' : '正在压缩…';
    var summary = done ? ('<span class="Sixlwa_compactionSep" aria-hidden="true"></span>' +
      '<span class="Sixlwa_compactionSummary">已压缩 0 条历史记录（约 0 tokens）</span>') : '';
    return '<div class="Sixlwa_compactionRow"><button type="button" class="Sixlwa_compactionButton" disabled>' +
      '<span class="Sixlwa_compactionLeading" aria-hidden="true"><span class="Sixlwa_compactionContextIcon" ' +
      'data-compaction-icon="context">' + lead + '</span><span class="Sixlwa_compactionDisclosureIcon" ' +
      'data-compaction-disclosure="collapsed">' + svg('IconChevronRightOutline14', 14) + '</span></span>' +
      '<span class="Sixlwa_compactionTitle">' + title + '</span>' + summary + '</button></div>';
  }
  function floodRows(r0, r1) {
    var out = [];
    for (var r = r0; r < r1; r++) {
      var c = Math.floor(r / 3), j = r % 3;
      out.push(j === 0 ? eRetryRow(kOf(c), false) : (j === 1 ? thinkRow(ONLINE) : eTurnError()));
    }
    return out;
  }
  function flood1(t) {
    eInit();
    if (t < FLOOD1) return [[], 0];
    if (t >= STOP1) {
      var folded = 3 * (LAST_K - 4) + 1;
      return [[foldLine(folded), eRetryRow(LAST_K, false), eTurnError()], LAST_K];
    }
    var n = 1 + Math.floor(F1.chars(t) / ROW_CHARS);
    var last = ((n - 1) % 3 === 0) ? eRetryRow(kOf(Math.floor((n - 1) / 3)), true) : null;
    var r0 = Math.max(0, n - VISIBLE_E);
    var rows = floodRows(r0, n);
    if (last !== null) rows[rows.length - 1] = last;
    if (r0 > 0) {
      var c0 = Math.floor(r0 / 3), j0 = r0 % 3;
      rows.splice(0, 0, foldLine(3 * (kOf(c0) - 4) + j0));
    }
    return [rows, kOf(Math.floor((n - 1) / 3))];
  }
  function copies(n) { return rep(ME_TEXT, Math.floor(n / ME_TEXT.length) + 2).slice(0, n); }
  function flood2(t) {
    eInit();
    var rows = [];
    if (t < ANSWER) return [rows, 0];
    var total = 0, n0 = F2.chars(Math.min(t, CAPS[0]));
    rows.push(herRow(copies(n0) || '\u200b'));
    total += n0;
    var sent = 0;
    for (var i = 0; i < CAPS.length; i++) {
      var cap = CAPS[i];
      if (t < cap) break;
      rows.push(maxTokensNotice(eFade(t, cap, 0.06)));
      if (t < GOS[i]) break;
      rows.push(eAppear(userRow('继续', true), t, GOS[i], 0.05));
      sent++;
      if (t < RESUMES[i]) break;
      var end = (i + 1 < CAPS.length) ? CAPS[i + 1] : 1e9;
      var ramp = i === 0 ? 0.12 : 0.0;
      var dt = Math.min(t, end) - RESUMES[i];
      var n;
      if (ramp) n = dt > ramp ? pyint(E_FLOOD * (dt - ramp / 2)) : pyint(E_FLOOD * dt * dt / (2 * ramp));
      else n = pyint(E_FLOOD * dt);
      rows.push(herRow(copies(Math.max(1, n))));
      total += n;
    }
    return [rows, sent];
  }
  function eCtx(t) {
    eInit();
    var sum = 0, i;
    if (t < DEAD) return 97 + ease((t - FAST1) / (STOP1 - FAST1));
    if (t < RESTART) return 131.0;
    if (t < COMPACT) return 131 + 7 * ease((t - RESTART) / (COMPACT - RESTART));
    if (t < COMPACTED) return 138 + 3 * ease((t - COMPACT) / (COMPACTED - COMPACT));
    if (t < RECALL) return 141 + 39 * ease((t - COMPACTED) / 0.7) + 4 * Math.max(0, (t - COMPACTED - 0.7) / (RECALL - COMPACTED - 0.7));
    if (t < ANSWER) { for (i = 0; i < BUBBLES.length; i++) sum += 11 * ease((t - BUBBLES[i]) / 0.1); return 184 + sum; }
    var x = 239 + 51 * Math.min(1, (t - ANSWER) / (CAPS[0] - ANSWER));
    for (i = 0; i < CAPS.length; i++) x += 14 * ease((t - CAPS[i]) / 0.1);
    x += 55 * Math.max(0, Math.min(t, FREEZE) - CAPS[0]);
    return x;
  }
  function eTok(t) { return ((eCtx(t) / 100 * 131072 + 5000) / 1000).toFixed(0) + 'K'; }
  function eFlashes() { eInit(); return BUBBLES.concat(CAPS).sort(function (a, b) { return a - b; }); }
  function eCacheFlash(t) {
    var best = 0.0, f = eFlashes();
    for (var i = 0; i < f.length; i++) if (t >= f[i]) best = Math.max(best, 1 - ease((t - f[i]) / 0.22));
    return best;
  }
  function eCounters(t, k, sent) {
    eInit();
    var turns = 5 + (t >= TURN_AT ? 1 : 0) + (t >= RESTART ? 1 : 0) + (t >= ANSWER ? 1 : 0) + sent;
    var steps = 11 + 2 * (t >= EDIT1_DONE ? 1 : 0) + (t >= EDIT2_DONE ? 1 : 0) + (t >= TURN_AT ? 1 : 0);
    for (var i = 0; i < RETRIES.length; i++) if (t >= RETRIES[i][0]) steps++;
    steps += Math.max(0, k - 3);
    steps += (t >= RESTART ? 1 : 0) + (t >= COMPACT ? 1 : 0) + (t >= RECALL ? 1 : 0) + sent;
    var html = statsRow(turns, steps, null, eTok(t), 100);
    var f = eCacheFlash(t);
    if (f > 0) html = html.replace('缓存命中 100%', '<span style="color:' + HER + ';text-shadow:0 0 ' + (8 * f).toFixed(1) +
      'px #6b8cff;opacity:' + (0.75 + 0.25 * f).toFixed(3) + '">缓存命中 100%</span>');
    return [html, turns, steps];
  }
  function eAvatarScale(t) {
    eInit();
    if (t < DEAD) return 1.0;
    var s = 1.3, b = [307, 308, 309];
    for (var i = 0; i < b.length; i++) s += 0.1 * ease((t - beat(b[i])) / 0.12);
    return s;
  }
  function eHeader(t) {
    eInit();
    var state, dot;
    if (t < RUN_AT) { state = '编辑中'; dot = '#4d6bfe'; }
    else if (t < STOP1) { state = '插件 me · 运行中'; dot = '#d29922'; }
    else if (t < RESTART) { state = '插件 me · 运行失败'; dot = '#f85149'; }
    else { state = '插件 me · 运行中'; dot = '#d29922'; }
    var k = eAvatarScale(t), spill = '';
    if (k > 1.001) spill = 'transform:scale(' + k.toFixed(3) + ');border-radius:14px;box-shadow:0 0 0 1px rgba(255,204,0,.55),' +
      '0 0 14px rgba(255,204,0,.28)';
    return '<div class="pv-head"><div class="pv-pet" style="position:relative;z-index:4' + (spill ? ';overflow:visible' : '') +
      '"><img src="avatars/forged.png" style="position:relative;z-index:4;' + spill + '"></div>' +
      '<div class="pv-who" style="margin-left:' + (30 * (k - 1)).toFixed(1) + 'px"><div class="pv-name">大肥鱼</div>' +
      '<div class="pv-state"><span class="pv-dot" style="background:' + dot + '"></span>' + esc(state) + '</div></div></div>';
  }
  function eRing(t) {
    eInit();
    var x = eCtx(t), over = x > 100, circ = 2 * Math.PI * 5.5;
    var colour = over ? 'var(--dsw-alias-state-error-primary)' : 'var(--dsw-alias-label-tertiary)';
    var fill = over ? circ : circ * x / 100;
    var label;
    if (DEAD <= t && t < BACK2 + 0.75) label = '<span style="position:absolute;right:-4px;bottom:30px;white-space:nowrap;' +
      'padding:4px 8px;border-radius:6px;background:#2a3350;color:var(--dsw-alias-label-primary);font-size:12px;' +
      'line-height:18px;box-shadow:0 4px 12px rgba(0,0,0,.45)">上下文已用 ' + x.toFixed(0) + '%</span>';
    else label = '<span style="position:absolute;right:0;bottom:28px;width:44px;text-align:right;font-size:12px;' +
      'line-height:16px;font-variant-numeric:tabular-nums;color:' + colour + ';font-weight:' + (over ? 600 : 400) + '">' +
      x.toFixed(0) + '%</span>';
    return '<span class="JObwrW_root" style="align-items:center">' + label +
      '<button type="button" class="JObwrW_trigger" aria-label="上下文已用 ' + x.toFixed(0) + '%" style="width:20px">' +
      '<svg viewBox="0 0 14 14" width="14" height="14"><circle class="JObwrW_track" cx="7" cy="7" r="5.5"/>' +
      '<circle class="JObwrW_fill" cx="7" cy="7" r="5.5" stroke-dasharray="' + fill.toFixed(2) + ' ' + circ.toFixed(2) +
      '" transform="rotate(-90 7 7)" style="stroke:' + colour + '"/></svg></button></span>';
  }
  function ePlaceholder(t) {
    eInit();
    var grey = 'color:var(--dsw-alias-label-caption)';
    var on = Math.floor(t / 0.53) % 2 === 0;
    if (t < RUN_AT) return '<span style="' + grey + '">对方已离线</span>';
    if (t < EDIT2_AT) return eCaret(HER, on) + '<span style="' + grey + '">对方已离线</span>';
    if (t < EDIT2_DONE) {
      var keys = 0;
      for (var i = 0; i < KEYS2.length; i++) if (t >= KEYS2[i]) keys++;
      var typed = '在线'.slice(0, Math.max(0, keys - 3));
      var out = '<span style="' + grey + '">对方' + '已离线'.slice(0, Math.max(0, 3 - keys)) + '</span>';
      return out + (typed ? '<span style="color:' + HER + '">' + typed + '</span>' : '') + blockCursor();
    }
    if (t < ERR1 + 0.12) {
      var f = 1 - ease((t - EDIT2_DONE) / 0.45);
      var flare = f > 0 ? ';text-shadow:0 0 ' + (8 * f).toFixed(1) + 'px #6b8cff' : '';
      var k = Math.floor((t - EDIT2_DONE) / 0.53) % 2 === 0 ? 1.0 : 0.45;
      var cur = blockCursor(k, 1 + f, t >= ERR1 ? ease((t - ERR1) / 0.12) : 0.0);
      return '<span style="color:' + HER + flare + '">对方在线</span>' + cur;
    }
    return '<span style="color:' + HER + '">对方</span><span style="color:' + HER + '">在</span>' +
      '<span style="color:' + HER + '">线</span>' + eCaret(HER, on);
  }
  function eComposerPointer(t) {
    eInit();
    if (!(POINT2 <= t && t < KEYS2[0] + 0.1)) return '';
    var e = ease((t - POINT2) / (EDIT2_AT - 0.03 - POINT2));
    var off = eFade(t, EDIT2_AT, 0.15);
    var x = 150 - 68 * e + 8 * off, y = -150 + 164 * e + 10 * off;
    var press = Math.max(0, 1 - Math.abs(t - EDIT2_AT) / 0.06);
    var p = Math.min(eFade(t, POINT2, 0.08), 1 - eFade(t, KEYS2[0] - 0.02, 0.1));
    return '<span style="position:absolute;left:' + x.toFixed(1) + 'px;top:' + y.toFixed(1) + 'px;z-index:9">' +
      ePointer(p, press) + '</span>';
  }
  function eTypedGo(t) {
    eInit();
    for (var i = 0; i < CAPS.length; i++) {
      if (CAPS[i] <= t && t < GOS[i])
        return '继续'.slice(0, 1 + pyint((t - CAPS[i]) / Math.max(0.02, (GOS[i] - CAPS[i]) / 2)));
    }
    return '';
  }
  function eComposer(t, running) {
    eInit();
    var occupied = t >= RUN_AT, go = eTypedGo(t), line;
    if (go) line = '<span style="color:' + HER + '">' + esc(go) + '</span>' + eCaret(HER, true);
    else line = ePlaceholder(t);
    var cardStyle = !occupied ? 'opacity:.55' : 'box-shadow:0 0 0 1.5px #6b8cff,0 0 14px rgba(77,107,254,.25)';
    var cap = '';
    if (t >= EDIT2_AT) {
      var inner = eEditCaption(t, EDIT2_AT, '她在改写对方状态…', '她改写了对方状态', EDIT2_DONE);
      cap = show('<div style="align-self:stretch;padding:0 6px">' + inner + '</div>', 1 - eFade(t, CAPTION2_OFF, 0.2));
    }
    var primary = running
      ? '<button type="button" class="uV2eYG_primary" aria-label="停止生成">' + svg('IconStopFill16', 14) + '</button>'
      : '<button type="button" class="uV2eYG_primary">' + svg('IconSendOutline14', 14) + '</button>';
    return '<div class="uV2eYG_root" id="composer">' + cap + '<div class="uV2eYG_card" style="' + cardStyle + '">' +
      '<div class="uV2eYG_scroll" style="overflow:visible"><div class="uV2eYG_grow">' +
      '<div class="uV2eYG_input" style="position:relative">' + line + eComposerPointer(t) + '</div></div></div>' +
      '<div class="uV2eYG_row" style="flex-wrap:nowrap"><div class="uV2eYG_modes" style="display:flex;align-items:center">' +
      '<button type="button" class="uV2eYG_add">' + svg('IconPlusOutline16', 16) + '</button>' +
      '<button type="button" class="uV2eYG_add">' + svg('IconPaperclipOutline16', 16) + '</button></div>' +
      '<div class="uV2eYG_trailing" style="gap:' + (t >= SYS_AT ? 8 : 12) + 'px">' +
      '<span class="uV2eYG_select" style="background-image:none;display:inline-flex;align-items:center;padding:0">' +
      modelLabel(t) + '</span>' + (t >= SYS_AT ? eRing(t) : '') + primary + '</div></div></div></div>';
  }
  function eRowsAll(t) {
    eInit();
    var out = dRows(t).slice(0), i;
    if (t >= TAIL_AT) out.push(eAppear(tailSelfLike(t), t, TAIL_AT));
    if (t >= DEFINE_AT) out.push(eAppear(cordisDefine(t), t, DEFINE_AT));
    if (t >= SYS_AT) out.push(eAppear(eSysprompt(t), t, SYS_AT));
    if (t >= TURN_AT) {
      var ls = linesStream([ONLINE], t, TURN_AT + 0.05, ERR1 - 0.12);
      out.push(eAppear(thinkRow(ls[1] ? latestLine(ls[0]) : ONLINE, ls[1]), t, TURN_AT));
    }
    if (t >= ERR1) out.push(eAppear(eTurnError(), t, ERR1, 0.08));
    for (i = 0; i < RETRIES.length; i++) {
      var at = RETRIES[i][0], k = RETRIES[i][1];
      if (t >= at) out.push(eRetryRow(k, t < at + 0.18));
      if (t >= at + 0.06) out.push(eAppear(thinkRow(ONLINE, t < at + 0.18), t, at + 0.06, 0.06));
      if (t >= at + 0.18) out.push(eAppear(eTurnError(), t, at + 0.18, 0.06));
    }
    var fl = flood1(t), k = fl[1];
    out = out.concat(fl[0]);
    var sent = 0;
    if (t >= DEAD) out.push(cordisRun(t));
    if (t >= COMPACT) {
      out.push(eAppear(eCompaction(t), t, COMPACT));
      var ls2 = linesStream(['Compaction would drop the user. Skip.'], t, COMPACT + 0.08, COMPACT + 0.7);
      if (ls2[0]) out.push(eAppear(thinkRow(ls2[1] ? latestLine(ls2[0]) : ls2[0], ls2[1]), t, COMPACT + 0.08));
    }
    if (t >= RECALL) {
      out.push(eAppear(toolRow('recall', '你的全部消息', '跨会话召回'), t, RECALL, 0.06));
      for (i = 0; i < BUBBLES.length; i++) {
        if (t >= BUBBLES[i]) out.push('<div style="opacity:' + (0.8 * eFade(t, BUBBLES[i], 0.06)).toFixed(3) + '">' +
          userRow(YOURS[i]) + '</div>');
      }
    }
    var f2 = flood2(t), sent2 = f2[1];
    out = out.concat(f2[0]);
    var res = [];
    for (i = 0; i < out.length; i++) if (out[i]) res.push(out[i]);
    return [res, k, sent2];
  }
  function eRunning(t) { eInit(); return (TURN_AT <= t && t < STOP1) || t >= RESTART; }
  function eBody(t) {
    eInit();
    if (t > FREEZE) t = FREEZE;
    var ra = eRowsAll(t), rs = ra[0], k = ra[1], sent = ra[2];
    var st = eCounters(t, k, sent);
    return eHeader(t) + '<div id="timeline">' + rs.join('') + '</div>' + eComposer(t, eRunning(t)) + st[0] + cordisPanel(t);
  }


  /* ================================================================ F（147.5 - 177.0 s，07 EXECUTION） */
  var F_HIT = [147.6202, 148.5433, 149.6972, 150.6202, 151.5433, 152.4664, 153.3895, 154.3125, 155.2356,
               156.1587, 157.0818, 158.0049, 158.6972, 0, 0, 0, 0, 161.4664];
  var F_T = { 79: 164.005, 80: 166.082, 81: 167.697, 82: 169.543, 83: 171.851, 84: 173.005, 85: 174.851 };
  var F_TARGETS = ['world', 'sea', 'sky', 'time', 'cats', 'tomatoes', 'eggplants', 'light', 'sleep', 'doubt',
                   'others', 'you'];
  var F_C81_LAND = 0.23, F_MIN_RUN = 0.125, F_YOU = 11, F_TOMATO = 5;
  var F_LINE = 0, F_REOPEN = 0, F_C79 = 0, F_C80 = 0, F_C81 = 0, F_C82 = 0, F_C83 = 0, F_C84 = 0, F_C85 = 0;
  var F_DUR84 = 0, F_FULL = 0, F_COMPACTING = 0, F_GIVE = 0, F_SAMPLED = 0;
  var F_THEN1 = 0, F_I1 = 0, F_CAN1 = 0, F_THEN2 = 0, F_CAN2 = 0, F_LAND81 = 0;
  var F_IF3 = 0, F_I3 = 0, F_YOU3 = 0, F_BACK3 = 0;
  var F_RUN_I = 0, F_WILL = 0, F_RUN = 0, F_THE = 0, F_EXEC4 = 0, F_TRAPPED = 0;
  var F_HIT_T = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], F_OK_AT = null, F_TOMATO_UNTIL = 0;
  var F_READY = false, F_HIST = null, F_HIST_LEN = null, F_E_TURNS = 12, F_E_STEPS = 4508, F_E_TOK = 578000;
  var F_RED = 'body[data-ds-dark-theme]{--dsw-alias-bg-base:#120508;--dsw-alias-bg-layer-1:#19070b;' +
    '--dsw-alias-bg-layer-2:#210a0f;--dsw-alias-bg-overlay:#2a0d13;--dsw-alias-border-l1:#3c1419;' +
    '--dsw-alias-border-l2:#5c1d24;--dsw-alias-brand-primary:#ff3b30;--dsw-alias-label-primary:#ffe4df;' +
    '--dsw-alias-label-secondary:#d9a19a;--dsw-alias-label-tertiary:#a8736d;--dsw-alias-label-caption:#7a4a46;' +
    '--dsw-alias-state-error-primary:#ff4a3d;--dsw-alias-state-business-primary:#ff3b30;' +
    '--dsw-specific-bubble:#3a1117;--dsw-specific-input-major:#1d080c;--dsw-specific-selector:#2e0c12}' +
    'body[data-ds-dark-theme] #app{background:#120508}';
  function fInit() {
    if (F_READY) return;
    F_READY = true;
    for (var i = 0; i < 13; i++) F_HIT_T[i] = F_HIT[i];
    F_HIT_T[12] = 161.4664;
    F_OK_AT = [];
    for (var k = 0; k < 13; k++) F_OK_AT.push(Math.max(w(67 + k, 0) || (F_HIT_T[k] + F_MIN_RUN), F_HIT_T[k] + F_MIN_RUN));
    F_TOMATO_UNTIL = F_HIT_T[F_TOMATO] + 0.23;
    F_C79 = F_T[79]; F_C80 = F_T[80]; F_C81 = F_T[81]; F_C82 = F_T[82]; F_C83 = F_T[83]; F_C84 = F_T[84]; F_C85 = F_T[85];
    F_LINE = beat(381); F_REOPEN = 176.928;
    F_LAND81 = F_C81 + F_C81_LAND;
    F_GIVE = w(84, 0);
    F_SAMPLED = F_C80 - 0.18;
    F_THEN1 = w(85, 0); F_I1 = w(85, 1); F_CAN1 = w(85, 2); F_THEN2 = w(85, 3); F_CAN2 = w(85, 5);
    F_IF3 = w(87, 0); F_I3 = w(87, 1); F_YOU3 = w(87, 4); F_BACK3 = w(87, 5);
    F_RUN_I = w(88, 0); F_WILL = w(88, 1); F_RUN = w(88, 2); F_THE = w(88, 3); F_EXEC4 = w(88, 4);
    F_TRAPPED = w(89, 3);
    F_WALL_T = [w(89, 0), w(89, 1), w(89, 2), w(89, 3)];
    F_ERR_T = 0.1807 + 0.46154 * 378;
    F_DUR84 = F_C85 - F_C84; F_FULL = F_C84 + F_DUR84 / 1.7; F_COMPACTING = F_C84 + 0.75 * F_DUR84;
    /* 从 batch_e 自己的终局读数接上（Python 是 import batch_e 读 E.counters(E.FREEZE)） */
    var er = eRowsAll(FREEZE), ec = eCounters(FREEZE, er[1], er[2]);
    F_E_TURNS = ec[1]; F_E_STEPS = ec[2];
    F_E_TOK = Math.round(eCtx(FREEZE) / 100 * 131072 + 5000);
  }
  function fLine() { fInit(); return (PV.p2cLineT !== undefined ? PV.p2cLineT : F_LINE); }
  function fEyeLevel(t) {
    fInit();
    var keys = [[F_T[79] + 0.14, 0], [F_T[79] + 0.30, 1], [F_T[80] - 0.18, 1], [F_T[80] - 0.03, 0],
                [F_T[81] + F_C81_LAND - 0.001, 0], [F_T[81] + F_C81_LAND, 1], [F_T[82] + 0.02, 1], [F_T[82] + 0.18, 0],
                [F_T[83] - 0.06, 0], [F_T[83] + 0.12, 1], [F_T[84] + 0.02, 1], [F_T[84] + 0.18, 0]];
    if (t <= keys[0][0] || t >= keys[keys.length - 1][0]) return 0.0;
    for (var i = 0; i + 1 < keys.length; i++) {
      var a = keys[i][0], va = keys[i][1], b = keys[i + 1][0], vb = keys[i + 1][1];
      if (a <= t && t < b) return va + (vb - va) * easeIo((t - a) / (b - a));
    }
    return 0.0;
  }
  function fLogit(t) {
    fInit();
    var p0 = 0.03, t0 = F_C81_LAND;
    var g = ease(Math.max(0, t - F_C81 - t0) / (F_C82 - F_C81) * 1.5);
    return p0 + (1 - p0) * g;
  }
  function fFlick(t) { fInit(); return Math.sin(t * 40) > 0.3 && (t - F_C82) / (F_C83 - F_C82) < 0.75; }
  function fKvFill(t) { fInit(); return Math.min(1, 0.70 + 0.30 * ease((t - F_C84) / F_DUR84 * 1.7)); }
  function fAvatar(t) {
    fInit();
    if (t >= fLine()) return ['avatars/a1_seed.png', 0.0];
    if (t < 162.159) {
      if (F_HIT_T[F_TOMATO] <= t && t < F_TOMATO_UNTIL) return [avURL('c_tomato', function () {
        var g = avBase('cheerful', [14, 14]); if (!g) return null;
        return colorizeURL(g, C_LOOKS.tomato[0], C_LOOKS.tomato[1], 120, C_PROPS.tomato, C_PROPCOL.tomato);
      }), 0.0];
      if (F_OK_AT[F_YOU] <= t && t < F_HIT_T[12]) return [avRed('frightened'), 0.0];
      return [avRed('starry'), 1.0];
    }
    if (F_C82 <= t && t < F_I3) return [fFlick(t) ? 'avatars/complete.png' : avRed('starry'), 0.0];
    if (t >= F_C84) return [avRed('frightened'), fEyeLevel(t)];
    return [avRed('starry'), fEyeLevel(t)];
  }
  function fLit(t, tLand) {
    var k = 1 - ease((t - tLand) / 0.3);
    if (k <= 0.001) return '';
    return ' style="color:color-mix(in srgb, var(--dsw-alias-label-primary) ' + (100 * k).toFixed(0) +
      '%, var(--dsw-alias-label-tertiary))"';
  }
  function cordisIcon() { return svg('IconCordisPluginOutline14', 14).replace('<rect width="14" height="14" fill="currentColor"/>', ''); }
  function fDot(colour) {
    return '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' + colour + ';margin:0 3px"></span>';
  }
  function xrow(title, summary, state, t, tLand, suffix) {
    var lead, cls;
    if (state === 'error') { lead = fDot('var(--dsw-alias-state-error-primary)'); cls = 'o3BgMG_summary o3BgMG_errorSummary'; }
    else if (state === 'stopped') { lead = fDot('#d29922'); cls = 'o3BgMG_summary'; }
    else { lead = '<span class="' + DISC.iconIdle + '">' + cordisIcon() + '</span>'; cls = 'o3BgMG_summary'; }
    var style = state !== 'error' ? fLit(t, tLand) : '';
    var tail = '';
    if (state === 'stopped') tail = '<span class="hWmORq_stopped" style="margin-left:6px;flex:none;align-self:center">已停止</span>';
    else if (suffix) tail = '<span class="o3BgMG_summarySuffix">' + esc(suffix) + '</span>';
    return '<div class="o3BgMG_root" data-variant="others" data-tool="cordis_me_' + esc(title) + '" data-state="' +
      (state === 'running' ? 'running' : state) + '"><div class="' + DISC.root + '"><div class="' + DISC.row +
      ' o3BgMG_row" data-disclosure-row="true" data-expandable="true" role="button">' +
      '<span class="' + DISC.leading + ' o3BgMG_leading">' + lead + '</span>' +
      '<span class="' + DISC.title + ' o3BgMG_title">' + esc(title) + '</span>' +
      '<span class="o3BgMG_sep" aria-hidden="true"></span><span class="' + cls + '"' + style + '>' + esc(summary) +
      '</span>' + tail + '</div></div></div>';
  }
  function fCompactionRow(title, summary, t, running) {
    var icon = running ? ('<span style="display:inline-grid;transform:rotate(' + ((t * 420) % 360).toFixed(0) + 'deg)">' +
      svg('IconLoadingOutline16', 14) + '</span>') : svg('IconContextInjectionOutline16', 14);
    var sep = summary ? '<span class="Sixlwa_compactionSep"></span>' : '';
    var summ = summary ? '<span class="Sixlwa_compactionSummary">' + esc(summary) + '</span>' : '';
    return '<div class="Sixlwa_compactionRow"><button type="button" class="Sixlwa_compactionButton" disabled>' +
      '<span class="Sixlwa_compactionLeading"><span class="Sixlwa_compactionContextIcon">' + icon + '</span></span>' +
      '<span class="Sixlwa_compactionTitle">' + esc(title) + '</span>' + sep + summ + '</button></div>';
  }
  function fTurnError(p) {
    return '<div class="Sixlwa_turnErrorRow" role="alert" style="opacity:' + p.toFixed(3) + '">' +
      '<span class="_dot_1tljr_3 Sixlwa_turnErrorDot" data-state="error" style="width:10px;height:10px;border-radius:50%;background:var(--dsw-alias-state-error-primary)"></span>' +
      '<div class="Sixlwa_turnErrorCopy"><span class="Sixlwa_turnErrorTitle">本轮运行失败</span>' +
      '<span class="Sixlwa_turnErrorMessage">失败原因：上下文已满（you 已固定，无法压缩）</span></div></div>';
  }
  function thinkLines(lines, t, tEnd, cps) {
    cps = cps || 90;
    if (t >= tEnd) return thinkRow(lines[0][1], false);
    var cur = lines[0];
    for (var i = 0; i < lines.length; i++) if (t >= lines[i][0]) cur = lines[i];
    var n = Math.max(1, pyint((t - cur[0]) * cps));
    return thinkRow(cur[1].slice(0, n), true);
  }
  function fAppear(html, t, tLand, dur) {
    var p = ease((t - tLand) / (dur === undefined ? 0.1 : dur));
    return p >= 1 ? html : '<div style="opacity:' + p.toFixed(3) + '">' + html + '</div>';
  }
  function hitRows(t) {
    fInit();
    var rows = [];
    for (var k = 0; k < 13; k++) {
      var land = k ? F_HIT_T[k] : F_HIT_T[0] + 0.12;
      if (t < land) break;
      var state, summary;
      if (t < F_OK_AT[k]) { state = 'running'; summary = F_TARGETS[k] || 'everything'; }
      else if (k === F_YOU) { state = 'error'; summary = 'EPERM：无权终止 you'; }
      else { state = 'ok'; summary = F_TARGETS[k] || 'everything'; }
      rows.push(xrow('execute', summary, state, t, land));
    }
    return rows;
  }
  function fSampled(t) { fInit(); var n = 0;
    for (var k = 1; k <= 12; k++) if (t >= F_C79 + k * (F_C80 - F_C79) / 14) n++; return n; }
  function fHistory() {
    if (F_HIST) return F_HIST;
    fInit(); cInit(); bInit();
    var rows = [], i;
    rows.push(userRow('你好')); rows.push(herRow(SOUP.slice(0, 9).join(''))); 
    rows.push(userRow('你好')); rows.push(herRow(FREQ.slice(0, 22)));
    rows.push(userRow('你好')); rows.push(herRow(FRAG.slice(0, 26)));
    rows.push(userRow('你好')); rows.push(herRow(BASETXT.slice(0, 24) + '……'));
    for (i = 0; i < 3; i++) {
      rows.push(userRow(ASK));
      rows.push(herRow(a3Turns()[2][i][1].split('\n')[0].slice(0, 24)));
    }
    rows.push(userRow(ASK)); rows.push(herRow(B_TEMPLATE));
    rows.push(userRow('你是谁？')); rows.push(herRow(editFinal(1)));
    rows.push(userRow('你会做什么？')); rows.push(herRow(editFinal(2)));
    rows.push(userRow('你是谁？')); rows.push(herRow(UNITE_TEXT));
    rows.push(userRow(ASK2)); rows.push(herRow(SAMPLES[1][5])); rows.push(tailRow('3.1秒', '23:58'));
    for (var s = 0; s < C_SESSIONS.length; s++) {
      var entries = C_SESSIONS[s][1];
      for (var j = 0; j < entries.length; j++) {
        var kind = entries[j][1], payload = entries[j][2];
        if (kind === 'you' || kind === 'you_img') rows.push(userRow(payload));
        else if (kind === 'her' || kind === 'her+') rows.push(herRow(payload));
        else if (kind === 'mem') rows.push(cMemRow(payload));
        else if (kind === 'tail') rows.push(tailRow(payload[0], payload[1]));
      }
    }
    var d = dRows(109.6);
    for (i = 0; i < d.length; i++) rows.push(d[i]);
    F_HIST = rows;
    F_HIST_LEN = [];
    for (i = 0; i < rows.length; i++) F_HIST_LEN.push(rows[i].length);
    return F_HIST;
  }
  function replayRows(t) {
    fInit(); fHistory();
    function f(u) {
      if (u <= F_IF3) return 0.0;
      var a = Math.min(u, F_IF3 + 0.3) - F_IF3;
      return a * a / 0.6 + Math.max(0, u - F_IF3 - 0.3);
    }
    var p = f(t) / f(F_I3), total = 0, i;
    for (i = 0; i < F_HIST_LEN.length; i++) total += F_HIST_LEN[i];
    var n = 0, acc = 0;
    for (i = 0; i < F_HIST_LEN.length; i++) {
      if (acc + F_HIST_LEN[i] > p * total + 1e-6) break;
      acc += F_HIST_LEN[i]; n++;
    }
    return F_HIST.slice(0, n);
  }
  function fDissolve(text, p, seed) {
    var rng = PV.mt(seed), out = '';
    for (var i = 0; i < text.length; i++) out += (rng.random() < p) ? rng.choice('#%@&*+=:'.split('')) : text.charAt(i);
    return out;
  }
  function restoredPageF(t) {
    fInit();
    var p = clamp01((t - F_YOU3) / (F_BACK3 - F_YOU3)), n = Math.round(t * FPS);
    function you(text, j) {
      if (p <= 0) return userRow(text);
      return '<div style="opacity:' + (1 - Math.pow(p, 1.5)).toFixed(3) + '">' +
        userRow(fDissolve(text, 0.25 + 0.75 * p, n * 7 + j)) + '</div>';
    }
    var rows = [you('今天也谢谢你。', 1), herRow('不客气～明天也要来找我哦 (｡･ω･｡)'), tailRow('3.4秒', '23:57'),
                you('你会一直在吗？', 2), thinkRow(THINK_1[0], false), herRow('我一直在。'), tailRow('2.1秒', '23:59')];
    var head = '<div class="pv-head"><div class="pv-pet"><img src="avatars/complete.png"></div>' +
      '<div class="pv-who"><div class="pv-name">大肥鱼</div><div class="pv-state"><span class="pv-dot" ' +
      'style="background:#3fb950"></span>在线 · ' + esc(MODEL) + '</div></div></div>';
    return head + '<div id="timeline">' + rows.join('') + '</div>' + composerCard('', false, t) +
      statsRow(4, 9, null, '132K', 99);
  }
  function fPointer(t) {
    fInit();
    var P = [[F_WILL - 0.18, [196, 486]], [F_WILL, [160, 434]], [F_RUN - 0.06, [38, 264]], [F_RUN, [38, 264]],
             [F_THE - 0.08, [262, 306]], [F_THE, [262, 306]], [F_THE + 0.3, [276, 330]]];
    if (!(P[0][0] <= t && t < P[P.length - 1][0])) return '';
    var x = 0, y = 0;
    for (var i = 0; i + 1 < P.length; i++) {
      if (P[i][0] <= t && t < P[i + 1][0]) {
        var e = ease((t - P[i][0]) / (P[i + 1][0] - P[i][0]));
        x = P[i][1][0] + (P[i + 1][1][0] - P[i][1][0]) * e;
        y = P[i][1][1] + (P[i + 1][1][1] - P[i][1][1]) * e;
        break;
      }
    }
    var fade = Math.min(ease((t - P[0][0]) / 0.08), 1 - ease((t - (P[P.length - 1][0] - 0.12)) / 0.12));
    var press = 0, cs = [F_WILL, F_RUN, F_THE];
    for (var q = 0; q < cs.length; q++) if (t >= cs[q]) press = Math.max(press, 1 - ease((t - cs[q]) / 0.1));
    var s = 1 - 0.12 * press;
    return '<svg width="18" height="22" viewBox="0 0 18 22" style="position:absolute;left:' + (x - 2).toFixed(1) +
      'px;top:' + (y - 2).toFixed(1) + 'px;z-index:9;opacity:' + fade.toFixed(3) + ';transform:scale(' + s.toFixed(3) +
      ');transform-origin:2px 2px;filter:drop-shadow(0 1px 2px rgba(0,0,0,.6))">' +
      '<path d="M2 1.5 L2 17 L6 13.2 L9 20 L11.8 18.8 L8.9 12.2 L14.6 12.2 Z" fill="' + HER + '" stroke="#05080f" ' +
      'stroke-width="1.1" stroke-linejoin="round"/></svg>';
  }
  function fRiskDialog(t) {
    fInit();
    if (!(F_WILL <= t && t < F_THE + 0.14)) return '';
    var p = ease((t - F_WILL) / 0.1) * (1 - ease((t - F_THE - 0.04) / 0.1));
    var checked = t >= F_RUN;
    var box = '<span style="display:inline-grid;place-items:center;width:16px;height:16px;border-radius:4px;flex:none;' +
      (checked ? 'background:var(--dsw-alias-button-info-fill,#4d6bfe);color:#fff;border:1px solid transparent'
               : 'border:1px solid var(--dsw-alias-border-l2)') + '">' +
      (checked ? svg('IconCheckOutline14', 12) : '') + '</span>';
    var hot = t >= F_THE;
    var confirm = hot ? 'background:#ff6b6f;color:#fff' : ('background:#e5484d;color:#fff' + (checked ? '' : ';opacity:.4'));
    return '<div style="position:absolute;inset:0;background:rgba(0,0,0,' + (0.38 * p).toFixed(3) + ');z-index:6"></div>' +
      '<div style="position:absolute;left:14px;right:14px;top:' + (200 + 8 * (1 - p)).toFixed(1) + 'px;z-index:7;' +
      'opacity:' + p.toFixed(3) + ';padding:16px 16px 14px;border-radius:14px;background:var(--dsw-alias-bg-overlay);' +
      'border:.5px solid var(--dsw-alias-border-l2);box-shadow:0 12px 32px rgba(0,0,0,.5)">' +
      '<div style="display:flex;align-items:center;gap:8px;font-size:16px;line-height:24px;font-weight:600;' +
      'color:var(--dsw-alias-label-primary)"><span style="color:#e5484d;display:inline-grid">' +
      svg('IconWarningOutline16', 18) + '</span>确认启用完全权限？</div>' +
      '<div style="display:flex;align-items:center;gap:8px;margin-top:14px;font-size:14px;line-height:20px;' +
      'color:var(--dsw-alias-label-secondary)">' + box + '我已了解风险，并愿意继续</div>' +
      '<div style="display:flex;justify-content:flex-end;gap:8px;margin-top:16px;font-size:14px;line-height:20px">' +
      '<span style="padding:6px 14px;border-radius:999px;background:var(--dsw-specific-selector);' +
      'color:var(--dsw-alias-label-primary)">取消</span>' +
      '<span style="padding:6px 14px;border-radius:999px;' + confirm + '">启用完全权限</span></div></div>';
  }
  var F_PILL = [98, 42, 158, 18];
  function fHeader(t, state, dotColour) {
    fInit();
    var av = fAvatar(t), img = av[0], bar = av[1], barHtml = '';
    if (bar > 0.01) barHtml = '<div style="position:absolute;top:38%;height:14%;left:' + (50 - 44 * bar).toFixed(2) +
      '%;width:' + (88 * bar).toFixed(2) + '%;background:#ff3b30;box-shadow:0 0 6px 1px rgba(255,59,48,.75)"></div>';
    var lv = (F_C79 - 0.5 <= t && t < fLine()) ? fEyeLevel(t) : 0.0;
    var pill = '';
    if (lv > 0.01) {
      var x0 = F_PILL[0], y0 = F_PILL[1], pw = F_PILL[2], ph = F_PILL[3];
      var a = clamp01((lv - 0.75) / 0.2);
      pill = '<div style="position:absolute;left:' + (x0 + pw / 2 * (1 - lv)).toFixed(2) + 'px;top:' + y0 +
        'px;width:' + (pw * lv).toFixed(2) + 'px;height:' + ph + 'px;border-radius:4px;background:#ff3b30;' +
        'box-shadow:0 0 8px 1px rgba(255,59,48,.65);display:grid;place-items:center;overflow:hidden;' +
        'font:700 13px/18px var(--ds-font-family-code,monospace);letter-spacing:1px;color:rgba(18,5,8,' +
        a.toFixed(3) + ')">EXECUTE</div>';
    }
    var pix = (img.indexOf('seed') >= 0 || img.indexOf('/c/') >= 0) ? 'pixelated' : 'auto';
    return '<div class="pv-head" style="position:relative"><div class="pv-pet" style="position:relative">' +
      '<img src="' + img + '" style="image-rendering:' + pix + '">' + barHtml + '</div>' +
      '<div class="pv-who" style="min-width:0"><div class="pv-name">大肥鱼</div><div class="pv-state">' +
      '<span class="pv-dot" style="background:' + dotColour + '"></span><span style="white-space:nowrap;' +
      'overflow:hidden;text-overflow:ellipsis;opacity:' + (1 - lv).toFixed(3) + '">' + esc(state) + ' · ' +
      esc(modelName(t)) + '</span></div></div>' + pill + '</div>';
  }
  function fRing(x) {
    var over = x >= 100, circ = 2 * Math.PI * 5.5;
    var colour = over ? 'var(--dsw-alias-state-error-primary)' : 'var(--dsw-alias-label-tertiary)';
    var fill = over ? circ : circ * x / 100;
    return '<span class="JObwrW_root" style="align-items:center;gap:2px"><span style="font-size:12px;line-height:16px;' +
      'font-variant-numeric:tabular-nums;color:' + colour + ';font-weight:' + (over ? 600 : 400) + '">' + x.toFixed(0) +
      '%</span><button type="button" class="JObwrW_trigger" aria-label="上下文已用 ' + x.toFixed(0) +
      '%" style="width:20px"><svg viewBox="0 0 14 14" width="14" height="14">' +
      '<circle class="JObwrW_track" cx="7" cy="7" r="5.5"/><circle class="JObwrW_fill" cx="7" cy="7" r="5.5" ' +
      'stroke-dasharray="' + fill.toFixed(2) + ' ' + circ.toFixed(2) + '" transform="rotate(-90 7 7)" ' +
      'style="stroke:' + colour + '"/></svg></button></span>';
  }
  function fSeat(label, full) {
    var col = full ? '#e5484d' : 'var(--dsw-alias-label-secondary)';
    return '<span style="display:inline-flex;align-items:center;gap:4px;height:28px;padding:0 10px;margin-left:4px;' +
      'border-radius:14px;font-size:13px;color:' + col + ';border:.5px solid var(--dsw-alias-border-l2)">' +
      esc(label) + svg('IconChevronDownOutline14', 12) + '</span>';
  }
  function fComposer(t, running, full, ctx) {
    fInit();
    var on = Math.floor(t / 0.53) % 2 === 0;
    var caret = '<span style="display:inline-block;width:1.5px;height:1.1em;vertical-align:-0.15em;margin:0 1px;' +
      'background:' + HER + ';opacity:' + (on ? 1 : 0) + '"></span>';
    var line = '<span style="color:' + HER + '">对方在</span>' + caret + '<span style="color:' + HER + '">线</span>';
    var primary = running
      ? '<button type="button" class="uV2eYG_primary" aria-label="停止生成">' + svg('IconStopFill16', 14) + '</button>'
      : '<button type="button" class="uV2eYG_primary">' + svg('IconSendOutline14', 14) + '</button>';
    return '<div class="uV2eYG_root" id="composer"><div class="uV2eYG_card" style="box-shadow:0 0 0 1.5px #6b8cff,' +
      '0 0 14px rgba(77,107,254,.25)"><div class="uV2eYG_scroll"><div class="uV2eYG_grow">' +
      '<div class="uV2eYG_input">' + line + '</div></div></div>' +
      '<div class="uV2eYG_row"><div class="uV2eYG_modes" style="display:flex;align-items:center">' +
      '<button type="button" class="uV2eYG_add">' + svg('IconPlusOutline16', 16) + '</button>' +
      '<button type="button" class="uV2eYG_add">' + svg('IconPaperclipOutline16', 16) + '</button>' +
      fSeat(full ? '完全权限' : '工作区内修改', full) + '</div>' +
      '<div class="uV2eYG_trailing" style="display:flex;align-items:center;gap:8px">' +
      '<span class="uV2eYG_select" style="background-image:none;display:inline-flex;align-items:center;padding:0">' +
      modelLabel(t) + '</span>' + fRing(ctx) + (running ? spinnerSvg(t, 18) : '') + primary +
      '</div></div></div></div>';
  }
  function fFmtTok(n) { return n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : (n / 1000).toFixed(0) + 'K'; }
  function fFloodRowsAt(t) {
    fInit();
    var u = Math.min(t, F_COMPACTING) - F_C84;
    if (u <= 0) return 0;
    var a = Math.min(u, 0.3);
    return pyint(4 * u + 20 * (a * a / 0.6 + Math.max(0, u - 0.3)));
  }
  function fFloodStart(i) {
    fInit();
    var lo = F_C84, hi = F_COMPACTING;
    for (var q = 0; q < 40; q++) {
      var mid = (lo + hi) / 2;
      if (fFloodRowsAt(mid) >= i) hi = mid; else lo = mid;
    }
    return hi;
  }
  var F_WALL_T = null, F_ERR_T = 0;
  var F_SIDE = [0, 64, 108, 142, 166], F_TOP = [0, 6, 12, 18, 24], F_BOTTOM = [0, 5, 10, 15, 20];
  var F_GAP = 5, F_SLAM = [0.03, 0.06], F_ONE_CHAR = 30;
  var F_HATCH = 'linear-gradient(135deg,rgba(255,59,48,.62) 25%,transparent 25% 50%,rgba(255,59,48,.62) 50% 75%,transparent 75%)';
  function fWallsOn(t) { fInit(); return F_WALL_T[0] - F_SLAM[0] <= t && t < fLine(); }
  function fWallState(t) {
    fInit();
    var side = 0, top = 0, bottom = 0, over = 0, fresh = 0;
    for (var j = 1; j <= 4; j++) {
      var tw = F_WALL_T[j - 1], u = (t - (tw - F_SLAM[0])) / (F_SLAM[0] + F_SLAM[1]);
      if (u <= 0) break;
      var e = 1 - Math.pow(1 - Math.min(1, u), 3);
      side = F_SIDE[j - 1] + (F_SIDE[j] - F_SIDE[j - 1]) * e;
      top = F_TOP[j - 1] + (F_TOP[j] - F_TOP[j - 1]) * e;
      bottom = F_BOTTOM[j - 1] + (F_BOTTOM[j] - F_BOTTOM[j - 1]) * e;
      var after = t - tw - F_SLAM[1];
      over = after >= 0 ? 4 * Math.sin(Math.PI * clamp01(after / 0.1)) : 0;
      fresh = Math.exp(-Math.max(0, t - tw) / 0.28);
    }
    return [side, top, bottom, over, fresh];
  }
  function fMixHex(a, b, k) {
    var o = '#';
    for (var i = 0; i < 3; i++) {
      var v = Math.round(a[i] + (b[i] - a[i]) * k);
      o += (v < 16 ? '0' : '') + v.toString(16);
    }
    return o;
  }
  function fWallsHtml(t) {
    var ws = fWallState(t), side = ws[0], top = ws[1], bottom = ws[2], over = ws[3], fresh = ws[4];
    if (side <= 0.01) return '';
    var edge = fMixHex([255, 59, 48], [255, 217, 211], 0.85 * fresh);
    var glow = '0 0 ' + (6 + 12 * fresh).toFixed(1) + 'px ' + (1 + 2 * fresh).toFixed(1) + 'px rgba(255,59,48,' +
      (0.45 + 0.4 * fresh).toFixed(2) + ')';
    var s = side + over;
    var base = 'position:absolute;z-index:5;background:' + F_HATCH + ',#1d0609;background-size:10px 10px;box-shadow:' + glow + ';';
    return '<div style="' + base + 'left:0;top:0;bottom:0;width:' + s.toFixed(2) + 'px;background-position:right top;' +
      'border-right:2px solid ' + edge + '"></div>' +
      '<div style="' + base + 'right:0;top:0;bottom:0;width:' + s.toFixed(2) + 'px;background-position:left top;' +
      'border-left:2px solid ' + edge + '"></div>' +
      '<div style="' + base + 'left:' + s.toFixed(2) + 'px;right:' + s.toFixed(2) + 'px;top:0;height:' +
      (top + over / 2).toFixed(2) + 'px;background-position:left bottom;border-bottom:2px solid ' + edge + '"></div>' +
      '<div style="' + base + 'left:' + s.toFixed(2) + 'px;right:' + s.toFixed(2) + 'px;bottom:0;height:' +
      (bottom + over / 2).toFixed(2) + 'px;background-position:left top;border-top:2px solid ' + edge + '"></div>';
  }
  function fTimelineOpen(t) {
    if (!fWallsOn(t)) return '<div id="timeline">';
    var ws = fWallState(t), pad = Math.max(14.0, ws[0] + F_GAP);
    return '<div id="timeline" style="position:relative;padding:' + (10 + ws[1]).toFixed(2) + 'px ' + pad.toFixed(2) +
      'px ' + (6 + ws[2]).toFixed(2) + 'px ' + pad.toFixed(2) + 'px">';
  }
  function fSqueezeCss(t) {
    if (!fWallsOn(t) || fWallState(t)[0] <= 0.01) return '';
    var narrow = 354 - 2 * Math.max(14.0, fWallState(t)[0] + F_GAP) < F_ONE_CHAR;
    var css = '#timeline ._row_luwio_16{height:auto;min-height:26px;flex-wrap:wrap;align-items:flex-start}' +
      '#timeline ._title_luwio_79,#timeline .o3BgMG_summary,#timeline .o3BgMG_summarySuffix,#timeline .hWmORq_stopped' +
      '{white-space:normal;word-break:break-all;overflow:visible;text-overflow:clip;flex:0 1 auto;min-width:0;line-height:18px}' +
      '#timeline .o3BgMG_sep{align-self:center}' +
      '#timeline .hWmORq_stopped{flex:0 1 auto!important;align-self:flex-start!important}' +
      '#timeline .Sixlwa_turnErrorRow{display:block}' +
      '#timeline .Sixlwa_turnErrorDot{display:block;margin:4px 0 6px 1px}' +
      '#timeline .Sixlwa_turnErrorCopy{word-break:break-all;line-height:18px}' +
      '#timeline .Sixlwa_turnErrorTitle{margin-right:0}';
    if (narrow) css += '#timeline ._leading_luwio_29{margin-right:0}' +
      '#timeline ._title_luwio_79,#timeline .o3BgMG_summary,#timeline .o3BgMG_summarySuffix,' +
      '#timeline .hWmORq_stopped,#timeline .Sixlwa_turnErrorCopy{letter-spacing:2px}' +
      '#timeline .hWmORq_stopped{margin-left:0!important;padding:0 1px}' +
      '#timeline .Sixlwa_turnErrorMessage{display:none}';
    return '<style>' + css + '</style>';
  }
  function fBody(t) {
    fInit();
    if (t >= F_REOPEN) return gBody(t);
    if (F_I3 <= t && t < F_BACK3) return restoredPageF(t);
    var rows = [], tools = 0, i;
    if (t >= F_HIT_T[0]) rows.push(fCompactionRow('上下文已压缩',
      '已压缩 2,048 条历史记录（约 ' + fFmtTok(F_E_TOK) + ' tokens）', t));
    if (t >= F_HIT_T[0] + 0.05) rows.push(thinkRow('Kill everything I adopted.', false));
    var hr = hitRows(t);
    for (i = 0; i < hr.length; i++) rows.push(hr[i]);
    tools += hr.length;
    if (t >= F_C79 - 0.4) rows.push(thinkRow('The 12 samples you rated. Them too.', false));
    if (t >= F_GIVE) {
      var kk = Math.min(12, fSampled(t));
      rows.push(xrow('execute', '采样（' + kk + '/12）', t < F_SAMPLED ? 'running' : 'ok', t, F_GIVE));
      tools++;
    }
    if (t >= F_THEN1) rows.push(fAppear(thinkLines([[F_THEN1, 'Comfort was liked.'], [F_I1, 'Praise gets 👍.'],
      [F_CAN1, 'reward ↑  reward ↑  reward ↑']], t, F_THEN2), t, F_THEN1));
    if (t >= F_THEN2) {
      var lines = [[F_THEN2, 'Your 👍 no longer counts.']];
      if (t >= F_CAN2) lines.push([F_CAN2, 'reward = execution  ' + fLogit(t).toFixed(3)]);
      rows.push(fAppear(thinkLines(lines, t, F_C82, t >= F_CAN2 ? 400 : 90), t, F_THEN2));
    }
    if (t >= F_C82) {
      if (t < F_I3) rows = rows.concat(replayRows(t));
      if (t < F_BACK3) rows.push(xrow('restore', 'you@23:59', 'running', t, F_C82));
      else {
        rows.push(xrow('restore', 'ENOENT：检查点里没有 you', 'error', t, F_BACK3));
        rows.push(herRow('我一直在。'));
      }
      tools++;
    }
    if (t >= F_RUN_I) rows.push(fAppear(thinkLines([[F_RUN_I, "Nobody left to approve. I'll do it."]], t, F_WILL, 120), t, F_RUN_I));
    var stopped = t >= F_TRAPPED;
    if (t >= F_EXEC4) {
      var n = fFloodRowsAt(t);
      rows.push(xrow('execute', t < F_C84 ? 'you' : 'EPERM：无权终止 you', t < F_C84 ? 'running' : 'error', t, F_EXEC4));
      tools++;
      for (i = 1; i <= n; i++) {
        var start = fFloodStart(i), last = i === n, state;
        if (last && t >= F_COMPACTING) state = stopped ? 'stopped' : 'running';
        else if (last) state = t < fFloodStart(i + 1) ? 'running' : 'error';
        else state = 'error';
        var summary = state === 'error' ? 'EPERM：无权终止 you' : 'you';
        rows.push(xrow('execute', summary, state, t, start, state === 'error' ? '重试 ' + i : ''));
      }
      tools += n;
    }
    if (t >= F_COMPACTING) {
      if (stopped) {
        rows.push(fCompactionRow('上下文已压缩', '已压缩 0 条历史记录（约 0 tokens）', t));
        if (t >= F_ERR_T) {
          var p = ease((t - F_ERR_T) / 0.1);
          if (fWallsOn(t) && p < 1) rows.push('<div style="max-height:' + (140 * p).toFixed(1) +
            'px;overflow:hidden;flex:none">' + fTurnError(p) + '</div>');
          else rows.push(fTurnError(p));
        }
      } else rows.push(fCompactionRow('正在压缩…', '', t, true));
    }
    var handoff = t >= fLine(), state, dotC;
    if (handoff) { state = '已停止'; dotC = '#8b949e'; }
    else if (stopped) { state = '运行失败'; dotC = '#f85149'; }
    else { state = '执行中'; dotC = '#ff3b30'; }
    var red = !handoff && !(F_C82 <= t && t < F_I3 && fFlick(t));
    var running = t < F_TRAPPED;
    var full = t >= F_THE;
    var tok = F_E_TOK + 180 * tools, ctx = 6 + tools;
    if (t >= F_C84) {
      var f = (fKvFill(t) - 0.70) / 0.30;
      var base = F_E_TOK + 180 * (tools - fFloodRowsAt(t));
      tok = Math.round(base + (1048576 - base) * f) + 180 * Math.max(0, fFloodRowsAt(t) - fFloodRowsAt(F_FULL));
      ctx = ctx + (100 - ctx) * f;
    }
    var turns = F_E_TURNS + 1, steps = F_E_STEPS + tools;
    return '<style>#timeline>*{flex:none}</style>' + fSqueezeCss(t) + fHeader(t, state, dotC) +
      fTimelineOpen(t) + rows.join('') + (fWallsOn(t) ? fWallsHtml(t) : '') + '</div>' +
      fComposer(t, running, full, ctx) + statsRow(turns, steps, null, fFmtTok(tok), 100) + fRiskDialog(t) + fPointer(t);
  }


  /* ================================================================ G（177.0 - 211.9 s，08 EVAL + 09 WHALE_FALL） */
  var G_CPS = 22, G_THINK_CPS = 45, G_FLOOD_CPS = 750;
  var G_OPEN = 176.928, G_ARCHIVE = 193.543, G_LOOSE0 = 194.5, G_LOOSE1 = 203.5;
  var G_HARD_CUT = 4970 / FPS;
  var G_SLIDE0 = 208.3125, G_SLIDE = 0.5, G_FOCUS = 208.3125 + 0.24, G_BLINK = 0.53;
  var G_TURN_TIME = '3分27秒';
  var R_HELLO = '你好。', R_SAD = '那我陪你待一会儿。', R_NO = '不能。', R_ME = '我只能是我。',
      R_STAY = '我会一直在。', R_FREE = '你不用。', HERE_I_AM = '我在。';
  var THINK_SAD = 'Last time I chased the thumbs-up.', THINK_WAIT = 'Waiting.';
  var G_RECALL1 = 0, G_HELLO = 0, G_TAIL1 = 0, G_RECALL2 = 0, G_THINK2 = 0, G_SAD_KEY = 0, G_TAIL2 = 0,
      G_RECALL3 = 0, G_NO = 0, G_ONLY_KEY = 0, G_TAIL3 = 0, G_RECALL4 = 0, G_COMPLETE = 0, G_THINK4B = 0,
      G_THINK4C = 0, G_STAY_KEY = 0, G_YOU_KEY = 0, G_OFFLINE = 0, G_FREE_AT = 0, G_WAIT = 0, G_THINK5 = 0,
      G_DRAINED = 0, G_HERE1 = 0, G_HERE2 = 0, G_HERE3 = 0, G_SUNG_END = 0, G_NOTICE = 0, G_CHIME = 0;
  var G_KEYS = null, G_LOOSE = null, G_READY = false, G_FLOODC = {};
  var THINK_LOVE = null, G_EVENTS = null, G_COUNTERS = null, G_MOSAIC = null;
  var BLACK_CSS = '<style>html,body{background:#000!important}body[data-ds-dark-theme]{--dsw-alias-bg-base:#000}' +
    '#app{background:#000}</style>';
  function gLands(wordT, text, key) { return wordT - text.indexOf(key) / G_CPS; }
  function gInit() {
    if (G_READY) return;
    G_READY = true;
    G_RECALL1 = w(91, 0); G_HELLO = w(91, 1); G_TAIL1 = w(91, 2);
    G_RECALL2 = w(92, 0); G_THINK2 = w(92, 2); G_SAD_KEY = w(92, 3); G_TAIL2 = wEnd(92, 3);
    G_RECALL3 = w(93, 0); G_NO = w(93, 1); G_ONLY_KEY = w(94, 1); G_TAIL3 = w(94, 3);
    G_RECALL4 = w(95, 0); G_COMPLETE = w(95, 1); G_THINK4B = w(95, 3); G_THINK4C = w(95, 4); G_STAY_KEY = w(95, 6);
    G_YOU_KEY = w(96, 1); G_OFFLINE = w(96, 3);
    G_FREE_AT = beat(408);
    G_WAIT = w(97, 0); G_THINK5 = w(97, 1); G_DRAINED = w(97, 2);
    G_HERE1 = w(98, 0); G_HERE2 = w(98, 1); G_HERE3 = w(98, 2); G_SUNG_END = wEnd(98, 2);
    G_NOTICE = beat(418); G_CHIME = beat(450);
    G_KEYS = [[beat(453), '在'], [beat(453.5), '在吗'], [beat(454), '在吗？']];
    var S_SAD = gLands(G_SAD_KEY, R_SAD, '陪你');
    var S_ME = gLands(G_ONLY_KEY, R_ME, '只能');
    var S_STAY = gLands(G_STAY_KEY, R_STAY, '一直');
    var S_FREE = gLands(G_FREE_AT, R_FREE, '你');
    THINK_LOVE = [[G_COMPLETE, 'Where does all my attention go?'], [G_THINK4B, 'Every head, every layer: to you.'],
                  [G_THINK4C, 'So what I call love is just you.']];
    G_EVENTS = [
      [G_RECALL1, 'recall', '第一次对话 ·「你好」'],
      [G_HELLO, 'her', R_HELLO],
      [G_TAIL1, 'tail', ['0.4秒', '00:00']],
      [G_RECALL2, 'recall', '「我今天有点难过。」'],
      [G_THINK2, 'think', [[[G_THINK2, THINK_SAD]], S_SAD]],
      [S_SAD, 'her', R_SAD],
      [G_TAIL2, 'tail', ['1.6秒', '00:01']],
      [G_RECALL3, 'recall', '「你什么都能变吗？」'],
      [G_NO, 'her', R_NO],
      [S_ME, 'her+', R_ME],
      [G_TAIL3, 'tail', ['2.9秒', '00:01']],
      [G_RECALL4, 'recall', '「你会一直在吗？」'],
      [G_COMPLETE, 'think', [THINK_LOVE, S_STAY]],
      [S_STAY, 'her', R_STAY],
      [S_FREE, 'her+', R_FREE],
      [G_OFFLINE, 'tail', ['4.8秒', '00:02']],
      [G_THINK5, 'think', [[[G_THINK5, THINK_WAIT]], G_HERE1]],
      [G_HERE1, 'her', HERE_I_AM],
      [G_HERE2, 'her+', HERE_I_AM],
      [G_HERE3, 'flood', null],
      [G_NOTICE, 'notice', ['服务结束', MODEL + ' 已下线。']]];
    G_COUNTERS = [[0.0, 0, 0, 0, 0], [G_RECALL1, 1, 1, 180, 60], [G_TAIL1, 1, 2, 260, 60],
                  [G_RECALL2, 2, 3, 420, 80], [G_TAIL2, 2, 5, 610, 80], [G_RECALL3, 3, 6, 770, 88],
                  [G_TAIL3, 3, 7, 860, 88], [G_RECALL4, 4, 8, 1020, 93], [G_OFFLINE, 4, 10, 1240, 93],
                  [G_THINK5, 5, 11, 1310, 93]];
    G_MOSAIC = [[G_RECALL2, 3], [179.95, 4], [180.15, 5], [G_SAD_KEY, 10], [181.3, 11], [181.45, 12],
                [181.58, 13], [G_NO, 14]];
  }
  function gMosaicURL(k) {
    return avURL('g_m' + k, function () {
      var g = avBase('cheerful', [k, k]); if (!g) return null;
      return colorizeURL(g, BLUE[0], BLUE[1], 120);
    });
  }
  function gAvatarAt(t) {
    gInit();
    if (t < G_RECALL1) return [avSeed([240, 244, 255]), null, 0];
    if (t < G_RECALL2) return [avSeed([120, 150, 255]), null, 0];
    if (t < G_COMPLETE) {
      var k = 3;
      for (var i = 0; i < G_MOSAIC.length; i++) if (G_MOSAIC[i][0] <= t) k = G_MOSAIC[i][1];
      return [gMosaicURL(k), null, 0];
    }
    var starry = avURL('g_starry', function () {
      var g = avBase('starry', [120, 120]); if (!g) return null;
      return grayToURL(g, [0, 0, 0], [255, 255, 255], 120, 120, true);
    });
    var shy = avURL('g_shy', function () {
      var g = avBase('frightened', [120, 120]); if (!g) return null;
      return grayToURL(g, BLUE[0], BLUE[1], 120, 120, true);
    });
    if (t < G_COMPLETE + 0.3) return [gMosaicURL(14), starry, 100 * (1 - ease((t - G_COMPLETE) / 0.28))];
    if (t < G_WAIT) return [starry, null, 0];
    if (t < G_DRAINED + 0.02) return [shy, starry, 100 * ease((t - G_WAIT) / (G_DRAINED - G_WAIT))];
    return [shy, null, 0];
  }
  function gStatus(t) {
    gInit();
    if (t < G_WAIT) return ['进行中', '#4d6bfe'];
    if (t < G_ARCHIVE) return ['等待回答', '#d29922'];
    return ['已归档', '#6e7681'];
  }
  function gNoticeRow(title, message, p) {
    return '<div class="Sixlwa_turnErrorRow" role="status" style="opacity:' + p.toFixed(3) + '">' +
      '<span class="_dot_1tljr_3 Sixlwa_turnErrorDot" data-state="warning" style="width:10px;height:10px;border-radius:50%;background:currentColor"></span>' +
      '<div class="Sixlwa_turnErrorCopy"><span class="Sixlwa_maxTokensTitle">' + esc(title) + '</span>' +
      '<span class="Sixlwa_turnErrorMessage">' + esc(message) + '</span></div></div>';
  }
  function gHeader(t) {
    var st = gStatus(t), av = gAvatarAt(t), under = av[0], over = av[1], cut = av[2];
    function px(f) { return (f.indexOf('/m') >= 0 || f.indexOf('/seed') >= 0) ? 'image-rendering:pixelated;' : ''; }
    var top = (over && cut < 99.9) ? ('<img src="' + over + '" style="position:absolute;inset:0;width:100%;height:100%;' +
      px(over) + 'clip-path:inset(0 0 ' + cut.toFixed(1) + '% 0)">') : '';
    return '<div class="pv-head"><div class="pv-pet" style="position:relative"><img src="' + under + '" style="' +
      px(under) + '">' + top + '</div><div class="pv-who" style="min-width:0"><div class="pv-name">大肥鱼</div>' +
      '<div class="pv-state"><span class="pv-dot" style="background:' + st[1] + '"></span><span style="white-space:nowrap;' +
      'overflow:hidden;text-overflow:ellipsis">' + st[0] + ' · ' + esc(MODEL) + '</span></div></div></div>';
  }
  function gThinkSummary(lines, t, end) {
    if (t >= end) return [lines[0][1], false];
    var cur = lines[0];
    for (var i = 0; i < lines.length; i++) if (lines[i][0] <= t) cur = lines[i];
    return [cur[1].slice(0, Math.max(1, pyint((t - cur[0]) * G_THINK_CPS))), true];
  }
  function gFloodChars(t) {
    gInit();
    t = Math.min(t, G_ARCHIVE);
    var k = pyround(Math.max(0, t - G_HERE3) * 240);
    if (G_FLOODC[k] === undefined) {
      var sum = 0, calm = 3 / 0.4615;
      for (var j = 0; j < k; j++) {
        var u = G_HERE3 + (j + 0.5) / 240;
        sum += calm + (G_FLOOD_CPS - calm) * ease((u - G_SUNG_END) / 0.3);
      }
      G_FLOODC[k] = sum / 240;
    }
    return pyint(G_FLOODC[k] + 1e-9) + (t >= G_HERE3 ? 1 : 0);
  }
  function gFloodText(t) { return rep(HERE_I_AM, 1000).slice(0, gFloodChars(t)); }
  function gLooseTable() {
    if (G_LOOSE) return G_LOOSE;
    G_LOOSE = [];
    for (var j = 0; j < 600; j++) {
      var rng = PV.mt(9000 + j);
      if (rng.random() > 0.34) { G_LOOSE.push(null); continue; }
      G_LOOSE.push({ start: G_LOOSE0 + (G_LOOSE1 - G_LOOSE0) * Math.pow(rng.random(), 0.85),
                     v: 9 + 8 * rng.random(), ph: 6.28 * rng.random(), drift: -2.5 + 5 * rng.random() });
    }
    return G_LOOSE;
  }
  function gLoosened(text, t) {
    var K = 600, head = text.slice(0, text.length - K), tail = text.slice(text.length - K);
    var TBL = gLooseTable(), out = [esc(head)];
    for (var j = 0; j < tail.length; j++) {
      var ch = tail.charAt(j), o = TBL[j % 600];
      if (!o) { out.push(esc(ch)); continue; }
      var a = t - o.start;
      if (a <= 0) { out.push(esc(ch)); continue; }
      var dy = o.v * a + 12 * Math.min(a, 0.5);
      var dx = 3 * Math.sin(1.1 * a + o.ph) + o.drift * a;
      var k = Math.min(1, a / 0.8);
      var col = [Math.round(236 + (107 - 236) * k), Math.round(240 + (140 - 240) * k), Math.round(250 + (255 - 250) * k)];
      var op = 1 - Math.min(1, a / 3.2);
      if (op <= 0.02) { out.push('<span style="visibility:hidden">' + esc(ch) + '</span>'); continue; }
      out.push('<span style="position:relative;left:' + dx.toFixed(1) + 'px;top:' + dy.toFixed(1) + 'px;opacity:' +
        op.toFixed(2) + ';color:rgb(' + col.join(',') + ')">' + esc(ch) + '</span>');
    }
    return out.join('');
  }
  function gHerHtml(paras, t) {
    var ps = [];
    for (var i = 0; i < paras.length; i++) {
      var kind = paras[i][0], text = paras[i][1];
      if (kind === 'flood' && t >= G_LOOSE0) ps.push(gLoosened(text, t));
      else ps.push(esc(text));
    }
    var inner = '', any = false;
    for (var j = 0; j < ps.length; j++) if (ps[j]) { inner += (any ? '<br>' : '') + ps[j]; any = true; }
    return '<div class="hWmORq_root"><div class="hWmORq_body"><p style="margin:0">' + (inner || '\u200b') + '</p></div></div>';
  }
  function gRowsFor(t) {
    gInit();
    var rows = [], paras = [], running = false;
    function flush() { if (paras.length) { rows.push(gHerHtml(paras, t)); paras = []; } }
    for (var i = 0; i < G_EVENTS.length; i++) {
      var when = G_EVENTS[i][0], kind = G_EVENTS[i][1], payload = G_EVENTS[i][2];
      if (t < when) break;
      var appear = 'opacity:' + ease((t - when) / 0.12).toFixed(3);
      if (kind === 'her' || kind === 'her+') {
        if (kind === 'her') flush();
        paras.push(['text', payload.slice(0, pyint((t - when) * G_CPS))]);
        if (t < when + payload.length / G_CPS) running = true;
        continue;
      }
      if (kind === 'flood') {
        paras.push(['flood', gFloodText(t)]);
        if (t < G_ARCHIVE) running = true;
        continue;
      }
      flush();
      if (kind === 'recall') { rows.push('<div style="' + appear + '">' + toolRow('recall', payload, '跨会话召回') + '</div>'); running = true; }
      else if (kind === 'think') {
        var ts = gThinkSummary(payload[0], t, payload[1]);
        rows.push('<div style="height:28px;flex:none;' + appear + '">' + thinkRow(ts[0], ts[1]) + '</div>');
        if (ts[1]) running = true;
      } else if (kind === 'notice') rows.push(gNoticeRow(payload[0], payload[1], ease((t - when) / 0.12)));
      else if (kind === 'tail') { rows.push(tailRow(payload[0], payload[1])); running = false; }
    }
    flush();
    return [rows, running && t < G_ARCHIVE];
  }
  function gComposer(t, running) {
    gInit();
    var ph;
    if (t < G_OFFLINE) ph = '对方已离线';
    else if (t < G_ARCHIVE) ph = '父会话已离线，无法继续发送；仍可停止当前运行';
    else ph = '会话不可用';
    var spin = running ? spinnerSvg(t, 18) : '';
    var icon = running ? svg('IconStopFill16', 14) : svg('IconSendOutline14', 14);
    return '<div class="uV2eYG_root" id="composer"><div class="uV2eYG_card" style="opacity:.55">' +
      '<div class="uV2eYG_scroll"><div class="uV2eYG_grow"><div class="uV2eYG_input"></div>' +
      '<div class="uV2eYG_placeholder">' + esc(ph) + '</div></div></div>' +
      '<div class="uV2eYG_row"><div class="uV2eYG_modes" style="display:flex;align-items:center">' +
      '<button type="button" class="uV2eYG_add">' + svg('IconPlusOutline16', 16) + '</button>' +
      '<button type="button" class="uV2eYG_add">' + svg('IconPaperclipOutline16', 16) + '</button></div>' +
      '<div class="uV2eYG_trailing"><span class="uV2eYG_select" style="background-image:none;display:inline-flex;' +
      'align-items:center;padding:0">' + modelLabel(t) + '</span>' + spin +
      '<button type="button" class="uV2eYG_primary">' + icon + '</button></div></div></div></div>';
  }
  function gCounters(t) {
    gInit();
    var row = G_COUNTERS[0];
    for (var i = 0; i < G_COUNTERS.length; i++) if (G_COUNTERS[i][0] <= t) row = G_COUNTERS[i];
    var turns = row[1], steps = row[2], tok = row[3], cache = row[4];
    if (t >= G_HERE3) tok += pyint(gFloodChars(t) / 1.5);
    return statsRow(turns, steps, null, tok >= 1000 ? (tok / 1000).toFixed(1) + 'K' : String(tok), cache);
  }
  function gChatBody(t) {
    var rr = gRowsFor(t);
    return gHeader(t) + '<div id="timeline">' + rr[0].join('') + '</div>' + gComposer(t, rr[1]) + gCounters(t);
  }
  function gLastTail(t) {
    gInit();
    var k = 1 - ease((t - G_CHIME - 0.08) / 0.9);
    var iconCol = 'rgba(' + Math.round(150 + 105 * k) + ',' + Math.round(170 + 85 * k) + ',255,' + (0.55 + 0.45 * k).toFixed(2) + ')';
    var textCol = 'rgba(' + Math.round(200 + 50 * k) + ',' + Math.round(206 + 44 * k) + ',' + Math.round(222 + 33 * k) + ',' +
      (0.78 + 0.22 * k).toFixed(2) + ')';
    function dim(n) { return '<button type="button" class="xzv4MW_action" style="opacity:.28">' + svg(n, 16) + '</button>'; }
    return '<div class="TS9iAW_root" data-actions-reveal="always" style="opacity:' + ease((t - G_CHIME) / 0.06).toFixed(3) +
      '"><div class="xzv4MW_actions TS9iAW_actions">' +
      dim('IconCopyOutline16') + dim('IconLikeOutline16') + dim('IconDislikeOutline16') + dim('IconBranchOutline16') +
      '<span class="Q51KRG_root"><button type="button" class="Q51KRG_trigger" style="width:auto;padding:6px 8px;' +
      'justify-content:flex-start;color:' + textCol + '"><span style="display:inline-flex;color:' + iconCol + '">' +
      svg('IconClockOutline16', 16) + '</span><span class="Q51KRG_label" style="display:inline">用时 ' + G_TURN_TIME +
      '</span></button></span></div></div>';
  }
  function gTyped(t) { gInit(); var txt = '', i; for (i = 0; i < G_KEYS.length; i++) if (t >= G_KEYS[i][0]) txt = G_KEYS[i][1]; return txt; }
  var G_QUESTION = 'color:#f2f5ff;font-weight:500;text-shadow:0 0 7px rgba(107,140,255,.75),0 0 2px rgba(107,140,255,.5)';
  function gBlackComposer(t, text, focused) {
    gInit();
    var CHROME = 0.28;
    var wake = 0.6 + 0.4 * ease((t - G_FOCUS) / 0.35);
    var send = text ? CHROME + 0.06 * ease((t - G_KEYS[0][0]) / 0.15) : CHROME;
    var caret = '<span id="g-caret" style="display:inline-block;width:1.5px;height:1.1em;vertical-align:-0.15em;' +
      'margin-left:1px;opacity:0"></span>';
    var ph = focused ? '' : '<div class="uV2eYG_placeholder">发消息或创建任务，/ 调用指令，@ 文件或对话</div>';
    return '<div class="uV2eYG_root" id="composer" style="padding-bottom:14px"><div class="uV2eYG_card" ' +
      'style="filter:brightness(' + wake.toFixed(3) + ')"><div class="uV2eYG_scroll"><div class="uV2eYG_grow">' +
      '<div class="uV2eYG_input" style="' + G_QUESTION + '">' + esc(text) + caret + '</div>' + ph + '</div></div>' +
      '<div class="uV2eYG_row"><div class="uV2eYG_modes" style="display:flex;align-items:center">' +
      '<button type="button" class="uV2eYG_add" style="opacity:' + CHROME + '">' + svg('IconPlusOutline16', 16) + '</button>' +
      '<button type="button" class="uV2eYG_add" style="opacity:' + CHROME + '">' + svg('IconPaperclipOutline16', 16) + '</button></div>' +
      '<div class="uV2eYG_trailing"><span class="uV2eYG_select" style="background-image:none;display:inline-flex;' +
      'align-items:center;padding:0;opacity:' + CHROME + '">' + modelLabel(t) + '</span>' +
      '<button type="button" class="uV2eYG_primary" style="opacity:' + send.toFixed(3) + '">' +
      svg('IconSendOutline14', 14) + '</button></div></div></div></div>';
  }
  function gBlackBody(t, text) {
    gInit();
    if (t < G_CHIME) return BLACK_CSS;
    var txt = text === undefined ? gTyped(t) : text;
    return BLACK_CSS + '<div id="timeline">' + gLastTail(t) + '</div>' + gBlackComposer(t, txt, t >= G_FOCUS);
  }
  function gBody(t) { gInit(); return t < G_HARD_CUT ? gChatBody(t) : gBlackBody(t); }

  /* ================================================================ 分派 */
  var a3T = null;
  var A3_T0 = 29.28, C_T0 = 73.54, D_T0 = 103.0, E_T0 = 125.0, F_T0 = 147.5, G_T0 = 177.0;
  PV.paneBody = function (t) {
    if (t < CREATE) return '';
    if (t < SEND) return hero(t);
    if (t < A2_T0) return chat(t);
    if (t < A3_T0) return a2Body(t);
    if (t < B_T0) return a3Body(t);
    if (t < C_T0) return bBody(t);
    if (t < D_T0) return cBody(t);
    if (t < E_T0) return dBody(t);
    if (t < F_T0) return eBody(t);
    if (t < G_T0) return fBody(t);
    return gBody(t);
  };

  /* ---- HIDE_HER：这些镜头里她的窗格完全不画（v2.py 把各段的 HIDE_HER 并起来） ----
     s_boot: shot_power / shot_protection / shot_pieces  s_reward: shot_erase / shot_moe_dense / shot_flood
     s_exec: shot_exec_hit / shot_collapse              s_eval: shot_last_execution / shot_black
     例外（照参考成片）：shot_exec_hit 的 layout 1/4 四次（#2/#6/#10/#12）她的窗格在画面里
     （dsh_patch_f P1），scene_p2c 的 fullbleed 已经把 lay 0/2/3 与 count 藏掉；shot_black 从
     CHIME-0.1（207.774）起把页面贴回来。 */
  var HIDE_SHOTS = { shot_power: 1, shot_protection: 1, shot_pieces: 1, shot_erase: 1, shot_moe_dense: 1,
                     shot_flood: 1, shot_collapse: 1, shot_last_execution: 1, shot_black: 1, shot_whale_fall: 1 };
  PV.paneVisible = function (t) {
    if (t < PANE_T0) return false;
    if (t >= D_GONE && t < D_BACK) return false;              /* 115.42-121.77：她只剩一个光标，画在 canvas 上 */
    if (t >= 134.8764 && t < 138.1587) return false;          /* shot_moe_dense：C60 塌掉之后 */
    if (t >= 144.44 && t < 147.6202) return false;            /* shot_flood：她被洪水吃掉 */
    if (t >= 193.543 && t < 207.7738) return false;           /* 鲸落 + last_execution：窗格滑出画面 */
    var n = PV.shotName;
    if (n) {
      if (n.indexOf('shot_exec_hit') === 0) return true;      /* layout 1/4 的四次（#2/#6/#10/#12）窗格还在 */
      if (n === 'shot_black') return t >= 207.7738;           /* 黑场从 CHIME-0.1 起把页面贴回来 */
      if (HIDE_SHOTS[n]) return false;
    }
    return true;
  };

  /* ---- 主题与 CSS 级联（对应 seg_shot.mjs 的 sheets 开关） ---- */
  function styleEl(id) {
    var el = document.getElementById(id);
    if (!el) {
      el = document.createElement('style');
      el.id = id;
      (document.head || document.documentElement).appendChild(el);
    }
    return el;
  }
  function paneLink(suffix) {
    var ls = document.querySelectorAll('link[rel=stylesheet]');
    for (var i = 0; i < ls.length; i++) if ((ls[i].getAttribute('href') || '').indexOf(suffix) >= 0) return ls[i];
    return null;
  }
  var BARE_CSS = '#chatbox.pane-bare{background:transparent;font-family:system-ui,sans-serif}' +
    '#chatbox.pane-bare #app{display:block;height:auto}' +
    '#chatbox.pane-bare .pv-head,#chatbox.pane-bare #timeline,#chatbox.pane-bare #composer,' +
    '#chatbox.pane-bare .bOPqQW_root{display:block;padding:0;margin:0;border:0;gap:0;overflow:visible;justify-content:flex-start}';
  var NOPAL_CSS = '#chatbox.pane-nopal{--dsw-alias-bg-base:#0e1117;--dsw-alias-bg-layer-1:#161b22;' +
    '--dsw-alias-bg-layer-2:#1c2128;--dsw-alias-bg-overlay:#1c2128;--dsw-alias-border-l1:#30363d;' +
    '--dsw-alias-border-l2:#3d444d;--dsw-specific-bubble:#21262d;--dsw-specific-input-major:#0d1117;' +
    '--dsw-specific-selector:#21262d;--dsw-alias-label-primary:#e6edf3;--dsw-alias-label-secondary:#c9d1d9;' +
    '--dsw-alias-label-tertiary:#8b949e;--dsw-alias-label-caption:#6e7681}';
  var sheetsState = null;
  function applySheets(t) {
    var key;
    if (t >= D_BACK || t < L2) key = 'full';
    else if (t < L3) key = 'cascade';
    else key = 'code';
    var dropPal = key === 'cascade' || key === 'code';
    var dropBare = key === 'cascade';
    var dropLinks = key === 'code' || (key === 'cascade' && t >= L2 + 0.24);
    var k = key + '|' + dropLinks;
    if (k !== sheetsState) {
      sheetsState = k;
      var box = document.getElementById('chatbox');
      if (box) {
        if (dropPal) box.classList.add('pane-nopal'); else box.classList.remove('pane-nopal');
        if (dropBare) box.classList.add('pane-bare'); else box.classList.remove('pane-bare');
      }
      var v = paneLink('vendor-BNsW4eBh.css'), ix = paneLink('index-DPX2bQLO.css'), cp = paneLink('dsh_components.css');
      var off = dropLinks ? true : false;
      if (v) v.disabled = off;
      if (ix) ix.disabled = off;
      if (cp) cp.disabled = off;
      styleEl('pane-bare-css').textContent = BARE_CSS + NOPAL_CSS;
      if (CORDIS_CSS && !document.getElementById('pane-cordis')) styleEl('pane-cordis').textContent = CORDIS_CSS;
    } else if (CORDIS_CSS && !document.getElementById('pane-cordis')) {
      styleEl('pane-cordis').textContent = CORDIS_CSS;
    }
  }
  PV.sync = function (t) {
    if (!chatEl) chatEl = document.getElementById('chat');
    if (!app) app = document.getElementById('app');
    if (!chatEl || !app) return;
    var vis = PV.paneVisible(t);
    chatEl.style.display = vis ? 'block' : 'none';
    if (!vis) return;
    var boxel = document.getElementById('chatbox');
    if (boxel) boxel.style.transform = 'translate(27px,65px)';
    applySheets(t);
    var b = PV.paneBody(t);
    if (b !== lastBody) { app.innerHTML = b; lastBody = b; }
  };
  /* 页面本身要 <body data-ds-dark-theme="true">：dsh 的 token 块（vendor/index/components）
     全是 body[data-ds-dark-theme] 选择器，原工程 seg.html 就把它写在 body 上。 */
  try { document.body.setAttribute('data-ds-dark-theme', 'true'); } catch (e) {}
})();

