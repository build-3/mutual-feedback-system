import "server-only"

import { getSupabaseAdmin } from "@/lib/server/supabase-admin"
import { parseNumericAnswer, contributionKeyToLabel, selectedValueTitles, NUMERIC_KEYS, VALUES_WITH_TEXT_KEYS, formatValuesWithText } from "@/lib/insights-helpers"
import { BUILD3_VALUES } from "@/lib/questions"

const PAGE_SIZE = 1000

async function fetchAll<T>(
  table: string,
  columns: string,
  orderBy = "id"
): Promise<{ data: T[]; error: unknown }> {
  const supabaseAdmin = getSupabaseAdmin()
  const allRows: T[] = []
  let offset = 0

  while (true) {
    const { data, error } = await supabaseAdmin
      .from(table)
      .select(columns)
      .order(orderBy, { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1)

    if (error) return { data: [], error }
    if (!data || data.length === 0) break

    allRows.push(...(data as T[]))
    if (data.length < PAGE_SIZE) break
    offset += PAGE_SIZE
  }

  return { data: allRows, error: null }
}

export async function fetchDashboardData() {
  const [employeeResult, submissionResult, answerResult, responseResult] =
    await Promise.all([
      fetchAll("employees", "id, name, role, email, birthday, is_active, created_at", "name"),
      fetchAll("feedback_submissions", "id, submitted_by_id, feedback_for_id, feedback_type, notified_at, created_at"),
      fetchAll("feedback_answers", "id, submission_id, question_key, question_text, answer_value, created_at"),
      fetchAll("feedback_responses", "id, answer_id, responder_id, response_text, created_at"),
    ])

  const firstError =
    employeeResult.error || submissionResult.error || answerResult.error || responseResult.error

  if (firstError) return { error: firstError }

  const submissions = (submissionResult.data || []) as { created_at: string }[]
  submissions.sort((a, b) => b.created_at.localeCompare(a.created_at))

  return {
    data: {
      employees: employeeResult.data || [],
      submissions,
      answers: answerResult.data || [],
      responses: responseResult.data || [],
    },
  }
}

type EmployeeRow = { id: string; name: string; role: string; email: string | null; birthday: string | null; is_active: boolean; created_at: string }
type SubmissionRow = { id: string; submitted_by_id: string; feedback_for_id: string | null; feedback_type: string; notified_at: string | null; created_at: string }
type AnswerRow = { id: string; submission_id: string; question_key: string; question_text: string; answer_value: string; created_at: string }
type ResponseRow = { id: string; answer_id: string; responder_id: string; response_text: string; created_at: string }

type EnrichedSubmission = {
  id: string
  submitted_by_id: string
  feedback_for_id: string | null
  feedback_type: string
  created_at: string
  submitterName: string
  answers: {
    id: string
    question_key: string
    question_text: string
    answer_value: string
  }[]
}

type NumericMetric = { key: string; values: number[]; avg: number; count: number }

type EmployeeMetrics = {
  employeeId: string
  employeeName: string
  receivedSubmissions: EnrichedSubmission[]
  givenSubmissions: EnrichedSubmission[]
  selfSubmissions: EnrichedSubmission[]
  metrics: Record<string, NumericMetric>
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
  recentActivity: EnrichedSubmission[]
  tealAvg: { selfManagement: number | null; wholeness: number | null; purpose: number | null }
  npsBreakdown: { promoters: number; passives: number; detractors: number; npsScore: number | null; promoterNames: string[]; passiveNames: string[]; detractorNames: string[] }
  scoreDistributions: Record<string, number[]>
  avgMetricsMap: Record<string, number>
  participationByEmployee: Record<string, number>
  employeeIdsWithFeedback: string[]
  valueStrengthCounts: Record<string, number>
  valueImprovementCounts: Record<string, number>
}

function avg(arr: number[]): number | null {
  if (arr.length === 0) return null
  return arr.reduce((a, b) => a + b, 0) / arr.length
}

export async function buildInsightsPayload() {
  const result = await fetchDashboardData()
  if (result.error || !result.data) return { error: result.error }

  const { employees, submissions, answers, responses } = result.data as {
    employees: EmployeeRow[]
    submissions: SubmissionRow[]
    answers: AnswerRow[]
    responses: ResponseRow[]
  }

  const empMap = new Map(employees.map(e => [e.id, e]))
  const empNameById = new Map(employees.map(e => [e.id, e.name]))
  const nameCounts: Record<string, number> = {}
  for (const e of employees) {
    const n = e.name.trim().toLowerCase()
    nameCounts[n] = (nameCounts[n] || 0) + 1
  }

  const answerMap = new Map<string, AnswerRow[]>()
  for (const a of answers) {
    const list = answerMap.get(a.submission_id) || []
    list.push(a)
    answerMap.set(a.submission_id, list)
  }

  const responseMap = new Map<string, (ResponseRow & { responderName: string })[]>()
  for (const r of responses) {
    const list = responseMap.get(r.answer_id) || []
    list.push({ ...r, responderName: empNameById.get(r.responder_id) || "Unknown" })
    responseMap.set(r.answer_id, list)
  }

  const enriched: EnrichedSubmission[] = submissions.map(s => ({
    id: s.id,
    submitted_by_id: s.submitted_by_id,
    feedback_for_id: s.feedback_for_id,
    feedback_type: s.feedback_type,
    created_at: s.created_at,
    submitterName: empNameById.get(s.submitted_by_id) || "Unknown",
    answers: (answerMap.get(s.id) || []).map(a => ({
      id: a.id,
      question_key: a.question_key,
      question_text: a.question_text,
      answer_value: a.answer_value,
    })),
  }))

  // --- ORG METRICS (single pass) ---
  let totalInterns = 0, totalFullTimers = 0
  for (const e of employees) {
    if (e.role === "intern") totalInterns++
    if (e.role === "full_timer") totalFullTimers++
  }

  const orgTrustScores: number[] = [], orgPurposeScores: number[] = [], npsScores: number[] = []
  const npsPromoterNames: string[] = [], npsPassiveNames: string[] = [], npsDetractorNames: string[] = []
  const peerTrustScores: number[] = [], peerPurposeScores: number[] = [], recommendScores: number[] = []
  const tealSM: number[] = [], tealW: number[] = [], tealEP: number[] = []
  const contributionDist: Record<string, number> = {}, archetypeDist: Record<string, number> = {}
  const feedbackByType: Record<string, number> = {}, scoreDistributions: Record<string, number[]> = {}
  const participationByEmployee: Record<string, number> = {}
  const valueStrengthCounts: Record<string, number> = {}, valueImprovementCounts: Record<string, number> = {}
  const build3Submitters = new Set<string>()
  const employeeIdsWithFeedback = new Set<string>()

  for (const sub of enriched) {
    if (sub.answers.length === 0) continue
    const type = sub.feedback_type
    feedbackByType[type] = (feedbackByType[type] || 0) + 1

    if (sub.feedback_for_id) {
      employeeIdsWithFeedback.add(sub.feedback_for_id)
      participationByEmployee[sub.feedback_for_id] = (participationByEmployee[sub.feedback_for_id] || 0) + 1
    }
    if (type === "self" || type === "build3") employeeIdsWithFeedback.add(sub.submitted_by_id)
    if (type === "build3") build3Submitters.add(sub.submitted_by_id)

    const isBuild3 = type === "build3"
    const isPeer = type !== "self" && type !== "build3" && sub.feedback_for_id != null

    for (const ans of sub.answers) {
      const num = parseNumericAnswer(ans.answer_value)
      if (num !== null && isPeer) {
        const arr = scoreDistributions[ans.question_key] || []
        arr.push(num)
        scoreDistributions[ans.question_key] = arr
      }
      switch (ans.question_key) {
        case "trust_battery":
          if (num !== null && isBuild3) orgTrustScores.push(num)
          if (num !== null && isPeer) peerTrustScores.push(num)
          break
        case "purpose_alignment":
          if (num !== null && isBuild3) orgPurposeScores.push(num)
          if (num !== null && isPeer) peerPurposeScores.push(num)
          break
        case "recommend_rating":
          if (num !== null && isPeer) recommendScores.push(num)
          break
        case "nps_score":
          if (num !== null && isBuild3) {
            npsScores.push(num)
            const rn = sub.submitterName
            if (num >= 9) npsPromoterNames.push(rn)
            else if (num >= 7) npsPassiveNames.push(rn)
            else npsDetractorNames.push(rn)
          }
          break
        case "teal_self_management": if (num !== null && isPeer) tealSM.push(num); break
        case "teal_wholeness": if (num !== null && isPeer) tealW.push(num); break
        case "teal_evolutionary_purpose": if (num !== null && isPeer) tealEP.push(num); break
        case "contribution_level":
          if (isPeer) {
            const label = contributionKeyToLabel(ans.answer_value)
            contributionDist[label] = (contributionDist[label] || 0) + 1
          }
          break
        case "ideal_team_player_type":
          if (isPeer) archetypeDist[ans.answer_value] = (archetypeDist[ans.answer_value] || 0) + 1
          break
        case "value_strength":
          for (const title of selectedValueTitles(ans.answer_value, BUILD3_VALUES))
            valueStrengthCounts[title] = (valueStrengthCounts[title] || 0) + 1
          break
        case "value_improvement":
          for (const title of selectedValueTitles(ans.answer_value, BUILD3_VALUES))
            valueImprovementCounts[title] = (valueImprovementCounts[title] || 0) + 1
          break
      }
    }
  }

  const npsTotal = npsScores.length
  let promoters = 0, passives = 0, detractors = 0
  for (const s of npsScores) { if (s >= 9) promoters++; else if (s >= 7) passives++; else detractors++ }
  const npsScore = npsTotal > 0 ? Math.round(((promoters - detractors) / npsTotal) * 100) : null

  const avgMetricsMap: Record<string, number> = {}
  for (const [k, arr] of [["trust_battery", peerTrustScores], ["purpose_alignment", peerPurposeScores], ["recommend_rating", recommendScores], ["teal_self_management", tealSM], ["teal_wholeness", tealW], ["teal_evolutionary_purpose", tealEP]] as [string, number[]][]) { const a = avg(arr); if (a !== null) avgMetricsMap[k] = a }
  for (const [k, arr] of Object.entries(scoreDistributions)) { if (!(k in avgMetricsMap) && arr.length > 0) avgMetricsMap[k] = arr.reduce((a, b) => a + b, 0) / arr.length }

  const nonGhost = enriched.filter(s => s.answers.length > 0)
  const build3Count = build3Submitters.size

  const orgMetrics: OrgMetrics = {
    totalEmployees: employees.length, totalSubmissions: nonGhost.length, totalInterns, totalFullTimers,
    avgTrustBattery: avg(orgTrustScores), avgPurposeAlignment: avg(orgPurposeScores), avgRecommendRating: avg(recommendScores), avgNps: avg(npsScores),
    contributionDistribution: contributionDist, archetypeDistribution: archetypeDist, feedbackByType,
    employeesWithFeedback: build3Count, employeesWithoutFeedback: employees.length - build3Count,
    recentActivity: [...nonGhost].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 10),
    tealAvg: { selfManagement: avg(tealSM), wholeness: avg(tealW), purpose: avg(tealEP) },
    npsBreakdown: { promoters, passives, detractors, npsScore, promoterNames: npsPromoterNames, passiveNames: npsPassiveNames, detractorNames: npsDetractorNames },
    scoreDistributions, avgMetricsMap, participationByEmployee,
    employeeIdsWithFeedback: Array.from(employeeIdsWithFeedback),
    valueStrengthCounts, valueImprovementCounts,
  }

  // --- PER-EMPLOYEE METRICS (single pass) ---
  const employeeMetricsMap = new Map<string, EmployeeMetrics>()
  for (const e of employees) {
    employeeMetricsMap.set(e.id, {
      employeeId: e.id, employeeName: e.name,
      receivedSubmissions: [], givenSubmissions: [], selfSubmissions: [],
      metrics: {}, contributionCounts: {}, contributionRaters: {}, archetypeCounts: {},
      lastFeedbackDate: null, givenFeedbackSummary: [], scoreTimeline: {}, textFeedbackGrouped: {},
    })
  }

  for (const sub of enriched) {
    const sid = sub.submitted_by_id
    if (employeeMetricsMap.has(sid)) {
      if (sub.feedback_type === "self" && sub.answers.length > 0) {
        employeeMetricsMap.get(sid)!.selfSubmissions.push(sub)
        const cur = employeeMetricsMap.get(sid)!
        if (!cur.lastFeedbackDate || sub.created_at > cur.lastFeedbackDate) cur.lastFeedbackDate = sub.created_at
      }
    }
  }

  for (const sub of enriched) {
    const fid = sub.feedback_for_id
    const sid = sub.submitted_by_id
    const hasAnswers = sub.answers.length > 0

    if (fid && employeeMetricsMap.has(fid) && sub.feedback_type !== "self" && hasAnswers) {
      const e = employeeMetricsMap.get(fid)!
      e.receivedSubmissions.push(sub)
      if (!e.lastFeedbackDate || sub.created_at > e.lastFeedbackDate) e.lastFeedbackDate = sub.created_at
    }

    if (sid && employeeMetricsMap.has(sid) && hasAnswers && sub.feedback_type !== "self" && sub.feedback_type !== "build3") {
      const e = employeeMetricsMap.get(sid)!
      e.givenSubmissions.push(sub)
    }
  }

  employeeMetricsMap.forEach((metrics, empId) => {
    for (const sub of metrics.receivedSubmissions) {
      const sd = sub.created_at
      for (const ans of sub.answers) {
        if (NUMERIC_KEYS.has(ans.question_key)) {
          const num = parseNumericAnswer(ans.answer_value)
          if (num !== null) {
            if (!metrics.metrics[ans.question_key]) metrics.metrics[ans.question_key] = { key: ans.question_key, values: [], avg: 0, count: 0 }
            metrics.metrics[ans.question_key].values.push(num)
            if (!metrics.scoreTimeline[ans.question_key]) metrics.scoreTimeline[ans.question_key] = []
            metrics.scoreTimeline[ans.question_key].push({ date: sd, value: num })
          }
        }
        if (ans.question_key === "contribution_level") {
          const label = contributionKeyToLabel(ans.answer_value)
          metrics.contributionCounts[label] = (metrics.contributionCounts[label] || 0) + 1
          if (!metrics.contributionRaters[label]) metrics.contributionRaters[label] = []
          metrics.contributionRaters[label].push(sub.submitterName)
        }
        if (ans.question_key === "ideal_team_player_type") {
          metrics.archetypeCounts[ans.answer_value] = (metrics.archetypeCounts[ans.answer_value] || 0) + 1
        }
        const isStructured = NUMERIC_KEYS.has(ans.question_key) || ans.question_key === "contribution_level" || ans.question_key === "ideal_team_player_type"
        if (!isStructured && ans.answer_value && typeof ans.answer_value === "string" && ans.answer_value.trim()) {
          const num = parseNumericAnswer(ans.answer_value)
          if (num === null) {
            if (!metrics.textFeedbackGrouped[ans.question_key]) metrics.textFeedbackGrouped[ans.question_key] = []
            const display = VALUES_WITH_TEXT_KEYS.has(ans.question_key)
              ? formatValuesWithText(ans.answer_value, BUILD3_VALUES)
              : ans.answer_value
            metrics.textFeedbackGrouped[ans.question_key].push(display)
          }
        }
      }
    }
    for (const entry of Object.entries(metrics.metrics) as [string, NumericMetric][]) {
      const m = entry[1]
      m.avg = m.values.length > 0 ? m.values.reduce((a: number, b: number) => a + b, 0) / m.values.length : 0
      m.count = m.values.length
    }
    for (const [key, entries] of Object.entries(metrics.scoreTimeline) as [string, { date: string; value: number }[]][]) {
      metrics.scoreTimeline[key] = entries.sort((a, b) => a.date.localeCompare(b.date))
    }
    metrics.givenFeedbackSummary = metrics.givenSubmissions.map(s => {
      const rid = s.feedback_for_id
      const rname = rid ? (empNameById.get(rid) || "Unknown") : "Unknown"
      const n = rname.trim().toLowerCase()
      return {
        employeeId: rid,
        employeeName: nameCounts[n] > 1 && rid ? `${rname} · ${rid.slice(0, 4)}` : rname,
        date: s.created_at,
        submissionId: s.id,
      }
    })
  })

  const employeeMetrics: Record<string, EmployeeMetrics> = {}
  employeeMetricsMap.forEach((m, id) => { employeeMetrics[id] = m })

  return {
    data: {
      employees,
      submissions: enriched,
      responsesByAnswer: Object.fromEntries(responseMap),
      orgMetrics,
      employeeMetrics,
    },
  }
}
