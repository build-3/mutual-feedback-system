"use client"

import { BUILD3_VALUES } from "@/lib/questions"
import { fieldClasses } from "@/components/ui/brand"

interface ValuesMultiSelectProps {
  /** Comma-separated selected value indices stored as answer, plus text after a separator */
  value: string
  onChange: (value: string) => void
  placeholder?: string
}

/** Separator between selected indices and free-text explanation */
const SEP = "|||"

function parseValue(raw: string): { selected: Set<number>; text: string } {
  const parts = raw.split(SEP)
  const indicesPart = parts[0] || ""
  const text = parts.slice(1).join(SEP)

  const selected = new Set<number>()
  for (const s of indicesPart.split(",")) {
    const n = parseInt(s, 10)
    if (Number.isFinite(n) && n >= 0 && n < BUILD3_VALUES.length) {
      selected.add(n)
    }
  }
  return { selected, text }
}

function serialize(selected: Set<number>, text: string): string {
  const indices = Array.from(selected).sort((a, b) => a - b).join(",")
  if (!indices && !text) return ""
  return `${indices}${SEP}${text}`
}

export default function ValuesMultiSelect({
  value,
  onChange,
  placeholder = "tell us why these stood out...",
}: ValuesMultiSelectProps) {
  const { selected, text } = parseValue(value)

  function toggleValue(index: number) {
    const next = new Set(selected)
    if (next.has(index)) {
      next.delete(index)
    } else {
      next.add(index)
    }
    onChange(serialize(next, text))
  }

  function updateText(newText: string) {
    onChange(serialize(selected, newText))
  }

  const selectedValues = Array.from(selected)
    .sort((a, b) => a - b)
    .map((i) => BUILD3_VALUES[i])

  return (
    <div className="space-y-4">
      {/* Value buttons */}
      <div className="flex flex-wrap gap-2">
        {BUILD3_VALUES.map((val, index) => {
          const active = selected.has(index)
          // Trim to a short label — first sentence or first ~40 chars
          const shortLabel = val.replace(/\.$/, "")
          return (
            <button
              key={index}
              type="button"
              onClick={() => toggleValue(index)}
              className={[
                "rounded-full border px-4 py-2 text-sm font-medium transition-all",
                active
                  ? "border-brand-peach bg-brand-peach text-ink shadow-brand"
                  : "border-line bg-white text-muted hover:border-black/15 hover:text-ink",
              ].join(" ")}
            >
              {shortLabel}
            </button>
          )
        })}
      </div>

      {/* Selected values display */}
      {selectedValues.length > 0 && (
        <div className="rounded-[16px] border border-brand-peach/30 bg-brand-peach/[0.06] px-4 py-3">
          <div className="text-[10px] font-semibold tracking-[0.08em] text-muted mb-2">
            selected
          </div>
          <div className="space-y-1">
            {selectedValues.map((v, i) => (
              <div key={i} className="text-sm leading-relaxed text-ink">
                {v}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Free text explanation */}
      <textarea
        value={text}
        onChange={(e) => updateText(e.target.value)}
        rows={3}
        className={fieldClasses({ size: "lg" })}
        placeholder={placeholder}
      />
    </div>
  )
}
