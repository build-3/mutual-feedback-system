"use client"

import { useCallback, useEffect, useRef, useState } from "react"

export type VoiceBarState = "idle" | "recording" | "transcribing"

interface VoiceRecorderBarProps {
  onTranscript: (text: string) => void
  disabled?: boolean
}

/**
 * iMessage-style voice recorder: tap mic to start, see waveform + timer,
 * tap blue check to send for transcription.
 */
export default function VoiceRecorderBar({ onTranscript, disabled }: VoiceRecorderBarProps) {
  const [state, setState] = useState<VoiceBarState>("idle")
  const [error, setError] = useState<string | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [levels, setLevels] = useState<number[]>(() => Array(24).fill(0.08))

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const analyserRef = useRef<AnalyserNode | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const rafRef = useRef<number>(0)
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const startTimeRef = useRef(0)

  const cleanup = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = 0
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = null
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {})
      audioCtxRef.current = null
    }
    analyserRef.current = null
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
    mediaRecorderRef.current = null
    chunksRef.current = []
  }, [])

  // Cleanup on unmount
  useEffect(() => () => cleanup(), [cleanup])

  const sampleLevels = useCallback(() => {
    const analyser = analyserRef.current
    if (!analyser) return

    const data = new Uint8Array(analyser.frequencyBinCount)
    analyser.getByteFrequencyData(data)

    // Sample 24 bars from the frequency data
    const barCount = 24
    const step = Math.floor(data.length / barCount)
    const bars: number[] = []
    for (let i = 0; i < barCount; i++) {
      // Average a slice of frequencies
      let sum = 0
      for (let j = 0; j < step; j++) {
        sum += data[i * step + j]
      }
      const avg = sum / step / 255
      // Clamp to min/max for visual appeal
      bars.push(Math.max(0.08, Math.min(1, avg * 2.5)))
    }
    setLevels(bars)
    rafRef.current = requestAnimationFrame(sampleLevels)
  }, [])

  const startRecording = useCallback(async () => {
    setError(null)
    setElapsed(0)
    setLevels(Array(24).fill(0.08))

    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Voice recording not supported in this browser.")
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      // Set up audio analyser for waveform
      const audioCtx = new AudioContext()
      audioCtxRef.current = audioCtx
      const source = audioCtx.createMediaStreamSource(stream)
      const analyser = audioCtx.createAnalyser()
      analyser.fftSize = 128
      analyser.smoothingTimeConstant = 0.4
      source.connect(analyser)
      analyserRef.current = analyser

      // Start sampling levels
      rafRef.current = requestAnimationFrame(sampleLevels)

      // Start timer
      startTimeRef.current = Date.now()
      timerRef.current = setInterval(() => {
        setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000))
      }, 200)

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
      recorder.start(250)
      setState("recording")
    } catch (err) {
      cleanup()
      if (err instanceof DOMException && err.name === "NotAllowedError") {
        setError("Microphone access denied. Check browser settings.")
      } else {
        setError("Could not start recording.")
      }
    }
  }, [cleanup, sampleLevels])

  const stopAndTranscribe = useCallback(async () => {
    const recorder = mediaRecorderRef.current
    if (!recorder || recorder.state !== "recording") {
      cleanup()
      setState("idle")
      return
    }

    const blob = await new Promise<Blob>((resolve) => {
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }
      recorder.onstop = () => {
        resolve(new Blob(chunksRef.current, { type: "audio/webm" }))
      }
      recorder.stop()
    })

    cleanup()

    if (blob.size < 100) {
      setState("idle")
      return
    }

    setState("transcribing")
    setLevels(Array(24).fill(0.08))

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
      setError(err instanceof Error ? err.message : "Transcription failed. Try again.")
    } finally {
      setState("idle")
      setElapsed(0)
    }
  }, [cleanup, onTranscript])

  const cancelRecording = useCallback(() => {
    cleanup()
    setState("idle")
    setElapsed(0)
    setLevels(Array(24).fill(0.08))
  }, [cleanup])

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m}:${s.toString().padStart(2, "0")}`
  }

  // Idle state: just the mic button
  if (state === "idle") {
    return (
      <div>
        <button
          type="button"
          onClick={startRecording}
          disabled={disabled}
          aria-label="Record voice message"
          className="flex h-12 w-12 items-center justify-center rounded-full border border-line bg-white/80 text-muted shadow-sm transition-all hover:bg-white hover:border-ink/20 hover:text-ink hover:shadow-md active:scale-95 disabled:opacity-40"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="2" width="6" height="12" rx="3" />
            <path d="M5 10a7 7 0 0 0 14 0" />
            <line x1="12" y1="17" x2="12" y2="22" />
          </svg>
        </button>
        {error && (
          <p className="mt-2 text-sm text-[#d35b52]">
            {error}
            <button
              type="button"
              onClick={() => setError(null)}
              className="ml-2 text-xs text-muted underline"
            >
              dismiss
            </button>
          </p>
        )}
      </div>
    )
  }

  // Transcribing state
  if (state === "transcribing") {
    return (
      <div className="flex items-center gap-3 rounded-full border border-line bg-white/90 px-4 py-2.5 shadow-sm">
        <svg className="h-5 w-5 animate-spin text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <circle cx="12" cy="12" r="10" strokeOpacity="0.2" />
          <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
        </svg>
        <span className="text-sm font-medium text-muted">transcribing...</span>
      </div>
    )
  }

  // Recording state: waveform + timer + cancel/confirm
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2.5 rounded-full border border-line bg-white/95 pl-3 pr-2 py-1.5 shadow-md backdrop-blur-sm">
        {/* Cancel button */}
        <button
          type="button"
          onClick={cancelRecording}
          aria-label="Cancel recording"
          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-black/5 hover:text-ink"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="4" y1="4" x2="12" y2="12" />
            <line x1="12" y1="4" x2="4" y2="12" />
          </svg>
        </button>

        {/* Waveform bars */}
        <div className="flex flex-1 items-center justify-center gap-[2px] h-8 min-w-0 overflow-hidden">
          {levels.map((level, i) => (
            <div
              key={i}
              className="w-[3px] rounded-full bg-ink/70 transition-all duration-75"
              style={{
                height: `${Math.max(3, level * 28)}px`,
              }}
            />
          ))}
        </div>

        {/* Timer */}
        <span className="flex-shrink-0 text-sm font-semibold tabular-nums text-ink/70 min-w-[40px] text-right">
          {formatTime(elapsed)}
        </span>

        {/* Confirm (send) button */}
        <button
          type="button"
          onClick={() => void stopAndTranscribe()}
          aria-label="Send voice message"
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-[#007AFF] text-white shadow-sm transition-all hover:bg-[#0066DD] active:scale-95"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="4 9 7.5 12.5 14 5.5" />
          </svg>
        </button>
      </div>
      {error && (
        <p className="text-sm text-[#d35b52]">
          {error}
          <button
            type="button"
            onClick={() => setError(null)}
            className="ml-2 text-xs text-muted underline"
          >
            dismiss
          </button>
        </p>
      )}
    </div>
  )
}
