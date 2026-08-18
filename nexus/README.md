# Nexus — AI voice assistant

Nexus listens through your microphone, thinks, and talks back. One codebase ships
as a **native Android APK** and as an installable **PWA** for Windows (Edge/Chrome)
and any Chromium browser — no app store.

![Nexus icon](public/icons/icon-192.png)

## What it can do

**Offline skills (no API key, no network):**

| Say | Nexus does |
| --- | --- |
| "what time is it" / "what's the date" | tells the time or date |
| "what is 12 times 9", "20 percent of 250" | maths, evaluated locally (no `eval`) |
| "20 kilometres in miles", "30 degrees celsius in fahrenheit" | distance/mass/temperature conversions |
| "how many days until christmas", "spell rhythm" | countdowns and spelling |
| "take a note buy milk", "read my notes" | notes saved on the device |
| "remind me to stretch in 10 minutes", "set a timer for 2 minutes" | spoken reminders |
| "open youtube", "search for pasta recipes", "play lofi" | opens the site |
| "flip a coin", "roll a dice", "random number between 1 and 10", "tell me a joke" | fun |
| "stop", "clear the conversation", "what can you do" | control |

**AI brain (optional):** anything a skill does not match is sent to an LLM, so
Nexus can answer open questions. Replies are kept short so they sound natural
when spoken.

## Install on Android (easiest)

1. Download `app-debug.apk` from the **Build Nexus APK** workflow run
   (*Actions → Build Nexus APK → Artifacts → nexus-apk*).
2. Open it on the phone and allow *install from this source* when prompted.
3. Launch **Nexus**, tap the orb, allow the microphone.

Offline skills work immediately with no key and no server. In the APK, speech
input uses Android's native recogniser and replies use the system text-to-speech
engine, because Android's WebView has no Web Speech API.

Build it yourself (needs the Android SDK and JDK 17):

```bash
cd nexus
npm install
npm run android:apk   # android/app/build/outputs/apk/debug/app-debug.apk
```

## Run it

```bash
cd nexus
npm install
npm run dev          # http://localhost:5173
```

Then click the orb and allow microphone access.

Speech recognition uses the Web Speech API, which needs **Chrome, Edge or another
Chromium browser** (Chrome on Android, Edge/Chrome on Windows). Firefox and
desktop Safari can still be used by typing in the composer.

## Connect the AI brain

Nexus supports two providers, both through the same OpenAI-style chat protocol:

| Provider | Key looks like | Where to get it |
| --- | --- | --- |
| **Google Gemini** (default, free tier, no card) | `AIza…` | https://aistudio.google.com/app/apikey |
| **OpenAI** (paid) | `sk-…` | https://platform.openai.com/api-keys |

Two ways to supply it — pick one:

1. **Key on the device (fastest):** **Settings → Provider**, then paste the key.
   It is stored in `localStorage` on that device only and sent straight to the
   provider.
2. **Key on a server (recommended for shared devices):** run the tiny proxy in
   `server/`, then set **Settings → Backend proxy URL** and leave the key blank.

```bash
cd nexus/server
pip install -r requirements.txt
GEMINI_API_KEY=AIza... uvicorn main:app --host 0.0.0.0 --port 8000
# or OPENAI_API_KEY=sk-...
```

`npm run dev` already proxies `/api` to `http://127.0.0.1:8000`, so a local
backend URL of `http://localhost:5173` works during development.

## Install as an app (Windows / browser)

Build the static bundle and serve it over HTTPS (or `localhost`):

```bash
npm run build         # outputs nexus/dist
npm run preview       # serves the built app
```

* **Windows:** open the URL in Edge/Chrome → address-bar install icon (or
  ⋯ → *Apps → Install this site as an app*). Nexus then runs in its own window
  with a Start-menu entry.
* **Android:** open the URL in Chrome → ⋮ → *Add to home screen / Install app*.
  It launches full screen with no browser UI.
* Inside the app an **Install app** button appears whenever the browser offers
  installation.

The service worker (`public/sw.js`) caches the shell, so offline skills keep
working with no connection. The AI brain and web searches need network.

### Free hosting

The included workflow `.github/workflows/deploy-nexus.yml` builds `nexus/` and
publishes it to GitHub Pages on every push to the default branch (enable Pages →
*Source: GitHub Actions* once). That gives an HTTPS URL you can install from on
both phone and PC.

## Project layout

```
nexus/
  src/lib/speech.ts     microphone → text (Web Speech API or native recogniser)
  src/lib/tts.ts        text → speech (browser or native TTS)
  src/lib/skills.ts     offline intents + local arithmetic parser
  src/lib/brain.ts      LLM call (Gemini or OpenAI, direct or via proxy)
  src/lib/native.ts     detects the Android shell
  src/lib/storage.ts    settings, notes, reminders, history in localStorage
  src/App.tsx           voice loop and state
  android/              Capacitor Android project (native speech + TTS)
  server/main.py        optional FastAPI key-holding proxy
```

## Privacy

Conversations, notes and reminders never leave the device except for the text of
a question sent to the LLM you configured. Chromium's speech recognition does
send audio to Google's speech service — that is a browser behaviour, not Nexus.
