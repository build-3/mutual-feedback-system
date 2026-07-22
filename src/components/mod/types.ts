import { BRAND_COLORS } from "@/lib/brand"

export interface ModReview {
  id: string
  department: string
  employee_name: string | null
  period: string | null
  topic: string | null
  review: string | null
  severity: number | null
}

export interface ModResponse {
  id: string
  employee_name: string | null
  policy_clarity: string | null
  tools_resources: string | null
  trust_battery: number | null
  trust_battery_details: string | null
  nps_score: number | null
  comments: string | null
  source_row: number | null
}

export interface ModData {
  reviews: ModReview[]
  responses: ModResponse[]
}

// Severity runs 1 (low) → 5 (critical), matching the sheet's Summary column.
export function severityMeta(sev: number | null | undefined): { label: string; color: string } {
  if (sev == null) return { label: "n/a", color: BRAND_COLORS.grey }
  if (sev >= 4.5) return { label: "critical", color: BRAND_COLORS.danger }
  if (sev >= 3.5) return { label: "high", color: BRAND_COLORS.peach }
  if (sev >= 2.5) return { label: "moderate", color: BRAND_COLORS.yellow }
  return { label: "low", color: BRAND_COLORS.sage }
}

export function trustColor(pct: number | null | undefined): string {
  if (pct == null) return BRAND_COLORS.grey
  if (pct >= 85) return BRAND_COLORS.sage
  if (pct >= 70) return BRAND_COLORS.yellow
  if (pct >= 50) return BRAND_COLORS.peach
  return BRAND_COLORS.danger
}
