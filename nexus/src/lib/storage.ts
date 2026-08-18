import { DEFAULT_SETTINGS, Message, Note, Reminder, Settings } from "../types";

const KEYS = {
  settings: "nexus.settings",
  notes: "nexus.notes",
  reminders: "nexus.reminders",
  history: "nexus.history",
};

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return { ...fallback, ...JSON.parse(raw) } as T;
  } catch {
    return fallback;
  }
}

function readList<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or unavailable (private mode) */
  }
}

/** Settings saved before providers existed only ever held an OpenAI model. */
function migrate(settings: Settings): Settings {
  if (settings.model.startsWith("gpt") && settings.provider !== "openai") {
    return { ...settings, provider: "openai" };
  }
  return settings;
}

export const store = {
  loadSettings: (): Settings => migrate(read<Settings>(KEYS.settings, DEFAULT_SETTINGS)),
  saveSettings: (s: Settings): void => write(KEYS.settings, s),

  loadNotes: (): Note[] => readList<Note>(KEYS.notes),
  saveNotes: (n: Note[]): void => write(KEYS.notes, n),

  loadReminders: (): Reminder[] => readList<Reminder>(KEYS.reminders),
  saveReminders: (r: Reminder[]): void => write(KEYS.reminders, r),

  loadHistory: (): Message[] => readList<Message>(KEYS.history),
  saveHistory: (m: Message[]): void => write(KEYS.history, m.slice(-100)),
};

export function uid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}
