"use client";

import { useEffect } from 'react';

export default function ServiceWorkerRegistration() {
    useEffect(() => {
        if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
            return;
        }

        // Service Worker 상태 모니터링 핸들러
        const handleControllerChange = () => {
            console.log('Service Worker 컨트롤러 변경됨');
        };

        // Service Worker 등록 (재시도 로직 포함)
        const registerServiceWorker = async () => {
            try {
                // 기존 등록 확인
                const existingRegistration = await navigator.serviceWorker.getRegistration();
                
                if (existingRegistration) {
                    // 이미 등록된 경우 업데이트 확인
                    console.log('Service Worker 이미 등록됨:', existingRegistration.scope);
                    
                    // 활성화된 Service Worker 확인
                    if (existingRegistration.active) {
                        console.log('Service Worker 활성화됨');
                    } else if (existingRegistration.installing) {
                        console.log('Service Worker 설치 중...');
                    } else if (existingRegistration.waiting) {
                        console.log('Service Worker 대기 중...');
                    }
                    
                    // 업데이트 확인
                    try {
                        await existingRegistration.update();
                    } catch (updateError) {
                        console.warn('Service Worker 업데이트 실패:', updateError);
                    }
                    return;
                }

                // 새로 등록
                const registration = await navigator.serviceWorker.register('/sw.js', {
                    scope: '/',
                });
                console.log('Service Worker 등록 성공:', registration.scope);

                // Service Worker 상태 모니터링
                navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);

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
                    // invalid state 에러는 잠시 후 재시도
                    console.warn('Service Worker 등록 재시도 중...');
                    setTimeout(() => {
                        registerServiceWorker().catch(() => {
                            // 재시도 실패는 조용히 처리
                        });
                    }, 2000);
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
            setTimeout(registerServiceWorker, 500);
        };

        if (document.readyState === 'complete') {
            handleLoad();
        } else {
            window.addEventListener('load', handleLoad);
        }

        return () => {
            window.removeEventListener('load', handleLoad);
            // Service Worker 이벤트 리스너 제거
            navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
        };
    }, []);

    return null;
}

