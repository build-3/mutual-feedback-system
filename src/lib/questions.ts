/**
 * Pre-ecoashram values. Kept ONLY so existing feedback answers (which store
 * value selections as indices) still resolve to their original labels.
 * Never reference this list for new submissions or UI pickers.
 */
export const BUILD3_VALUES_LEGACY = [
  "We build big, beautiful things and we do it with care.",
  "Community is gold. We mine it together.",
  "We back builders who want to make a real dent.",
  "Vibes matter with people and with the planet.",
  "We stay curious so we can keep growing.",
  "We work honestly, with craft and follow-through.",
  "We build for diversity in people, ideas, and action.",
  "We keep purpose and profit in the same room.",
]

/**
 * Current values (4 extrinsic + 4 intrinsic) — used for the picker, the
 * "what we build around" card, and any new feedback submission going forward.
 * New submissions are written with the "v2:" prefix in answer_value so the
 * parser knows to resolve indices against THIS list, not the legacy one.
 */
/**
 * Each entry is "Title. Description." — the picker UI splits on the first
 * period to render Title (bold) above Description (lighter). Insights chips
 * show just the Title for compactness. Keep this shape: short clear title,
 * one-sentence description, ending in a period.
 */
export const BUILD3_VALUES = [
  // — 4 extrinsic (what we do) —
  "Holistic wellbeing. Living consciously across our mental, physical, emotional and spiritual health, learning and growing in each. This shows up as plant based food, natural farming, meditation, yoga, medicinal herbs, non violent communication, and teal practices that keep our community harmonious.",
  "Natural living. Living with nature, understanding her, in harmony where we together thrive. Homes built of natural materials, food and furniture and clothing from the land, negligible plastic, natural pools of water, growing our own food, and energy drawn from sun and wind.",
  "Creativity. Color, craft, and culture sit at the centre, not the edge. Visual, dramatic, poetic, musical, culinary or any other form, creative humans bring vibrancy and play a vital role in rejuvenating and inspiring us all. We welcome them to live with us, share their craft, and enjoy our community.",
  "Social enterprise. Startups can be a force for good, and we want to champion the best version of entrepreneurship, one that makes the world better while keeping us economically sustainable. An academy, an accelerator, a venture builder and volunteering programs, all balancing purpose with profit.",
  // — 4 intrinsic (how we work) —
  "Honest work. Everyone here carries on some work in service of the community, most of us full time at 6 to 8 hours a day, part time at minimum. We don't hire external labor, we work for us, as farmers, builders, entrepreneurs, cooks, wellness practitioners, musicians, tailors and more.",
  "Equality and togetherness. There are roles but no hierarchy. As long as we contribute earnestly, we hold the same rights, respect and benefits as anyone else, and most things (food, housing, energy, events) are provisioned by the community for all equally. We eat together, build together, celebrate together, no individual kitchens or hired hands.",
  "Humility and learning. We are diverse individuals who can learn from and support each other, but only if we truly listen and open our hearts. Arrogance leads to competition, politics and unpleasantness, humility leads to joy, growth, and the lifelong delight of learning with beginner's eyes.",
  "Mettaa. A pali word meaning loving kindness, the energy we want to foster every day. We always have the choice to wake up on the grumpy side or the kind side. The energy we put out is the energy that resonates back, so choose kind.",
]

export const CONTRIBUTION_LEVELS = [
  {
    key: "A",
    label: "finding their feet",
    description:
      "still settling in, learning the ropes, and building confidence.",
  },
  {
    key: "B",
    label: "reliable support",
    description:
      "shows up well, delivers solid work, and helps the team move.",
  },
  {
    key: "C",
    label: "independent contributor",
    description:
      "sets direction, keeps momentum, and needs only light nudges.",
  },
  {
    key: "D",
    label: "leader",
    description:
      "creates clarity, unlocks others, and spots the next move before we ask.",
  },
]

export const IDEAL_TEAM_PLAYER_TYPES = [
  "Ideal team player",
  "The Pawn",
  "The Bulldozer",
  "The Charmer",
  "Lovable Slacker",
  "Accidental Mess Maker",
  "Skillful Politician",
]

export type QuestionType =
  | "employee_search"
  | "star_rating"
  | "matrix_rating"
  | "long_text"
  | "single_select"
  | "nps"
  | "number_input"
  | "slider"
  | "slider_with_followup"
  | "dropdown"
  | "values_with_text"

