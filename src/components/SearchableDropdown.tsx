"use client"

import { KeyboardEvent, memo, useState, useEffect, useRef, useMemo } from "react"
import type { Employee } from "@/lib/types"
import { getRoleAccent, getRoleLabel } from "@/lib/brand"
import {
  badgeClasses,
  buttonClasses,
  fieldClasses,
} from "@/components/ui/brand"

/** Module-level cache with 5-minute TTL — auto-refreshes when new employees are added. */
let employeeCache: Employee[] | null = null
let employeeCachePromise: Promise<Employee[]> | null = null
let employeeCacheExpiry = 0
const EMPLOYEE_CACHE_TTL_MS = 300_000 // 5 minutes

async function loadAllEmployees(): Promise<Employee[]> {
  if (employeeCache && Date.now() < employeeCacheExpiry) return employeeCache
  if (employeeCachePromise) return employeeCachePromise

  employeeCachePromise = fetch("/api/employee-search?q=*")
    .then((res) => (res.ok ? res.json() : { employees: [] }))
    .then((data) => {
      employeeCache = (data.employees || []) as Employee[]
      employeeCacheExpiry = Date.now() + EMPLOYEE_CACHE_TTL_MS
      employeeCachePromise = null
      return employeeCache
    })
    .catch(() => {
      employeeCachePromise = null
      return [] as Employee[]
    })

  return employeeCachePromise
}

type SearchableDropdownProps = {
  value: Employee | null
  onChange: (employee: Employee | null) => void
  filterRole?: "intern" | "full_timer"
  excludeEmployeeId?: string | null
  excludeEmployeeIds?: string[]
  placeholder?: string
}

