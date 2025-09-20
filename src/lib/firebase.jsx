// src/lib/firebase.jsx
import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore, collection } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import {query, where, orderBy } from "firebase/firestore";

function buildRoutesQuery(db, f) {
  const coll = collection(db, "routes");
  const clauses = [];
  if (f.start !== "ALL") clauses.push(where("start", "==", f.start));
  if (f.end !== "ALL") clauses.push(where("end", "==", f.end));
  // Keep sorting stable; createdAt works well with newest-first lists.
  clauses.push(orderBy("createdAt", "desc"));
  return query(coll, ...clauses);
}

// Environment handling (Vite + CRA safe without throwing)
const viteEnv = typeof import.meta !== "undefined" ? import.meta.env : undefined;
const craEnv = typeof process !== "undefined" ? process.env : undefined;

const firebaseConfig = {
  apiKey:
    (viteEnv && viteEnv.VITE_FB_API_KEY) ||
    (craEnv && craEnv.REACT_APP_FIREBASE_API_KEY) ||
    "AIzaSyA82OORs1OmOmhd4KKNGfDlkVRcew3v8u8",
  authDomain:
    (viteEnv && viteEnv.VITE_FB_AUTH_DOMAIN) ||
    (craEnv && craEnv.REACT_APP_FIREBASE_AUTH_DOMAIN) ||
    "bus-seva-b152d.firebaseapp.com",
  projectId:
    (viteEnv && viteEnv.VITE_FB_PROJECT_ID) ||
    (craEnv && craEnv.REACT_APP_FIREBASE_PROJECT_ID) ||
    "bus-seva-b152d",
  storageBucket:
    (viteEnv && viteEnv.VITE_FB_STORAGE_BUCKET) ||
    (craEnv && craEnv.REACT_APP_FIREBASE_STORAGE_BUCKET) ||
    "bus-seva-b152d.firebasestorage.app",
  messagingSenderId:
    (viteEnv && viteEnv.VITE_FB_MSG_SENDER_ID) ||
    (craEnv && craEnv.REACT_APP_FIREBASE_MESSAGING_SENDER_ID) ||
    "692459200509",
  appId:
    (viteEnv && viteEnv.VITE_FB_APP_ID) ||
    (craEnv && craEnv.REACT_APP_FIREBASE_APP_ID) ||
    "1:692459200509:web:39ab42d39efb25d05d0394",
};

// 1) Initialize app first (handles HMR safely)
export const app = getApps().length ? getApp() : initializeApp(firebaseConfig); // [OK]

// 2) Then create SDK instances from the initialized app
export const db = getFirestore(app);     // Firestore instance
export const storage = getStorage(app);  // Storage instance

// 3) Optional collection refs
export const busesCol = collection(db, "buses");
export const driversCol = collection(db, "drivers");
export const routesCol = collection(db, "routes");

// Important: Do NOT import anything here that imports from this file.
// Keep this module dependency-free to avoid circular import ordering issues.
