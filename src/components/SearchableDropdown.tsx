"use client"

import { KeyboardEvent, useState, useEffect, useRef, useCallback, useMemo } from "react"
import type { Employee } from "@/lib/types"
import { getRoleAccent, getRoleLabel } from "@/lib/brand"
import {
  badgeClasses,
  buttonClasses,
  fieldClasses,
} from "@/components/ui/brand"

type SearchableDropdownProps = {
  value: Employee | null
  onChange: (employee: Employee | null) => void
  filterRole?: "intern" | "full_timer"
  excludeEmployeeId?: string | null
  placeholder?: string
}

export default function SearchableDropdown({
  value,
  onChange,
  filterRole,
  excludeEmployeeId,
  placeholder = "Search by name...",
}: SearchableDropdownProps) {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<Employee[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>()
  const abortRef = useRef<AbortController | null>(null)

  const visibleResults = useMemo(
    () => results.filter((employee) => employee.id !== excludeEmployeeId),
    [excludeEmployeeId, results]
  )

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

  const search = useCallback(
    async (searchQuery: string) => {
      // Abort any in-flight request so stale results never overwrite newer ones
      if (abortRef.current) {
        abortRef.current.abort()
      }

      if (!searchQuery.trim()) {
        setResults([])
        setHasSearched(false)
        setError(null)
        return
      }

      const controller = new AbortController()
      abortRef.current = controller

      setLoading(true)
      setHasSearched(false)
      setError(null)

      try {
        const params = new URLSearchParams({ q: searchQuery })
        if (filterRole) {
          params.set("role", filterRole)
        }

        const res = await fetch(`/api/public/employee-search?${params.toString()}`, {
          signal: controller.signal,
        })

        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data.error || "We could not search the roster right now.")
        }

        const data = await res.json()
        setResults((data.employees || []) as Employee[])
      } catch (searchError) {
        if (searchError instanceof DOMException && searchError.name === "AbortError") {
          return
        }
        setResults([])
        setError(
          searchError instanceof Error
            ? searchError.message
            : "We could not search the roster right now."
        )
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false)
          setHasSearched(true)
        }
      }
    },
    [filterRole]
  )

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => search(query), 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      if (abortRef.current) abortRef.current.abort()
    }
  }, [query, search])

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

  return (
    <div ref={wrapperRef} className="relative w-full max-w-md">
      <input
        type="text"
        role="combobox"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setIsOpen(true)
        }}
        onFocus={() => query && setIsOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className={fieldClasses({ size: "lg" })}
        aria-expanded={isOpen}
        aria-autocomplete="list"
        aria-haspopup="listbox"
        aria-controls="employee-search-results"
        aria-activedescendant={
          isOpen && visibleResults[highlightedIndex]
            ? `employee-option-${visibleResults[highlightedIndex].id}`
            : undefined
        }
      />
      {loading && (
        <div className="absolute right-4 top-4 text-muted">
          <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24">
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
              fill="none"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
        </div>
      )}
      {error && !loading && (
        <div className="absolute z-10 mt-2 w-full rounded-[24px] border border-red-200 bg-red-50 p-4 text-sm text-red-700 shadow-brand">
          {error}
        </div>
      )}
      {isOpen && visibleResults.length > 0 && !error && (
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
      {isOpen && query && !loading && hasSearched && visibleResults.length === 0 && !error && (
        <div className="absolute z-10 mt-2 w-full rounded-[24px] border border-line bg-white/92 p-4 text-sm text-muted shadow-brand backdrop-blur-md">
          we could not find that builder yet.
        </div>
      )}
    </div>
  )
}
