"use client"

import { BUILD3_VALUES } from "@/lib/questions"
import { fieldClasses } from "@/components/ui/brand"
import { VALUES_VERSION_PREFIX } from "@/lib/insights-helpers"

interface ValuesMultiSelectProps {
  /** Comma-separated selected value indices stored as answer, plus text after a separator */
  value: string
  onChange: (value: string) => void
  placeholder?: string
}

/** Separator between selected indices and free-text explanation */
const SEP = "|||"

function parseValue(raw: string): { selected: Set<number>; text: string } {
  // Strip the v2 prefix when reading an in-progress draft. Pre-existing rows
  // without the prefix are legacy-indexed and shouldn't be edited via this
  // picker (different value list); they show up as empty selections, which is
  // the safe behaviour — user can re-pick using the new values.
  const payload = raw.startsWith(VALUES_VERSION_PREFIX)
    ? raw.slice(VALUES_VERSION_PREFIX.length)
    : raw

  const parts = payload.split(SEP)
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
  // Tag new submissions with the v2 prefix so the parser resolves indices
  // against BUILD3_VALUES (new list) instead of BUILD3_VALUES_LEGACY.
  return `${VALUES_VERSION_PREFIX}${indices}${SEP}${text}`
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

  const selectedCount = selected.size

  return (
    <div className="space-y-4">
      {/* Value cards — 2-column grid, uniform height, title + description */}
      <div className="grid gap-2.5 sm:grid-cols-2">
        {BUILD3_VALUES.map((val, index) => {
          const active = selected.has(index)
          const firstPeriod = val.indexOf(". ")
          const title = firstPeriod === -1 ? val.replace(/\.$/, "") : val.slice(0, firstPeriod)
          const description = firstPeriod === -1 ? "" : val.slice(firstPeriod + 2).replace(/\.$/, "")
          return (
            <button
              key={index}
              type="button"
              onClick={() => toggleValue(index)}
              className={[
                "rounded-2xl border px-4 py-3 text-left transition-all flex flex-col gap-1",
                active
                  ? "border-brand-peach bg-brand-peach/25 text-ink shadow-brand"
                  : "border-line bg-white text-muted hover:border-black/20 hover:bg-brand-peach/[0.04]",
              ].join(" ")}
            >
              <div className={["text-sm font-semibold", active ? "text-ink" : "text-ink"].join(" ")}>
                {title}
              </div>
              {description && (
                <div className={["text-xs leading-relaxed", active ? "text-ink/75" : "text-muted"].join(" ")}>
                  {description}
                </div>
              )}
            </button>
          )
        })}
      </div>

      {selectedCount > 0 && (
        <div className="text-[11px] font-semibold tracking-[0.08em] text-muted">
          {selectedCount} selected
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
