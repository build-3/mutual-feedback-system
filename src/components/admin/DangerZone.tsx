"use client"

import { useState } from "react"
import {
  BrandPanel,
  SectionHeading,
  buttonClasses,
  fieldClasses,
} from "@/components/ui/brand"
import { BRAND_COLORS } from "@/lib/brand"
import type { Employee, FeedbackSubmission, FeedbackAnswer, FeedbackResponse } from "@/lib/types"

export default function DangerZone({
  employees,
  submissions,
  answers,
  responses,
  empMap,
  onClearFeedback,
  onClearAll,
}: {
  employees: Employee[]
  submissions: FeedbackSubmission[]
  answers: FeedbackAnswer[]
  responses: FeedbackResponse[]
  empMap: Map<string, string>
  onClearFeedback: () => Promise<void>
  onClearAll: () => Promise<void>
}) {
  const [exporting, setExporting] = useState(false)
  const [confirmFeedback, setConfirmFeedback] = useState("")
  const [confirmAll, setConfirmAll] = useState("")
  const [clearing, setClearing] = useState(false)
  const [message, setMessage] = useState("")

  async function handleExport() {
    setExporting(true)
    setMessage("")
    try {
      const XLSX = await import("xlsx")
      const wb = XLSX.utils.book_new()

      // Sheet 1: Employees
      const empRows = employees.map((e) => ({
        Name: e.name,
        Role: e.role.replace("_", " "),
        Email: e.email ?? "",
        "Date Added": new Date(e.created_at).toLocaleDateString(),
      }))
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(empRows), "Employees")

      // Sheet 2: Submissions
      const subRows = submissions.map((s) => ({
        "Submitted By": empMap.get(s.submitted_by_id) ?? s.submitted_by_id,
        "Feedback For": s.feedback_for_id
          ? empMap.get(s.feedback_for_id) ?? s.feedback_for_id
          : "",
        Type: s.feedback_type.replace("_", " "),
        "Notified": s.notified_at ? "Yes" : "No",
        Date: new Date(s.created_at).toLocaleDateString(),
        "Submission ID": s.id,
      }))
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(subRows), "Submissions")

      // Sheet 3: Answers
      const subMap = new Map(submissions.map((s) => [s.id, s]))
      const ansRows = answers.map((a) => {
        const sub = subMap.get(a.submission_id)
        return {
          "Submitted By": sub ? empMap.get(sub.submitted_by_id) ?? "" : "",
          "Feedback For": sub?.feedback_for_id
            ? empMap.get(sub.feedback_for_id) ?? ""
            : "",
          Question: a.question_text,
          "Question Key": a.question_key,
          Answer: a.answer_value,
          Date: new Date(a.created_at).toLocaleDateString(),
        }
      })
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(ansRows), "Answers")

      // Sheet 4: Responses
      const resRows = responses.map((r) => ({
        "Responder": empMap.get(r.responder_id) ?? r.responder_id,
        "Response": r.response_text,
        Date: new Date(r.created_at).toLocaleDateString(),
        "Answer ID": r.answer_id,
      }))
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resRows), "Responses")

      const date = new Date().toISOString().split("T")[0]
      XLSX.writeFile(wb, `build3-feedback-${date}.xlsx`)
      setMessage("exported successfully.")
    } catch (err) {
      console.error("Export failed:", err)
      setMessage("export failed. check console.")
    } finally {
      setExporting(false)
    }
  }

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
      {/* Export section */}
      <SectionHeading accent="yellow" eyebrow="export" title="download data" />
      <BrandPanel accent="yellow" tone="soft" className="p-5">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium text-ink">export to excel</div>
            <div className="text-xs text-muted mt-1">
              {employees.length} employees, {submissions.length} submissions,{" "}
              {answers.length} answers, {responses.length} responses
            </div>
          </div>
          <button
            type="button"
            disabled={exporting}
            onClick={handleExport}
            {...buttonClasses({ accent: "yellow", variant: "solid", size: "sm" })}
          >
            {exporting ? "exporting..." : "download .xlsx"}
          </button>
        </div>
      </BrandPanel>

      {/* Danger zone */}
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
