import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { publicEnv } from "@/config/publicEnv";

const firebaseConfig = publicEnv.firebase;

let app: FirebaseApp | null = null;
let auth: Auth | null = null;

export function getFirebaseApp(): FirebaseApp {
  if (!publicEnv.firebaseConfigured) {
    throw new Error(
      "Firebase env vars are missing. Copy .env.local.example to .env.local and fill all NEXT_PUBLIC_FIREBASE_* values.",
    );
  }
  if (!app) {
    app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  }
  return app;
}

export function getFirebaseAuth(): Auth {
  if (!auth) {
    auth = getAuth(getFirebaseApp());
  }
  return auth;
}
