"use client"

import { useCallback, useEffect, useState } from "react"
import type { Employee } from "@/lib/types"

type BirthdayNotification = {
  id: string
  notification_type: "monthly_roundup" | "eve_reminder" | "day_of"
  target_month: string | null
  employee_names: string[]
  sent_at: string
}

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
]

function formatBirthday(mmdd: string): string {
  const [mm, dd] = mmdd.split("-")
  const m = parseInt(mm, 10) - 1
  const d = parseInt(dd, 10)
  return `${MONTH_NAMES[m]} ${d}`
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
}

function getUpcomingBirthdays(employees: Employee[]): (Employee & { birthday: string; daysUntil: number })[] {
  const now = new Date()
  const thisYear = now.getFullYear()
  const todayMs = new Date(thisYear, now.getMonth(), now.getDate()).getTime()

  return employees
    .filter((e): e is Employee & { birthday: string } => Boolean(e.birthday) && e.is_active !== false)
    .map((e) => {
      const [mm, dd] = e.birthday.split("-").map(Number)
      let bday = new Date(thisYear, mm - 1, dd).getTime()
      if (bday < todayMs) bday = new Date(thisYear + 1, mm - 1, dd).getTime()
      const daysUntil = Math.round((bday - todayMs) / 86400000)
      return { ...e, daysUntil }
    })
    .sort((a, b) => a.daysUntil - b.daysUntil)
    .slice(0, 10)
}

const TYPE_LABELS: Record<string, { label: string; color: string; bg: string; border: string }> = {
  monthly_roundup: { label: "monthly roundup", color: "text-blue-700", bg: "bg-blue-50", border: "border-blue-200" },
  eve_reminder: { label: "eve reminder", color: "text-purple-700", bg: "bg-purple-50", border: "border-purple-200" },
  day_of: { label: "day-of wish", color: "text-yellow-700", bg: "bg-yellow-50", border: "border-yellow-200" },
}

