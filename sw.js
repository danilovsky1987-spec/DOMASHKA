/* Бортовой журнал — офлайн.
   Кладёт сайт в память браузера, чтобы он открывался без интернета.
   При появлении сети сам берёт свежую версию страницы.
   Меняете index.html — поднимите номер версии ниже, иначе старые файлы
   останутся в памяти у тех, кто уже открывал сайт. */

const VERSION = "bortovoy-2026-11-13a";

const CORE = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icon.svg",
  "./icon-192.png",
  "./icon-512.png"
];

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(VERSION)
      .then(async c => {
        // A new worker may replace the old cache only after a usable page is saved.
        const page = await fetch(new Request("./index.html", {cache:"reload"}));
        if (!page.ok) throw new Error("Journal unavailable: " + page.status);
        await c.put("./index.html", page.clone());
        await c.put("./", page);
        await Promise.all(CORE.slice(2).map(u => c.add(u).catch(() => null)));
      })
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith("bortovoy-") && k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;

  /* Мимо кэша — всё, что не наш сайт и не шрифты.
     Прежде всего обмен с сервером синхронизации: ниже стоит «сначала память,
     потом сеть», и первый же ответ сервера осел бы в кэше навсегда. Журнал
     перестал бы получать отметки с другого устройства и молча показывал бы
     старое. Отправка (PUT) сюда не доходит, а вот чтение (GET) доходило бы. */
  let host = "";
  try { host = new URL(req.url).origin; } catch (err) { host = ""; }
  const ours = host === self.location.origin
    || req.url.indexOf("https://fonts.googleapis.com") === 0
    || req.url.indexOf("https://fonts.gstatic.com") === 0;
  if (!ours) return;

  /* сама страница: сначала сеть (чтобы приходили обновления), при отказе — память */
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req)
        .then(res => {
          if (!res.ok) throw new Error("Journal unavailable: " + res.status);
          const copy = res.clone();
          caches.open(VERSION).then(c => c.put("./index.html", copy));
          return res;
        })
        .catch(() => caches.match("./index.html").then(hit => hit || caches.match("./")))
    );
    return;
  }

  /* всё остальное — шрифты, иконки: сначала память, потом сеть */
  e.respondWith(
    caches.match(req).then(hit => {
      if (hit) return hit;
      return fetch(req).then(res => {
        if (res && res.status === 200 && (res.type === "basic" || res.type === "cors")) {
          const copy = res.clone();
          caches.open(VERSION).then(c => c.put(req, copy));
        }
        return res;
      }).catch(() => hit);
    })
  );
});
