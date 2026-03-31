"use client"

import { useCallback, useRef, useState } from "react"

export type VoiceState = "idle" | "recording" | "transcribing"

interface UseVoiceRecorderReturn {
  state: VoiceState
  toggle: () => void
  error: string | null
  clearError: () => void
}

export function useVoiceRecorder(
  onTranscript: (text: string) => void
): UseVoiceRecorderReturn {
  const [state, setState] = useState<VoiceState>("idle")
  const [error, setError] = useState<string | null>(null)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])

  const cleanup = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
    mediaRecorderRef.current = null
    chunksRef.current = []
  }, [])

  const stopAndTranscribe = useCallback(async () => {
    const recorder = mediaRecorderRef.current
    if (!recorder || recorder.state !== "recording") {
      cleanup()
      setState("idle")
      return
    }

    // Collect the final chunks via a promise
    const blob = await new Promise<Blob>((resolve) => {
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }
      recorder.onstop = () => {
        const collected = new Blob(chunksRef.current, { type: "audio/webm" })
        resolve(collected)
      }
      recorder.stop()
    })

    // Release mic immediately
    cleanup()

    if (blob.size < 100) {
      // Too short / silent — skip
      setState("idle")
      return
    }

    setState("transcribing")

    try {
      const form = new FormData()
      form.append("audio", blob, "recording.webm")

      const res = await fetch("/api/transcribe", {
        method: "POST",
        body: form,
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || "Transcription failed")
      }

      const { text } = await res.json()
      if (text && text.trim()) {
        onTranscript(text.trim())
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Transcription failed. Try again."
      )
    } finally {
      setState("idle")
    }
  }, [cleanup, onTranscript])

  const startRecording = useCallback(async () => {
    setError(null)

    // Check browser support
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setError("Voice recording not supported in this browser.")
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      // Pick the best supported mime type
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : "audio/mp4"

      const recorder = new MediaRecorder(stream, { mimeType })
      mediaRecorderRef.current = recorder
      chunksRef.current = []

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }

      recorder.start(250) // collect chunks every 250ms
      setState("recording")
    } catch (err) {
      cleanup()
      if (err instanceof DOMException && err.name === "NotAllowedError") {
        setError("Microphone access denied. Check browser settings.")
      } else {
        setError("Could not start recording.")
      }
    }
  }, [cleanup])

  const toggle = useCallback(() => {
    if (state === "recording") {
      void stopAndTranscribe()
    } else if (state === "idle") {
      void startRecording()
    }
    // If transcribing, ignore taps
  }, [state, startRecording, stopAndTranscribe])

  const clearError = useCallback(() => setError(null), [])

  return { state, toggle, error, clearError }
}
