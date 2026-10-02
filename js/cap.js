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

  function rasterize(svg) {
    return new Promise(function (res, rej) {
      var im = new Image();
      im.onload = function () { res(im); };
      im.onerror = function () { rej(new Error('svg rasterize failed')); };
      im.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
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
        var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + box.offsetWidth + '" height="' + box.offsetHeight + '">' +
          '<foreignObject x="0" y="0" width="100%" height="100%">' +
          '<div xmlns="http://www.w3.org/1999/xhtml" style="width:' + box.offsetWidth + 'px;height:' + box.offsetHeight + 'px;overflow:hidden">' +
          '<style>' + a[0].replace(/<\/style>/g, '') + '</style>' + a[1] + '</div></foreignObject></svg>';
        return rasterize(svg).then(function (im) {
          var k = W / 1280;
          g.drawImage(im, d.x * k, d.y * k, d.w * k, d.h * k);
          return true;
        });
      }).catch(function () { return false; });
    })() : Promise.resolve(false);

    return p.then(function (ok) {
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

  function waitReady() {
    if (PV.readyFlag) { boot(); return; }
    setTimeout(waitReady, 200);
  }
  waitReady();
})();

