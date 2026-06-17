const CACHE_NAME = 'blankd-offline-cache-v1';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // 앱을 구동하기 위한 최소한의 기본 뼈대만 캐싱합니다.
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
  // API 요청은 캐싱하지 않고 네트워크 또는 앱 내부의 LocalStorage 로직에 맡깁니다.
  if (event.request.url.includes('/api/')) {
    return;
  }
  
  // 일반 앱 UI 에셋은 캐시 우선, 없으면 네트워크에서 가져옵니다.
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request).then(fetchRes => {
        return caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, fetchRes.clone());
          return fetchRes;
        });
      });
    }).catch(() => {
      // 완벽한 오프라인 상태일 때 기본 index.html 반환
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
