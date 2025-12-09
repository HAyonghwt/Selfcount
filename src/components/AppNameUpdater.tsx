"use client";

import { useEffect, useState } from 'react';
import { db, auth, onAuthStateChange } from '@/lib/firebase';
import { ref, onValue, get } from 'firebase/database';

export default function AppNameUpdater() {
    const [appName, setAppName] = useState('');

    useEffect(() => {
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

            // manifest 링크 업데이트 (appName을 쿼리 파라미터로 전달)
            let manifestLink = document.querySelector('link[rel="manifest"]') as HTMLLinkElement;
            if (manifestLink) {
                const appNameParam = finalName ? `&appName=${encodeURIComponent(finalName)}` : '';
                manifestLink.href = `/api/manifest?t=${Date.now()}${appNameParam}`;
            }
        };

        if (!db) {
            console.warn('Firebase Database가 초기화되지 않았습니다. 기본 앱 이름을 사용합니다.');
            updateAppName('');
            return;
        }

        // Firebase 인증 완료 후 config 읽기
        const readConfig = () => {
            const configRef = ref(db, 'config/appName');
            
            // 초기 로드 시 읽기
            get(configRef)
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

