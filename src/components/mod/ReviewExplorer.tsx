"use client"

import { useMemo, useState } from "react"
import { BrandPanel, EmptyState } from "@/components/ui/brand"
import SeverityBadge from "./SeverityBadge"
import { ModReview } from "./types"

const MIN_SEVERITY_OPTIONS = [
  { value: 0, label: "all" },
  { value: 3, label: "3+" },
  { value: 4, label: "4+" },
  { value: 4.5, label: "critical" },
]

export default function ReviewExplorer({ reviews }: { reviews: ModReview[] }) {
  const departments = useMemo(
    () => Array.from(new Set(reviews.map((r) => r.department))),
    [reviews]
  )
  const [dept, setDept] = useState<string>("all")
  const [minSeverity, setMinSeverity] = useState(0)

  const filtered = useMemo(
    () =>
      reviews
        .filter((r) => (dept === "all" ? true : r.department === dept))
        .filter((r) => (r.severity ?? 0) >= minSeverity)
        .sort((a, b) => (b.severity ?? 0) - (a.severity ?? 0)),
    [reviews, dept, minSeverity]
  )

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={dept}
          onChange={(e) => setDept(e.target.value)}
          className="rounded-full border border-line bg-white/85 px-3.5 py-2 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/10"
        >
          <option value="all">all departments</option>
          {departments.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
        <div className="flex items-center gap-1 rounded-full border border-line bg-white/85 p-1">
          {MIN_SEVERITY_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setMinSeverity(opt.value)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                minSeverity === opt.value ? "bg-ink text-white" : "text-muted hover:text-ink"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <span className="text-xs text-muted">{filtered.length} reviews</span>
      </div>

      {filtered.length === 0 ? (
        <EmptyState accent="peach" title="nothing here" description="No reviews match these filters." />
      ) : (
        <div className="space-y-3">
          {filtered.map((r) => (
            <BrandPanel key={r.id} accent="peach" tone="plain" className="p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">
                    {r.department}
                    {r.period ? ` · ${r.period}` : ""}
                  </div>
                  <div className="mt-0.5 text-sm font-semibold text-ink">{r.topic || "—"}</div>
                </div>
                <SeverityBadge severity={r.severity} />
              </div>
              {r.review && <p className="mt-2 text-sm leading-6 text-muted">{r.review}</p>}
              {r.employee_name && (
                <div className="mt-2 text-[11px] text-muted">— {r.employee_name}</div>
              )}
            </BrandPanel>
          ))}
        </div>
      )}
    </div>
  )
}
