import { Handler } from '@netlify/functions';
import { initializeApp, getApps, cert, type App } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';

// Firebase Admin 초기화
let adminApp: App | null = null;

function getAdminApp(): App | null {
  if (adminApp) {
    return adminApp;
  }

  try {
    // 환경 변수에서 Firebase Admin 설정 읽기
    const serviceAccountJson = process.env.FIREBASE_ADMIN_CREDENTIALS;
    const databaseURL = process.env.FIREBASE_DATABASE_URL || process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL;

    if (!serviceAccountJson) {
      console.warn('FIREBASE_ADMIN_CREDENTIALS 환경 변수가 설정되지 않았습니다.');
      return null;
    }

    if (!databaseURL) {
      console.warn('FIREBASE_DATABASE_URL 또는 NEXT_PUBLIC_FIREBASE_DATABASE_URL 환경 변수가 설정되지 않았습니다.');
      return null;
    }

    let serviceAccount;
    try {
      serviceAccount = typeof serviceAccountJson === 'string' 
        ? JSON.parse(serviceAccountJson) 
        : serviceAccountJson;
    } catch (parseError) {
      console.error('FIREBASE_ADMIN_CREDENTIALS JSON 파싱 실패:', parseError);
      return null;
    }

    if (getApps().length === 0) {
      adminApp = initializeApp({
        credential: cert(serviceAccount),
        databaseURL: databaseURL,
      }, 'manifest-function');
      console.log('Firebase Admin 초기화 성공');
    } else {
      adminApp = getApps().find(app => app.name === 'manifest-function') || getApps()[0];
    }

    return adminApp;
  } catch (error) {
    console.error('Firebase Admin 초기화 실패:', error);
    return null;
  }
}

export const handler: Handler = async (event, context) => {
  let appName = '';

  // 쿼리 파라미터에서 appName 읽기 (클라이언트에서 전달)
  // 방법 1: queryStringParameters에서 읽기
  if (event.queryStringParameters && event.queryStringParameters.appName) {
    appName = decodeURIComponent(event.queryStringParameters.appName).trim();
  }
  
  // 방법 2: rawQuery에서 파싱
  if (!appName && event.rawQuery) {
    try {
      const urlParams = new URLSearchParams(event.rawQuery);
      const clientAppName = urlParams.get('appName');
      if (clientAppName) {
        appName = decodeURIComponent(clientAppName).trim();
      }
    } catch (error) {
      // 파싱 실패는 조용히 처리
    }
  }
  
  // 방법 3: rawUrl에서 직접 파싱
  if (!appName && event.rawUrl) {
    try {
      // rawUrl이 상대 경로일 수 있으므로 절대 URL로 변환
      const baseUrl = event.headers?.host 
        ? `https://${event.headers.host}` 
        : 'https://netlify.app';
      const url = new URL(event.rawUrl, baseUrl);
      const clientAppName = url.searchParams.get('appName');
      if (clientAppName) {
        appName = decodeURIComponent(clientAppName).trim();
      }
    } catch (error) {
      // 파싱 실패는 조용히 처리
    }
  }

  // Firebase Admin에서도 시도 (환경 변수가 설정된 경우)
  if (!appName) {
    try {
      const app = getAdminApp();
      if (app) {
        const db = getDatabase(app);
        const snapshot = await db.ref('config/appName').once('value');
        if (snapshot.exists()) {
          const name = snapshot.val();
          if (name && typeof name === 'string' && name.trim()) {
            appName = name.trim();
            // Firebase에서 appName 읽기 성공
          }
        }
      }
    } catch (error: any) {
      // Firebase 읽기 실패는 조용히 처리 (기본값 사용)
    }
  }

  // 앱 이름 형식: "{단체이름}대회앱" (단체 이름이 없으면 "대회앱"만)
  const appTitle = appName ? `${appName}대회앱` : '대회앱';

  // manifest 버전: appName을 기반으로 생성하여 appName이 변경될 때만 manifest가 변경되도록 함
  const manifestVersion = appName ? `v1-${Buffer.from(appName).toString('base64').substring(0, 8)}` : 'v1-default';

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
    orientation: "portrait",
    prefer_related_applications: false,
    // manifest 버전 추가 (브라우저가 변경사항을 추적할 수 있도록)
    version: manifestVersion
  };

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/manifest+json',
      'Cache-Control': 'public, max-age=0, must-revalidate',
    },
    body: JSON.stringify(manifest),
  };
};

