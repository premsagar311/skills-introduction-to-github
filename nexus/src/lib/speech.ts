/**
 * Thin wrapper over the Web Speech API recognition engine.
 * Chrome/Edge on Windows and Chrome on Android expose it as webkitSpeechRecognition.
 * Inside the Android app shell there is no Web Speech API, so the native recogniser
 * is driven through the Capacitor plugin behind the same callback contract.
 */

import { SpeechRecognition } from "@capacitor-community/speech-recognition";
import { isNativeApp } from "./native";

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}
interface SpeechRecognitionResult {
  isFinal: boolean;
  length: number;
  [index: number]: SpeechRecognitionAlternative;
}
interface SpeechRecognitionResultList {
  length: number;
  [index: number]: SpeechRecognitionResult;
}
interface SpeechRecognitionEventLike extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}
interface SpeechRecognitionErrorEventLike extends Event {
  error: string;
}
interface SpeechRecognitionLike extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getCtor(): SpeechRecognitionCtor | null {
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function isRecognitionSupported(): boolean {
  return isNativeApp() || getCtor() !== null;
}

export interface ListenerCallbacks {
  onPartial: (text: string) => void;
  onFinal: (text: string) => void;
  onError: (error: string) => void;
  onStateChange: (listening: boolean) => void;
}

export class VoiceListener {
  private recognition: SpeechRecognitionLike | null = null;
  private wantListening = false;
  private restartTimer: number | null = null;
  private nativeBound = false;
  private lastNativePartial = "";

  constructor(private callbacks: ListenerCallbacks) {}

  get listening(): boolean {
    return this.wantListening;
  }

  start(language: string, continuous: boolean): void {
    if (isNativeApp()) {
      this.wantListening = true;
      void this.startNative(language);
      return;
    }
    const Ctor = getCtor();
    if (!Ctor) {
      this.callbacks.onError("not-supported");
      return;
    }
    this.wantListening = true;
    this.spawn(Ctor, language, continuous);
  }

  private spawn(Ctor: SpeechRecognitionCtor, language: string, continuous: boolean): void {
    const recognition = new Ctor();
    recognition.lang = language;
    recognition.continuous = continuous;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => this.callbacks.onStateChange(true);

    recognition.onresult = (event) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const transcript = result[0]?.transcript ?? "";
        if (result.isFinal) {
          const finalText = transcript.trim();
          if (finalText) this.callbacks.onFinal(finalText);
        } else {
          interim += transcript;
        }
      }
      this.callbacks.onPartial(interim.trim());
    };

    recognition.onerror = (event) => {
      // "no-speech" and "aborted" are routine in continuous mode; surface the rest.
      if (event.error !== "no-speech" && event.error !== "aborted") {
        this.callbacks.onError(event.error);
      }
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        this.wantListening = false;
      }
    };

    recognition.onend = () => {
      this.callbacks.onStateChange(false);
      if (!this.wantListening) return;
      // Mobile Chrome ends the session frequently; restart to keep the mic hot.
      this.restartTimer = window.setTimeout(() => {
        if (this.wantListening) {
          try {
            this.spawn(Ctor, language, continuous);
          } catch {
            this.wantListening = false;
          }
        }
      }, 350);
    };

    this.recognition = recognition;
    try {
      recognition.start();
    } catch {
      /* start() throws if a session is already running */
    }
  }

  /**
   * The plugin emits partials while listening and a "stopped" state after silence;
   * the last partial is the final transcript, and a new session keeps the mic hot.
   */
  private async startNative(language: string): Promise<void> {
    try {
      const permission = await SpeechRecognition.requestPermissions();
      if (permission.speechRecognition !== "granted") {
        this.wantListening = false;
        this.callbacks.onError("not-allowed");
        return;
      }

      if (!this.nativeBound) {
        this.nativeBound = true;
        await SpeechRecognition.addListener("partialResults", ({ matches }) => {
          const text = matches[0]?.trim() ?? "";
          if (!text) return;
          this.lastNativePartial = text;
          this.callbacks.onPartial(text);
        });
        await SpeechRecognition.addListener("listeningState", ({ status }) => {
          if (status === "started") {
            this.callbacks.onStateChange(true);
            return;
          }
          this.callbacks.onStateChange(false);
          const finalText = this.lastNativePartial;
          this.lastNativePartial = "";
          if (finalText) this.callbacks.onFinal(finalText);
          if (this.wantListening) {
            this.restartTimer = window.setTimeout(() => {
              if (this.wantListening) void this.listenNative(language);
            }, 400);
          }
        });
      }

      await this.listenNative(language);
    } catch (caught) {
      this.wantListening = false;
      this.callbacks.onStateChange(false);
      this.callbacks.onError(caught instanceof Error ? caught.message : "recognition-failed");
    }
  }

  private async listenNative(language: string): Promise<void> {
    await SpeechRecognition.start({
      language,
      maxResults: 1,
      partialResults: true,
      popup: false,
    });
  }

  stop(): void {
    this.wantListening = false;
    this.lastNativePartial = "";
    if (isNativeApp()) {
      if (this.restartTimer !== null) {
        window.clearTimeout(this.restartTimer);
        this.restartTimer = null;
      }
      void SpeechRecognition.stop().catch(() => undefined);
      this.callbacks.onStateChange(false);
      return;
    }
    if (this.restartTimer !== null) {
      window.clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    try {
      this.recognition?.stop();
    } catch {
      /* already stopped */
    }
    this.callbacks.onStateChange(false);
  }
}
