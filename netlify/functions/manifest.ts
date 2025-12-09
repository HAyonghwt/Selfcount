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

    if (!serviceAccountJson || !databaseURL) {
      console.warn('Firebase Admin 설정이 없습니다. 기본 manifest를 반환합니다.');
      return null;
    }

    const serviceAccount = JSON.parse(serviceAccountJson);

    if (getApps().length === 0) {
      adminApp = initializeApp({
        credential: cert(serviceAccount),
        databaseURL: databaseURL,
      }, 'manifest-function');
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

  try {
    const app = getAdminApp();
    if (app) {
      const db = getDatabase(app);
      const snapshot = await db.ref('config/appName').once('value');
      const name = snapshot.val();
      if (name && typeof name === 'string' && name.trim()) {
        appName = name.trim();
      }
    }
  } catch (error) {
    console.warn('Firebase config 읽기 실패, 기본값 사용:', error);
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

