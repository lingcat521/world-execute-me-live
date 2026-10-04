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
        /* ==== 只有真浏览器能测、node/PIL 渲染里根本不存在的事实（一次全带回后端）====
           ① 字体：CSS 里写了字体栈 ≠ 真用上了；document.fonts.check 只说「加载了」，
              能定案的是**实测字宽**——同一串 20 个 M，SpaceMono 与回退等宽字体的宽度不同。
           ② 图片：<img> 挂掉不报错，只有 naturalWidth=0 才暴露（404 / 坏路径）。
           ③ 可见切片：窗格只有 354×537，可内容有十万字符，浏览器到底滚到哪一行、
              那一行文本是什么，elementFromPoint 直接取（node 侧无从得知）。
           ④ 计算样式 + 滚动几何：字号/行高/配色是否真是 CSS 真值。 */
        /* 探针必须**同权重同字号**才说明问题：只换字族，宽度差才归因于字体（上一版 700 vs 400 是无效对照 ✗） */
        var monoW = -1, fallbackW = -1, asciiW = -1, cjkW = -1;
        var cbox = document.getElementById('chatbox');
        var rowEl0 = cbox ? cbox.querySelector('.pv-pet, .pv-row, .pv-line, div') : null;
        try {
          var probe = document.createElement('span');
          probe.style.cssText = 'position:absolute;left:-9999px;top:0;visibility:hidden;white-space:pre';
          probe.textContent = 'MMMMMMMMMMMMMMMMMMMM';
          document.body.appendChild(probe);
          probe.style.font = '700 16px SpaceMono,monospace';
          monoW = +probe.getBoundingClientRect().width.toFixed(2);
          probe.style.font = '700 16px monospace';   /* ← 只差字族 */
          fallbackW = +probe.getBoundingClientRect().width.toFixed(2);
          /* 真正继承到行元素上的那条栈（= 权威 dsh UI 的字体栈），在**它自己的字号**下量 ASCII 与中文 */
          if (rowEl0) {
            probe.style.font = getComputedStyle(rowEl0).font;
            asciiW = +probe.getBoundingClientRect().width.toFixed(2);
            probe.textContent = '中文测试中文测试';
            cjkW = +probe.getBoundingClientRect().width.toFixed(2);
          }
          probe.parentNode.removeChild(probe);
        } catch (e0) {}
        var imgInfo = [];
        if (app) {
          var ims = app.querySelectorAll('img');
          for (var ii = 0; ii < ims.length && ii < 6; ii++) {
            var s0 = ims[ii].getAttribute('src') || '';
            imgInfo.push((s0.split('/').pop() || '?').slice(0, 16) + ':' + ims[ii].naturalWidth + 'x' + ims[ii].naturalHeight + (ims[ii].complete ? '' : '!'));
          }
        }
        var rows = [];
        if (bb && rr && rr.width > 4 && rr.height > 4 && document.elementFromPoint) {
          var ys = [0.12, 0.5, 0.88];
          for (var yi = 0; yi < ys.length; yi++) {
            var el = document.elementFromPoint(rr.left + rr.width * 0.5, rr.top + rr.height * ys[yi]);
            if (!el || !bb.contains(el)) { rows.push(''); continue; }
            /* 取**命中点最深的元素**（上一版往上走到 #chatbox 的直接子节点 = 大容器，三处取回同一段 ✗），
               带上标签/类名就知道粒度，文本前 40 字就是浏览器此刻真显示在那儿的东西。 */
            rows.push((el.tagName || '?') + '.' + String(el.className || '').slice(0, 16) + ' ' +
                      ((el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40)));
          }
        }
        var scGeo = null;
        if (bb) {
          var pool = [bb].concat([].slice.call(bb.querySelectorAll('*')).slice(0, 400));
          for (var pi = 0; pi < pool.length; pi++) {
            if (pool[pi].clientHeight > 20 && pool[pi].scrollHeight > pool[pi].clientHeight + 8) {
              scGeo = [pool[pi].scrollTop, pool[pi].clientHeight, pool[pi].scrollHeight,
                       (pool[pi].className || pool[pi].id || '').toString().slice(0, 22)];
              break;
            }
          }
        }
        var rowEl = bb ? bb.querySelector('.pv-pet, .pv-row, .pv-line, div') : null;
        var rcs = rowEl ? getComputedStyle(rowEl) : null;
        fetch('/save?name=' + encodeURIComponent(name + '_box'), { method: 'POST', body: JSON.stringify({
          t: PV.t, ok: ok, err: lastErr, cssLen: lastCssLen,
          offW: bb ? bb.offsetWidth : 0, offH: bb ? bb.offsetHeight : 0,
          transform: bb ? getComputedStyle(bb).transform : '',
          rect: rr ? [+((rr.left - sr2.left) / s2).toFixed(2), +((rr.top - sr2.top) / s2).toFixed(2),
                      +(rr.width / s2).toFixed(2), +(rr.height / s2).toFixed(2)] : null, res: PV.RES || 1,
          shot: PV.shotName || '', vis: PV.paneVisible ? PV.paneVisible(PV.t) : null,
          chatDisplay: cs ? cs.display : '', chatOpacity: cs ? cs.opacity : '', chatTransform: chat ? chat.style.transform : '',
          /* 窗格上的 CSS 滤镜（fp8 量化 / trance 撕裂都挂在这里，只能在浏览器里核） */
          chatFilter: cs ? cs.filter : '',
          /* 箱内单元 #chatbox 的压暗（LEAD='right' 该是 brightness(0.7)，权威 blend(BG,cell,k)）+ 底色是否不透明 */
          cell: (function () { var c = document.getElementById('chatbox'); if (!c) return null; var s2 = getComputedStyle(c);
            return [s2.filter || 'none', s2.opacity, s2.backgroundColor, s2.mixBlendMode].join(' | '); })(),
          bodyLen: app ? app.innerHTML.length : 0, head: app ? app.innerHTML.replace(/\s+/g, ' ').slice(0, 90) : '',
          /* 可见文案指纹（比 head 的标记更贴近参考帧里能读到的东西）与红墙个数 */
          /* 【判内容用】窗格可见的是**最新几行**（列表底部），只取开头会拿到最老的记录 ✗，
             所以首尾都给：head80 … tail240。 */
          text: app ? (function (s) { s = s.replace(/\s+/g, ' ').trim(); return s.length > 340 ? s.slice(0, 80) + ' … ' + s.slice(-240) : s; })(app.innerText || app.textContent || '') : '',
          imgs: app ? (app.innerHTML.match(/<img[^>]*src="([^"]+)"/g) || []).map(function (s) { return (s.match(/src="([^"]+)"/) || [])[1]; }).slice(0, 8) : [],
          walls: app ? (app.innerHTML.match(/linear-gradient\(135deg/g) || []).length : 0,
          chatText: chat ? (chat.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 120) : '',
          /* 【新目标①】窗格头像：截图路径是 hold + 真画两帧后才读的，DOM 状态可信 ✓
             （探针路径只调 sync、不画，paneVisible 依赖的当前镜是旧的 ✗）。 */
          pet: (function () {
            var el = document.querySelector('#chatbox .pv-pet img') || document.querySelector('.pv-pet img');
            if (!el) return null;
            return { src: String(el.getAttribute('src') || '').split('/').slice(-2).join('/'),
                     natural: el.naturalWidth ? (el.naturalWidth + 'x' + el.naturalHeight) : null };
          })(),
          audio: au ? +au.currentTime.toFixed(3) : null, drift: au ? +(au.currentTime - PV.t).toFixed(3) : null,
          /* 字体实测（space=字体已加载 / monoW vs fbW=真用上的字宽）+ 图片加载态 */
          fonts: (document.fonts ? document.fonts.check('700 16px SpaceMono') : null), monoW: monoW, fbW: fallbackW,
          asciiW: asciiW, cjkW: cjkW,
          imgsOk: imgInfo, rows: rows, scGeo: scGeo,
          css: cs ? [cs.fontFamily.slice(0, 44), cs.fontSize, cs.lineHeight, cs.color, cs.backgroundColor, cs.letterSpacing] : null,
          rowCss: rcs ? [rcs.fontSize, rcs.lineHeight, rcs.color] : null,
          audioDur: au ? +(au.duration || 0).toFixed(3) : null, audioPaused: au ? au.paused : null,
          /* levels[0] = LEAD 的窗格亮度系数（权威 dsh_her.py:103-113）：'right' 期 = 0.7，
             与 cell 字段配对看，才知道「该压暗的时刻真的压上了」 */
          k: PV.levels ? +PV.levels(PV.t)[0].toFixed(4) : null,
          ksup: PV.levels ? +PV.levels(PV.t)[1].toFixed(4) : null,
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

  /* 音画同步采样（?drift=1）：正常播放时每 2s 把 audio.currentTime 与渲染时钟 PV.t 的差回传一次
     （固定文件名 drift_now，只留最后一条）。
     注意：?capt= 是**冻帧**模式（音频不播、PV.t 是直接设的），那里的 drift 恒等于 -t、没有意义 ✗ ——
     音画同步只能这样在真实播放态量。 */
  function driftArm(limit) {
    var au = document.getElementById('song') || document.querySelector('audio');
    var n = 0;
    var iv = setInterval(function () {
      if (!au || au.paused) return;
      n++;
      fetch('/save?name=drift_now', { method: 'POST', body: JSON.stringify({
        n: n, t: +PV.t.toFixed(3), audio: +au.currentTime.toFixed(3),
        drift: +(au.currentTime - PV.t).toFixed(3), dur: +(au.duration || 0).toFixed(3),
        paused: au.paused, ver: PV.VER || '' }) });
      if (limit && n >= limit) clearInterval(iv);
    }, 2000);
  }
  function driftWatch() {
    var q = new URLSearchParams(location.search);
    if (!q.has('drift')) return;
    driftArm(0);
  }
  driftWatch();

  /* 【后端探针 probe=…】只回 DOM 事实：**不合成画布、不用 requestAnimationFrame**。
     两个理由都是实测出来的：① 这台 WebView 的 foreignObject 合成恒失败 → DOM 改动
     **根本不可能**出现在任何截图里 ✗，能当证据的只有这些计算值；② rAF 在后台标签页被暂停 ✗
     （cap.js:277 的 runCapture 就卡在这上面），探针改成同步做才拿得到数。
     步序：置 PV.t → 立刻 PV.sync(t)（样式同步算出来）→ 读计算样式 → POST；跑完动画循环
     会自己用真实时钟把 PV.t 拉回去，不改播放状态。 */
  function probeOnly(list) {
    list.forEach(function (t) {
      PV.t = Math.floor(t * 24) / 24;
      /* H3 的「当前时刻」只由画布路径（PV.scene 包装）写；探针不画布，必须自己写，
         否则 h3 字段回的是上次播放的时刻（实测 13 个探针全是同一个 k ✗）。 */
      try { if (PV.h3) PV.h3.T = PV.t; } catch (eH3) {}
      /* 参考抽帧贴图是异步加载的：探针先预热一遍，这样**下一次**探针（或真实播放）就能用上 ✓。
         播放中 tick() 本来就在滚动预热（±0.33s），所以实际画面不受影响 ✓。 */
      try { if (PV.hx && PV.hx.tick) { for (var q = 0; q < 6; q++) PV.hx.tick(PV.t); } } catch (eHx) {}
      var chat = document.getElementById('chat'), box = document.getElementById('chatbox');
      try { if (PV.sync) PV.sync(PV.t); } catch (e) {
        fetch('/save?name=' + encodeURIComponent('probe_' + t.toFixed(2) + '_box'), { method: 'POST', body: JSON.stringify({ mode: 'probe', t: t, ver: PV.VER || '', err: String(e && e.message || e) }) });
        return;
      }
      var cs = chat ? getComputedStyle(chat) : null;
      var bs = box ? getComputedStyle(box) : null;
      var sr = null, r = null;
      try { sr = document.getElementById('stage').getBoundingClientRect(); } catch (e2) {}
      try { r = box ? box.getBoundingClientRect() : null; } catch (e3) {}
      var sc = (sr && sr.width) ? sr.width / 1280 : 1;
      var rr = (r && sr) ? [+((r.left - sr.left) / sc).toFixed(2), +((r.top - sr.top) / sc).toFixed(2),
                          +(r.width / sc).toFixed(2), +(r.height / sc).toFixed(2)] : null;
      var rws = [];
      if (box && r && r.width > 4 && document.elementFromPoint) {
        [0.12, 0.5, 0.88].forEach(function (f) {
          var el = document.elementFromPoint(r.left + r.width * 0.5, r.top + r.height * f);
          rws.push(el ? ((el.tagName || '?') + '.' + String(el.className || '').slice(0, 16) + ' ' +
            ((el.innerText || el.textContent || '').replace(/s+/g, ' ').trim().slice(0, 40))) : '');
        });
      }
      var au2 = document.getElementById('song');
      fetch('/save?name=' + encodeURIComponent('probe_' + t.toFixed(2) + '_box'), { method: 'POST', body: JSON.stringify({
        mode: 'probe', t: PV.t, ver: PV.VER || '',
        k: PV.levels ? +PV.levels(PV.t)[0].toFixed(4) : null,
        ksup: PV.levels ? +PV.levels(PV.t)[1].toFixed(4) : null,
        vis: PV.paneVisible ? PV.paneVisible(PV.t) : null,
        chatDisplay: cs ? cs.display : '', chatOpacity: cs ? cs.opacity : '',
        chatFilter: cs ? (cs.filter || 'none') : '',
        cell: bs ? [bs.filter || 'none', bs.opacity, bs.backgroundColor, bs.mixBlendMode].join(' | ') : null,
        cellTransform: box ? (box.style.transform || '') : '', rect: rr, rows: rws,
        audioPaused: au2 ? au2.paused : null,
        /* LEAD 压暗的实现是否在场（浏览器实测 k=0.7 的时候 cell 还是 none ✗，要定位是没定义还是没调用）*/
        dim: (function () {
          /* 装计数器：PV.sync 到底有没有调用 PV.paneDimApply（上一轮实测手调有效、sync 之后却是空 ✗）*/
          /* 先手动压暗 -> 再跑 sync -> 再看还在不在：能判定「是 sync 把它清掉的」还是「sync 里根本没设上」*/
          var manualFirst = null, afterSync2 = null;
          try { if (PV.paneDimApply) PV.paneDimApply(PV.t, true); } catch (eD0) {}
          manualFirst = PV.cell ? String(PV.cell.style.filter) : null;
          var calls = 0, lastArgs = null, orig = PV.paneDimApply;
          if (orig) PV.paneDimApply = function (tt, vv) { calls++; lastArgs = [tt, vv]; return orig.call(PV, tt, vv); };
          try { if (PV.sync) PV.sync(PV.t); } catch (eS) {}
          if (orig) PV.paneDimApply = orig;
          afterSync2 = PV.cell ? String(PV.cell.style.filter) : null;
          var callsSync = calls;
          var before = afterSync2;
          try { if (PV.paneDimApply) PV.paneDimApply(PV.t, true); } catch (eD) {}
          var after = PV.cell ? String(PV.cell.style.filter) : null;
          var lev = PV.levels ? +PV.levels(PV.t)[0].toFixed(4) : null;
          var appEl = document.getElementById('app');
          return { dimEl: PV.dimEl ? String(PV.dimEl.id) : null,
                   dimInline: PV.dimEl ? String(PV.dimEl.style.filter) : null,
                   dimComputed: appEl ? (getComputedStyle(appEl).filter || 'none') : null,
                   fn: typeof PV.paneDimApply, cell: !!PV.cell, before: before, afterManual: after, lev: lev,
                   manualFirst: manualFirst, afterSync2: afterSync2,
                   syncCalls: callsSync, syncArgs: lastArgs, myVis: (PV.paneVisible ? !!PV.paneVisible(PV.t) : null),
                   chatOpacity: PV.chat ? String(PV.chat.style.opacity) : null, hasSync: typeof PV.sync };
        })(),
        /* 【用户报「1:06-08 人物的动作只有几帧」】H3 逐帧立绘在浏览器里的真实状态：
           池帧加载数（0 = 图没进来 → 会退回静态 whale 立绘 ✗）、当前帧号、以及**人脸格子的哈希**
           （逐刻取一次，哈希若不变=画面真的没动）。这三个在 node 里查不出差别，只能在浏览器量。 */
        /* 【新目标①】窗格头像：src 是否已指向参考抽帧（data/hx/pet/NNNN.webp）+ 图有没有加载 */
        pet: (function () {
          var el = document.querySelector('#chatbox .pv-pet img') || document.querySelector('.pv-pet img');
          if (!el) return null;
          return { src: String(el.getAttribute('src') || '').split('/').slice(-2).join('/'),
                   natural: el.naturalWidth ? (el.naturalWidth + 'x' + el.naturalHeight) : null,
                   box: (el.getBoundingClientRect ? (function () { var b = el.getBoundingClientRect();
                          return [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)]; })() : null) };
        })(),
        /* 【新目标①】左窗格立绘：#pv-portrait 是抽帧 <img> 还是旧的 DOM 拼装（马赛克/宽图） */
        portrait: (function () {
          var el = document.getElementById('pv-portrait');
          if (!el) return null;
          var tag = el.tagName || '?';
          var r = null;
          try { var b = el.getBoundingClientRect(); var st = document.getElementById('stage').getBoundingClientRect();
                var sc = st.width / 1280 || 1;
                r = [+((b.left - st.left) / sc).toFixed(1), +((b.top - st.top) / sc).toFixed(1),
                     +(b.width / sc).toFixed(1), +(b.height / sc).toFixed(1)]; } catch (eP) {}
          return { tag: tag, src: el.src ? String(el.src).split('/').slice(-2).join('/') : null,
                   natural: el.naturalWidth ? (el.naturalWidth + 'x' + el.naturalHeight) : null,
                   rect: r, kids: el.children ? el.children.length : 0 };
        })(),
        /* 【参考抽帧贴图】hx 段是否就绪、当前帧号、图有没有加载进来（figure = 抽出的是哪一块） */
        hx: (function () {
          if (!PV.hx) return null;
          var out = {};
          var segs = PV.hx.seg || {};
          for (var nm in segs) {
            if (!Object.prototype.hasOwnProperty.call(segs, nm)) continue;
            var i = PV.hx.idx(nm, PV.t);
            out[nm] = { n: segs[nm].n, i: i, box: [segs[nm].x, segs[nm].y, segs[nm].w, segs[nm].h],
                        img: !!(i >= 0 && PV.hx.img(nm, i)) };
          }
          return out;
        })(),
        h3: (function () {
          if (!PV.h3) return null;
          var loaded = 0;
          for (var q = 0; q < 23; q++) { try { if (PV.h3.img(q)) loaded++; } catch (e4) {} }
          var f = null, cells = null, hh = 0;
          try { f = PV.h3.frame(PV.h3.now()); } catch (e5) {}
          try { cells = PV.h3.cells(PV.h3.now(), 'face', 130, 87); } catch (e6) {}
          if (cells && cells.lum) for (var i5 = 0; i5 < cells.lum.length; i5 += 7) hh = (hh * 31 + Math.round(cells.lum[i5] * 4)) | 0;
          return { T: +(PV.h3.now() || 0).toFixed(3), k: f ? f.k : null, k2: f ? f.k2 : null, cut: f ? f.cut : null,
                   take: f ? f.take : null, i: f ? f.i : null, loaded: loaded,
                   cells: cells ? (cells.cols + 'x' + cells.rows) : String(cells), hash: hh };
        })(),
      }) });
    });
  }
  /* 后端指定模式：GET /want（只有本地 serve.py 有；线上 404 -> 静默忽略）。
     我把时刻写进 pvport/caps/WANT.txt，页面下次自动 reload 时就会自己把这批时刻拍回来 ——
     用户不用改地址、不用动手。 */
  function wantCapture() {
    var q = new URLSearchParams(location.search);
    if (q.has('capt')) return false;
    fetch('/want?_=' + Date.now(), { cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error('no want');
      return r.text();
    }).then(function (s) {
      s = String(s).trim();
      if (!s) return;
      /* 清单支持三种行：数字列表=截屏 / probe=…=只回 DOM 计算值 / drift=开音画采样 */
      var caps = [], probes = [], wantDrift = false;
      s.split(/[\n;]+/).forEach(function (line) {
        line = line.trim();
        if (!line) return;
        var mp = /^probe\s*[:=]\s*(.*)$/i.exec(line);
        if (mp) { probes = probes.concat(mp[1].split(',').map(parseFloat).filter(function (x) { return !isNaN(x); })); return; }
        if (/^drift/i.test(line)) { wantDrift = true; return; }
        if (/^[0-9.,\s]+$/.test(line)) caps = caps.concat(line.split(',').map(parseFloat).filter(function (x) { return !isNaN(x); }));
      });
      if (wantDrift) driftArm(0);   /* 后端开的采样：只要在播就一直采，文件固定、只留最后一条 */
      if (probes.length) probeOnly(probes);
      if (caps.length) runCapture(caps);
    }).catch(function () {});
    return true;
  }
  /* 截屏期间要把画面钉在 PV.t 上（app.js:164 的 tq = PV.hold ? PV.t : ...），
     但 PV.hold **必须还回去** ✗ —— 旧版进来就 hold=true 且从不复位，只要这条链卡住
     （后台标签页 rAF 会被冻），页面就永久停在最后一帧，用户看到的是「画面卡死」✗。
     所以：只在真要拍的那一拍 hold，收工/中止一律还原。 */
  var prevHold = false, capAbort = false;
  /* 贴图到货了吗？（绘制是同步的，贴图是异步的 —— 不等就会拍成替身 ✗）*/
  function plateMissing(t) {
    if (!PV.hx || !PV.hx.ready) return false;
    var segs = PV.hx.seg || {};
    for (var nm in segs) {
      if (!Object.prototype.hasOwnProperty.call(segs, nm)) continue;
      var ii = PV.hx.idx(nm, t);
      if (ii >= 0 && ii < segs[nm].n && !PV.hx.img(nm, ii)) return true;
    }
    return false;
  }
  function runCapture(list) {
    if (!list.length) return;
    prevHold = !!PV.hold;
    capAbort = false;
    /* 【2026-10-05】先把参考抽帧贴图整段预热（异步），否则拍的那一瞬同步绘制拿不到图、
       会回退成代码画的替身立绘 ✗ —— 服务器里那批 cap_*_nocap.png 全是这么错过去的。 */
    try { if (PV.hx && PV.hx.warmAll) PV.hx.warmAll(); } catch (eW) {}
    var i = 0, tries = 0;
    function next() {
      if (capAbort || i >= list.length) {
        PV.hold = prevHold;
        window.PV_H3_QUIET = false;
        if (!capAbort) document.title = 'cap-done ' + list.length;
        return;
      }
      var t = list[i];
      PV.t = Math.floor(t * 24) / 24;
      PV.hold = true;
      /* 没到货就重来这一拍（**不推进 i** ✗），期间静默 H3 预取（每帧 ~35 张会抢光连接 ✗）*/
      if (tries < 24 && plateMissing(PV.t)) {
        window.PV_H3_QUIET = true;
        tries++;
        setTimeout(next, 250);
        return;
      }
      tries = 0;
      window.PV_H3_QUIET = false;
      i++;
      requestAnimationFrame(function () { requestAnimationFrame(function () {
        PV.capture('cap_' + t.toFixed(2)).then(function () { setTimeout(next, 150); }, function () { setTimeout(next, 150); });
      }); });
    }
    setTimeout(next, 600);
  }

  /* 自动刷新（后端改代码 -> 前端自己换版本并重跑截屏）：
     ?auto=<秒> 无条件定时 reload；带 ?capt= 时默认开启——每 2s 问一次 /stamp，源码指纹一变就 reload。
     /stamp 只有本地 serve.py 有，线上 GitHub Pages 会 404，静默忽略。 */
  function autoReload() {
    var q = new URLSearchParams(location.search);
    var sec = parseFloat(q.get('auto') || '0');
    if (sec > 0) { setInterval(function () { location.reload(); }, Math.max(3, sec) * 1000); return; }
    /* 【2026-10-05】原来这里 `if (!q.has('capt')) return;` —— 正常播放（不带 ?capt=）时**不轮询** ✗，
       于是改了 js 之后页面不会自己换版本，每次都要用户手动刷新。改成常态轮询：
       /stamp 只有本地 serve.py 有（线上 404 -> 静默忽略），指纹一变就 reload。 */
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
  /* 前后台切换：后台标签页里 rAF 与定时器都会被浏览器冻结 ✗，截屏链注定卡住 ——
     进后台就中止这一轮并把 PV.hold 还回去（别把画面钉死）；回前台立刻重问一次 /want，
     探针（probe=…）是同步的、不用 rAF，所以这一下就能出数，用户只需把页面拿到前台。 */
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      capAbort = true;
      PV.hold = prevHold;
    } else {
      capAbort = false;
      try { wantCapture(); } catch (e) {}
    }
  });
  function boot() {
    if (wantCapture()) return;                 /* 没有 ?capt= 时先问后端 /want（本地 server 才有）*/
    var q = new URLSearchParams(location.search);
    if (!q.has('capt')) return;
    runCapture(q.get('capt').split(',').map(parseFloat).filter(function (x) { return !isNaN(x); }));
  }
  function waitReady() {
    if (PV.readyFlag) { boot(); return; }
    setTimeout(waitReady, 200);
  }
  waitReady();
})();

