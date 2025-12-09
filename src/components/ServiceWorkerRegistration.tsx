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
                // 기존 Service Worker 확인 및 업데이트
                const registration = await navigator.serviceWorker.getRegistration();
                if (registration) {
                    // 이미 등록된 경우 업데이트 확인
                    await registration.update();
                    console.log('Service Worker 업데이트 확인:', registration.scope);
                } else {
                    // 새로 등록
                    const newRegistration = await navigator.serviceWorker.register('/sw.js', {
                        scope: '/',
                    });
                    console.log('Service Worker 등록 성공:', newRegistration.scope);
                }

                // Service Worker 상태 모니터링
                navigator.serviceWorker.addEventListener('controllerchange', () => {
                    console.log('Service Worker 컨트롤러 변경됨');
                    window.location.reload();
                });
            } catch (error: any) {
                console.error('Service Worker 등록 실패:', error);
                // 에러 상세 정보 출력 (디버깅용)
                if (error.message) {
                    console.error('에러 메시지:', error.message);
                }
                // 네트워크 에러인 경우 재시도
                if (error.message?.includes('network') || error.message?.includes('fetch')) {
                    console.log('네트워크 에러 감지, 3초 후 재시도...');
                    setTimeout(registerServiceWorker, 3000);
                }
            }
        };

        // 페이지 로드 완료 후 등록 시도
        if (document.readyState === 'complete') {
            registerServiceWorker();
        } else {
            window.addEventListener('load', registerServiceWorker);
        }

        return () => {
            window.removeEventListener('load', registerServiceWorker);
        };
    }, []);

    return null;
}

