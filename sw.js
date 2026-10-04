/* pv-live/sw.js —— 素材缓存（Service Worker）
   问题：整片素材（hx 逐帧贴图 ~140MB + data/h3 帧池 ~46MB + avatars ~15MB）冷启动一次要几百 MB，
   网速不够时根本播不动；GitHub Pages 只给 max-age=600，掐着时间重下。
   做法：**只缓存素材**（data/ avatars/ assets/ fonts/），缓存优先、命中就直接返回，不再走网络；
   代码与 HTML 一律不拦（autoReload / stamp 轮询还要看得见新版本）。
   注意：SW 只在 https 或 localhost 生效；线上是 GitHub Pages（https ✓）。 */
var VER = 'pv-assets-v4';
/* 只缓存**大块二进制素材**：webp/mp3/bin/css。json 不缓存 —— data/precache.json 会随素材变化重生成，
   缓存住就永远是旧索引（?v= 也救不了 SW 的 cache-first）。 */
var ASSET = /^\/(data|avatars|assets|fonts)\/[^?]*\.(webp|mp3|bin|css)$/i;

self.addEventListener('install', function () { self.skipWaiting(); });

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.map(function (k) {
      return (k.indexOf('pv-assets-') === 0 && k !== VER) ? caches.delete(k) : null;
    }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var u;
  try { u = new URL(req.url); } catch (err) { return; }
  if (u.origin !== self.location.origin) return;
  if (!ASSET.test(u.pathname)) return;              /* 代码/HTML/JSON 不拦 */
  e.respondWith(caches.open(VER).then(function (c) {
    return c.match(req, { ignoreSearch: true }).then(function (hit) {
      if (hit) return hit;
      return fetch(req).then(function (res) {
        if (res && res.ok && res.status === 200) { try { c.put(req, res.clone()); } catch (err) {} }
        return res;
      });
    });
  }));
});

