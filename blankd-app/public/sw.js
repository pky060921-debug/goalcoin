const CACHE_NAME = 'blankd-offline-cache-v2';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll([
        '/',
        '/index.html',
        '/manifest.json'
      ]);
    }).catch(err => console.error("SW 캐싱 실패:", err))
  );
  self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  // 💡 [수정] POST 요청(API, 블록체인 RPC 등)은 절대 캐시하지 않고 그대로 통과시킵니다.
  if (event.request.method !== 'GET') {
    return;
  }

  // API 서버 통신도 캐시하지 않습니다.
  if (event.request.url.includes('/api/')) {
    return;
  }
  
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request).then(fetchRes => {
        return caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, fetchRes.clone());
          return fetchRes;
        });
      });
    }).catch(() => {
      if (event.request.mode === 'navigate') {
        return caches.match('/index.html');
      }
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});
