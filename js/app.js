/* pv-live — world.execute(me); 浏览器实时版
   一切绘制都是画面时间 t（秒）的纯函数。24 fps / 1280x720。 */
(function () {
  'use strict';
  var W = 1280, H = 720, FPS = 24;
  /* 参考成片（/storage/emulated/0/video1.mp4）的总长 = 211.872 s。
     手机浏览器对 audio/bgm.mp3（其实是 DASH fMP4 容器）报出来的 duration 可能缺失或偏短，
     全片长度一律以成片为准，否则进度条只能拖到音频给的时长、末尾几秒永远播不到、
     音频一结束画面还会跳回开头。 */
  var FILM_LEN = 211.872;
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
  /* 箱内单元（#chat ≤ #chatbox ≤ #app）：LEAD 的压暗落在这一层，见 frame.js 里 levels 的注释 */
  PV.cell = document.getElementById('chatbox');
  /* LEAD 压暗真正挂在这一层：#chatbox 的 filter 被 cuts_p3.js:409 每帧覆盖 ✗，
     而内容全在 #app 里（重建 innerHTML 不影响元素自身的行内样式 ✓）。 */
  PV.dimEl = document.getElementById('app');
  PV.FILM_LEN = FILM_LEN;
  PV.audioDur = 0;
  audioEl.addEventListener('loadedmetadata', function () {
    if (isFinite(audioEl.duration) && audioEl.duration > 1) PV.audioDur = audioEl.duration;
  });
  /* 版本号：**必须与 index.html 的 ?v= 一起改**——caps 的 _box.png 会回传这个字段，是判断
     「浏览器到底跑的是哪一版代码」的唯一可靠依据（原来停在 202610050600，cap 里永远是旧号，
     双证时无法确认页面有没有 reload 到新码）。 */
  PV.VER = '202610052610';
  var errEl = document.getElementById('err');
  PV.showErr = function (msg) {
    if (!errEl) return;
    var t = String(msg);
    if (errEl.textContent.indexOf(t) >= 0) return;
    errEl.textContent = (errEl.textContent ? errEl.textContent + String.fromCharCode(10) : '') + t;
    errEl.style.display = 'block';
  };
  PV.clearErr = function () { if (errEl) { errEl.textContent = ''; errEl.style.display = 'none'; } };
  window.addEventListener('error', function (e) {
    /* 资源加载失败（img/script/link）也会走到这里，但它不是脚本错误，
       单独标出来，免得和真正的 JS 异常混在一起。 */
    var tg = e && e.target;
    if (tg && tg !== window && tg.tagName) {
      PV.resErr = (PV.resErr || 0) + 1;
      if (PV.resErr <= 3) PV.showErr('RES ' + tg.tagName + ' 加载失败: ' + String(tg.src || tg.href || '').split('/').slice(-2).join('/'));
      return;
    }
    var msg;
    if (e && e.error) msg = String(e.error.stack || e.error.message || e.error).split(String.fromCharCode(10)).slice(0, 2).join(' | ');
    else msg = (e && e.message || '?') + ' @' + String(e && e.filename || '').split('/').pop() + ':' + (e && e.lineno || 0) + ':' + (e && e.colno || 0);
    PV.showErr('JSERR ' + msg);
  }, true);
  window.addEventListener('unhandledrejection', function (e) {
    PV.showErr('REJECT ' + ((e.reason && (e.reason.message || e.reason)) || '?'));
  });
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
      try { PV.layers[i](ctx, t, PV.frame); } catch (e) { PV.err = e; PV.showErr('layer ' + (e && e.message)); if (!PV.layerLogged) { PV.layerLogged = 1; if (window.console) console.log('layer error', e && e.message); } }
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
  /* 进度条与循环共用的总时长：音频元数据优先，其次音频时长缓存，最后退回片长 */
  function songDur() {
    var ad = (PV.audioReady && isFinite(audioEl.duration) && audioEl.duration > 1)
      ? audioEl.duration : (PV.audioDur || 0);
    if (!isFinite(ad) || ad < 1) ad = 0;
    /* 音频元数据缺失或比成片短时，不能让整片跟着缩水（用户报「全片只有 3:27.6」）。 */
    return Math.max(ad, FILM_LEN);
  }
  /* clock 永远等于「当前画面时间 + offset」。音频播放时它每一帧都被同步成 audioEl.currentTime，
     所以暂停、拖动、恢复都不会丢位置——旧版这里读的是播放中的音频、暂停后切回没被推进过的 clock，
     于是暂停瞬间画面和进度条一起跳回 0。 */
  function pictureTime() { return clock - PV.offset; }
  PV.pictureTime = pictureTime;
  function loop(ts) {
    requestAnimationFrame(loop);   /* 先排队下一帧：任何异常都不能再冻住画面 */
    try {
    var dt = lastTs ? Math.min(0.2, (ts - lastTs) / 1000) : 0;
    lastTs = ts;
    var usingAudio = PV.audioReady && !audioEl.paused && !audioEl.ended;
    var le = songDur();
    if (usingAudio) {
      /* 跳转保护：seek 之后 audioEl.currentTime 会有一小段时间读回旧值/0（尤其服务器不支持
         Range 请求时），原来每帧无条件 clock=currentTime，于是"一拖进度条画面和声音就回到开头"。
         这里在 seek 落定前把 clock 钉在目标上，音频若自己跳回去就再设一次。 */
      if (seekTarget !== null) {
        if (performance.now() - seekAt > 1500) { seekTarget = null; clock = audioEl.currentTime; }
        else {
          if (!audioEl.seeking && Math.abs(audioEl.currentTime - seekTarget) > 0.4) {
            try { audioEl.currentTime = seekTarget; } catch (e) {}
          }
          clock = seekTarget;
        }
      } else {
        clock = audioEl.currentTime;
      }
    } else if (!paused && PV.started) {   /* 用户点过开始之前，画面停在第 0 帧——音画必须一起动 */
      clock += dt;
      /* le 现在是 max(音频时长, 成片长度)：音频比成片短（或压根没解码出来）时，
         画面照样走完整片，只在 le 处回卷——修「进度条跳回开头」。 */
      if (clock >= le) {
        clock = 0;
        lastTs = ts;                        /* 回卷这一帧不累加，免得下一帧多走一整帧 */
        if (PV.audioReady) { try { audioEl.currentTime = 0; var pr2 = audioEl.play(); if (pr2 && pr2.catch) pr2.catch(function () {}); } catch (e2) {} }
      }
    }
    var t = pictureTime(); if (t < 0) t = 0;
    var tq = PV.hold ? PV.t : Math.floor(t * FPS) / FPS;
    draw(tq);
    if (PV.sync) { try { PV.sync(tq); } catch (e) { PV.syncErr = e; if (!PV.syncLogged) { PV.syncLogged = 1; if (window.console) console.log('sync error', e && e.message); } } }
    if (seekEl && !seekDragging) { var dd = songDur(); seekEl.value = String(Math.round(1000 * Math.min(1, tq / dd))); }
    if (tcEl) tcEl.textContent = fmt(tq) + '  f' + PV.frame + (PV.shotName ? '  ' + PV.shotName : '') + (PV.audioReady ? '' : '  loop 0-' + (PV.loopEnd || 16.1).toFixed(1) + 's');
    } catch (e) { PV.loopErr = e; PV.showErr('loop ' + (e && e.message)); }
  }
  var seekTarget = null, seekAt = 0;   /* seek 保护：目标时刻与发起时间 */
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
  /* 音频可能还没解码好用户就点了开始：play() 会被拒（AbortError / NotSupportedError），
     旧代码只在 audioReady 时才 play、而且把失败 catch 掉了，于是"画面在动、没有声音"。
     现在：无条件尝试 play，并把当前时间接上；没成功就每 250ms 重试（最多 40 次），
     同时把状态写到 #msg，用户一眼能看到卡在哪一步。 */
  var kickTimer = null, kickN = 0;
  function audioOK() { return !audioEl.paused && !audioEl.ended && audioEl.readyState >= 2; }
  audioEl.addEventListener('playing', function () { sndHint(false); });
  function kickAudio() {
    if (!PV.started || paused) return;
    if (audioOK()) { if (msgEl) msgEl.textContent = ''; return; }
    var pr = null;
    try { pr = audioEl.play(); } catch (e) {}
    if (pr && pr.catch) pr.catch(function (err) {
      var nm = (err && err.name) || '?';
      if (msgEl) msgEl.textContent = '音频未就绪(' + nm + ') 重试中… readyState=' + audioEl.readyState;
      /* NotAllowedError = 自动播放策略拦的（不是文件问题）：给个能点的小提示，点一下就有声 */
      if (nm === 'NotAllowedError') sndHint(true, '▶ 点这里开启声音');
    });
    if (audioOK()) sndHint(false);
  }
  /* 【自动播放策略】没声音的元凶：浏览器只允许"用户手势里"带声音起播。
     到 50% 由 precache.js 定时器自动开播时**没有手势**，play() 会被 NotAllowedError 拒掉。
     所以：① 用户一点（任何位置/▶）就先用 muted 播一下再停 —— 该元素/该域被记为"已交互过"，
     之后程序化 play() 就放行了；② 万一还是被拒，右下角给一个"点击开启声音"的小提示。 */
  function unlockAudio() {
    /* 先试**带声**：iOS/Safari 只认"手势里那次带声的 play()"——之后同一个 <audio> 的
       程序化 play() 才放行；被拒（NotAllowedError，多半是桌面 Chrome 还没交互）再退 muted。 */
    var attempt = function (muted) {
      try {
        audioEl.muted = muted;
        var pu = audioEl.play();
        if (pu && pu.then) {
          pu.then(function () { try { audioEl.pause(); audioEl.currentTime = 0; } catch (e) {} audioEl.muted = false; },
                  function () { if (!muted) attempt(true); else { audioEl.muted = false; sndHint(true); } });
        } else { try { audioEl.pause(); } catch (e) {} audioEl.muted = false; }
      } catch (e) { try { audioEl.muted = false; } catch (e2) {} }
    };
    attempt(false);
  }
  function sndHint(on, text) {
    var el = document.getElementById('sndhint');
    if (!el) {
      el = document.createElement('div');
      el.id = 'sndhint';
      el.style.cssText = 'position:fixed;right:16px;bottom:64px;z-index:9600;background:rgba(6,10,18,.94);' +
        'border:1px solid #4d6bfe;border-radius:9px;padding:10px 14px;color:#cdd8ff;cursor:pointer;' +
        'font:13px/1.4 ui-monospace,Menlo,Consolas,monospace;box-shadow:0 6px 24px rgba(0,0,0,.6)';
      document.body.appendChild(el);
    }
    el.textContent = text || '▶ 点击开启声音';
    el.style.display = on ? 'block' : 'none';
    el.onclick = function (ev) {
      if (ev && ev.stopPropagation) ev.stopPropagation();
      /* 这是一次真手势：把声音起起来，并把画面从"等声音"的暂停里放出来 */
      try {
        var pr = audioEl.play();
        if (pr && pr.then) pr.then(function () { sndHint(false); try { PV.setPaused(false); } catch (e) {} },
                                   function () { el.textContent = '▶ 还是被拦：再点一次 / 检查静音键'; });
      } catch (e) {}
      el.style.display = 'none';
    };
  }
  PV.sndHint = sndHint;

  function startAudio() {
    if (PV.started) return;
    unlockAudio();
    /* 【2026-10-05 用户要求】素材缓存门：整片素材 ~186MB（hx 贴图 + h3 帧池 + avatars），
       缓存不到阈值（默认 50%，见 js/precache.js）不允许开始播放 —— 否则一边播一边下会卡死。
       点了开始但还没到阈值：记下 pendingStart，precache 到点会自动调这里。 */
    if (PV.pre && PV.pre.on && !PV.pre.ready) {
      PV.pendingStart = true;
      if (PV.prePaint) { try { PV.prePaint(); } catch (e) {} }
      if (msgEl) msgEl.textContent = '素材缓存中 ' + (PV.pre.pct || 0).toFixed(0) + '% …';
      return;
    }
    PV.started = true;
    var hintEl = document.getElementById('hint'); if (hintEl) hintEl.style.display = 'none';
    PV.audioReady = true;   /* 元素上有 src 就当它可用；真失败会走 error 事件并写 #msg */
    try { audioEl.currentTime = Math.max(0, clock + PV.offset); } catch (e) {}   /* 从当前画面位置接上，不把画面拽回 0 */
    PV.setPaused(false);
    kickAudio();
    if (kickTimer) clearInterval(kickTimer);
    kickN = 0;
    kickTimer = setInterval(function () {
      kickN++;
      /* 2 秒还起不来声音：把画面也停下（成片是音画同步的，无声画面会一路跑偏），
         只留右下角那个"▶ 点这里开启声音"，点了就继续。 */
      if (kickN === 8 && !audioOK()) { sndHint(true); try { PV.setPaused(true); } catch (e) {} }
      if (kickN > 40 || audioOK() || paused) {
        clearInterval(kickTimer); kickTimer = null;
        if (msgEl && audioOK()) msgEl.textContent = '';
        else if (msgEl && kickN > 40) msgEl.textContent = '音频一直没能播放：readyState=' + audioEl.readyState + ' paused=' + audioEl.paused + ' err=' + (audioEl.error && audioEl.error.code);
        return;
      }
      kickAudio();
    }, 250);
    document.removeEventListener('pointerdown', startAudio, true);
    document.removeEventListener('keydown', startAudio, true);
  }
  PV.startAudio = startAudio;   /* precache.js 到阈值后自动放行时要用 */
  audioEl.addEventListener('error', function () {
    if (msgEl) msgEl.textContent = '音频加载失败 code=' + (audioEl.error && audioEl.error.code) + ' src=' + audioEl.currentSrc;
  });
  audioEl.addEventListener('stalled', function () { if (msgEl && PV.started) msgEl.textContent = '音频 stalled…'; });
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
      var dur = songDur();
      var target = (seekEl.value / 1000) * dur;
      if (!isFinite(target) || target < 0) target = 0;
      seekTarget = target; seekAt = performance.now();   /* 见主循环里的跳转保护 */
      if (PV.audioReady) { try { audioEl.currentTime = target; } catch (e) {} }
      clock = target;   /* 暂停状态下拖动进度条也要立刻跟手 */
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
    PV.scanForeign();
    if (q.has('t')) {
      PV.hold = true;
      var tt = parseFloat(q.get('t'));
      var tq = Math.floor(tt * FPS) / FPS;
      draw(tq); if (PV.sync) PV.sync(tq);
      if (seekEl && !seekDragging) { var dd = songDur(); seekEl.value = String(Math.round(1000 * Math.min(1, tq / dd))); }
    if (tcEl) tcEl.textContent = fmt(tq) + '  f' + PV.frame + (PV.shotName ? '  ' + PV.shotName : '') + (PV.audioReady ? '' : '  loop 0-' + (PV.loopEnd || 16.1).toFixed(1) + 's');
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
  /* "Script error." 是跨域脚本抛错的专属签名（同源脚本一定会带出堆栈）。
     页面自己把非本源的 script / 浏览器注入物报出来，省得靠猜。 */
  PV.scanForeign = function () {
    try {
      var bad = [], ss = document.getElementsByTagName('script');
      for (var i = 0; i < ss.length; i++) {
        var src = ss[i].src || '';
        if (src && src.indexOf(location.origin) !== 0 && src.indexOf('blob:') !== 0 && src.indexOf('data:') !== 0)
          bad.push(src.split('/')[2]);
      }
      if (document.getElementById('goog-gt-tt') || /translated/.test(document.documentElement.className || ''))
        bad.push('google-translate');
      if (bad.length) PV.showErr('外部脚本注入: ' + bad.join(', ') + '  (跨域脚本的报错只会显示 Script error.)');
    } catch (e) {}
  };
  PV.boot = boot;
})();
