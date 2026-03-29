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
import type { Employee, EmployeeRole, FeedbackSubmission } from "@/lib/types"

type OnAdd = (name: string, role: "intern" | "full_timer", email: string) => Promise<void>
type OnDelete = (id: string) => Promise<string | null>
type OnUpdate = (id: string, updates: { role?: EmployeeRole; name?: string; email?: string }) => Promise<string | null>

export default function EmployeeTable({
  employees,
  submissions,
  onAdd,
  onDelete,
  onUpdate,
}: {
  employees: Employee[]
  submissions: FeedbackSubmission[]
  onAdd: OnAdd
  onDelete: OnDelete
  onUpdate: OnUpdate
}) {
  const [name, setName] = useState("")
  const [role, setRole] = useState<"intern" | "full_timer">("full_timer")
  const [email, setEmail] = useState("")
  const [adding, setAdding] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Employee | null>(null)
  const [deleteError, setDeleteError] = useState("")
  const [deleting, setDeleting] = useState(false)
  const [formError, setFormError] = useState("")

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState("")
  const [editEmail, setEditEmail] = useState("")
  const [editRole, setEditRole] = useState<EmployeeRole>("full_timer")
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState("")

  // Role change confirmation
  const [roleChangeTarget, setRoleChangeTarget] = useState<{ employee: Employee; newRole: EmployeeRole } | null>(null)
  const [roleChanging, setRoleChanging] = useState(false)
  const [roleChangeError, setRoleChangeError] = useState("")

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

  const adminCount = useMemo(
    () => employees.filter((e) => e.role === "admin").length,
    [employees]
  )

  function startEdit(emp: Employee) {
    setEditingId(emp.id)
    setEditName(emp.name)
    setEditEmail(emp.email ?? "")
    setEditRole(emp.role)
    setEditError("")
  }

  function cancelEdit() {
    setEditingId(null)
    setEditError("")
  }

  async function saveEdit(emp: Employee) {
    setEditSaving(true)
    setEditError("")

    const updates: { name?: string; email?: string; role?: EmployeeRole } = {}
    if (editName.trim() !== emp.name) updates.name = editName.trim()
    if ((editEmail.trim() || null) !== (emp.email || null)) updates.email = editEmail.trim()
    if (editRole !== emp.role) updates.role = editRole

    if (Object.keys(updates).length === 0) {
      cancelEdit()
      setEditSaving(false)
      return
    }

    const err = await onUpdate(emp.id, updates)
    setEditSaving(false)
    if (err) {
      setEditError(err)
    } else {
      setEditingId(null)
    }
  }

  function requestRoleChange(emp: Employee, newRole: EmployeeRole) {
    setRoleChangeTarget({ employee: emp, newRole })
    setRoleChangeError("")
  }

  async function confirmRoleChange() {
    if (!roleChangeTarget) return
    setRoleChanging(true)
    setRoleChangeError("")
    const err = await onUpdate(roleChangeTarget.employee.id, { role: roleChangeTarget.newRole })
    setRoleChanging(false)
    if (err) {
      setRoleChangeError(err)
    } else {
      setRoleChangeTarget(null)
    }
  }

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

  const roleOptions: { value: EmployeeRole; label: string }[] = [
    { value: "admin", label: "admin" },
    { value: "full_timer", label: "full timer" },
    { value: "intern", label: "intern" },
  ]

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
                <th className="px-3 py-3 w-24"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/50">
              {employees.map((emp) => {
                const badge = badgeClasses({ accent: getRoleAccent(emp.role), tone: "soft" })
                const isEditing = editingId === emp.id

                if (isEditing) {
                  return (
                    <tr key={emp.id} className="bg-yellow-50/40">
                      <td className="px-5 py-2">
                        <input
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className={fieldClasses({ size: "sm" })}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <select
                          value={editRole}
                          onChange={(e) => setEditRole(e.target.value as EmployeeRole)}
                          className={fieldClasses({ size: "sm" })}
                        >
                          {roleOptions.map((opt) => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-2 hidden sm:table-cell">
                        <input
                          value={editEmail}
                          onChange={(e) => setEditEmail(e.target.value)}
                          className={fieldClasses({ size: "sm" })}
                          placeholder="email"
                        />
                      </td>
                      <td colSpan={3} className="px-3 py-2">
                        {editError && (
                          <span className="text-xs text-[#d35b52]">{editError}</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex gap-2">
                          <button
                            type="button"
                            disabled={editSaving}
                            onClick={() => saveEdit(emp)}
                            className="text-xs font-semibold text-ink hover:text-brand-sky transition-colors"
                          >
                            {editSaving ? "..." : "save"}
                          </button>
                          <button
                            type="button"
                            onClick={cancelEdit}
                            className="text-xs text-muted hover:text-ink transition-colors"
                          >
                            cancel
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                }

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
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => startEdit(emp)}
                          className="text-xs text-muted hover:text-ink transition-colors"
                        >
                          edit
                        </button>
                        {emp.role === "admin" ? (
                          <button
                            type="button"
                            disabled={adminCount <= 1}
                            onClick={() => requestRoleChange(emp, "full_timer")}
                            className="text-xs text-muted hover:text-[#d35b52] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                            title={adminCount <= 1 ? "cannot remove last admin" : "revoke admin"}
                          >
                            revoke
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => requestRoleChange(emp, "admin")}
                            className="text-xs text-muted hover:text-brand-sky transition-colors"
                          >
                            promote
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => { setDeleteTarget(emp); setDeleteError("") }}
                          className="text-xs text-muted hover:text-[#d35b52] transition-colors"
                        >
                          remove
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </BrandPanel>

      {/* Role change confirmation modal */}
      <Modal
        open={!!roleChangeTarget}
        title={roleChangeTarget?.newRole === "admin" ? "promote to admin" : "revoke admin access"}
        description={
          roleChangeTarget?.newRole === "admin"
            ? `Promote ${roleChangeTarget?.employee.name} to admin? They will have full access to the control room, employee management, and destructive operations.`
            : `Revoke admin access for ${roleChangeTarget?.employee.name}? They will lose access to the control room.`
        }
        accent={roleChangeTarget?.newRole === "admin" ? "sky" : "peach"}
        onClose={() => setRoleChangeTarget(null)}
      >
        {roleChangeError && (
          <p className="text-xs text-[#d35b52] font-medium mb-3">{roleChangeError}</p>
        )}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => setRoleChangeTarget(null)}
            {...buttonClasses({ accent: "yellow", variant: "ghost", size: "sm" })}
          >
            cancel
          </button>
          <button
            type="button"
            disabled={roleChanging}
            onClick={confirmRoleChange}
            {...buttonClasses({ accent: roleChangeTarget?.newRole === "admin" ? "sky" : "ink", variant: "solid", size: "sm" })}
          >
            {roleChanging
              ? "updating..."
              : roleChangeTarget?.newRole === "admin"
                ? "promote"
                : "revoke"}
          </button>
        </div>
      </Modal>

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
