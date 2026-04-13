"use client"

import { useCallback, useRef, useState } from "react"

interface TrustSliderProps {
  value: number
  min?: number
  max?: number
  onChange: (value: number) => void
}

function getSliderColor(value: number): string {
  if (value <= 30) return "#e85d5d"
  if (value <= 50) return "#f0a060"
  if (value <= 70) return "#e8c760"
  if (value <= 85) return "#8cc084"
  return "#5aad6a"
}

function getSliderLabel(value: number): string {
  if (value <= 20) return "very low"
  if (value <= 40) return "low"
  if (value <= 60) return "neutral"
  if (value <= 80) return "solid"
  if (value <= 90) return "strong"
  return "very high"
}

export default function TrustSlider({
  value,
  min = 0,
  max = 100,
  onChange,
}: TrustSliderProps) {
  const [isDragging, setIsDragging] = useState(false)
  const sliderRef = useRef<HTMLDivElement>(null)

  const percent = Math.round(((value - min) / (max - min)) * 100)
  const color = getSliderColor(value)
  const label = getSliderLabel(value)

  const updateFromPosition = useCallback(
    (clientX: number) => {
      const rect = sliderRef.current?.getBoundingClientRect()
      if (!rect) return
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
      const newValue = Math.round(min + ratio * (max - min))
      onChange(newValue)
    },
    [min, max, onChange]
  )

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      setIsDragging(true)
      ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
      updateFromPosition(e.clientX)
    },
    [updateFromPosition]
  )

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDragging) return
      updateFromPosition(e.clientX)
    },
    [isDragging, updateFromPosition]
  )

  const handlePointerUp = useCallback(() => {
    setIsDragging(false)
  }, [])

  return (
    <div className="space-y-4">
      {/* Big number display */}
      <div className="flex items-baseline gap-3">
        <span
          className="text-5xl font-bold tracking-[-0.06em] tabular-nums transition-colors duration-200"
          style={{ color }}
        >
          {value}
        </span>
        <span className="text-sm font-medium text-muted">/ {max}</span>
        <span
          className="rounded-full px-3 py-1 text-xs font-semibold transition-colors duration-200"
          style={{
            backgroundColor: `${color}18`,
            color,
          }}
        >
          {label}
        </span>
      </div>

      {/* Slider track */}
      <div
        ref={sliderRef}
        className="relative h-10 cursor-pointer touch-none select-none"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        {/* Background track */}
        <div className="absolute top-1/2 h-2 w-full -translate-y-1/2 rounded-full bg-black/[0.06]" />

        {/* Filled track */}
        <div
          className="absolute top-1/2 h-2 -translate-y-1/2 rounded-full transition-[width] duration-75"
          style={{ width: `${percent}%`, backgroundColor: color }}
        />

        {/* Thumb */}
        <div
          className="absolute top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-md transition-[left] duration-75"
          style={{
            left: `${percent}%`,
            backgroundColor: color,
            boxShadow: isDragging
              ? `0 0 0 4px ${color}30, 0 2px 8px rgba(0,0,0,0.15)`
              : "0 2px 6px rgba(0,0,0,0.15)",
          }}
        />
      </div>

      {/* Scale labels */}
      <div className="flex justify-between text-[10px] font-semibold tracking-[0.06em] text-muted/60">
        <span>{min}</span>
        <span>50</span>
        <span>{max}</span>
      </div>
    </div>
  )
}
