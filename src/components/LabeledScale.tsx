"use client"

import { useCallback, useRef, useState } from "react"

interface LabeledScaleProps {
  /** null until the reviewer picks a point — there is deliberately no default. */
  value: number | null
  min: number
  max: number
  /** One label per step, lowest first. */
  labels: string[]
  ariaLabel: string
  onChange: (value: number) => void
}

// One calm colour rather than red-to-green: this scale is a perception, not a
// verdict, so no end of it should look like a warning.
const FILL = "#79c0a6"

export default function LabeledScale({
  value,
  min,
  max,
  labels,
  ariaLabel,
  onChange,
}: LabeledScaleProps) {
  const [isDragging, setIsDragging] = useState(false)
  const trackRef = useRef<HTMLDivElement>(null)

  const span = max - min
  const stops = Array.from({ length: span + 1 }, (_, i) => min + i)
  const percentOf = (v: number) => ((v - min) / span) * 100
  const label = value !== null ? labels[value - min] ?? "" : ""

  const pick = useCallback(
    (clientX: number) => {
      const rect = trackRef.current?.getBoundingClientRect()
      if (!rect || rect.width === 0) return
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
      onChange(Math.round(min + ratio * span))
    },
    [min, span, onChange]
  )

  const handlePointerDown = (e: React.PointerEvent) => {
    setIsDragging(true)
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    pick(e.clientX)
  }

  const handlePointerMove = (e: React.PointerEvent) => {
    if (isDragging) pick(e.clientX)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const clamp = (v: number) => Math.max(min, Math.min(max, v))
    // First key press lands on the middle so the arrows have somewhere to move from.
    const current = value ?? Math.round((min + max) / 2)
    let next: number | null = null
    if (e.key === "ArrowRight" || e.key === "ArrowUp") next = value === null ? current : clamp(current + 1)
    else if (e.key === "ArrowLeft" || e.key === "ArrowDown") next = value === null ? current : clamp(current - 1)
    else if (e.key === "Home") next = min
    else if (e.key === "End") next = max
    if (next !== null) {
      e.preventDefault()
      onChange(next)
    }
  }

  return (
    <div className="space-y-4">
      {/* Fixed height so picking a point doesn't push the page around. */}
      <div className="flex min-h-[3.75rem] items-baseline gap-3">
        {value === null ? (
          <span className="self-center text-sm font-medium text-muted">
            slide or tap to answer
          </span>
        ) : (
          <>
            <span
              className="text-5xl font-bold tabular-nums tracking-[-0.06em]"
              style={{ color: FILL }}
            >
              {value}
            </span>
            <span className="text-sm font-medium text-muted">/ {max}</span>
            <span
              className="rounded-full px-3 py-1 text-xs font-semibold"
              style={{ backgroundColor: `${FILL}22`, color: "#3f8f74" }}
            >
              {label}
            </span>
          </>
        )}
      </div>

      <div
        ref={trackRef}
        role="slider"
        tabIndex={0}
        aria-label={ariaLabel}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value ?? undefined}
        aria-valuetext={value !== null ? `${value} of ${max}, ${label}` : "not answered yet"}
        className="relative h-10 cursor-pointer touch-none select-none rounded-full outline-none focus-visible:ring-2 focus-visible:ring-brand-peach/60"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={() => setIsDragging(false)}
        onPointerCancel={() => setIsDragging(false)}
        onKeyDown={handleKeyDown}
      >
        <div className="absolute top-1/2 h-2 w-full -translate-y-1/2 rounded-full bg-black/[0.06]" />

        {value !== null && (
          <div
            className="absolute top-1/2 h-2 -translate-y-1/2 rounded-full transition-[width] duration-75"
            style={{ width: `${percentOf(value)}%`, backgroundColor: FILL }}
          />
        )}

        {/* One dot per step, so the ten points are visible before anything is picked. */}
        {stops.map((stop) => (
          <div
            key={stop}
            className="absolute top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{
              left: `${percentOf(stop)}%`,
              backgroundColor:
                value !== null && stop <= value ? "rgba(255,255,255,0.85)" : "rgba(0,0,0,0.18)",
            }}
          />
        ))}

        {value !== null && (
          <div
            className="absolute top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-md transition-[left] duration-75"
            style={{
              left: `${percentOf(value)}%`,
              backgroundColor: FILL,
              boxShadow: isDragging
                ? `0 0 0 4px ${FILL}40, 0 2px 8px rgba(0,0,0,0.15)`
                : "0 2px 6px rgba(0,0,0,0.15)",
            }}
          />
        )}
      </div>

      <div className="flex justify-between gap-4 text-[11px] font-semibold tracking-[0.06em] text-muted/70">
        <span>
          {min} · {labels[0]}
        </span>
        <span className="text-right">
          {max} · {labels[labels.length - 1]}
        </span>
      </div>
    </div>
  )
}
