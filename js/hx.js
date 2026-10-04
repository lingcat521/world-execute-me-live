/* hx.js —— 参考成片直接抽帧的逐帧贴图（素材在 data/hx/<name>/NNN.webp，索引在 data/hx/manifest.js）。
   动机：影片里「她的真舞姿」原始 take **不在仓库里**（cache/h3_full_v1/_standin.json 列明全部 16 个
   take 都是 tools/placeholder_h3.py 写的替身，动作只是「每小节左右轻摆」），而参考成片里带着
   **真动作的渲染结果** —— 直接从 video1.mp4 抽帧即可。
   视频是 1280x720 母版的 1.5 倍，而浏览器 RES 默认也是 1.5 -> 贴图按原生像素存，
   画到画布上正好 1:1，不经过二次重采样。
   坐标一律 1280x720 母版空间；manifest 里另存视频像素空间的 sx/sy 供核对。
   用法：PV.hx.img('happy', i) 取第 i 帧（未加载完返回 null -> 调用点回退到代码画的版本）。 */
(function () {
  'use strict';
  var PV = window.PV; if (!PV) return;
  var SEG = (window.HX && window.HX.seg) || {};
  var IMG = {}, WANT = {}, Q = [], CAP = 24;
  /* 【2026-10-05 实测】CAP=24 太小：播放时 tick 每帧要预热 9 张 pet（24fps），画布贴图
     （tiles/glyph78/happy/domclimax）刚加载好就被挤出去 -> 绘制那一刻 img() 返回 null ->
     整块贴图不画（浏览器实测 cap_165.00 的格子区差 18.5，而 node 单帧渲染因为没 churn 是好的 ✗）。
     所以：**画布贴图（非 dom 段）一律不淘汰**，只有 dom 素材（pet）互挤。
     每个画布段只在它自己的时段加载，同时在场的通常只有一段（几 MB），可接受。 */
  function segOf(k) { var i = String(k).indexOf('/'); return i < 0 ? '' : String(k).slice(0, i); }
  var lastT = 0;
  function segActive(nm) {
    var s = SEG[nm]; if (!s) return false;
    var end = s.t0 + s.n / (s.fps || 24);
    return lastT >= s.t0 - 2 && lastT <= end + 2;
  }
  /* 只钉住「当前时段在场」的画布段：早先那种「一律不淘汰」会在长段落上吃 GB 级内存
     （exec_hit 11 秒 266 帧 x 798x798x4 ≈ 2.5GB ✗）。之外的（含 dom 素材）都可淘汰。 */
  function evictable(k) { var nm = segOf(k); var s = SEG[nm]; if (!s) return true; return !segActive(nm); }
  function path(name, i) {
    var s = SEG[name]; if (!s) return null;
    if (i < 0 || i >= s.n) return null;
    var pad = s.pad || 3, f = String(i);
    while (f.length < pad) f = '0' + f;
    return 'data/hx/' + name + '/' + f + '.webp';
  }
  function load(name, i) {
    var k = name + '/' + i;
    if (IMG[k] || WANT[k]) return;
    var p = path(name, i); if (!p || !PV.loadImage) return;
    WANT[k] = 1;
    PV.loadImage(p, function (im) {
      try {
        delete WANT[k];
        if (!im) return;
        IMG[k] = im; Q.push(k);
        if (Q.length > CAP) {
          var o = Q.shift();
          if (o !== k && evictable(o)) delete IMG[o];
          else if (o !== k) Q.push(o);            /* 画布贴图留着，挪到队尾再排 */
        }
      } catch (eCb) { PV.hxCbErr = eCb; }        /* 回调里抛错会变成 Script error @:0:0 ✗ */
    });
  }
  PV.hx = {
    seg: SEG,
    idx: function (name, t) { var s = SEG[name]; if (!s) return -1; return Math.round((t - s.t0) * (s.fps || 24)); },
    img: function (name, i) {
      var s = SEG[name]; if (!s || i < 0 || i >= s.n) return null;
      var k = name + '/' + i;
      if (IMG[k]) return IMG[k];
      load(name, i);
      for (var q = 1; q <= 4; q++) load(name, i + q);
      return null;
    },
    ready: function (name) { return !!(SEG[name] && SEG[name].n > 0); },
    /* 只要**路径**、不要求图片已解码 —— DOM 的 <img src> 用这个就够了 ✓
       （用 PV.hx.img 的话，第一次调用只发起加载、返回 null，会白白回退到旧素材 ✗）。 */
    url: function (name, i) { return path(name, i); },
    /* 通用后置贴图：场景画完后，把覆盖当前时刻的每一段整块覆盖上去。
       这样新增段落**只要抽帧 + 写进 manifest**，不用再改镜头代码 ✓
       （已在镜头内接线的段也覆盖一次：幂等，代价一次 drawImage）。 */
    post: function (ctx, t) {
      for (var nm in SEG) {
        if (!Object.prototype.hasOwnProperty.call(SEG, nm)) continue;
        var s = SEG[nm]; if (!s) continue;
        if (s.dom) continue;                       /* dom:1 = 只给 DOM 用的素材（如 .pv-pet 头像），不画布 */
        var end = s.t0 + s.n / (s.fps || 24);
        if (t < s.t0 - 0.5 || t > end + 0.5) continue;
        var i = Math.round((t - s.t0) * (s.fps || 24));
        if (i < 0 || i >= s.n) continue;
        var im = PV.hx.img(nm, i);
        if (im) { try { ctx.drawImage(im, s.x, s.y, s.w, s.h); } catch (e) {} }
      }
    },
    warm: function (name, i0, cnt) { for (var q = 0; q < (cnt || 8); q++) load(name, (i0 || 0) + q); },
    /* 截屏/探针前把整段拉下来：拍的那一瞬是同步绘制的，异步加载赶不上 ✗（服务器里存的
       浏览器截图因此都回退成了女仆 ✗）。段都很短（happy 44 帧 3.6MB），全量预热可接受。 */
    /* 【2026-10-05 用户报「一加载就是几百 MB」】原来是 warmAll()：把**全片所有段**都拉下来
       （hx 一共 ~140MB + pet 5085 张），只要 WANT.txt 里排了一条截屏指令，每次刷新都要重下。
       改成只暖「拍摄时刻前后各 3 秒」的段 —— 截屏只需要那一拍有图 ✓ */
    warmRange: function (t0, t1) {
      for (var nm in SEG) {
        if (!Object.prototype.hasOwnProperty.call(SEG, nm)) continue;
        var s = SEG[nm]; if (!s) continue;
        var end = s.t0 + s.n / (s.fps || 24);
        if (end < t0 - 3 || s.t0 > t1 + 3) continue;
        var i0 = Math.max(0, Math.floor((t0 - s.t0) * (s.fps || 24)) - 4);
        var i1 = Math.min(s.n - 1, Math.ceil((t1 - s.t0) * (s.fps || 24)) + 4);
        for (var i = i0; i <= i1; i++) load(nm, i);
      }
    },
    /* 兼容旧调用：不给范围就按当前播放头暖 ±3 秒 */
    warmAll: function () { this.warmRange(lastT - 3, lastT + 3); },
    /* 预热必须**提前**：加载是异步的，画的那一 tick 拿不到图就会回退到代码版本 ✗。
       每帧调一次 tick(t)：段前 3 秒开始热身、段内向前热身 8 帧（约 0.33s）。 */
    tick: function (t) {
      lastT = t;
      for (var nm in SEG) {
        if (!Object.prototype.hasOwnProperty.call(SEG, nm)) continue;
        var s = SEG[nm], end = s.t0 + s.n / (s.fps || 24);
        if (t < s.t0 - 3 || t > end + 0.5) continue;
        var i = Math.round((t - s.t0) * (s.fps || 24));
        if (i < 0) { load(nm, 0); load(nm, 1); continue; }
        for (var q = 0; q <= 8; q++) load(nm, i + q);
      }
    }
  };
})();

