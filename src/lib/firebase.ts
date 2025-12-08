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
export const ensureAuthenticated = async (): Promise<boolean> => {
  if (!auth) {
    console.error('Firebase Auth가 초기화되지 않았습니다.');
    return false;
  }

  try {
    const currentUser = auth.currentUser;
    
    if (currentUser) {
      console.log('이미 인증된 사용자:', currentUser.uid);
      return true;
    }

    console.log('익명 인증 시도 중...');
    const userCredential = await signInAnonymously(auth);
    console.log('익명 인증 성공:', userCredential.user.uid);
    return true;
    
  } catch (error) {
    console.error('Firebase 인증 실패:', error);
    return false;
  }
};

// 인증 상태 변경 리스너
export const onAuthStateChange = (callback: (user: User | null) => void) => {
  if (!auth) return () => {};
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
