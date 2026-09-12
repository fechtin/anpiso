import { Capacitor } from '@capacitor/core';
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';
import { exchangeDriveCodeFn } from './firebase';

export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

export interface DriveAuthResult {
  accessToken: string;
  /** Thời điểm hết hạn (epoch ms). */
  expiresAt: number;
  /**
   * false = không lấy được refresh token, phiên này chỉ sống tới khi accessToken hết hạn.
   * Xảy ra khi Google không cấp serverAuthCode mới vì người dùng đã cấp quyền từ trước.
   */
  persistent: boolean;
}

const DEFAULT_EXPIRY_MS = 55 * 60 * 1000;

/**
 * Xin quyền Drive, một đường cho cả web lẫn Android native.
 *
 * Vì sao phải tách: trên web dùng popup của Google Identity Services, nhưng trong WebView
 * của Capacitor popup đó chạy ở một ngữ cảnh trình duyệt tách rời, không có quan hệ
 * `opener` với trang — người dùng cấp quyền xong thì mã code không `postMessage` ngược
 * về app được, luồng treo vĩnh viễn. Native phải xin scope thẳng qua Google Sign-In của
 * hệ điều hành và lấy `serverAuthCode`.
 *
 * Cả hai nhánh đều kết thúc bằng việc đổi code qua Cloud Function `exchangeDriveCode`,
 * nơi refresh token được cất phía server — nhờ đó upload Drive sống lâu hơn 1 tiếng.
 */
export const requestDriveAuthorization = async (): Promise<DriveAuthResult> => {
  if (Capacitor.isNativePlatform()) {
    const result = await FirebaseAuthentication.signInWithGoogle({ scopes: [DRIVE_SCOPE] });
    const code = result.credential?.serverAuthCode;
    const directToken = result.credential?.accessToken;

    if (code) {
      const { data } = await exchangeDriveCodeFn({ authCode: code, source: 'native' });
      return {
        accessToken: data.accessToken,
        expiresAt: Date.now() + data.expiresIn * 1000,
        persistent: true,
      };
    }

    // Không có code nhưng vẫn có token dùng ngay — chấp nhận, chỉ là hết hạn thì phải
    // bật lại Drive. Thà upload được cuộc họp này còn hơn chặn người dùng hoàn toàn.
    if (directToken) {
      return { accessToken: directToken, expiresAt: Date.now() + DEFAULT_EXPIRY_MS, persistent: false };
    }

    throw new Error('Google Sign-In không trả về quyền truy cập Drive');
  }

  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  const { code } = await new Promise<{ code: string }>((resolve, reject) => {
    const client = google.accounts.oauth2.initCodeClient({
      client_id: clientId,
      scope: DRIVE_SCOPE,
      ux_mode: 'popup',
      callback: (response: google.accounts.oauth2.CodeResponse) => {
        if (response.error) reject(new Error(response.error));
        else resolve({ code: response.code });
      },
    });
    client.requestCode();
  });

  const { data } = await exchangeDriveCodeFn({ authCode: code, source: 'web' });
  return {
    accessToken: data.accessToken,
    expiresAt: Date.now() + data.expiresIn * 1000,
    persistent: true,
  };
};
