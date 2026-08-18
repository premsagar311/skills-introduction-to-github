import { Message, Settings } from "../types";

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
 * off the device); otherwise calls the OpenAI API directly from the browser.
 */
export async function ask(
  utterance: string,
  history: Message[],
  settings: Settings,
  signal?: AbortSignal,
): Promise<string> {
  const messages = buildTurns(history, utterance, settings);
  const backend = settings.backendUrl.trim().replace(/\/$/, "");

  const endpoint = backend ? `${backend}/api/chat` : "https://api.openai.com/v1/chat/completions";
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (!backend) headers.Authorization = `Bearer ${settings.apiKey.trim()}`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    signal,
    body: JSON.stringify({
      model: settings.model,
      messages,
      temperature: 0.6,
      max_tokens: 300,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`${response.status} ${response.statusText}: ${detail.slice(0, 200)}`);
  }

  const data: unknown = await response.json();
  const reply = readReply(data);
  if (!reply) throw new Error("The AI returned an empty reply.");
  return reply;
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
