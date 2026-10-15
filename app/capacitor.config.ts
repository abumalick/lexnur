import type { CapacitorConfig } from '@capacitor/cli';
import type { KeyboardResize } from '@capacitor/keyboard';

const config: CapacitorConfig = {
  appId: 'com.lexnur',
  appName: 'Lexnur',
  webDir: 'dist',
  loggingBehavior: process.env.LEXNUR_DEBUG === '1' ? 'debug' : 'none',
  ios: { scrollEnabled: false, contentInset: 'never' },
  plugins: {
    SystemBars: { insetsHandling: 'css' },
    Keyboard: { resize: 'native' as KeyboardResize, resizeOnFullScreen: true },
    CapacitorSQLite: { iosIsEncryption: false, androidIsEncryption: false },
  },
};

export default config;
