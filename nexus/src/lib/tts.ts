import { Settings } from "../types";

export function isSpeechSynthesisSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

export function listVoices(): SpeechSynthesisVoice[] {
  if (!isSpeechSynthesisSupported()) return [];
  return window.speechSynthesis.getVoices();
}

export function onVoicesChanged(handler: () => void): () => void {
  if (!isSpeechSynthesisSupported()) return () => undefined;
  window.speechSynthesis.addEventListener("voiceschanged", handler);
  return () => window.speechSynthesis.removeEventListener("voiceschanged", handler);
}

export function cancelSpeech(): void {
  if (isSpeechSynthesisSupported()) window.speechSynthesis.cancel();
}

/** Speaks text and resolves when playback finishes (or immediately if unsupported). */
export function speak(text: string, settings: Settings): Promise<void> {
  if (!isSpeechSynthesisSupported() || !text.trim()) return Promise.resolve();
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
