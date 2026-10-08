# XentraERP POS — pos-frontend

Vue 3 + TypeScript + Vite single-page app for `pos.xentraerp.net`, and the
source for the native iOS/Android apps (via Capacitor — see below).

## Web development

```bash
npm install
npm run dev      # proxies /api to VITE_API_PROXY_TARGET (default http://127.0.0.1:8083)
npm run build     # type-checks then builds dist/
```

## Native iOS / Android apps

The native apps are a thin Capacitor shell around this same web app — see
[`MOBILE_DEPLOYMENT.md`](./MOBILE_DEPLOYMENT.md) for the full build,
signing, and App Store / Play Store submission guide.

Quick reference once the native toolchains are installed:

```bash
npm run android:open   # build web, sync, open android/ in Android Studio
npm run ios:open       # build web, sync, open ios/App/App.xcworkspace in Xcode (macOS only)
npm run cap:icons      # regenerate all icon/splash sizes from resources/icon.png + resources/splash.png
```
