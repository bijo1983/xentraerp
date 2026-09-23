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
      // once the first real screen has painted — the fast path, avoiding a
      // blank flash between splash and content on a slow connection (this
      // app loads its UI from PRODUCTION_REMOTE_URL, not a bundled copy).
      // launchAutoHide stays TRUE as a safety net: if the remote page never
      // finishes loading at all (network failure, a stall in Capacitor's
      // own bridge injection — seen once on real hardware even though the
      // same URL loaded fine in a plain WebView), the app.vue onMounted
      // hide() call never fires, and previously the splash then hung
      // forever with zero feedback. launchShowDuration forces it to hide
      // regardless after this many ms, revealing index.html's own
      // fallback "taking longer than expected" screen underneath instead
      // of leaving the user stuck on a frozen logo.
      launchAutoHide: true,
      launchShowDuration: 10000,
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
