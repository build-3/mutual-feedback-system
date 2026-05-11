"use client"

import Link from "next/link"
import dynamic from "next/dynamic"
import { Suspense, useCallback, useEffect, useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"
import Navbar from "@/components/Navbar"
import { SectionHeading, EmptyState } from "@/components/ui/brand"
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

const LoadingSkeleton = () => (
  <div className="animate-pulse rounded-2xl bg-line/30 h-64" />
)

const EmployeePicker = dynamic(
  () => import("@/components/insights/EmployeePicker"),
  { ssr: false }
)
const ProfileHeader = dynamic(
  () => import("@/components/insights/ProfileHeader"),
  { loading: LoadingSkeleton }
)
const ScoreCardRow = dynamic(
  () => import("@/components/insights/ScoreCardRow"),
  { loading: LoadingSkeleton }
)
const CompetencyRadar = dynamic(
  () => import("@/components/insights/CompetencyRadar"),
  { loading: LoadingSkeleton }
)
const ContributionChart = dynamic(
  () => import("@/components/insights/ContributionChart"),
  { loading: LoadingSkeleton }
)
const FeedbackGivenPanel = dynamic(
  () => import("@/components/insights/FeedbackGivenPanel"),
  { loading: LoadingSkeleton }
)
const FeedbackTimeline = dynamic(
  () => import("@/components/insights/FeedbackTimeline"),
  { loading: LoadingSkeleton }
)
const ITPArchetypeBadge = dynamic(
  () => import("@/components/insights/ITPArchetypeBadge"),
  { loading: LoadingSkeleton }
)
const OrgOverview = dynamic(
  () => import("@/components/insights/OrgOverview"),
  { loading: LoadingSkeleton }
)
const SelfReflectionsPanel = dynamic(
  () => import("@/components/insights/SelfReflectionsPanel"),
  { loading: LoadingSkeleton }
)

const insightsAccent = SCREEN_ACCENTS.insights

const DATE_RANGES = [
  { key: "month" as const, label: "month" },
  { key: "3months" as const, label: "3 months" },
  { key: "all" as const, label: "all time" },
]

export default function InsightsPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#fffaf5] flex items-center justify-center">
          <div className="animate-pulse text-muted text-sm">loading insights...</div>
        </div>
      }
    >
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
  const [responsesByAnswer, setResponsesByAnswer] = useState<
    Record<string, (FeedbackResponse & { responderName: string })[]>
  >({})
  const [currentUser, setCurrentUser] = useState<{ id: string; name: string } | null>(null)

  const buildResponsesByAnswer = useCallback(
    (employeeRows: Employee[], responseRows: FeedbackResponse[]) => {
      const empMap = new Map(employeeRows.map((e) => [e.id, e.name]))
      const grouped: Record<
        string,
        (FeedbackResponse & { responderName: string })[]
      > = {}

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
      const res = await fetch("/api/insights/data")
      const payload = await res.json().catch(() => ({}))

      if (!res.ok) {
        throw new Error(
          payload.error || "we could not load the latest insight data."
        )
      }

      const employeeRows = (payload.employees || []) as Employee[]
      const submissionRows = (payload.submissions || []) as FeedbackSubmission[]
      const answerRows = (payload.answers || []) as FeedbackAnswer[]
      const responseRows = (payload.responses || []) as FeedbackResponse[]

      const employeeMap = new Map(
        employeeRows.map((employee) => [employee.id, employee])
      )
      const answerMap = new Map<string, FeedbackAnswer[]>()

      for (const answer of answerRows) {
        if (!answerMap.has(answer.submission_id)) {
          answerMap.set(answer.submission_id, [])
        }
        answerMap.get(answer.submission_id)!.push(answer)
      }

      const enriched: SubmissionWithDetails[] = submissionRows.map(
        (submission) => ({
          submission,
          submitterName:
            employeeMap.get(submission.submitted_by_id)?.name || "Unknown",
          answers: answerMap.get(submission.id) || [],
        })
      )

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

  useEffect(() => {
    fetch("/api/me")
      .then((r) => r.json())
      .then((data) => {
        if (data?.employee?.id && data?.employee?.name) {
          setCurrentUser({ id: data.employee.id, name: data.employee.name })
        }
      })
      .catch(() => {})
  }, [])

  // Auto-select employee from URL param, or fall back to current user
  useEffect(() => {
    if (employees.length === 0) return
    const employeeParam = searchParams.get("employee")
    if (employeeParam) {
      const exists = employees.some((e) => e.id === employeeParam)
      if (exists) {
        setSelectedEmployeeId(employeeParam)
        setShowOrgOverview(false)
      }
      return
    }
    // No URL param — auto-select the logged-in user
    if (currentUser) {
      const exists = employees.some((e) => e.id === currentUser.id)
      if (exists) {
        setSelectedEmployeeId(currentUser.id)
        setShowOrgOverview(false)
      }
    }
  }, [searchParams, employees, currentUser])

  const filteredSubmissions = useMemo(
    () => filterSubmissionsByRange(allSubmissions, dateRange),
    [allSubmissions, dateRange]
  )

  const insights = useEmployeeInsights(
    selectedEmployeeId,
    employees,
    filteredSubmissions
  )

  const orgMetrics = useOrgInsights(employees, filteredSubmissions)

  const build3Submissions = useMemo(
    () =>
      filteredSubmissions.filter(
        (s) => s.submission.feedback_type === "build3"
      ),
    [filteredSubmissions]
  )

  const selectedEmployeeBuild3Submissions = useMemo(
    () =>
      build3Submissions.filter(
        (s) => s.submission.submitted_by_id === selectedEmployeeId
      ),
    [build3Submissions, selectedEmployeeId]
  )

  if (loading) {
    return (
      <div className="min-h-screen bg-[#fffaf5] flex items-center justify-center">
        <div className="animate-pulse text-muted text-sm">
          pulling together the latest team signal...
        </div>
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="min-h-screen bg-[#fffaf5] px-4 py-10 sm:px-6">
        <div className="mx-auto max-w-5xl">
          <EmptyState
            accent={insightsAccent}
            title="we hit a snag loading insights"
            description={loadError}
          />
        </div>
      </div>
    )
  }

  const hasDetailedData =
    Object.keys(insights.metrics).length > 0 ||
    Object.keys(insights.contributionCounts).length > 0 ||
    Object.keys(insights.archetypeCounts).length > 0

  return (
    <div className="min-h-screen bg-[#fffaf5]">
      <Navbar />

      {/* Header */}
      <div className="mx-auto max-w-5xl px-3 pt-3 sm:pt-8 sm:px-6">

        <SectionHeading
          accent="sky"
          eyebrow="insights"
          title="clear signal"
          description={`${employees.length} teammates, ${filteredSubmissions.length} submissions in ${DATE_RANGE_LABELS[dateRange]}.`}
        />

        {/* Controls bar — stacks cleanly on mobile */}
        <div className="mt-5 sm:mt-6 space-y-3 sm:space-y-0 sm:flex sm:flex-wrap sm:items-center sm:gap-3 border-b border-line pb-4">
          {/* Row 1 on mobile: org toggle + date pills */}
          <div className="flex items-center justify-between gap-2 sm:contents">
            <button
              type="button"
              onClick={() => {
                setShowOrgOverview(true)
                setSelectedEmployeeId(null)
              }}
              className={`flex min-h-[40px] items-center rounded-full border px-4 py-2 text-sm font-semibold transition-all ${
                showOrgOverview
                  ? "border-ink bg-ink text-white"
                  : "border-line bg-white text-muted hover:border-ink/20"
              }`}
            >
              org overview
            </button>

            <div className="hidden sm:block h-5 w-px bg-line" />

            {/* Date range pills */}
            <div className="sm:ml-auto flex gap-0.5 sm:gap-1 rounded-full border border-line bg-white p-1">
              {DATE_RANGES.map((range) => (
                <button
                  key={range.key}
                  type="button"
                  onClick={() => setDateRange(range.key)}
                  className={`flex min-h-[36px] items-center rounded-full px-3 py-1.5 text-xs font-semibold tracking-[0.06em] transition-all ${
                    dateRange === range.key
                      ? "bg-ink text-white"
                      : "text-muted hover:text-ink"
                  }`}
                >
                  {range.label}
                </button>
              ))}
            </div>
          </div>

          {/* Row 2 on mobile: employee picker (full width) */}
          <div className="sm:contents">
            <EmployeePicker
              employees={employees}
              selectedId={showOrgOverview ? null : selectedEmployeeId}
              onSelect={(id) => {
                setSelectedEmployeeId(id)
                setShowOrgOverview(false)
              }}
              employeesWithFeedback={orgMetrics.employeeIdsWithFeedback}
            />
          </div>
        </div>
      </div>

      {/* Content — pb-20 on mobile for bottom tab bar clearance */}
      <div className="mx-auto max-w-5xl px-3 py-3 pb-20 sm:px-6 sm:py-5 sm:pb-5">
        {showOrgOverview ? (
          <OrgOverview
            orgMetrics={orgMetrics}
            build3Submissions={build3Submissions}
            employees={employees}
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

            <ScoreCardRow
              metrics={insights.metrics}
              orgAvgMetrics={orgMetrics.avgMetricsMap}
            />

            {hasDetailedData && (
              <>
                <div className="grid gap-3 sm:gap-4 lg:grid-cols-2">
                  <CompetencyRadar
                    metrics={insights.metrics}
                    orgAvgMetrics={orgMetrics.avgMetricsMap}
                  />
                  <ContributionChart
                    contributionCounts={insights.contributionCounts}
                  />
                </div>

                <ITPArchetypeBadge
                  archetypeCounts={insights.archetypeCounts}
                />
              </>
            )}

            {insights.receivedSubmissions.length === 0 &&
              insights.selfSubmissions.length === 0 && (
                <EmptyState
                  accent={insightsAccent}
                  title="no feedback has landed here yet"
                  description={
                    <>
                      {insights.employee.name} has not received peer notes or
                      logged a self reflection in this range yet. You can change
                      that from{" "}
                      <Link
                        href="/feedback"
                        className="font-semibold text-ink underline decoration-brand-sky decoration-2 underline-offset-4"
                      >
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
                currentUser={currentUser}
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
                currentUser={currentUser}
                onResponseSaved={handleResponseSaved}
              />
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
    </div>
  )
}
