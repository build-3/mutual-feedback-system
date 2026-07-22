"use client"

import { useMemo, useState } from "react"
import { BrandPanel, EmptyState } from "@/components/ui/brand"
import { ModResponse, trustColor } from "./types"
import { withAlphaHex } from "./color"

function Field({ label, value }: { label: string; value: string | null }) {
  if (!value) return null
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">{label}</div>
      <p className="mt-0.5 text-sm leading-6 text-ink whitespace-pre-line">{value}</p>
    </div>
  )
}

export default function ResponsesList({ responses }: { responses: ModResponse[] }) {
  const [query, setQuery] = useState("")

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return responses
    return responses.filter((r) => (r.employee_name ?? "").toLowerCase().includes(q))
  }, [responses, query])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="search by name…"
          className="rounded-full border border-line bg-white/85 px-4 py-2 text-sm text-ink placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/10"
        />
        <span className="text-xs text-muted">{filtered.length} responses</span>
      </div>

      {filtered.length === 0 ? (
        <EmptyState accent="sky" title="no responses" description="No responses match this search." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {filtered.map((r) => {
            const pct = r.trust_battery == null ? null : Math.round(r.trust_battery * 100)
            return (
              <BrandPanel key={r.id} accent="sky" tone="plain" className="space-y-3 p-4 sm:p-5">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-ink">{r.employee_name || "—"}</div>
                  <div className="flex items-center gap-1.5">
                    {pct != null && (
                      <span
                        className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold"
                        style={{
                          backgroundColor: withAlphaHex(trustColor(pct), 0.18),
                          borderColor: withAlphaHex(trustColor(pct), 0.5),
                          color: "#1d1d1b",
                        }}
                      >
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: trustColor(pct) }} />
                        trust {pct}%
                      </span>
                    )}
                    {r.nps_score != null && (
                      <span className="inline-flex items-center rounded-full border border-line bg-white/70 px-2.5 py-1 text-[11px] font-semibold text-ink">
                        NPS {r.nps_score}
                      </span>
                    )}
                  </div>
                </div>
                <Field label="policy clarity" value={r.policy_clarity} />
                <Field label="tools & resources" value={r.tools_resources} />
                <Field label="trust battery" value={r.trust_battery_details} />
                <Field label="comments" value={r.comments} />
              </BrandPanel>
            )
          })}
        </div>
      )}
    </div>
  )
}
