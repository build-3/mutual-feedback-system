"use client"

import { memo, useState } from "react"
import clsx from "clsx"
import { badgeClasses } from "@/components/ui/brand"

type MatrixItem = {
  key: string
  label: string
  description?: string
  /** Short definition of the principle, revealed by the info button. */
  definition?: string
}

type MatrixRatingProps = {
  items: MatrixItem[]
  values: Record<string, number>
  onChange: (key: string, val: number) => void
}

const BADGE = badgeClasses({ accent: "peach", tone: "soft" })

/**
 * Info affordance for a principle's definition.
 *
 * Opens on hover for pointers and on click for touch, where hover does not
 * exist — a hover-only tooltip would hide the definition from every phone. Also
 * opens on keyboard focus, so it is not mouse-only.
 */
function DefinitionHint({ label, definition }: { label: string; definition: string }) {
  const [pinned, setPinned] = useState(false)
  const [hovered, setHovered] = useState(false)
  const open = pinned || hovered

  return (
    <span className="relative ml-1.5 inline-flex align-middle">
      <button
        type="button"
        aria-label={`what does ${label} mean?`}
        aria-expanded={open}
        onClick={() => setPinned((prev) => !prev)}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onFocus={() => setHovered(true)}
        onBlur={() => setHovered(false)}
        className={clsx(
          "flex h-4 w-4 items-center justify-center rounded-full border text-[9px] font-bold leading-none transition-colors",
          open
            ? "border-ink bg-ink text-white"
            : "border-line bg-white text-muted hover:border-black/30 hover:text-ink"
        )}
      >
        i
      </button>
      {open && (
        <span
          role="tooltip"
          className="absolute left-1/2 top-full z-20 mt-2 w-56 -translate-x-1/2 rounded-[14px] border border-line bg-white px-3 py-2 text-xs font-normal leading-5 text-ink shadow-brand"
        >
          {definition}
        </span>
      )}
    </span>
  )
}

const MatrixRating = memo(function MatrixRating({
  items,
  values,
  onChange,
}: MatrixRatingProps) {
  return (
    <div className="space-y-4">
      {items.map((item) => (
        <div
          key={item.key}
          className="rounded-[24px] border border-line bg-white px-4 py-4 shadow-brand"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <span className="text-sm font-medium text-ink sm:max-w-[18rem]">
              {item.label}
              {item.definition && (
                <DefinitionHint label={item.label} definition={item.definition} />
              )}
              {item.description && (
                <span className="mt-1 block text-xs font-normal leading-5 text-muted">
                  {item.description}
                </span>
              )}
            </span>
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map((score) => (
              <button
                key={score}
                type="button"
                onClick={() => onChange(item.key, score)}
                aria-pressed={score === values[item.key]}
                className={clsx(
                  "flex h-11 w-11 items-center justify-center rounded-full border text-sm font-semibold transition-all",
                  score === values[item.key]
                    ? "border-brand-peach bg-brand-peach text-ink shadow-brand"
                    : "border-line bg-white text-muted hover:-translate-y-0.5 hover:border-black/15"
                )}
              >
                {score}
              </button>
            ))}
          </div>
          {values[item.key] !== undefined && values[item.key] > 0 && (
            <span className={BADGE.className} style={BADGE.style}>
              {values[item.key]}/5
            </span>
          )}
          </div>
        </div>
      ))}
    </div>
  )
})

export default MatrixRating
