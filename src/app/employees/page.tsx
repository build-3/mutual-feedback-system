"use client"

import { useEffect, useState } from "react"
import Navbar from "@/components/Navbar"
import {
  BrandPanel,
  EmptyState,
  Modal,
  NoticeCard,
  SectionHeading,
  buttonClasses,
  fieldClasses,
} from "@/components/ui/brand"
import { SCREEN_ACCENTS, getRoleAccent, getRoleLabel } from "@/lib/brand"
import { Employee } from "@/lib/types"

const employeesAccent = SCREEN_ACCENTS.employees

const CANCEL_BTN = buttonClasses({ accent: "ink", variant: "ghost", size: "sm" })
const CONFIRM_BTN = buttonClasses({ accent: employeesAccent, variant: "solid", size: "sm" })

function ModalDeleteActions({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: () => void }) {
  return (
    <div className="flex flex-wrap gap-3">
      <button type="button" className={CANCEL_BTN.className} style={CANCEL_BTN.style} onClick={onCancel}>
        keep them
      </button>
      <button type="button" className={CONFIRM_BTN.className} style={CONFIRM_BTN.style} onClick={onConfirm}>
        remove from roster
      </button>
    </div>
  )
}

type NoticeState = {
  tone: "success" | "error"
  message: string
} | null

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [role, setRole] = useState<"intern" | "full_timer">("full_timer")
  const [adding, setAdding] = useState(false)
  const [notice, setNotice] = useState<NoticeState>(null)
  const [pendingDelete, setPendingDelete] = useState<Employee | null>(null)

  useEffect(() => {
    void loadEmployees()
  }, [])

  async function loadEmployees() {
    setLoading(true)
    try {
      const res = await fetch("/api/admin/employees")
      const payload = await res.json().catch(() => ({}))

      if (!res.ok) {
        throw new Error(payload.error || "we could not load the roster just yet.")
      }

      setEmployees((payload.employees || []) as Employee[])
    } catch (loadError) {
      console.error(loadError)
      setNotice({
        tone: "error",
        message: "we could not load the roster just yet.",
      })
    } finally {
      setLoading(false)
    }
  }

  async function handleAdd(event: React.FormEvent) {
    event.preventDefault()
    const trimmedName = name.trim()

    if (!trimmedName) {
      setNotice({
        tone: "error",
        message: "give us a name first.",
      })
      return
    }

    const duplicateExists = employees.some(
      (employee) => employee.name.trim().toLowerCase() === trimmedName.toLowerCase()
    )

    if (duplicateExists) {
      setNotice({
        tone: "error",
        message: "that name is already in the roster. keep names unique so feedback stays unambiguous.",
      })
      return
    }

    setAdding(true)
    setNotice(null)

    try {
      const res = await fetch("/api/admin/employees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmedName, role, email: email.trim() || null }),
      })
      const payload = await res.json().catch(() => ({}))

      if (!res.ok) {
        throw new Error(payload.error || "we could not add that person. please try again.")
      }

      setName("")
      setEmail("")
      setNotice({
        tone: "success",
        message: "new teammate added. nice and clean.",
      })
      await loadEmployees()
    } catch (addError) {
      console.error(addError)
      setNotice({
        tone: "error",
        message: "we could not add that person. please try again.",
      })
    } finally {
      setAdding(false)
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return

    try {
      const res = await fetch("/api/admin/employees", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: pendingDelete.id }),
      })
      const payload = await res.json().catch(() => ({}))

      if (!res.ok) {
        throw new Error(payload.error || "that delete did not stick. please try once more.")
      }

      setNotice({
        tone: "success",
        message: `${pendingDelete.name} has been removed from the roster.`,
      })
      setPendingDelete(null)
      await loadEmployees()
    } catch (deleteError) {
      console.error(deleteError)
      setNotice({
        tone: "error",
        message: "that delete did not stick. please try once more.",
      })
    }
  }

  const primaryButton = buttonClasses({
    accent: employeesAccent,
    variant: "solid",
    size: "md",
  })

  const secondaryButton = buttonClasses({
    accent: employeesAccent,
    variant: "outline",
    size: "sm",
  })

  return (
    <div className="min-h-screen">
      <Navbar />

      <main className="mx-auto max-w-6xl px-4 py-6 pb-24 sm:px-6 sm:py-12 sm:pb-12">
        <div className="space-y-6">
          <SectionHeading
            accent={employeesAccent}
            eyebrow="people"
            title="keep the roster tidy"
            description="we use this list everywhere else in the app, so the cleaner it is, the better the rest feels."
          />

          {notice && (
            <NoticeCard
              accent={notice.tone === "success" ? employeesAccent : "peach"}
              title={notice.tone === "success" ? "all good" : "something needs attention"}
            >
              {notice.message}
            </NoticeCard>
          )}

          <div className="grid gap-6 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.25fr)]">
            <BrandPanel accent={employeesAccent} tone="plain" className="brand-lines brand-pillars p-6 sm:p-8">
              <div className="space-y-2">
                <div className="text-xs font-semibold tracking-[0.08em] text-muted">
                  add someone new
                </div>
                <h2 className="text-2xl font-bold tracking-[-0.05em] text-ink">
                  one clean card, one clean roster
                </h2>
                <p className="text-sm leading-7 text-muted">
                  add people once and the rest of the app picks them up automatically.
                </p>
              </div>

              <form onSubmit={handleAdd} className="mt-8 space-y-4">
                <div>
                  <label className="mb-2 block text-sm font-semibold text-ink">
                    name
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="a builder's name"
                    className={fieldClasses({ size: "lg" })}
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-semibold text-ink">
                    email
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="name@build3.org"
                    className={fieldClasses({ size: "lg" })}
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-semibold text-ink">
                    role
                  </label>
                  <select
                    value={role}
                    onChange={(event) => setRole(event.target.value as "intern" | "full_timer")}
                    className={fieldClasses({ size: "lg" })}
                  >
                    <option value="full_timer">full timer</option>
                    <option value="intern">intern</option>
                  </select>
                </div>

                <button type="submit" disabled={adding} className={primaryButton.className} style={primaryButton.style}>
                  {adding ? "adding..." : "add to roster"}
                </button>
              </form>
            </BrandPanel>

            <BrandPanel accent={employeesAccent} tone="plain" className="overflow-hidden">
              <div className="flex items-center justify-between border-b border-line px-6 py-5">
                <div>
                  <div className="text-xs font-semibold tracking-[0.08em] text-muted">
                    team list
                  </div>
                  {loading ? (
                    <div className="mt-1 flex items-center gap-3">
                      <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-brand-sage border-t-transparent" />
                      <span className="text-sm text-muted">loading the roster...</span>
                    </div>
                  ) : (
                    <h2 className="mt-1 text-2xl font-bold tracking-[-0.05em] text-ink">
                      {employees.length} {employees.length === 1 ? "person" : "people"}
                    </h2>
                  )}
                </div>
              </div>

              {!loading && employees.length === 0 ? (
                <div className="p-6">
                  <EmptyState
                    accent={employeesAccent}
                    title="no people here yet"
                    description="add the first teammate and we will populate the rest of the app from there."
                  />
                </div>
              ) : (
                <div className="overflow-x-auto rounded-b-[30px]">
                  <table className="min-w-full border-separate border-spacing-0">
                    <thead>
                      <tr className="bg-black/[0.02]">
                        <th className="border-b border-line px-4 py-4 text-left text-xs font-semibold tracking-[0.08em] text-muted sm:px-6">
                          name
                        </th>
                        <th className="border-b border-line px-4 py-4 text-left text-xs font-semibold tracking-[0.08em] text-muted sm:px-6">
                          role
                        </th>
                        <th className="hidden border-b border-line px-4 py-4 text-left text-xs font-semibold tracking-[0.08em] text-muted sm:table-cell sm:px-6">
                          email
                        </th>
                        <th className="border-b border-line px-4 py-4 text-right text-xs font-semibold tracking-[0.08em] text-muted sm:px-6">
                          action
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {employees.map((employee) => {
                        const roleAccent = getRoleAccent(employee.role)

                        return (
                          <tr key={employee.id} className="transition-colors hover:bg-[rgba(121,192,166,0.08)]">
                            <td className="border-b border-line px-4 py-4 text-sm font-semibold text-ink sm:px-6">
                              {employee.name}
                            </td>
                            <td className="whitespace-nowrap border-b border-line px-4 py-4 text-sm text-muted sm:px-6">
                              <span
                                className="inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold"
                                style={{
                                  backgroundColor: getRoleAccent(employee.role) === "lavender"
                                    ? "rgba(188, 173, 204, 0.24)"
                                    : roleAccent === "sky"
                                    ? "rgba(198, 229, 248, 0.26)"
                                    : "rgba(255, 243, 146, 0.3)",
                                  borderColor: roleAccent === "lavender"
                                    ? "rgba(188, 173, 204, 0.48)"
                                    : roleAccent === "sky"
                                    ? "rgba(198, 229, 248, 0.52)"
                                    : "rgba(255, 243, 146, 0.52)",
                                }}
                              >
                                {getRoleLabel(employee.role)}
                              </span>
                            </td>
                            <td className="hidden border-b border-line px-4 py-4 text-sm text-muted sm:table-cell sm:px-6">
                              {employee.email || <span className="text-xs italic text-black/25">no email</span>}
                            </td>
                            <td className="border-b border-line px-4 py-4 text-right sm:px-6">
                              <button
                                type="button"
                                className={secondaryButton.className}
                                style={secondaryButton.style}
                                onClick={() => setPendingDelete(employee)}
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
              )}
            </BrandPanel>
          </div>
        </div>
      </main>

      <Modal
        open={Boolean(pendingDelete)}
        onClose={() => setPendingDelete(null)}
        accent={employeesAccent}
        title="remove this person?"
        description={
          pendingDelete
            ? `${pendingDelete.name} will be removed only if they are not linked to any existing feedback. we block destructive deletes to protect history.`
            : undefined
        }
      >
        <ModalDeleteActions
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => void confirmDelete()}
        />
      </Modal>
    </div>
  )
}
