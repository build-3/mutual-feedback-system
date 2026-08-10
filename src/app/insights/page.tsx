"use client"

import Link from "next/link"
import dynamic from "next/dynamic"
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useSearchParams } from "next/navigation"
import Navbar from "@/components/Navbar"
import {
  SectionHeading,
  EmptyState,
  SegmentedControl,
  CycleStepper,
  buttonClasses,
} from "@/components/ui/brand"
import { DATE_RANGE_LABELS, SCREEN_ACCENTS, type DateRange } from "@/lib/brand"
import { cycleFor, cycleFromKey, shiftCycle } from "@/lib/cycles"
import type { Employee, FeedbackResponse } from "@/lib/types"
import { filterSubmissionsByRange } from "@/lib/insights-helpers"
import type { SubmissionWithDetails } from "./types"
import ProfileHeader from "@/components/insights/ProfileHeader"
import ScoreCardRow from "@/components/insights/ScoreCardRow"
import ITPArchetypeBadge from "@/components/insights/ITPArchetypeBadge"
import FeedbackGivenPanel from "@/components/insights/FeedbackGivenPanel"
import SelfReflectionsPanel from "@/components/insights/SelfReflectionsPanel"

const EmployeePicker = dynamic(() => import("@/components/insights/EmployeePicker"), { ssr: false })
const CompetencyRadar = dynamic(() => import("@/components/insights/CompetencyRadar"))
const ContributionChart = dynamic(() => import("@/components/insights/ContributionChart"))
const FeedbackTimeline = dynamic(() => import("@/components/insights/FeedbackTimeline"))
const OrgOverview = dynamic(() => import("@/components/insights/OrgOverview"))
const ProbationSection = dynamic(() => import("@/components/admin/ProbationSection"))

const insightsAccent = SCREEN_ACCENTS.insights

const DATE_RANGES: { key: DateRange; label: string; title?: string }[] = [
  { key: "cycle", label: "this cycle", title: "the current session cycle — 2nd tuesday to 2nd tuesday" },
  { key: "3cycles", label: "3 cycles", title: "the current cycle plus the two before it" },
  { key: "all", label: "all time" },
]

type EmployeeMetrics = {
  employeeId: string
  employeeName: string
  receivedSubmissions: SubmissionWithDetails[]
  givenSubmissions: SubmissionWithDetails[]
  selfSubmissions: SubmissionWithDetails[]
  metrics: Record<string, { key: string; values: number[]; avg: number; count: number }>
  contributionCounts: Record<string, number>
  contributionRaters: Record<string, string[]>
  archetypeCounts: Record<string, number>
  lastFeedbackDate: string | null
  givenFeedbackSummary: { employeeId: string | null; employeeName: string; date: string; submissionId: string }[]
  scoreTimeline: Record<string, { date: string; value: number }[]>
  textFeedbackGrouped: Record<string, string[]>
}

type OrgMetrics = {
  totalEmployees: number
  totalSubmissions: number
  totalInterns: number
  totalFullTimers: number
  avgTrustBattery: number | null
  avgPurposeAlignment: number | null
  avgRecommendRating: number | null
  avgNps: number | null
  contributionDistribution: Record<string, number>
  archetypeDistribution: Record<string, number>
  feedbackByType: Record<string, number>
  employeesWithFeedback: number
  employeesWithoutFeedback: number
  recentActivity: SubmissionWithDetails[]
  tealAvg: { selfManagement: number | null; wholeness: number | null; purpose: number | null }
  npsBreakdown: { promoters: number; passives: number; detractors: number; npsScore: number | null; promoterNames: string[]; passiveNames: string[]; detractorNames: string[] }
  scoreDistributions: Record<string, number[]>
  avgMetricsMap: Record<string, number>
  participationByEmployee: Record<string, number>
  employeeIdsWithFeedback: string[]
  valueStrengthCounts: Record<string, number>
  valueImprovementCounts: Record<string, number>
}

export default function InsightsPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-canvas flex items-center justify-center">
          <div className="skeleton h-9 w-32 rounded-full" />
        </div>
      }
    >
      <InsightsContent />
    </Suspense>
  )
}

function SkeletonShell() {
  return (
    <div className="min-h-screen">
      <Navbar />
      <div className="mx-auto max-w-5xl px-3 pt-3 sm:pt-8 sm:px-6 animate-fade-in">
        <div className="flex items-center gap-2 mb-4">
          <div className="skeleton h-4 w-16 rounded-full" />
        </div>
        <div className="skeleton h-10 w-64 rounded-2xl mb-2" />
        <div className="skeleton h-5 w-80 rounded-2xl mb-6" />
        <div className="space-y-4">
          <div className="skeleton h-48 rounded-3xl" />
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            {[1, 2, 3, 4].map(i => <div key={i} className="skeleton h-20 rounded-2xl" />)}
          </div>
        </div>
      </div>
    </div>
  )
}

