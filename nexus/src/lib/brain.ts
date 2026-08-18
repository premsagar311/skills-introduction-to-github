import { Message, Settings } from "../types";

/** Gemini exposes an OpenAI-compatible chat endpoint, so one request shape serves both. */
const CHAT_URLS: Record<Settings["provider"], string> = {
  openai: "https://api.openai.com/v1/chat/completions",
  gemini: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
};

interface ChatTurn {
  role: "system" | "user" | "assistant";
  content: string;
}

function buildTurns(history: Message[], utterance: string, settings: Settings): ChatTurn[] {
  const recent = history.slice(-10).map<ChatTurn>((message) => ({
    role: message.role === "user" ? "user" : "assistant",
    content: message.text,
  }));
  return [
    { role: "system", content: settings.persona },
    ...recent,
    { role: "user", content: utterance },
  ];
}

export function hasBrain(settings: Settings): boolean {
  return Boolean(settings.apiKey.trim() || settings.backendUrl.trim());
}

/**
 * Asks the configured LLM. Prefers a backend proxy when one is set (keeps the key
 * off the device); otherwise calls the provider directly from the browser.
 */
export async function ask(
  utterance: string,
  history: Message[],
  settings: Settings,
  signal?: AbortSignal,
): Promise<string> {
  const messages = buildTurns(history, utterance, settings);
  const backend = settings.backendUrl.trim().replace(/\/$/, "");

  const endpoint = backend ? `${backend}/api/chat` : CHAT_URLS[settings.provider];
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (!backend) headers.Authorization = `Bearer ${settings.apiKey.trim()}`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    signal,
    body: JSON.stringify({
      provider: settings.provider,
      model: settings.model,
      messages,
      temperature: 0.6,
      max_tokens: 300,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`${response.status} ${response.statusText}: ${redact(detail).slice(0, 200)}`);
  }

  const data: unknown = await response.json();
  const reply = readReply(data);
  if (!reply) throw new Error("The AI returned an empty reply.");
  return reply;
}

/** Upstream errors quote the offending credential back at us; never surface it. */
function redact(text: string): string {
  return text
    .replace(/sk-[A-Za-z0-9_-]{8,}/g, "sk-***")
    .replace(/AIza[A-Za-z0-9_-]{10,}/g, "AIza***")
    .replace(/Bearer\s+\S+/g, "Bearer ***");
}

function readReply(data: unknown): string {
  if (typeof data !== "object" || data === null) return "";
  const asRecord = data as { reply?: unknown; choices?: unknown };
  if (typeof asRecord.reply === "string") return asRecord.reply.trim();
  if (!Array.isArray(asRecord.choices)) return "";
  const first = asRecord.choices[0] as { message?: { content?: unknown } } | undefined;
  const content = first?.message?.content;
  return typeof content === "string" ? content.trim() : "";
}
