"use client"

import { useMemo, useState } from "react"
import clsx from "clsx"
import { Employee } from "@/lib/types"
import { getAvatarColor, getInitials } from "@/lib/insights-helpers"
import { PillarMark } from "@/components/ui/brand"

interface Props {
  employees: Employee[]
  selectedId: string | null
  onSelect: (id: string | null) => void
  showOrgOverview: boolean
  onToggleOrg: () => void
  dateRange: "month" | "3months" | "all"
  onDateRangeChange: (range: "month" | "3months" | "all") => void
  employeesWithFeedback: Set<string>
  isOpen: boolean
  onClose: () => void
  participationByEmployee?: Record<string, number>
  totalTeamSize?: number
}

const DATE_RANGES = [
  { key: "month" as const, label: "month" },
  { key: "3months" as const, label: "3 months" },
  { key: "all" as const, label: "all time" },
]

function EmployeeRow({
  employee,
  selected,
  hasFeedback,
  feedbackCount,
  teamSize,
  showParticipation,
  onSelect,
  onClose,
}: {
  employee: Employee
  selected: boolean
  hasFeedback: boolean
  feedbackCount: number
  teamSize: number
  showParticipation: boolean
  onSelect: (id: string | null) => void
  onClose: () => void
}) {
  const participationPct =
    teamSize > 0 ? Math.min((feedbackCount / teamSize) * 100, 100) : 0

  return (
    <button
      type="button"
      onClick={() => {
        onSelect(employee.id)
        onClose()
      }}
      className={clsx(
        "w-full rounded-[22px] border px-3 py-3 text-left transition-all",
        selected
          ? "border-[#f5bb9f]/50 bg-white/10"
          : "border-transparent bg-transparent hover:border-white/10 hover:bg-white/[0.05]"
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
          style={{ backgroundColor: getAvatarColor(employee.name) }}
        >
          {getInitials(employee.name)}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold text-white">
              {employee.name}
            </span>
            <span
              className={clsx(
                "h-2 w-2 rounded-full",
                hasFeedback ? "bg-[#79c0a6]" : "bg-white/20"
              )}
            />
          </div>

          {showParticipation && (
            <>
              <div className="mt-2 flex items-center justify-between text-[11px] tracking-[0.08em] text-white/45">
                <span>touchpoints</span>
                <span>{feedbackCount}</span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-[#c6e5f8] transition-all duration-500"
                  style={{ width: `${participationPct}%` }}
                />
              </div>
            </>
          )}
        </div>
      </div>
    </button>
  )
}

function SectionHeader({
  label,
  count,
  isOpen,
  onToggle,
}: {
  label: string
  count: number
  isOpen: boolean
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full items-center gap-2 px-3 py-2 text-left"
    >
      <svg
        className={clsx(
          "h-3 w-3 text-white/45 transition-transform",
          isOpen && "rotate-90"
        )}
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
      </svg>
      <span className="text-[11px] font-semibold tracking-[0.08em] text-white/55">
        {label}
      </span>
      <span className="ml-auto text-[11px] font-semibold text-white/45">{count}</span>
    </button>
  )
}

export default function EmployeeSidebar({
  employees,
  selectedId,
  onSelect,
  showOrgOverview,
  onToggleOrg,
  dateRange,
  onDateRangeChange,
  employeesWithFeedback,
  isOpen,
  onClose,
  participationByEmployee,
  totalTeamSize,
}: Props) {
  const [search, setSearch] = useState("")
  const [fullTimersOpen, setFullTimersOpen] = useState(true)
  const [internsOpen, setInternsOpen] = useState(true)

  const filtered = useMemo(
    () => employees.filter((employee) =>
      employee.name.toLowerCase().includes(search.toLowerCase())
    ),
    [employees, search]
  )

  const fullTimers = useMemo(
    () => filtered.filter((employee) => employee.role !== "intern"),
    [filtered]
  )
  const interns = useMemo(
    () => filtered.filter((employee) => employee.role === "intern"),
    [filtered]
  )
  const teamSize = totalTeamSize ?? employees.length

  return (
    <>
      {isOpen && (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-black/45 backdrop-blur-sm lg:hidden"
          onClick={onClose}
          aria-label="Close sidebar"
        />
      )}

      <aside
        className={clsx(
          "fixed left-0 top-0 z-50 flex h-full w-[300px] flex-col border-r border-white/10 bg-brand-black transition-transform duration-300 lg:sticky lg:top-0 lg:h-screen lg:flex-shrink-0 lg:translate-x-0",
          isOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="border-b border-white/10 px-5 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/[0.04]">
              <PillarMark accent="peach" />
            </div>
            <div>
              <div className="text-lg font-bold tracking-[-0.06em] text-white">build3</div>
              <div className="text-[11px] font-semibold tracking-[0.08em] text-white/50">
                we read the full picture
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="ml-auto rounded-full p-2 text-white/55 hover:bg-white/5 hover:text-white lg:hidden"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="mt-5 rounded-[22px] border border-white/10 bg-white/[0.04] p-1">
            <div className="grid grid-cols-3 gap-1">
              {DATE_RANGES.map((range) => (
                <button
                  key={range.key}
                  type="button"
                  onClick={() => onDateRangeChange(range.key)}
                  className={clsx(
                    "rounded-[18px] px-2 py-2 text-[11px] font-semibold tracking-[0.08em] transition-all",
                    dateRange === range.key
                      ? "bg-[#f5bb9f] text-[#1d1d1b]"
                      : "text-white/55 hover:bg-white/[0.06] hover:text-white"
                  )}
                >
                  {range.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="px-4 py-4">
          <input
            type="text"
            placeholder="search the team..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="w-full rounded-[22px] border border-white/10 bg-white/[0.06] px-4 py-3 text-sm text-white placeholder:text-white/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/15"
          />
        </div>

        <div className="flex-1 overflow-y-auto px-3 pb-4">
          {fullTimers.length > 0 && (
            <div className="mb-2">
              <SectionHeader
                label="full timers"
                count={fullTimers.length}
                isOpen={fullTimersOpen}
                onToggle={() => setFullTimersOpen((value) => !value)}
              />
              {fullTimersOpen && (
                <div className="space-y-1">
                  {fullTimers.map((employee) => (
                    <EmployeeRow
                      key={employee.id}
                      employee={employee}
                      selected={selectedId === employee.id && !showOrgOverview}
                      hasFeedback={employeesWithFeedback.has(employee.id)}
                      feedbackCount={participationByEmployee?.[employee.id] ?? 0}
                      teamSize={teamSize}
                      showParticipation={Boolean(participationByEmployee)}
                      onSelect={onSelect}
                      onClose={onClose}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {interns.length > 0 && (
            <div className="mb-2">
              <SectionHeader
                label="interns"
                count={interns.length}
                isOpen={internsOpen}
                onToggle={() => setInternsOpen((value) => !value)}
              />
              {internsOpen && (
                <div className="space-y-1">
                  {interns.map((employee) => (
                    <EmployeeRow
                      key={employee.id}
                      employee={employee}
                      selected={selectedId === employee.id && !showOrgOverview}
                      hasFeedback={employeesWithFeedback.has(employee.id)}
                      feedbackCount={participationByEmployee?.[employee.id] ?? 0}
                      teamSize={teamSize}
                      showParticipation={Boolean(participationByEmployee)}
                      onSelect={onSelect}
                      onClose={onClose}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {filtered.length === 0 && (
            <div className="px-3 py-6 text-center text-sm text-white/45">
              no one matches that search yet.
            </div>
          )}
        </div>

        <div className="border-t border-white/10 p-3">
          <button
            type="button"
            onClick={() => {
              onToggleOrg()
              onClose()
            }}
            className={clsx(
              "flex w-full items-center gap-3 rounded-[22px] border px-4 py-4 text-left transition-all",
              showOrgOverview
                ? "border-[#f5bb9f] bg-[#f5bb9f] text-[#1d1d1b]"
                : "border-white/10 bg-white/[0.04] text-white hover:border-white/20 hover:bg-white/[0.06]"
            )}
          >
            <div className="rounded-full bg-black/10 p-2">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
              </svg>
            </div>
            <div>
              <div className="text-sm font-semibold">org overview</div>
              <div className="text-xs opacity-70">see the wider pattern before diving into a profile.</div>
            </div>
          </button>
        </div>
      </aside>
    </>
  )
}
