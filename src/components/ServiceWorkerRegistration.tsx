"use client";

import { useEffect } from 'react';

export default function ServiceWorkerRegistration() {
    useEffect(() => {
        if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
            return;
        }

        // Service Worker 등록 (재시도 로직 포함)
        const registerServiceWorker = async () => {
            try {
                // 직접 등록 시도 (getRegistration은 에러를 발생시킬 수 있음)
                const registration = await navigator.serviceWorker.register('/sw.js', {
                    scope: '/',
                });
                console.log('Service Worker 등록 성공:', registration.scope);

                // Service Worker 상태 모니터링
                navigator.serviceWorker.addEventListener('controllerchange', () => {
                    console.log('Service Worker 컨트롤러 변경됨');
                });

                // 업데이트 확인 (백그라운드)
                registration.update().catch(() => {
                    // 업데이트 실패는 무시 (이미 등록됨)
                });
            } catch (error: any) {
                console.error('Service Worker 등록 실패:', error);
                // 에러 상세 정보 출력 (디버깅용)
                if (error.message) {
                    console.error('에러 메시지:', error.message);
                }
                // 특정 에러는 재시도하지 않음 (invalid state 등)
                const errorMessage = error.message || '';
                if (errorMessage.includes('invalid state') || errorMessage.includes('document')) {
                    console.warn('Service Worker 등록이 현재 상태에서 불가능합니다. 페이지 새로고침 후 다시 시도하세요.');
                    return;
                }
                // 네트워크 에러인 경우에만 재시도
                if (errorMessage.includes('network') || errorMessage.includes('fetch') || errorMessage.includes('Failed to fetch')) {
                    console.log('네트워크 에러 감지, 3초 후 재시도...');
                    setTimeout(registerServiceWorker, 3000);
                }
            }
        };

        // 페이지가 완전히 로드된 후 등록 시도
        const handleLoad = () => {
            // 약간의 지연을 두어 DOM이 완전히 준비되도록 함
            setTimeout(registerServiceWorker, 100);
        };

        if (document.readyState === 'complete') {
            handleLoad();
        } else {
            window.addEventListener('load', handleLoad);
        }

        return () => {
            window.removeEventListener('load', handleLoad);
        };
    }, []);

    return null;
}

