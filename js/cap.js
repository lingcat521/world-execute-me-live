/* cap.js —— 页面自截屏：把 canvas + 左侧真 HTML 聊天窗合成成一张整幅 PNG，POST 回本地服务器的 /save。
   用途：无头渲染器画不出左侧 HTML 窗格，只有真浏览器能出整幅图；用户开着浏览器，我这边就能拿到图来审核。

   用法：在地址后面加 ?capt=70.5,71,72 （逗号分隔的时刻，秒）。
   页面会逐帧冻到那个时刻、截图、POST 到 http://<同源>/save?name=cap_<t>，存到 pvport/caps/。
   全部做完会把 document.title 改成 cap-done。

   原理：把 #chatbox 克隆出来 → 内联所有 CSS 和图片 → 塞进 SVG 的 foreignObject → 画到离屏 canvas 上，
   再和 #stage 拼在一起。Chrome/WebView 支持；失败会退回"只有 canvas"并在标题里标出来。 */
(function () {
  'use strict';
  var PV = window.PV;
  if (!PV) return;

  function abs(u) { try { return new URL(u, location.href).href; } catch (e) { return u; } }

  var cssP = null;
  function cssAll() {
    if (cssP) return cssP;
    var jobs = [];
    var ls = document.querySelectorAll('link[rel=stylesheet]');
    for (var i = 0; i < ls.length; i++) (function (l) {
      jobs.push(fetch(l.href).then(function (r) { return r.text(); }).catch(function () { return ''; }));
    })(ls[i]);
    cssP = Promise.all(jobs).then(function (arr) {
      var out = arr.join('\n');
      var st = document.querySelectorAll('style');
      for (var j = 0; j < st.length; j++) out += '\n' + st[j].textContent;
      return out;
    });
    return cssP;
  }

  function dataURL(url) {
    return fetch(abs(url)).then(function (r) { return r.blob(); }).then(function (b) {
      return new Promise(function (res) {
        var fr = new FileReader();
        fr.onload = function () { res(fr.result); };
        fr.onerror = function () { res(url); };
        fr.readAsDataURL(b);
      });
    }).catch(function () { return url; });
  }

  function inlineImgs(html) {
    var re = /src="([^"]+)"/g, jobs = [], m;
    var out = html;
    while ((m = re.exec(html))) {
      if (/^(data:|https?:\/\/)/.test(m[1])) continue;
      jobs.push([m[1]]);
    }
    if (!jobs.length) return Promise.resolve(out);
    return Promise.all(jobs.map(function (j) { return dataURL(j[0]); })).then(function (urls) {
      for (var i = 0; i < jobs.length; i++) out = out.split('src="' + jobs[i][0] + '"').join('src="' + urls[i] + '"');
      return out;
    });
  }

  var lastErr = '', lastCssLen = 0;
  function rasterize(svg) {
    return new Promise(function (res, rej) {
      var url = null;
      try { url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })); } catch (e) { url = null; }
      function bye() { if (url) { try { URL.revokeObjectURL(url); } catch (e) {} } }
      var im = new Image();
      im.onload = function () { bye(); res(im); };
      im.onerror = function () { bye(); rej(new Error('svg rasterize failed len=' + svg.length + (url ? ' blob' : ' data'))); };
      /* data: URL 在 CSS 全文（dsh vendor 上兆）下会撞浏览器长度上限而直接失败 -> 优先 Blob URL */
      im.src = url || ('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg));
    });
  }

  PV.capture = function (name) {
    var stage = document.getElementById('stage');
    if (!stage) return Promise.reject(new Error('no stage'));
    var W = stage.width, H = stage.height;
    var off = document.createElement('canvas'); off.width = W; off.height = H;
    var g = off.getContext('2d');
    g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
    g.drawImage(stage, 0, 0);

    var box = document.getElementById('chatbox');
    var wrap = document.getElementById('chat');
    var visible = box && wrap && getComputedStyle(wrap).display !== 'none';
    var p = visible ? (function () {
      var sr = stage.getBoundingClientRect();
      var r = box.getBoundingClientRect();
      var s = sr.width / 1280 || 1;
      var d = { x: (r.left - sr.left) / s, y: (r.top - sr.top) / s, w: r.width / s, h: r.height / s };
      var clone = box.cloneNode(true);
      clone.style.transform = 'none';
      clone.style.width = box.offsetWidth + 'px';
      clone.style.height = box.offsetHeight + 'px';
      return Promise.all([cssAll(), inlineImgs(clone.outerHTML)]).then(function (a) {
        lastCssLen = a[0].length;
        /* XML 里 <style> 的内容是纯文本：& 与 < 必须转义，否则整个 SVG 解析失败、合成直接退回 _nocap */
        var css = a[0].replace(/<\/style>/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
        var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + box.offsetWidth + '" height="' + box.offsetHeight + '">' +
          '<foreignObject x="0" y="0" width="100%" height="100%">' +
          '<div xmlns="http://www.w3.org/1999/xhtml" style="width:' + box.offsetWidth + 'px;height:' + box.offsetHeight + 'px;overflow:hidden">' +
          '<style>' + css + '</style>' + a[1] + '</div></foreignObject></svg>';
        return rasterize(svg).then(function (im) {
          var k = W / 1280;
          g.drawImage(im, d.x * k, d.y * k, d.w * k, d.h * k);
          return true;
        });
      }).catch(function (e) { lastErr = (e && e.message) || String(e); return false; });
    })() : Promise.resolve(false);

    return p.then(function (ok) {
      /* 诊断：成没成都把 #chatbox 的实际变换/矩形回传一份纯文本（caps/<name>_box.png 里就是 JSON），
         合成失败时后端至少能核对「窗格被缩放到了哪个矩形」。 */
      try {
        var sr2 = stage.getBoundingClientRect(), s2 = (sr2.width / 1280) || 1;
        var bb = document.getElementById('chatbox');
        var rr = bb ? bb.getBoundingClientRect() : null;
        /* 只有真浏览器能核的东西，一次全带回后端：
           - 窗格可见性/显示/透明度 + #chatbox 的仿射（shot 给的 rect、C31 复合、trapped 收窄都在这）；
           - 窗格内容的规模（innerHTML 长度，用来确认 DOM 文案真的换到那一刻的内容）；
           - 音画同步：audio.currentTime 与渲染时钟 PV.t 的差（node 渲染没有音频，只能在这里验）；
           - 当前镜（PV.shotName）与 paneVisible，用来核对「哪一镜该有聊天窗」。 */
        var chat = document.getElementById('chat');
        var app = document.getElementById('app');
        var au = document.getElementById('song') || document.querySelector('audio');
        var cs = chat ? getComputedStyle(chat) : null;
        fetch('/save?name=' + encodeURIComponent(name + '_box'), { method: 'POST', body: JSON.stringify({
          t: PV.t, ok: ok, err: lastErr, cssLen: lastCssLen,
          offW: bb ? bb.offsetWidth : 0, offH: bb ? bb.offsetHeight : 0,
          transform: bb ? getComputedStyle(bb).transform : '',
          rect: rr ? [+((rr.left - sr2.left) / s2).toFixed(2), +((rr.top - sr2.top) / s2).toFixed(2),
                      +(rr.width / s2).toFixed(2), +(rr.height / s2).toFixed(2)] : null, res: PV.RES || 1,
          shot: PV.shotName || '', vis: PV.paneVisible ? PV.paneVisible(PV.t) : null,
          chatDisplay: cs ? cs.display : '', chatOpacity: cs ? cs.opacity : '', chatTransform: chat ? chat.style.transform : '',
          bodyLen: app ? app.innerHTML.length : 0, head: app ? app.innerHTML.replace(/\s+/g, ' ').slice(0, 90) : '',
          audio: au ? +au.currentTime.toFixed(3) : null, drift: au ? +(au.currentTime - PV.t).toFixed(3) : null,
          hold: !!PV.hold, ver: PV.VER || ''
        }) });
      } catch (e) {}
      return new Promise(function (res) {
        off.toBlob(function (b) {
          fetch('/save?name=' + encodeURIComponent(name) + (ok ? '' : '_nocap'), { method: 'POST', body: b })
            .then(function () { res(true); }).catch(function () { res(false); });
        }, 'image/png');
      });
    });
  };

  function boot() {
    var q = new URLSearchParams(location.search);
    if (!q.has('capt')) return;
    var list = q.get('capt').split(',').map(parseFloat).filter(function (x) { return !isNaN(x); });
    if (!list.length) return;
    PV.hold = true;
    var i = 0;
    function next() {
      if (i >= list.length) { document.title = 'cap-done ' + list.length; return; }
      var t = list[i++];
      PV.t = Math.floor(t * 24) / 24;
      requestAnimationFrame(function () { requestAnimationFrame(function () {
        PV.capture('cap_' + t.toFixed(2)).then(function () { setTimeout(next, 150); }, function () { setTimeout(next, 150); });
      }); });
    }
    setTimeout(next, 400);
  }

  /* 自动刷新（后端改代码 -> 前端自己换版本并重跑截屏）：
     ?auto=<秒> 无条件定时 reload；带 ?capt= 时默认开启——每 2s 问一次 /stamp，源码指纹一变就 reload。
     /stamp 只有本地 serve.py 有，线上 GitHub Pages 会 404，静默忽略。 */
  function autoReload() {
    var q = new URLSearchParams(location.search);
    var sec = parseFloat(q.get('auto') || '0');
    if (sec > 0) { setInterval(function () { location.reload(); }, Math.max(3, sec) * 1000); return; }
    if (!q.has('capt')) return;
    var last = null;
    setInterval(function () {
      fetch('/stamp?_=' + Date.now(), { cache: 'no-store' }).then(function (r) {
        if (!r.ok) throw new Error('no stamp');
        return r.text();
      }).then(function (s) {
        if (last === null) { last = s; return; }
        if (s !== last) { last = s; location.reload(); }
      }).catch(function () {});
    }, 2000);
  }
  autoReload();
  function waitReady() {
    if (PV.readyFlag) { boot(); return; }
    setTimeout(waitReady, 200);
  }
  waitReady();
})();

