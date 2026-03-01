import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.moduji.app',
  appName: '모두의 지도사',
  webDir: 'out',
  server: {
    // 개발용: Android 에뮬레이터에서 로컬 서버 접근
    // 실제 기기는 PC의 IP 주소로 변경 (예: http://192.168.0.10:3000)
    url: 'http://10.0.2.2:3000',
    cleartext: true,
  },
  android: {
    webContentsDebuggingEnabled: true,
  },
};

export default config;
