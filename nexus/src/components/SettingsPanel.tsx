import { useEffect, useState } from "react";
import { listVoices, onVoicesChanged, speak } from "../lib/tts";
import { Note, PROVIDER_MODELS, Provider, Reminder, Settings } from "../types";

interface SettingsPanelProps {
  settings: Settings;
  notes: Note[];
  reminders: Reminder[];
  onChange: (settings: Settings) => void;
  onClose: () => void;
  onClearHistory: () => void;
}

const PROVIDERS: [Provider, string][] = [
  ["gemini", "Google Gemini (free key)"],
  ["openai", "OpenAI (paid)"],
];

const KEY_HELP: Record<Provider, { placeholder: string; url: string; label: string }> = {
  gemini: {
    placeholder: "AIza…",
    url: "https://aistudio.google.com/app/apikey",
    label: "Google AI Studio",
  },
  openai: {
    placeholder: "sk-…",
    url: "https://platform.openai.com/api-keys",
    label: "OpenAI dashboard",
  },
};
const LANGUAGES = [
  ["en-US", "English (US)"],
  ["en-GB", "English (UK)"],
  ["en-IN", "English (India)"],
  ["hi-IN", "Hindi"],
  ["te-IN", "Telugu"],
  ["ta-IN", "Tamil"],
  ["es-ES", "Spanish"],
  ["fr-FR", "French"],
  ["de-DE", "German"],
  ["ja-JP", "Japanese"],
];

export default function SettingsPanel({
  settings,
  notes,
  reminders,
  onChange,
  onClose,
  onClearHistory,
}: SettingsPanelProps) {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>(() => listVoices());

  useEffect(() => {
    const refresh = () => setVoices(listVoices());
    refresh();
    return onVoicesChanged(refresh);
  }, []);

  const update = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    onChange({ ...settings, [key]: value });

  /** Models are provider specific, so switching provider also picks its default model. */
  const switchProvider = (provider: Provider) =>
    onChange({ ...settings, provider, model: PROVIDER_MODELS[provider][0] });

  const keyHelp = KEY_HELP[settings.provider];

  const pending = reminders.filter((reminder) => !reminder.fired);

  return (
    <div className="sheet-backdrop" onClick={onClose} role="presentation">
      <section
        className="sheet"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-label="Nexus settings"
      >
        <header className="sheet-head">
          <h2>Settings</h2>
          <button type="button" className="ghost" onClick={onClose}>
            Done
          </button>
        </header>

        <div className="sheet-body">
          <h3>AI brain</h3>
          <label>
            Provider
            <select
              value={settings.provider}
              onChange={(event) => switchProvider(event.target.value as Provider)}
            >
              {PROVIDERS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            API key
            <input
              type="password"
              value={settings.apiKey}
              onChange={(event) => update("apiKey", event.target.value)}
              placeholder={keyHelp.placeholder}
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          <p className="hint">
            Get a key from{" "}
            <a href={keyHelp.url} target="_blank" rel="noreferrer">
              {keyHelp.label}
            </a>
            . Stored only on this device. Leave empty to use offline skills, or point Nexus at your
            own proxy below to keep the key off the device entirely.
          </p>
          <label>
            Backend proxy URL (optional)
            <input
              value={settings.backendUrl}
              onChange={(event) => update("backendUrl", event.target.value)}
              placeholder="https://my-nexus-server.example.com"
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          <label>
            Model
            <select value={settings.model} onChange={(event) => update("model", event.target.value)}>
              {PROVIDER_MODELS[settings.provider].map((model) => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </select>
          </label>
          <label>
            Personality
            <textarea
              rows={3}
              value={settings.persona}
              onChange={(event) => update("persona", event.target.value)}
            />
          </label>

          <h3>Voice</h3>
          <label>
            Language
            <select value={settings.language} onChange={(event) => update("language", event.target.value)}>
              {LANGUAGES.map(([code, label]) => (
                <option key={code} value={code}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Voice
            <select value={settings.voiceName} onChange={(event) => update("voiceName", event.target.value)}>
              <option value="">Automatic</option>
              {voices.map((voice) => (
                <option key={`${voice.name}-${voice.lang}`} value={voice.name}>
                  {voice.name} ({voice.lang})
                </option>
              ))}
            </select>
          </label>
          <label className="range">
            Speed {settings.rate.toFixed(1)}x
            <input
              type="range"
              min={0.6}
              max={1.6}
              step={0.1}
              value={settings.rate}
              onChange={(event) => update("rate", Number(event.target.value))}
            />
          </label>
          <label className="range">
            Pitch {settings.pitch.toFixed(1)}
            <input
              type="range"
              min={0.5}
              max={1.6}
              step={0.1}
              value={settings.pitch}
              onChange={(event) => update("pitch", Number(event.target.value))}
            />
          </label>
          <button type="button" className="ghost" onClick={() => void speak("Nexus online and ready.", settings)}>
            Test voice
          </button>

          <h3>Behaviour</h3>
          <label className="row">
            <input
              type="checkbox"
              checked={settings.speakReplies}
              onChange={(event) => update("speakReplies", event.target.checked)}
            />
            Speak replies out loud
          </label>
          <label className="row">
            <input
              type="checkbox"
              checked={settings.continuous}
              onChange={(event) => update("continuous", event.target.checked)}
            />
            Keep the mic open after each request
          </label>
          <label className="row">
            <input
              type="checkbox"
              checked={settings.wakeWordEnabled}
              onChange={(event) => update("wakeWordEnabled", event.target.checked)}
            />
            Require a wake word
          </label>
          <label>
            Wake word
            <input
              value={settings.wakeWord}
              onChange={(event) => update("wakeWord", event.target.value)}
              disabled={!settings.wakeWordEnabled}
            />
          </label>

          <h3>Memory</h3>
          <p className="hint">
            {notes.length} note{notes.length === 1 ? "" : "s"} · {pending.length} pending reminder
            {pending.length === 1 ? "" : "s"}
          </p>
          {notes.slice(-5).map((note) => (
            <p key={note.id} className="memory-item">
              {note.text}
            </p>
          ))}
          <button type="button" className="ghost" onClick={onClearHistory}>
            Clear conversation
          </button>
        </div>
      </section>
    </div>
  );
}
