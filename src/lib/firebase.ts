import { initializeApp, getApp, getApps, type FirebaseOptions } from "firebase/app";
import { getDatabase } from "firebase/database";
import { getAuth } from "firebase/auth";

// IMPORTANT: This file contains sensitive API keys.
// Do not expose this file publicly (e.g., on GitHub).
// For production, it is STRONGLY recommended to use environment variables.
export const firebaseConfig: FirebaseOptions = {
  apiKey: "AIzaSyAM6GtB8HB8pw0VPSmZxk7xOxB2n1iXFP8",
  authDomain: "dehoi-1.firebaseapp.com",
  databaseURL: "https://dehoi-1-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "dehoi-1",
  storageBucket: "dehoi-1.firebasestorage.app",
  messagingSenderId: "81139018391",
  appId: "1:81139018391:web:88d8e15e245181c2c557d2"
};

// Initialize Firebase
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const db = getDatabase(app);
const auth = getAuth(app);

export { db, app, auth };
