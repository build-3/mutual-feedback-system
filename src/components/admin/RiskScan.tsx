"use client"

import { useMemo, useState } from "react"
import { BrandPanel, Eyebrow, SectionHeading, SegmentedControl } from "@/components/ui/brand"
import { getAvatarColor, getInitials } from "@/lib/insights-helpers"
import type { Employee, FeedbackAnswer, FeedbackSubmission } from "@/lib/types"

interface Props {
  employees: Employee[]
  submissions: FeedbackSubmission[]
  answers: FeedbackAnswer[]
}

const TEAL_KEYS = ["teal_self_management", "teal_wholeness", "teal_evolutionary_purpose"] as const
const TEAL_LABELS: Record<(typeof TEAL_KEYS)[number], string> = {
  teal_self_management: "self-management",
  teal_wholeness: "wholeness",
  teal_evolutionary_purpose: "evolutionary purpose",
}

type Window = "1m" | "3m" | "6m" | "12m" | "all"
const WINDOW_OPTIONS: { key: Window; label: string; days: number | null }[] = [
  { key: "1m", label: "1 month", days: 30 },
  { key: "3m", label: "3 months", days: 90 },
  { key: "6m", label: "6 months", days: 180 },
  { key: "12m", label: "12 months", days: 365 },
  { key: "all", label: "all time", days: null },
]

type Mode = "any" | "average"
type Role = "full_timer" | "intern"
const ROLE_OPTIONS: { key: Role; label: string }[] = [
  { key: "full_timer", label: "full-timer" },
  { key: "intern", label: "intern" },
]

type Scored = {
  submissionId: string
  targetId: string
  createdAt: string
  scores: Partial<Record<(typeof TEAL_KEYS)[number], number>>
  trustBattery: number | null
}

function num(value: string | undefined): number | undefined {
  if (value === undefined) return undefined
  const n = Number(value)
  return Number.isFinite(n) ? n : undefined
}

