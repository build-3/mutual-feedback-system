"use client"

import { BUILD3_VALUES } from "@/lib/questions"
import { VALUES_WITH_TEXT_KEYS, parseValuesWithText, contributionKeyToLabel } from "@/lib/insights-helpers"

interface FormattedAnswerProps {
  questionKey: string
  value: string
}

/**
 * Renders a feedback answer value, handling the values_with_text format
 * (e.g. "0,1,2|||explanation text") by showing selected values as pills
 * and the explanation below. For all other answer types, renders as plain text.
 */
export default function FormattedAnswer({ questionKey, value }: FormattedAnswerProps) {
  if (!VALUES_WITH_TEXT_KEYS.has(questionKey) || !value.includes("|||")) {
    const displayValue = questionKey === "contribution_level"
      ? contributionKeyToLabel(value)
      : value
    return <span className="whitespace-pre-wrap">{displayValue}</span>
  }

  const { values, text } = parseValuesWithText(value, BUILD3_VALUES)

  return (
    <div className="space-y-2">
      {values.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {values.map((v, i) => {
            // Show only the title (text before the first ". ") in chip form;
            // the full description would overflow.
            const firstPeriod = v.indexOf(". ")
            const label = firstPeriod === -1 ? v.replace(/\.$/, "") : v.slice(0, firstPeriod)
            return (
              <span
                key={i}
                title={v}
                className="inline-block rounded-full border border-brand-peach/40 bg-brand-peach/10 px-2.5 py-0.5 text-xs font-medium text-ink"
              >
                {label}
              </span>
            )
          })}
        </div>
      )}
      {text.trim() && (
        <span className="whitespace-pre-wrap">{text}</span>
      )}
    </div>
  )
}
