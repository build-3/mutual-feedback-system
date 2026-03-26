"use client"

import Link from "next/link"
import dynamic from "next/dynamic"
import { Suspense, useCallback, useEffect, useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"
// Lazy-loaded — defer heavy components until needed
const LoadingSkeleton = () => <div className="animate-pulse bg-stone-800/50 rounded-2xl h-64" />
const EmployeeSidebar = dynamic(() => import("@/components/insights/EmployeeSidebar"), {
  loading: LoadingSkeleton,
})
const ProfileHeader = dynamic(() => import("@/components/insights/ProfileHeader"), {
  loading: LoadingSkeleton,
})
const ScoreCardRow = dynamic(() => import("@/components/insights/ScoreCardRow"), {
  loading: LoadingSkeleton,
})
const CompetencyRadar = dynamic(() => import("@/components/insights/CompetencyRadar"), {
  loading: LoadingSkeleton,
})
const ContributionChart = dynamic(() => import("@/components/insights/ContributionChart"), {
  loading: LoadingSkeleton,
})
const FeedbackGivenPanel = dynamic(() => import("@/components/insights/FeedbackGivenPanel"), {
  loading: LoadingSkeleton,
})
const FeedbackTimeline = dynamic(() => import("@/components/insights/FeedbackTimeline"), {
  loading: LoadingSkeleton,
})
const ITPArchetypeBadge = dynamic(() => import("@/components/insights/ITPArchetypeBadge"), {
  loading: LoadingSkeleton,
})
const OrgOverview = dynamic(() => import("@/components/insights/OrgOverview"), {
  loading: LoadingSkeleton,
})
const SelfReflectionsPanel = dynamic(() => import("@/components/insights/SelfReflectionsPanel"), {
  loading: LoadingSkeleton,
})
const TrustBatteryGauge = dynamic(() => import("@/components/insights/TrustBatteryGauge"), {
  loading: LoadingSkeleton,
})
import { EmptyState, PillarMark, buttonClasses } from "@/components/ui/brand"
import { useEmployeeInsights } from "@/hooks/useEmployeeInsights"
import { useOrgInsights } from "@/hooks/useOrgInsights"
import { DATE_RANGE_LABELS, SCREEN_ACCENTS } from "@/lib/brand"
import {
  Employee,
  FeedbackAnswer,
  FeedbackResponse,
  FeedbackSubmission,
} from "@/lib/types"
import { filterSubmissionsByRange } from "@/lib/insights-helpers"
import { SubmissionWithDetails } from "./types"

const insightsAccent = SCREEN_ACCENTS.insights

export default function InsightsPage() {
  return (
    <Suspense fallback={<LoadingSkeleton />}>
      <InsightsContent />
    </Suspense>
  )
}

function InsightsContent() {
  const searchParams = useSearchParams()
  const [employees, setEmployees] = useState<Employee[]>([])
  const [allSubmissions, setAllSubmissions] = useState<SubmissionWithDetails[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null)
  const [showOrgOverview, setShowOrgOverview] = useState(true)
  const [dateRange, setDateRange] = useState<"month" | "3months" | "all">("all")
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [responsesByAnswer, setResponsesByAnswer] = useState<
    Record<string, (FeedbackResponse & { responderName: string })[]>
  >({})

  const buildResponsesByAnswer = useCallback(
    (
      employeeRows: Employee[],
      responseRows: FeedbackResponse[]
    ) => {
      const empMap = new Map(employeeRows.map((e) => [e.id, e.name]))
      const grouped: Record<string, (FeedbackResponse & { responderName: string })[]> = {}

      for (const response of responseRows) {
        if (!grouped[response.answer_id]) grouped[response.answer_id] = []
        grouped[response.answer_id].push({
          ...response,
          responderName: empMap.get(response.responder_id) || "Unknown",
        })
      }

      setResponsesByAnswer(grouped)
    },
    []
  )

  const loadDashboard = useCallback(async () => {
    setLoading(true)
    setLoadError(null)

    try {
      const res = await fetch("/api/admin/dashboard")
      const payload = await res.json().catch(() => ({}))

      if (!res.ok) {
        throw new Error(payload.error || "we could not load the latest insight data.")
      }

      const employeeRows = (payload.employees || []) as Employee[]
      const submissionRows = (payload.submissions || []) as FeedbackSubmission[]
      const answerRows = (payload.answers || []) as FeedbackAnswer[]
      const responseRows = (payload.responses || []) as FeedbackResponse[]

      const employeeMap = new Map(employeeRows.map((employee) => [employee.id, employee]))
      const answerMap = new Map<string, FeedbackAnswer[]>()

      for (const answer of answerRows) {
        if (!answerMap.has(answer.submission_id)) {
          answerMap.set(answer.submission_id, [])
        }
        answerMap.get(answer.submission_id)!.push(answer)
      }

      const enriched: SubmissionWithDetails[] = submissionRows.map((submission) => ({
        submission,
        submitterName:
          employeeMap.get(submission.submitted_by_id)?.name || "Unknown",
        answers: answerMap.get(submission.id) || [],
      }))

      setEmployees(employeeRows)
      setAllSubmissions(enriched)
      buildResponsesByAnswer(employeeRows, responseRows)
    } catch (error) {
      console.error(error)
      setLoadError(
        error instanceof Error
          ? error.message
          : "we could not load the latest insight data."
      )
    } finally {
      setLoading(false)
    }
  }, [buildResponsesByAnswer])

  const handleResponseSaved = useCallback(() => {
    void loadDashboard()
  }, [loadDashboard])

  useEffect(() => {
    void loadDashboard()
  }, [loadDashboard])

  // Auto-select employee from URL param (e.g. /insights?employee=uuid)
  useEffect(() => {
    const employeeParam = searchParams.get("employee")
    if (employeeParam && employees.length > 0) {
      const exists = employees.some((e) => e.id === employeeParam)
      if (exists) {
        setSelectedEmployeeId(employeeParam)
        setShowOrgOverview(false)
      }
    }
  }, [searchParams, employees])

  const filteredSubmissions = useMemo(
    () => filterSubmissionsByRange(allSubmissions, dateRange),
    [allSubmissions, dateRange]
  )

  const insights = useEmployeeInsights(
    selectedEmployeeId,
    employees,
    allSubmissions,
    dateRange
  )

  const orgMetrics = useOrgInsights(employees, allSubmissions, dateRange)

  const build3Submissions = useMemo(
    () =>
      filteredSubmissions.filter(
        (submission) => submission.submission.feedback_type === "build3"
      ),
    [filteredSubmissions]
  )

  const selectedEmployeeBuild3Submissions = useMemo(
    () =>
      build3Submissions.filter(
        (submission) => submission.submission.submitted_by_id === selectedEmployeeId
      ),
    [build3Submissions, selectedEmployeeId]
  )

  const linkButton = buttonClasses({
    accent: insightsAccent,
    variant: "ghost",
    size: "sm",
  })

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="text-center">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full border border-brand-sky/50 bg-brand-sky/25">
            <PillarMark accent={insightsAccent} />
          </div>
          <div className="mx-auto mb-4 h-9 w-9 animate-spin rounded-full border-[3px] border-brand-sky border-t-transparent" />
          <p className="text-sm text-muted">pulling together the latest team signal...</p>
        </div>
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="min-h-screen px-4 py-10 sm:px-6">
        <EmptyState
          accent={insightsAccent}
          title="we hit a snag loading insights"
          description={loadError}
        />
      </div>
    )
  }

  return (
    <div className="flex min-h-screen bg-canvas">
      <EmployeeSidebar
        employees={employees}
        selectedId={selectedEmployeeId}
        onSelect={(id) => {
          setSelectedEmployeeId(id)
          setShowOrgOverview(false)
        }}
        showOrgOverview={showOrgOverview}
        onToggleOrg={() => {
          setShowOrgOverview(true)
          setSelectedEmployeeId(null)
        }}
        dateRange={dateRange}
        onDateRangeChange={setDateRange}
        employeesWithFeedback={orgMetrics.employeeIdsWithFeedback}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        participationByEmployee={orgMetrics.participationByEmployee}
        totalTeamSize={employees.length}
      />

      <main className="min-w-0 flex-1">
        <div className="sticky top-0 z-30 border-b border-line bg-canvas/88 backdrop-blur-xl">
          <div className="flex items-center gap-3 px-4 py-3 sm:px-6">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="rounded-full border border-line bg-white p-2 text-ink lg:hidden"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>

            <div className="hidden h-11 w-11 items-center justify-center rounded-full border border-line bg-white/82 shadow-brand sm:flex">
              <PillarMark accent={insightsAccent} />
            </div>

            <div>
              <div className="text-[11px] font-semibold tracking-[0.08em] text-muted">
                team view
              </div>
              <div className="text-sm font-semibold tracking-[-0.03em] text-ink">
                clear signal for {DATE_RANGE_LABELS[dateRange]}
              </div>
            </div>

            <div className="ml-auto flex flex-wrap items-center gap-2">
              <Link href="/feedback" className={linkButton.className} style={linkButton.style}>
                give feedback
              </Link>
              <Link href="/employees" className={linkButton.className} style={linkButton.style}>
                people
              </Link>
            </div>
          </div>
        </div>

        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
          {showOrgOverview ? (
            <OrgOverview orgMetrics={orgMetrics} build3Submissions={build3Submissions} />
          ) : insights.employee ? (
            <div className="space-y-6">
              <ProfileHeader
                employee={insights.employee}
                receivedCount={insights.receivedSubmissions.length}
                givenCount={insights.givenSubmissions.length}
                selfCount={insights.selfSubmissions.length}
                lastFeedbackDate={insights.lastFeedbackDate}
                orgAvgMetrics={orgMetrics.avgMetricsMap}
              />

              <ScoreCardRow
                metrics={insights.metrics}
                contributionCounts={insights.contributionCounts}
                orgAvgMetrics={orgMetrics.avgMetricsMap}
              />

              {(Object.keys(insights.metrics).length > 0 ||
                Object.keys(insights.contributionCounts).length > 0 ||
                Object.keys(insights.archetypeCounts).length > 0) && (
                <>
                  <div className="grid gap-6 lg:grid-cols-2">
                    <CompetencyRadar
                      metrics={insights.metrics}
                      orgAvgMetrics={orgMetrics.avgMetricsMap}
                    />
                    <TrustBatteryGauge metrics={insights.metrics} />
                  </div>

                  <div className="grid gap-6 lg:grid-cols-2">
                    <ContributionChart contributionCounts={insights.contributionCounts} />
                    <ITPArchetypeBadge archetypeCounts={insights.archetypeCounts} />
                  </div>
                </>
              )}

              {insights.receivedSubmissions.length === 0 &&
                insights.selfSubmissions.length === 0 && (
                  <EmptyState
                    accent={insightsAccent}
                    title="no feedback has landed here yet"
                    description={
                      <>
                        {insights.employee.name} has not received peer notes or logged a self reflection in this range yet.
                        You can change that from{" "}
                        <Link href="/feedback" className="font-semibold text-ink underline decoration-brand-sky decoration-2 underline-offset-4">
                          the feedback form
                        </Link>
                        .
                      </>
                    }
                  />
                )}

              {insights.receivedSubmissions.length > 0 && (
                <FeedbackTimeline
                  submissions={insights.receivedSubmissions}
                  title="feedback received"
                  responsesByAnswer={responsesByAnswer}
                  employees={employees}
                  defaultResponderId={selectedEmployeeId}
                  onResponseSaved={handleResponseSaved}
                />
              )}

              <FeedbackGivenPanel
                givenFeedbackSummary={insights.givenFeedbackSummary}
                totalTeamSize={employees.length}
              />

              <SelfReflectionsPanel submissions={insights.selfSubmissions} />

              {selectedEmployeeBuild3Submissions.length > 0 && (
                <FeedbackTimeline
                  submissions={selectedEmployeeBuild3Submissions}
                  title="their notes about build3"
                  responsesByAnswer={responsesByAnswer}
                  employees={employees}
                  defaultResponderId={selectedEmployeeId}
                  onResponseSaved={handleResponseSaved}
                />
              )}
            </div>
          ) : (
            <EmptyState
              accent={insightsAccent}
              title="pick a teammate from the left"
              description="Or stay on the org view if you want the broad picture first."
            />
          )}
        </div>
      </main>
    </div>
  )
}
