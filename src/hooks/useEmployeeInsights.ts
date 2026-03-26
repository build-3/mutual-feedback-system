'use client'

import { useMemo } from 'react'
import { Employee } from '@/lib/types'
import {
  parseNumericAnswer,
  contributionToNumber,
  NUMERIC_KEYS,
} from '@/lib/insights-helpers'
import { SubmissionWithDetails } from '@/app/insights/types'

export type { SubmissionWithDetails }

export interface NumericMetric {
  key: string
  values: number[]
  avg: number
  count: number
}

export interface GivenFeedbackSummaryItem {
  employeeId: string | null
  employeeName: string
  date: string
  submissionId: string
}

export interface EmployeeInsightsData {
  employee: Employee | null
  receivedSubmissions: SubmissionWithDetails[]
  givenSubmissions: SubmissionWithDetails[]
  selfSubmissions: SubmissionWithDetails[]
  metrics: Record<string, NumericMetric>
  contributionCounts: Record<string, number>
  archetypeCounts: Record<string, number>
  lastFeedbackDate: string | null
  loading: boolean
  givenFeedbackSummary: GivenFeedbackSummaryItem[]
  scoreTimeline: Record<string, { date: string; value: number }[]>
  textFeedbackGrouped: Record<string, string[]>
}

export function useEmployeeInsights(
  employeeId: string | null,
  employees: Employee[],
  filteredSubmissions: SubmissionWithDetails[]
): EmployeeInsightsData {
  const { employeeById, nameCounts } = useMemo(() => {
    const counts: Record<string, number> = {}
    const byId = new Map<string, Employee>()

    for (const current of employees) {
      const normalized = current.name.trim().toLowerCase()
      counts[normalized] = (counts[normalized] || 0) + 1
      byId.set(current.id, current)
    }

    return {
      employeeById: byId,
      nameCounts: counts,
    }
  }, [employees])

  return useMemo(() => {
    const employee = employeeId ? employeeById.get(employeeId) || null : null
    if (!employee) {
      return {
        employee: null,
        receivedSubmissions: [],
        givenSubmissions: [],
        selfSubmissions: [],
        metrics: {},
        contributionCounts: {},
        archetypeCounts: {},
        lastFeedbackDate: null,
        loading: false,
        givenFeedbackSummary: [],
        scoreTimeline: {},
        textFeedbackGrouped: {},
      }
    }

    const received: SubmissionWithDetails[] = []
    const given: SubmissionWithDetails[] = []
    const self: SubmissionWithDetails[] = []

    // Compute numeric metrics from received feedback
    const metricsMap: Record<string, number[]> = {}
    const contributionCounts: Record<string, number> = {}
    const archetypeCounts: Record<string, number> = {}

    // scoreTimeline: per metric key, array of { date, value } sorted by date
    const scoreTimelineMap: Record<string, { date: string; value: number }[]> = {}

    // textFeedbackGrouped: group text answers by question_key across all received submissions
    const textFeedbackGrouped: Record<string, string[]> = {}

    let lastFeedbackDate: string | null = null

    for (const sub of filteredSubmissions) {
      const { feedback_for_id: feedbackForId, submitted_by_id: submittedById, feedback_type: feedbackType, created_at: createdAt } = sub.submission

      if (feedbackForId === employeeId && feedbackType !== 'self') {
        received.push(sub)
        if (!lastFeedbackDate || createdAt > lastFeedbackDate) {
          lastFeedbackDate = createdAt
        }
      }

      if (submittedById === employeeId) {
        if (feedbackType === 'self') {
          self.push(sub)
          if (!lastFeedbackDate || createdAt > lastFeedbackDate) {
            lastFeedbackDate = createdAt
          }
        } else {
          given.push(sub)
        }
      }
    }

    for (const sub of received) {
      const submissionDate = sub.submission.created_at

      for (const ans of sub.answers) {
        if (NUMERIC_KEYS.has(ans.question_key)) {
          const num = parseNumericAnswer(ans.answer_value)
          if (num !== null) {
            if (!metricsMap[ans.question_key]) metricsMap[ans.question_key] = []
            metricsMap[ans.question_key].push(num)

            if (!scoreTimelineMap[ans.question_key]) scoreTimelineMap[ans.question_key] = []
            scoreTimelineMap[ans.question_key].push({ date: submissionDate, value: num })
          }
        }
        if (ans.question_key === 'contribution_level') {
          const numVal = contributionToNumber(ans.answer_value)
          if (numVal !== null) {
            if (!metricsMap['contribution_level']) metricsMap['contribution_level'] = []
            metricsMap['contribution_level'].push(numVal)

            if (!scoreTimelineMap['contribution_level']) scoreTimelineMap['contribution_level'] = []
            scoreTimelineMap['contribution_level'].push({ date: submissionDate, value: numVal })
          }
          const label = ans.answer_value
          contributionCounts[label] = (contributionCounts[label] || 0) + 1
        }
        // FIX #1: Use correct key from form (ideal_team_player_type, not itp_archetype)
        if (ans.question_key === 'ideal_team_player_type') {
          archetypeCounts[ans.answer_value] = (archetypeCounts[ans.answer_value] || 0) + 1
        }

        // Collect text answers grouped by question_key
        if (ans.answer_value && typeof ans.answer_value === 'string' && ans.answer_value.trim()) {
          // Include text answers (non-numeric, non-empty)
          const num = parseNumericAnswer(ans.answer_value)
          if (num === null) {
            if (!textFeedbackGrouped[ans.question_key]) textFeedbackGrouped[ans.question_key] = []
            textFeedbackGrouped[ans.question_key].push(ans.answer_value)
          }
        }
      }
    }

    const metrics: Record<string, NumericMetric> = {}
    for (const [key, values] of Object.entries(metricsMap)) {
      const avg = values.reduce((a, b) => a + b, 0) / values.length
      metrics[key] = { key, values, avg, count: values.length }
    }

    // Sort scoreTimeline entries chronologically per key
    const scoreTimeline: Record<string, { date: string; value: number }[]> = {}
    for (const [key, entries] of Object.entries(scoreTimelineMap)) {
      scoreTimeline[key] = entries.sort((a, b) => a.date.localeCompare(b.date))
    }

    // givenFeedbackSummary: lookup employee name from employees array using feedback_for_id
    const givenFeedbackSummary: GivenFeedbackSummaryItem[] = given.map(sub => {
      const recipientId = sub.submission.feedback_for_id
      const recipient = recipientId ? employeeById.get(recipientId) : null
      const recipientName = recipient?.name ?? 'Unknown'
      const normalizedName = recipientName.trim().toLowerCase()
      const hasDuplicateName = nameCounts[normalizedName] > 1
      return {
        employeeId: recipientId,
        employeeName: hasDuplicateName && recipientId
          ? `${recipientName} · ${recipientId.slice(0, 4)}`
          : recipientName,
        date: sub.submission.created_at,
        submissionId: sub.submission.id,
      }
    })

    return {
      employee,
      receivedSubmissions: received,
      givenSubmissions: given,
      selfSubmissions: self,
      metrics,
      contributionCounts,
      archetypeCounts,
      lastFeedbackDate,
      loading: false,
      givenFeedbackSummary,
      scoreTimeline,
      textFeedbackGrouped,
    }
  }, [employeeById, employeeId, filteredSubmissions, nameCounts])
}
