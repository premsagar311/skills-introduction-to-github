"""Optional Nexus backend proxy.

Keeps the OpenAI key on a server instead of on the phone or PC. Point the app's
"Backend proxy URL" setting at this service and leave the in-app key blank.

    pip install -r requirements.txt
    OPENAI_API_KEY=sk-... uvicorn main:app --host 0.0.0.0 --port 8000
"""

from __future__ import annotations

import os
import re
from typing import Literal

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

OPENAI_URL = "https://api.openai.com/v1/chat/completions"
SECRET_PATTERN = re.compile(r"sk-[A-Za-z0-9_*-]{6,}")
ALLOWED_ORIGINS = os.environ.get("NEXUS_ALLOWED_ORIGINS", "*").split(",")

app = FastAPI(title="Nexus backend", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["POST", "GET", "OPTIONS"],
    allow_headers=["*"],
)


class Turn(BaseModel):
    role: Literal["system", "user", "assistant"]
    content: str


class ChatRequest(BaseModel):
    messages: list[Turn] = Field(min_length=1)
    model: str = "gpt-4o-mini"
    temperature: float = 0.6
    max_tokens: int = Field(default=300, ge=16, le=2000)


class ChatResponse(BaseModel):
    reply: str


def _redact(text: str, api_key: str) -> str:
    """Upstream errors quote the offending key back at us; never pass it to a client."""
    return SECRET_PATTERN.sub("sk-***", text.replace(api_key, "***"))


@app.get("/api/health")
async def health() -> dict[str, object]:
    return {"ok": True, "has_key": bool(os.environ.get("OPENAI_API_KEY"))}


@app.post("/api/chat", response_model=ChatResponse)
async def chat(request: ChatRequest) -> ChatResponse:
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=503, detail="OPENAI_API_KEY is not set on the server")

    payload = {
        "model": request.model,
        "messages": [turn.model_dump() for turn in request.messages],
        "temperature": request.temperature,
        "max_tokens": request.max_tokens,
    }

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(
                OPENAI_URL,
                headers={"Authorization": f"Bearer {api_key}"},
                json=payload,
            )
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"Upstream request failed: {exc}") from exc

    if response.status_code >= 400:
        raise HTTPException(
            status_code=response.status_code,
            detail=_redact(response.text, api_key)[:400],
        )

    data = response.json()
    try:
        reply = data["choices"][0]["message"]["content"].strip()
    except (KeyError, IndexError, AttributeError) as exc:
        raise HTTPException(status_code=502, detail="Unexpected upstream response") from exc

    return ChatResponse(reply=reply)
