'use client'

import { useMemo } from 'react'
import { Employee } from '@/lib/types'
import { SubmissionWithDetails } from '@/app/insights/types'
import { parseNumericAnswer, contributionKeyToLabel, BUILD3_VALUE_KEYWORDS, extractValuesText } from '@/lib/insights-helpers'

export interface NpsBreakdown {
  promoters: number
  passives: number
  detractors: number
  npsScore: number
  promoterNames: string[]
  passiveNames: string[]
  detractorNames: string[]
}

export interface ContributionAttribution {
  /** map of contribution level label -> list of { rater, target } */
  byLevel: Record<string, Array<{ raterName: string; targetName: string }>>
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
  contributionAttribution: ContributionAttribution
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
    const empNameById = new Map<string, string>()
    for (const e of employees) empNameById.set(e.id, e.name)

    // Org-level metrics (top stat pills) come from build3 feedback — the org health check.
    // These answer "how does the team feel about build3 as a workplace?"
    const orgTrustScores: number[] = []
    const orgPurposeScores: number[] = []
    const npsScores: number[] = []
    const npsPromoterNames: string[] = []
    const npsPassiveNames: string[] = []
    const npsDetractorNames: string[] = []
    const contributionByLevel: Record<string, Array<{ raterName: string; targetName: string }>> = {}

    // Peer metrics come from intern/full_timer feedback directed at individuals.
    // These answer "how do peers rate each other?"
    const peerTrustScores: number[] = []
    const peerPurposeScores: number[] = []
    const recommendScores: number[] = []
    const tealSM: number[] = []
    const tealW: number[] = []
    const tealEP: number[] = []
    const contributionDist: Record<string, number> = {}
    const archetypeDist: Record<string, number> = {}
    const feedbackByType: Record<string, number> = {}

    // scoreDistributions: collect all numeric values per key (peer only)
    const scoreDistributions: Record<string, number[]> = {}

    // participationByEmployee: count feedback per employee
    const participationByEmployee: Record<string, number> = {}

    // value keyword counts (from peer feedback)
    const valueStrengthCounts: Record<string, number> = {}
    const valueImprovementCounts: Record<string, number> = {}

    // Participation: tracks unique people who submitted build3 feedback
    // (the org health check everyone is asked to do)
    const build3Submitters = new Set<string>()
    // Also track all employees who have any feedback (for individual views)
    const employeeIdsWithFeedback = new Set<string>()

    for (const sub of filtered) {
      // Skip ghost submissions — no answers means the form was never completed
      if (sub.answers.length === 0) continue

      const type = sub.submission.feedback_type
      feedbackByType[type] = (feedbackByType[type] || 0) + 1

      // Track participation per employee for individual views
      if (sub.submission.feedback_for_id) {
        employeeIdsWithFeedback.add(sub.submission.feedback_for_id)
        const recipientId = sub.submission.feedback_for_id
        participationByEmployee[recipientId] = (participationByEmployee[recipientId] || 0) + 1
      }
      if (type === 'self' || type === 'build3') {
        employeeIdsWithFeedback.add(sub.submission.submitted_by_id)
      }

      // Build3 submitters — for the org participation stat
      if (type === 'build3') {
        build3Submitters.add(sub.submission.submitted_by_id)
      }

      const isBuild3 = type === 'build3'
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
            if (num !== null && isBuild3) orgTrustScores.push(num)
            if (num !== null && isPeerFeedback) peerTrustScores.push(num)
            break
          case 'purpose_alignment':
            if (num !== null && isBuild3) orgPurposeScores.push(num)
            if (num !== null && isPeerFeedback) peerPurposeScores.push(num)
            break
          case 'recommend_rating':
            if (num !== null && isPeerFeedback) recommendScores.push(num)
            break
          case 'nps_score':
            if (num !== null && isBuild3) {
              npsScores.push(num)
              const raterName = empNameById.get(sub.submission.submitted_by_id) || 'Unknown'
              if (num >= 9) npsPromoterNames.push(raterName)
              else if (num >= 7) npsPassiveNames.push(raterName)
              else npsDetractorNames.push(raterName)
            }
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
              const label = contributionKeyToLabel(ans.answer_value)
              contributionDist[label] = (contributionDist[label] || 0) + 1
              const raterName = empNameById.get(sub.submission.submitted_by_id) || 'Unknown'
              const targetName = sub.submission.feedback_for_id
                ? (empNameById.get(sub.submission.feedback_for_id) || 'Unknown')
                : 'Unknown'
              if (!contributionByLevel[label]) contributionByLevel[label] = []
              contributionByLevel[label].push({ raterName, targetName })
            }
            break
          }
          case 'ideal_team_player_type':
            if (isPeerFeedback) {
              archetypeDist[ans.answer_value] = (archetypeDist[ans.answer_value] || 0) + 1
            }
            break
          case 'value_strength': {
            const text = extractValuesText(ans.answer_value).toLowerCase()
            for (const keyword of BUILD3_VALUE_KEYWORDS) {
              if (text.includes(keyword.toLowerCase())) {
                valueStrengthCounts[keyword] = (valueStrengthCounts[keyword] || 0) + 1
              }
            }
            break
          }
          case 'value_improvement': {
            const text = extractValuesText(ans.answer_value).toLowerCase()
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
    const npsBreakdown: NpsBreakdown = {
      promoters,
      passives,
      detractors,
      npsScore,
      promoterNames: npsPromoterNames,
      passiveNames: npsPassiveNames,
      detractorNames: npsDetractorNames,
    }

    // avgMetricsMap: flat map of all numeric metric averages (peer scores for individual views)
    const avgMetricsMap: Record<string, number> = {}
    const namedAvgs: Array<[string, number[]]> = [
      ['trust_battery', peerTrustScores],
      ['purpose_alignment', peerPurposeScores],
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

    // Org-level participation: how many people completed the build3 feedback
    const build3ParticipationCount = build3Submitters.size

    return {
      totalEmployees: employees.length,
      totalSubmissions: filtered.length,
      totalInterns: employeeCounts.totalInterns,
      totalFullTimers: employeeCounts.totalFullTimers,
      // Top-level org metrics use build3 feedback (the org health check)
      avgTrustBattery: avg(orgTrustScores),
      avgPurposeAlignment: avg(orgPurposeScores),
      avgRecommendRating: avg(recommendScores),
      avgNps: avg(npsScores),
      contributionDistribution: contributionDist,
      archetypeDistribution: archetypeDist,
      feedbackByType,
      // Participation = unique build3 submitters (not all feedback types mixed)
      employeesWithFeedback: build3ParticipationCount,
      employeesWithoutFeedback: employees.length - build3ParticipationCount,
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
      contributionAttribution: { byLevel: contributionByLevel },
    }
  }, [employeeCounts, employees, filtered])
}
