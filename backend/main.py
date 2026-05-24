import base64
import json
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Literal, Optional

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from google import genai
from google.genai import types
from pydantic import BaseModel, Field

load_dotenv(dotenv_path=Path(__file__).resolve().parents[1] / ".env")

app = FastAPI(title="Gemini Chat Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DEFAULT_MODEL = "gemma-4-26b-a4b-it"
SYSTEM_PROMPT = "You are a helpful chat assistant. Keep answers concise unless the user asks for detail."


class ImageAttachment(BaseModel):
    name: Optional[str] = None
    mime_type: str = Field(alias="mimeType")
    data_url: str = Field(alias="dataUrl")


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str
    images: list[ImageAttachment] = Field(default_factory=list)


class ChatRequest(BaseModel):
    messages: list[ChatMessage]
    model: Optional[str] = None


class ChatResponse(BaseModel):
    reply: str
    model: str


class StreamErrorResponse(BaseModel):
    error: str


@dataclass(frozen=True)
class AppSettings:
    api_key: str


def get_settings() -> AppSettings:
    api_key = os.getenv("AI-KEY") or os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="Missing AI-KEY environment variable")
    return AppSettings(api_key=api_key)


def get_client() -> genai.Client:
    settings = get_settings()
    return genai.Client(api_key=settings.api_key)


def decode_data_url(data_url: str) -> tuple[str, bytes]:
    prefix, encoded = data_url.split(",", 1)
    mime_type = prefix.split(";", 1)[0].removeprefix("data:") if prefix.startswith("data:") else "application/octet-stream"
    return mime_type, base64.b64decode(encoded)


def build_contents(messages: list[ChatMessage]) -> list[types.Content]:
    contents: list[types.Content] = []
    for message in messages:
        parts: list[types.Part] = []
        if message.content.strip():
            parts.append(types.Part(text=message.content))

        for image in message.images:
            _, image_bytes = decode_data_url(image.data_url)
            parts.append(
                types.Part(
                    inline_data=types.Blob(
                        mime_type=image.mime_type,
                        data=image_bytes,
                    )
                )
            )

        if not parts:
            continue

        role = "user" if message.role == "user" else "model"
        contents.append(types.Content(role=role, parts=parts))

    return contents


def sse_event(event: str, payload: dict[str, object]) -> str:
    return f"event: {event}\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n"


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/chat")
def chat(payload: ChatRequest) -> StreamingResponse:
    if not payload.messages:
        raise HTTPException(status_code=400, detail="messages cannot be empty")

    client = get_client()
    contents = build_contents(payload.messages)
    model = payload.model or DEFAULT_MODEL

    def stream():
        yield sse_event("meta", {"model": model})

        try:
            response_stream = client.models.generate_content_stream(
                model=model,
                contents=contents,
                config=types.GenerateContentConfig(system_instruction=SYSTEM_PROMPT),
            )
            accumulated = []
            for chunk in response_stream:
                delta = getattr(chunk, "text", "") or ""
                if delta:
                    accumulated.append(delta)
                    yield sse_event("delta", {"text": delta})

            full_text = "".join(accumulated).strip() or "No response text returned."
            yield sse_event("done", {"reply": full_text, "model": model})
        except Exception as exc:  # pragma: no cover - surface provider errors to client
            yield sse_event("error", {"error": f"Gemini request failed: {exc}"})

    return StreamingResponse(stream(), media_type="text/event-stream")
