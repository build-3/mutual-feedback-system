"use client"

import { useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { formatDate, timeAgo } from "@/lib/date-utils"
import { SubmissionWithDetails } from "@/app/insights/types"
import { QUESTION_LABELS } from "@/lib/insights-helpers"
import { BrandPanel, Eyebrow } from "@/components/ui/brand"
import FormattedAnswer from "@/components/FormattedAnswer"

interface Props {
  submissions: SubmissionWithDetails[]
}

function SelfNoteItem({ submission }: { submission: SubmissionWithDetails }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <BrandPanel accent="sage" tone="washed" className="brand-lines overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-3 px-4 py-3 sm:px-5 sm:py-4 text-left"
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-brand-sage/45 bg-brand-sage/20 px-2.5 py-1 text-[11px] font-semibold tracking-[0.08em] text-ink">
              self note
            </span>
            <span className="text-xs tracking-[0.08em] text-muted">
              {submission.submitterName}
            </span>
          </div>
          <div className="mt-1 text-xs tracking-[0.08em] text-muted">
            {timeAgo(new Date(submission.submission.created_at))}{" "}
            · {formatDate(new Date(submission.submission.created_at), "MMM d, yyyy")}
          </div>
        </div>
        <span className="shrink-0 text-xs font-semibold tracking-[0.08em] text-muted">
          {expanded ? "hide details" : "see details"}
        </span>
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22 }}
            className="overflow-hidden border-t border-line"
          >
            <div className="grid gap-3 px-4 py-4 sm:px-5 sm:py-5">
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
                  <div className="mt-2 text-sm leading-7 text-ink">
                    <FormattedAnswer questionKey={answer.question_key} value={answer.answer_value} />
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </BrandPanel>
  )
}

export default function SelfReflectionsPanel({ submissions }: Props) {
  if (submissions.length === 0) return null

  return (
    <div className="space-y-4">
      <Eyebrow accent="sage">self reflections</Eyebrow>

      <div className="space-y-3">
        {submissions.map((submission) => (
          <SelfNoteItem key={submission.submission.id} submission={submission} />
        ))}
      </div>
    </div>
  )
}
