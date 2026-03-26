"use client"

import { useMemo, useRef, useState, useEffect } from "react"
import { Employee } from "@/lib/types"
import { getAvatarColor, getInitials } from "@/lib/insights-helpers"
import { getRoleLabel } from "@/lib/brand"

interface Props {
  employees: Employee[]
  selectedId: string | null
  onSelect: (id: string | null) => void
  employeesWithFeedback: Set<string>
}

export default function EmployeePicker({
  employees,
  selectedId,
  onSelect,
  employeesWithFeedback,
}: Props) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [open])

  const selected = employees.find((e) => e.id === selectedId)

  const filtered = useMemo(
    () =>
      employees.filter((e) =>
        e.name.toLowerCase().includes(search.toLowerCase())
      ),
    [employees, search]
  )

  const fullTimers = useMemo(
    () => filtered.filter((e) => e.role !== "intern"),
    [filtered]
  )
  const interns = useMemo(
    () => filtered.filter((e) => e.role === "intern"),
    [filtered]
  )

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2.5 rounded-full border border-line bg-white px-4 py-2.5 text-sm font-semibold text-ink shadow-sm transition-all hover:border-ink/20 hover:shadow-md"
      >
        {selected ? (
          <>
            <span
              className="flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-bold text-white"
              style={{ backgroundColor: getAvatarColor(selected.name) }}
            >
              {getInitials(selected.name)}
            </span>
            <span>{selected.name}</span>
          </>
        ) : (
          <>
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-sky/30 text-[10px]">
              <svg className="h-4 w-4 text-ink/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </span>
            <span className="text-muted">select a teammate</span>
          </>
        )}
        <svg
          className={`ml-1 h-3.5 w-3.5 text-muted transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-2 w-72 rounded-2xl border border-line bg-white py-2 shadow-xl">
          <div className="px-3 pb-2">
            <input
              type="text"
              placeholder="search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl border border-line bg-canvas px-3 py-2 text-sm placeholder:text-muted/50 focus:border-ink/20 focus:outline-none"
              autoFocus
            />
          </div>

          <div className="max-h-64 overflow-y-auto">
            {fullTimers.length > 0 && (
              <div>
                <div className="px-4 py-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted/60">
                  full timers
                </div>
                {fullTimers.map((emp) => (
                  <PickerRow
                    key={emp.id}
                    employee={emp}
                    isSelected={emp.id === selectedId}
                    hasFeedback={employeesWithFeedback.has(emp.id)}
                    onSelect={() => {
                      onSelect(emp.id)
                      setOpen(false)
                      setSearch("")
                    }}
                  />
                ))}
              </div>
            )}

            {interns.length > 0 && (
              <div>
                <div className="px-4 py-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted/60">
                  interns
                </div>
                {interns.map((emp) => (
                  <PickerRow
                    key={emp.id}
                    employee={emp}
                    isSelected={emp.id === selectedId}
                    hasFeedback={employeesWithFeedback.has(emp.id)}
                    onSelect={() => {
                      onSelect(emp.id)
                      setOpen(false)
                      setSearch("")
                    }}
                  />
                ))}
              </div>
            )}

            {filtered.length === 0 && (
              <div className="px-4 py-4 text-center text-sm text-muted">
                no matches
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function PickerRow({
  employee,
  isSelected,
  hasFeedback,
  onSelect,
}: {
  employee: Employee
  isSelected: boolean
  hasFeedback: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex w-full items-center gap-3 px-4 py-2 text-left transition-colors ${
        isSelected
          ? "bg-brand-sky/10"
          : "hover:bg-black/[0.03]"
      }`}
    >
      <span
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
        style={{ backgroundColor: getAvatarColor(employee.name) }}
      >
        {getInitials(employee.name)}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className={`truncate text-sm ${isSelected ? "font-bold text-ink" : "font-medium text-ink"}`}>
            {employee.name}
          </span>
          {hasFeedback && (
            <span className="h-1.5 w-1.5 rounded-full bg-brand-sage" />
          )}
        </div>
        <span className="text-[11px] text-muted">{getRoleLabel(employee.role)}</span>
      </div>
      {isSelected && (
        <svg className="h-4 w-4 text-brand-sky" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
        </svg>
      )}
    </button>
  )
}
