export const BUILD3_VALUES = [
  "We build big, beautiful things and we do it with care.",
  "Community is gold. We mine it together.",
  "We back builders who want to make a real dent.",
  "Vibes matter with people and with the planet.",
  "We stay curious so we can keep growing.",
  "We work honestly, with craft and follow-through.",
  "We build for diversity in people, ideas, and action.",
  "We keep purpose and profit in the same room.",
]

export const CONTRIBUTION_LEVELS = [
  {
    key: "A",
    label: "Finding their feet",
    description:
      "Still settling in, learning the ropes, and building confidence.",
  },
  {
    key: "B",
    label: "Reliable support",
    description:
      "Shows up well, delivers solid work, and helps the team move.",
  },
  {
    key: "C",
    label: "Independent contributor",
    description:
      "Sets direction, keeps momentum, and needs only light nudges.",
  },
  {
    key: "D",
    label: "Leader",
    description:
      "Creates clarity, unlocks others, and spots the next move before we ask.",
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
  | "dropdown"

export type Question = {
  key: string
  text: string
  type: QuestionType
  subtext?: string
  options?: { key: string; label: string; description?: string }[]
  matrixItems?: { key: string; label: string }[]
  min?: number
  max?: number
  employeeRole?: "intern" | "full_timer"
  showValues?: boolean
}

// Shared questions used in both intern and full-timer paths
const TEAL_CONCEPTS_QUESTION: Question = {
  key: "teal_concepts",
  text: "How do they show up on these teal principles?",
  type: "matrix_rating",
  subtext: "Quick score, 1 to 5.",
  matrixItems: [
    { key: "teal_self_management", label: "Self-Management" },
    { key: "teal_wholeness", label: "Wholeness" },
    { key: "teal_evolutionary_purpose", label: "Evolutionary Purpose" },
  ],
}

const PURPOSE_ALIGNMENT_QUESTION: Question = {
  key: "purpose_alignment",
  text: "How closely do they align with our purpose as builders for impact?",
  type: "star_rating",
  subtext:
    "Think about community building, knowledge sharing, and how they help our ecosystem grow.",
}

const TRUST_BATTERY_QUESTION: Question = {
  key: "trust_battery",
  text: "How confident are you that this person will consistently follow through on their commitments and communicate openly and honestly with you?",
  type: "number_input",
  subtext:
    "This question is based on the Trust Battery concept coined by Tobi Lütke, the CEO of Shopify.\n\nTrust starts at 50% when the relationship begins and then goes up or down from there. Please write your current trust score between 0-100 below.\n\nRead more here - https://mollyg.substack.com/p/the-trust-battery?utm_medium=reader2",
  min: 0,
  max: 100,
}

const CONTRIBUTION_LEVEL_QUESTION: Question = {
  key: "contribution_level",
  text: "What level of contribution are we seeing right now?",
  type: "single_select",
  options: CONTRIBUTION_LEVELS.map((item) => ({
    key: item.key,
    label: item.label,
    description: item.description,
  })),
}

const VALUE_STRENGTH_QUESTION: Question = {
  key: "value_strength",
  text: "Please identify one value from our value set that best represents the individual's strengths. Provide reasons for your selection.",
  type: "long_text",
  subtext: "Check detailed Value set here - https://www.notion.so/build3goa/vision-values-bhag-104ff3fd1382801fb5d5ffdc1fe2b43a",
  showValues: true,
}

const VALUE_IMPROVEMENT_QUESTION: Question = {
  key: "value_improvement",
  text: "Please identify one value from our value set that the individual could improve upon. Provide reasons for your selection.",
  type: "long_text",
  subtext: "Check detailed Value set here - https://www.notion.so/build3goa/vision-values-bhag-104ff3fd1382801fb5d5ffdc1fe2b43a",
  showValues: true,
}

export const INTERN_QUESTIONS: Question[] = [
  {
    key: "feedback_for",
    text: "Who are we sharing feedback on?",
    type: "employee_search",
    employeeRole: "intern",
  },
  {
    key: "recommend_rating",
    text: "How strongly would we back them for a full-time role?",
    type: "star_rating",
  },
  TEAL_CONCEPTS_QUESTION,
  {
    key: "excellence_area",
    text: "Where have they done especially strong work? Specific examples help.",
    type: "long_text",
  },
  {
    key: "upskill_ability",
    text: "Where have they stretched, learned fast, or upskilled themselves?",
    type: "long_text",
  },
  CONTRIBUTION_LEVEL_QUESTION,
  {
    key: "upcoming_projects",
    text: "Where could their skills be especially useful over the next 12 months?",
    type: "long_text",
  },
  {
    key: "advice",
    text: "What is the one piece of advice we should give them next?",
    type: "long_text",
  },
  PURPOSE_ALIGNMENT_QUESTION,
  VALUE_STRENGTH_QUESTION,
  VALUE_IMPROVEMENT_QUESTION,
  {
    key: "ideal_team_player_matrix",
    text: "How do they land on the ideal team player traits?",
    type: "matrix_rating",
    matrixItems: [
      {
        key: "itp_humble",
        label: "Humble: puts the work above ego",
      },
      {
        key: "itp_hungry",
        label: "Hungry: keeps reaching for more",
      },
      {
        key: "itp_smart",
        label: "People-smart: reads the room and responds well",
      },
    ],
  },
  {
    key: "ideal_team_player_type",
    text: "If we had to name the archetype, which one fits best?",
    type: "dropdown",
    options: IDEAL_TEAM_PLAYER_TYPES.map((type) => ({ key: type, label: type })),
  },
  TRUST_BATTERY_QUESTION,
]

export const BUILD3_QUESTIONS: Question[] = [
  {
    key: "nps_score",
    text: "How likely are you to recommend build3 to a friend or colleague?",
    type: "nps",
    min: 0,
    max: 10,
  },
  {
    key: "overall_experience",
    text: "How has your overall experience with build3 felt so far?",
    type: "single_select",
    options: [
      { key: "excellent", label: "Excellent" },
      { key: "very_good", label: "Very good" },
      { key: "good", label: "Good" },
      { key: "fair", label: "Fair" },
      { key: "poor", label: "Poor" },
    ],
  },
  {
    key: "trust_battery",
    text: "How charged is your trust in build3 right now?",
    type: "number_input",
    subtext:
      "Think about how much you trust the studio to follow through on what it says, treat people fairly, and move in the right direction.\n\nStart at 50 as neutral — then go up or down based on your real experience so far.",
    min: 0,
    max: 100,
  },
  {
    key: "purpose_alignment",
    text: "How closely does build3 align with your sense of purpose?",
    type: "star_rating",
    subtext:
      "Does the work we do and the way we do it connect with what matters to you?",
  },
  {
    key: "enjoyed_most",
    text: "What has felt especially good about build3 so far?",
    type: "long_text",
  },
  {
    key: "missing_disappointing",
    text: "What has felt missing, clunky, or disappointing so far?",
    type: "long_text",
  },
  {
    key: "policies_unclear",
    text: "Which policies or norms still feel fuzzy, and how can we make them clearer?",
    type: "long_text",
  },
  {
    key: "tools_resources",
    text: "Do you have what you need to do good work? If not, what is missing?",
    type: "long_text",
  },
  {
    key: "issues_faced",
    text: "Have you run into any personal or professional blockers we should know about?",
    type: "long_text",
  },
  {
    key: "anything_else",
    text: "Anything else we should hear while we have your attention?",
    type: "long_text",
  },
]

export const FULL_TIMER_QUESTIONS: Question[] = [
  {
    key: "feedback_for",
    text: "Who are we sharing feedback on?",
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
    text: "Please share any constructive feedback you may have.",
    type: "long_text",
    subtext: "Feel free to expand upon whatever you think is not working or the person can be better at. You may include what he/she can improve which you have noticed.",
  },
]

export const SELF_QUESTIONS: Question[] = [
  {
    key: "proud_contribution",
    text: "What work or progress are you most proud of this month?",
    type: "long_text",
  },
  {
    key: "proactive_efforts",
    text: "Which 2 or 3 proactive things did you pick up on your own this month?",
    type: "long_text",
  },
  {
    key: "value_upheld",
    text: "Which value did you uphold best, and where did it show up?",
    type: "long_text",
    showValues: true,
  },
  {
    key: "value_to_improve",
    text: "Which value needs the most work from you right now, and why?",
    type: "long_text",
    showValues: true,
  },
  {
    key: "self_improvement",
    text: "What are you working on next month, and how will you go about it?",
    type: "long_text",
  },
]

export const ADHOC_QUESTIONS: Question[] = [
  {
    key: "feedback_for",
    text: "Who is this for?",
    type: "employee_search",
  },
  {
    key: "adhoc_rating",
    text: "Quick score — how did this interaction go?",
    type: "star_rating",
    subtext: "1 = rough, 5 = nailed it",
  },
  {
    key: "adhoc_positive",
    text: "What went well?",
    type: "long_text",
    subtext: "Be specific — what did they do that worked?",
  },
  {
    key: "adhoc_improve",
    text: "What could be better?",
    type: "long_text",
    subtext: "Focus on the action, not the person.",
  },
]

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