const SearchableDropdown = memo(function SearchableDropdown({
  value,
  onChange,
  filterRole,
  excludeEmployeeId,
  excludeEmployeeIds,
  placeholder = "Search by name...",
}: SearchableDropdownProps) {
  const [query, setQuery] = useState("")
  const [allEmployees, setAllEmployees] = useState<Employee[]>(employeeCache || [])
  const [isOpen, setIsOpen] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(0)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Load employees on mount (instant if cached)
  useEffect(() => {
    loadAllEmployees().then(setAllEmployees)
  }, [])

  // Instant client-side filter — no debounce, no network
  const visibleResults = useMemo(() => {
    let list = allEmployees

    if (filterRole) {
      // Admins are treated as full-timers for feedback purposes
      if (filterRole === "full_timer") {
        list = list.filter((e) => e.role === "full_timer" || e.role === "admin")
      } else {
        list = list.filter((e) => e.role === filterRole)
      }
    }

    if (excludeEmployeeId) {
      list = list.filter((e) => e.id !== excludeEmployeeId)
    }

    if (excludeEmployeeIds && excludeEmployeeIds.length > 0) {
      const excludeSet = new Set(excludeEmployeeIds)
      list = list.filter((e) => !excludeSet.has(e.id))
    }

    if (!query.trim()) {
      return list
    }

    const q = query.trim().toLowerCase()
    return list.filter((e) => e.name.toLowerCase().includes(q))
  }, [allEmployees, query, filterRole, excludeEmployeeId, excludeEmployeeIds])

  const duplicateNameCounts = useMemo(() => {
    return visibleResults.reduce<Record<string, number>>((counts, employee) => {
      const normalized = employee.name.trim().toLowerCase()
      counts[normalized] = (counts[normalized] || 0) + 1
      return counts
    }, {})
  }, [visibleResults])

  function getEmployeeMeta(employee: Employee) {
    const normalized = employee.name.trim().toLowerCase()
    const hasDuplicateName = duplicateNameCounts[normalized] > 1
    return hasDuplicateName ? `ref ${employee.id.slice(0, 4)}` : getRoleLabel(employee.role)
  }

  function selectEmployee(employee: Employee) {
    onChange(employee)
    setIsOpen(false)
    setQuery("")
    setHighlightedIndex(0)
  }

  useEffect(() => {
    setHighlightedIndex(0)
  }, [visibleResults])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  if (value) {
    const pill = badgeClasses({
      accent: getRoleAccent(value.role),
      tone: "soft",
    })

    return (
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex min-w-0 items-center gap-3 rounded-[24px] border border-line bg-white/82 px-4 py-3 shadow-brand backdrop-blur-sm">
          <span className="truncate text-lg font-semibold text-ink">{value.name}</span>
          <span className={`${pill.className} shrink-0`} style={pill.style}>
            {getEmployeeMeta(value)}
          </span>
        </div>
        {(() => {
          const changeBtn = buttonClasses({ accent: "ink", variant: "ghost", size: "sm" })
          return (
            <button
              type="button"
              onClick={() => {
                onChange(null)
                setQuery("")
              }}
              className={changeBtn.className}
              style={changeBtn.style}
            >
              choose someone else
            </button>
          )
        })()}
      </div>
    )
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault()
      event.stopPropagation()
      if (!isOpen) setIsOpen(true)
      setHighlightedIndex((current) =>
        visibleResults.length === 0 ? 0 : Math.min(current + 1, visibleResults.length - 1)
      )
      return
    }

    if (event.key === "ArrowUp") {
      event.preventDefault()
      event.stopPropagation()
      setHighlightedIndex((current) => Math.max(current - 1, 0))
      return
    }

    if (event.key === "Enter") {
      event.preventDefault()
      event.stopPropagation()
      if (isOpen && visibleResults[highlightedIndex]) {
        selectEmployee(visibleResults[highlightedIndex])
      }
      return
    }

    if (event.key === "Escape") {
      event.preventDefault()
      event.stopPropagation()
      setIsOpen(false)
    }
  }

  // Show dropdown on focus with full list even before typing
  const showDropdown = isOpen && visibleResults.length > 0

  return (
    <div ref={wrapperRef} className="relative w-full max-w-md">
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setIsOpen(true)
        }}
        onFocus={() => setIsOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className={fieldClasses({ size: "lg" })}
        aria-expanded={isOpen}
        aria-autocomplete="list"
        aria-haspopup="listbox"
        aria-controls="employee-search-results"
        aria-activedescendant={
          showDropdown && visibleResults[highlightedIndex]
            ? `employee-option-${visibleResults[highlightedIndex].id}`
            : undefined
        }
      />
      {showDropdown && (
        <ul
          id="employee-search-results"
          role="listbox"
          className="absolute z-10 mt-2 max-h-72 w-full overflow-y-auto rounded-[24px] border border-line bg-white/92 p-2 shadow-brand backdrop-blur-md"
        >
          {visibleResults.map((emp, index) => (
            <li key={emp.id}>
              <button
                id={`employee-option-${emp.id}`}
                type="button"
                role="option"
                aria-selected={index === highlightedIndex}
                className={[
                  "flex w-full items-center gap-3 rounded-[18px] px-4 py-3 text-left transition-colors",
                  index === highlightedIndex ? "bg-black/[0.05]" : "hover:bg-black/[0.035]",
                ].join(" ")}
                onClick={() => selectEmployee(emp)}
              >
                <span className="min-w-0 flex-1 truncate text-base font-medium text-ink">
                  {emp.name}
                </span>
                {(() => {
                  const badge = badgeClasses({
                    accent: getRoleAccent(emp.role),
                    tone: "soft",
                  })
                  return (
                    <span
                      className={`${badge.className} shrink-0`}
                      style={badge.style}
                    >
                      {getEmployeeMeta(emp)}
                    </span>
                  )
                })()}
              </button>
            </li>
          ))}
        </ul>
      )}
      {isOpen && query.trim() && visibleResults.length === 0 && (
        <div className="absolute z-10 mt-2 w-full rounded-[24px] border border-line bg-white/92 p-4 text-sm text-muted shadow-brand backdrop-blur-md">
          we could not find that builder yet.
        </div>
      )}
    </div>
  )
})

export default SearchableDropdown
