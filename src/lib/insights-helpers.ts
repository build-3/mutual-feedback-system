// Scoring, color, and label helpers for insights dashboard
// KEY CONVENTION: All keys match what the feedback form writes (from questions.ts)

import type { SubmissionWithDetails } from '@/app/insights/types'
import type { DateRange } from '@/lib/brand'

/** Filter submissions by date range — single source of truth */
export function filterSubmissionsByRange(
  submissions: SubmissionWithDetails[],
  dateRange: DateRange
): SubmissionWithDetails[] {
  if (dateRange === 'all') return submissions
  const now = new Date()
  const monthsBack = dateRange === 'month' ? 1 : 3
  // Use timestamp math to avoid setMonth year-wraparound bugs
  const cutoff = new Date(now.getFullYear(), now.getMonth() - monthsBack, now.getDate())
  return submissions.filter(s => new Date(s.submission.created_at) >= cutoff)
}

export function getScoreColor(value: number, scale: '1-5' | '0-100' | '0-10'): string {
  if (scale === '1-5') {
    if (value <= 2.5) return '#EF4444'
    if (value <= 3.5) return '#f5bb9f'
    return '#79c0a6'
  }
  if (scale === '0-100') {
    if (value <= 40) return '#EF4444'
    if (value <= 65) return '#f5bb9f'
    return '#79c0a6'
  }
  // NPS 0-10
  if (value <= 6) return '#EF4444'
  if (value <= 8) return '#f5bb9f'
  return '#79c0a6'
}

/** Map contribution key (A/B/C/D) to its human-readable label */
export const CONTRIBUTION_KEY_TO_LABEL: Record<string, string> = {
  A: 'finding their feet',
  B: 'reliable support',
  C: 'independent contributor',
  D: 'leader',
}

export function contributionKeyToLabel(key: string): string {
  return CONTRIBUTION_KEY_TO_LABEL[key.trim().toUpperCase()] || key
}

export function contributionToNumber(value: string): number | null {
  const v = value.toLowerCase().trim()
  if (v.startsWith('a') || v.includes('finding')) return 1
  if (v.startsWith('b') || v.includes('reliable')) return 2
  if (v.startsWith('c') || v.includes('independent')) return 3
  if (v.startsWith('d') || v.includes('leader')) return 4
  const n = parseFloat(value)
  return isNaN(n) ? null : n
}

// Generate avatar color from name
const AVATAR_COLORS = [
  '#f5bb9f', '#79c0a6', '#c6e5f8', '#fff392',
  '#f4bfd0', '#bcadcc',
]

