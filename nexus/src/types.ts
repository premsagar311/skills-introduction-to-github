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

/** Gemini is offered because its free tier needs no billing details. */
export type Provider = "gemini" | "openai";

export const PROVIDER_MODELS: Record<Provider, string[]> = {
  gemini: ["gemini-2.0-flash", "gemini-2.0-flash-lite", "gemini-1.5-flash"],
  openai: ["gpt-4o-mini", "gpt-4o", "gpt-4.1-mini", "gpt-3.5-turbo"],
};

export interface Settings {
  provider: Provider;
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
  provider: "gemini",
  apiKey: "",
  model: PROVIDER_MODELS.gemini[0],
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
