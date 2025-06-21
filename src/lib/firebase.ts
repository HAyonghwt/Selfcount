import { initializeApp, getApp, getApps } from "firebase/app";
import { getDatabase } from "firebase/database";

// IMPORTANT: Replace with your actual Firebase project configuration
const firebaseConfig = {
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

export { db, app, firebaseConfig };
