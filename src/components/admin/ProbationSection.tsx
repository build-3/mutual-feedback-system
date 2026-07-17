"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import {
  BrandPanel,
  SectionHeading,
  Modal,
  buttonClasses,
  badgeClasses,
} from "@/components/ui/brand"
import FormattedAnswer from "@/components/FormattedAnswer"
import { contributionKeyToLabel } from "@/lib/insights-helpers"

const LEVEL1_EMAILS = ["vc@build3.org", "at@build3.org"]

type FeedbackAnswer = {
  question_key: string
  question_text: string
  answer_value: string
}

type FeedbackEntry = {
  submission_id: string
  submitted_by_name: string
  feedback_date: string
  contribution_level: string | null
  recommend_rating: number | null
  answers: FeedbackAnswer[]
}

type ProbationReview = {
  id: string
  reviewer_id: string
  reviewer_name: string
  contribution_level: string
  backing_score: number
  created_at: string
}

type ProbationRecord = {
  id: string
  employee_id: string
  employee_name: string
  employee_email: string | null
  start_date: string
  end_date: string
  duration_months: number
  status: string
  extended_at: string | null
  promoted_at: string | null
  signal: string | null
  total_feedback_count: number
  avg_recommend_rating: number | null
  contribution_summary: {
    counts: Record<string, number>
    most_common: string | null
  }
  reviews: ProbationReview[]
  feedback_history: FeedbackEntry[]
}

type ConfirmAction = {
  probationId: string
  employeeName: string
  action: "promote" | "extend"
}

function getSignalAccent(signal: string): "sage" | "peach" | "lavender" | "ink" {
  if (signal.includes("High Signal")) return "sage"
  if (signal.includes("Needs Team Review")) return "peach"
  if (signal.includes("Extended")) return "lavender"
  if (signal.includes("Promoted")) return "sage"
  return "ink"
}

const STATUS_ACCENT: Record<string, "lavender" | "peach" | "sage" | "ink"> = {
  active: "lavender",
  extended: "peach",
  promoted: "sage",
}

function formatDate(dateStr: string): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}

function daysUntil(dateStr: string): number {
  const now = new Date()
  const end = new Date(dateStr + "T00:00:00")
  const nowDate = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const endDate = new Date(end.getFullYear(), end.getMonth(), end.getDate())
  return Math.round((endDate.getTime() - nowDate.getTime()) / (1000 * 60 * 60 * 24))
}

