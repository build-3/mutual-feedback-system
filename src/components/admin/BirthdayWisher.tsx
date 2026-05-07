"use client"

import { useState } from "react"
import type { Employee } from "@/lib/types"

export default function BirthdayWisher({ employees }: { employees: Employee[] }) {
  const [selectedId, setSelectedId] = useState("")
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null)

  const sorted = [...employees].sort((a, b) => a.name.localeCompare(b.name))

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

  const todayMM_DD = (() => {
    const now = new Date()
    const mm = String(now.getMonth() + 1).padStart(2, "0")
    const dd = String(now.getDate()).padStart(2, "0")
    return `${mm}-${dd}`
  })()

  const todayBirthdays = employees.filter((e) => e.birthday === todayMM_DD)
  const withBirthday = employees.filter((e) => e.birthday)
  const withoutBirthday = employees.filter((e) => !e.birthday)

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

      {/* Manual trigger */}
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
