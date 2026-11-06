"use client"

import { useCallback, useEffect, useState } from "react"
import { BrandPanel, SectionHeading, badgeClasses } from "@/components/ui/brand"

type Person = {
  employee_id: string
  name: string
  status: string
  end_date: string
  sponsor_id: string | null
  buddy_id: string | null
}

type RosterEntry = { id: string; name: string; role: string }

type RowState = { saving?: boolean; saved?: boolean; error?: string }

function formatDate(dateStr: string): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}

/**
 * Assign a sponsor and a buddy to everyone on probation. This is the only place
 * it is done. The sponsor can be anyone on the team; once set, they see that
 * person's probation card on /insights and get the low-trust feedback alerts.
 */
export default function SponsorAssignment() {
  const [people, setPeople] = useState<Person[]>([])
  const [roster, setRoster] = useState<RosterEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [rows, setRows] = useState<Record<string, RowState>>({})

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/probation/assignment", { cache: "no-store" })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? "could not load")
      }
      const data = await res.json()
      setPeople(data.people ?? [])
      setRoster(data.roster ?? [])
      setError("")
    } catch (err) {
      setError(err instanceof Error ? err.message : "could not load")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function assign(employeeId: string, field: "sponsorId" | "buddyId", value: string) {
    setRows((r) => ({ ...r, [employeeId]: { saving: true } }))
    try {
      const res = await fetch("/api/admin/probation/assignment", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeId, [field]: value === "" ? null : value }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setRows((r) => ({ ...r, [employeeId]: { error: data.error ?? "could not save" } }))
        return
      }
      setPeople((list) =>
        list.map((p) =>
          p.employee_id === employeeId
            ? {
                ...p,
                ...(field === "sponsorId" ? { sponsor_id: value === "" ? null : value } : {}),
                ...(field === "buddyId" ? { buddy_id: value === "" ? null : value } : {}),
              }
            : p
        )
      )
      setRows((r) => ({ ...r, [employeeId]: { saved: true } }))
    } catch {
      setRows((r) => ({ ...r, [employeeId]: { error: "network error" } }))
    }
  }

  if (loading) {
    return <div className="animate-pulse text-muted text-sm py-6">loading probation list...</div>
  }
  if (error) {
    return <div className="text-[#d35b52] text-sm py-6">{error}</div>
  }

  const missing = people.filter((p) => !p.sponsor_id).length

  return (
    <div className="space-y-6">
      <SectionHeading
        accent="lavender"
        eyebrow="probation"
        title="sponsors and buddies"
        description={
          people.length === 0
            ? "nobody is on probation right now."
            : missing > 0
            ? `${missing} of ${people.length} on probation have no sponsor yet.`
            : `all ${people.length} on probation have a sponsor.`
        }
      />

      <p className="text-xs">
        <a href="/probation" className="font-semibold text-ink underline">
          open the full probation board →
        </a>
      </p>

      <p className="text-xs text-muted max-w-2xl">
        the sponsor owns the probation conversation. they see their person&apos;s probation card and
        are told when that person gets low-trust feedback. the buddy only helps them settle in.
        either can be anyone on the team.
      </p>

      <div className="space-y-3">
        {people.map((p) => {
          const state = rows[p.employee_id] ?? {}
          const options = roster.filter((r) => r.id !== p.employee_id)
          return (
            <BrandPanel key={p.employee_id} accent="lavender" tone="soft" className="p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <div>
                  <div className="text-sm font-semibold text-ink">{p.name}</div>
                  <div className="text-[11px] text-muted">
                    {p.status} · ends {formatDate(p.end_date)}
                  </div>
                </div>
                {!p.sponsor_id && (
                  <span {...badgeClasses({ accent: "peach", tone: "soft" })}>no sponsor</span>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-[11px] text-muted font-medium">sponsor</span>
                  <select
                    value={p.sponsor_id ?? ""}
                    onChange={(e) => assign(p.employee_id, "sponsorId", e.target.value)}
                    disabled={state.saving}
                    className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink"
                  >
                    <option value="">no sponsor</option>
                    {options.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-[11px] text-muted font-medium">buddy</span>
                  <select
                    value={p.buddy_id ?? ""}
                    onChange={(e) => assign(p.employee_id, "buddyId", e.target.value)}
                    disabled={state.saving}
                    className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink"
                  >
                    <option value="">no buddy</option>
                    {options.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="mt-2 h-4 text-[11px]">
                {state.saving && <span className="text-muted">saving...</span>}
                {state.saved && <span className="text-[#4a8c6f]">saved</span>}
                {state.error && <span className="text-[#d35b52]">{state.error}</span>}
              </div>
            </BrandPanel>
          )
        })}
      </div>
    </div>
  )
}
