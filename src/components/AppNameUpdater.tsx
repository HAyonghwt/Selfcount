"use client";

import { useEffect } from 'react';

export default function AppNameUpdater() {
    useEffect(() => {
        // 정적 앱 이름 설정
        document.title = '파크골프대회';

        // apple-mobile-web-app-title meta 태그 업데이트
        let metaTag = document.querySelector('meta[name="apple-mobile-web-app-title"]');
        if (!metaTag) {
            metaTag = document.createElement('meta');
            metaTag.setAttribute('name', 'apple-mobile-web-app-title');
            document.head.appendChild(metaTag);
        }
        metaTag.setAttribute('content', '파크골프대회');
    }, []);

    return null;
}
