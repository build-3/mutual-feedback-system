"use client"

import { useMemo } from "react"
import { SectionHeading, StatPill } from "@/components/ui/brand"
import type { Employee, FeedbackSubmission, FeedbackAnswer, FeedbackResponse } from "@/lib/types"

function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

export default function AdminOverview({
  employees,
  submissions,
  answers,
  responses,
}: {
  employees: Employee[]
  submissions: FeedbackSubmission[]
  answers: FeedbackAnswer[]
  responses: FeedbackResponse[]
}) {
  const stats = useMemo(() => {
    const now = Date.now()
    const weekAgo = now - 7 * 24 * 60 * 60 * 1000
    const monthAgo = now - 30 * 24 * 60 * 60 * 1000

    const thisWeek = submissions.filter(
      (s) => new Date(s.created_at).getTime() > weekAgo
    ).length
    const thisMonth = submissions.filter(
      (s) => new Date(s.created_at).getTime() > monthAgo
    ).length

    const uniqueSubmitters = new Set(submissions.map((s) => s.submitted_by_id))
    const completionRate =
      employees.length > 0
        ? Math.round((uniqueSubmitters.size / employees.length) * 100)
        : 0

    const interns = employees.filter((e) => e.role === "intern").length
    const fullTimers = employees.filter((e) => e.role === "full_timer").length

    const lastSubmission =
      submissions.length > 0 ? submissions[0].created_at : null

    const notified = submissions.filter((s) => s.notified_at).length

    return {
      thisWeek,
      thisMonth,
      completionRate,
      interns,
      fullTimers,
      lastSubmission,
      uniqueSubmitters: uniqueSubmitters.size,
      notified,
    }
  }, [employees, submissions])

  return (
    <div className="space-y-6">
      <SectionHeading
        accent="yellow"
        eyebrow="overview"
        title="system pulse"
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <StatPill
          accent="yellow"
          label="employees"
          value={employees.length}
          detail={`${stats.interns} interns · ${stats.fullTimers} full-timers`}
        />
        <StatPill
          accent="yellow"
          label="submissions"
          value={submissions.length}
          detail={`${stats.thisWeek} this week · ${stats.thisMonth} this month`}
        />
        <StatPill
          accent="yellow"
          label="answers"
          value={answers.length}
          detail={`across ${submissions.length} submissions`}
        />
        <StatPill
          accent="yellow"
          label="responses"
          value={responses.length}
          detail="threaded replies"
        />
        <StatPill
          accent="sage"
          label="participation"
          value={`${stats.completionRate}%`}
          detail={`${stats.uniqueSubmitters} of ${employees.length} have submitted`}
        />
        <StatPill
          accent="sage"
          label="notifications sent"
          value={stats.notified}
          detail={`${submissions.length - stats.notified} pending or n/a`}
        />
        <StatPill
          accent="sky"
          label="this week"
          value={stats.thisWeek}
          detail="submissions in last 7 days"
        />
        <StatPill
          accent="sky"
          label="last submission"
          value={stats.lastSubmission ? relativeTime(stats.lastSubmission) : "none"}
          detail={
            stats.lastSubmission
              ? new Date(stats.lastSubmission).toLocaleDateString()
              : ""
          }
        />
      </div>
    </div>
  )
}
