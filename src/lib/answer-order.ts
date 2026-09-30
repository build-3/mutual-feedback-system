import {
  ADHOC_QUESTIONS,
  BUILD3_QUESTIONS,
  FULL_TIMER_QUESTIONS,
  INTERN_QUESTIONS,
  SELF_QUESTIONS,
  type Question,
} from "./questions"

/**
 * Answers are stored one row per question (EAV) and read back ordered by id,
 * which is a random UUID, so a submission's answers came out in a different
 * order every time. This restores the order the form asked them in.
 *
 * The order is derived from the question definitions rather than restated here,
 * so a reordered form reorders the insights view with it. A matrix question
 * stores one row per sub-item and a slider stores its follow-up text under a
 * separate key, so both are expanded in place.
 *
 * Keys the current form no longer asks (retired questions on old submissions)
 * keep their original relative order and sort after the current ones.
 */
const QUESTIONS_BY_TYPE: Record<string, Question[]> = {
  intern: INTERN_QUESTIONS,
  full_timer: FULL_TIMER_QUESTIONS,
  build3: BUILD3_QUESTIONS,
  self: SELF_QUESTIONS,
  adhoc: ADHOC_QUESTIONS,
}

function flattenKeys(questions: Question[]): string[] {
  const keys: string[] = []
  for (const q of questions) {
    keys.push(q.key)
    for (const item of q.matrixItems ?? []) keys.push(item.key)
    if (q.followup?.detailKey) keys.push(q.followup.detailKey)
  }
  return keys
}

const RANK_BY_TYPE: Record<string, Map<string, number>> = Object.fromEntries(
  Object.entries(QUESTIONS_BY_TYPE).map(([type, qs]) => [
    type,
    new Map(flattenKeys(qs).map((key, i) => [key, i])),
  ])
)

export function sortAnswersByQuestionOrder<T extends { question_key: string }>(
  feedbackType: string,
  answers: T[]
): T[] {
  const rank = RANK_BY_TYPE[feedbackType]
  if (!rank) return answers
  const missing = rank.size
  return answers
    .map((answer, index) => ({ answer, index }))
    .sort((a, b) => {
      const ra = rank.get(a.answer.question_key) ?? missing
      const rb = rank.get(b.answer.question_key) ?? missing
      return ra - rb || a.index - b.index
    })
    .map(({ answer }) => answer)
}
