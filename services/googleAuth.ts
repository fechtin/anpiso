import { signInWithPopup, signInWithCredential, GoogleAuthProvider } from 'firebase/auth';
import { Capacitor } from '@capacitor/core';
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';
import { auth, googleProvider } from './firebase';
import { User } from '../types';

/**
 * Đăng nhập Google, một đường cho cả web lẫn Android native.
 *
 * Vì sao phải tách: `signInWithPopup` KHÔNG chạy được trong WebView của Capacitor —
 * Google chặn OAuth trong embedded WebView (`disallowed_useragent`). Bản native phải
 * dùng Google Sign-In của hệ điều hành, lấy credential rồi mới nạp vào Firebase JS SDK.
 *
 * Cả hai nhánh đều kết thúc bằng một phiên trên Firebase JS SDK, nên Firestore rules,
 * `onAuthStateChanged` và phần còn lại của app không phải biết mình đang chạy ở đâu.
 */
const isNative = (): boolean => Capacitor.isNativePlatform();

/** Lỗi người dùng tự huỷ hộp thoại — không phải lỗi thật, đừng hiện thông báo đỏ. */
export const isUserCancelledSignIn = (err: any): boolean => {
  const code = err?.code || '';
  const message = String(err?.message || '');
  return (
    code === 'auth/popup-closed-by-user' ||
    code === 'auth/cancelled-popup-request' ||
    // Google Sign-In native trả về mã 12501 / chuỗi "canceled" khi người dùng thoát
    message.includes('12501') ||
    /cancell?ed/i.test(message)
  );
};

export const signInWithGoogle = async (): Promise<User> => {
  if (isNative()) {
    // skipNativeAuth=true → plugin chỉ lấy credential, không tự tạo phiên native riêng
    const result = await FirebaseAuthentication.signInWithGoogle();
    const idToken = result.credential?.idToken;
    if (!idToken) throw new Error('Google Sign-In không trả về idToken');

    const accessToken = result.credential?.accessToken;
    const credential = GoogleAuthProvider.credential(idToken, accessToken);
    const jsResult = await signInWithCredential(auth, credential);
    const firebaseUser = jsResult.user;

    return {
      uid: firebaseUser.uid,
      name: firebaseUser.displayName || result.user?.displayName || '',
      email: firebaseUser.email || result.user?.email || '',
      picture: firebaseUser.photoURL || result.user?.photoUrl || '',
      accessToken: accessToken || undefined,
    };
  }

  const result = await signInWithPopup(auth, googleProvider);
  const firebaseUser = result.user;
  const credential = GoogleAuthProvider.credentialFromResult(result);

  return {
    uid: firebaseUser.uid,
    name: firebaseUser.displayName || '',
    email: firebaseUser.email || '',
    picture: firebaseUser.photoURL || '',
    accessToken: credential?.accessToken || undefined,
  };
};

/** Đăng xuất cả hai tầng: bản native còn giữ phiên Google Sign-In riêng của hệ điều hành. */
export const signOutGoogle = async (): Promise<void> => {
  if (isNative()) {
    await FirebaseAuthentication.signOut().catch(() => {});
  }
};
