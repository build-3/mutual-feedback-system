import "server-only"

import { getSupabaseAdmin } from "./supabase-admin"
import { sendDirectMessage, isNotificationsEnabled, isGoogleChatConfigured } from "./google-chat"
import type { ContributionLevel } from "@/lib/types"

export function addMonthsToDate(date: Date, months: number): Date {
  const result = new Date(date)
  const day = result.getDate()
  result.setMonth(result.getMonth() + months)
  if (result.getDate() !== day) {
    result.setDate(0)
  }
  return result
}

function formatDateISO(date: Date): string {
  return date.toISOString().split("T")[0]
}

function formatDateDisplay(dateStr: string): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}

export async function createProbation(
  employeeId: string
): Promise<{ id: string; start_date: string; end_date: string } | null> {
  const supabaseAdmin = getSupabaseAdmin()
  const startDate = new Date()
  const endDate = addMonthsToDate(startDate, 3)

  const { data, error } = await supabaseAdmin
    .from("probation_tracking")
    .insert({
      employee_id: employeeId,
      start_date: formatDateISO(startDate),
      duration_months: 3,
      end_date: formatDateISO(endDate),
    })
    .select("id, start_date, end_date")
    .single()

  if (error || !data) {
    console.error("[probation] createProbation failed:", error)
    return null
  }

  return data
}

export async function notifyReviewerGroup(
  internName: string,
  startDate: string,
  endDate: string
): Promise<void> {
  if (!isGoogleChatConfigured()) return
  const enabled = await isNotificationsEnabled()
  if (!enabled) return

  const supabaseAdmin = getSupabaseAdmin()
  const { data: reviewers } = await supabaseAdmin
    .from("probation_reviewers" as never)
    .select("email") as { data: { email: string }[] | null }

  if (!reviewers || reviewers.length === 0) return

  const message =
    `Hey, a new joinee has joined.\n` +
    `Name: ${internName}\n` +
    `Probation start date: ${formatDateDisplay(startDate)}\n` +
    `Probation end date: ${formatDateDisplay(endDate)}\n` +
    `Head to the website to review or change the probation details.`

  for (const reviewer of reviewers) {
    try {
      await sendDirectMessage(reviewer.email, message)
    } catch (err) {
      console.error(`[probation] Failed to notify ${reviewer.email}:`, err)
    }
  }
}

export async function updateProbationDuration(
  probationId: string,
  months: 3 | 6
): Promise<{ end_date: string } | { error: string; httpStatus: number }> {
  const supabaseAdmin = getSupabaseAdmin()

  const { data: record, error: fetchError } = await supabaseAdmin
    .from("probation_tracking")
    .select("id, start_date, status")
    .eq("id", probationId)
    .single()

  if (fetchError || !record) {
    return { error: "Probation record not found.", httpStatus: 404 }
  }

  if (record.status === "promoted") {
    return { error: "Cannot change duration of a completed probation.", httpStatus: 400 }
  }

  if (record.status === "extended") {
    return { error: "Cannot change duration of an extended probation.", httpStatus: 400 }
  }

  const startDate = new Date(record.start_date + "T00:00:00")
  const newEndDate = addMonthsToDate(startDate, months)
  const now = new Date().toISOString()

  const { error, count } = await supabaseAdmin
    .from("probation_tracking")
    .update({
      duration_months: months,
      end_date: formatDateISO(newEndDate),
      updated_at: now,
    }, { count: "exact" })
    .eq("id", probationId)
    .eq("status", record.status)

  if (error) {
    console.error("[probation] updateDuration failed:", error)
    return { error: "Failed to update duration.", httpStatus: 500 }
  }

  if (count === 0) {
    // Concurrent state change (extended/promoted) raced us — no rows updated.
    return { error: "Probation status changed concurrently. Refresh and retry.", httpStatus: 409 }
  }

  return { end_date: formatDateISO(newEndDate) }
}

