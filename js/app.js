/* pv-live — world.execute(me); 浏览器实时版
   一切绘制都是画面时间 t（秒）的纯函数。24 fps / 1280x720。 */
(function () {
  'use strict';
  var W = 1280, H = 720, FPS = 24;
  var wrapEl = document.getElementById('wrap');
  var screenEl = document.getElementById('screen');
  var canvas = document.getElementById('stage');
  var ctx = canvas.getContext('2d', { alpha: false });
  var chatEl = document.getElementById('chat');
  var tcEl = document.getElementById('tc');
  var msgEl = document.getElementById('msg');
  var audioEl = document.getElementById('song');
  var fileEl = document.getElementById('file');
  var playEl = document.getElementById('play');
  var barEl = document.getElementById('bar');
  var fsEl = document.getElementById('fs');
  var seekEl = document.getElementById('seek');
  var seekDragging = false;
  var offEl = document.getElementById('off');
  var RES = parseFloat(new URLSearchParams(location.search).get('res') || '') || 1.5;
  canvas.width = Math.round(W * RES); canvas.height = Math.round(H * RES);
  var ROT = (new URLSearchParams(location.search).get('rot') || '1') !== '0';
  var PV = window.PV = {
    ROT: ROT,
    RES: RES,
    W: W, H: H, FPS: FPS, t: 0, frame: 0, playing: false, offset: 0,
    scale: 1, audioReady: false, hold: false, layers: [], bootQueue: []
  };
  PV.audio = audioEl; PV.chat = chatEl; PV.screen = screenEl;
  PV.VER = '202610022329';
  PV.loadImage = function (path, cb) {
    var im = new Image();
    im.onload = function () { cb(im); };
    im.src = path;
  };
  PV.newCanvas = function (w, h) { var c = document.createElement('canvas'); c.width = Math.max(1, w | 0); c.height = Math.max(1, h | 0); return c; };
  PV.onWorld = function (fn) { PV.layers.push(fn); };
  PV.onBoot = function (fn) { PV.bootQueue.push(fn); };
  function layout() {
    var vw = window.innerWidth, vh = window.innerHeight;
    var barH = barEl ? (barEl.offsetHeight || 56) : 56;
    var availH = Math.max(120, vh - barH);
    var portrait = PV.ROT && availH > vw * 1.05;
    var s = portrait ? Math.min(availH / W, vw / H) : Math.min(vw / W, availH / H);
    PV.scale = s;
    PV.portrait = portrait;
    wrapEl.style.bottom = barH + 'px';
    screenEl.style.transform = 'translate(-50%,-50%) ' + (portrait ? 'rotate(90deg) ' : '') + 'scale(' + s + ')';
    if (PV.debugEl) {
      PV.debugEl.textContent = 'v' + PV.VER + '\ninner ' + vw + ' x ' + vh + '\nbarH ' + barH +
        '\navail ' + vw + ' x ' + availH + '\nportrait ' + portrait + '\nscale ' + s.toFixed(3) +
        '\nstage ' + Math.round(W * s) + ' x ' + Math.round(H * s) +
        '\ndpr ' + (window.devicePixelRatio || 1) + '\nua ' + navigator.userAgent.slice(0, 60);
    }
    if (document.getElementById('ver')) {
      document.getElementById('ver').textContent = 'v' + PV.VER + (portrait ? ' 竖屏' : ' 横屏') + ' ' + Math.round(s * 100) + '%';
    }
  }
  window.addEventListener('resize', layout);
  function draw(t) {
    PV.t = t; PV.frame = Math.round(t * FPS);
    ctx.setTransform(PV.RES, 0, 0, PV.RES, 0, 0);
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    for (var i = 0; i < PV.layers.length; i++) {
      ctx.save();
      try { PV.layers[i](ctx, t, PV.frame); } catch (e) { PV.err = e; }
      ctx.restore();
    }
  }
  PV.draw = draw;
  function fmt(t) {
    if (!isFinite(t)) t = 0;
    var neg = t < 0; if (neg) t = -t;
    var m = Math.floor(t / 60), s = t - m * 60;
    return (neg ? '-' : '') + (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s.toFixed(3);
  }
  PV.fmt = fmt;
  var lastTs = 0, clock = 0;
  function pictureTime() {
    if (PV.audioReady && !audioEl.paused && !audioEl.ended) return audioEl.currentTime - PV.offset;
    return clock - PV.offset;
  }
  PV.pictureTime = pictureTime;
  function loop(ts) {
    var dt = lastTs ? Math.min(0.2, (ts - lastTs) / 1000) : 0;
    lastTs = ts;
    var usingAudio = PV.audioReady && !audioEl.paused && !audioEl.ended;
    if (!usingAudio && !paused) {
      clock += dt;
      var le = PV.loopEnd || 16.1;
      if (clock >= le) clock = 0;
    }
    var t = pictureTime(); if (t < 0) t = 0;
    var tq = PV.hold ? PV.t : Math.floor(t * FPS) / FPS;
    draw(tq);
    if (PV.sync) PV.sync(tq);
    if (seekEl && !seekDragging) { var dd = (PV.audioReady && isFinite(audioEl.duration) && audioEl.duration > 1) ? audioEl.duration : (PV.loopEnd || 211.9); seekEl.value = String(Math.round(1000 * Math.min(1, tq / dd))); }
    tcEl.textContent = fmt(tq) + '  f' + PV.frame + (PV.shotName ? '  ' + PV.shotName : '') + (PV.audioReady ? '' : '  loop 0-' + (PV.loopEnd || 16.1).toFixed(1) + 's');
    requestAnimationFrame(loop);
  }
  var paused = false;
  PV.isPaused = function () { return paused; };
  PV.setPaused = function (v) {
    paused = !!v;
    if (PV.audioReady) {
      if (paused) { try { audioEl.pause(); } catch (e) {} }
      else { var pr = audioEl.play(); if (pr && pr.catch) pr.catch(function () {}); }
    }
    playEl.textContent = paused ? '\u25b6' : '\u23f8';
    PV.hold = false;
    showBar();
  };
  playEl.onclick = function () { PV.setPaused(!paused); };
  fileEl.onchange = function () {
    var f = fileEl.files && fileEl.files[0];
    if (!f) return;
    audioEl.src = URL.createObjectURL(f);
    audioEl.load();
    PV.audioReady = true;
    msgEl.textContent = f.name + ' (' + (f.size / 1048576).toFixed(1) + ' MB)';
    audioEl.play(); playEl.textContent = 'pause';
  };
  function startAudio() {
    if (PV.started) return;
    PV.started = true;
    clock = 0;
    if (PV.audioReady) {
      try { audioEl.currentTime = 0; } catch (e) {}
      var pr = audioEl.play();
      if (pr && pr.catch) pr.catch(function () {});
      PV.setPaused(false);
    }
    document.removeEventListener('pointerdown', startAudio, true);
    document.removeEventListener('keydown', startAudio, true);
  }
  document.addEventListener('pointerdown', startAudio, true);
  document.addEventListener('keydown', startAudio, true);
  var hideTimer = null;
  function showBar(autoHide) {
    if (!barEl) return;
    barEl.classList.remove('hide');
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = setTimeout(function () { barEl.classList.add('hide'); }, 15000);
  }
  if (seekEl) {
    seekEl.addEventListener('pointerdown', function () { seekDragging = true; showBar(); });
    seekEl.addEventListener('pointerup', function () { seekDragging = false; showBar(); });
    seekEl.addEventListener('input', function () {
      var dur = (PV.audioReady && isFinite(audioEl.duration) && audioEl.duration > 1) ? audioEl.duration : (PV.loopEnd || 211.9);
      var target = (seekEl.value / 1000) * dur;
      if (PV.audioReady) { try { audioEl.currentTime = target; } catch (e) {} }
      else { clock = target; }
      showBar();
    });
  }
  document.addEventListener('pointerdown', function (e) {
    if (barEl && barEl.contains(e.target)) { showBar(); return; }
    if (barEl && barEl.classList.contains('hide')) showBar();
    else if (barEl) { barEl.classList.add('hide'); if (hideTimer) clearTimeout(hideTimer); }
  }, true);
  showBar();

  if (fsEl) fsEl.onclick = function () {
    var el = document.documentElement;
    if (!document.fullscreenElement) {
      if (el.requestFullscreen) el.requestFullscreen();
      if (screen.orientation && screen.orientation.lock) { try { screen.orientation.lock('landscape').catch(function () {}); } catch (e) {} }
    } else if (document.exitFullscreen) document.exitFullscreen();
    setTimeout(layout, 400);
  };
  document.addEventListener('fullscreenchange', function () { setTimeout(layout, 200); });
  document.addEventListener('orientationchange', function () { setTimeout(layout, 300); });
  offEl.onchange = function () { PV.offset = parseFloat(offEl.value) || 0; };
  PV.attachSong = function (src, off) {
    if (!src) return;
    audioEl.src = src;
    audioEl.load();
    PV.audioReady = true;
    PV.offset = off || 0;
    offEl.value = String(PV.offset);
    msgEl.textContent = src + (PV.offset ? '  offset ' + PV.offset + 's' : '');
  };
  if (audioEl.getAttribute('src')) PV.attachSong(audioEl.getAttribute('src'), 0);
  if (document.getElementById('ver')) document.getElementById('ver').textContent = 'v' + PV.VER + (PV.portrait ? ' 竖屏' : ' 横屏');
  layout();
  requestAnimationFrame(loop);
  var q = new URLSearchParams(location.search);
  function boot() {
    for (var i = 0; i < PV.bootQueue.length; i++) PV.bootQueue[i]();
    PV.readyFlag = true;
    if (q.has('t')) {
      PV.hold = true;
      var tt = parseFloat(q.get('t'));
      var tq = Math.floor(tt * FPS) / FPS;
      draw(tq); if (PV.sync) PV.sync(tq);
      if (seekEl && !seekDragging) { var dd = (PV.audioReady && isFinite(audioEl.duration) && audioEl.duration > 1) ? audioEl.duration : (PV.loopEnd || 211.9); seekEl.value = String(Math.round(1000 * Math.min(1, tq / dd))); }
    tcEl.textContent = fmt(tq) + '  f' + PV.frame + (PV.shotName ? '  ' + PV.shotName : '') + (PV.audioReady ? '' : '  loop 0-' + (PV.loopEnd || 16.1).toFixed(1) + 's');
      if (q.has('shot')) {
        canvas.toBlob(function (b) {
          fetch('/save?name=' + encodeURIComponent(q.get('name') || ('t' + tt)), { method: 'POST', body: b })
            .then(function () { document.title = 'shot-done'; });
        }, 'image/png');
      }
    }
  }
  if (document.readyState === 'complete') setTimeout(boot, 0);
  else window.addEventListener('load', function () { setTimeout(boot, 0); });
  PV.boot = boot;
})();