/** Inline follow-up that appears below the slider based on the score. */
export type SliderFollowup = {
  /** Answer key for the follow-up text (separate from the slider value) */
  detailKey: string
  /** Threshold — score below this triggers lowPrompt, at or above triggers highPrompt */
  threshold: number
  lowPrompt: string
  highPrompt: string
  lowPlaceholder?: string
  highPlaceholder?: string
  /**
   * Minimum trimmed length for the follow-up text. Omit or 0 to leave it
   * optional — opt-in on purpose, so a future slider question doesn't silently
   * inherit a blocking rule nobody asked for.
   */
  minDetailLength?: number
  /**
   * Apply minDetailLength only while the slider is BELOW this value. At or above
   * it the follow-up is optional.
   *
   * A high score needs no justification to be useful; a low or middling one is
   * the whole point of asking. Omit to require the minimum at every value.
   */
  minDetailBelow?: number
}

export type Question = {
  key: string
  text: string
  type: QuestionType
  subtext?: string
  options?: { key: string; label: string; description?: string }[]
  matrixItems?: {
    key: string
    label: string
    description?: string
    /** Short definition of the principle, shown behind an info button. */
    definition?: string
  }[]
  min?: number
  max?: number
  employeeRole?: "intern" | "full_timer"
  /** Follow-up config for slider_with_followup type */
  followup?: SliderFollowup
  /** When true, user can skip without answering */
  optional?: boolean
}

/**
 * A trust score on its own tells you nothing actionable — the sentence beside it
 * is the whole value. Applied to all three trust-battery appearances (intern,
 * full-timer, build3) because they are one logical field: gating only build3
 * would leave the trust_battery_detail column half-substantive and half-blank,
 * which is harder to read than either uniform choice.
 */
export const TRUST_DETAIL_MIN_LENGTH = 20

/**
 * The minimum only bites below this score. At or above it the sentence is
 * optional: a near-full battery explains itself, while anything lower is exactly
 * the case where a bare number tells you nothing actionable.
 */
export const TRUST_DETAIL_REQUIRED_BELOW = 85

// Shared questions used in both intern and full-timer paths
const TEAL_CONCEPTS_QUESTION: Question = {
  key: "teal_concepts",
  text: "how do they show up on these teal principles?",
  type: "matrix_rating",
  subtext: "quick score, 1 to 5.",
  matrixItems: [
    {
      key: "teal_self_management",
      label: "Self-Management",
      description:
        "makes decisions and owns outcomes without waiting for permission or a manager to unblock them.",
      // The `description` says what to look for in this person; the `definition`
      // says what the principle itself means, for anyone rating it who has not
      // met teal before.
      definition: "Enabling autonomous decision-making with accountability.",
    },
    {
      key: "teal_wholeness",
      label: "Wholeness",
      description:
        "brings their whole self to work — feelings, intuition, and personality — instead of hiding behind a professional mask.",
      definition:
        "Bringing your authentic self to work instead of wearing a professional mask.",
    },
    {
      key: "teal_evolutionary_purpose",
      label: "Evolutionary Purpose",
      description:
        "listens for where build3 is trying to go next and moves with it, rather than forcing a fixed plan.",
      definition:
        "Continuously adapting to fulfill the organization's evolving purpose.",
    },
  ],
}

const PURPOSE_ALIGNMENT_QUESTION: Question = {
  key: "purpose_alignment",
  text: "how closely do they align with our purpose as builders for impact?",
  type: "star_rating",
  subtext:
    "think about community building, knowledge sharing, and how they help our ecosystem grow.",
}

const TRUST_BATTERY_QUESTION: Question = {
  key: "trust_battery",
  text: "how confident are you that this person will consistently follow through on their commitments and communicate openly and honestly with you?",
  type: "slider_with_followup",
  subtext:
    "this question is based on the trust battery concept coined by Tobi Lütke, the CEO of Shopify.\n\ntrust starts at 50% when the relationship begins and then goes up or down from there.\n\nread more here - https://mollyg.substack.com/p/the-trust-battery?utm_medium=reader2",
  min: 0,
  max: 100,
  followup: {
    detailKey: "trust_battery_detail",
    threshold: 90,
    lowPrompt: "what's holding back your trust?",
    highPrompt: "what makes you trust them?",
    lowPlaceholder: "share what's been off — specific moments help.",
    highPlaceholder: "what have they done that built this trust?",
    minDetailLength: TRUST_DETAIL_MIN_LENGTH,
    minDetailBelow: TRUST_DETAIL_REQUIRED_BELOW,
  },
}

