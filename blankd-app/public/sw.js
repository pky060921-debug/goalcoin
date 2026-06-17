// 💡 [자폭 모드] 브라우저에 남아있는 캐시와 서비스 워커를 강제로 삭제하고 해제합니다.
self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((name) => {
          console.log("🗑️ 불량 오프라인 캐시 삭제됨:", name);
          return caches.delete(name);
        })
      );
    }).then(() => {
      console.log("💣 서비스 워커 자폭(등록 해제) 완료");
      self.registration.unregister();
    })
  );
});