export async function submitProbationReview(
  probationId: string,
  reviewerId: string,
  contributionLevel: ContributionLevel,
  backingScore: number
): Promise<{ error?: string; httpStatus?: number }> {
  const supabaseAdmin = getSupabaseAdmin()

  const { data: record } = await supabaseAdmin
    .from("probation_tracking")
    .select("id, status")
    .eq("id", probationId)
    .single()

  if (!record) {
    return { error: "Probation record not found.", httpStatus: 404 }
  }

  if (record.status === "promoted") {
    return { error: "Cannot review a completed probation.", httpStatus: 400 }
  }

  const { error } = await supabaseAdmin
    .from("probation_reviews")
    .upsert(
      {
        probation_id: probationId,
        reviewer_id: reviewerId,
        contribution_level: contributionLevel,
        backing_score: backingScore,
      },
      { onConflict: "probation_id,reviewer_id" }
    )

  if (error) {
    console.error("[probation] submitReview failed:", error)
    return { error: "Failed to submit review.", httpStatus: 500 }
  }

  return {}
}

export function computeSignal(
  reviews: { backing_score: number }[]
): string | null {
  if (reviews.length === 0) return null
  const hasHighSignal = reviews.some((r) => r.backing_score > 3)
  return hasHighSignal ? "High Signal" : "Needs Team Review"
}

export async function promoteToFullTime(
  probationId: string
): Promise<{ error?: string; httpStatus?: number }> {
  const supabaseAdmin = getSupabaseAdmin()

  const { data: record, error: fetchError } = await supabaseAdmin
    .from("probation_tracking")
    .select("id, employee_id, status")
    .eq("id", probationId)
    .single()

  if (fetchError || !record) {
    return { error: "Probation record not found.", httpStatus: 404 }
  }

  if (record.status !== "active" && record.status !== "extended") {
    return { error: "Can only promote active or extended probations.", httpStatus: 400 }
  }

  const now = new Date().toISOString()

  const { error: probError, count } = await supabaseAdmin
    .from("probation_tracking")
    .update(
      { status: "promoted", promoted_at: now, updated_at: now },
      { count: "exact" }
    )
    .eq("id", probationId)
    .eq("status", record.status)

  if (probError) {
    console.error("[probation] promote failed:", probError)
    return { error: "Failed to promote.", httpStatus: 500 }
  }
  if (count === 0) {
    return { error: "Status changed by another action. Refresh and retry.", httpStatus: 409 }
  }

  const { error: empError } = await supabaseAdmin
    .from("employees")
    .update({ role: "full_timer" })
    .eq("id", record.employee_id)

  if (empError) {
    console.error("[probation] role update failed, reverting:", empError)
    await supabaseAdmin
      .from("probation_tracking")
      .update({ status: record.status, promoted_at: null, updated_at: now })
      .eq("id", probationId)
    return { error: "Role update failed — probation status reverted. Try again.", httpStatus: 500 }
  }

  return {}
}

export async function extendProbation(
  probationId: string
): Promise<{ new_end_date?: string; error?: string; httpStatus?: number }> {
  const supabaseAdmin = getSupabaseAdmin()

  const { data: record, error: fetchError } = await supabaseAdmin
    .from("probation_tracking")
    .select("id, employee_id, start_date, status")
    .eq("id", probationId)
    .single()

  if (fetchError || !record) {
    return { error: "Probation record not found.", httpStatus: 404 }
  }

  if (record.status !== "active") {
    return { error: "Can only extend active probations.", httpStatus: 400 }
  }

  const startDate = new Date(record.start_date + "T00:00:00")
  const newEndDate = addMonthsToDate(startDate, 6)
  const now = new Date().toISOString()

  const { error, count } = await supabaseAdmin
    .from("probation_tracking")
    .update(
      {
        status: "extended",
        duration_months: 6,
        end_date: formatDateISO(newEndDate),
        extended_at: now,
        updated_at: now,
      },
      { count: "exact" }
    )
    .eq("id", probationId)
    .eq("status", "active")

  if (error) {
    console.error("[probation] extend failed:", error)
    return { error: "Failed to extend probation.", httpStatus: 500 }
  }
  if (count === 0) {
    return { error: "Status changed by another action. Refresh and retry.", httpStatus: 409 }
  }

  // Notify the intern
  const { data: emp } = await supabaseAdmin
    .from("employees")
    .select("email")
    .eq("id", record.employee_id)
    .single()

  if (emp?.email && isGoogleChatConfigured()) {
    const enabled = await isNotificationsEnabled()
    if (enabled) {
      sendDirectMessage(
        emp.email,
        "Hey, your probation has been extended."
      ).catch((err) => console.error("[probation] extend notification failed:", err))
    }
  }

  return { new_end_date: formatDateISO(newEndDate) }
}

