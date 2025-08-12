import { initializeApp, getApp, getApps, type FirebaseOptions } from "firebase/app";
import { getDatabase } from "firebase/database";
import { getAuth } from "firebase/auth";
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

// Export the Firebase services and the getDatabase function
export { db, app, auth, firestore, getDatabase };
