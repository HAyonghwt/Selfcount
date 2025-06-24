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

// Initialize Firebase only if the config is not a placeholder
const app = firebaseConfig.apiKey !== "your-api-key" && getApps().length === 0 
  ? initializeApp(firebaseConfig) 
  : getApps().length > 0 ? getApp() : null;

// Ensure db and auth are only initialized if app exists.
// Export them so they can be used throughout the app.
// Downstream code will need to handle the possibility of them being null if the app is not configured.
const db = app ? getDatabase(app) : null;
const auth = app ? getAuth(app) : null;

export { db, app, auth };
