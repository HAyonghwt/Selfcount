import { initializeApp, getApp, getApps, type FirebaseOptions } from "firebase/app";
import { getDatabase } from "firebase/database";
import { getAuth, signInAnonymously, onAuthStateChanged, type User } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// IMPORTANT: This file reads sensitive API keys from environment variables.
// For production, it is STRONGLY recommended to use your hosting provider's environment variable settings.
// For local development, create a `.env.local` file in the root directory.
export const firebaseConfig: FirebaseOptions = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID
};

// Initialize Firebase only if the config is not a placeholder
const app = firebaseConfig.apiKey
  ? getApps().length === 0
    ? initializeApp(firebaseConfig)
    : getApp()
  : null;

// Initialize Firebase services only if the app is properly initialized
const db = app ? getDatabase(app) : null;
const auth = app ? getAuth(app) : null;
const firestore = app ? getFirestore(app) : null;

// Firebase 인증 상태 확인 및 익명 인증 수행 함수
export const ensureAuthenticated = async (maxRetries: number = 3, retryDelay: number = 1000): Promise<boolean> => {
  if (!auth) {
    console.error('Firebase Auth가 초기화되지 않았습니다.');
    return false;
  }

  // 1. 이미 인증된 사용자가 있는지 먼저 즉시 확인
  if (auth.currentUser) {
    console.log('이미 인증된 사용자:', auth.currentUser.uid);
    return true;
  }

  // 2. 인증 상태가 초기회될 때까지 잠시 대기 (Firebase v10+의 경우 authStateReady 사용 가능)
  // 여기서는 호환성을 위해 직접 구현하거나 세션 복구를 기다림
  try {
    // 0.5초 정도 대기하며 세션 복구 확인
    await new Promise((resolve) => {
      const unsubscribe = onAuthStateChanged(auth, (user) => {
        unsubscribe();
        resolve(user);
      });
      // 최대 1초만 기다림
      setTimeout(() => {
        unsubscribe();
        resolve(null);
      }, 1000);
    });

    const currentUser = auth.currentUser;
    if (currentUser) {
      console.log('세션 복구 성공:', currentUser.uid);
      return true;
    }
  } catch (e) {
    console.warn('인증 상태 대기 중 오류:', e);
  }

  // 3. 여전히 없으면 익명 인증 시도
  let attempt = 0;
  while (attempt < maxRetries) {
    try {
      console.log(`익명 인증 시도 중... (${attempt + 1}/${maxRetries})`);
      const userCredential = await signInAnonymously(auth);
      console.log('익명 인증 성공:', userCredential.user.uid);
      return true;
    } catch (error: any) {
      attempt++;
      console.error(`Firebase 인증 실패 (${attempt}/${maxRetries}):`, error);

      const isRetryableError =
        error?.code === 'auth/network-request-failed' ||
        error?.code === 'auth/too-many-requests' ||
        error?.message?.includes('network') ||
        error?.message?.includes('timeout');

      if (isRetryableError && attempt < maxRetries) {
        const delay = retryDelay * Math.pow(2, attempt - 1);
        console.log(`${delay}ms 후 재시도...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      return false;
    }
  }

  return false;
};

// 인증 상태 변경 리스너
export const onAuthStateChange = (callback: (user: User | null) => void) => {
  if (!auth) return () => { };
  return onAuthStateChanged(auth, callback);
};

// Firebase null 체크 헬퍼 함수들
export const getDb = () => {
  if (!db) {
    throw new Error('Firebase Database가 초기화되지 않았습니다. 환경 변수를 확인해주세요.');
  }
  return db;
};

export const getFirestoreDb = () => {
  if (!firestore) {
    throw new Error('Firestore가 초기화되지 않았습니다. 환경 변수를 확인해주세요.');
  }
  return firestore;
};

// Export the Firebase services and the getDatabase function
export { db, app, auth, firestore, getDatabase };
