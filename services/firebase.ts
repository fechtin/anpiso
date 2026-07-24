import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
// Đăng nhập chỉ xin scope cơ bản (email/profile) — không cần Google verify.
// Scope gmail.send (restricted) được xin on-demand lúc gửi email (gmailService).
export const googleProvider = new GoogleAuthProvider();

export const db = getFirestore(app);

// Cloud Functions for Drive token management
const functions = getFunctions(app, 'asia-northeast3');
export const exchangeDriveCodeFn = httpsCallable<
  { authCode: string },
  { accessToken: string; expiresIn: number }
>(functions, 'exchangeDriveCode');

export const refreshDriveTokenFn = httpsCallable<
  void,
  { accessToken: string; expiresIn: number }
>(functions, 'refreshDriveToken');
