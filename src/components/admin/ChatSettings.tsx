"use client"

import { useCallback, useEffect, useState } from "react"
import { BrandPanel, Eyebrow, buttonClasses } from "@/components/ui/brand"

export default function ChatSettings() {
  const [enabled, setEnabled] = useState<boolean | null>(null)
  const [configured, setConfigured] = useState(false)
  const [loading, setLoading] = useState(true)
  const [toggling, setToggling] = useState(false)
  const [testEmail, setTestEmail] = useState("")
  const [testStatus, setTestStatus] = useState<"idle" | "sending" | "sent" | "error">("idle")
  const [testError, setTestError] = useState("")

  const loadSettings = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/chat-settings")
      if (!res.ok) throw new Error("Failed to load")
      const data = await res.json()
      setEnabled(data.enabled)
      setConfigured(data.configured)
    } catch {
      setEnabled(false)
      setConfigured(false)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadSettings()
  }, [loadSettings])

  const handleToggle = useCallback(async () => {
    if (enabled === null) return
    setToggling(true)
    try {
      const res = await fetch("/api/admin/chat-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !enabled }),
      })
      if (res.ok) {
        const data = await res.json()
        setEnabled(data.enabled)
      }
    } finally {
      setToggling(false)
    }
  }, [enabled])

  const handleTest = useCallback(async () => {
    if (!testEmail.trim()) return
    setTestStatus("sending")
    setTestError("")
    try {
      const res = await fetch("/api/admin/chat-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipientEmail: testEmail.trim() }),
      })
      const data = await res.json()
      if (res.ok) {
        setTestStatus("sent")
        setTimeout(() => setTestStatus("idle"), 4000)
      } else {
        setTestError(data.error || "Test failed")
        setTestStatus("error")
      }
    } catch {
      setTestError("Could not reach server")
      setTestStatus("error")
    }
  }, [testEmail])

  const solidBtn = buttonClasses({ accent: "sky", variant: "solid", size: "sm" })

  if (loading) {
    return (
      <BrandPanel accent="sky" tone="washed" className="p-6">
        <div className="animate-pulse text-sm text-muted">loading chat settings...</div>
      </BrandPanel>
    )
  }

  return (
    <BrandPanel accent="sky" tone="washed" className="p-6 space-y-5">
      <Eyebrow accent="sky">google chat notifications</Eyebrow>

      {/* Status + Toggle */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div
              className={`h-2.5 w-2.5 rounded-full ${
                configured && enabled ? "bg-green-500" : configured ? "bg-yellow-500" : "bg-red-400"
              }`}
            />
            <span className="text-sm font-semibold text-ink">
              {!configured
                ? "not configured"
                : enabled
                ? "active"
                : "paused"}
            </span>
          </div>
          {!configured && (
            <p className="text-xs text-muted">
              Missing env vars: GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY, GOOGLE_CHAT_SENDER_EMAIL
            </p>
          )}
        </div>

        {configured && (
          <button
            type="button"
            onClick={handleToggle}
            disabled={toggling}
            className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${
              enabled ? "bg-green-500" : "bg-gray-300"
            }`}
            role="switch"
            aria-checked={enabled ?? false}
          >
            <span
              className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow ring-0 transition-transform duration-200 ${
                enabled ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        )}
      </div>

      {/* Test message */}
      {configured && (
        <div className="space-y-2 border-t border-line pt-4">
          <p className="text-xs font-semibold tracking-[0.08em] text-muted">
            send test message
          </p>
          <div className="flex gap-2">
            <input
              type="email"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
              placeholder="recipient@company.com"
              className="flex-1 rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-muted/50 focus:border-brand-sky focus:outline-none focus:ring-1 focus:ring-brand-sky"
            />
            <button
              type="button"
              onClick={handleTest}
              disabled={testStatus === "sending" || !testEmail.trim()}
              className={solidBtn.className}
              style={solidBtn.style}
            >
              {testStatus === "sending" ? "sending..." : testStatus === "sent" ? "sent!" : "test"}
            </button>
          </div>
          {testStatus === "sent" && (
            <p className="text-xs text-green-600">
              Message sent — check Google Chat.
            </p>
          )}
          {testStatus === "error" && (
            <p className="text-xs text-[#d35b52]">{testError}</p>
          )}
        </div>
      )}
    </BrandPanel>
  )
}
