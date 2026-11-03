import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Native wrapper for iOS (Apple Health) and Android (Health Connect).
 *
 * The app needs its server (food search API), so the native shell loads the
 * deployed web app: set CAP_SERVER_URL to its https URL before `npx cap sync`.
 * For local testing on a simulator you can use http://localhost:3000.
 */
const url = process.env.CAP_SERVER_URL;

const config: CapacitorConfig = {
  appId: "com.project175.app",
  appName: "PROJECT 175",
  webDir: "native/www",
  backgroundColor: "#08090a",
  server: url ? { url, cleartext: url.startsWith("http://") } : undefined,
  ios: { contentInset: "always" },
};

export default config;
