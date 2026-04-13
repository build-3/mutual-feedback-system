"use client"

import { SELF_REVIEW_KEYS } from "@/lib/questions"
import {
  BrandPanel,
  SectionHeading,
  fieldClasses,
} from "@/components/ui/brand"
import { SCREEN_ACCENTS } from "@/lib/brand"
import FormattedAnswer from "@/components/FormattedAnswer"

const feedbackAccent = SCREEN_ACCENTS.feedback

type SelfAnswer = {
  question_key: string
  question_text: string
  answer_value: string
}

interface SelfReviewStepProps {
  feedbackForName: string
  answers: SelfAnswer[]
  reviewAnswers: Record<string, string>
  onReviewChange: (key: string, value: string) => void
}

const AGREEMENT_OPTIONS = [
  { key: "agree", label: "agree" },
  { key: "somewhat_agree", label: "somewhat agree" },
  { key: "disagree", label: "disagree" },
] as const

export default function SelfReviewStep({
  feedbackForName,
  answers,
  reviewAnswers,
  onReviewChange,
}: SelfReviewStepProps) {
  // Only show answers that match the known self-review keys, in order
  const orderedAnswers = SELF_REVIEW_KEYS
    .map((key) => answers.find((a) => a.question_key === key))
    .filter((a): a is SelfAnswer => a != null)

  const firstName = feedbackForName.split(" ")[0].toLowerCase()

  return (
    <BrandPanel accent={feedbackAccent} tone="plain" className="p-6 sm:p-8">
      <SectionHeading
        accent={feedbackAccent}
        eyebrow="peer review"
        title={`what are your views on ${firstName}'s self-reflection?`}
        description="read through their answers and share whether you agree. be honest — it helps everyone grow."
      />

      <div className="mt-8 space-y-8">
        {orderedAnswers.map((selfAnswer) => {
          const agreementKey = `review_${selfAnswer.question_key}_agreement`

          return (
            <div key={selfAnswer.question_key} className="space-y-4">
              {/* The self-reflection question + answer */}
              <div className="rounded-[20px] border border-line/60 bg-brand-peach/[0.06] px-5 py-4">
                <div className="text-xs font-semibold tracking-[0.08em] text-muted mb-2">
                  {selfAnswer.question_text}
                </div>
                <div className="text-sm leading-relaxed text-ink">
                  <FormattedAnswer questionKey={selfAnswer.question_key} value={selfAnswer.answer_value} />
                </div>
              </div>

              {/* Agreement radio buttons */}
              <div className="flex flex-wrap gap-2">
                {AGREEMENT_OPTIONS.map((option) => {
                  const active = reviewAnswers[agreementKey] === option.key
                  return (
                    <button
                      key={option.key}
                      type="button"
                      onClick={() => onReviewChange(agreementKey, option.key)}
                      className={[
                        "rounded-full border px-4 py-2 text-sm font-medium transition-all",
                        active
                          ? "border-brand-peach bg-brand-peach text-ink shadow-brand"
                          : "border-line bg-white text-muted hover:border-black/15 hover:text-ink",
                      ].join(" ")}
                    >
                      {option.label}
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}

        {/* Single comment box for the entire review */}
        <div className="space-y-2">
          <div className="text-xs font-semibold tracking-[0.08em] text-muted">
            anything to add?
          </div>
          <textarea
            value={reviewAnswers["review_overall_comment"] || ""}
            onChange={(e) => onReviewChange("review_overall_comment", e.target.value)}
            rows={3}
            className={fieldClasses({ size: "lg" })}
            placeholder={`e.g. "I've seen ${firstName} step up on X lately — the self-reflection tracks with what I've observed."`}
          />
        </div>
      </div>
    </BrandPanel>
  )
}

/** Sidebar panel showing the target's self-feedback as a reference card */
export function SelfReviewSidebar({
  feedbackForName,
  answers,
}: {
  feedbackForName: string
  answers: SelfAnswer[]
}) {
  const orderedAnswers = SELF_REVIEW_KEYS
    .map((key) => answers.find((a) => a.question_key === key))
    .filter((a): a is SelfAnswer => a != null)

  const firstName = feedbackForName.split(" ")[0].toLowerCase()

  return (
    <BrandPanel accent={feedbackAccent} tone="soft" className="brand-lines p-6 max-h-[70vh] overflow-y-auto">
      <div className="text-xs font-semibold tracking-[0.08em] text-muted">
        {firstName}&apos;s self-reflection
      </div>
      <div className="mt-4 space-y-5">
        {orderedAnswers.map((a) => (
          <div key={a.question_key}>
            <div className="text-xs font-semibold tracking-[0.06em] text-muted mb-1">
              {a.question_text}
            </div>
            <div className="text-sm leading-relaxed text-ink">
              <FormattedAnswer questionKey={a.question_key} value={a.answer_value} />
            </div>
          </div>
        ))}
      </div>
    </BrandPanel>
  )
}
