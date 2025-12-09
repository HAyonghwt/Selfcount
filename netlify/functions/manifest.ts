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
  // Netlify Functions는 event.queryStringParameters에 직접 접근 가능
  if (event.queryStringParameters && event.queryStringParameters.appName) {
    appName = decodeURIComponent(event.queryStringParameters.appName).trim();
    console.log('클라이언트에서 appName 받음:', appName);
  }
  
  // 또는 URL에서 직접 파싱 (대안)
  if (!appName && event.rawQuery) {
    const urlParams = new URLSearchParams(event.rawQuery);
    const clientAppName = urlParams.get('appName');
    if (clientAppName) {
      appName = decodeURIComponent(clientAppName).trim();
      console.log('URL에서 appName 파싱:', appName);
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
            console.log('Firebase에서 appName 읽기 성공:', appName);
          } else {
            console.log('config/appName이 비어있거나 유효하지 않습니다.');
          }
        } else {
          console.log('config/appName 경로에 데이터가 없습니다.');
        }
      } else {
        console.warn('Firebase Admin 앱이 초기화되지 않았습니다. (환경 변수 확인 필요)');
      }
    } catch (error: any) {
      console.warn('Firebase config 읽기 실패:', error);
      if (error.message) {
        console.warn('에러 메시지:', error.message);
      }
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
    orientation: "portrait",
    prefer_related_applications: false
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

