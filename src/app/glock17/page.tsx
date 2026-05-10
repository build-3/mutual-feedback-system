"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import dynamic from "next/dynamic"
import { SectionHeading } from "@/components/ui/brand"
import type {
  Employee,
  FeedbackSubmission,
  FeedbackAnswer,
  FeedbackResponse,
} from "@/lib/types"

const AdminOverview = dynamic(() => import("@/components/admin/AdminOverview"), { ssr: false })
const ActivityFeed = dynamic(() => import("@/components/admin/ActivityFeed"), { ssr: false })
const EmployeeTable = dynamic(() => import("@/components/admin/EmployeeTable"), { ssr: false })
const SubmissionBrowser = dynamic(() => import("@/components/admin/SubmissionBrowser"), { ssr: false })
const DangerZone = dynamic(() => import("@/components/admin/DangerZone"), { ssr: false })
const UsageDashboard = dynamic(() => import("@/components/admin/UsageDashboard"), { ssr: false })
const ChatSettings = dynamic(() => import("@/components/admin/ChatSettings"), { ssr: false })
const BirthdayWisher = dynamic(() => import("@/components/admin/BirthdayWisher"), { ssr: false })
const ProbationDashboard = dynamic(() => import("@/components/admin/ProbationDashboard"), { ssr: false })

type Tab = "overview" | "activity" | "employees" | "submissions" | "probation" | "usage" | "birthdays" | "danger"

const TABS: { key: Tab; label: string }[] = [
  { key: "overview", label: "overview" },
  { key: "activity", label: "activity" },
  { key: "employees", label: "employees" },
  { key: "submissions", label: "submissions" },
  { key: "probation", label: "probation" },
  { key: "usage", label: "usage" },
  { key: "birthdays", label: "birthdays 🎂" },
  { key: "danger", label: "danger zone" },
]

export default function Glock17Page() {
  const [tab, setTab] = useState<Tab>(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search)
      const t = params.get("tab")
      if (t && TABS.some((tb) => tb.key === t)) return t as Tab
    }
    return "overview"
  })
  const [employees, setEmployees] = useState<Employee[]>([])
  const [submissions, setSubmissions] = useState<FeedbackSubmission[]>([])
  const [answers, setAnswers] = useState<FeedbackAnswer[]>([])
  const [responses, setResponses] = useState<FeedbackResponse[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  const loadData = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/dashboard", { cache: "no-store" })

      if (!res.ok) {
        throw new Error("failed to load data")
      }

      const dash = await res.json()

      setEmployees(dash.employees ?? [])
      setSubmissions(dash.submissions ?? [])
      setAnswers(dash.answers ?? [])
      setResponses(dash.responses ?? [])
      setError("")
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to load")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const empMap = useMemo(
    () => new Map(employees.map((e) => [e.id, e.name])),
    [employees]
  )

  async function handleAddEmployee(name: string, role: "intern" | "full_timer", email: string) {
    const res = await fetch("/api/admin/employees", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, role, email: email || undefined }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.error ?? "failed to add employee")
    }
    await loadData()
  }

  async function handleDeleteEmployee(id: string): Promise<string | null> {
    const res = await fetch("/api/admin/employees", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      return data.error ?? "failed to delete"
    }
    await loadData()
    return null
  }

  async function handleUpdateEmployee(
    id: string,
    updates: { role?: string; name?: string; email?: string }
  ): Promise<string | null> {
    const res = await fetch("/api/admin/employees", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...updates }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      return data.error ?? "failed to update"
    }
    await loadData()
    return null
  }

  async function handleDeleteSubmissions(ids: string[]) {
    const res = await fetch("/api/admin/submissions", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ submissionIds: ids }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.error ?? "failed to delete")
    }
    await loadData()
  }

  async function handleClearFeedback() {
    const res = await fetch("/api/admin/clear", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scope: "feedback" }),
    })
    if (!res.ok) throw new Error("failed to clear feedback")
    await loadData()
  }

  async function handleClearAll() {
    const res = await fetch("/api/admin/clear", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scope: "all" }),
    })
    if (!res.ok) throw new Error("failed to clear")
    await loadData()
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#fffaf5] flex items-center justify-center">
        <div className="animate-pulse text-muted text-sm">loading control room...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#fffaf5] flex items-center justify-center">
        <div className="text-[#d35b52] text-sm">{error}</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#fffaf5]">
      {/* Header */}
      <div className="mx-auto max-w-5xl px-4 pt-8 sm:px-6">
        <div className="flex items-center justify-between mb-6">
          <Link
            href="/feedback"
            className="text-xs text-muted hover:text-ink transition-colors"
          >
            &larr; back to app
          </Link>
          <span className="text-[10px] font-mono text-muted/50">glock17</span>
        </div>

        <SectionHeading
          accent="yellow"
          eyebrow="admin"
          title="the control room"
          description={`${employees.length} employees, ${submissions.length} submissions loaded.`}
        />

        {/* Tab bar */}
        <div className="mt-6 flex flex-wrap gap-2 border-b border-line pb-4">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`rounded-full border px-4 py-2 text-sm font-semibold transition-all ${
                tab === t.key
                  ? t.key === "danger"
                    ? "border-[#d35b52] bg-[#d35b52] text-white"
                    : "border-ink bg-ink text-white"
                  : t.key === "danger"
                  ? "border-line bg-white text-[#d35b52] hover:border-[#d35b52]/30"
                  : "border-line bg-white text-muted hover:border-ink/20"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        {tab === "overview" && (
          <div className="space-y-6">
            <ChatSettings />
            <AdminOverview
              employees={employees}
              submissions={submissions}
              answers={answers}
              responses={responses}
            />
          </div>
        )}
        {tab === "activity" && (
          <ActivityFeed submissions={submissions} employees={employees} />
        )}
        {tab === "employees" && (
          <EmployeeTable
            employees={employees}
            submissions={submissions}
            onAdd={handleAddEmployee}
            onDelete={handleDeleteEmployee}
            onUpdate={handleUpdateEmployee}
          />
        )}
        {tab === "submissions" && (
          <SubmissionBrowser
            submissions={submissions}
            answers={answers}
            employees={employees}
            onDelete={handleDeleteSubmissions}
          />
        )}
        {tab === "probation" && <ProbationDashboard />}
        {tab === "usage" && (
          <UsageDashboard
            submissionCount={submissions.length}
            employeeCount={employees.length}
          />
        )}
        {tab === "birthdays" && (
          <BirthdayWisher employees={employees} />
        )}
        {tab === "danger" && (
          <DangerZone
            employees={employees}
            submissions={submissions}
            answers={answers}
            responses={responses}
            empMap={empMap}
            onClearFeedback={handleClearFeedback}
            onClearAll={handleClearAll}
          />
        )}
      </div>
    </div>
  )
}
