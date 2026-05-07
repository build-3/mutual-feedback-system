"use client"

import { useState, useEffect, useCallback } from "react"
import type { Employee } from "@/lib/types"
import SearchableDropdown from "@/components/SearchableDropdown"
import {
  BrandPanel,
  SectionHeading,
  buttonClasses,
  fieldClasses,
} from "@/components/ui/brand"

type Status = "idle" | "sending" | "done" | "error"

export default function KudosCard() {
  const [recipients, setRecipients] = useState<Employee[]>([])
  const [message, setMessage] = useState("")
  const [gifUrl, setGifUrl] = useState<string | null>(null)
  const [gifLoading, setGifLoading] = useState(false)
  const [status, setStatus] = useState<Status>("idle")
  const [errorMessage, setErrorMessage] = useState("")
  const [senderId, setSenderId] = useState<string | null>(null)

  useEffect(() => {
    fetch("/api/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.employee?.id) setSenderId(data.employee.id)
      })
      .catch(() => {})
  }, [])

  const fetchGif = useCallback(async () => {
    setGifLoading(true)
    try {
      const res = await fetch("/api/kudos/gif")
      if (res.ok) {
        const data = await res.json()
        if (data.url) setGifUrl(data.url)
      }
    } catch {
      // keep existing gif
    } finally {
      setGifLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchGif()
  }, [fetchGif])

  function addRecipient(employee: Employee | null) {
    if (!employee) return
    if (recipients.some((r) => r.id === employee.id)) return
    setRecipients((prev) => [...prev, employee])
  }

  function removeRecipient(id: string) {
    setRecipients((prev) => prev.filter((r) => r.id !== id))
  }

  async function handleSend() {
    if (recipients.length === 0 || !gifUrl) return
    const trimmed = message.trim()
    if (trimmed.length < 10) {
      setErrorMessage("Write at least 10 characters.")
      return
    }
    if (trimmed.length > 500) {
      setErrorMessage("Keep it under 500 characters.")
      return
    }

    setStatus("sending")
    setErrorMessage("")

    try {
      const res = await fetch("/api/kudos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipientIds: recipients.map((r) => r.id),
          message: trimmed,
          gifUrl,
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Unknown error" }))
        throw new Error(data.error || `Request failed (${res.status})`)
      }

      setStatus("done")
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "Something went wrong.")
      setStatus("error")
    }
  }

  function handleReset() {
    setRecipients([])
    setMessage("")
    setGifUrl(null)
    setStatus("idle")
    setErrorMessage("")
    fetchGif()
  }

  const canSend = recipients.length > 0 && message.trim().length >= 10 && gifUrl && status !== "sending"

  if (status === "done") {
    const btn = buttonClasses({ accent: "yellow", variant: "solid", size: "lg" })
    const names = recipients.map((r) => r.name)
    const nameStr = names.length <= 2
      ? names.join(" & ")
      : `${names.slice(0, -1).join(", ")} & ${names[names.length - 1]}`
    return (
      <BrandPanel accent="yellow" tone="soft" className="p-6 sm:p-8 text-center">
        <div className="space-y-4">
          <div className="text-4xl">🎉</div>
          <h2 className="text-2xl font-bold tracking-tight text-ink">kudos sent!</h2>
          <p className="text-sm text-muted">
            {nameStr} will see your shoutout in the chat.
          </p>
          {errorMessage && (
            <p className="text-xs text-[#d35b52]">{errorMessage}</p>
          )}
          <button
            type="button"
            onClick={handleReset}
            className={btn.className}
            style={btn.style}
          >
            send another
          </button>
        </div>
      </BrandPanel>
    )
  }

  const sendBtn = buttonClasses({
    accent: "yellow",
    variant: "solid",
    size: "lg",
    fullWidth: true,
  })
  const shuffleBtn = buttonClasses({ accent: "yellow", variant: "outline", size: "sm" })
  const messageLen = message.trim().length
  const excludeIds = [senderId, ...recipients.map((r) => r.id)].filter(Boolean) as string[]

  return (
    <div className="space-y-6">
      <SectionHeading
        accent="yellow"
        eyebrow="shout it out"
        title="send kudos"
        description="recognize a teammate for something awesome they did."
      />

      <BrandPanel accent="yellow" tone="washed" className="p-5 sm:p-6 space-y-5">
        {/* Recipients */}
        <div className="space-y-2">
          <label className="text-xs font-semibold tracking-wide text-muted">who deserves kudos?</label>
          {recipients.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {recipients.map((r) => (
                <span
                  key={r.id}
                  className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white/80 px-3 py-1.5 text-sm font-medium text-ink shadow-sm"
                >
                  {r.name}
                  <button
                    type="button"
                    onClick={() => removeRecipient(r.id)}
                    className="ml-0.5 rounded-full p-0.5 text-muted hover:text-ink transition-colors"
                    aria-label={`Remove ${r.name}`}
                  >
                    ✕
                  </button>
                </span>
              ))}
            </div>
          )}
          <SearchableDropdown
            value={null}
            onChange={addRecipient}
            excludeEmployeeIds={excludeIds}
            placeholder={recipients.length > 0 ? "add another person..." : "search by name..."}
          />
        </div>

        {/* Message */}
        <div className="space-y-2">
          <label className="text-xs font-semibold tracking-wide text-muted">
            what did they do?
          </label>
          <textarea
            value={message}
            onChange={(e) => {
              setMessage(e.target.value)
              if (errorMessage) setErrorMessage("")
            }}
            placeholder="they absolutely crushed it when..."
            rows={3}
            maxLength={500}
            className={fieldClasses({ hasError: !!errorMessage })}
          />
          <div className="flex items-center justify-between text-[11px] text-muted">
            {errorMessage ? (
              <span className="text-[#d35b52] font-medium">{errorMessage}</span>
            ) : (
              <span />
            )}
            <span>{messageLen}/500</span>
          </div>
        </div>

        {/* GIF preview */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold tracking-wide text-muted">celebration gif</label>
            <button
              type="button"
              onClick={fetchGif}
              disabled={gifLoading}
              className={shuffleBtn.className}
              style={shuffleBtn.style}
            >
              {gifLoading ? "loading..." : "shuffle ↻"}
            </button>
          </div>
          <div className="relative overflow-hidden rounded-2xl border border-line bg-white/60">
            {gifUrl ? (
              <img
                src={gifUrl}
                alt="Celebration GIF"
                className="w-full max-h-64 object-cover"
              />
            ) : (
              <div className="flex h-40 items-center justify-center text-sm text-muted">
                {gifLoading ? "fetching a gif..." : "no gif loaded"}
              </div>
            )}
          </div>
        </div>

        {/* Send */}
        <button
          type="button"
          onClick={handleSend}
          disabled={!canSend}
          className={sendBtn.className}
          style={sendBtn.style}
        >
          {status === "sending"
            ? "sending..."
            : recipients.length > 1
              ? `send kudos to ${recipients.length} people 🎉`
              : "send kudos 🎉"}
        </button>
      </BrandPanel>
    </div>
  )
}
