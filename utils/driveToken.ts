import { refreshDriveTokenFn } from '../services/firebase';

/** Lấy Drive access token còn hạn (cache sessionStorage, refresh qua Cloud Function). */
export async function getDriveToken(): Promise<string> {
  let token = sessionStorage.getItem('drive_access_token');
  const expiry = Number(sessionStorage.getItem('drive_token_expiry') || '0');
  if (!token || Date.now() > expiry - 60_000) {
    const result = await refreshDriveTokenFn();
    token = result.data.accessToken;
    sessionStorage.setItem('drive_access_token', token);
    sessionStorage.setItem('drive_token_expiry', String(Date.now() + result.data.expiresIn * 1000));
  }
  return token!;
}
