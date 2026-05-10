"use client"

import { useCallback, useEffect, useState } from "react"
import type { ProbationStatus } from "@/lib/types"
import { Modal, buttonClasses, badgeClasses } from "@/components/ui/brand"

type ProbationRecord = {
  id: string
  employee_id: string
  join_date: string
  probation_status: ProbationStatus
  probation_end_date: string
  extended_at: string | null
  completed_at: string | null
  concluded_at: string | null
  decision_note: string | null
  rules_last_sent_at: string | null
  ceo_alerted_at: string | null
  created_at: string
  updated_at: string
  employees: { name: string; email: string | null; role: string } | null
}

type ConfirmAction = {
  probationId: string
  employeeName: string
  action: "extend" | "convert" | "conclude"
}

type PreviewData = {
  recipient: string
  message: string
  standing?: {
    feedbackFromFullTimers: number
    totalFeedbackCount: number
    requiredFeedbackCount: number
    averageScore: number | null
    lowScoreKeys: string[]
    contributionLevel: string | null
    contributionLabel: string | null
    issues: string[]
    ceoSummary: string[]
  }
}

const STATUS_ACCENT: Record<ProbationStatus, "lavender" | "peach" | "sage" | "ink"> = {
  active: "lavender",
  extended: "peach",
  completed: "sage",
  concluded: "ink",
}

const STATUS_LABEL: Record<ProbationStatus, string> = {
  active: "on probation",
  extended: "extended",
  completed: "full-timer",
  concluded: "concluded",
}

function daysUntil(dateStr: string): number {
  const now = new Date()
  const end = new Date(dateStr)
  // Strip time to avoid off-by-one from timezone differences
  const nowDate = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const endDate = new Date(end.getFullYear(), end.getMonth(), end.getDate())
  return Math.round((endDate.getTime() - nowDate.getTime()) / (1000 * 60 * 60 * 24))
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}

