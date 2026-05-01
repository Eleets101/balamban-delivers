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

The included `capacitor.config.ts` points the native shell at your Lovable
preview URL, so you can iterate on the web app and see changes instantly
without rebuilding the native app.

```bash
npx cap run ios         # opens iOS simulator
npx cap run android     # opens Android emulator
```

You'll need:
- **iOS**: Xcode 15+ on macOS, an iOS simulator or a real device.
- **Android**: Android Studio with an emulator or USB-debuggable device.

## 4. Build for production / store submission

Before building for the stores, **edit `capacitor.config.ts`**:

1. Change `appId` to a domain you own, e.g. `com.yourcompany.hatodgo`.
   Apple and Google reject the placeholder ID.
2. **Remove the entire `server` block** so the app loads bundled assets
   from `dist/` instead of the Lovable preview URL.

Then:

```bash
npm run build
npx cap sync
npx cap open ios        # → Xcode: Product → Archive → Distribute
npx cap open android    # → Android Studio: Build → Generate Signed Bundle
```

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
