"use client"

import { useState } from "react"
import {
  BrandPanel,
  SectionHeading,
  buttonClasses,
  fieldClasses,
} from "@/components/ui/brand"
import { BRAND_COLORS } from "@/lib/brand"
import type { FeedbackSubmission, FeedbackAnswer, FeedbackResponse } from "@/lib/types"

export default function DangerZone({
  employees,
  submissions,
  answers,
  responses,
  onClearFeedback,
  onClearAll,
}: {
  employees: { length: number }
  submissions: FeedbackSubmission[]
  answers: FeedbackAnswer[]
  responses: FeedbackResponse[]
  onClearFeedback: () => Promise<void>
  onClearAll: () => Promise<void>
}) {
  const [confirmFeedback, setConfirmFeedback] = useState("")
  const [confirmAll, setConfirmAll] = useState("")
  const [clearing, setClearing] = useState(false)
  const [message, setMessage] = useState("")

  async function handleClearFeedback() {
    setClearing(true)
    setMessage("")
    try {
      await onClearFeedback()
      setConfirmFeedback("")
      setMessage("all feedback data cleared.")
    } catch {
      setMessage("clear failed.")
    } finally {
      setClearing(false)
    }
  }

  async function handleClearAll() {
    setClearing(true)
    setMessage("")
    try {
      await onClearAll()
      setConfirmAll("")
      setMessage("everything cleared.")
    } catch {
      setMessage("clear failed.")
    } finally {
      setClearing(false)
    }
  }

  return (
    <div className="space-y-6">
      <SectionHeading accent="peach" eyebrow="danger zone" title="destructive actions" />

      <BrandPanel
        accent="peach"
        tone="washed"
        className="p-5 space-y-6"
        style={{ borderColor: BRAND_COLORS.danger }}
      >
        {/* Clear feedback */}
        <div className="space-y-3">
          <div>
            <div className="text-sm font-semibold text-ink">clear all feedback</div>
            <div className="text-xs text-muted mt-1">
              removes {submissions.length} submissions, {answers.length} answers, and{" "}
              {responses.length} responses. employees are kept.
            </div>
          </div>
          <div className="flex items-end gap-3">
            <div className="flex-1 max-w-[200px]">
              <input
                value={confirmFeedback}
                onChange={(e) => setConfirmFeedback(e.target.value)}
                className={fieldClasses({ size: "sm" })}
                placeholder='type "DELETE" to confirm'
              />
            </div>
            <button
              type="button"
              disabled={confirmFeedback !== "DELETE" || clearing}
              onClick={handleClearFeedback}
              {...buttonClasses({ accent: "ink", variant: "solid", size: "sm" })}
            >
              {clearing ? "clearing..." : "clear feedback"}
            </button>
          </div>
        </div>

        <div className="border-t border-line" />

        {/* Clear everything */}
        <div className="space-y-3">
          <div>
            <div className="text-sm font-semibold text-ink">clear everything</div>
            <div className="text-xs text-muted mt-1">
              removes all feedback data AND {employees.length} employees. complete reset.
            </div>
          </div>
          <div className="flex items-end gap-3">
            <div className="flex-1 max-w-[200px]">
              <input
                value={confirmAll}
                onChange={(e) => setConfirmAll(e.target.value)}
                className={fieldClasses({ size: "sm" })}
                placeholder='type "DELETE" to confirm'
              />
            </div>
            <button
              type="button"
              disabled={confirmAll !== "DELETE" || clearing}
              onClick={handleClearAll}
              {...buttonClasses({ accent: "ink", variant: "solid", size: "sm" })}
            >
              {clearing ? "clearing..." : "clear everything"}
            </button>
          </div>
        </div>
      </BrandPanel>

      {message && (
        <div className="text-center text-sm font-medium text-muted">{message}</div>
      )}
    </div>
  )
}
