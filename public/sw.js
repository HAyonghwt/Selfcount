// Service Worker for PWA
const CACHE_NAME = 'parkscore-v5';
const urlsToCache = [
  '/',
  '/icon-192x192.png',
  '/icon-512x512.png',
];

// Install event - 캐시 저장 (실패해도 Service Worker는 활성화)
self.addEventListener('install', (event) => {
  console.log('Service Worker 설치 중...');
  // 즉시 활성화 (skipWaiting)
  self.skipWaiting();

  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('캐시 열기 성공');
        // 캐시 추가는 비동기로 처리 (실패해도 계속 진행)
        cache.addAll(urlsToCache).catch((error) => {
          console.warn('일부 리소스 캐시 실패 (계속 진행):', error);
        });
        return Promise.resolve();
      })
      .then(() => {
        console.log('Service Worker 설치 완료');
      })
      .catch((error) => {
        console.error('Service Worker 설치 중 오류:', error);
        // 에러가 발생해도 Service Worker는 활성화
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
  const requestUrl = new URL(event.request.url);

  // 외부 스킴(chrome-extension://, moz-extension:// 등)은 처리하지 않음
  if (requestUrl.protocol !== 'http:' && requestUrl.protocol !== 'https:') {
    return; // 외부 스킴은 그대로 통과 (Service Worker가 처리하지 않음)
  }

  // GET 요청만 처리
  if (event.request.method !== 'GET') {
    return; // GET이 아닌 요청은 그대로 통과
  }

  // 매니페스트 API는 캐싱하지 않음 (항상 최신 데이터 사용)
  if (requestUrl.pathname.startsWith('/api/manifest')) {
    return; // 매니페스트는 캐시 없이 그대로 통과
  }

  // 같은 origin의 요청만 캐시 처리
  const isSameOrigin = requestUrl.origin === self.location.origin;

  // 네트워크 우선, 실패 시 캐시 사용
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // 유효한 응답만 캐시에 저장
        if (isSameOrigin && response && response.status === 200 && response.type === 'basic') {
          // 캐시 저장은 비동기로 처리 (응답 지연 방지)
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache).catch((error) => {
              // 캐시 저장 실패는 조용히 처리
              if (!error.message?.includes('chrome-extension') &&
                !error.message?.includes('moz-extension')) {
                console.warn('캐시 저장 실패:', error);
              }
            });
          });
        }
        return response;
      })
      .catch((error) => {
        // 네트워크 실패 시 같은 origin의 요청만 캐시에서 반환
        if (isSameOrigin) {
          return caches.match(event.request).then((cachedResponse) => {
            if (cachedResponse) {
              return cachedResponse;
            }
            // 캐시에도 없으면 네트워크 에러 반환
            return Promise.reject(error);
          });
        }
        // 외부 요청은 그대로 실패 반환
        return Promise.reject(error);
      })
  );
});

