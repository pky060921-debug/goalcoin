const CACHE_NAME = 'blankd-offline-cache-v3';

// 설치 시 즉시 활성화
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

// 기존에 꼬여버린 낡은 캐시 저장소 완벽하게 파괴
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // 1. GET 요청이 아니면 무조건 캐시 통과
  if (event.request.method !== 'GET') return;
  
  // 2. 외부 도메인(구글 로그인, 블록체인 통신 등) 및 API 요청은 절대 건드리지 않음
  if (!event.request.url.startsWith(self.location.origin) || event.request.url.includes('/api/')) {
    return; 
  }

  // 3. 네트워크 우선 (Network First) 전략: 무조건 서버에서 최신 화면을 먼저 가져옴
  event.respondWith(
    fetch(event.request).then(fetchRes => {
      return caches.open(CACHE_NAME).then(cache => {
        cache.put(event.request, fetchRes.clone());
        return fetchRes;
      });
    }).catch(() => {
      // 4. 인터넷이 끊겼을 때만(오프라인) 캐시에서 꺼내 보여줌
      return caches.match(event.request).then(res => {
        if (res) return res;
        if (event.request.mode === 'navigate') {
          return caches.match('/index.html');
        }
      });
    })
  );
});