export default function ProbationSection({ employeeId, userEmail }: { employeeId?: string; userEmail?: string | null }) {
  const isLevel1 = Boolean(userEmail && LEVEL1_EMAILS.includes(userEmail))
  const [probations, setProbations] = useState<ProbationRecord[]>([])
  const [totalActive, setTotalActive] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [actionError, setActionError] = useState("")
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // Guards against a slow response for a previous employee landing after
  // the user has already switched profiles (stale data under the new name).
  const latestEmployeeIdRef = useRef(employeeId)
  latestEmployeeIdRef.current = employeeId

  const loadData = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/probation", { cache: "no-store" })
      if (latestEmployeeIdRef.current !== employeeId) return
      // Non-admins (e.g. an intern viewing their own /insights page) get 401/403.
      // Hide the section silently instead of showing an error.
      if (res.status === 401 || res.status === 403) {
        setProbations([])
        setTotalActive(0)
        setError("")
        return
      }
      if (!res.ok) throw new Error("failed to load data")
      const data = await res.json()
      if (latestEmployeeIdRef.current !== employeeId) return
      const all: ProbationRecord[] = data.probations ?? []
      const filtered = employeeId ? all.filter((p) => p.employee_id === employeeId) : all
      setProbations(filtered)
      setTotalActive(employeeId ? filtered.filter((p) => p.status === "active" || p.status === "extended").length : (data.totalActive ?? 0))
      setError("")
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to load")
    } finally {
      setLoading(false)
    }
  }, [employeeId])

  useEffect(() => {
    void loadData()
  }, [loadData])

  async function handleDurationChange(probationId: string, months: 3 | 6) {
    const res = await fetch("/api/admin/probation/duration", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ probationId, months }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      alert(data.error ?? "failed to update duration")
      return
    }
    await loadData()
  }

  async function handleConfirmAction() {
    if (!confirmAction) return
    setActionLoading(true)
    setActionError("")

    const endpoint =
      confirmAction.action === "promote"
        ? "/api/admin/probation/promote"
        : "/api/admin/probation/extend"

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ probationId: confirmAction.probationId }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setActionError(data.error ?? "action failed")
        return
      }
      setConfirmAction(null)
      await loadData()
    } catch {
      setActionError("network error")
    } finally {
      setActionLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="py-6">
        <div className="animate-pulse text-muted text-sm">loading probation data...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="py-6">
        <div className="text-[#d35b52] text-sm">{error}</div>
      </div>
    )
  }

  // In single-employee mode, hide entirely if this person isn't on probation.
  if (employeeId && probations.length === 0) return null

  return (
    <div className="space-y-6">
      <SectionHeading
        accent="lavender"
        eyebrow="probation"
        title={employeeId ? "probation standing" : "intern standing"}
        description={
          employeeId
            ? probations[0]?.status === "promoted"
              ? "Promoted to full-time."
              : `On probation — ${totalActive > 0 ? "active" : "ended"}.`
            : `${totalActive} intern${totalActive !== 1 ? "s" : ""} currently on probation.`
        }
      />

      {!employeeId && probations.length === 0 && (
        <BrandPanel accent="lavender" tone="soft" className="p-6 text-center">
          <p className="text-sm text-muted">no probation records yet.</p>
        </BrandPanel>
      )}

      {probations.map((p) => {
        const isActive = p.status === "active" || p.status === "extended"
        const days = daysUntil(p.end_date)
        const statusAccent = STATUS_ACCENT[p.status] ?? "ink"
        const signalAccent = p.signal ? getSignalAccent(p.signal) : "ink"
        const isExpanded = expandedId === p.id
        const recentFeedback = p.feedback_history.slice(0, 10)

        return (
          <BrandPanel key={p.id} accent={statusAccent} tone="soft" className="p-5 sm:p-6">
            {/* Header */}
            <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
              <div>
                <h3 className="text-lg font-semibold tracking-[-0.03em] text-ink">
                  {p.employee_name}
                </h3>
                {p.employee_email && (
                  <p className="text-xs text-muted mt-0.5">{p.employee_email}</p>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <span {...badgeClasses({ accent: statusAccent, tone: "soft" })}>
                  {p.status}
                </span>
                {p.signal && (
                  <span {...badgeClasses({ accent: signalAccent, tone: "soft" })}>
                    {p.signal}
                  </span>
                )}
              </div>
            </div>

            {/* Dates */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              <div>
                <div className="text-[11px] text-muted font-medium">started</div>
                <div className="text-sm text-ink font-medium">{formatDate(p.start_date)}</div>
              </div>
              <div>
                <div className="text-[11px] text-muted font-medium">ends</div>
                <div className="text-sm text-ink font-medium">{formatDate(p.end_date)}</div>
              </div>
              <div>
                <div className="text-[11px] text-muted font-medium">period</div>
                <div className="text-sm text-ink font-medium">{p.duration_months} months</div>
              </div>
              {isActive && (
                <div>
                  <div className="text-[11px] text-muted font-medium">time left</div>
                  <div className={`text-sm font-medium ${days <= 14 ? "text-[#d35b52]" : "text-ink"}`}>
                    {days > 0 ? `${days} days` : "overdue"}
                  </div>
                </div>
              )}
            </div>

            {/* Feedback summary */}
            {p.total_feedback_count > 0 && (
              <div className="mb-4 rounded-xl bg-white/60 border border-line px-4 py-3 space-y-2">
                <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
                  <div className="text-xs text-muted">
                    <span className="text-ink font-semibold">{p.total_feedback_count}</span> feedback received
                  </div>
                  {p.avg_recommend_rating !== null && (
                    <div className="text-xs text-muted">
                      team rates them{" "}
                      <span className={`font-semibold ${p.avg_recommend_rating > 3 ? "text-[#4a8c6f]" : "text-[#d35b52]"}`}>
                        {p.avg_recommend_rating}/5
                      </span>{" "}
                      for full-time
                    </div>
                  )}
                </div>
                {Object.keys(p.contribution_summary.counts).length > 0 && (
                  <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-line/60">
                    <span className="text-[11px] text-muted">seen as:</span>
                    {Object.entries(p.contribution_summary.counts)
                      .sort((a, b) => b[1] - a[1])
                      .map(([k, v]) => (
                        <span
                          key={k}
                          className="inline-flex items-center gap-1 rounded-full border border-line bg-white/80 px-2 py-0.5 text-[11px]"
                        >
                          <span className="text-ink font-medium">{contributionKeyToLabel(k)}</span>
                          <span className="text-muted">×{v}</span>
                        </span>
                      ))}
                  </div>
                )}
              </div>
            )}

            {/* Expand/collapse recent feedback */}
            {recentFeedback.length > 0 && (
              <button
                type="button"
                onClick={() => setExpandedId(isExpanded ? null : p.id)}
                className="text-xs font-semibold text-muted hover:text-ink transition-colors mb-4 flex items-center gap-1"
              >
                <span className="inline-block transition-transform" style={{ transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)" }}>
                  &#9654;
                </span>
                {isExpanded ? "hide" : "last"} {recentFeedback.length} feedback entr{recentFeedback.length === 1 ? "y" : "ies"}
                {p.feedback_history.length > 10 && !isExpanded && (
                  <span className="text-muted/60 ml-1">(of {p.feedback_history.length} total)</span>
                )}
              </button>
            )}

            {/* Expanded: recent feedback history */}
            {isExpanded && (
              <div className="mb-4 space-y-3">
                {recentFeedback.map((f) => (
                  <div
                    key={f.submission_id}
                    className="rounded-xl bg-white/80 border border-line p-4"
                  >
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-2">
                      <span className="text-xs font-semibold text-ink">{f.submitted_by_name}</span>
                      <span className="text-[11px] text-muted">{formatDateTime(f.feedback_date)}</span>
                    </div>
                    <div className="space-y-2">
                      {f.answers.map((a) => (
                        <div key={a.question_key} className="text-xs">
                          <span className="text-muted">{a.question_text}</span>
                          <div className="text-ink mt-0.5 pl-2 border-l-2 border-line">
                            <FormattedAnswer questionKey={a.question_key} value={a.answer_value} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
                {p.feedback_history.length > 10 && (
                  <p className="text-[11px] text-muted text-center">
                    showing 10 of {p.feedback_history.length} entries
                  </p>
                )}
              </div>
            )}

            {/* Duration selector (only for active probations) */}
            {p.status === "active" && (
              <div className="mb-4">
                <div className="text-[11px] text-muted font-medium mb-2">change period</div>
                <div className="flex gap-2">
                  {([3, 6] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => handleDurationChange(p.id, m)}
                      className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-all ${
                        p.duration_months === m
                          ? "border-ink bg-ink text-white"
                          : "border-line bg-white text-muted hover:border-ink/20"
                      }`}
                    >
                      {m} months
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Probation reviews (from probation_reviews table) */}
            {p.reviews.length > 0 && (
              <div className="mb-4">
                <div className="text-[11px] text-muted font-medium mb-2">reviewer assessments</div>
                <div className="space-y-2">
                  {p.reviews.map((r) => (
                    <div
                      key={r.id}
                      className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl bg-white/60 border border-line px-3 py-2 text-xs"
                    >
                      <span className="font-medium text-ink">{r.reviewer_name}</span>
                      <span className="text-muted">
                        role:{" "}
                        <span className="text-ink">
                          {r.contribution_level === "leader" ? "Leader" : "Independent Contributor"}
                        </span>
                      </span>
                      <span className="text-muted">
                        readiness:{" "}
                        <span className={r.backing_score > 3 ? "text-[#4a8c6f]" : "text-[#d35b52]"}>
                          {r.backing_score}/5
                        </span>
                      </span>
                      <span className="text-muted/60">
                        {new Date(r.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Actions — Level 1 only */}
            {isActive && isLevel1 && (
              <div className="flex flex-wrap gap-2 pt-2 border-t border-line">
                <button
                  type="button"
                  onClick={() =>
                    setConfirmAction({
                      probationId: p.id,
                      employeeName: p.employee_name,
                      action: "promote",
                    })
                  }
                  {...buttonClasses({ accent: "sage", variant: "solid", size: "sm" })}
                >
                  promote to full-time
                </button>
                {p.status === "active" && (
                  <button
                    type="button"
                    onClick={() =>
                      setConfirmAction({
                        probationId: p.id,
                        employeeName: p.employee_name,
                        action: "extend",
                      })
                    }
                    {...buttonClasses({ accent: "peach", variant: "outline", size: "sm" })}
                  >
                    extend probation
                  </button>
                )}
              </div>
            )}
          </BrandPanel>
        )
      })}

      {/* Confirmation Modal */}
      <Modal
        open={!!confirmAction}
        title={
          confirmAction?.action === "promote"
            ? "promote to full-time"
            : "extend probation"
        }
        description={
          confirmAction?.action === "promote"
            ? `This will promote ${confirmAction?.employeeName} to full-time and end their probation.`
            : `This will extend ${confirmAction?.employeeName}'s probation to 6 months. They will be notified.`
        }
        accent={confirmAction?.action === "promote" ? "sage" : "peach"}
        onClose={() => {
          setConfirmAction(null)
          setActionError("")
        }}
      >
        {actionError && (
          <p className="text-xs text-[#d35b52] mb-3">{actionError}</p>
        )}
        <div className="flex gap-2">
          <button
            type="button"
            disabled={actionLoading}
            onClick={handleConfirmAction}
            {...buttonClasses({
              accent: confirmAction?.action === "promote" ? "sage" : "peach",
              variant: "solid",
              size: "sm",
            })}
          >
            {actionLoading
              ? "processing..."
              : confirmAction?.action === "promote"
              ? "confirm promotion"
              : "confirm extension"}
          </button>
          <button
            type="button"
            onClick={() => {
              setConfirmAction(null)
              setActionError("")
            }}
            {...buttonClasses({ accent: "ink", variant: "ghost", size: "sm" })}
          >
            cancel
          </button>
        </div>
      </Modal>
    </div>
  )
}
