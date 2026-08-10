export const BRAND_COLORS = {
  peach: "#f5bb9f",
  sky: "#c6e5f8",
  sage: "#79c0a6",
  yellow: "#fff392",
  pink: "#f4bfd0",
  lavender: "#bcadcc",
  ink: "#1d1d1b",
  grey: "#9d9b9a",
  white: "#ffffff",
  canvas: "#fffaf5",
  surface: "#ffffff",
  line: "#ddd4cc",
  muted: "#5f5b58",
  danger: "#d35b52",
} as const

export type Accent =
  | "peach"
  | "sky"
  | "sage"
  | "yellow"
  | "pink"
  | "lavender"
  | "ink"

export type FeedbackPath = "intern" | "build3" | "full_timer" | "self" | "adhoc"
/**
 * Reporting window. A "cycle" runs from the 2nd Tuesday of one month up to the
 * 2nd Tuesday of the next — see src/lib/cycles.ts. Replaced the old
 * "month"/"3months" calendar windows, which never matched the session cadence
 * and made the dashboard read zero early in a month.
 */
export type DateRange = "cycle" | "3cycles" | "all"

type AlphaSwatch = {
  solid: string
  soft: string
  washed: string
  border: string
  contrast: string
}

function withAlpha(hex: string, alpha: number) {
  const value = hex.replace("#", "")
  const full = value.length === 3
    ? value
        .split("")
        .map((part) => `${part}${part}`)
        .join("")
    : value

  const numeric = Number.parseInt(full, 16)
  const r = (numeric >> 16) & 255
  const g = (numeric >> 8) & 255
  const b = numeric & 255

  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

const ACCENT_SWATCHES: Record<Accent, AlphaSwatch> = {
  peach: {
    solid: BRAND_COLORS.peach,
    soft: withAlpha(BRAND_COLORS.peach, 0.22),
    washed: withAlpha(BRAND_COLORS.peach, 0.12),
    border: withAlpha(BRAND_COLORS.peach, 0.45),
    contrast: BRAND_COLORS.ink,
  },
  sky: {
    solid: BRAND_COLORS.sky,
    soft: withAlpha(BRAND_COLORS.sky, 0.28),
    washed: withAlpha(BRAND_COLORS.sky, 0.14),
    border: withAlpha(BRAND_COLORS.sky, 0.5),
    contrast: BRAND_COLORS.ink,
  },
  sage: {
    solid: BRAND_COLORS.sage,
    soft: withAlpha(BRAND_COLORS.sage, 0.2),
    washed: withAlpha(BRAND_COLORS.sage, 0.12),
    border: withAlpha(BRAND_COLORS.sage, 0.42),
    contrast: BRAND_COLORS.ink,
  },
  yellow: {
    solid: BRAND_COLORS.yellow,
    soft: withAlpha(BRAND_COLORS.yellow, 0.35),
    washed: withAlpha(BRAND_COLORS.yellow, 0.16),
    border: withAlpha(BRAND_COLORS.yellow, 0.48),
    contrast: BRAND_COLORS.ink,
  },
  pink: {
    solid: BRAND_COLORS.pink,
    soft: withAlpha(BRAND_COLORS.pink, 0.25),
    washed: withAlpha(BRAND_COLORS.pink, 0.14),
    border: withAlpha(BRAND_COLORS.pink, 0.45),
    contrast: BRAND_COLORS.ink,
  },
  lavender: {
    solid: BRAND_COLORS.lavender,
    soft: withAlpha(BRAND_COLORS.lavender, 0.24),
    washed: withAlpha(BRAND_COLORS.lavender, 0.13),
    border: withAlpha(BRAND_COLORS.lavender, 0.45),
    contrast: BRAND_COLORS.ink,
  },
  ink: {
    solid: BRAND_COLORS.ink,
    soft: withAlpha(BRAND_COLORS.ink, 0.9),
    washed: withAlpha(BRAND_COLORS.ink, 0.78),
    border: withAlpha(BRAND_COLORS.white, 0.16),
    contrast: BRAND_COLORS.white,
  },
}

export function getAccentTheme(accent: Accent) {
  return ACCENT_SWATCHES[accent]
}

export function getRoleLabel(role: "intern" | "full_timer" | "admin") {
  if (role === "full_timer") return "full timer"
  return role.replace("_", " ")
}

export function getRoleAccent(role: "intern" | "full_timer" | "admin"): Accent {
  if (role === "intern") return "lavender"
  if (role === "admin") return "yellow"
  return "sky"
}

export const SCREEN_ACCENTS: Record<"feedback" | "insights" | "employees" | "kudos", Accent> = {
  feedback: "peach",
  insights: "sky",
  employees: "sage",
  kudos: "yellow",
}

export const DATE_RANGE_LABELS: Record<DateRange, string> = {
  cycle: "this cycle",
  "3cycles": "last 3 cycles",
  all: "all time",
}

/**
 * Query-string values from before the cycle migration. Kept so bookmarks and
 * in-flight clients resolve to the nearest equivalent instead of silently
 * falling through to the default — a bookmark meaning "this month" quietly
 * serving three cycles is worse than an error, because nothing signals it.
 */
export const LEGACY_DATE_RANGE_ALIASES: Record<string, DateRange> = {
  month: "cycle",
  "3months": "3cycles",
}

/**
 * How an org-level reply identifies itself, everywhere it appears: the compose
 * chip on /mod, the saved reply in the timeline, and the Chat DM.
 *
 * One constant on purpose. These three surfaces previously disagreed — the DM
 * named the responder, the saved reply said "build3 foundation", and the compose
 * box said "responding as <you>", so a moderator could not tell which identity
 * they were about to speak in.
 *
 * Client-safe: MOD_EMAILS decides *who* speaks as the org and stays server-only;
 * this is only the label.
 */
export const ORG_VOICE_LABEL = "build3 mod"
export const ORG_VOICE_INITIALS = "b3"

export const FEEDBACK_TYPE_LABELS: Record<FeedbackPath, string> = {
  intern: "new recruit / intern",
  build3: "build3",
  full_timer: "full timer",
  self: "self reflection",
  adhoc: "adhoc",
}

/**
 * Peer paths where the target writes their own self-reflection, so the reviewer
 * is shown it and asked to agree or disagree before giving their own feedback.
 *
 * Interns write reflections exactly like full-timers do — buildStages() gates
 * every submitter into `self` regardless of role. Gating the *review* half on
 * "full_timer" alone meant 40 intern reflections were written and never shown
 * to a single reviewer, and 62 intern reviews were filed by someone who had the
 * reflection on file but was never offered it. One predicate, used at every
 * site, so the two lanes cannot drift apart again.
 *
 * Deliberately excludes `adhoc` (a quick interaction note, not a cycle review),
 * `build3` (target is the studio, not a person) and `self` (that IS the
 * reflection).
 */
export function pathCollectsSelfReview(path: FeedbackPath | null): boolean {
  return path === "full_timer" || path === "intern"
}

export function getFeedbackAccent(type: FeedbackPath): Accent {
  if (type === "intern") return "lavender"
  if (type === "full_timer") return "sky"
  if (type === "self") return "sage"
  if (type === "adhoc") return "pink"
  return "peach"
}

export const CONTRIBUTION_LEVEL_LABELS: Record<string, string> = {
  a: "finding their feet",
  b: "reliable support",
  c: "independent contributor",
  d: "leader",
}

export function getContributionLabel(value: string) {
  const normalized = value.toLowerCase().trim()

  // Direct key match (e.g. "a", "b", "c", "d")
  if (CONTRIBUTION_LEVEL_LABELS[normalized]) {
    return CONTRIBUTION_LEVEL_LABELS[normalized]
  }

  // Match against known labels for legacy data that stored full text
  for (const label of Object.values(CONTRIBUTION_LEVEL_LABELS)) {
    if (normalized.startsWith(label)) {
      return label
    }
  }

  // Last resort: return first two words to avoid text blobs
  const words = value.trim().split(/\s+/)
  return words.length > 2 ? words.slice(0, 2).join(" ").toLowerCase() : value
}

export const CHART_COLORS = {
  primary: BRAND_COLORS.sky,
  secondary: BRAND_COLORS.peach,
  success: BRAND_COLORS.sage,
  warning: BRAND_COLORS.peach,
  neutral: BRAND_COLORS.grey,
  danger: BRAND_COLORS.danger,
  lavender: BRAND_COLORS.lavender,
  pink: BRAND_COLORS.pink,
  yellow: BRAND_COLORS.yellow,
}

export const SURFACE_STYLE = {
  base: {
    backgroundColor: BRAND_COLORS.surface,
    borderColor: BRAND_COLORS.line,
  },
}

export function getFeedbackPathOptions() {
  return [
    { key: "intern" as const, label: "new recruit / intern", blurb: "peer notes for someone early in the build" },
    { key: "build3" as const, label: "build3", blurb: "how the studio feels, works, and can improve" },
    { key: "full_timer" as const, label: "full timer", blurb: "feedback for someone already in the thick of it" },
    { key: "self" as const, label: "self reflection", blurb: "a quick check-in with yourself" },
  ]
}

