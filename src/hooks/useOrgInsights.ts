'use client'

import { useMemo } from 'react'
import { Employee } from '@/lib/types'
import { SubmissionWithDetails } from '@/app/insights/types'
import { parseNumericAnswer, BUILD3_VALUE_KEYWORDS } from '@/lib/insights-helpers'

export interface NpsBreakdown {
  promoters: number
  passives: number
  detractors: number
  npsScore: number
}

export interface OrgMetrics {
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
  npsBreakdown: NpsBreakdown
  scoreDistributions: Record<string, number[]>
  avgMetricsMap: Record<string, number>
  participationByEmployee: Record<string, number>
  employeeIdsWithFeedback: Set<string>
  valueStrengthCounts: Record<string, number>
  valueImprovementCounts: Record<string, number>
}

export function useOrgInsights(
  employees: Employee[],
  filtered: SubmissionWithDetails[]
): OrgMetrics {
  const employeeCounts = useMemo(() => {
    let totalInterns = 0
    let totalFullTimers = 0

    for (const employee of employees) {
      if (employee.role === 'intern') totalInterns += 1
      if (employee.role === 'full_timer') totalFullTimers += 1
    }

    return { totalInterns, totalFullTimers }
  }, [employees])

  return useMemo(() => {
    const trustScores: number[] = []
    const purposeScores: number[] = []
    const recommendScores: number[] = []
    const npsScores: number[] = []
    const tealSM: number[] = []
    const tealW: number[] = []
    const tealEP: number[] = []
    const contributionDist: Record<string, number> = {}
    const archetypeDist: Record<string, number> = {}
    const feedbackByType: Record<string, number> = {}

    // scoreDistributions: collect all numeric values per key
    const scoreDistributions: Record<string, number[]> = {}

    // participationByEmployee: count feedback received per employee
    const participationByEmployee: Record<string, number> = {}

    // value keyword counts
    const valueStrengthCounts: Record<string, number> = {}
    const valueImprovementCounts: Record<string, number> = {}

    const employeeIdsWithFeedback = new Set<string>()

    for (const sub of filtered) {
      const type = sub.submission.feedback_type
      feedbackByType[type] = (feedbackByType[type] || 0) + 1

      // Count participation: recipients for directed feedback, submitters for self/build3
      if (sub.submission.feedback_for_id) {
        employeeIdsWithFeedback.add(sub.submission.feedback_for_id)
        const recipientId = sub.submission.feedback_for_id
        participationByEmployee[recipientId] = (participationByEmployee[recipientId] || 0) + 1
      }
      if (sub.submission.feedback_type === 'self' || sub.submission.feedback_type === 'build3') {
        const submitterId = sub.submission.submitted_by_id
        employeeIdsWithFeedback.add(submitterId)
        participationByEmployee[submitterId] = (participationByEmployee[submitterId] || 0) + 1
      }

      // Team avg metrics must only use peer feedback directed at someone (same
      // as how individual metrics are computed) — exclude self and build3 types
      // so org averages and individual scores are directly comparable.
      const isPeerFeedback =
        type !== 'self' && type !== 'build3' && sub.submission.feedback_for_id != null

      for (const ans of sub.answers) {
        const num = parseNumericAnswer(ans.answer_value)

        // Collect into scoreDistributions only for peer feedback answers
        if (num !== null && isPeerFeedback) {
          if (!scoreDistributions[ans.question_key]) scoreDistributions[ans.question_key] = []
          scoreDistributions[ans.question_key].push(num)
        }

        switch (ans.question_key) {
          case 'trust_battery':
            if (num !== null && isPeerFeedback) trustScores.push(num)
            break
          case 'purpose_alignment':
            if (num !== null && isPeerFeedback) purposeScores.push(num)
            break
          case 'recommend_rating':
            if (num !== null && isPeerFeedback) recommendScores.push(num)
            break
          case 'nps_score':
            // NPS is always build3 type — keep as-is
            if (num !== null) npsScores.push(num)
            break
          case 'teal_self_management':
            if (num !== null && isPeerFeedback) tealSM.push(num)
            break
          case 'teal_wholeness':
            if (num !== null && isPeerFeedback) tealW.push(num)
            break
          case 'teal_evolutionary_purpose':
            if (num !== null && isPeerFeedback) tealEP.push(num)
            break
          case 'contribution_level': {
            if (isPeerFeedback) {
              const label = ans.answer_value
              contributionDist[label] = (contributionDist[label] || 0) + 1
            }
            break
          }
          case 'ideal_team_player_type':
            if (isPeerFeedback) {
              archetypeDist[ans.answer_value] = (archetypeDist[ans.answer_value] || 0) + 1
            }
            break
          case 'value_strength': {
            const text = ans.answer_value.toLowerCase()
            for (const keyword of BUILD3_VALUE_KEYWORDS) {
              if (text.includes(keyword.toLowerCase())) {
                valueStrengthCounts[keyword] = (valueStrengthCounts[keyword] || 0) + 1
              }
            }
            break
          }
          case 'value_improvement': {
            const text = ans.answer_value.toLowerCase()
            for (const keyword of BUILD3_VALUE_KEYWORDS) {
              if (text.includes(keyword.toLowerCase())) {
                valueImprovementCounts[keyword] = (valueImprovementCounts[keyword] || 0) + 1
              }
            }
            break
          }
        }
      }
    }

    const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : null

    // NPS breakdown
    let promoters = 0
    let passives = 0
    let detractors = 0
    for (const score of npsScores) {
      if (score >= 9) promoters++
      else if (score >= 7) passives++
      else detractors++
    }
    const total = npsScores.length
    const npsScore = total > 0 ? Math.round(((promoters - detractors) / total) * 100) : 0
    const npsBreakdown: NpsBreakdown = { promoters, passives, detractors, npsScore }

    // avgMetricsMap: flat map of all numeric metric averages
    const avgMetricsMap: Record<string, number> = {}
    const namedAvgs: Array<[string, number[]]> = [
      ['trust_battery', trustScores],
      ['purpose_alignment', purposeScores],
      ['recommend_rating', recommendScores],
      ['nps_score', npsScores],
      ['teal_self_management', tealSM],
      ['teal_wholeness', tealW],
      ['teal_evolutionary_purpose', tealEP],
    ]
    for (const [key, arr] of namedAvgs) {
      const a = avg(arr)
      if (a !== null) avgMetricsMap[key] = a
    }
    // Also include any other numeric keys collected in scoreDistributions
    for (const [key, arr] of Object.entries(scoreDistributions)) {
      if (!(key in avgMetricsMap) && arr.length > 0) {
        avgMetricsMap[key] = arr.reduce((a, b) => a + b, 0) / arr.length
      }
    }

    return {
      totalEmployees: employees.length,
      totalSubmissions: filtered.length,
      totalInterns: employeeCounts.totalInterns,
      totalFullTimers: employeeCounts.totalFullTimers,
      avgTrustBattery: avg(trustScores),
      avgPurposeAlignment: avg(purposeScores),
      avgRecommendRating: avg(recommendScores),
      avgNps: avg(npsScores),
      contributionDistribution: contributionDist,
      archetypeDistribution: archetypeDist,
      feedbackByType,
      employeesWithFeedback: employeeIdsWithFeedback.size,
      employeesWithoutFeedback: employees.length - employeeIdsWithFeedback.size,
      recentActivity: [...filtered]
        .sort((a, b) => b.submission.created_at.localeCompare(a.submission.created_at))
        .slice(0, 10),
      tealAvg: {
        selfManagement: avg(tealSM),
        wholeness: avg(tealW),
        purpose: avg(tealEP),
      },
      npsBreakdown,
      scoreDistributions,
      avgMetricsMap,
      participationByEmployee,
      employeeIdsWithFeedback,
      valueStrengthCounts,
      valueImprovementCounts,
    }
  }, [employeeCounts, employees, filtered])
}
