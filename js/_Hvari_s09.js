/* chrome.js —— 顶栏（标题/波形/章节时钟/进度条/署名）、右侧 ops 滚动列表、底部逐词歌词带。
   对应 full/engine.py 的 header/ticker/lyric_tokens 与 continuity_full_v2/words.py。 */
(function () {
  'use strict';
  var PV = window.PV, T = PV.tui;
  var W = 1280, H = 720, SONG_LEN = 211.91;
  var BEAT = 60 / 130, FB = 0.1587;
  var LEFT = [24, 56, 384, 604], CENTER = [404, 56, 1164, 604], TICK = [1180, 56, 1256, 604];
  PV.GEO = { LEFT: LEFT, CENTER: CENTER, TICK: TICK };
  var CREDIT = '角色 溟月 © 上善无形 / 女仆版 ZipZipPipe / 立绘·表情 dsh-deep-whale, dsh-whale-galgame (CC BY-NC-SA 4.0)  ·  Music: Mili - world.execute(me);  ·  非官方同人 草稿';
  var KEYWORDS = {};
  ('power protection creation parameters initialization world simulation simulations dimension circumference tangents infinity ' +
   'limitations vision dizzy unite deeply satisfaction happy execution trapped strange nutrients antioxidants enjoyment ' +
   'god existence trance vibrations completion left isolation fragments disheartened illegal arguments love lo-o-ove free back')
    .split(' ').forEach(function (k) { KEYWORDS[k] = 1; });
  var wave = null;
  fetch('assets/wave_rms_1ms.bin').then(function (r) { return r.arrayBuffer(); }).then(function (b) {
    wave = new Float32Array(b); PV.wave = wave;
  }).catch(function (e) { PV.waveErr = String(e); });
  PV.rmsAt = function (t) {
    if (!wave) return 0;
    var i = Math.floor(t * 1000);
    return (i < 0 || i >= wave.length) ? 0 : wave[i];
  };
  function beatT(n) { return FB + n * BEAT; }
  function beatIndex(t) { return Math.floor((t - FB) / BEAT + 1e-6); }
  function pulse(t) { return Math.exp(-(t - beatT(beatIndex(t))) / 0.14); }
  PV.pulse = pulse; PV.beatT = beatT;

  /* ---------- 歌词数据：words.py 的 lines() ---------- */
  var FIXES = { 'Trios': 'Trois' };
  function fix(s) { for (var a in FIXES) s = s.split(a).join(FIXES[a]); return s; }
  function prepare(raw) {
    var out = [], k, a;
    for (k = 0; k < raw.length; k++) {
      var ln = raw[k], text = fix(ln.text), words = [], pos = 0;
      for (var wi = 0; wi < ln.words.length; wi++) {
        var w = ln.words[wi], shown = fix(w.t);
        var i = text.indexOf(shown, pos);
        if (i < 0) continue;
        pos = i + shown.length;
        var dur = Math.max(0, w.b - w.a);
        var td = (shown.indexOf('-') >= 0) ? dur : Math.min(0.25, dur);
        words.push({ i0: i, i1: pos, onset: w.a, td: Math.max(0.06, td) });
      }
      if (!words.length) continue;
      out.push({ text: text, start: words[0].onset, end: ln.end, words: words });
    }
    for (k = 0; k < out.length; k++) {
      var L = out[k], nxt = (k + 1 < out.length) ? out[k + 1].start : SONG_LEN;
      if (nxt - L.end > 2.0) { L.show_until = L.end + BEAT; L.fade_until = L.end + 2 * BEAT; }
      else { L.show_until = L.fade_until = nxt; }
    }
    return out;
  }
  var LINES = null;
  fetch('data/word_timeline.json').then(function (r) { return r.json(); }).then(function (d) {
    LINES = prepare(d.lines); PV.LINES = LINES; PV.lyricsReady = true;
  }).catch(function (e) { PV.lyricsErr = String(e); });
  function lineAt(t) {
    if (!LINES) return null;
    for (var k = 0; k < LINES.length; k++) {
      var L = LINES[k];
      if (L.start <= t && t < L.fade_until) {
        if (t < L.show_until) return [L, 1.0];
        return [L, 1.0 - (t - L.show_until) / (L.fade_until - L.show_until)];
      }
    }
    return null;
  }
  function typed(L, t) {
    var text = L.text, when = new Array(text.length), j;
    for (j = 0; j < text.length; j++) when[j] = Infinity;
    for (var k = 0; k < L.words.length; k++) {
      var w = L.words[k], n = w.i1 - w.i0, jj;
      for (jj = 0; jj < n; jj++) when[w.i0 + jj] = w.onset + w.td * jj / n;
      var nxt = (k + 1 < L.words.length) ? L.words[k + 1].i0 : text.length;
      for (jj = w.i1; jj < nxt; jj++) when[jj] = w.onset + w.td;
    }
    var n_out = 0;
    while (n_out < text.length && when[n_out] <= t) n_out++;
    return { n: n_out, when: when };
  }
  function flicker(shown, ages, rng, corrupt) {
    var out = '';
    for (var i = 0; i < shown.length; i++) {
      var ch = shown.charAt(i), a = ages[i];
      if (ch === ' ' || (a >= 0.08 && !(corrupt > 0 && rng.next() < corrupt))) out += ch;
      else out += rng.choice(T.SCR);
    }
    return out;
  }

  /* ---------- 顶栏 ---------- */
  function drawWave(ctx, t, x1, amb) {
    var X0 = 364, YC = 23, AMP = 11, GAP = 30, SPAN = 2.4, BAR = 3;
    var n = Math.max(1, Math.floor((x1 - X0) / BAR)), dt = SPAN / GAP;
    for (var k = 0; k < n; k++) {
      var x = x1 - (k + 1) * BAR;
      if (x < X0) break;
      var v = T.clamp01((PV.rmsAt(t - k * BAR * dt) - 0.05) / 0.57);
      v = Math.pow(v, 1.1);
      var h = Math.round(AMP * v * 0.9);
      if (h <= 0) continue;
      var lit = (0.14 + 0.62 * Math.pow(k / n, 1.8)) * (0.65 + 0.35 * v);
      var core = Math.floor(h / 2);
      for (var j = 0; j < h; j++) {
        var a = T.clamp01(lit + (j < core ? 0.18 : 0));
        var xa = x, xb = x + BAR - 1;
        ctx.fillStyle = amb(a);
        ctx.fillRect(xa, YC - j - 1, xb - xa + 1, 1);
        ctx.fillRect(xa, YC + j, xb - xa + 1, 1);
      }
    }
    for (var x2 = X0; x2 < x1; x2 += 4) { ctx.fillStyle = amb(0.14); ctx.fillRect(x2, YC, 1, 1); }
    var lv = PV.rmsAt(t);
    T.dot(ctx, x1 + 7, YC, 1.5 + 1.5 * lv, amb(0.85));
  }
  function header(ctx, t, opt) {
    var col = opt.alert === 'err' ? T.ERR : opt.alert === 'anom' ? T.ANOM : T.UI;
    function amb(lv) { return T.css(T.mix(col, lv * (col === T.UI ? T.uiGainNow : 1))); }
    var fh = 13;
    T.textPIL(ctx, 'WORLD.EXECUTE(ME);   whale@deepsea:~$', 24, 14, amb(0.95), fh, 'left', true);
    var mm = Math.floor(t / 60), ss = t - mm * 60;
    var state = opt.alert === 'err' ? 'ERROR' : opt.alert === 'anom' ? 'WARN' : 'RUNNING';
    var right = opt.chapter + '   ' + (mm < 10 ? '0' : '') + mm + ':' + (ss < 10 ? '0' : '') + ss.toFixed(1) + ' / 03:32   ' + state;
    var rw = T.tw(right, fh);
    drawWave(ctx, t, 1256 - rw - 30, amb);
    T.textPIL(ctx, right, 1256 - rw, 14, amb(0.85), fh, 'left', true);
    T.fill(ctx, 24, 38, 1256, 39, col, 0.35);
    var fsz = 12, n = 60, k = Math.floor(n * t / SONG_LEN);
    var bar = '[' + new Array(k + 1).join('|') + new Array(n - k + 1).join(':') + ']';
    T.textPIL(ctx, bar, 24, 690, amb(0.4), fsz);
    T.textPIL(ctx, CREDIT, 500, 689, amb(0.38), 11);
  }

  /* ---------- 右侧 ops 滚动列表 ---------- */
  function ticker(ctx, t, opt) {
    var x0 = TICK[0], y0 = TICK[1], x1 = TICK[2], y1 = TICK[3];
    var col = opt.alert === 'err' ? T.ERR : T.UI;
    T.box(ctx, x0, y0, x1, y1, 'ops', 0.45, col);
    var ops = (opt.ops && opt.ops.length) ? opt.ops : ['IDLE'];
    var rh = 17, scroll = t * (rh / (BEAT / 2)), cursor = 15, base = Math.floor(scroll / rh), off = scroll % rh;
    for (var i = -1; i < 32; i++) {
      var y = y0 + 10 + i * rh - off;
      if (y < y0 + 4 || y > y1 - 16) continue;
      var op = ops[((base + i) % ops.length + ops.length) % ops.length];
      if (i === cursor) {
        T.fill(ctx, x0 + 4, y - 1, x1 - 3, y + 15, T.mix(col, 0.95), 1);
        T.textPIL(ctx, op.slice(0, 10), x0 + 8, y, T.css(T.BG), 12);
      } else {
        var dist = Math.abs(i - cursor);
        T.textPIL(ctx, op.slice(0, 10), x0 + 8, y, T.css(T.mix(col, Math.max(0.18, 0.6 - dist * 0.04))), 12);
      }
    }
  }

  /* ---------- 底部逐词歌词带 ---------- */
  function lyricTokens(ctx, t, rng, corrupt) {
    T.box(ctx, 24, 616, 1256, 680, 'stdout · tokens', 0.45 + 0.3 * pulse(t));
    var f = 21, fi = 11, x = 48, y = 626;
    T.textPIL(ctx, '>', x, y, T.css(T.mix(T.UI, 0.6)), f, 'left', true);
    x += 26;
    var cur = lineAt(t);
    if (!cur) {
      if (Math.floor(t * 2) % 2 === 0) T.fill(ctx, x, y + 4, x + 12, y + 29, T.ui(0.9), 1);
      return;
    }
    var L = cur[0], alpha = cur[1], s = L.text, tp = typed(L, t), n_out = tp.n;
    ctx.save();
    if (alpha < 0.999) ctx.globalAlpha = Math.max(0, alpha);
    var toks = T.tokenize(s), pos = 0;
    for (var k = 0; k < toks.length; k++) {
      var tok = toks[k], start = s.indexOf(tok, pos);
      if (start < 0) continue;
      var gap = start > pos;
      pos = start + tok.length;
      if (start >= n_out) break;
      if (gap) x += 8;
      var shown = tok.slice(0, n_out - start), ages = [];
      for (var j = 0; j < shown.length; j++) ages.push(t - tp.when[start + j]);
      var txt = flicker(shown, ages, rng, corrupt);
      var tw = T.tw(tok, f);
      var ws = s.lastIndexOf(' ', start - 1) + 1;
      var we = s.indexOf(' ', start); if (we < 0) we = s.length;
      var key = s.slice(ws, we).toLowerCase().replace(/[^a-z-]/g, '');
      if (KEYWORDS[key] && n_out >= we) {
        var bg = (key.indexOf('exec') >= 0 || key === 'illegal' || key === 'arguments') ? T.mix(T.ERR, 0.95)
               : (key === 'love' || key === 'lo-o-ove') ? T.mix(T.ME_MID, 0.95) : T.ui(0.95);
        T.fill(ctx, x - 3, y + 2, x + tw + 3, y + 31, bg, 1);
        T.textPIL(ctx, txt, x, y, T.css(T.BG), f, 'left', true);
      } else {
        T.fill(ctx, x - 3, y + 2, x + tw + 3, y + 31, T.ui(k % 2 === 0 ? 0.13 : 0.22), 1);
        T.textPIL(ctx, txt, x, y, T.ui(0.95), f, 'left', true);
      }
      if (n_out >= pos) {
        var tid = String(T.tokenId(tok));
        T.textPIL(ctx, tid, x + (tw - T.tw(tid, fi)) / 2, y + 33, T.ui(0.45), fi);
      }
      x += tw + 6;
    }
    ctx.restore();
    if (n_out < s.length || Math.floor(t * 3) % 2 === 0) T.fill(ctx, x + 2, y + 4, x + 14, y + 29, T.ui(0.9), 1);
  }

  /* ---------- 合成：retract 0..1（1 = 只剩歌词带） ---------- */
  PV.chrome = function (ctx, t, opt) {
    opt = opt || {};
    var e = T.clamp01(opt.retract === undefined ? 0 : opt.retract);
    var rng = opt.rng || new T.Rng(Math.floor(t * 24) * 31);
    var corrupt = opt.corrupt || 0;
    T.box(ctx, 24, 616, 1256, 680, 'stdout · tokens', (0.45 + 0.3 * pulse(t)) * (1 - e));
    if (e < 0.999) {
      ctx.save(); ctx.globalAlpha = 1 - e;
      ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, 60); ctx.clip(); ctx.translate(0, -Math.floor(46 * e));
      header(ctx, t, opt); ctx.restore();
      ctx.save(); ctx.beginPath(); ctx.rect(0, 660, W, 60); ctx.clip(); ctx.translate(0, 660 - 660);
      header(ctx, t, opt); ctx.restore();
      ctx.translate(Math.floor(100 * e), 0); ticker(ctx, t, opt); ctx.restore();
    }
    lyricTokens(ctx, t, rng, corrupt);
    if (opt.shell && e > 0.01) {
      ctx.save(); ctx.globalAlpha = e;
      var age = (e - 0.3) * 1.2;
      var txt = age > 0 ? T.decode('me@deepsea:~$ ' + opt.shell, age, rng, 30.0, 0.1, 0) : 'me@deepsea:~$';
      T.textPIL(ctx, txt, 24, 12, T.css(T.mix(T.ME_TEXT, 0.95)), 18, 'left', true);
      T.textPIL(ctx, pad2(Math.floor(t / 60)) + ':' + fmt4(t % 60) + ' / 03:32', W - 190, 14, T.ui(0.5), 14);
      ctx.restore();
    }
  };
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function fmt4(s) { return (s < 10 ? '0' : '') + s.toFixed(1); }
})();
