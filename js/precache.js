/* pv-live/js/precache.js —— 素材预载门 + 缓存填充（用户要求：缓存到 ≥50% 才让页面开始播放）
   两条硬要求（用户实测反馈）：
     ① 进度框必须在开始播放后消失 —— 用独立元素 #prebox，开始播放/缓存完成后自己移除；
        不再借用 #hint（那是 app.js 的提示层，两边抢会打架）。
     ② 刷新页面不能把已缓存的东西弄丢 —— **不依赖 Service Worker 是否已接管**：
        这里直接用 Cache Storage API（caches.open(CACHE).put(...)）写缓存，
        所以第一次打开（SW 还没接管页面）也照样进缓存；刷新后 c.match 命中 -> 不再下载。
        SW(sw.js) 用的是同名缓存，之后它 cache-first 直接从这里取。
   编码：data/precache.json 按「首次用到的时间」排序（pet/hx 用真实时间轴），
   进度按字节算；阈值默认 0.5（?pre=0.8 调高、?pre=0 关闭；?capt= 截屏模式不拦）。 */
(function () {
  'use strict';
  var PV = window.PV || (window.PV = {});
  var q = new URLSearchParams(location.search);
  var THRESH = q.has('pre') ? parseFloat(q.get('pre')) : 0.5;
  if (q.has('capt')) THRESH = 0;
  var CONC = Math.max(1, parseInt(q.get('prec') || '8', 10));
  var CACHE = q.get('cache') || 'pv-assets-v4';       /* 与 sw.js 的 VER 同名 */
  var PRE = PV.pre = { ready: false, on: THRESH > 0, thresh: THRESH, done: 0, total: 0, pct: 0,
                       got: 0, hit: 0, miss: 0, n: 0, files: 0, err: '', over: false };
  if (!PRE.on) { PRE.ready = true; return; }

  var box = null, gone = false;
  function ui() {
    if (box) return box;
    box = document.createElement('div');
    box.id = 'prebox';
    box.style.cssText = 'position:fixed;left:50%;top:42%;transform:translate(-50%,-50%);z-index:9500;' +
      'background:rgba(6,10,18,.92);border:1px solid #2b3a55;border-radius:10px;padding:16px 20px;' +
      'color:#dfe6f5;font:14px/1.6 ui-monospace,Menlo,Consolas,monospace;text-align:center;min-width:280px;' +
      'box-shadow:0 8px 30px rgba(0,0,0,.6)';
    document.body.appendChild(box);
    return box;
  }
  function hide() {
    if (gone) return; gone = true;
    if (box && box.parentNode) box.parentNode.removeChild(box);
  }
  function paint() {
    if (gone) return;
    var pct = PRE.total ? Math.min(100, PRE.done / PRE.total * 100) : 0;
    PRE.pct = pct;
    var b = ui();
    if (PV.started) { hide(); return; }
    b.innerHTML = '<div style="font-size:16px;color:#8ea2ff">素材缓存 ' + pct.toFixed(0) + '%</div>' +
      '<div style="opacity:.8">' + (PRE.done / 1048576).toFixed(0) + ' / ' + (PRE.total / 1048576).toFixed(0) + ' MB' +
      '　已命中 ' + PRE.hit + '</div>' +
      '<div style="margin:10px auto 0;width:240px;height:6px;background:#1f2937;border-radius:3px;overflow:hidden">' +
      '<div style="height:100%;width:' + pct.toFixed(1) + '%;background:#4d6bfe"></div></div>' +
      '<div style="margin-top:10px;font-size:12.5px;opacity:.75;line-height:1.5">' +
      (PRE.ready ? '<b style="color:#7ee787">可以开始了：点下方 ▶（或页面任意处）</b>'
                 : '缓存到 ' + (PRE.thresh * 100).toFixed(0) + '% 才允许开始播放<br>' +
                   '现在点 ▶ 也行 —— 到 ' + (PRE.thresh * 100).toFixed(0) + '% 会自动开<br>' +
                   '<span style="opacity:.8">中途刷新不会丢：已缓存的部分会跳过</span>') +
      '</div>';
  }
  /* 开始播放（手动或自动）后把框收掉 */
  var poll = setInterval(function () { if (PV.started) { hide(); clearInterval(poll); } }, 300);

  function one(item, after) {
    var url = item[0], size = item[1], fin = false;
    function done(ok, cached) {
      if (fin) return; fin = true;
      PRE.n++;
      if (ok) { PRE.got++; PRE.done += size; if (cached) PRE.hit++; } else PRE.miss++;
      if (!PRE.ready && PRE.total && PRE.done / PRE.total >= PRE.thresh) {
        PRE.ready = true; paint();
        if (PV.pendingStart && PV.startAudio) { try { PV.startAudio(); } catch (e) {} }
      } else if (!PRE.ready && (PRE.n % 20 === 0)) paint();
      after();
    }
    function imgFallback() {
      var im = new Image();
      im.onload = function () { done(true); };
      im.onerror = function () { done(false); };
      setTimeout(function () { done(false); }, 30000);
      im.src = url;
    }
    if (window.caches && caches.open) {
      caches.open(CACHE).then(function (c) {
        return c.match(url).then(function (hit) {
          if (hit) { done(true, true); return; }
          return fetch(url, { credentials: 'same-origin' }).then(function (res) {
            if (!res || !res.ok) { done(false); return; }
            var put = null;
            try { put = c.put(url, res.clone()); } catch (e) {}
            res.arrayBuffer().then(function () { if (put) put.then(function () { done(true); }, imgFallback); else done(true); },
                                    function () { imgFallback(); });
          }, function () { imgFallback(); });
        });
      }).catch(function () { imgFallback(); });
    } else imgFallback();
  }

  fetch('data/precache.json', { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (idx) {
    var list = [], i, g, k, pad;
    for (i = 0; i < idx.g.length; i++) {
      g = idx.g[i];
      if (g.n && g.n > 0) {
        pad = g.pad || 3;
        for (k = 0; k < g.n; k++) {
          var num = String(g.i0 + k);
          while (num.length < pad) num = '0' + num;
          list.push([g.p + num + '.webp', g.avg]);
        }
      } else if (g.file) list.push([g.p + g.file, g.avg]);
    }
    PRE.total = idx.total; PRE.files = list.length;
    paint();
    var next = 0;
    function pump() {
      while (next < list.length && CONC > 0) { CONC--; one(list[next++], function () { CONC++; pump(); }); }
      if (next >= list.length) { PRE.over = true; paint(); }
    }
    pump();
  }).catch(function (e) {
    PRE.ready = true; PRE.err = String((e && e.message) || e);
    var b = ui(); b.innerHTML = '<div style="color:#ff9">索引读取失败，直接放行：' + PRE.err + '</div>';
    setTimeout(hide, 3000);
  });
  PV.prePaint = paint;
  PV.preHide = hide;
})();

