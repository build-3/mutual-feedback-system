"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  Employee,
  FeedbackAnswer,
  FeedbackSubmission,
} from "@/lib/types"

type Tab = "build3" | "full_timer" | "intern" | "self" | "adhoc"

const TABS: { key: Tab; label: string }[] = [
  { key: "build3", label: "Build3" },
  { key: "full_timer", label: "Full Timers" },
  { key: "intern", label: "Interns" },
  { key: "self", label: "Self Reflection" },
  { key: "adhoc", label: "Adhoc" },
]

interface Row {
  submissionId: string
  submittedBy: string
  feedbackFor: string
  createdAt: string
  answers: Record<string, string>
}

export default function MutomboPage() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [submissions, setSubmissions] = useState<FeedbackSubmission[]>([])
  const [answers, setAnswers] = useState<FeedbackAnswer[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<Tab>("build3")

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/admin/dashboard", { cache: "no-store" })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(payload.error || "Failed to load data")
      setEmployees(payload.employees || [])
      setSubmissions(payload.submissions || [])
      setAnswers(payload.answers || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const empMap = useMemo(
    () => new Map(employees.map((e) => [e.id, e.name])),
    [employees]
  )

  const answersBySubmission = useMemo(() => {
    const map = new Map<string, FeedbackAnswer[]>()
    for (const a of answers) {
      if (!map.has(a.submission_id)) map.set(a.submission_id, [])
      map.get(a.submission_id)!.push(a)
    }
    return map
  }, [answers])

  const { rows, questionKeys } = useMemo(() => {
    const filtered = submissions.filter((s) => s.feedback_type === activeTab)
    const keySet = new Set<string>()
    const built: Row[] = []

    for (const sub of filtered) {
      const subAnswers = answersBySubmission.get(sub.id) || []
      const answerMap: Record<string, string> = {}
      for (const a of subAnswers) {
        answerMap[a.question_key] = a.answer_value
        keySet.add(a.question_key)
      }
      built.push({
        submissionId: sub.id,
        submittedBy: empMap.get(sub.submitted_by_id) || "Unknown",
        feedbackFor: sub.feedback_for_id
          ? empMap.get(sub.feedback_for_id) || "Unknown"
          : "—",
        createdAt: new Date(sub.created_at).toLocaleString(),
        answers: answerMap,
      })
    }

    const orderedKeys = Array.from(keySet).sort()
    return { rows: built, questionKeys: orderedKeys }
  }, [submissions, activeTab, answersBySubmission, empMap])

  if (loading) {
    return (
      <div style={{ padding: 40, fontFamily: "monospace", fontSize: 14 }}>
        Loading...
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ padding: 40, fontFamily: "monospace", fontSize: 14, color: "red" }}>
        {error}
      </div>
    )
  }

  return (
    <div style={{ padding: 20, fontFamily: "monospace", fontSize: 13, background: "#fff", minHeight: "100vh" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 16 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>
          mutombo — raw feedback data
        </h1>
        <span style={{ color: "#888", fontSize: 12 }}>
          {submissions.length} total submissions
        </span>
        <button
          onClick={loadData}
          style={{
            marginLeft: "auto",
            padding: "4px 12px",
            fontSize: 12,
            border: "1px solid #ccc",
            borderRadius: 4,
            background: "#f5f5f5",
            cursor: "pointer",
          }}
        >
          refresh
        </button>
      </div>

      <div style={{ display: "flex", gap: 0, marginBottom: 16, borderBottom: "2px solid #e5e5e5" }}>
        {TABS.map((tab) => {
          const count = submissions.filter((s) => s.feedback_type === tab.key).length
          const isActive = activeTab === tab.key
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                padding: "8px 20px",
                fontSize: 13,
                fontFamily: "monospace",
                fontWeight: isActive ? 700 : 400,
                border: "none",
                borderBottom: isActive ? "2px solid #222" : "2px solid transparent",
                background: isActive ? "#f9f9f9" : "transparent",
                cursor: "pointer",
                marginBottom: -2,
              }}
            >
              {tab.label} ({count})
            </button>
          )
        })}
      </div>

      {rows.length === 0 ? (
        <div style={{ padding: 40, color: "#888", textAlign: "center" }}>
          no {activeTab} feedback yet
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table
            style={{
              borderCollapse: "collapse",
              width: "100%",
              fontSize: 12,
              fontFamily: "monospace",
            }}
          >
            <thead>
              <tr style={{ background: "#f5f5f5" }}>
                <th style={thStyle}>#</th>
                <th style={thStyle}>submitted by</th>
                {activeTab !== "build3" && activeTab !== "self" && (
                  <th style={thStyle}>feedback for</th>
                )}
                <th style={thStyle}>date</th>
                {questionKeys.map((key) => (
                  <th key={key} style={thStyle}>
                    {key}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr
                  key={row.submissionId}
                  style={{ background: i % 2 === 0 ? "#fff" : "#fafafa" }}
                >
                  <td style={tdStyle}>{i + 1}</td>
                  <td style={tdStyle}>{row.submittedBy}</td>
                  {activeTab !== "build3" && activeTab !== "self" && (
                    <td style={tdStyle}>{row.feedbackFor}</td>
                  )}
                  <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>
                    {row.createdAt}
                  </td>
                  {questionKeys.map((key) => (
                    <td key={key} style={tdStyle}>
                      {row.answers[key] || "—"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

const thStyle: React.CSSProperties = {
  padding: "6px 10px",
  textAlign: "left",
  borderBottom: "1px solid #ddd",
  whiteSpace: "nowrap",
  fontWeight: 600,
  fontSize: 11,
  color: "#555",
  textTransform: "uppercase" as const,
  letterSpacing: "0.5px",
}

const tdStyle: React.CSSProperties = {
  padding: "5px 10px",
  borderBottom: "1px solid #eee",
  maxWidth: 300,
  overflow: "hidden",
  textOverflow: "ellipsis",
}
