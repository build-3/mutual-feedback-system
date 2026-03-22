"use client"

import { formatDistanceToNow } from "date-fns"
import { Employee } from "@/lib/types"
import { getAvatarColor, getInitials } from "@/lib/insights-helpers"
import { getRoleAccent, getRoleLabel } from "@/lib/brand"
import { BrandPanel, Eyebrow, StatPill } from "@/components/ui/brand"

interface Props {
  employee: Employee
  receivedCount: number
  givenCount: number
  selfCount: number
  lastFeedbackDate: string | null
  orgAvgMetrics?: Record<string, number>
}

export default function ProfileHeader({
  employee,
  receivedCount,
  givenCount,
  selfCount,
  lastFeedbackDate,
}: Props) {
  const roleAccent = getRoleAccent(employee.role)
  const lastSeen = lastFeedbackDate
    ? formatDistanceToNow(new Date(lastFeedbackDate), { addSuffix: true })
    : "not yet"

  return (
    <BrandPanel accent="sky" tone="plain" className="brand-lines p-6 sm:p-8">
      <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
        <div className="flex items-center gap-4">
          <div
            className="flex h-20 w-20 flex-shrink-0 items-center justify-center rounded-full text-2xl font-bold text-white shadow-brand"
            style={{ backgroundColor: getAvatarColor(employee.name) }}
          >
            {getInitials(employee.name)}
          </div>

          <div className="space-y-2">
            <Eyebrow accent="sky">profile</Eyebrow>
            <h1 className="text-3xl font-bold tracking-[-0.06em] text-ink">
              {employee.name}
            </h1>
            <span
              className="inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold"
              style={{
                backgroundColor:
                  roleAccent === "lavender"
                    ? "rgba(188, 173, 204, 0.24)"
                    : "rgba(198, 229, 248, 0.26)",
                borderColor:
                  roleAccent === "lavender"
                    ? "rgba(188, 173, 204, 0.48)"
                    : "rgba(198, 229, 248, 0.52)",
              }}
            >
              {getRoleLabel(employee.role)}
            </span>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatPill
            accent="sky"
            label="received"
            value={receivedCount}
            detail="peer notes in this range"
          />
          <StatPill
            accent="peach"
            label="given"
            value={givenCount}
            detail="feedback shared with others"
          />
          <StatPill
            accent="sage"
            label="self"
            value={selfCount}
            detail="self reflections logged"
          />
          <StatPill
            accent="lavender"
            label="last activity"
            value={lastSeen}
            detail="most recent feedback touchpoint"
          />
        </div>
      </div>
    </BrandPanel>
  )
}
