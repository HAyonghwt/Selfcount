"use client";

import { useEffect, useState } from 'react';
import { db, auth, onAuthStateChange } from '@/lib/firebase';
import { ref, onValue, get } from 'firebase/database';

export default function AppNameUpdater() {
    const [appName, setAppName] = useState('');
    const [lastManifestAppName, setLastManifestAppName] = useState<string | null>(null);

    useEffect(() => {
        // PWA 설치 여부 확인 (standalone 모드로 실행 중인지 확인)
        const isStandalone = window.matchMedia('(display-mode: standalone)').matches || 
                           (window.navigator as any).standalone === true ||
                           document.referrer.includes('android-app://');

        const updateAppName = (name: string) => {
            // 단체 이름이 있으면 그대로 사용, 없으면 빈 문자열
            const finalName = name && name.trim() ? name.trim() : '';
            
            // 앱 이름 형식: "{단체이름}대회앱" (단체 이름이 없으면 "대회앱"만)
            const appTitle = finalName ? `${finalName}대회앱` : '대회앱';
            
            setAppName(finalName);

            // document.title 업데이트
            document.title = appTitle;

            // apple-mobile-web-app-title meta 태그 업데이트
            let metaTag = document.querySelector('meta[name="apple-mobile-web-app-title"]');
            if (!metaTag) {
                metaTag = document.createElement('meta');
                metaTag.setAttribute('name', 'apple-mobile-web-app-title');
                document.head.appendChild(metaTag);
            }
            metaTag.setAttribute('content', appTitle);

            // manifest 링크 업데이트 (쿼리 파라미터로 appName 전달)
            // PWA가 설치된 상태에서도 manifest가 올바른 appName을 반환하도록 항상 업데이트
            const updateManifestLink = () => {
                let manifestLink = document.querySelector('link[rel="manifest"]') as HTMLLinkElement;
                if (manifestLink) {
                    // 이전 manifest appName과 비교하여 실제로 변경된 경우에만 업데이트
                    const encodedAppName = finalName ? encodeURIComponent(finalName) : '';
                    const appNameParam = finalName ? `appName=${encodedAppName}` : '';
                    const newHref = `/api/manifest${appNameParam ? '?' + appNameParam : ''}`;
                    
                    // appName이 실제로 변경되었을 때만 업데이트
                    if (lastManifestAppName !== encodedAppName) {
                        manifestLink.href = newHref;
                        setLastManifestAppName(encodedAppName);
                        
                        // PWA 설치 상태가 아닐 때만 로그 출력 (설치된 경우 조용히 처리)
                        if (!isStandalone) {
                            console.log('Manifest 링크 업데이트 (appName 변경):', newHref);
                        }
                    }
                }
            };

            // Firebase에서 appName을 읽은 후 manifest 링크 업데이트
            // (PWA standalone 모드에서도 Firebase 읽기를 기다려야 함)
            setTimeout(updateManifestLink, isStandalone ? 100 : 500);
        };

        if (!db) {
            console.warn('Firebase Database가 초기화되지 않았습니다. 기본 앱 이름을 사용합니다.');
            updateAppName('');
            return;
        }

        // Firebase 인증 완료 후 config 읽기
        const readConfig = () => {
            if (!db) return () => {}; // null 체크
            const configRef = ref(db, 'config/appName');
            
            // 초기 로드 시 읽기 (PWA standalone 모드에서는 즉시 읽기)
            const readPromise = get(configRef)
                .then((snapshot) => {
                    if (snapshot.exists()) {
                        const name = snapshot.val();
                        updateAppName(name);
                    } else {
                        updateAppName('');
                    }
                })
                .catch((error) => {
                    // 권한 에러는 조용히 처리 (익명 인증이 완료되지 않았을 수 있음)
                    if (!error.message?.includes('permission')) {
                        console.warn('Firebase config 읽기 실패:', error);
                    }
                    updateAppName('');
                });
            
            // PWA standalone 모드에서는 즉시 읽기 완료를 기다림
            if (isStandalone) {
                readPromise.catch(() => {
                    // 에러는 이미 처리됨
                });
            }

            // 실시간 업데이트 구독
            const unsubscribe = onValue(
                configRef,
                (snapshot) => {
                    if (snapshot.exists()) {
                        const name = snapshot.val();
                        updateAppName(name);
                    } else {
                        updateAppName('');
                    }
                },
                (error) => {
                    // 권한 에러는 조용히 처리
                    if (!error.message?.includes('permission')) {
                        console.warn('Firebase 실시간 업데이트 실패:', error);
                    }
                }
            );

            return unsubscribe;
        };

        // 인증 상태 확인 후 config 읽기
        let unsubscribeConfig: (() => void) | null = null;
        const unsubscribeAuth = onAuthStateChange((user) => {
            if (user) {
                // 인증 완료 후 config 읽기
                if (!unsubscribeConfig) {
                    unsubscribeConfig = readConfig();
                }
            } else {
                // 인증되지 않은 경우에도 시도 (읽기 권한이 있을 수 있음)
                if (!unsubscribeConfig) {
                    unsubscribeConfig = readConfig();
                }
            }
        });

        return () => {
            unsubscribeAuth();
            if (unsubscribeConfig) {
                unsubscribeConfig();
            }
        };
    }, []);

    return null;
}

