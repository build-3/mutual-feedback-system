"use client"

import { useState } from "react"
import { buttonClasses } from "@/components/ui/brand"

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
]

function daysInMonth(month: number): number {
  if ([4, 6, 9, 11].includes(month)) return 30
  if (month === 2) return 29
  return 31
}

export default function BirthdayDialog({
  onSaved,
}: {
  onSaved: (birthday: string) => void
}) {
  const [month, setMonth] = useState<number>(0)
  const [day, setDay] = useState<number>(0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  const maxDays = month > 0 ? daysInMonth(month) : 31

  async function handleSave() {
    if (!month || !day) {
      setError("pick your birth month and day.")
      return
    }
    if (day > daysInMonth(month)) {
      setError("that day doesn't exist for this month.")
      return
    }

    setSaving(true)
    setError("")

    const mm = String(month).padStart(2, "0")
    const dd = String(day).padStart(2, "0")
    const birthday = `${mm}-${dd}`

    try {
      const res = await fetch("/api/birthday", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ birthday }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error || "failed to save. try again.")
        return
      }

      onSaved(birthday)
    } catch {
      setError("network error. try again.")
    } finally {
      setSaving(false)
    }
  }

  const saveBtn = buttonClasses({ accent: "yellow", variant: "solid", size: "lg" })

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div className="relative z-10 w-full max-w-sm rounded-[28px] border border-line bg-white p-7 shadow-2xl">
        <div className="text-center">
          <div className="mb-4 text-4xl">🎂</div>
          <h2 className="text-xl font-bold tracking-[-0.04em] text-ink">
            when&apos;s your birthday?
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted">
            we&apos;d love to celebrate you on your special day.
          </p>
        </div>

        <div className="mt-6 flex gap-3">
          <div className="flex-1">
            <label className="mb-1.5 block text-xs font-semibold text-muted">month</label>
            <select
              value={month}
              onChange={(e) => {
                const m = Number(e.target.value)
                setMonth(m)
                if (day > daysInMonth(m)) setDay(0)
                setError("")
              }}
              className="w-full rounded-[16px] border border-line bg-[#fafaf8] px-3 py-3 text-sm font-medium text-ink focus:border-ink focus:outline-none"
            >
              <option value={0}>pick month</option>
              {MONTHS.map((name, i) => (
                <option key={name} value={i + 1}>{name}</option>
              ))}
            </select>
          </div>
          <div className="w-24">
            <label className="mb-1.5 block text-xs font-semibold text-muted">day</label>
            <select
              value={day}
              onChange={(e) => { setDay(Number(e.target.value)); setError("") }}
              className="w-full rounded-[16px] border border-line bg-[#fafaf8] px-3 py-3 text-sm font-medium text-ink focus:border-ink focus:outline-none"
            >
              <option value={0}>day</option>
              {Array.from({ length: maxDays }, (_, i) => i + 1).map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>
        </div>

        {error && (
          <div className="mt-3 rounded-[14px] border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
            {error}
          </div>
        )}

        <button
          type="button"
          className={`${saveBtn.className} mt-5 w-full`}
          style={saveBtn.style}
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? "saving..." : "save my birthday"}
        </button>
      </div>
    </div>
  )
}
