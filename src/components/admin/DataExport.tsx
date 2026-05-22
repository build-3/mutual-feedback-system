"use client"

import { useState } from "react"
import {
  BrandPanel,
  SectionHeading,
  buttonClasses,
} from "@/components/ui/brand"
import { VALUES_WITH_TEXT_KEYS, formatValuesWithText } from "@/lib/insights-helpers"
import { BUILD3_VALUES } from "@/lib/questions"
import type { Employee, FeedbackSubmission, FeedbackAnswer, FeedbackResponse } from "@/lib/types"

export default function DataExport({
  employees,
  submissions,
  answers,
  responses,
  empMap,
}: {
  employees: Employee[]
  submissions: FeedbackSubmission[]
  answers: FeedbackAnswer[]
  responses: FeedbackResponse[]
  empMap: Map<string, string>
}) {
  const [exporting, setExporting] = useState(false)
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
        "Session ID": s.session_id ?? "",
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
          Answer: VALUES_WITH_TEXT_KEYS.has(a.question_key)
            ? formatValuesWithText(a.answer_value, BUILD3_VALUES)
            : a.answer_value,
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

      // Sheet 5: Probation
      const probRes = await fetch("/api/admin/probation", { cache: "no-store" })
      if (probRes.ok) {
        const probData = await probRes.json()
        const probRows = (probData.probations ?? []).map((p: {
          employee_name: string
          start_date: string
          end_date: string
          status: string
          duration_months: number
          signal: string | null
        }) => ({
          Name: p.employee_name,
          "Start Date": new Date(p.start_date).toLocaleDateString(),
          "End Date": new Date(p.end_date).toLocaleDateString(),
          Status: p.status,
          "Duration (months)": p.duration_months,
          Signal: p.signal ?? "",
        }))
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(probRows), "Probation")
      }

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

  return (
    <div className="space-y-6">
      <SectionHeading accent="yellow" eyebrow="export" title="download all data" />
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
        <div className="mt-3 text-[11px] text-muted">
          includes 5 sheets: employees, submissions, answers, responses, probation
        </div>
      </BrandPanel>

      {message && (
        <div className="text-center text-sm font-medium text-muted">{message}</div>
      )}
    </div>
  )
}
