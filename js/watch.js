/* watch 模式：?watch=1 —— 每 2.5 秒向服务器要一次截图任务，渲染后把 PNG 传回去。
   让手机浏览器当成一台可远程驱动的渲染机。 */
(function () {
  var q = new URLSearchParams(location.search);
  if (!q.has('watch')) return;
  var PV = window.PV;
  function report(msg) {
    try { fetch('/report', { method: 'POST', body: new Date().toISOString().slice(11, 19) + ' ' + msg }); } catch (e) {}
  }
  window.addEventListener('error', function (e) {
    report('JSERR ' + (e.message || '?') + ' @' + String(e.filename || '').split('/').pop() + ':' + (e.lineno || 0));
  });
  try {
    var mc = document.createElement('canvas').getContext('2d');
    mc.font = '17px ' + PV.tui.MONO_FAM;
    var probes = [];
    ['monospace', 'ui-monospace', '\'Droid Sans Mono\'', '\'Roboto Mono\'', '\'Noto Sans Mono\'', '\'DejaVu Sans Mono\'', 'SpaceMono'].forEach(function (f) {
      mc.font = '17px ' + f;
      probes.push(f + '=' + mc.measureText('M').width.toFixed(1));
    });
    mc.font = '17px ' + PV.tui.MONO_FAM;
    report('load resolved=' + mc.font + ' k=' + PV.tui.monoScale(mc, 17).toFixed(3) + ' | ' + probes.join(' '));
  } catch (e) { report('load fontprobe fail ' + e.message); }
  var busy = false;
  function shot(t, name) {
    busy = true;
    PV.hold = true;
    var tq = Math.floor(t * PV.FPS) / PV.FPS;
    try { PV.draw(tq); } catch (e) { report('DRAW FAIL t=' + tq + ' ' + (e && e.message)); busy = false; PV.hold = false; return; }
    if (PV.sync) PV.sync(tq);
    report('drew t=' + tq + ' err=' + (PV.sceneErr ? 'scene' : '') + (PV.chromeErr ? 'chrome' : '') + (PV.stateErr ? 'state' : ''));
    PV.screen.style.visibility = 'visible';
    PV.shotTime = tq;
    setTimeout(function () {
      PV.screenEl = PV.screenEl || document.getElementById('stage');
      var cv = document.getElementById('stage');
      cv.toBlob(function (b) {
        if (!b) { busy = false; PV.hold = false; return; }
        fetch('/save?name=' + encodeURIComponent(name), { method: 'POST', body: b })
          .then(function () { report('saved ' + name); busy = false; PV.hold = false; })
          .catch(function (e) { report('SAVE FAIL ' + name + ' ' + e); busy = false; PV.hold = false; });
      }, 'image/png');
    }, 60);
  }
  function poll() {
    if (busy) return;
    fetch('/next', { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (d) {
      if (d && d.ver) {
        if (!PV.ver) PV.ver = d.ver;
        else if (PV.ver !== d.ver) { location.reload(); return; }
      }
      var js = (d && d.jobs) || [];
      if (!js.length) return;
      var i = 0;
      (function step() {
        if (i >= js.length) return;
        var j = js[i++];
        shot(j.t, j.name);
        setTimeout(step, 900);
      })();
    }).catch(function () {});
  }
  setInterval(poll, 2500);
  document.title = 'pv-live watch';
})();
