import { TextToSpeech } from "@capacitor-community/text-to-speech";
import { Settings } from "../types";
import { isNativeApp } from "./native";

export function isSpeechSynthesisSupported(): boolean {
  if (isNativeApp()) return true;
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

function isWebSynthesisAvailable(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

export function listVoices(): SpeechSynthesisVoice[] {
  if (!isWebSynthesisAvailable()) return [];
  return window.speechSynthesis.getVoices();
}

export function onVoicesChanged(handler: () => void): () => void {
  if (!isWebSynthesisAvailable()) return () => undefined;
  window.speechSynthesis.addEventListener("voiceschanged", handler);
  return () => window.speechSynthesis.removeEventListener("voiceschanged", handler);
}

export function cancelSpeech(): void {
  if (isNativeApp()) {
    void TextToSpeech.stop().catch(() => undefined);
    return;
  }
  if (isWebSynthesisAvailable()) window.speechSynthesis.cancel();
}

/** Speaks text and resolves when playback finishes (or immediately if unsupported). */
export function speak(text: string, settings: Settings): Promise<void> {
  if (!text.trim()) return Promise.resolve();
  if (isNativeApp()) return speakNative(text, settings);
  if (!isWebSynthesisAvailable()) return Promise.resolve();
  return new Promise((resolve) => {
    const utterance = new SpeechSynthesisUtterance(text);
    const voices = listVoices();
    const chosen =
      voices.find((v) => v.name === settings.voiceName) ??
      voices.find((v) => v.lang === settings.language) ??
      voices.find((v) => v.lang.startsWith(settings.language.slice(0, 2)));
    if (chosen) utterance.voice = chosen;
    utterance.lang = chosen?.lang ?? settings.language;
    utterance.rate = settings.rate;
    utterance.pitch = settings.pitch;
    utterance.volume = settings.volume;
    utterance.onend = () => resolve();
    utterance.onerror = () => resolve();
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  });
}

/** Android's WebView has no speechSynthesis; the plugin drives the system TTS engine. */
async function speakNative(text: string, settings: Settings): Promise<void> {
  try {
    await TextToSpeech.stop();
    await TextToSpeech.speak({
      text,
      lang: settings.language,
      rate: settings.rate,
      pitch: settings.pitch,
      volume: settings.volume,
    });
  } catch {
    /* no TTS engine installed, or playback interrupted */
  }
}
