import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.fechtin.anpiso',
  appName: 'Anpiso',
  webDir: 'dist',
  android: {
    // Cho phép gọi tới Firebase/Gemini qua HTTPS bình thường; không dùng cleartext
    allowMixedContent: false,
  },
  plugins: {
    FirebaseAuthentication: {
      // Chỉ lấy credential từ Google Sign-In của hệ điều hành rồi nạp vào Firebase JS SDK.
      // Không tạo phiên native song song — toàn app đã dựa trên phiên JS sẵn có.
      skipNativeAuth: true,
      providers: ['google.com'],
    },
  },
};

export default config;
