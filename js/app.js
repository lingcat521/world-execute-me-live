/* pv-live — world.execute(me); 浏览器实时版
   一切绘制都是画面时间 t（秒）的纯函数。24 fps / 1280x720。 */
(function () {
  'use strict';
  var W = 1280, H = 720, FPS = 24;
  var screenEl = document.getElementById('screen');
  var canvas = document.getElementById('stage');
  var ctx = canvas.getContext('2d', { alpha: false });
  var chatEl = document.getElementById('chat');
  var tcEl = document.getElementById('tc');
  var msgEl = document.getElementById('msg');
  var audioEl = document.getElementById('song');
  var fileEl = document.getElementById('file');
  var playEl = document.getElementById('play');
  var offEl = document.getElementById('off');
  var RES = parseFloat(new URLSearchParams(location.search).get('res') || '') || 1.5;
  canvas.width = Math.round(W * RES); canvas.height = Math.round(H * RES);
  var PV = window.PV = {
    RES: RES,
    W: W, H: H, FPS: FPS, t: 0, frame: 0, playing: false, offset: 0,
    scale: 1, audioReady: false, hold: false, layers: [], bootQueue: []
  };
  PV.audio = audioEl; PV.chat = chatEl; PV.screen = screenEl;
  PV.newCanvas = function (w, h) { var c = document.createElement('canvas'); c.width = Math.max(1, w | 0); c.height = Math.max(1, h | 0); return c; };
  PV.onWorld = function (fn) { PV.layers.push(fn); };
  PV.onBoot = function (fn) { PV.bootQueue.push(fn); };
  function layout() {
    var vh = window.innerHeight - 44;
    var s = Math.min(window.innerWidth / W, vh / H);
    PV.scale = s;
    screenEl.style.transform = 'scale(' + s + ')';
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
    if (!usingAudio) {
      clock += dt;
      var le = PV.loopEnd || 16.1;
      if (clock >= le) clock = 0;
    }
    var t = pictureTime(); if (t < 0) t = 0;
    var tq = PV.hold ? PV.t : Math.floor(t * FPS) / FPS;
    draw(tq);
    if (PV.sync) PV.sync(tq);
    tcEl.textContent = fmt(tq) + '  f' + PV.frame + (PV.shotName ? '  ' + PV.shotName : '') + (PV.audioReady ? '' : '  loop 0-' + (PV.loopEnd || 16.1).toFixed(1) + 's');
    requestAnimationFrame(loop);
  }
  playEl.onclick = function () {
    if (PV.audioReady) {
      if (audioEl.paused) { audioEl.play(); playEl.textContent = 'pause'; }
      else { audioEl.pause(); playEl.textContent = 'play'; }
    } else { PV.hold = !PV.hold; }
  };
  fileEl.onchange = function () {
    var f = fileEl.files && fileEl.files[0];
    if (!f) return;
    audioEl.src = URL.createObjectURL(f);
    audioEl.load();
    PV.audioReady = true;
    msgEl.textContent = f.name + ' (' + (f.size / 1048576).toFixed(1) + ' MB)';
    audioEl.play(); playEl.textContent = 'pause';
  };
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
