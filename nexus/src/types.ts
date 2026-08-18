export type Role = "user" | "nexus";

export interface Message {
  id: string;
  role: Role;
  text: string;
  at: number;
  source?: "skill" | "llm" | "error";
}

export interface Note {
  id: string;
  text: string;
  at: number;
}

export interface Reminder {
  id: string;
  text: string;
  dueAt: number;
  fired: boolean;
}

export interface Settings {
  apiKey: string;
  model: string;
  backendUrl: string;
  wakeWord: string;
  wakeWordEnabled: boolean;
  voiceName: string;
  rate: number;
  pitch: number;
  volume: number;
  speakReplies: boolean;
  continuous: boolean;
  language: string;
  persona: string;
}

export const DEFAULT_SETTINGS: Settings = {
  apiKey: "",
  model: "gpt-4o-mini",
  backendUrl: "",
  wakeWord: "nexus",
  wakeWordEnabled: false,
  voiceName: "",
  rate: 1,
  pitch: 1,
  volume: 1,
  speakReplies: true,
  continuous: true,
  language: "en-US",
  persona:
    "You are Nexus, a concise and friendly voice assistant. Answer in at most three short sentences suitable for being read aloud. Never use markdown, lists or emoji.",
};
