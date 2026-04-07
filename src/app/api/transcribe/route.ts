import { NextResponse } from "next/server"
import { requireAuth } from "@/lib/server/require-admin"
import { consumeRateLimit, getRequestIp } from "@/lib/server/rate-limit"

// Whisper hallucinates these phrases on short/silent audio
const WHISPER_HALLUCINATIONS = [
  "transcribed by otter",
  "transcribed by https://otter.ai",
  "transcribed by http",
  "thanks for watching",
  "thank you for watching",
  "subscribe",
  "like and subscribe",
  "please subscribe",
  "see you next time",
  "bye bye",
  "thank you.",
  "thanks.",
  "...",
  "the end",
  "silence",
]

const ALLOWED_AUDIO_TYPES = [
  "audio/webm",
  "audio/mp4",
  "audio/mpeg",
  "audio/wav",
  "audio/ogg",
  "audio/x-m4a",
  "audio/mp3",
]

export async function POST(request: Request) {
  const auth = await requireAuth()
  if (auth.error) return auth.error

  const ip = getRequestIp(request)
  const rateLimit = consumeRateLimit({
    bucket: "transcribe",
    key: ip,
    limit: 10,
    windowMs: 60_000,
  })
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many transcription requests. Please wait a moment." },
      { status: 429 }
    )
  }

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      { error: "Voice transcription is not configured." },
      { status: 503 }
    )
  }

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json(
      { error: "Invalid request — expected multipart form data." },
      { status: 400 }
    )
  }

  const audio = formData.get("audio") as File | null
  if (!audio || audio.size === 0) {
    return NextResponse.json(
      { error: "No audio provided." },
      { status: 400 }
    )
  }

  // Whisper limit is 25MB
  if (audio.size > 25 * 1024 * 1024) {
    return NextResponse.json(
      { error: "Audio file too large (max 25 MB)." },
      { status: 413 }
    )
  }

  if (audio.type && !ALLOWED_AUDIO_TYPES.includes(audio.type)) {
    return NextResponse.json(
      { error: "Unsupported audio format." },
      { status: 415 }
    )
  }

  const openaiForm = new FormData()
  openaiForm.append("file", audio, "recording.webm")
  openaiForm.append("model", "whisper-1")
  openaiForm.append(
    "prompt",
    "Internal team feedback. Conversational tone, may include filler words."
  )

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15_000)

    const response = await fetch(
      "https://api.openai.com/v1/audio/transcriptions",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: openaiForm,
        signal: controller.signal,
      }
    ).finally(() => clearTimeout(timeout))

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "")
      console.error("[transcribe] OpenAI error:", response.status, errorBody)
      return NextResponse.json(
        { error: "Transcription failed. Try again." },
        { status: 502 }
      )
    }

    const result = await response.json()
    const raw = (result.text ?? "").trim()

    // Whisper hallucinates filler on short/silent audio — strip it
    const isHallucination = WHISPER_HALLUCINATIONS.some(
      (h) => raw.toLowerCase().startsWith(h) || raw.toLowerCase() === h
    )

    return NextResponse.json({ text: isHallucination ? "" : raw })
  } catch {
    return NextResponse.json(
      { error: "Transcription service unavailable." },
      { status: 502 }
    )
  }
}