export default function ProbationDashboard() {
  const [records, setRecords] = useState<ProbationRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [confirm, setConfirm] = useState<ConfirmAction | null>(null)
  const [note, setNote] = useState("")
  const [acting, setActing] = useState(false)
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null)
  const [preview, setPreview] = useState<PreviewData | null>(null)
  const [triggerLoading, setTriggerLoading] = useState<string | null>(null)
  const [cronResult, setCronResult] = useState<{ success: boolean; message: string } | null>(null)
  const [openComms, setOpenComms] = useState<string | null>(null)
  const [bulkConfirm, setBulkConfirm] = useState<"check" | "rules" | null>(null)

  const loadData = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/probation", { cache: "no-store" })
      if (!res.ok) throw new Error("failed to load")
      const data = await res.json()
      setRecords(data.probations ?? [])
      setError("")
      setOpenComms(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to load")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData])

  async function handleDecision() {
    if (!confirm) return
    setActing(true)
    setResult(null)
    setCronResult(null)

    try {
      const res = await fetch("/api/admin/probation/decision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          probationId: confirm.probationId,
          action: confirm.action,
          note: note || undefined,
        }),
      })

      const data = await res.json()
      if (res.ok) {
        // Optimistic local update to avoid stale flash
        setRecords((prev) =>
          prev.map((r) => {
            if (r.id !== confirm.probationId) return r
            if (confirm.action === "extend") {
              return { ...r, probation_status: "extended" as ProbationStatus }
            }
            if (confirm.action === "convert") {
              return { ...r, probation_status: "completed" as ProbationStatus }
            }
            return { ...r, probation_status: "concluded" as ProbationStatus }
          })
        )
        setResult({
          success: true,
          message:
            confirm.action === "extend"
              ? `Extended probation for ${confirm.employeeName}.`
              : confirm.action === "convert"
              ? `${confirm.employeeName} is now a full-timer!`
              : `Concluded probation for ${confirm.employeeName}.`,
        })
        setConfirm(null)
        setNote("")
        // Refresh from server in background
        void loadData()
      } else {
        setResult({ success: false, message: data.error || "Action failed." })
      }
    } catch {
      setResult({ success: false, message: "Network error." })
    } finally {
      setActing(false)
    }
  }

  async function handleSend(employeeId: string, employeeName: string, type: "rules" | "ceo") {
    setTriggerLoading(`send-${type}-${employeeId}`)
    setCronResult(null)
    setResult(null)
    try {
      const res = await fetch("/api/admin/probation/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeId, type }),
      })
      const data = await res.json()
      if (res.ok) {
        if (data.sent) {
          setCronResult({
            success: true,
            message: type === "rules"
              ? `Sent standing update to ${employeeName} (${data.to}).`
              : `CEO alert sent to ${data.to} about ${employeeName}.`,
          })
        } else {
          setCronResult({
            success: false,
            message: `Not sent: ${data.reason}. Message generated — enable notifications to send.`,
          })
        }
      } else {
        setCronResult({ success: false, message: data.error || "Send failed." })
      }
    } catch {
      setCronResult({ success: false, message: "Network error." })
    } finally {
      setTriggerLoading(null)
    }
  }

  async function handlePreview(employeeId: string, type: "rules" | "ceo") {
    setTriggerLoading(`preview-${type}-${employeeId}`)
    try {
      const res = await fetch(
        `/api/admin/probation/preview?employee=${employeeId}&type=${type}`
      )
      const data = await res.json()
      if (res.ok) {
        setPreview(data)
      } else {
        setCronResult({ success: false, message: data.error || "Preview failed." })
      }
    } catch {
      setCronResult({ success: false, message: "Network error." })
    } finally {
      setTriggerLoading(null)
    }
  }

  async function handleTriggerCron(type: "check" | "rules") {
    setBulkConfirm(null)
    setTriggerLoading(`cron-${type}`)
    setCronResult(null)
    setResult(null)
    try {
      const url =
        type === "check"
          ? "/api/cron/probation-check"
          : "/api/cron/probation-rules?force=true"
      const res = await fetch(url)
      const data = await res.json()
      if (res.ok) {
        const count = data.notified ?? data.sent ?? 0
        setCronResult({
          success: true,
          message:
            type === "check"
              ? `Probation check complete. ${count} CEO alert${count !== 1 ? "s" : ""} sent.`
              : `Standing updates sent to ${count} intern${count !== 1 ? "s" : ""}.`,
        })
      } else {
        setCronResult({ success: false, message: data.error || "Cron failed." })
      }
    } catch {
      setCronResult({ success: false, message: "Network error." })
    } finally {
      setTriggerLoading(null)
    }
  }

  if (loading) {
    return <div className="animate-pulse text-sm text-muted">loading probation data...</div>
  }

  if (error) {
    return <div className="text-sm text-[#d35b52]">{error}</div>
  }

  const active = records.filter(
    (r) => r.probation_status === "active" || r.probation_status === "extended"
  )
  const past = records.filter(
    (r) => r.probation_status === "completed" || r.probation_status === "concluded"
  )

  // Sort: overdue first (most overdue at top), then by days remaining ascending
  const sortedActive = [...active].sort((a, b) => {
    const daysA = daysUntil(a.probation_end_date)
    const daysB = daysUntil(b.probation_end_date)
    return daysA - daysB
  })

  const overdueCount = active.filter((r) => daysUntil(r.probation_end_date) <= 0).length

  return (
    <div className="space-y-6">
      {result && (
        <div
          className={`rounded-[14px] border px-4 py-3 text-sm ${
            result.success
              ? "border-green-200 bg-green-50 text-green-700"
              : "border-red-200 bg-red-50 text-red-600"
          }`}
        >
          {result.message}
        </div>
      )}

      {/* Stats */}
      <div className={`grid grid-cols-2 gap-3 ${overdueCount > 0 ? "sm:grid-cols-5" : "sm:grid-cols-4"}`}>
        {overdueCount > 0 && (
          <div className="rounded-[14px] border border-[#d35b52]/30 bg-[#d35b52]/10 px-4 py-3 text-center">
            <div className="text-2xl font-bold text-[#d35b52]">{overdueCount}</div>
            <div className="text-xs font-semibold text-[#d35b52]">need decision</div>
          </div>
        )}
        <div className="rounded-[14px] border border-[#bcadcc]/30 bg-[#bcadcc]/10 px-4 py-3 text-center">
          <div className="text-2xl font-bold text-ink">{active.length}</div>
          <div className="text-xs text-muted">on probation</div>
        </div>
        <div className="rounded-[14px] border border-[#f5bb9f]/30 bg-[#f5bb9f]/10 px-4 py-3 text-center">
          <div className="text-2xl font-bold text-ink">
            {records.filter((r) => r.probation_status === "extended").length}
          </div>
          <div className="text-xs text-muted">extended</div>
        </div>
        <div className="rounded-[14px] border border-[#79c0a6]/30 bg-[#79c0a6]/10 px-4 py-3 text-center">
          <div className="text-2xl font-bold text-ink">
            {records.filter((r) => r.probation_status === "completed").length}
          </div>
          <div className="text-xs text-muted">converted</div>
        </div>
        <div className="rounded-[14px] border border-line bg-white px-4 py-3 text-center">
          <div className="text-2xl font-bold text-ink">
            {records.filter((r) => r.probation_status === "concluded").length}
          </div>
          <div className="text-xs text-muted">concluded</div>
        </div>
      </div>

      {/* Manual triggers */}
      <div className="rounded-[20px] border border-line bg-white p-5">
        <h3 className="text-sm font-semibold text-ink">manual triggers</h3>
        <p className="mt-1 text-xs text-muted">
          run probation crons manually or preview messages before sending.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => setBulkConfirm("check")}
            disabled={triggerLoading !== null}
            className="rounded-[10px] border border-[#f5bb9f]/40 bg-[#f5bb9f]/10 px-4 py-2 text-xs font-semibold text-ink transition-all hover:bg-[#f5bb9f]/25 disabled:opacity-40"
          >
            {triggerLoading === "cron-check" ? "running..." : "run probation check (CEO alerts)"}
          </button>
          <button
            type="button"
            onClick={() => setBulkConfirm("rules")}
            disabled={triggerLoading !== null}
            className="rounded-[10px] border border-[#bcadcc]/40 bg-[#bcadcc]/10 px-4 py-2 text-xs font-semibold text-ink transition-all hover:bg-[#bcadcc]/25 disabled:opacity-40"
          >
            {triggerLoading === "cron-rules" ? "running..." : "send standing updates to all interns"}
          </button>
        </div>
        {cronResult && (
          <div
            className={`mt-3 rounded-[14px] border px-3 py-2 text-xs ${
              cronResult.success
                ? "border-green-200 bg-green-50 text-green-700"
                : "border-red-200 bg-red-50 text-red-600"
            }`}
          >
            {cronResult.message}
          </div>
        )}
      </div>

      {/* Active probations */}
      <div className="rounded-[20px] border border-line bg-white p-5">
        <h3 className="text-sm font-semibold text-ink">active probations</h3>
        {sortedActive.length === 0 ? (
          <p className="mt-2 text-sm text-muted">no one is currently on probation.</p>
        ) : (
          <div className="mt-4 space-y-3">
            {sortedActive.map((r) => {
              const days = daysUntil(r.probation_end_date)
              const overdue = days <= 0
              const commsOpen = openComms === r.id

              return (
                <div
                  key={r.id}
                  className={`rounded-[16px] border p-4 ${
                    overdue
                      ? "border-[#d35b52]/30 bg-[#d35b52]/5"
                      : "border-line bg-[#fafaf8]"
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1 flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-ink">
                          {r.employees?.name ?? "unknown"}
                        </span>
                        <span
                          {...badgeClasses({
                            accent: STATUS_ACCENT[r.probation_status],
                            tone: "soft",
                          })}
                        >
                          {STATUS_LABEL[r.probation_status]}
                        </span>
                      </div>
                      <div className="text-xs text-muted">
                        joined {formatDate(r.join_date)} · ends{" "}
                        {formatDate(r.probation_end_date)}
                      </div>
                      <div
                        className={`text-xs font-semibold ${
                          overdue
                            ? "text-[#d35b52]"
                            : days <= 14
                            ? "text-orange-600"
                            : "text-muted"
                        }`}
                      >
                        {overdue
                          ? `${Math.abs(days)} day${Math.abs(days) !== 1 ? "s" : ""} overdue — decision needed`
                          : `${days} day${days !== 1 ? "s" : ""} remaining`}
                      </div>
                      {r.decision_note && (
                        <div className="text-xs text-muted italic">
                          note: {r.decision_note}
                        </div>
                      )}
                    </div>

                    {/* Decision buttons — always visible */}
                    <div className="flex flex-wrap gap-2 items-start">
                      <button
                        type="button"
                        onClick={() =>
                          setConfirm({
                            probationId: r.id,
                            employeeName: r.employees?.name ?? "this person",
                            action: "extend",
                          })
                        }
                        disabled={r.probation_status === "extended"}
                        className="rounded-[10px] border border-[#f5bb9f]/40 bg-[#f5bb9f]/10 px-3 py-1.5 text-xs font-semibold text-ink transition-all hover:bg-[#f5bb9f]/25 disabled:opacity-30 disabled:cursor-not-allowed"
                        title={r.probation_status === "extended" ? "Already extended (6 month max)" : "Extend by 3 months"}
                      >
                        extend
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setConfirm({
                            probationId: r.id,
                            employeeName: r.employees?.name ?? "this person",
                            action: "convert",
                          })
                        }
                        className="rounded-[10px] border border-[#79c0a6]/40 bg-[#79c0a6]/10 px-3 py-1.5 text-xs font-semibold text-ink transition-all hover:bg-[#79c0a6]/25"
                      >
                        full-timer
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setConfirm({
                            probationId: r.id,
                            employeeName: r.employees?.name ?? "this person",
                            action: "conclude",
                          })
                        }
                        className="rounded-[10px] border border-line bg-white px-3 py-1.5 text-xs font-semibold text-muted transition-all hover:border-[#d35b52]/30 hover:text-[#d35b52]"
                      >
                        conclude
                      </button>

                      {/* Messages toggle */}
                      <button
                        type="button"
                        onClick={() => setOpenComms(commsOpen ? null : r.id)}
                        className="rounded-[10px] border border-[#c6e5f8]/60 bg-[#c6e5f8]/15 px-3 py-1.5 text-xs font-semibold text-ink transition-all hover:bg-[#c6e5f8]/30"
                      >
                        {commsOpen ? "hide msgs ▴" : "msgs ▾"}
                      </button>
                    </div>
                  </div>

                  {/* Expanded comms panel */}
                  {commsOpen && (
                    <div className="mt-3 flex flex-wrap gap-2 border-t border-line/50 pt-3">
                      <button
                        type="button"
                        onClick={() => handlePreview(r.employee_id, "rules")}
                        disabled={triggerLoading !== null}
                        className="rounded-[8px] border border-line bg-white px-3 py-1 text-[11px] font-medium text-muted transition-all hover:border-ink/20 hover:text-ink"
                      >
                        preview intern msg
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          handleSend(r.employee_id, r.employees?.name ?? "this person", "rules")
                        }
                        disabled={triggerLoading !== null}
                        className="rounded-[8px] border border-[#79c0a6]/40 bg-[#79c0a6]/10 px-3 py-1 text-[11px] font-medium text-ink transition-all hover:bg-[#79c0a6]/25"
                      >
                        {triggerLoading === `send-rules-${r.employee_id}` ? "sending..." : "send to intern"}
                      </button>
                      {overdue && (
                        <>
                          <span className="text-[11px] text-muted self-center">|</span>
                          <button
                            type="button"
                            onClick={() => handlePreview(r.employee_id, "ceo")}
                            disabled={triggerLoading !== null}
                            className="rounded-[8px] border border-line bg-white px-3 py-1 text-[11px] font-medium text-muted transition-all hover:border-ink/20 hover:text-ink"
                          >
                            preview CEO alert
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              handleSend(r.employee_id, r.employees?.name ?? "this person", "ceo")
                            }
                            disabled={triggerLoading !== null}
                            className="rounded-[8px] border border-[#f5bb9f]/40 bg-[#f5bb9f]/10 px-3 py-1 text-[11px] font-medium text-ink transition-all hover:bg-[#f5bb9f]/25"
                          >
                            {triggerLoading === `send-ceo-${r.employee_id}` ? "sending..." : "send CEO alert"}
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Past probations */}
      {past.length > 0 && (
        <div className="rounded-[20px] border border-line bg-white p-5">
          <h3 className="text-sm font-semibold text-ink">past probations</h3>
          <div className="mt-4 space-y-2">
            {past.map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between rounded-[12px] border border-line bg-[#fafaf8] px-4 py-3"
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-ink">
                    {r.employees?.name ?? "unknown"}
                  </span>
                  <span
                    {...badgeClasses({
                      accent: STATUS_ACCENT[r.probation_status],
                      tone: "soft",
                    })}
                  >
                    {STATUS_LABEL[r.probation_status]}
                  </span>
                </div>
                <div className="text-xs text-muted">
                  {r.probation_status === "completed" && r.completed_at
                    ? `converted ${formatDate(r.completed_at)}`
                    : r.concluded_at
                    ? `concluded ${formatDate(r.concluded_at)}`
                    : formatDate(r.probation_end_date)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Message preview modal */}
      <Modal
        open={preview !== null}
        title="message preview"
        description={preview ? `To: ${preview.recipient}` : ""}
        accent="sky"
        onClose={() => setPreview(null)}
      >
        <div className="space-y-3">
          {preview?.standing && (
            <div className="rounded-[12px] border border-line bg-[#fafaf8] p-3">
              <div className="text-[11px] font-semibold text-muted mb-2">standing analysis</div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  feedback from FTs:{" "}
                  <span className={preview.standing.feedbackFromFullTimers < 3 ? "font-bold text-[#d35b52]" : "font-bold text-ink"}>
                    {preview.standing.feedbackFromFullTimers}/{preview.standing.requiredFeedbackCount}
                  </span>
                </div>
                <div>
                  avg score:{" "}
                  <span className={preview.standing.averageScore !== null && preview.standing.averageScore < 4 ? "font-bold text-[#d35b52]" : "font-bold text-ink"}>
                    {preview.standing.averageScore ?? "n/a"}
                  </span>
                </div>
                <div>
                  contribution:{" "}
                  <span className="font-bold text-ink">{preview.standing.contributionLabel ?? preview.standing.contributionLevel ?? "n/a"}</span>
                </div>
                <div>
                  issues:{" "}
                  <span className={preview.standing.issues.length > 0 ? "font-bold text-[#d35b52]" : "font-bold text-ink"}>
                    {preview.standing.issues.length}
                  </span>
                </div>
              </div>
            </div>
          )}
          <div className="max-h-[400px] overflow-y-auto rounded-[12px] border border-line bg-ink p-4">
            <pre className="whitespace-pre-wrap text-xs text-white/90 font-mono leading-relaxed">
              {preview?.message}
            </pre>
          </div>
          <button
            type="button"
            onClick={() => setPreview(null)}
            className="w-full rounded-[14px] border border-line bg-white px-4 py-2.5 text-sm font-semibold text-muted transition-all hover:border-ink/20"
          >
            close
          </button>
        </div>
      </Modal>

      {/* Confirmation modal for decisions */}
      <Modal
        open={confirm !== null}
        title={
          confirm?.action === "extend"
            ? "extend probation"
            : confirm?.action === "convert"
            ? "convert to full-timer"
            : "conclude probation"
        }
        description={
          confirm?.action === "extend"
            ? `Extend ${confirm.employeeName}'s probation by 3 more months.`
            : confirm?.action === "convert"
            ? `Promote ${confirm?.employeeName} to full-time. Their role changes from intern to full_timer.`
            : `Conclude ${confirm?.employeeName}'s probation — this means parting ways.`
        }
        accent={
          confirm?.action === "extend"
            ? "peach"
            : confirm?.action === "convert"
            ? "sage"
            : "ink"
        }
        onClose={() => {
          setConfirm(null)
          setNote("")
        }}
      >
        <div className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-muted">note (optional)</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="add context for this decision..."
              maxLength={2000}
              className="mt-1 w-full rounded-[14px] border border-line bg-[#fafaf8] px-3 py-2.5 text-sm text-ink placeholder:text-muted/50 focus:border-ink focus:outline-none"
              rows={3}
            />
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => {
                setConfirm(null)
                setNote("")
              }}
              className="flex-1 rounded-[14px] border border-line bg-white px-4 py-2.5 text-sm font-semibold text-muted transition-all hover:border-ink/20"
            >
              cancel
            </button>
            <button
              type="button"
              onClick={handleDecision}
              disabled={acting}
              {...buttonClasses({
                accent:
                  confirm?.action === "extend"
                    ? "peach"
                    : confirm?.action === "convert"
                    ? "sage"
                    : "ink",
                variant: "solid",
                size: "md",
              })}
              className={`flex-1 rounded-[14px] px-4 py-2.5 text-sm font-semibold transition-all disabled:opacity-40 ${
                confirm?.action === "conclude"
                  ? "bg-ink text-white border-ink hover:bg-ink/90"
                  : confirm?.action === "convert"
                  ? "bg-[#79c0a6] text-white border-[#79c0a6] hover:bg-[#79c0a6]/90"
                  : "bg-[#f5bb9f] text-ink border-[#f5bb9f] hover:bg-[#f5bb9f]/90"
              }`}
            >
              {acting
                ? "working..."
                : confirm?.action === "extend"
                ? "extend 3 months"
                : confirm?.action === "convert"
                ? "promote to full-timer"
                : "conclude"}
            </button>
          </div>
        </div>
      </Modal>

      {/* Bulk action confirmation modal */}
      <Modal
        open={bulkConfirm !== null}
        title={bulkConfirm === "check" ? "send CEO alerts" : "send standing updates"}
        description={
          bulkConfirm === "check"
            ? `This will send a CEO alert for ${overdueCount} overdue intern${overdueCount !== 1 ? "s" : ""}. Interns already alerted within 7 days will be skipped.`
            : `This will send a standing update to all ${active.length} intern${active.length !== 1 ? "s" : ""} on probation.`
        }
        accent={bulkConfirm === "check" ? "peach" : "lavender"}
        onClose={() => setBulkConfirm(null)}
      >
        <div className="space-y-3">
          <div className="rounded-[12px] border border-line bg-[#fafaf8] p-3">
            <div className="text-[11px] font-semibold text-muted mb-2">will send to:</div>
            <div className="text-xs text-ink space-y-1">
              {(bulkConfirm === "check"
                ? sortedActive.filter((r) => daysUntil(r.probation_end_date) <= 0)
                : sortedActive
              ).map((r) => (
                <div key={r.id}>• {r.employees?.name ?? "unknown"}</div>
              ))}
            </div>
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setBulkConfirm(null)}
              className="flex-1 rounded-[14px] border border-line bg-white px-4 py-2.5 text-sm font-semibold text-muted transition-all hover:border-ink/20"
            >
              cancel
            </button>
            <button
              type="button"
              onClick={() => handleTriggerCron(bulkConfirm!)}
              className={`flex-1 rounded-[14px] px-4 py-2.5 text-sm font-semibold text-white transition-all ${
                bulkConfirm === "check"
                  ? "bg-[#f5bb9f] text-ink hover:bg-[#f5bb9f]/90"
                  : "bg-[#bcadcc] hover:bg-[#bcadcc]/90"
              }`}
            >
              send
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
