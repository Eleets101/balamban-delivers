import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Capacitor configuration for HatodGo native wrapper.
 *
 * Two ways to run:
 *  1. Live preview against the Lovable preview URL (great for iterating UI
 *     without rebuilding the native app each time). Keep `server.url` set.
 *  2. Production / store submission build. COMMENT OUT the `server` block
 *     below, run `npm run build`, then `npx cap sync` so the bundled web
 *     assets in `dist/` are shipped inside the native app.
 *
 * Bundle ID: change `appId` to a domain you own before submitting to stores
 * (Apple and Google both reject reused or example IDs).
 */
const config: CapacitorConfig = {
  appId: "app.lovable.50376fc527cf42cfaa0dec2f67a6bbd1",
  appName: "HatodGo",
  webDir: "dist",
  server: {
    // Live-reload against the Lovable preview. Remove this whole `server`
    // block before submitting to the App Store / Play Store.
    url: "https://50376fc5-2d27-42cf-aa0d-ec2f67a6bbd1.lovableproject.com?forceHideBadge=true",
    cleartext: true,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      backgroundColor: "#0F172A",
      showSpinner: false,
    },
  },
  ios: {
    contentInset: "always",
  },
  android: {
    allowMixedContent: true,
  },
};

export default config;