const CONTRIBUTION_LEVEL_QUESTION: Question = {
  key: "contribution_level",
  text: "what level of contribution are we seeing right now?",
  type: "single_select",
  options: CONTRIBUTION_LEVELS.map((item) => ({
    key: item.key,
    label: item.label,
    description: item.description,
  })),
}

const VALUE_STRENGTH_QUESTION: Question = {
  key: "value_strength",
  text: "which values from our value set best represent their strengths? tell us why.",
  type: "values_with_text",
  subtext: "select one or more, then explain below.",
}

const VALUE_IMPROVEMENT_QUESTION: Question = {
  key: "value_improvement",
  text: "which values could they improve on? tell us why.",
  type: "values_with_text",
  subtext: "select one or more, then explain below.",
  optional: true,
}

export const INTERN_QUESTIONS: Question[] = [
  {
    key: "feedback_for",
    text: "who are we sharing feedback on?",
    type: "employee_search",
    employeeRole: "intern",
  },
  {
    key: "recommend_rating",
    text: "how strongly would we back them for a full-time role?",
    type: "star_rating",
  },
  TEAL_CONCEPTS_QUESTION,
  PURPOSE_ALIGNMENT_QUESTION,
  TRUST_BATTERY_QUESTION,
  CONTRIBUTION_LEVEL_QUESTION,
  VALUE_STRENGTH_QUESTION,
  VALUE_IMPROVEMENT_QUESTION,
  {
    key: "constructive_feedback",
    text: "share any constructive feedback you have.",
    type: "long_text",
    subtext: "expand on whatever you think is not working or they can be better at. include what you've noticed they could improve.",
  },
]

export const BUILD3_QUESTIONS: Question[] = [
  {
    key: "nps_score",
    text: "how likely are you to recommend build3 to a friend or colleague?",
    type: "nps",
    min: 0,
    max: 10,
  },
  {
    key: "trust_battery",
    text: "how charged is your trust in build3 right now?",
    type: "slider_with_followup",
    subtext:
      "think about how much you trust the studio to follow through on what it says, treat people fairly, and move in the right direction.\n\nstart at 50 as neutral — then go up or down based on your real experience so far.",
    min: 0,
    max: 100,
    followup: {
      detailKey: "trust_battery_detail",
      threshold: 90,
      lowPrompt: "what has felt missing, clunky, or disappointing so far?",
      highPrompt: "what has felt especially good about build3 so far?",
      lowPlaceholder: "help us understand what's off — specific moments help.",
      highPlaceholder: "tell us what's working — we want to do more of it.",
      minDetailLength: TRUST_DETAIL_MIN_LENGTH,
      minDetailBelow: TRUST_DETAIL_REQUIRED_BELOW,
    },
  },
  {
    key: "purpose_alignment",
    text: "how closely does build3 align with your sense of purpose?",
    type: "star_rating",
    subtext:
      "does the work we do and the way we do it connect with what matters to you?",
  },
  {
    key: "policies_unclear",
    text: "which policies or norms still feel fuzzy, and how can we make them clearer?",
    type: "long_text",
  },
  {
    key: "tools_resources",
    text: "do you have what you need to do good work? if not, what is missing?",
    type: "long_text",
  },
]

export const FULL_TIMER_QUESTIONS: Question[] = [
  {
    key: "feedback_for",
    text: "who are we sharing feedback on?",
    type: "employee_search",
    employeeRole: "full_timer",
  },
  TEAL_CONCEPTS_QUESTION,
  PURPOSE_ALIGNMENT_QUESTION,
  TRUST_BATTERY_QUESTION,
  CONTRIBUTION_LEVEL_QUESTION,
  VALUE_STRENGTH_QUESTION,
  VALUE_IMPROVEMENT_QUESTION,
  {
    key: "constructive_feedback",
    text: "share any constructive feedback you have.",
    type: "long_text",
    subtext: "expand on whatever you think is not working or they can be better at. include what you've noticed they could improve.",
  },
]

export const SELF_QUESTIONS: Question[] = [
  {
    key: "proud_contribution",
    text: "what work or progress are you most proud of since the last session?",
    type: "long_text",
  },
  {
    key: "proactive_efforts",
    text: "which 2 or 3 proactive things did you pick up on your own since the last session?",
    type: "long_text",
  },
  {
    key: "value_upheld",
    text: "which value did you uphold best, and where did it show up?",
    type: "values_with_text",
    subtext: "select one or more, then explain below.",
  },
  {
    key: "value_to_improve",
    text: "which value needs the most work from you right now, and why?",
    type: "values_with_text",
    subtext: "select one or more, then explain below.",
  },
  {
    key: "self_improvement",
    text: "what are you working on next month, and how will you go about it?",
    type: "long_text",
  },
]

