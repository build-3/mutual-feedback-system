"use client"

import { memo } from "react"
import clsx from "clsx"

type NpsScaleProps = {
  value: number | null
  onChange: (val: number) => void
}

const NpsScale = memo(function NpsScale({ value, onChange }: NpsScaleProps) {
  return (
    <div className="space-y-3">
      {/* Mobile: two rows (0-5, 6-10). Desktop: single row of 11 */}
      <div className="sm:hidden space-y-2">
        <div className="grid grid-cols-6 gap-2">
          {Array.from({ length: 6 }, (_, i) => i).map((n) => (
            <button
              key={n}
              type="button"
              aria-label={`Rate ${n} out of 10`}
              aria-pressed={value === n}
              onClick={() => onChange(n)}
              className={clsx(
                "rounded-[14px] border py-4 text-center text-sm font-semibold transition-all",
                value === n
                  ? "border-brand-peach bg-brand-peach text-ink shadow-brand"
                  : "border-[#e8c2bd] bg-[#fff4f2] text-ink"
              )}
            >
              {n}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-5 gap-2">
          {Array.from({ length: 5 }, (_, i) => i + 6).map((n) => (
            <button
              key={n}
              type="button"
              aria-label={`Rate ${n} out of 10`}
              aria-pressed={value === n}
              onClick={() => onChange(n)}
              className={clsx(
                "rounded-[14px] border py-4 text-center text-sm font-semibold transition-all",
                value === n
                  ? "border-brand-peach bg-brand-peach text-ink shadow-brand"
                  : n <= 8
                  ? "border-[#efe0af] bg-[#fffcee] text-ink"
                  : "border-[#b9d9cc] bg-[#f4fbf7] text-ink"
              )}
            >
              {n}
            </button>
          ))}
        </div>
      </div>
      <div className="hidden sm:grid sm:grid-cols-[repeat(11,minmax(0,1fr))] gap-2">
        {Array.from({ length: 11 }, (_, i) => i).map((n) => (
          <button
            key={n}
            type="button"
            aria-label={`Rate ${n} out of 10`}
            aria-pressed={value === n}
            onClick={() => onChange(n)}
            className={clsx(
              "rounded-[18px] border px-0 py-3 text-center text-sm font-semibold transition-all hover:-translate-y-0.5",
              value === n
                ? "border-brand-peach bg-brand-peach text-ink shadow-brand"
                : n <= 6
                ? "border-[#e8c2bd] bg-[#fff4f2] text-ink"
                : n <= 8
                ? "border-[#efe0af] bg-[#fffcee] text-ink"
                : "border-[#b9d9cc] bg-[#f4fbf7] text-ink"
            )}
          >
            {n}
          </button>
        ))}
      </div>
      <div className="flex justify-between text-xs text-muted">
        <span>not likely at all</span>
        <span>very likely</span>
      </div>
    </div>
  )
})

export default NpsScale
