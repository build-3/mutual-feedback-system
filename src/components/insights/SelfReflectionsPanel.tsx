"use client"

import { formatDate } from "@/lib/date-utils"
import { SubmissionWithDetails } from "@/app/insights/types"
import { QUESTION_LABELS } from "@/lib/insights-helpers"
import { BrandPanel, Eyebrow } from "@/components/ui/brand"

interface Props {
  submissions: SubmissionWithDetails[]
}

export default function SelfReflectionsPanel({ submissions }: Props) {
  if (submissions.length === 0) return null

  return (
    <div className="space-y-4">
      <Eyebrow accent="sage">self reflections</Eyebrow>

      <div className="space-y-4">
        {submissions.map((submission) => (
          <BrandPanel
            key={submission.submission.id}
            accent="sage"
            tone="washed"
            className="brand-lines p-4 sm:p-6"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-brand-sage/45 bg-brand-sage/20 px-2.5 py-1 text-[11px] font-semibold tracking-[0.08em] text-ink">
                self note
              </span>
              <span className="text-xs tracking-[0.08em] text-muted">
                {formatDate(new Date(submission.submission.created_at), "MMM d, yyyy")}
              </span>
            </div>

            <div className="mt-5 grid gap-3">
              {submission.answers.map((answer) => (
                <div
                  key={answer.id}
                  className="rounded-[20px] border border-line bg-white/80 p-4"
                >
                  <div className="text-[11px] font-semibold tracking-[0.08em] text-muted">
                    {QUESTION_LABELS[answer.question_key] ||
                      answer.question_text ||
                      answer.question_key}
                  </div>
                  <div className="mt-2 whitespace-pre-wrap text-sm leading-7 text-ink">
                    {answer.answer_value}
                  </div>
                </div>
              ))}
            </div>
          </BrandPanel>
        ))}
      </div>
    </div>
  )
}
