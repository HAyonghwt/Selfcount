// Service Worker for PWA
const CACHE_NAME = 'parkscore-v1';
const urlsToCache = [
  '/',
  '/icon-192x192.png',
  '/icon-512x512.png',
];

// Install event - 캐시 저장 (실패해도 Service Worker는 활성화)
self.addEventListener('install', (event) => {
  console.log('Service Worker 설치 중...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('캐시 열기 성공');
        // 캐시 추가 실패해도 Service Worker는 활성화되도록 처리
        return cache.addAll(urlsToCache).catch((error) => {
          console.warn('일부 리소스 캐시 실패 (계속 진행):', error);
          // 일부 리소스만 캐시해도 계속 진행
          return Promise.resolve();
        });
      })
      .then(() => {
        console.log('Service Worker 설치 완료');
        // 즉시 활성화 (skipWaiting)
        return self.skipWaiting();
      })
      .catch((error) => {
        console.error('Service Worker 설치 중 오류:', error);
        // 에러가 발생해도 Service Worker는 활성화
        return self.skipWaiting();
      })
  );
});

// Activate event - 오래된 캐시 삭제 및 클라이언트 제어 권한 획득
self.addEventListener('activate', (event) => {
  console.log('Service Worker 활성화 중...');
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== CACHE_NAME) {
              console.log('오래된 캐시 삭제:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(() => {
        console.log('Service Worker 활성화 완료');
        // 모든 클라이언트에 즉시 제어 권한 획득
        return self.clients.claim();
      })
      .catch((error) => {
        console.error('Service Worker 활성화 중 오류:', error);
        // 에러가 발생해도 클라이언트 제어 권한 획득 시도
        return self.clients.claim();
      })
  );
});

// Fetch event - 네트워크 우선, 캐시 폴백
self.addEventListener('fetch', (event) => {
  // GET 요청만 처리
  if (event.request.method !== 'GET') {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // 유효한 응답만 캐시에 저장
        if (response && response.status === 200 && response.type === 'basic') {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache).catch((error) => {
              console.warn('캐시 저장 실패:', error);
            });
          });
        }
        return response;
      })
      .catch(() => {
        // 네트워크 실패 시 캐시에서 반환
        return caches.match(event.request);
      })
  );
});

