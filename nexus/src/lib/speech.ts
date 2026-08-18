/**
 * Thin wrapper over the Web Speech API recognition engine.
 * Chrome/Edge on Windows and Chrome on Android expose it as webkitSpeechRecognition.
 */

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
  return getCtor() !== null;
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

  constructor(private callbacks: ListenerCallbacks) {}

  get listening(): boolean {
    return this.wantListening;
  }

  start(language: string, continuous: boolean): void {
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

  stop(): void {
    this.wantListening = false;
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