function InsightsContent() {
  const searchParams = useSearchParams()
  const [employees, setEmployees] = useState<Employee[]>([])
  const [enrichedSubmissions, setEnrichedSubmissions] = useState<SubmissionWithDetails[]>([])
  const [responsesByAnswer, setResponsesByAnswer] = useState<Record<string, (FeedbackResponse & { responderName: string })[]>>({})
  const [orgMetricsData, setOrgMetrics] = useState<OrgMetrics | null>(null)
  const [employeeMetricsMap, setEmployeeMetricsMap] = useState<Record<string, EmployeeMetrics>>({})
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null)
  const [showOrgOverview, setShowOrgOverview] = useState(true)
  // Server-computed: replies to org feedback publish as the studio for MOD_EMAILS
  // viewers, so the compose box must name that identity instead of theirs.
  const [viewerIsOrgMod, setViewerIsOrgMod] = useState(false)
  // Lands on the current cycle. An all-time landing view averaged every round
  // ever recorded into one number and presented it as the current picture, which
  // is what made the dashboard untrustworthy. Calendar months were no better —
  // sessions land mid-month, so early in a month the window was empty while the
  // last session's feedback sat just outside it, unreachable.
  //
  // A cycle runs 2nd Tuesday → 2nd Tuesday, so "this cycle" always contains the
  // most recent session. It does go empty for the first days after a reset; that
  // is intended, and OrgOverview renders that as a designed state with a way
  // back to the previous cycle rather than a page full of zeros.
  const [dateRange, setDateRange] = useState<DateRange>("cycle")
  // null = "whatever cycle contains today", re-resolved on each load so a tab
  // left open overnight rolls over instead of silently showing a stale window.
  const [cycleKey, setCycleKey] = useState<string | null>(null)
  // What the server actually scoped to — the source of truth for every label.
  const [resolvedCycleKey, setResolvedCycleKey] = useState<string | null>(null)
  const [currentUser, setCurrentUser] = useState<{ id: string; name: string; email?: string | null } | null>(null)
  const initialLoadDone = useRef(false)

  const loadDashboard = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      // Send a concrete cycle key rather than letting the server resolve "now".
      // The route is cached for 30s with a 60s stale-while-revalidate tail, so a
      // bare ?range=cycle could serve the *previous* cycle's numbers under a
      // "this cycle" label for up to 90s after a reset. Keying the URL on the
      // cycle makes the cache entry change the instant the cycle rolls.
      const resolvedCycle = cycleKey ?? cycleFor().key
      const res = await fetch(`/api/insights/data?range=${dateRange}&cycle=${resolvedCycle}`)
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(payload.error || "we could not load the latest insight data.")
      setEmployees((payload.employees || []) as Employee[])
      setEnrichedSubmissions((payload.submissions || []) as SubmissionWithDetails[])
      setResponsesByAnswer((payload.responsesByAnswer || {}) as Record<string, (FeedbackResponse & { responderName: string })[]>)
      setOrgMetrics((payload.orgMetrics || null) as OrgMetrics | null)
      setEmployeeMetricsMap((payload.employeeMetrics || {}) as Record<string, EmployeeMetrics>)
      // Adopt the server's resolved values rather than trusting local state, so
      // a legacy ?range=month request renders as "this cycle" instead of
      // mislabelling cycle data as a month.
      if (payload.range) setDateRange(payload.range as DateRange)
      if (payload.cycleKey) setResolvedCycleKey(payload.cycleKey as string)
      setViewerIsOrgMod(payload.viewerIsOrgMod === true)
    } catch (error) {
      console.error(error)
      setLoadError(error instanceof Error ? error.message : "we could not load the latest insight data.")
    } finally {
      setLoading(false)
      initialLoadDone.current = true
    }
  }, [dateRange, cycleKey])

  const handleResponseSaved = useCallback(() => {
    void loadDashboard()
  }, [loadDashboard])

  useEffect(() => { void loadDashboard() }, [loadDashboard])

  const [meChecked, setMeChecked] = useState(false)
  useEffect(() => {
    fetch("/api/me").then(r => r.json()).then(data => {
      if (data?.employee?.id && data?.employee?.name)
        setCurrentUser({ id: data.employee.id, name: data.employee.name, email: data.employee.email ?? null })
    }).catch(() => {}).finally(() => setMeChecked(true))
  }, [])

  const [viewResolved, setViewResolved] = useState(false)
  const autoSelectedRef = useRef(false)
  useEffect(() => {
    if (autoSelectedRef.current) return
    if (employees.length === 0) return
    const employeeParam = searchParams.get("employee")
    if (employeeParam) {
      const exists = employees.some(e => e.id === employeeParam)
      if (exists) { autoSelectedRef.current = true; setSelectedEmployeeId(employeeParam); setShowOrgOverview(false) }
      setViewResolved(true)
      return
    }
    if (!meChecked) return
    if (currentUser) {
      const exists = employees.some(e => e.id === currentUser.id)
      if (exists) { autoSelectedRef.current = true; setSelectedEmployeeId(currentUser.id); setShowOrgOverview(false) }
    }
    setViewResolved(true)
  }, [searchParams, employees, currentUser, meChecked])

  const filteredSubmissions = useMemo(
    () => filterSubmissionsByRange(enrichedSubmissions, dateRange, resolvedCycleKey),
    [enrichedSubmissions, dateRange, resolvedCycleKey]
  )

  // The window every label describes. Prefers the pending selection over the
  // server-confirmed one so stepping feels immediate; data catches up on the
  // next fetch. Falls back to today's cycle before anything is chosen.
  const activeCycle = useMemo(
    () =>
      (cycleKey ? cycleFromKey(cycleKey) : null) ??
      (resolvedCycleKey ? cycleFromKey(resolvedCycleKey) : null) ??
      cycleFor(),
    [cycleKey, resolvedCycleKey]
  )

  const isCurrentCycle = activeCycle.key === cycleFor().key

  // Functional updates, deliberately: reading activeCycle here would capture a
  // value that only changes after the fetch resolves, so three quick clicks on ‹
  // would all compute the same target and move a single cycle.
  const stepCycle = useCallback((delta: number) => {
    setDateRange("cycle")
    setCycleKey((prev) => {
      const from = (prev ? cycleFromKey(prev) : null) ?? cycleFor()
      const next = shiftCycle(from, delta)
      // Never step past the live cycle.
      return next.startMs > cycleFor().startMs ? from.key : next.key
    })
  }, [])

  const goToPrevCycle = useCallback(() => stepCycle(-1), [stepCycle])
  const goToNextCycle = useCallback(() => stepCycle(1), [stepCycle])

  const build3Submissions = useMemo(
    () => filteredSubmissions.filter((s) => s.submission.feedback_type === "build3"),
    [filteredSubmissions]
  )

  const selectedEmployeeBuild3Submissions = useMemo(
    () => build3Submissions.filter((s) => s.submission.submitted_by_id === selectedEmployeeId),
    [build3Submissions, selectedEmployeeId]
  )

  // Get pre-computed employee metrics, filtered by date range
  const employeeInsights = useMemo(() => {
    if (!selectedEmployeeId || !employeeMetricsMap[selectedEmployeeId]) {
      return {
        employee: employees.find(e => e.id === selectedEmployeeId) || null,
        receivedSubmissions: [] as SubmissionWithDetails[],
        givenSubmissions: [] as SubmissionWithDetails[],
        selfSubmissions: [] as SubmissionWithDetails[],
        metrics: {} as Record<string, any>,
        contributionCounts: {} as Record<string, number>,
        contributionRaters: {} as Record<string, string[]>,
        archetypeCounts: {} as Record<string, number>,
        lastFeedbackDate: null as string | null,
        givenFeedbackSummary: [] as any[],
        scoreTimeline: {} as Record<string, any>,
        textFeedbackGrouped: {} as Record<string, string[]>,
      }
    }
    const precomputed = employeeMetricsMap[selectedEmployeeId]
    const filterFn = (s: SubmissionWithDetails) => dateRange === "all" ? true : (
      filteredSubmissions.some((fs) => fs.submission.id === s.submission.id)
    )
    return {
      employee: employees.find(e => e.id === selectedEmployeeId) || null,
      receivedSubmissions: precomputed.receivedSubmissions.filter(filterFn),
      givenSubmissions: precomputed.givenSubmissions.filter(filterFn),
      selfSubmissions: precomputed.selfSubmissions.filter(filterFn),
      metrics: precomputed.metrics,
      contributionCounts: precomputed.contributionCounts,
      contributionRaters: precomputed.contributionRaters,
      archetypeCounts: precomputed.archetypeCounts,
      lastFeedbackDate: precomputed.lastFeedbackDate,
      givenFeedbackSummary: precomputed.givenFeedbackSummary,
      scoreTimeline: precomputed.scoreTimeline,
      textFeedbackGrouped: precomputed.textFeedbackGrouped,
    }
  }, [selectedEmployeeId, employeeMetricsMap, employees, dateRange, filteredSubmissions])

  const viewReady = viewResolved || employees.length === 0

  // Show skeleton shell on initial load instead of blank page
  if (!initialLoadDone.current && loading) return <SkeletonShell />

  // Only gate on view-resolution (auto-select) before the FIRST load completes.
  // `loading` alone must never land here again after that — every later
  // reload (e.g. a reply save re-fetching the dashboard) would otherwise
  // blank the whole page and unmount scroll/expand/filter state right back
  // into the bug this was meant to fix.
  if (!initialLoadDone.current && !viewReady) {
    return (
      <div className="min-h-screen bg-canvas flex items-center justify-center">
        <div className="flex items-center gap-3 text-muted text-sm animate-pulse">
          <div className="h-4 w-4 rounded-full border-2 border-brand-sky border-t-transparent animate-spin" />
          pulling together the latest team signal...
        </div>
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="min-h-screen bg-canvas px-4 py-10 sm:px-6">
        <div className="mx-auto max-w-5xl">
          <EmptyState
            accent={insightsAccent}
            title="we hit a snag loading insights"
            description={loadError}
            action={
              <button
                type="button"
                onClick={() => void loadDashboard()}
                {...buttonClasses({ accent: insightsAccent, variant: "solid", size: "sm" })}
              >
                try again
              </button>
            }
          />
        </div>
      </div>
    )
  }

  const usePrecomputedOrg = orgMetricsData ?? {
    totalEmployees: employees.length,
    totalSubmissions: 0,
    totalInterns: 0, totalFullTimers: 0,
    avgTrustBattery: null, avgPurposeAlignment: null, avgRecommendRating: null, avgNps: null,
    contributionDistribution: {}, archetypeDistribution: {},
    feedbackByType: {},
    employeesWithFeedback: 0, employeesWithoutFeedback: employees.length,
    recentActivity: [],
    tealAvg: { selfManagement: null, wholeness: null, purpose: null },
    npsBreakdown: { promoters: 0, passives: 0, detractors: 0, npsScore: null, promoterNames: [], passiveNames: [], detractorNames: [] },
    scoreDistributions: {}, avgMetricsMap: {}, participationByEmployee: {},
    employeeIdsWithFeedback: [],
    valueStrengthCounts: {}, valueImprovementCounts: {},
  }

  const insights = employeeInsights

  const hasDetailedData =
    Object.keys(insights.metrics).length > 0 ||
    Object.keys(insights.contributionCounts).length > 0 ||
    Object.keys(insights.archetypeCounts).length > 0

  return (
    <div className="min-h-screen bg-canvas page-enter">
      <Navbar />
      <div className="mx-auto max-w-5xl px-3 pt-3 sm:pt-8 sm:px-6">
        <SectionHeading
          accent="sky"
          eyebrow="insights"
          title="clear signal"
          description={
            dateRange === "all"
              ? `${employees.length} teammates, ${usePrecomputedOrg.totalSubmissions} submissions all time.`
              : `${employees.length} teammates, ${usePrecomputedOrg.totalSubmissions} submissions in ${DATE_RANGE_LABELS[dateRange]} (${activeCycle.label}).`
          }
        />
        <div className="mt-5 sm:mt-6 space-y-3 sm:space-y-0 sm:flex sm:flex-wrap sm:items-center sm:gap-3 border-b border-line pb-4">
          <div className="flex items-center justify-between gap-2 sm:contents">
            <button
              type="button"
              onClick={() => { setShowOrgOverview(true); setSelectedEmployeeId(null) }}
              className={`flex min-h-[40px] items-center rounded-full border px-4 py-2 text-sm font-semibold transition-all ${
                showOrgOverview ? "border-ink bg-ink text-white" : "border-line bg-white text-muted hover:border-ink/20"
              }`}
            >
              org overview
            </button>
            <div className="hidden sm:block h-5 w-px bg-line" />
            <SegmentedControl
              ariaLabel="date range"
              className="sm:ml-auto"
              options={DATE_RANGES}
              value={dateRange}
              onChange={key => {
                setDateRange(key)
                // Picking a range pill always snaps back to the live cycle;
                // stepping is an explicit action.
                setCycleKey(null)
              }}
            />
          </div>
          {/* Stepping only makes sense for a single-cycle window. */}
          {dateRange === "cycle" && (
            <CycleStepper
              label={activeCycle.label}
              onPrev={goToPrevCycle}
              onNext={goToNextCycle}
              nextDisabled={isCurrentCycle}
            />
          )}
          <div className="sm:contents">
            <EmployeePicker
              employees={employees}
              selectedId={showOrgOverview ? null : selectedEmployeeId}
              onSelect={id => { setSelectedEmployeeId(id); setShowOrgOverview(false) }}
              employeesWithFeedback={new Set(usePrecomputedOrg.employeeIdsWithFeedback)}
            />
          </div>
        </div>

        {/* The empty-window banner that used to live here is gone. An empty
            cycle is a first-class state now, owned by OrgOverview, so one
            component tells the whole story instead of a banner plus five
            sections independently vanishing. */}
      </div>
      <div className="mx-auto max-w-5xl px-3 py-3 sm:px-6 sm:py-5 pb-20">
        {showOrgOverview ? (
          <OrgOverview
            orgMetrics={usePrecomputedOrg as any}
            build3Submissions={build3Submissions}
            employees={employees}
            responsesByAnswer={responsesByAnswer}
            currentUser={currentUser}
            onResponseSaved={handleResponseSaved}
            cycleLabel={dateRange === "all" ? null : activeCycle.label}
            onViewPreviousCycle={goToPrevCycle}
          />
        ) : insights.employee ? (
          <div className="space-y-3 sm:space-y-4">
            <ProfileHeader
              employee={insights.employee}
              receivedCount={insights.receivedSubmissions.length}
              givenCount={insights.givenSubmissions.length}
              selfCount={insights.selfSubmissions.length}
              lastFeedbackDate={insights.lastFeedbackDate}
            />
            <ScoreCardRow metrics={insights.metrics as any} orgAvgMetrics={usePrecomputedOrg.avgMetricsMap} />
            {hasDetailedData && (
              <>
                <div className="grid gap-3 sm:gap-4 lg:grid-cols-2">
                  <CompetencyRadar metrics={insights.metrics as any} orgAvgMetrics={usePrecomputedOrg.avgMetricsMap} />
                  <ContributionChart contributionCounts={insights.contributionCounts} contributionRaters={insights.contributionRaters} />
                </div>
                <ITPArchetypeBadge archetypeCounts={insights.archetypeCounts} />
              </>
            )}
            {insights.receivedSubmissions.length === 0 && insights.selfSubmissions.length === 0 && (
              <EmptyState
                accent={insightsAccent}
                title="nothing in this cycle yet"
                description={
                  <>{insights.employee.name} has not received peer notes or logged a self reflection
                    {dateRange === "all" ? "" : ` in ${activeCycle.label}`}. You can change that from{" "}
                    <Link href="/feedback" className="font-semibold text-ink underline decoration-brand-sky decoration-2 underline-offset-4">the feedback form</Link>.
                  </>
                }
                action={
                  dateRange === "cycle" ? (
                    <button
                      type="button"
                      onClick={goToPrevCycle}
                      {...buttonClasses({ accent: insightsAccent, variant: "outline", size: "sm" })}
                    >
                      look at the previous cycle
                    </button>
                  ) : undefined
                }
              />
            )}
            {insights.receivedSubmissions.length > 0 && (
              <FeedbackTimeline submissions={insights.receivedSubmissions} title="feedback received" responsesByAnswer={responsesByAnswer} currentUser={currentUser} onResponseSaved={handleResponseSaved} />
            )}
            <FeedbackGivenPanel givenFeedbackSummary={insights.givenFeedbackSummary} totalTeamSize={employees.length} />
            <SelfReflectionsPanel submissions={insights.selfSubmissions} />
            {selectedEmployeeBuild3Submissions.length > 0 && (
              <FeedbackTimeline submissions={selectedEmployeeBuild3Submissions} title="their notes about build3" responsesByAnswer={responsesByAnswer} currentUser={currentUser} onResponseSaved={handleResponseSaved} respondAsOrg={viewerIsOrgMod} />
            )}
          </div>
        ) : (
          <EmptyState
            accent={insightsAccent}
            title="pick a teammate above"
            description="Select someone from the dropdown, or stay on org overview for the broad picture."
          />
        )}
      </div>
      {!showOrgOverview && insights.employee?.role === "intern" && (
        <div className="mx-auto max-w-5xl px-3 pb-20 sm:px-6 sm:pb-5">
          <div className="border-t border-line pt-8 mt-4">
            <ProbationSection key={insights.employee.id} employeeId={insights.employee.id} userEmail={currentUser?.email} />
          </div>
        </div>
      )}
    </div>
  )
}
