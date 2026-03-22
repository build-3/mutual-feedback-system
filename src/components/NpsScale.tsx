"use client"

import clsx from "clsx"

type NpsScaleProps = {
  value: number | null
  onChange: (val: number) => void
}

export default function NpsScale({ value, onChange }: NpsScaleProps) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-[repeat(6,minmax(0,1fr))] gap-2 sm:grid-cols-[repeat(11,minmax(0,1fr))]">
        {Array.from({ length: 11 }, (_, i) => i).map((n) => (
          <button
            key={n}
            type="button"
            aria-label={`Rate ${n} out of 10`}
            aria-pressed={value === n}
            onClick={() => onChange(n)}
            className={clsx(
              "rounded-[18px] border px-0 py-3 text-center text-sm font-semibold transition-all sm:text-base",
              value === n
                ? "border-brand-peach bg-brand-peach text-ink shadow-brand"
                : n <= 6
                ? "border-[#e8c2bd] bg-[#fff4f2] text-ink hover:-translate-y-0.5"
                : n <= 8
                ? "border-[#efe0af] bg-[#fffcee] text-ink hover:-translate-y-0.5"
                : "border-[#b9d9cc] bg-[#f4fbf7] text-ink hover:-translate-y-0.5"
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
}
