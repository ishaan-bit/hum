import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.qdenxp.hum",
  appName: "Hum",
  webDir: "public",
  server: {
    url: "https://hum-beta.vercel.app",
    cleartext: false,
  },
  android: {
    buildOptions: {
      releaseType: "AAB",
    },
  },
};

export default config;
