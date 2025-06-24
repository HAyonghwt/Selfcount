import { initializeApp, getApp, getApps, type FirebaseOptions } from "firebase/app";
import { getDatabase } from "firebase/database";
import { getAuth } from "firebase/auth";

// IMPORTANT: This file contains sensitive API keys.
// Do not expose this file publicly (e.g., on GitHub).
// For production, it is STRONGLY recommended to use environment variables.
export const firebaseConfig: FirebaseOptions = {
  apiKey: "your-api-key",
  authDomain: "your-project-id.firebaseapp.com",
  databaseURL: "https://your-project-id.firebaseio.com",
  projectId: "your-project-id",
  storageBucket: "your-project-id.appspot.com",
  messagingSenderId: "your-messaging-sender-id",
  appId: "your-app-id",
};

// Initialize Firebase
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const db = getDatabase(app);
const auth = getAuth(app);

export { db, app, auth };
