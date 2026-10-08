# POS mobile apps — build & store deployment guide

## What this is

The native iOS and Android apps are a **Capacitor** shell around the same
`pos-frontend` Vue 3 app already running at `pos.xentraerp.net` — not a
separate rewrite. The native shell:

- loads the live site directly (`capacitor.config.ts`'s `server.url`), so
  it authenticates with the exact same session-cookie flow as the browser
  version, with no CORS/cross-origin cookie workarounds needed
- adds real native functionality on top of that page: Bluetooth **LE**
  receipt printing via CoreBluetooth (iOS) / the Android BLE stack —
  through `@capacitor-community/bluetooth-le` — a dark status bar matching
  the POS theme, native splash screen, and Android hardware back-button
  handling
- this matters for App Store review specifically: Apple's Guideline 4.2
  ("minimum functionality") rejects apps that are just a bare website in a
  WebView — the native Bluetooth printing is real, substantive native
  functionality beyond what a browser tab offers, which is what makes this
  a legitimate native app submission rather than a "web clip"

**I could not build or sign the actual `.ipa`/`.aab` files myself** — this
session runs in a Linux container with no Xcode (iOS builds are only
possible on macOS, an Apple requirement, not a tooling choice) and no
Android SDK installed. Everything below is scaffolded, committed, and
ready — the build/sign/submit steps need to run on a Mac (iOS) and any
machine with Android Studio (Android), or through a CI service (see
"Building without owning a Mac" below).

## What's already done (checked into `pos-frontend/`)

- `capacitor.config.ts` — app id `com.xentraerp.pos`, app name "XentraERP
  POS", remote URL `https://pos.xentraerp.net` (override with `CAP_SERVER_URL`
  for a staging build)
- `android/` and `ios/` — the full native project sources (commit these;
  only their `.gitignore`d build output is regenerated)
- `resources/icon.png` + `resources/splash.png` — placeholder brand mark
  (dark navy `#0a0f1c` background, brand blue `#1776ff`→`#0b4fc4` chip, "X"
  monogram) already expanded into every required icon/splash size for both
  platforms via `npm run cap:icons`. **Swap these two source files for a
  real designed icon before shipping** — this is a functional placeholder,
  not final branding — then re-run `npm run cap:icons`.
- `src/lib/native.ts` — status bar styling, splash-screen hide-on-mount,
  Android back-button handling
- `src/lib/bluetooth-printer.ts` — rewritten on `@capacitor-community/bluetooth-le`
  so the same code path drives Bluetooth printing on iOS, Android, **and**
  the desktop browser version (its web fallback uses Web Bluetooth
  automatically) — no more Safari/Web-Bluetooth limitation on the native
  iOS app specifically, since it talks to CoreBluetooth directly
- `ios/App/App/Info.plist` — `NSBluetoothAlwaysUsageDescription` added
  (required by Apple for any Bluetooth usage since iOS 13); Android's
  Bluetooth/location permissions come from the plugin's own manifest
  automatically, nothing to add by hand there
- `android/app/build.gradle` — a `release` signing config that reads from
  `android/keystore.properties` (gitignored) when present, so both a local
  build and CI can produce a properly-signed release without hand-editing
  Gradle files each time
- `.github/workflows/android-release.yml` — builds and signs the Android
  app entirely on GitHub's Linux runners (see "Cloud build via GitHub
  Actions" below) — no Android Studio or local SDK needed at all
- A release keystore (`xentraerp-pos-release.keystore`) was generated for
  this project and sent to you directly — **not** committed to git, and
  not stored anywhere in this repo or session once handed off. Keep it and
  its password somewhere durable; see "The release signing key" below.

## Accounts you'll need (I can't create these for you)

| Account | Cost | Needed for |
|---|---|---|
| Apple Developer Program | $99/year | Any iOS device testing beyond your own devices, TestFlight, App Store submission |
| App Store Connect | included above | App listing, TestFlight, submission |
| Google Play Console | $25 one-time | Play Store submission |

## iOS: build, test, submit

