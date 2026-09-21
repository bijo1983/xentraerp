import type { CapacitorConfig } from '@capacitor/cli'

// PRODUCTION_REMOTE_URL: the native app shell loads the live deployed POS
// site directly (same code, same origin, same session-cookie auth as the
// browser version) rather than bundling a copy of dist/ into the binary.
// This sidesteps cross-origin cookie/CORS handling entirely — the WebView's
// origin IS https://pos.xentraerp.net, exactly like a browser tab — at the
// cost of requiring network connectivity to load the app at all (already a
// hard requirement for every POS operation, so not a new constraint).
// Native plugins (Bluetooth LE, status bar, keyboard, etc.) still work
// normally: Capacitor injects its JS bridge into the page regardless of
// which origin loaded it.
const PRODUCTION_REMOTE_URL = process.env.CAP_SERVER_URL || 'https://pos.xentraerp.net'

const config: CapacitorConfig = {
  appId: 'com.xentraerp.pos',
  appName: 'XentraERP POS',
  webDir: 'dist',
  server: {
    url: PRODUCTION_REMOTE_URL,
    cleartext: false,
  },
  android: {
    // https, not the file:// or capacitor:// androidScheme default, so
    // cookies set by the remote origin behave exactly like a normal browser
    // session (no SameSite/secure-cookie edge cases to special-case).
    allowMixedContent: false,
  },
  plugins: {
    SplashScreen: {
      // Hidden explicitly from App.vue's onMounted (see src/lib/native.ts)
      // once the first real screen has painted, rather than on a fixed
      // timer — avoids a blank white flash between splash and content on
      // a slow connection (remember, this app loads its UI from
      // PRODUCTION_REMOTE_URL, not a bundled copy).
      launchAutoHide: false,
      backgroundColor: '#0a0f1c',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
    },
    Keyboard: {
      resize: 'body',
    },
  },
}

export default config