export default function RiskScan({ employees, submissions, answers }: Props) {
  const [role, setRole] = useState<Role>("full_timer")
  const [tealThreshold, setTealThreshold] = useState(4)
  const [trustThreshold, setTrustThreshold] = useState(85)
  const [windowKey, setWindowKey] = useState<Window>("3m")
  const [mode, setMode] = useState<Mode>("any")

  const empById = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees])

  const scored = useMemo<Scored[]>(() => {
    const windowDays = WINDOW_OPTIONS.find((w) => w.key === windowKey)?.days ?? null
    const cutoff = windowDays !== null ? Date.now() - windowDays * 24 * 60 * 60 * 1000 : null

    // Only people still on the roster — a departed teammate's old scores
    // aren't something anyone needs to act on.
    const matchingSubmissionIds = new Set(
      submissions
        .filter((s) => {
          if (s.feedback_type !== role || !s.feedback_for_id) return false
          if (cutoff !== null && new Date(s.created_at).getTime() < cutoff) return false
          const target = empById.get(s.feedback_for_id)
          return target?.role === role && target.is_active !== false
        })
        .map((s) => s.id)
    )

    const bySubmission = new Map<string, Scored>()
    for (const submissionId of Array.from(matchingSubmissionIds)) {
      const submission = submissions.find((s) => s.id === submissionId)
      if (!submission?.feedback_for_id) continue
      bySubmission.set(submissionId, {
        submissionId,
        targetId: submission.feedback_for_id,
        createdAt: submission.created_at,
        scores: {},
        trustBattery: null,
      })
    }

    for (const a of answers) {
      const entry = bySubmission.get(a.submission_id)
      if (!entry) continue
      if ((TEAL_KEYS as readonly string[]).includes(a.question_key)) {
        entry.scores[a.question_key as (typeof TEAL_KEYS)[number]] = num(a.answer_value)
      } else if (a.question_key === "trust_battery") {
        entry.trustBattery = num(a.answer_value) ?? null
      }
    }

    return Array.from(bySubmission.values()).filter(
      (s) => TEAL_KEYS.every((k) => s.scores[k] !== undefined) && s.trustBattery !== null
    )
  }, [submissions, answers, empById, windowKey, role])

  const flaggedAny = useMemo(
    () =>
      scored.filter(
        (s) =>
          TEAL_KEYS.every((k) => (s.scores[k] as number) < tealThreshold) &&
          (s.trustBattery as number) < trustThreshold
      ),
    [scored, tealThreshold, trustThreshold]
  )

  const perPerson = useMemo(() => {
    const byPerson = new Map<string, Scored[]>()
    for (const s of scored) {
      byPerson.set(s.targetId, [...(byPerson.get(s.targetId) ?? []), s])
    }
    return Array.from(byPerson.entries()).map(([id, rows]) => {
      const avg = (key: (typeof TEAL_KEYS)[number]) =>
        rows.reduce((sum, r) => sum + (r.scores[key] as number), 0) / rows.length
      const avgTrust = rows.reduce((sum, r) => sum + (r.trustBattery as number), 0) / rows.length
      const flaggedCount = flaggedAny.filter((f) => f.targetId === id).length
      const meetsOnAverage = TEAL_KEYS.every((k) => avg(k) < tealThreshold) && avgTrust < trustThreshold
      return {
        id,
        name: empById.get(id)?.name ?? "unknown",
        reviewCount: rows.length,
        avgScores: Object.fromEntries(TEAL_KEYS.map((k) => [k, avg(k)])) as Record<
          (typeof TEAL_KEYS)[number],
          number
        >,
        avgTrust,
        flaggedCount,
        meetsOnAverage,
      }
    })
  }, [scored, flaggedAny, tealThreshold, trustThreshold, empById])

  const result = useMemo(() => {
    if (mode === "any") {
      return perPerson
        .filter((p) => p.flaggedCount > 0)
        .sort((a, b) => b.flaggedCount - a.flaggedCount || a.avgTrust - b.avgTrust)
    }
    return perPerson.filter((p) => p.meetsOnAverage).sort((a, b) => a.avgTrust - b.avgTrust)
  }, [perPerson, mode])

  return (
    <div className="space-y-6">
      <SectionHeading
        accent="pink"
        eyebrow="admin"
        title="trust risk scan"
        description="tune the thresholds below — the list updates as you move them. reads from feedback already loaded on this page, nothing is saved."
      />

      <SegmentedControl
        ariaLabel="role"
        options={ROLE_OPTIONS}
        value={role}
        onChange={setRole}
      />

      <BrandPanel accent="pink" tone="plain" className="p-6 space-y-5">
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label className="text-xs font-semibold tracking-[0.08em] text-muted" htmlFor="teal-threshold">
              teal principle scores below
            </label>
            <div className="mt-2 flex items-center gap-3">
              <input
                id="teal-threshold"
                type="range"
                min={2}
                max={5}
                step={1}
                value={tealThreshold}
                onChange={(e) => setTealThreshold(Number(e.target.value))}
                className="flex-1"
              />
              <span className="w-10 text-right text-lg font-semibold text-ink">{tealThreshold}</span>
            </div>
            <p className="mt-1.5 text-xs text-muted">
              on self-management, wholeness, and evolutionary purpose — all three, out of 5.
            </p>
          </div>

          <div>
            <label className="text-xs font-semibold tracking-[0.08em] text-muted" htmlFor="trust-threshold">
              trust battery below
            </label>
            <div className="mt-2 flex items-center gap-3">
              <input
                id="trust-threshold"
                type="range"
                min={0}
                max={100}
                step={5}
                value={trustThreshold}
                onChange={(e) => setTrustThreshold(Number(e.target.value))}
                className="flex-1"
              />
              <span className="w-10 text-right text-lg font-semibold text-ink">{trustThreshold}</span>
            </div>
            <p className="mt-1.5 text-xs text-muted">
              out of 100 ·{" "}
              {trustThreshold > 90
                ? "NPS 9–10 territory"
                : trustThreshold > 85
                ? "NPS 7–8 territory"
                : "below NPS 7 — detractor range"}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
          <div>
            <Eyebrow accent="pink">time window</Eyebrow>
            <div className="mt-2">
              <SegmentedControl
                ariaLabel="time window"
                options={WINDOW_OPTIONS.map((w) => ({ key: w.key, label: w.label }))}
                value={windowKey}
                onChange={setWindowKey}
              />
            </div>
          </div>
          <div>
            <Eyebrow accent="pink">trigger on</Eyebrow>
            <div className="mt-2">
              <SegmentedControl
                ariaLabel="trigger mode"
                options={[
                  { key: "any", label: "any single review", title: "flags if one reviewer's scores cross both thresholds" },
                  { key: "average", label: "average across reviews", title: "flags if the person's average scores cross both thresholds" },
                ]}
                value={mode}
                onChange={setMode}
              />
            </div>
          </div>
        </div>
      </BrandPanel>

      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-bold tracking-[-0.03em] text-ink">{result.length}</span>
        <span className="text-sm text-muted">
          {role === "full_timer" ? "full-timer" : "intern"}
          {result.length === 1 ? "" : "s"} in this bracket
          {mode === "any" ? " (at least one flagged review)" : " (on average)"}
        </span>
      </div>

      {result.length === 0 ? (
        <BrandPanel accent="pink" tone="washed" className="p-6 text-sm text-muted">
          nobody meets both thresholds in this window.
        </BrandPanel>
      ) : (
        <div className="overflow-x-auto rounded-[22px] border border-line bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-[11px] font-semibold tracking-[0.08em] text-muted">
                <th className="px-4 py-3">name</th>
                <th className="px-4 py-3">reviews in window</th>
                {TEAL_KEYS.map((k) => (
                  <th key={k} className="px-4 py-3">avg {TEAL_LABELS[k]}</th>
                ))}
                <th className="px-4 py-3">avg trust</th>
                <th className="px-4 py-3">{mode === "any" ? "flagged reviews" : "on average"}</th>
              </tr>
            </thead>
            <tbody>
              {result.map((p) => (
                <tr key={p.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <span
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
                        style={{ backgroundColor: getAvatarColor(p.name) }}
                      >
                        {getInitials(p.name)}
                      </span>
                      <span className="font-semibold text-ink">{p.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted">{p.reviewCount}</td>
                  {TEAL_KEYS.map((k) => (
                    <td key={k} className="px-4 py-3 text-muted">{p.avgScores[k].toFixed(1)}</td>
                  ))}
                  <td className="px-4 py-3 text-muted">{p.avgTrust.toFixed(0)}</td>
                  <td className="px-4 py-3">
                    {mode === "any" ? (
                      <span className="rounded-full bg-[#d35b52]/10 px-2.5 py-1 text-xs font-semibold text-[#d35b52]">
                        {p.flaggedCount} of {p.reviewCount}
                      </span>
                    ) : (
                      <span className="rounded-full bg-[#d35b52]/10 px-2.5 py-1 text-xs font-semibold text-[#d35b52]">
                        yes
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
