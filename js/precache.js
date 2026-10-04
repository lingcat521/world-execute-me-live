/* pv-live/js/precache.js —— 素材预载门（用户要求：缓存到 ≥50% 才让页面开始播放）
   为什么：整片素材 ~186MB（hx 逐帧贴图 + h3 帧池 + avatars），网速不够时一边播一边下会卡成 PPT。
   做法：读 data/precache.json（按「首次用到的时间」排序的 103 组、12112 个文件），
   用 <img> 并发预取（请求会经过 sw.js 写进 Cache Storage），进度按字节算；
   达到阈值（默认 0.5，可用 ?pre=0.8 调、?pre=0 关）× 才放行开始播放；之后继续把剩下的下完。
   ?capt= 截屏模式不拦（cap.js 自己按拍摄时刻 warmRange）。 */
(function () {
  'use strict';
  var PV = window.PV || (window.PV = {});
  var q = new URLSearchParams(location.search);
  var THRESH = q.has('pre') ? parseFloat(q.get('pre')) : 0.5;
  if (q.has('capt')) THRESH = 0;
  var CONC = Math.max(1, parseInt(q.get('prec') || '8', 10));
  var PRE = PV.pre = { ready: false, on: THRESH > 0, thresh: THRESH, done: 0, total: 0, pct: 0,
                       got: 0, miss: 0, n: 0, files: 0, t0: Date.now(), over: false };
  if (!PRE.on) { PRE.ready = true; return; }

  function el(id) { return document.getElementById(id); }
  function paint() {
    var pct = PRE.total ? Math.min(100, PRE.done / PRE.total * 100) : 0;
    PRE.pct = pct;
    var hint = el('hint');
    if (hint && !PRE.ready) {
      hint.innerHTML = '素材缓存 <b>' + pct.toFixed(0) + '%</b>　' +
        (PRE.done / 1048576).toFixed(0) + ' / ' + (PRE.total / 1048576).toFixed(0) + ' MB' +
        '<div style="margin:10px auto 0;width:min(420px,70vw);height:6px;background:#1f2937;border-radius:3px;overflow:hidden">' +
        '<div style="height:100%;width:' + pct.toFixed(1) + '%;background:#4d6bfe"></div></div>' +
        '<div style="margin-top:8px;font-size:13px;opacity:.75">缓存到 ' + (PRE.thresh * 100).toFixed(0) +
        '% 才能开始播放（点一下也可以，到 50% 会自动开）</div>';
    } else if (hint && PRE.ready && !PV.started) {
      hint.innerHTML = '▶&nbsp;&nbsp;点击开始播放';
    }
  }

  fetch('data/precache.json', { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (idx) {
    var list = [], g, i, k, pad;
    for (i = 0; i < idx.g.length; i++) {
      g = idx.g[i];
      if (g.n && g.n > 0) {
        pad = g.pad || 3;
        for (k = 0; k < g.n; k++) {
          var num = String(g.i0 + k);
          while (num.length < pad) num = '0' + num;
          list.push([g.p + num + '.webp', g.avg]);
        }
      } else if (g.file) {
        list.push([g.p + g.file, g.avg]);
      }
    }
    PRE.total = idx.total; PRE.files = list.length;
    paint();
    var next = 0;
    function pump() {
      while (next < list.length && CONC > 0) { CONC--; one(list[next++]); }
      if (next >= list.length && PRE.n >= list.length && !PRE.over) {
        PRE.over = true; paint();
      }
    }
    function one(item) {
      var url = item[0], size = item[1], fin = false;
      var im = new Image();
      function done(ok) {
        if (fin) return; fin = true;
        PRE.n++;
        if (ok) { PRE.got++; PRE.done += size; } else PRE.miss++;
        if (!PRE.ready && PRE.total && PRE.done / PRE.total >= PRE.thresh) {
          PRE.ready = true; paint();
          if (PV.pendingStart && PV.startAudio) { try { PV.startAudio(); } catch (e) {} }
        } else if (PRE.n % 24 === 0 || PRE.ready) paint();
        CONC++; pump();
      }
      im.onload = function () { done(true); };
      im.onerror = function () { done(false); };
      setTimeout(function () { done(false); }, 30000);
      im.src = url;
    }
    pump();
  }).catch(function (e) {
    /* 索引拿不到就别卡着用户：直接放行 */
    PRE.ready = true; PRE.err = String(e && e.message || e); paint();
  });
  PV.prePaint = paint;
})();

