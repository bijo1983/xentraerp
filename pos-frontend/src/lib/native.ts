// Native app shell wiring — everything here is a no-op in a plain browser
// tab (Capacitor.isNativePlatform() is false there), so this file is safe
// to import unconditionally from main.ts regardless of target.
import { Capacitor } from '@capacitor/core'
import { SplashScreen } from '@capacitor/splash-screen'
import { StatusBar, Style } from '@capacitor/status-bar'
import { App as CapacitorApp } from '@capacitor/app'
import type { Router } from 'vue-router'

export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform()
}

export async function bootstrapNativeShell(router: Router): Promise<void> {
  if (!isNativeApp()) return

  // Light status bar icons/text to match the app's light POS theme (see
  // assets/pos.css --canvas: #f4f6fb) — StatusBar.Style.Light means "light
  // background, dark content", not "light mode".
  await StatusBar.setStyle({ style: Style.Light }).catch(() => {})
  await StatusBar.setBackgroundColor({ color: '#f4f6fb' }).catch(() => {})

  // Android hardware/gesture back button: mirror in-app back navigation
  // instead of the OS default (which would background or kill the app from
  // a register/terminal screen — surprising mid-shift). Only let it fall
  // through to minimizing the app when there's nowhere left to go back to.
  CapacitorApp.addListener('backButton', () => {
    if (router.currentRoute.value.name === 'login' || window.history.state?.back == null) {
      CapacitorApp.minimizeApp()
    } else {
      router.back()
    }
  })
}

// Called once the initial view has actually painted (e.g. Vue's onMounted
// on App.vue) — hiding earlier would show a blank white frame between the
// native splash and the first real paint.
export async function hideNativeSplash(): Promise<void> {
  if (!isNativeApp()) return
  await SplashScreen.hide().catch(() => {})
}
