import { NextResponse } from 'next/server';
import { db, auth, ensureAuthenticated } from '@/lib/firebase';
import { ref, get } from 'firebase/database';
import { signInAnonymously } from 'firebase/auth';

export async function GET() {
    try {
        // Firebase에서 config 읽기
        let appName = '';
        
        if (db && auth) {
            try {
                // 서버 사이드에서도 인증 시도
                try {
                    if (!auth.currentUser) {
                        await signInAnonymously(auth);
                    }
                } catch (authError) {
                    console.warn('Firebase 인증 실패 (읽기 권한이 있으면 계속 진행):', authError);
                }
                
                const configRef = ref(db, 'config/appName');
                const snapshot = await get(configRef);
                if (snapshot.exists()) {
                    const name = snapshot.val();
                    if (name && name.trim()) {
                        appName = name.trim();
                    }
                }
            } catch (error) {
                console.error('Firebase config 읽기 실패:', error);
                // 에러 발생 시 기본값 사용
            }
        } else {
            console.warn('Firebase Database가 초기화되지 않았습니다.');
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
                    type: "image/png"
                },
                {
                    src: "/icon-512x512.png",
                    sizes: "512x512",
                    type: "image/png"
                }
            ]
        };

        return NextResponse.json(manifest, {
            headers: {
                'Content-Type': 'application/manifest+json',
                'Cache-Control': 'no-cache, no-store, must-revalidate',
            },
        });
    } catch (error) {
        console.error('Manifest 생성 실패:', error);
        // 에러 발생 시 기본 manifest 반환
        const defaultManifest = {
            name: "대회앱",
            short_name: "대회앱",
            theme_color: "#e85461",
            background_color: "#ffffff",
            display: "standalone",
            scope: "/",
            start_url: "/",
            icons: [
                {
                    src: "/icon-192x192.png",
                    sizes: "192x192",
                    type: "image/png"
                },
                {
                    src: "/icon-512x512.png",
                    sizes: "512x512",
                    type: "image/png"
                }
            ]
        };
        return NextResponse.json(defaultManifest, {
            headers: {
                'Content-Type': 'application/manifest+json',
                'Cache-Control': 'no-cache, no-store, must-revalidate',
            },
        });
    }
}