export function getAvatarColor(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

export function getInitials(name: string): string {
  if (!name.trim()) return '?'
  return name
    .trim()
    .split(' ')
    .filter(w => w.length > 0)
    .map(w => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

// Parse numeric answer from answer_value string
export function parseNumericAnswer(value: string): number | null {
  if (!value) return null
  const n = parseFloat(value)
  return isNaN(n) ? null : n
}

// build3 values keyword list — single source of truth for value matching
export const BUILD3_VALUE_KEYWORDS = [
  'Creativity',
  'Sustainability',
  'Community',
  'Innovation',
  'Collaboration',
  'Mindfulness',
  'Impact',
  'Purpose',
] as const

/** Separator used in values_with_text answers: "indices|||explanation" */
export const VALUES_SEP = '|||'

/** Keys that store values_with_text format */
export const VALUES_WITH_TEXT_KEYS = new Set([
  'value_strength',
  'value_improvement',
  'value_upheld',
  'value_to_improve',
])

/** Parse a values_with_text answer into selected value names + explanation text */
export function parseValuesWithText(raw: string, valueList: string[]): { values: string[]; text: string } {
  if (!raw.includes(VALUES_SEP)) return { values: [], text: raw }
  const parts = raw.split(VALUES_SEP)
  const indicesPart = parts[0] || ''
  const text = parts.slice(1).join(VALUES_SEP)
  const values: string[] = []
  for (const s of indicesPart.split(',')) {
    const n = parseInt(s, 10)
    if (Number.isFinite(n) && n >= 0 && n < valueList.length) {
      values.push(valueList[n])
    }
  }
  return { values, text }
}

/** Format a values_with_text answer as a plain text string for non-JSX contexts (admin, export) */
export function formatValuesWithText(raw: string, valueList: string[]): string {
  const { values, text } = parseValuesWithText(raw, valueList)
  if (values.length === 0) return text || raw
  const valuesStr = values.map(v => v.replace(/\.$/, '')).join(', ')
  return text.trim() ? `${valuesStr}\n\n${text}` : valuesStr
}

/** Extract the text portion from a values_with_text answer (for keyword analysis) */
export function extractValuesText(raw: string): string {
  if (!raw.includes(VALUES_SEP)) return raw
  return raw.slice(raw.indexOf(VALUES_SEP) + VALUES_SEP.length)
}

// Numeric question keys — MUST match keys from questions.ts
export const NUMERIC_KEYS = new Set([
  'recommend_rating',         // intern path, star 1-5
  'teal_self_management',     // matrix sub-key, intern + full_timer
  'teal_wholeness',           // matrix sub-key, intern + full_timer
  'teal_evolutionary_purpose',// matrix sub-key, intern + full_timer
  'purpose_alignment',        // intern + full_timer, star 1-5
  'trust_battery',            // intern + full_timer, number 0-100
  'itp_humble',               // matrix sub-key, intern
  'itp_hungry',               // matrix sub-key, intern
  'itp_smart',                // matrix sub-key, intern
  'nps_score',                // build3 path, 0-10
  'adhoc_rating',             // adhoc path, star 1-5
])


// ITP Archetype descriptions
export const ITP_DESCRIPTIONS: Record<string, string> = {
  'Ideal team player': 'Humble, hungry, and people-smart. The complete package.',
  'The Pawn': 'Humble and eager to learn but still developing people awareness and initiative.',
  'The Bulldozer': 'Driven and hardworking but can overlook the impact on people around them.',
  'The Charmer': 'Great with people and grounded, but needs more drive and hunger to grow.',
  'Lovable Slacker': 'Easy to work with and humble, but lacks drive and initiative.',
  'Accidental Mess Maker': 'High drive and sharp instincts, but can unintentionally create friction.',
  'Skillful Politician': 'People-smart and strategic, but drive and humility need development.',
}

export const ITP_BADGE_COLORS: Record<string, string> = {
  'Ideal team player': 'bg-[#79c0a6]/20 text-[#4a9a80]',
  'The Pawn': 'bg-[#f5bb9f]/30 text-[#b8713a]',
  'The Bulldozer': 'bg-[#f5bb9f]/40 text-[#a05a2a]',
  'The Charmer': 'bg-[#c6e5f8]/40 text-[#3a7fa8]',
  'Lovable Slacker': 'bg-[#f4bfd0]/30 text-[#a84a6a]',
  'Accidental Mess Maker': 'bg-[#f5bb9f]/50 text-[#8a4020]',
  'Skillful Politician': 'bg-[#bcadcc]/30 text-[#5a4a7a]',
}

// Question label map for display — keys match questions.ts
export const QUESTION_LABELS: Record<string, string> = {
  // Numeric
  recommend_rating: 'full-time backing',
  teal_self_management: 'self-management',
  teal_wholeness: 'wholeness',
  teal_evolutionary_purpose: 'evolutionary purpose',
  purpose_alignment: 'purpose alignment',
  trust_battery: 'trust battery',
  contribution_level: 'contribution level',
  itp_humble: 'humble',
  itp_hungry: 'hungry',
  itp_smart: 'people-smart',
  ideal_team_player_type: 'team player archetype',
  nps_score: 'nps score',
  overall_experience: 'overall experience', // historical — removed from build3 path
  // Text — intern path
  excellence_area: 'strongest work',
  upskill_ability: 'upskilling',
  upcoming_projects: 'future project fit',
  advice: 'advice',
  // Text — shared
  value_strength: 'strongest value',
  value_improvement: 'value to improve',
  constructive_feedback: 'direct feedback',
  // Text — build3 path
  trust_battery_detail: 'trust battery — detail',
  enjoyed_most: 'what felt good', // historical — now inline with trust battery
  missing_disappointing: 'what felt missing', // historical — now inline with trust battery
  policies_unclear: 'policy clarity',
  tools_resources: 'tools and resources',
  issues_faced: 'blockers', // historical — removed from build3 path
  anything_else: 'anything else', // historical — removed from build3 path
  // Text — self path
  proud_contribution: 'proudest work',
  proactive_efforts: 'proactive efforts',
  value_upheld: 'value upheld',
  value_to_improve: 'value to improve',
  self_improvement: 'next focus',
  // Adhoc path
  adhoc_rating: 'interaction score',
  adhoc_positive: 'what went well',
  adhoc_improve: 'what could improve',
  // Matrix parent keys (not stored individually but just in case)
  teal_concepts: 'teal principles',
  ideal_team_player_matrix: 'ideal team player traits',
  feedback_for: 'feedback for',
}
