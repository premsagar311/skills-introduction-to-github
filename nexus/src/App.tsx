import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Orb from "./components/Orb";
import SettingsPanel from "./components/SettingsPanel";
import Transcript from "./components/Transcript";
import { ask, hasBrain } from "./lib/brain";
import { fallbackReply, runSkills, SkillContext } from "./lib/skills";
import { isRecognitionSupported, VoiceListener } from "./lib/speech";
import { cancelSpeech, isSpeechSynthesisSupported, speak } from "./lib/tts";
import { store, uid } from "./lib/storage";
import { Message, Note, Reminder, Settings } from "./types";

type Status = "idle" | "listening" | "thinking" | "speaking";

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
}

export default function App() {
  const [settings, setSettings] = useState<Settings>(() => store.loadSettings());
  const [messages, setMessages] = useState<Message[]>(() => store.loadHistory());
  const [notes, setNotes] = useState<Note[]>(() => store.loadNotes());
  const [reminders, setReminders] = useState<Reminder[]>(() => store.loadReminders());
  const [status, setStatus] = useState<Status>("idle");
  const [micOn, setMicOn] = useState(false);
  const [partial, setPartial] = useState("");
  const [typed, setTyped] = useState("");
  const [error, setError] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [installEvent, setInstallEvent] = useState<InstallPromptEvent | null>(null);

  const settingsRef = useRef(settings);
  const messagesRef = useRef(messages);
  const notesRef = useRef(notes);
  const remindersRef = useRef(reminders);
  const listenerRef = useRef<VoiceListener | null>(null);
  const busyRef = useRef(false);

  const speechSupported = useMemo(() => isRecognitionSupported(), []);
  const ttsSupported = useMemo(() => isSpeechSynthesisSupported(), []);

  useEffect(() => {
    settingsRef.current = settings;
    store.saveSettings(settings);
  }, [settings]);

  useEffect(() => {
    messagesRef.current = messages;
    store.saveHistory(messages);
  }, [messages]);

  useEffect(() => {
    notesRef.current = notes;
    store.saveNotes(notes);
  }, [notes]);

  useEffect(() => {
    remindersRef.current = reminders;
    store.saveReminders(reminders);
  }, [reminders]);

  const addMessage = useCallback((role: Message["role"], text: string, source?: Message["source"]) => {
    setMessages((current) => [...current, { id: uid(), role, text, at: Date.now(), source }]);
  }, []);

  const say = useCallback(async (text: string) => {
    if (!settingsRef.current.speakReplies) return;
    setStatus("speaking");
    await speak(text, settingsRef.current);
    setStatus(listenerRef.current?.listening ? "listening" : "idle");
  }, []);

  const skillContext = useMemo<SkillContext>(
    () => ({
      addNote: (text) => setNotes((current) => [...current, { id: uid(), text, at: Date.now() }]),
      listNotes: () => notesRef.current,
      clearNotes: () => setNotes([]),
      addReminder: (text, dueAt) =>
        setReminders((current) => [...current, { id: uid(), text, dueAt, fired: false }]),
      listReminders: () => remindersRef.current,
      clearReminders: () => setReminders([]),
      clearConversation: () => setMessages([]),
      openUrl: (url) => window.open(url, "_blank", "noopener,noreferrer"),
      stopSpeaking: () => cancelSpeech(),
    }),
    [],
  );

  const handleUtterance = useCallback(
    async (rawText: string) => {
      const utterance = rawText.trim();
      if (!utterance || busyRef.current) return;

      const current = settingsRef.current;
      let spoken = utterance;
      if (current.wakeWordEnabled) {
        const wake = current.wakeWord.trim().toLowerCase();
        const lowered = utterance.toLowerCase();
        if (!wake || !lowered.includes(wake)) return;
        spoken = utterance.slice(lowered.indexOf(wake) + wake.length).replace(/^[\s,.:]+/, "");
        if (!spoken) {
          addMessage("nexus", "Yes?");
          await say("Yes?");
          return;
        }
      }

      busyRef.current = true;
      setPartial("");
      setError("");
      addMessage("user", spoken);

      try {
        const skill = runSkills(spoken, skillContext);
        if (skill) {
          addMessage("nexus", skill.text, "skill");
          await say(skill.text);
          return;
        }

        if (!hasBrain(current)) {
          const reply = fallbackReply(spoken);
          addMessage("nexus", reply, "error");
          await say(reply);
          return;
        }

        setStatus("thinking");
        const reply = await ask(spoken, messagesRef.current, current);
        addMessage("nexus", reply, "llm");
        await say(reply);
      } catch (caught) {
        const detail = caught instanceof Error ? caught.message : String(caught);
        setError(detail);
        const reply = "Sorry, I could not reach my AI brain. Check the key or your connection.";
        addMessage("nexus", reply, "error");
        await say(reply);
      } finally {
        busyRef.current = false;
        setStatus(listenerRef.current?.listening ? "listening" : "idle");
      }
    },
    [addMessage, say, skillContext],
  );

  const stopListening = useCallback(() => {
    listenerRef.current?.stop();
    listenerRef.current = null;
    setMicOn(false);
    setPartial("");
    setStatus("idle");
  }, []);

  const startListening = useCallback(() => {
    if (!speechSupported) {
      setError(
        "This browser has no speech recognition. Use Chrome or Edge (Windows) or Chrome (Android), or type below.",
      );
      return;
    }
    const listener = new VoiceListener({
      onPartial: setPartial,
      onFinal: (text) => void handleUtterance(text),
      onError: (code) => {
        if (code === "not-allowed" || code === "service-not-allowed") {
          setError("Microphone access was blocked. Allow the mic in your browser settings.");
          stopListening();
        } else if (code === "network") {
          setError("Speech recognition needs a network connection.");
        } else {
          setError(`Speech recognition error: ${code}`);
        }
      },
      onStateChange: (active) =>
        setStatus((currentStatus) => {
          if (currentStatus === "thinking" || currentStatus === "speaking") return currentStatus;
          return active ? "listening" : "idle";
        }),
    });
    listenerRef.current = listener;
    listener.start(settingsRef.current.language, settingsRef.current.continuous);
    setMicOn(true);
    setError("");
  }, [handleUtterance, speechSupported, stopListening]);

  // Reminders fire while the app is open.
  useEffect(() => {
    const interval = window.setInterval(() => {
      const due = remindersRef.current.filter((reminder) => !reminder.fired && reminder.dueAt <= Date.now());
      if (due.length === 0) return;
      setReminders((current) =>
        current.map((reminder) =>
          due.some((item) => item.id === reminder.id) ? { ...reminder, fired: true } : reminder,
        ),
      );
      for (const reminder of due) {
        const text = `Reminder: ${reminder.text}.`;
        addMessage("nexus", text, "skill");
        void say(text);
      }
    }, 1000);
    return () => window.clearInterval(interval);
  }, [addMessage, say]);

  useEffect(() => {
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as InstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  useEffect(() => () => listenerRef.current?.stop(), []);

  const submitTyped = (event: React.FormEvent) => {
    event.preventDefault();
    const text = typed.trim();
    if (!text) return;
    setTyped("");
    const current = settingsRef.current;
    // Typed input skips the wake word requirement.
    if (current.wakeWordEnabled) {
      void handleUtterance(`${current.wakeWord} ${text}`);
    } else {
      void handleUtterance(text);
    }
  };

  const statusLabel =
    status === "listening"
      ? micOn
        ? "Listening"
        : "Starting mic"
      : status === "thinking"
        ? "Thinking"
        : status === "speaking"
          ? "Speaking"
          : micOn
            ? "Mic on"
            : "Tap the orb to talk";

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true" />
          <div>
            <h1>Nexus</h1>
            <p className="tagline">{hasBrain(settings) ? "AI brain connected" : "Offline skills mode"}</p>
          </div>
        </div>
        <div className="topbar-actions">
          {installEvent && (
            <button
              type="button"
              className="ghost"
              onClick={() => {
                void installEvent.prompt();
                setInstallEvent(null);
              }}
            >
              Install app
            </button>
          )}
          <button type="button" className="ghost" onClick={() => setSettingsOpen(true)} aria-label="Settings">
            Settings
          </button>
        </div>
      </header>

      <main className="stage">
        <Orb status={status} onClick={() => (micOn ? stopListening() : startListening())} />
        <p className="status" role="status">
          {statusLabel}
        </p>
        <p className="partial">{partial || "\u00a0"}</p>

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {!ttsSupported && <p className="error">This browser cannot speak replies, but text still works.</p>}

        <Transcript messages={messages} />

        <form className="composer" onSubmit={submitTyped}>
          <input
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            placeholder="Or type to Nexus…"
            aria-label="Message Nexus"
          />
          <button type="submit" disabled={!typed.trim()}>
            Send
          </button>
        </form>
      </main>

      {settingsOpen && (
        <SettingsPanel
          settings={settings}
          notes={notes}
          reminders={reminders}
          onChange={setSettings}
          onClose={() => setSettingsOpen(false)}
          onClearHistory={() => setMessages([])}
        />
      )}
    </div>
  );
}
