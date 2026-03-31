import { NextResponse } from "next/server"
import { requireAuth } from "@/lib/server/require-admin"

export async function POST(request: Request) {
  const auth = await requireAuth()
  if (auth.error) return auth.error

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

  const openaiForm = new FormData()
  openaiForm.append("file", audio, "recording.webm")
  openaiForm.append("model", "whisper-1")
  openaiForm.append(
    "prompt",
    "Internal team feedback. Conversational tone, may include filler words."
  )

  try {
    const response = await fetch(
      "https://api.openai.com/v1/audio/transcriptions",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: openaiForm,
      }
    )

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "")
      console.error("[transcribe] OpenAI error:", response.status, errorBody)
      return NextResponse.json(
        { error: "Transcription failed. Try again." },
        { status: 502 }
      )
    }

    const result = await response.json()
    return NextResponse.json({ text: result.text ?? "" })
  } catch {
    return NextResponse.json(
      { error: "Transcription service unavailable." },
      { status: 502 }
    )
  }
}
