# Realtime Voice Assistant

A speech-to-speech voice assistant: your microphone streams straight to the OpenAI
Realtime API over WebRTC and the model's voice comes back on the same peer connection,
so there is no separate STT → LLM → TTS round trip.

## How it works

1. The browser asks the Express server for a short-lived session token
   (`POST /api/token`).
2. The server calls `https://api.openai.com/v1/realtime/client_secrets` with the
   standard `OPENAI_API_KEY` and returns only the ephemeral token. The real key
   never reaches the browser.
3. The browser opens an `RTCPeerConnection`, adds the microphone track, creates an
   `oai-events` data channel, and POSTs its SDP offer to
   `https://api.openai.com/v1/realtime/calls` using the ephemeral token.
4. Model audio arrives as a remote track and plays through an `<audio>` element;
   transcripts arrive as events on the data channel.

## Running it

```bash
cd voice-assistant
npm install
export OPENAI_API_KEY=sk-...   # or copy .env.example to .env and use --env-file
npm start
```

Then open http://localhost:3000, click **Start talking**, allow microphone access,
and speak. You can also type a message to make the assistant reply out loud.

Chrome only grants microphone access on a secure origin: `http://localhost` works,
but any other host needs HTTPS.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `OPENAI_API_KEY` | – | Required. Server-side key used to mint ephemeral tokens. |
| `PORT` | `3000` | HTTP port. |
| `OPENAI_REALTIME_MODEL` | `gpt-realtime` | Realtime model. |
| `OPENAI_REALTIME_VOICE` | `marin` | Assistant voice. |
| `ASSISTANT_INSTRUCTIONS` | concise-assistant prompt | System prompt for the session. |
