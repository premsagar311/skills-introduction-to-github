const connectButton = document.getElementById("connect");
const disconnectButton = document.getElementById("disconnect");
const muteCheckbox = document.getElementById("mute");
const statusEl = document.getElementById("status");
const transcriptEl = document.getElementById("transcript");
const textForm = document.getElementById("text-form");
const textInput = document.getElementById("text-input");
const sendButton = document.getElementById("send");
const audioEl = document.getElementById("assistant-audio");

const REALTIME_URL = "https://api.openai.com/v1/realtime/calls";

let peerConnection = null;
let dataChannel = null;
let microphone = null;
const assistantMessages = new Map();

function setStatus(text, state = "idle") {
  statusEl.textContent = text;
  statusEl.dataset.state = state;
}

function setConnected(connected) {
  connectButton.disabled = connected;
  disconnectButton.disabled = !connected;
  textInput.disabled = !connected;
  sendButton.disabled = !connected;
}

function appendMessage(role, text) {
  const item = document.createElement("li");
  item.className = role;
  const speaker = document.createElement("span");
  speaker.className = "speaker";
  speaker.textContent = role === "user" ? "You" : "Assistant";
  const body = document.createElement("span");
  body.textContent = text;
  item.append(speaker, body);
  transcriptEl.append(item);
  item.scrollIntoView({ block: "nearest" });
  return body;
}

function appendAssistantDelta(responseId, delta) {
  let body = assistantMessages.get(responseId);
  if (!body) {
    body = appendMessage("assistant", "");
    assistantMessages.set(responseId, body);
  }
  body.textContent += delta;
}

function handleServerEvent(event) {
  switch (event.type) {
    case "conversation.item.input_audio_transcription.completed":
      if (event.transcript) {
        appendMessage("user", event.transcript);
      }
      break;
    case "response.output_audio_transcript.delta":
    case "response.audio_transcript.delta":
    case "response.output_text.delta":
      appendAssistantDelta(event.response_id ?? "pending", event.delta ?? "");
      break;
    case "response.done":
      assistantMessages.delete(event.response?.id ?? "pending");
      assistantMessages.delete("pending");
      break;
    case "error":
      console.error("Realtime error:", event.error);
      setStatus(`Error: ${event.error?.message ?? "unknown"}`, "error");
      break;
    default:
      break;
  }
}

async function requestToken() {
  const response = await fetch("/api/token", { method: "POST" });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error ?? "Could not create a realtime session");
  }
  return data;
}

async function connect() {
  connectButton.disabled = true;
  setStatus("Requesting session token…");

  try {
    const session = await requestToken();

    setStatus("Requesting microphone access…");
    microphone = await navigator.mediaDevices.getUserMedia({ audio: true });

    peerConnection = new RTCPeerConnection();
    peerConnection.ontrack = (event) => {
      audioEl.srcObject = event.streams[0];
    };
    peerConnection.onconnectionstatechange = () => {
      if (peerConnection?.connectionState === "failed") {
        setStatus("Connection failed", "error");
        setConnected(false);
      }
    };
    peerConnection.addTrack(microphone.getAudioTracks()[0]);

    dataChannel = peerConnection.createDataChannel("oai-events");
    dataChannel.addEventListener("message", (event) => {
      handleServerEvent(JSON.parse(event.data));
    });
    dataChannel.addEventListener("open", () => {
      setStatus(`Connected (${session.model}, voice: ${session.voice}) — start speaking`, "connected");
      setConnected(true);
    });

    setStatus("Connecting to the Realtime API…");
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);

    const sdpResponse = await fetch(REALTIME_URL, {
      method: "POST",
      body: offer.sdp,
      headers: {
        Authorization: `Bearer ${session.value}`,
        "Content-Type": "application/sdp",
      },
    });

    const answerSdp = await sdpResponse.text();
    if (!sdpResponse.ok) {
      throw new Error(`Realtime API rejected the offer: ${answerSdp}`);
    }

    await peerConnection.setRemoteDescription({ type: "answer", sdp: answerSdp });
  } catch (error) {
    console.error(error);
    setStatus(error.message, "error");
    disconnect();
  }
}

function disconnect() {
  dataChannel?.close();
  dataChannel = null;
  peerConnection?.close();
  peerConnection = null;
  microphone?.getTracks().forEach((track) => track.stop());
  microphone = null;
  audioEl.srcObject = null;
  assistantMessages.clear();
  muteCheckbox.checked = false;
  setConnected(false);
  if (statusEl.dataset.state !== "error") {
    setStatus("Idle");
  }
}

function sendText(text) {
  if (dataChannel?.readyState !== "open") {
    return;
  }
  appendMessage("user", text);
  dataChannel.send(
    JSON.stringify({
      type: "conversation.item.create",
      item: {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text }],
      },
    }),
  );
  dataChannel.send(JSON.stringify({ type: "response.create" }));
}

connectButton.addEventListener("click", connect);
disconnectButton.addEventListener("click", () => {
  setStatus("Idle");
  disconnect();
});

muteCheckbox.addEventListener("change", () => {
  microphone?.getAudioTracks().forEach((track) => {
    track.enabled = !muteCheckbox.checked;
  });
});

textForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const text = textInput.value.trim();
  if (!text) {
    return;
  }
  textInput.value = "";
  sendText(text);
});

window.addEventListener("beforeunload", disconnect);
