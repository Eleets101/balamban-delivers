# HatodGo — Native iOS & Android (Capacitor)

This project is wrapped with [Capacitor](https://capacitorjs.com) so the same
web app can be shipped to the **App Store** and **Google Play**.

You cannot build native apps inside Lovable — Apple requires macOS + Xcode,
and Google requires Android Studio. Use this guide on your own machine.

---

## 1. Get the code on your machine

1. In Lovable, click **GitHub → Connect / Push** (top right) to export.
2. Clone the repo locally:
   ```bash
   git clone <your-repo-url>
   cd <repo>
   npm install
   ```

## 2. Add the native platforms (one-time)

```bash
npm run build           # produces dist/
npx cap add ios         # macOS only
npx cap add android     # any OS
npx cap sync
```

This creates `ios/` and `android/` folders. Commit them.

## 3. Run during development

The included `capacitor.config.ts` now defaults to a production-safe bundle id
and local `dist/` assets. If you want a live-web shell during development,
set `CAP_SERVER_URL` before running Capacitor so the app points at your hosted
HatodGo site instead of bundled files.

```bash
CAP_SERVER_URL=https://hatodgo.net npx cap run ios
CAP_SERVER_URL=https://hatodgo.net npx cap run android
```

If you want to bundle local assets instead, build first and do not set
`CAP_SERVER_URL`.

You'll need:
- **iOS**: Xcode 15+ on macOS, an iOS simulator or a real device.
- **Android**: Android Studio with an emulator or USB-debuggable device.

## 4. Build for production / store submission

This repo can support two native release modes:

1. **Hosted web shell**: set `CAP_SERVER_URL=https://hatodgo.net` and ship a
   native wrapper that loads the live site.
2. **Bundled local assets**: build local static web assets and sync them into
   Capacitor.

Right now, the app is built with TanStack Start client/server output, so the
hosted web shell is the fastest release path unless you deliberately add a
static-export mobile build target.

For hosted shell release builds:

```bash
CAP_SERVER_URL=https://hatodgo.net npx cap sync ios
CAP_SERVER_URL=https://hatodgo.net npx cap sync android
npx cap open ios        # → Xcode: Product → Archive → Distribute
npx cap open android    # → Android Studio: Build → Generate Signed Bundle
```

For bundled local assets, you must first produce a Capacitor-compatible static
web output with an `index.html` at the configured `webDir`.

## 5. App Store / Play Store accounts

- **Apple Developer Program** — $99/year — https://developer.apple.com/programs/
- **Google Play Console** — $25 one-time — https://play.google.com/console

You will also need:
- App icon (1024×1024 PNG)
- Splash screen
- Screenshots for each device size
- Privacy policy URL (mandatory)
- App description + keywords

## 6. Avoiding "just a website wrapper" rejection

Apple frequently rejects apps that only display a website. Capacitor plugins
already wired up that help pass review:

- `@capacitor/geolocation` — native GPS for the rider tracker
- `@capacitor/status-bar` — native status bar styling
- `@capacitor/splash-screen` — native splash
- `@capacitor/app` — handle background/foreground, deep links

Ask Lovable to wire these into the rider/customer flow when you're ready.

## 7. Updating the app after launch

- **Web-only changes** (UI, copy, logic): publish on Lovable. Native shell
  picks them up automatically because it loads from your live URL — but
  only if you kept the `server.url` block. For store builds, you must
  rebuild and resubmit.
- **Native changes** (icons, plugins, permissions): rebuild + resubmit.

For OTA-style updates without resubmitting, look at
[Capacitor Live Updates](https://capacitorjs.com/live-updates) (paid).
