"use client"

import dynamic from "next/dynamic"
import { useCallback, useEffect, useMemo, useState } from "react"
import Navbar from "@/components/Navbar"
import { SectionHeading, StatPill, BrandPanel, EmptyState } from "@/components/ui/brand"
import SummaryBoard, { DeptSummary } from "@/components/mod/SummaryBoard"
import ReviewExplorer from "@/components/mod/ReviewExplorer"
import ResponsesList from "@/components/mod/ResponsesList"
import type { ChartsData } from "@/components/mod/ModCharts"
import { ModData, ModReview, ModResponse } from "@/components/mod/types"

const ModCharts = dynamic(() => import("@/components/mod/ModCharts"), {
  ssr: false,
  loading: () => <div className="h-64 animate-pulse rounded-2xl bg-line/30" />,
})

type Tab = "overview" | "analytics" | "reviews" | "raw"

const TABS: { key: Tab; label: string }[] = [
  { key: "overview", label: "overview" },
  { key: "analytics", label: "analytics" },
  { key: "reviews", label: "reviews" },
  { key: "raw", label: "raw responses" },
]

function buildDeptSummary(reviews: ModReview[]): DeptSummary[] {
  const map = new Map<string, { total: number; count: number; critical: number }>()
  for (const r of reviews) {
    const cur = map.get(r.department) ?? { total: 0, count: 0, critical: 0 }
    cur.count += 1
    cur.total += r.severity ?? 0
    if ((r.severity ?? 0) >= 4.5) cur.critical += 1
    map.set(r.department, cur)
  }
  return Array.from(map.entries())
    .map(([department, v]) => ({
      department,
      count: v.count,
      avgSeverity: v.count ? v.total / v.count : 0,
      criticalCount: v.critical,
    }))
    .sort((a, b) => b.count - a.count)
}

function buildCharts(reviews: ModReview[], responses: ModResponse[]): ChartsData {
  const deptRows = buildDeptSummary(reviews).map((d) => ({
    department: d.department,
    count: d.count,
    avgSeverity: d.avgSeverity,
  }))

  const severityDist = [1, 2, 3, 4, 5].map((value) => ({
    label: String(value),
    value,
    count: reviews.filter((r) => Math.round(r.severity ?? 0) === value).length,
  }))

  const bucketDefs = [
    { label: "<50%", floor: 40, test: (p: number) => p < 50 },
    { label: "50–69%", floor: 55, test: (p: number) => p >= 50 && p < 70 },
    { label: "70–84%", floor: 75, test: (p: number) => p >= 70 && p < 85 },
    { label: "85%+", floor: 90, test: (p: number) => p >= 85 },
  ]
  const pcts = responses
    .map((r) => (r.trust_battery == null ? null : r.trust_battery * 100))
    .filter((p): p is number => p != null)
  const trustBuckets = bucketDefs.map((b) => ({
    label: b.label,
    floor: b.floor,
    count: pcts.filter(b.test).length,
  }))

  return { deptRows, severityDist, trustBuckets }
}

export default function ModPage() {
  const [data, setData] = useState<ModData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>("overview")

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/mod/reviews", { cache: "no-store" })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(payload.error || "Failed to load data")
      setData({ reviews: payload.reviews || [], responses: payload.responses || [] })
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const reviews = useMemo(() => data?.reviews ?? [], [data])
  const responses = useMemo(() => data?.responses ?? [], [data])

  const deptSummary = useMemo(() => buildDeptSummary(reviews), [reviews])
  const charts = useMemo(() => buildCharts(reviews, responses), [reviews, responses])

  const stats = useMemo(() => {
    const trustVals = responses
      .map((r) => r.trust_battery)
      .filter((v): v is number => v != null)
    const npsVals = responses.map((r) => r.nps_score).filter((v): v is number => v != null)
    const avgTrust = trustVals.length
      ? Math.round((trustVals.reduce((a, b) => a + b, 0) / trustVals.length) * 100)
      : null
    const avgNps = npsVals.length
      ? (npsVals.reduce((a, b) => a + b, 0) / npsVals.length).toFixed(1)
      : null
    const critical = reviews.filter((r) => (r.severity ?? 0) >= 4.5).length
    return { avgTrust, avgNps, critical }
  }, [reviews, responses])

  return (
    <div className="min-h-screen bg-[#fffaf5]">
      <Navbar />
      <div className="mx-auto max-w-5xl px-3 pb-20 pt-4 sm:px-6 sm:pt-8">
        <SectionHeading
          accent="peach"
          eyebrow="restricted · leadership only"
          title="org review 2026"
          description="Employee feedback mastersheet — categorized reviews by department plus raw survey responses. Visible only to the leadership allowlist."
        />

        {/* Tabs */}
        <div className="mt-6 flex flex-wrap gap-1 rounded-full border border-line bg-white/70 p-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                tab === t.key ? "bg-ink text-white" : "text-muted hover:text-ink"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="mt-6">
          {loading ? (
            <div className="h-64 animate-pulse rounded-2xl bg-line/30" />
          ) : error ? (
            <EmptyState
              accent="peach"
              title="couldn't load"
              description={error}
            />
          ) : reviews.length === 0 && responses.length === 0 ? (
            <EmptyState
              accent="peach"
              title="no data yet"
              description="Run scripts/import-mastersheet.mjs to populate the review tables."
            />
          ) : (
            <>
              {tab === "overview" && (
                <div className="space-y-6">
                  <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                    <StatPill accent="sky" label="responses" value={responses.length} />
                    <StatPill accent="sage" label="avg trust battery" value={stats.avgTrust != null ? `${stats.avgTrust}%` : "—"} />
                    <StatPill accent="peach" label="reviews" value={reviews.length} />
                    <StatPill accent="pink" label="critical" value={stats.critical} detail={stats.avgNps != null ? `avg NPS ${stats.avgNps}` : undefined} />
                  </div>
                  <SummaryBoard rows={deptSummary} />
                </div>
              )}

              {tab === "analytics" && <ModCharts data={charts} />}

              {tab === "reviews" && <ReviewExplorer reviews={reviews} />}

              {tab === "raw" && (
                <BrandPanel accent="sky" tone="plain" className="p-4 sm:p-5">
                  <ResponsesList responses={responses} />
                </BrandPanel>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
