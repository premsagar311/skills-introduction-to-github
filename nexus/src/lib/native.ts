import { Capacitor } from "@capacitor/core";

/**
 * True inside the Android app shell. Android's WebView has no Web Speech API,
 * so the native build routes speech in and out through Capacitor plugins.
 */
export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}