export type FeedbackEntry = {
  submission_id: string
  submitted_by_name: string
  feedback_date: string
  contribution_level: string | null
  recommend_rating: number | null
  answers: { question_key: string; question_text: string; answer_value: string }[]
}

export type ProbationOverviewItem = {
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
  reviews: {
    id: string
    reviewer_id: string
    reviewer_name: string
    contribution_level: string
    backing_score: number
    created_at: string
  }[]
  feedback_history: FeedbackEntry[]
}

export async function getProbationOverview(): Promise<{
  probations: ProbationOverviewItem[]
  totalActive: number
}> {
  const supabaseAdmin = getSupabaseAdmin()

  const { data: records, error } = await supabaseAdmin
    .from("probation_tracking")
    .select("*")
    .order("end_date", { ascending: true })

  if (error || !records) {
    console.error("[probation] getProbationOverview failed:", error)
    return { probations: [], totalActive: 0 }
  }

  const employeeIds = Array.from(new Set(records.map((r) => r.employee_id)))
  const probationIds = records.map((r) => r.id)

  if (employeeIds.length === 0) {
    return { probations: [], totalActive: 0 }
  }

  // Wave 1: three independent queries in parallel
  const [empsResult, reviewsResult, submissionsResult] = await Promise.all([
    supabaseAdmin.from("employees").select("id, name, email").in("id", employeeIds),
    probationIds.length > 0
      ? supabaseAdmin.from("probation_reviews").select("*").in("probation_id", probationIds)
      : Promise.resolve({ data: [] as never[] }),
    supabaseAdmin
      .from("feedback_submissions")
      .select("id, submitted_by_id, feedback_for_id, feedback_type, created_at")
      .eq("feedback_type", "intern")
      .in("feedback_for_id", employeeIds)
      .order("created_at", { ascending: false }),
  ])

  const emps = empsResult.data ?? []
  const empMap = new Map(emps.map((e) => [e.id, e]))
  const allReviews = reviewsResult.data ?? []
  const submissions = submissionsResult.data ?? []

  const submissionIds = submissions.map((s) => s.id)
  const submitterIds = Array.from(new Set(submissions.map((s) => s.submitted_by_id)))
  const reviewerIds = Array.from(new Set(allReviews.map((r) => r.reviewer_id)))

  // Wave 2: answers + name lookup in parallel
  const allNameIds = Array.from(new Set([...submitterIds, ...reviewerIds]))
  const [answersResult, nameEmpsResult] = await Promise.all([
    submissionIds.length > 0
      ? supabaseAdmin
          .from("feedback_answers")
          .select("id, submission_id, question_key, question_text, answer_value")
          .in("submission_id", submissionIds)
      : Promise.resolve({ data: [] as never[] }),
    allNameIds.length > 0
      ? supabaseAdmin.from("employees").select("id, name").in("id", allNameIds)
      : Promise.resolve({ data: [] as never[] }),
  ])

  const allAnswers = answersResult.data ?? []
  const nameMap = new Map((nameEmpsResult.data ?? []).map((e: { id: string; name: string }) => [e.id, e.name]))

  // Group answers by submission
  const answersBySubmission = new Map<string, typeof allAnswers>()
  for (const a of allAnswers) {
    const group = answersBySubmission.get(a.submission_id) ?? []
    group.push(a)
    answersBySubmission.set(a.submission_id, group)
  }

  // Group reviews by probation
  const reviewsByProbation = new Map<string, typeof allReviews>()
  for (const review of allReviews) {
    const group = reviewsByProbation.get(review.probation_id) ?? []
    group.push(review)
    reviewsByProbation.set(review.probation_id, group)
  }

  let totalActive = 0

  const probations: ProbationOverviewItem[] = records.map((r) => {
    const emp = empMap.get(r.employee_id)
    const reviews = reviewsByProbation.get(r.id) ?? []
    if (r.status === "active" || r.status === "extended") totalActive++

    // Filter feedback submissions within probation period.
    // - Lower bound: probation start_date
    // - Upper bound: now (active/extended) OR promoted_at (promoted)
    //   so a promoted person's later full-time feedback doesn't leak into
    //   their old probation card.
    const startMs = new Date(r.start_date + "T00:00:00Z").getTime()
    const endMs = r.status === "promoted" && r.promoted_at
      ? new Date(r.promoted_at).getTime()
      : Number.POSITIVE_INFINITY
    const internSubmissions = (submissions ?? []).filter((s) => {
      if (s.feedback_for_id !== r.employee_id) return false
      const ms = new Date(s.created_at).getTime()
      return ms >= startMs && ms <= endMs
    })

    // History is newest-first; full answers only for the newest 10 (UI cap)
    const recentIds = new Set(internSubmissions.slice(0, 10).map((s) => s.id))
    const feedbackHistory: FeedbackEntry[] = internSubmissions.map((s) => {
      const answers = answersBySubmission.get(s.id) ?? []
      const contribAnswer = answers.find((a) => a.question_key === "contribution_level")
      const ratingAnswer = answers.find((a) => a.question_key === "recommend_rating")

      return {
        submission_id: s.id,
        submitted_by_name: nameMap.get(s.submitted_by_id) ?? "Unknown",
        feedback_date: s.created_at,
        contribution_level: contribAnswer?.answer_value ?? null,
        recommend_rating: ratingAnswer ? Number(ratingAnswer.answer_value) || null : null,
        answers: recentIds.has(s.id)
          ? answers.map((a) => ({
              question_key: a.question_key,
              question_text: a.question_text,
              answer_value: a.answer_value,
            }))
          : [],
      }
    })

    // Aggregate stats
    const ratings = feedbackHistory
      .map((f) => f.recommend_rating)
      .filter((v): v is number => v !== null && !isNaN(v))
    const avgRating = ratings.length > 0
      ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10
      : null

    const contribCounts: Record<string, number> = {}
    for (const f of feedbackHistory) {
      const val = f.contribution_level ?? ""
      if (val.length > 0) {
        contribCounts[val] = (contribCounts[val] ?? 0) + 1
      }
    }
    const mostCommon = Object.keys(contribCounts).length === 0
      ? null
      : Object.entries(contribCounts).sort((a, b) => b[1] - a[1])[0][0]

    // Signal: combine probation reviews AND feedback history ratings
    let signal: string | null
    if (r.status === "promoted") {
      signal = "Promoted to Full-Time"
    } else if (r.status === "extended") {
      const extSignal = avgRating !== null ? (avgRating > 3 ? "High Signal" : "Needs Team Review") : null
      signal = extSignal ? `Extended / ${extSignal}` : "Extended"
    } else {
      // Use feedback history ratings as primary signal, fall back to probation reviews
      if (avgRating !== null) {
        signal = avgRating > 3 ? "High Signal" : "Needs Team Review"
      } else {
        signal = computeSignal(reviews)
      }
    }

    return {
      id: r.id,
      employee_id: r.employee_id,
      employee_name: emp?.name ?? "Unknown",
      employee_email: emp?.email ?? null,
      start_date: r.start_date,
      end_date: r.end_date,
      duration_months: r.duration_months,
      status: r.status,
      extended_at: r.extended_at,
      promoted_at: r.promoted_at,
      signal,
      total_feedback_count: feedbackHistory.length,
      avg_recommend_rating: avgRating,
      contribution_summary: {
        counts: contribCounts,
        most_common: mostCommon,
      },
      reviews: reviews.map((rev) => ({
        id: rev.id,
        reviewer_id: rev.reviewer_id,
        reviewer_name: nameMap.get(rev.reviewer_id) ?? "Unknown",
        contribution_level: rev.contribution_level,
        backing_score: rev.backing_score,
        created_at: rev.created_at,
      })),
      feedback_history: feedbackHistory,
    }
  })

  return { probations, totalActive }
}
