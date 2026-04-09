"use client"

import { formatDate } from "@/lib/date-utils"
import { BrandPanel, Eyebrow, StatPill } from "@/components/ui/brand"

interface GivenFeedbackItem {
  employeeId: string | null
  employeeName: string
  date: string
  submissionId: string
}

interface Props {
  givenFeedbackSummary: GivenFeedbackItem[]
  totalTeamSize: number
}

export default function FeedbackGivenPanel({
  givenFeedbackSummary,
  totalTeamSize,
}: Props) {
  if (givenFeedbackSummary.length === 0) return null

  const uniqueRecipients = new Set(
    givenFeedbackSummary.map((item) => item.employeeId ?? item.submissionId)
  ).size

  return (
    <div className="space-y-4">
      <Eyebrow accent="peach">feedback shared</Eyebrow>

      <BrandPanel accent="peach" tone="soft" className="brand-lines p-4 sm:p-6">
        <div className="grid gap-3 sm:gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
          <StatPill
            accent="peach"
            label="reach"
            value={`${uniqueRecipients} / ${totalTeamSize}`}
            detail="team members received feedback"
          />

          <ul className="space-y-3">
            {givenFeedbackSummary.map((item) => (
              <li
                key={item.submissionId}
                className="flex flex-wrap items-center justify-between gap-2 rounded-[20px] border border-line bg-black/[0.02] px-4 py-3"
              >
                <span className="text-sm text-ink">
                  shared feedback with{" "}
                  <span className="font-semibold">{item.employeeName}</span>
                </span>
                <span className="text-xs tracking-[0.08em] text-muted">
                  {formatDate(new Date(item.date), "MMM d, yyyy")}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </BrandPanel>
    </div>
  )
}
