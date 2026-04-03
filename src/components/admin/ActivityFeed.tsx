"use client"

import { useMemo, useState } from "react"
import { BrandPanel, SectionHeading, badgeClasses } from "@/components/ui/brand"
import { relativeTime } from "@/lib/date-utils"
import type { Employee, FeedbackSubmission } from "@/lib/types"

type Filter = "all" | "week" | "month"

export default function ActivityFeed({
  submissions,
  employees,
}: {
  submissions: FeedbackSubmission[]
  employees: Employee[]
}) {
  const [filter, setFilter] = useState<Filter>("all")
  const [limit, setLimit] = useState(30)

  const empMap = useMemo(
    () => new Map(employees.map((e) => [e.id, e.name])),
    [employees]
  )

  const filtered = useMemo(() => {
    const now = Date.now()
    const cutoff =
      filter === "week"
        ? now - 7 * 24 * 60 * 60 * 1000
        : filter === "month"
        ? now - 30 * 24 * 60 * 60 * 1000
        : 0

    return submissions.filter(
      (s) => cutoff === 0 || new Date(s.created_at).getTime() > cutoff
    )
  }, [submissions, filter])

  const visible = filtered.slice(0, limit)

  return (
    <div className="space-y-6">
      <SectionHeading
        accent="yellow"
        eyebrow="activity"
        title="who did what"
        action={
          <div className="flex gap-2">
            {(["all", "week", "month"] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => { setFilter(f); setLimit(30) }}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-all ${
                  filter === f
                    ? "border-ink bg-ink text-white"
                    : "border-line bg-white text-muted hover:border-ink/20"
                }`}
              >
                {f === "all" ? "all time" : `this ${f}`}
              </button>
            ))}
          </div>
        }
      />

      <BrandPanel accent="yellow" tone="plain" className="divide-y divide-line">
        {visible.length === 0 && (
          <div className="p-6 text-center text-sm text-muted">
            no activity in this window.
          </div>
        )}
        {visible.map((sub) => {
          const submitter = empMap.get(sub.submitted_by_id) ?? "unknown"
          const recipient = sub.feedback_for_id
            ? empMap.get(sub.feedback_for_id) ?? "unknown"
            : null

          const notifyBadge = sub.notified_at
            ? badgeClasses({ accent: "sage", tone: "soft" })
            : sub.feedback_for_id
            ? badgeClasses({ accent: "yellow", tone: "soft" })
            : badgeClasses({ accent: "ink", tone: "outline" })

          const notifyLabel = sub.notified_at
            ? "notified"
            : sub.feedback_for_id
            ? "pending"
            : "n/a"

          return (
            <div
              key={sub.id}
              className="flex items-center justify-between gap-3 px-5 py-3"
            >
              <div className="min-w-0 flex-1">
                <span className="text-sm font-medium text-ink">{submitter}</span>
                {recipient && (
                  <>
                    <span className="mx-1.5 text-muted">&rarr;</span>
                    <span className="text-sm font-medium text-ink">
                      {recipient}
                    </span>
                  </>
                )}
                <span className="mx-1.5 text-xs text-muted">
                  {sub.feedback_type.replace("_", " ")}
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span
                  className={notifyBadge.className}
                  style={notifyBadge.style}
                >
                  {notifyLabel}
                </span>
                <span className="text-xs text-muted whitespace-nowrap">
                  {relativeTime(sub.created_at)}
                </span>
              </div>
            </div>
          )
        })}
      </BrandPanel>

      {filtered.length > limit && (
        <div className="text-center">
          <button
            type="button"
            onClick={() => setLimit((prev) => prev + 30)}
            className="text-sm font-medium text-muted hover:text-ink transition-colors"
          >
            show more ({filtered.length - limit} remaining)
          </button>
        </div>
      )}
    </div>
  )
}
