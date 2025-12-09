"use client";

import { useEffect, useState } from 'react';
import { db } from '@/lib/firebase';
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

            // manifest 링크 업데이트 (캐시 무효화를 위해 타임스탬프 추가)
            let manifestLink = document.querySelector('link[rel="manifest"]') as HTMLLinkElement;
            if (manifestLink) {
                manifestLink.href = `/api/manifest?t=${Date.now()}`;
            }
        };

        if (!db) {
            console.warn('Firebase Database가 초기화되지 않았습니다. 기본 앱 이름을 사용합니다.');
            updateAppName('');
            return;
        }

        // 초기 로드 시 즉시 읽기
        const configRef = ref(db, 'config/appName');
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
                console.error('Firebase config 읽기 실패:', error);
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
                console.error('Firebase 실시간 업데이트 실패:', error);
            }
        );

        return () => unsubscribe();
    }, []);

    return null;
}

