import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "app.nexus.assistant",
  appName: "Nexus",
  webDir: "dist",
  android: {
    // The bundled build is loaded from the APK, so Nexus works with no server.
    allowMixedContent: false,
  },
};

export default config;