Requires a Mac with Xcode installed (App Store, free) and the Apple
Developer Program account above.

```bash
cd pos-frontend
npm install
npm run ios:open        # builds the web app, cap sync, opens Xcode
```

In Xcode:

1. Select the `App` target → **Signing & Capabilities** → check "Automatically
   manage signing" → pick your Apple Developer team. Xcode provisions a
   development certificate and profile for you.
2. Product → Scheme → Edit Scheme → Run → set to **Release** for a
   TestFlight-bound build (Debug builds can't be uploaded).
3. Plug in an iPhone/iPad (or use a Simulator first to sanity-check the UI)
   and Run, to confirm the app launches, logs in, and the Bluetooth printer
   pairing dialog appears from Printer Settings.
4. Product → Archive (must be on a real "Any iOS Device" build target, not
   a simulator).
5. In the Organizer window that opens after archiving: **Distribute App**
   → **App Store Connect** → **Upload**. Xcode handles signing/provisioning
   automatically if you used automatic signing above.
6. In [App Store Connect](https://appstoreconnect.apple.com): create the
   app record (bundle ID `com.xentraerp.pos`, matches what's already
   configured), fill in the listing (screenshots, description, support
   URL, privacy policy URL — required), then under **TestFlight** add the
   build you just uploaded (it appears within ~15-30 min after processing)
   and invite internal testers by email.
7. Test thoroughly on real hardware via TestFlight — specifically the full
   PIN login → register select → sale → Bluetooth print flow, since that's
   the one path a simulator can't exercise (no simulated Bluetooth radio).
8. When ready: App Store Connect → your app → **Submit for Review**. Fill
   in the **App Privacy** section honestly — this app collects/transmits:
   no analytics/tracking by this codebase, but does use Bluetooth (declare
   "Bluetooth" under required device capabilities/usage) and makes network
   requests to your own backend (not third-party data sharing). Review
   typically takes 1-3 days.

## Android: build, test, submit

Unlike iOS, Android has **no macOS/Xcode requirement** — a signed release
build can be produced entirely in the cloud via GitHub Actions, with
nothing installed on your own machine at all. That's the path below;
Android Studio locally is still there as an alternative if you'd rather
build on your own machine.

### 1. The release signing key

A release build must be signed with a keystore — a private key file that
must exist before any signed build can happen, and must be kept forever
(losing it means you can never update the app under the same Play Store
listing again). One was generated for this project and handed to you
directly (not committed to git, obviously) — store `xentraerp-pos-
release.keystore` and its password somewhere durable and private (a
password manager or secrets vault) right now if you haven't already.
`android/.gitignore` excludes `*.keystore`/`keystore.properties` so it can
never be accidentally committed even if it ends up in this folder.

If you ever need a fresh one instead:
```bash
keytool -genkey -v -keystore xentraerp-pos-release.keystore \
  -alias xentraerp-pos -keyalg RSA -keysize 2048 -validity 10000
```

### 2a. Cloud build via GitHub Actions (no downloads at all)

`.github/workflows/android-release.yml` is already set up. One-time setup:

1. In this repo: **Settings → Secrets and variables → Actions → New
   repository secret**, add four secrets:
   - `ANDROID_KEYSTORE_BASE64` — the keystore file, base64-encoded
     (`base64 -w0 xentraerp-pos-release.keystore`, or `base64 -i
     xentraerp-pos-release.keystore | tr -d '\n'` on macOS)
   - `ANDROID_KEYSTORE_PASSWORD` and `ANDROID_KEY_PASSWORD` — the
     password you were given (same value for both, for this keystore)
   - `ANDROID_KEY_ALIAS` — `xentraerp-pos`
2. **Actions tab → "Android release build (POS)" → Run workflow.**
3. When it finishes, download `xentraerp-pos-release-aab` from the run's
   **Artifacts** section — that's the signed `.aab` ready to upload to
   Play Console (step 3 below). Nothing was installed locally to produce
   it.

Re-run the same workflow (no setup needed again) any time you want a new
signed build after native-shell changes — see "Updating the app" below
for when that's actually necessary.

### 2b. Local build via Android Studio (alternative)

```bash
cd pos-frontend
npm install
npm run android:open    # builds the web app, cap sync, opens Android Studio
```

Either drop the keystore into `android/keystore.properties` (copy
`android/keystore.properties.example`, fill in the real path/passwords —
`build.gradle` already wires this into the `release` signing config) and
run `./gradlew bundleRelease` from `android/`, or use Android Studio's
**Build → Generate Signed Bundle / APK → Android App Bundle** wizard
pointed at the keystore directly.

### 3. Google Play Console

1. Create the app in [Play Console](https://play.google.com/console) —
   package name `com.xentraerp.pos` (must match exactly, already set).
2. Fill in the **Store listing** (screenshots, short/full description,
   icon — pulled from the app itself, privacy policy URL — required).
3. Complete the **Data safety** form — same honesty as iOS: declares
   network requests to your own backend, no third-party analytics/ads SDKs
   in this codebase, Bluetooth used for printer connectivity.
4. Upload the signed `.aab` under **Testing → Internal testing** first,
   add testers by email, confirm the full PIN login → sale → Bluetooth
   print flow on a real Android device/tablet.
5. Enroll in **Play App Signing** when prompted (Google's recommended
   default — Google re-signs your upload key with a Google-managed app
   signing key; you keep your upload keystore only to authenticate future
   uploads).
6. Promote the tested release: **Testing → Internal testing → Promote to
   Production** (or go through Closed/Open testing tracks first if you
   want a wider beta). First-time app review is typically same-day to a
   few days.

## Building without owning a Mac (iOS)

Apple requires a Mac to produce a signed iOS build — there's no way around
that locally. If nobody on the team has one, the standard options are:

- **GitHub Actions with a `macos-latest` runner** — free-tier minutes
  include macOS runners; a workflow can run `npm run build && npx cap sync
  ios`, then `xcodebuild archive`/`xcodebuild -exportArchive` using a
  signing certificate + provisioning profile stored as encrypted repo
  secrets. I can scaffold this workflow if you want it — it still needs
  you to generate the certificate/profile once via an Apple Developer
  account (that step itself requires Xcode or `App Store Connect API`
  access, not something I can do without your Apple credentials).
- **A CI service built for this** (Codemagic, Bitrise, EAS Build) — each
  offers macOS build minutes and can also automate the Android side; more
  setup-friendly than raw GitHub Actions for signing, but a recurring
  cost beyond the Apple/Google account fees above.
- Borrow/rent a Mac for the (infrequent) archive-and-upload step — once a
  build is in TestFlight, further testing doesn't need a Mac at all.

## Updating the app after it's live

Because the app loads `https://pos.xentraerp.net` directly rather than a
bundled copy of the JS, **most changes need no app store resubmission at
all** — push to `erp-frontend`'s deploy as usual (see the main `CLAUDE.md`)
and every installed app picks it up the next time it's opened, same as a
browser refresh. A new binary/store submission is only needed when you
change something in the **native shell itself**: a new Capacitor plugin,
a permission, the icon/splash, `capacitor.config.ts`, or anything under
`ios/`/`android/`.

## Known limitations / follow-ups

- The icon/splash are placeholders (a generated brand chip, not a
  professionally designed mark) — swap `resources/icon.png` +
  `resources/splash.png` and re-run `npm run cap:icons` before a real
  store launch.
- Bluetooth printer GATT profile UUIDs (`src/lib/bluetooth-printer.ts`)
  are still the two most common generic ESC/POS profiles, unverified
  against the client's actual printer hardware — same caveat as the
  existing browser version, now shared code for all three targets.
- No push notifications, offline queueing, or camera barcode scanning
  wired up yet — `@capacitor/app`/`@capacitor/network`/`@capacitor/preferences`
  are installed and available if/when those are wanted, not yet used.
- App Store / Play Store screenshots, description copy, and privacy
  policy page are not part of this codebase and still need to be
  produced for the store listings above.
