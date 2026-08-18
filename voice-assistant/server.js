import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";

const __dirname = dirname(fileURLToPath(import.meta.url));

const PORT = Number(process.env.PORT ?? 3000);
const MODEL = process.env.OPENAI_REALTIME_MODEL ?? "gpt-realtime";
const VOICE = process.env.OPENAI_REALTIME_VOICE ?? "marin";
const INSTRUCTIONS =
  process.env.ASSISTANT_INSTRUCTIONS ??
  "You are a friendly, concise voice assistant. Keep answers to a couple of sentences unless asked for detail.";

const app = express();

app.use(express.static(join(__dirname, "public")));

app.get("/api/config", (_req, res) => {
  res.json({ model: MODEL, voice: VOICE });
});

app.post("/api/token", async (_req, res) => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "OPENAI_API_KEY is not set on the server" });
    return;
  }

  try {
    const response = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        session: {
          type: "realtime",
          model: MODEL,
          instructions: INSTRUCTIONS,
          audio: {
            input: { transcription: { model: "gpt-4o-mini-transcribe" } },
            output: { voice: VOICE },
          },
        },
      }),
    });

    const body = await response.text();
    if (!response.ok) {
      console.error("Failed to mint ephemeral token:", response.status, body);
      res.status(502).json({ error: "Failed to create realtime session", detail: body });
      return;
    }

    const data = JSON.parse(body);
    res.json({ value: data.value, expires_at: data.expires_at, model: MODEL, voice: VOICE });
  } catch (error) {
    console.error("Token generation error:", error);
    res.status(500).json({ error: "Failed to create realtime session" });
  }
});

export const server = createServer(app);

if (process.env.NODE_ENV !== "test") {
  server.listen(PORT, () => {
    console.log(`Voice assistant running at http://localhost:${PORT}`);
  });
}

export default app;
