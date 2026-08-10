"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import dynamic from "next/dynamic"
import Navbar from "@/components/Navbar"
import { BrandPanel, EmptyState, SectionHeading, SegmentedControl, StatPill, buttonClasses } from "@/components/ui/brand"
import { cycleFromKey } from "@/lib/cycles"
import { ORG_VOICE_LABEL } from "@/lib/brand"
import type { SubmissionWithDetails } from "@/app/insights/types"
import type { FeedbackResponse } from "@/lib/types"

const FeedbackTimeline = dynamic(() => import("@/components/insights/FeedbackTimeline"))

type TriageStatus = "unanswered" | "partial" | "done"

type QueueItem = SubmissionWithDetails & {
  period: string
  status: TriageStatus
  needsReply: number
  replied: number
}

type QueuePayload = {
  items: QueueItem[]
  responsesByAnswer: Record<string, (FeedbackResponse & { responderName: string; asFoundation?: boolean })[]>
  counts: Record<TriageStatus, number>
  periods: string[]
}

const STATUS_FILTERS: { key: TriageStatus | "all"; label: string }[] = [
  { key: "unanswered", label: "needs a reply" },
  { key: "partial", label: "part answered" },
  { key: "done", label: "answered" },
  { key: "all", label: "everything" },
]

/**
 * Label a round bucket. Buckets are CycleKeys now, so this renders the cycle's
 * date span.
 *
 * The previous monthLabel() built `new Date(y, m - 1, 1)` and read it back with
 * toLocaleString — host-local, so it would print the wrong day on the UTC host.
 * cycleFromKey formats from integers and never touches a Date.
 */
function periodLabel(period: string) {
  return cycleFromKey(period)?.label ?? period
}

export default function ModPage() {
  const [data, setData] = useState<QueuePayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [status, setStatus] = useState<TriageStatus | "all">("unanswered")
  const [period, setPeriod] = useState<string>("all")
  const [currentUser, setCurrentUser] = useState<{ id: string; name: string } | null>(null)
  const [firstLoadDone, setFirstLoadDone] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const res = await fetch("/api/mod/queue")
      if (res.status === 404) throw new Error("the response console is switched off.")
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(payload.error || "we could not load the response queue.")
      setData(payload as QueuePayload)
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "we could not load the response queue.")
    } finally {
      setLoading(false)
      setFirstLoadDone(true)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  useEffect(() => {
    fetch("/api/me")
      .then(r => r.json())
      .then(d => {
        if (d?.employee?.id && d?.employee?.name) setCurrentUser({ id: d.employee.id, name: d.employee.name })
      })
      .catch(() => {})
  }, [])

  const visible = useMemo(() => {
    if (!data) return []
    return data.items.filter(
      it => (status === "all" || it.status === status) && (period === "all" || it.period === period)
    )
  }, [data, status, period])

  // Only the very first load blanks the page. The refresh after saving a reply
  // must keep the tree mounted, or the reply you just wrote disappears along
  // with your scroll position — the same bug that hit /insights.
  if (!firstLoadDone && loading) {
    return (
      <div className="min-h-screen bg-canvas">
        <Navbar />
        <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
          <div className="skeleton h-8 w-56 rounded-full" />
          <div className="skeleton mt-6 h-40 rounded-[28px]" />
        </div>
      </div>
    )
  }

  const counts = data?.counts ?? { unanswered: 0, partial: 0, done: 0 }
  const backlog = counts.unanswered + counts.partial
  const retryBtn = buttonClasses({ accent: "ink", variant: "ghost", size: "sm" })

  return (
    <div className="min-h-screen bg-canvas page-enter">
      <Navbar />
      <div className="mx-auto max-w-5xl px-4 pt-4 sm:pt-8 sm:px-6">
        <SectionHeading
          accent="peach"
          eyebrow="restricted · leadership only"
          title="org feedback"
          description={`everything the team has told build3 about itself. replies reach them as the ${ORG_VOICE_LABEL}, never under your own name.`}
        />

        {loadError ? (
          <div className="mt-6">
            <EmptyState
              accent="peach"
              title="we could not load the queue"
              description={loadError}
              action={
                <button type="button" onClick={() => void load()} className={retryBtn.className} style={retryBtn.style}>
                  retry
                </button>
              }
            />
          </div>
        ) : (
          <>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <StatPill accent="peach" label="needs a reply" value={String(counts.unanswered)} detail="nobody has responded yet" />
              <StatPill accent="yellow" label="part answered" value={String(counts.partial)} detail="some concerns still open" />
              <StatPill accent="sage" label="answered" value={String(counts.done)} detail="every concern has a reply" />
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-2 border-b border-line pb-4">
              <SegmentedControl
                ariaLabel="triage status"
                className="flex-wrap"
                options={STATUS_FILTERS.map(f => ({ key: f.key, label: f.label }))}
                value={status}
                onChange={setStatus}
              />
              {(data?.periods.length ?? 0) > 0 && (
                <SegmentedControl
                  ariaLabel="round"
                  className="flex-wrap sm:ml-auto"
                  options={[
                    { key: "all", label: "all rounds" },
                    ...(data?.periods ?? []).map(p => ({ key: p, label: periodLabel(p) })),
                  ]}
                  value={period}
                  onChange={setPeriod}
                />
              )}
            </div>

            {backlog > 0 && status === "unanswered" && (
              <p className="mt-4 text-sm leading-6 text-muted">
                {backlog} {backlog === 1 ? "entry is" : "entries are"} still waiting on a reply.
              </p>
            )}
          </>
        )}
      </div>

      <div className="mx-auto max-w-5xl px-4 py-4 pb-20 sm:px-6 sm:py-6">
        {!loadError &&
          (visible.length === 0 ? (
            <BrandPanel accent="sage" tone="washed" className="p-8 text-center">
              <p className="text-sm leading-6 text-muted">
                nothing here with those filters.
                {status === "unanswered" && " every entry in this view has had a reply."}
              </p>
            </BrandPanel>
          ) : (
            <FeedbackTimeline
              submissions={visible}
              title={`${visible.length} ${visible.length === 1 ? "entry" : "entries"}`}
              responsesByAnswer={data?.responsesByAnswer}
              currentUser={currentUser}
              onResponseSaved={() => void load()}
              // Every row in this queue is a build3 submission and the page
              // itself is behind requireMod, so anyone who can see this replies
              // in the org's voice — no per-row check needed.
              respondAsOrg
            />
          ))}
      </div>
    </div>
  )
}
