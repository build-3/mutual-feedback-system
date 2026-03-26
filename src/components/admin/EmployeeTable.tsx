"use client"

import { useMemo, useState } from "react"
import {
  BrandPanel,
  SectionHeading,
  Modal,
  badgeClasses,
  buttonClasses,
  fieldClasses,
} from "@/components/ui/brand"
import { getRoleAccent, getRoleLabel } from "@/lib/brand"
import type { Employee, FeedbackSubmission } from "@/lib/types"

export default function EmployeeTable({
  employees,
  submissions,
  onAdd,
  onDelete,
}: {
  employees: Employee[]
  submissions: FeedbackSubmission[]
  onAdd: (name: string, role: "intern" | "full_timer", email: string) => Promise<void>
  onDelete: (id: string) => Promise<string | null>
}) {
  const [name, setName] = useState("")
  const [role, setRole] = useState<"intern" | "full_timer">("full_timer")
  const [email, setEmail] = useState("")
  const [adding, setAdding] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Employee | null>(null)
  const [deleteError, setDeleteError] = useState("")
  const [deleting, setDeleting] = useState(false)
  const [formError, setFormError] = useState("")

  const counts = useMemo(() => {
    const given = new Map<string, number>()
    const received = new Map<string, number>()
    for (const s of submissions) {
      given.set(s.submitted_by_id, (given.get(s.submitted_by_id) ?? 0) + 1)
      if (s.feedback_for_id) {
        received.set(s.feedback_for_id, (received.get(s.feedback_for_id) ?? 0) + 1)
      }
    }
    return { given, received }
  }, [submissions])

  async function handleAdd() {
    const trimmed = name.trim()
    if (!trimmed) { setFormError("name is required"); return }
    setFormError("")
    setAdding(true)
    try {
      await onAdd(trimmed, role, email.trim())
      setName("")
      setEmail("")
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "failed to add")
    } finally {
      setAdding(false)
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    setDeleteError("")
    const err = await onDelete(deleteTarget.id)
    if (err) {
      setDeleteError(err)
      setDeleting(false)
    } else {
      setDeleteTarget(null)
      setDeleting(false)
    }
  }

  return (
    <div className="space-y-6">
      <SectionHeading accent="yellow" eyebrow="people" title="employee roster" />

      {/* Add form */}
      <BrandPanel accent="yellow" tone="soft" className="p-5">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[160px]">
            <label className="block text-[11px] font-semibold tracking-[0.08em] text-muted mb-1">name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={fieldClasses({ size: "sm" })}
              placeholder="full name"
            />
          </div>
          <div className="w-36">
            <label className="block text-[11px] font-semibold tracking-[0.08em] text-muted mb-1">role</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as "intern" | "full_timer")}
              className={fieldClasses({ size: "sm" })}
            >
              <option value="full_timer">full timer</option>
              <option value="intern">intern</option>
            </select>
          </div>
          <div className="flex-1 min-w-[160px]">
            <label className="block text-[11px] font-semibold tracking-[0.08em] text-muted mb-1">email</label>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={fieldClasses({ size: "sm" })}
              placeholder="name@build3.org"
            />
          </div>
          <button
            type="button"
            disabled={adding}
            onClick={handleAdd}
            {...buttonClasses({ accent: "yellow", variant: "solid", size: "sm" })}
          >
            {adding ? "adding..." : "add employee"}
          </button>
        </div>
        {formError && (
          <p className="mt-2 text-xs text-[#d35b52] font-medium">{formError}</p>
        )}
      </BrandPanel>

      {/* Table */}
      <BrandPanel accent="yellow" tone="plain" className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-[11px] font-semibold tracking-[0.08em] text-muted">
                <th className="px-5 py-3">name</th>
                <th className="px-3 py-3">role</th>
                <th className="px-3 py-3 hidden sm:table-cell">email</th>
                <th className="px-3 py-3 text-center">given</th>
                <th className="px-3 py-3 text-center">received</th>
                <th className="px-3 py-3 hidden sm:table-cell">added</th>
                <th className="px-3 py-3 w-12"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/50">
              {employees.map((emp) => {
                const badge = badgeClasses({ accent: getRoleAccent(emp.role), tone: "soft" })
                return (
                  <tr key={emp.id} className="hover:bg-yellow-50/30 transition-colors">
                    <td className="px-5 py-3 font-medium text-ink">{emp.name}</td>
                    <td className="px-3 py-3">
                      <span className={badge.className} style={badge.style}>
                        {getRoleLabel(emp.role)}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-muted hidden sm:table-cell text-xs">
                      {emp.email ?? "-"}
                    </td>
                    <td className="px-3 py-3 text-center tabular-nums">
                      {counts.given.get(emp.id) ?? 0}
                    </td>
                    <td className="px-3 py-3 text-center tabular-nums">
                      {counts.received.get(emp.id) ?? 0}
                    </td>
                    <td className="px-3 py-3 text-muted text-xs hidden sm:table-cell">
                      {new Date(emp.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-3 py-3">
                      <button
                        type="button"
                        onClick={() => { setDeleteTarget(emp); setDeleteError("") }}
                        className="text-xs text-muted hover:text-[#d35b52] transition-colors"
                      >
                        remove
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </BrandPanel>

      {/* Delete modal */}
      <Modal
        open={!!deleteTarget}
        title="remove employee"
        description={`Are you sure you want to remove ${deleteTarget?.name}? This will fail if they have any feedback history.`}
        accent="peach"
        onClose={() => setDeleteTarget(null)}
      >
        {deleteError && (
          <p className="text-xs text-[#d35b52] font-medium mb-3">{deleteError}</p>
        )}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => setDeleteTarget(null)}
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
            {deleting ? "removing..." : "remove"}
          </button>
        </div>
      </Modal>
    </div>
  )
}