export default function BirthdayWisher({ employees }: { employees: Employee[] }) {
  const [selectedId, setSelectedId] = useState("")
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null)
  const [notifications, setNotifications] = useState<BirthdayNotification[]>([])
  const [loadingNotifs, setLoadingNotifs] = useState(true)
  const [triggerType, setTriggerType] = useState<"monthly" | "eve" | null>(null)
  const [triggerResult, setTriggerResult] = useState<{ success: boolean; message: string } | null>(null)

  const loadNotifications = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/birthday-notifications", { cache: "no-store" })
      if (res.ok) {
        const data = await res.json()
        setNotifications(data.notifications ?? [])
      }
    } catch { /* silent */ }
    finally { setLoadingNotifs(false) }
  }, [])

  useEffect(() => { void loadNotifications() }, [loadNotifications])

  const sorted = [...employees].sort((a, b) => a.name.localeCompare(b.name))
  const upcoming = getUpcomingBirthdays(employees)

  const todayMM_DD = (() => {
    const now = new Date()
    const mm = String(now.getMonth() + 1).padStart(2, "0")
    const dd = String(now.getDate()).padStart(2, "0")
    return `${mm}-${dd}`
  })()

  const todayBirthdays = employees.filter((e) => e.birthday === todayMM_DD)
  const withBirthday = employees.filter((e) => e.birthday)
  const withoutBirthday = employees.filter((e) => !e.birthday)

  async function handleSend() {
    if (!selectedId) return
    setSending(true)
    setResult(null)
    try {
      const res = await fetch("/api/birthday/wish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeId: selectedId }),
      })
      const data = await res.json()
      if (res.ok) {
        setResult({ success: true, message: `Birthday wish sent for ${data.name}!` })
      } else {
        setResult({ success: false, message: data.error || "Failed to send." })
      }
    } catch {
      setResult({ success: false, message: "Network error." })
    } finally {
      setSending(false)
    }
  }

  async function handleTrigger(type: "monthly" | "eve") {
    setTriggerType(type)
    setTriggerResult(null)
    try {
      const path = type === "monthly" ? "/api/birthday/trigger-monthly" : "/api/birthday/trigger-eve"
      const res = await fetch(path, { method: "POST" })
      const data = await res.json()
      if (res.ok) {
        const msg = data.skipped
          ? data.reason
          : data.sent === false
          ? data.reason
          : `Sent! ${data.count} birthday${data.count === 1 ? "" : "s"} notified.`
        setTriggerResult({ success: !data.skipped && data.sent !== false, message: msg })
        void loadNotifications()
      } else {
        setTriggerResult({ success: false, message: data.error || "Failed." })
      }
    } catch {
      setTriggerResult({ success: false, message: "Network error." })
    } finally {
      setTriggerType(null)
    }
  }

  return (
    <div className="space-y-6">
      {/* Today's birthdays */}
      <div className="rounded-[20px] border border-line bg-white p-5">
        <h3 className="text-sm font-semibold text-ink">today&apos;s birthdays</h3>
        {todayBirthdays.length === 0 ? (
          <p className="mt-2 text-sm text-muted">no birthdays today.</p>
        ) : (
          <div className="mt-3 space-y-2">
            {todayBirthdays.map((e) => (
              <div key={e.id} className="flex items-center gap-2 rounded-full bg-yellow-50 border border-yellow-200 px-4 py-2">
                <span className="text-lg">🎂</span>
                <span className="text-sm font-semibold text-ink">{e.name}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Upcoming birthdays */}
      <div className="rounded-[20px] border border-line bg-white p-5">
        <h3 className="text-sm font-semibold text-ink">upcoming birthdays</h3>
        <p className="mt-1 text-xs text-muted">next 10 birthdays across the team.</p>
        {upcoming.length === 0 ? (
          <p className="mt-3 text-sm text-muted">no birthday data available.</p>
        ) : (
          <div className="mt-3 space-y-1.5">
            {upcoming.map((e) => (
              <div key={e.id} className="flex items-center justify-between rounded-[14px] border border-line bg-[#fafaf8] px-4 py-2.5">
                <div className="flex items-center gap-2.5">
                  <span className="text-base">
                    {e.daysUntil === 0 ? "🎂" : e.daysUntil === 1 ? "🎉" : e.daysUntil <= 7 ? "🎈" : "📅"}
                  </span>
                  <span className="text-sm font-semibold text-ink">{e.name}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted">{formatBirthday(e.birthday)}</span>
                  <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                    e.daysUntil === 0
                      ? "bg-yellow-100 text-yellow-800 border border-yellow-300"
                      : e.daysUntil === 1
                      ? "bg-purple-100 text-purple-700 border border-purple-200"
                      : e.daysUntil <= 7
                      ? "bg-blue-50 text-blue-700 border border-blue-200"
                      : "bg-gray-50 text-gray-500 border border-gray-200"
                  }`}>
                    {e.daysUntil === 0 ? "today!" : e.daysUntil === 1 ? "tomorrow" : `${e.daysUntil}d`}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Manual triggers */}
      <div className="rounded-[20px] border border-line bg-white p-5">
        <h3 className="text-sm font-semibold text-ink">manual triggers</h3>
        <p className="mt-1 text-xs text-muted">send notifications manually (idempotent — won&apos;t double-send).</p>
        <div className="mt-4 flex gap-3">
          <button
            type="button"
            onClick={() => handleTrigger("monthly")}
            disabled={triggerType !== null}
            className="flex-1 rounded-[14px] border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm font-semibold text-blue-700 transition-all hover:bg-blue-100 disabled:opacity-40"
          >
            {triggerType === "monthly" ? "sending..." : "send monthly roundup"}
          </button>
          <button
            type="button"
            onClick={() => handleTrigger("eve")}
            disabled={triggerType !== null}
            className="flex-1 rounded-[14px] border border-purple-200 bg-purple-50 px-4 py-2.5 text-sm font-semibold text-purple-700 transition-all hover:bg-purple-100 disabled:opacity-40"
          >
            {triggerType === "eve" ? "sending..." : "send eve reminder"}
          </button>
        </div>
        {triggerResult && (
          <div className={`mt-3 rounded-[14px] border px-3 py-2 text-xs ${
            triggerResult.success
              ? "border-green-200 bg-green-50 text-green-700"
              : "border-orange-200 bg-orange-50 text-orange-700"
          }`}>
            {triggerResult.message}
          </div>
        )}
      </div>

      {/* Send individual wish */}
      <div className="rounded-[20px] border border-line bg-white p-5">
        <h3 className="text-sm font-semibold text-ink">send birthday wish</h3>
        <p className="mt-1 text-xs text-muted">manually trigger a birthday card to Google Chat.</p>
        <div className="mt-4 flex gap-3">
          <select
            value={selectedId}
            onChange={(e) => { setSelectedId(e.target.value); setResult(null) }}
            className="flex-1 rounded-[14px] border border-line bg-[#fafaf8] px-3 py-2.5 text-sm text-ink focus:border-ink focus:outline-none"
          >
            <option value="">pick someone</option>
            {sorted.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name} {e.birthday ? `(${e.birthday})` : "(no birthday set)"}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={handleSend}
            disabled={!selectedId || sending}
            className="rounded-[14px] bg-ink px-5 py-2.5 text-sm font-semibold text-white transition-all hover:bg-ink/90 disabled:opacity-40"
          >
            {sending ? "sending..." : "send 🎂"}
          </button>
        </div>
        {result && (
          <div className={`mt-3 rounded-[14px] border px-3 py-2 text-xs ${
            result.success
              ? "border-green-200 bg-green-50 text-green-700"
              : "border-red-200 bg-red-50 text-red-600"
          }`}>
            {result.message}
          </div>
        )}
      </div>

      {/* Notification log */}
      <div className="rounded-[20px] border border-line bg-white p-5">
        <h3 className="text-sm font-semibold text-ink">notification log</h3>
        <p className="mt-1 text-xs text-muted">recent automated and manual birthday notifications.</p>
        {loadingNotifs ? (
          <p className="mt-3 text-sm text-muted animate-pulse">loading...</p>
        ) : notifications.length === 0 ? (
          <p className="mt-3 text-sm text-muted">no notifications sent yet.</p>
        ) : (
          <div className="mt-3 space-y-2">
            {notifications.map((n) => {
              const style = TYPE_LABELS[n.notification_type] ?? TYPE_LABELS.day_of
              return (
                <div key={n.id} className="rounded-[14px] border border-line bg-[#fafaf8] px-4 py-3">
                  <div className="flex items-center justify-between">
                    <span className={`rounded-full ${style.bg} ${style.border} border px-2.5 py-0.5 text-[11px] font-semibold ${style.color}`}>
                      {style.label}
                    </span>
                    <span className="text-[11px] text-muted">{formatDate(n.sent_at)}</span>
                  </div>
                  <div className="mt-1.5 text-xs text-ink">
                    {n.employee_names.join(", ")}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Birthday stats */}
      <div className="rounded-[20px] border border-line bg-white p-5">
        <h3 className="text-sm font-semibold text-ink">birthday tracker</h3>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div className="rounded-[14px] bg-green-50 border border-green-200 px-4 py-3 text-center">
            <div className="text-2xl font-bold text-green-700">{withBirthday.length}</div>
            <div className="text-xs text-green-600">birthdays saved</div>
          </div>
          <div className="rounded-[14px] bg-orange-50 border border-orange-200 px-4 py-3 text-center">
            <div className="text-2xl font-bold text-orange-700">{withoutBirthday.length}</div>
            <div className="text-xs text-orange-600">still missing</div>
          </div>
        </div>
        {withoutBirthday.length > 0 && (
          <div className="mt-3">
            <p className="text-xs text-muted mb-2">missing birthdays:</p>
            <div className="flex flex-wrap gap-1.5">
              {withoutBirthday.map((e) => (
                <span key={e.id} className="rounded-full bg-orange-50 border border-orange-200 px-2.5 py-1 text-[11px] font-medium text-orange-700">
                  {e.name}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
