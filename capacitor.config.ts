import type { CapacitorConfig } from "@capacitor/cli";

const previewUrl = process.env.CAP_SERVER_URL?.trim();

const config: CapacitorConfig = {
  appId: "com.hatodgo.app",
  appName: "HatodGo",
  webDir: "dist",
  ...(previewUrl
    ? {
        server: {
          url: previewUrl,
          cleartext: previewUrl.startsWith("http://"),
        },
      }
    : {}),
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      backgroundColor: "#0F172A",
      showSpinner: false,
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#0F172A",
    },
  },
  ios: {
    contentInset: "always",
    backgroundColor: "#0F172A",
  },
  android: {
    allowMixedContent: false,
    backgroundColor: "#0F172A",
  },
};

export default config;
