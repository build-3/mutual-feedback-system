"use client"

import { useMemo, useState } from "react"
import {
  BrandPanel,
  SectionHeading,
  Modal,
  badgeClasses,
  buttonClasses,
} from "@/components/ui/brand"
import type { Employee, FeedbackSubmission, FeedbackAnswer } from "@/lib/types"
import FormattedAnswer from "@/components/FormattedAnswer"

type TypeFilter = "all" | "build3" | "full_timer" | "intern" | "self" | "adhoc"

const TYPE_TABS: { key: TypeFilter; label: string }[] = [
  { key: "all", label: "all" },
  { key: "build3", label: "build3" },
  { key: "full_timer", label: "full timer" },
  { key: "intern", label: "intern" },
  { key: "self", label: "self" },
  { key: "adhoc", label: "adhoc" },
]

export default function SubmissionBrowser({
  submissions,
  answers,
  employees,
  onDelete,
}: {
  submissions: FeedbackSubmission[]
  answers: FeedbackAnswer[]
  employees: Employee[]
  onDelete: (ids: string[]) => Promise<void>
}) {
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all")
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const empMap = useMemo(
    () => new Map(employees.map((e) => [e.id, e.name])),
    [employees]
  )

  const answersBySubmission = useMemo(() => {
    const map = new Map<string, FeedbackAnswer[]>()
    for (const a of answers) {
      const list = map.get(a.submission_id)
      if (list) list.push(a)
      else map.set(a.submission_id, [a])
    }
    return map
  }, [answers])

  const filtered = useMemo(
    () =>
      typeFilter === "all"
        ? submissions
        : submissions.filter((s) => s.feedback_type === typeFilter),
    [submissions, typeFilter]
  )

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    if (selected.size === filtered.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(filtered.map((s) => s.id)))
    }
  }

  async function handleDelete() {
    setDeleting(true)
    await onDelete(Array.from(selected))
    setSelected(new Set())
    setConfirmDelete(false)
    setDeleting(false)
  }

  return (
    <div className="space-y-6">
      <SectionHeading
        accent="yellow"
        eyebrow="data"
        title="submission browser"
        action={
          selected.size > 0 ? (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              {...buttonClasses({ accent: "ink", variant: "solid", size: "sm" })}
            >
              delete {selected.size} selected
            </button>
          ) : undefined
        }
      />

      {/* Type filter tabs */}
      <div className="flex flex-wrap gap-2">
        {TYPE_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => { setTypeFilter(tab.key); setSelected(new Set()) }}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-all ${
              typeFilter === tab.key
                ? "border-ink bg-ink text-white"
                : "border-line bg-white text-muted hover:border-ink/20"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <BrandPanel accent="yellow" tone="plain" className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-[11px] font-semibold tracking-[0.08em] text-muted">
                <th className="px-3 py-3 w-10">
                  <input
                    type="checkbox"
                    checked={selected.size === filtered.length && filtered.length > 0}
                    onChange={toggleAll}
                    className="rounded"
                  />
                </th>
                <th className="px-3 py-3">from</th>
                <th className="px-3 py-3">to</th>
                <th className="px-3 py-3 hidden sm:table-cell">type</th>
                <th className="px-3 py-3 text-center hidden sm:table-cell">answers</th>
                <th className="px-3 py-3 hidden sm:table-cell">status</th>
                <th className="px-3 py-3">date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/50">
              {filtered.map((sub) => {
                const isExpanded = expanded.has(sub.id)
                const subAnswers = answersBySubmission.get(sub.id) ?? []
                const typeBadge = badgeClasses({ accent: "yellow", tone: "outline" })
                const statusBadge = sub.notified_at
                  ? badgeClasses({ accent: "sage", tone: "soft" })
                  : sub.feedback_for_id
                  ? badgeClasses({ accent: "yellow", tone: "soft" })
                  : badgeClasses({ accent: "ink", tone: "outline" })

                return (
                  <tr key={sub.id} className="group">
                    <td className="px-3 py-3 align-top">
                      <input
                        type="checkbox"
                        checked={selected.has(sub.id)}
                        onChange={() => toggleSelect(sub.id)}
                        className="rounded"
                      />
                    </td>
                    <td
                      className="px-3 py-3 font-medium text-ink cursor-pointer align-top"
                      onClick={() => toggleExpand(sub.id)}
                    >
                      <div>{empMap.get(sub.submitted_by_id) ?? "unknown"}</div>
                      {isExpanded && (
                        <div className="mt-3 space-y-2 font-normal">
                          {subAnswers.map((a) => (
                            <div key={a.id} className="rounded-xl bg-stone-50 p-3 text-xs">
                              <div className="font-semibold text-muted mb-1">
                                {a.question_text}
                              </div>
                              <div className="text-ink">
                                <FormattedAnswer questionKey={a.question_key} value={a.answer_value} />
                              </div>
                            </div>
                          ))}
                          {subAnswers.length === 0 && (
                            <div className="text-xs text-muted">no answers</div>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-3 text-ink align-top">
                      {sub.feedback_for_id
                        ? empMap.get(sub.feedback_for_id) ?? "unknown"
                        : "-"}
                    </td>
                    <td className="px-3 py-3 hidden sm:table-cell align-top">
                      <span className={typeBadge.className} style={typeBadge.style}>
                        {sub.feedback_type.replace("_", " ")}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-center tabular-nums hidden sm:table-cell align-top">
                      {subAnswers.length}
                    </td>
                    <td className="px-3 py-3 hidden sm:table-cell align-top">
                      <span className={statusBadge.className} style={statusBadge.style}>
                        {sub.notified_at ? "notified" : sub.feedback_for_id ? "pending" : "n/a"}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-xs text-muted whitespace-nowrap align-top">
                      {new Date(sub.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && (
          <div className="p-8 text-center text-sm text-muted">
            no submissions found.
          </div>
        )}
      </BrandPanel>

      <Modal
        open={confirmDelete}
        title="delete submissions"
        description={`This will permanently remove ${selected.size} submission(s) and all their answers and responses. This cannot be undone.`}
        accent="peach"
        onClose={() => setConfirmDelete(false)}
      >
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => setConfirmDelete(false)}
            {...buttonClasses({ accent: "yellow", variant: "ghost", size: "sm" })}
          >
            cancel
          </button>
          <button
            type="button"
            disabled={deleting}
            onClick={handleDelete}
            {...buttonClasses({ accent: "ink", variant: "solid", size: "sm" })}
          >
            {deleting ? "deleting..." : `delete ${selected.size}`}
          </button>
        </div>
      </Modal>
    </div>
  )
}