export const ADHOC_QUESTIONS: Question[] = [
  {
    key: "feedback_for",
    text: "who is this for?",
    type: "employee_search",
  },
  {
    key: "adhoc_rating",
    text: "quick score — how did this interaction go?",
    type: "star_rating",
    subtext: "1 = rough, 5 = nailed it",
  },
  {
    key: "adhoc_positive",
    text: "what went well?",
    type: "long_text",
    subtext: "be specific — what did they do that worked?",
  },
  {
    key: "adhoc_improve",
    text: "what could be better?",
    type: "long_text",
    subtext: "focus on the action, not the person.",
  },
]

export const SELF_REVIEW_KEYS = [
  "proud_contribution",
  "proactive_efforts",
  "value_upheld",
  "value_to_improve",
  "self_improvement",
] as const

export type SelfReviewKey = (typeof SELF_REVIEW_KEYS)[number]

export function getQuestionsForPath(
  path: "intern" | "build3" | "full_timer" | "self" | "adhoc"
): Question[] {
  switch (path) {
    case "intern":
      return INTERN_QUESTIONS
    case "build3":
      return BUILD3_QUESTIONS
    case "full_timer":
      return FULL_TIMER_QUESTIONS
    case "self":
      return SELF_QUESTIONS
    case "adhoc":
      return ADHOC_QUESTIONS
  }
}

/**
 * Minimum trimmed length per answer key, derived from the question definitions
 * rather than restated as a second hardcoded list — a duplicate would be free to
 * drift from the questions it describes.
 *
 * Lets the server enforce the same rule as the client: it validates answer rows
 * generically and otherwise has no idea which question a row came from.
 */
/**
 * Follow-up detail keys whose minimum depends on the slider beside them, mapped
 * to the parent question. The server validates answer rows generically, so
 * without this it enforced 20 characters at every score and would reject a
 * legitimately terse reply on a near-full battery — a rule the client no longer
 * applies. Both sides now read the same config.
 */
export const CONDITIONAL_DETAIL_PARENTS: Record<string, Question> = (() => {
  const out: Record<string, Question> = {}
  for (const question of [
    ...INTERN_QUESTIONS,
    ...BUILD3_QUESTIONS,
    ...FULL_TIMER_QUESTIONS,
    ...SELF_QUESTIONS,
    ...ADHOC_QUESTIONS,
  ]) {
    const followup = question.followup
    if (followup?.detailKey && followup.minDetailBelow != null) {
      out[followup.detailKey] = question
    }
  }
  return out
})()

export const MIN_ANSWER_LENGTHS: Record<string, number> = (() => {
  const out: Record<string, number> = {}
  const allQuestions = [
    ...INTERN_QUESTIONS,
    ...BUILD3_QUESTIONS,
    ...FULL_TIMER_QUESTIONS,
    ...SELF_QUESTIONS,
    ...ADHOC_QUESTIONS,
  ]
  for (const question of allQuestions) {
    const min = question.followup?.minDetailLength
    if (question.followup && min && min > 0) {
      // Same key can appear in several paths; keep the strictest.
      const key = question.followup.detailKey
      out[key] = Math.max(out[key] ?? 0, min)
    }
  }
  return out
})()

/**
 * Validate a slider follow-up. Returns null when acceptable, otherwise the
 * user-facing message.
 *
 * Shared by both client validators — they previously each returned an
 * unconditional `true` for this question type, and any rule added to only one of
 * them would be bypassable through the other.
 */
export function requiredDetailLength(
  question: Question,
  sliderValue: number | null | undefined
): number {
  const followup = question.followup
  const min = followup?.minDetailLength ?? 0
  if (min <= 0) return 0
  // Above the cutoff the sentence is optional. A missing/unparsed value is
  // treated as "still required" — failing open here would let a bad number
  // silently switch the rule off.
  if (
    followup?.minDetailBelow != null &&
    typeof sliderValue === "number" &&
    Number.isFinite(sliderValue) &&
    sliderValue >= followup.minDetailBelow
  ) {
    return 0
  }
  return min
}

export function validateFollowupDetail(
  question: Question,
  value: string | undefined,
  sliderValue?: number | null
): string | null {
  const min = requiredDetailLength(question, sliderValue)
  if (min <= 0) return null
  const length = (value ?? "").trim().length
  if (length >= min) return null
  return `add a bit more detail — at least ${min} characters, so the score means something.`
}
