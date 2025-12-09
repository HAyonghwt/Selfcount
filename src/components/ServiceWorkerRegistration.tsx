"use client";

import { useEffect } from 'react';

export default function ServiceWorkerRegistration() {
    useEffect(() => {
        if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
            // Service Worker 등록
            navigator.serviceWorker
                .register('/sw.js')
                .then((registration) => {
                    console.log('Service Worker 등록 성공:', registration.scope);
                })
                .catch((error) => {
                    console.error('Service Worker 등록 실패:', error);
                });
        }
    }, []);

    return null;
}

