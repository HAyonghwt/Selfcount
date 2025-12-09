import { NextResponse } from 'next/server';
import { db, auth } from '@/lib/firebase';
import { ref, get } from 'firebase/database';
import { signInAnonymously } from 'firebase/auth';

export async function GET(request: Request) {
    let appName = '';

    // URL 쿼리 파라미터에서 appName 확인
    const { searchParams } = new URL(request.url);
    const queryAppName = searchParams.get('appName');

    if (queryAppName) {
        appName = queryAppName;
    } else if (db) {
        // 쿼리 파라미터가 없을 때만 Firebase에서 config 읽기 (에러가 발생해도 기본값 사용)
        try {
            // 인증 시도 (실패해도 계속 진행)
            if (auth && !auth.currentUser) {
                try {
                    await signInAnonymously(auth);
                } catch (authError) {
                    // 인증 실패해도 읽기 권한이 있으면 계속 진행
                    console.warn('Firebase 인증 실패 (읽기 권한 확인 중):', authError);
                }
            }
            
            // config 읽기 시도
            const configRef = ref(db, 'config/appName');
            const snapshot = await get(configRef);
            if (snapshot.exists()) {
                const name = snapshot.val();
                if (name && typeof name === 'string' && name.trim()) {
                    appName = name.trim();
                }
            }
        } catch (error) {
            // Firebase 읽기 실패 시 기본값 사용 (에러 로그만 출력)
            console.warn('Firebase config 읽기 실패, 기본값 사용:', error);
        }
    }

    // 앱 이름 형식: "{단체이름}대회앱" (단체 이름이 없으면 "대회앱"만)
    const appTitle = appName ? `${appName}대회앱` : '대회앱';

    const manifest = {
        name: appTitle,
        short_name: appTitle,
        theme_color: "#e85461",
        background_color: "#ffffff",
        display: "standalone",
        scope: "/",
        start_url: "/",
        icons: [
            {
                src: "/icon-192x192.png",
                sizes: "192x192",
                type: "image/png",
                purpose: "any maskable"
            },
            {
                src: "/icon-512x512.png",
                sizes: "512x512",
                type: "image/png",
                purpose: "any maskable"
            }
        ],
        // PWA 설치를 위한 추가 필드
        orientation: "portrait",
        prefer_related_applications: false
    };

    return NextResponse.json(manifest, {
        headers: {
            'Content-Type': 'application/manifest+json',
            'Cache-Control': 'public, max-age=0, must-revalidate', // 배포 환경에서도 캐시 무효화
        },
    });
}

